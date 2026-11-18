// VIDEOTHEK LENZ · Modul `avatar` (1.17.0): Provider der eigenen Figur – Konto-Profil, Gate „Mitgliedsantrag“, Editor.
// Provider 'avatar' (Vertrag .tmp/v117/contracts.md §5 + §9):
//   look() → RenderLook v2 | null · code() → int[26] | null · slots() → (int[26]|null)[3] · active() → 0..2 · setSlot(i)
//   needsGate() → boolean (kein gültiger Slot im Profil, auch kein prov-Slot) · gate() → Promise<void> (Pflicht, Esc schließt nicht)
//   openEditor(where: 'pause'|'chair'|'booth'|'gate', focus?, { live? }) → Promise<boolean> (true = übernommen)
//   onChange(fn(look, code)) → off (nur bei Übernahme/Platzwechsel/Gate/Konto-Look) · onPreview(fn(look|null)) → off (Live-Vorschau)
//   hash() · changedFor(npc) · markSeen(npc) · lastChange() → ms | 0 · portrait(code) → Promise<Canvas|null>
//   setCode(code, { commit = true }) · randomize({ commit = true }) · setColor(part, paletteIndex)
// Daten: ctx.deps.profile (Hülle, features/store/profile.js). Ohne Profil (kein Konto) bleibt code() === null, needsGate() false.
// Bühne: Editor/Gate zeigen das Foto-Studio (char/studio.js) über ctx.stage.setScene; die Kamera-Rig-Gruppe wird dafür in die
// Studio-Szene umgehängt und danach in die Laden-Szene zurück (Muster: cinema/cinema.js). `live: true` = kein Studio (Salon-Spiegel).
import { createStudio } from '../char/studio.js';
import { createEditorModel, focusOfTab, COLOR_PART_FIELD } from '../char/editor-model.js';
import { LEN, decode, defaultCode, equal, toRender, outfitHash, randomLook } from '../char/look2.js';
import { unlockedCodes } from '../char/unlocks.js';
import { npcShould } from '../char/react-logic.js';
import { createCharEditor } from '../ui/chareditor.js';

const NPCS = ['richard', 'gabi', 'ronny'];
const WHERES = ['pause', 'chair', 'booth', 'gate'];
const PREVIEW_MS = 33; // ≤ 30 Hz auf setLook
const STAMP_MS = 380;
const STAMP_MS_REDUCED = 150;
const FLASH_MS = 140;
const FLASH_MS_REDUCED = 320;
const TAN_STUDIO_HALF = Math.tan((15 * Math.PI) / 180); // Studio-Kamera: 30° Öffnung

const warn = (what, err) => console.warn(`[LenzFlix Store3D] avatar ${what}`, err);
const validSlot = (c) => Array.isArray(c) && c.length === LEN && c[0] === 2;
const isIdx = (i) => Number.isInteger(i) && i >= 0 && i <= 2;
const reduced = () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; } };

export default {
  name: 'avatar',
  init(ctx) {
    let disposed = false;
    let studio = null;
    let session = null;
    let gateP = null;
    let lastChangeAt = 0;
    let rigNode = null;
    let onStage = false;
    const changeFns = new Set();
    const previewFns = new Set();
    const xrWaiters = new Set();
    const timers = new Set();

    const prof = () => (ctx.deps && ctx.deps.profile) || null;
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    const wait = (ms) => new Promise((res) => later(res, ms));
    const play = (name) => { try { const s = ctx.use('sound'); if (s) s.play(name); } catch { /* Ton ist optional */ } };

    // --- Profil lesen/schreiben ---
    const fig = () => { const p = prof(); const d = p && p.get(); return d && d.fig && typeof d.fig === 'object' ? d.fig : null; };
    const slotAt = (i) => { const f = fig(); const s = f && Array.isArray(f.slots) ? f.slots[i] : null; return s && typeof s === 'object' && validSlot(s.l) ? s : null; };
    const slotCodes = () => [0, 1, 2].map((i) => { const s = slotAt(i); return s ? decode(s.l) : null; });
    const activeIdx = () => {
      const f = fig();
      const a = f && Number.isInteger(f.act) ? f.act : 0;
      if (isIdx(a) && slotAt(a)) return a;
      for (let i = 0; i < 3; i++) if (slotAt(i)) return i;
      return -1;
    };
    const code = () => { const i = activeIdx(); const s = i >= 0 ? slotAt(i) : null; return s ? decode(s.l) : null; };
    const isProv = () => { const i = activeIdx(); const s = i >= 0 ? slotAt(i) : null; return !!(s && s.prov); };
    const keyOf = () => { const c = code(); return c ? c.join(',') : ''; };
    const needsGate = () => !!prof() && activeIdx() < 0;
    const foundIds = () => { try { const d = ctx.use('discover'); return d ? d.list().filter((e) => e.found).map((e) => e.id) : []; } catch { return []; } };

    let snap = keyOf();
    let snapProv = isProv();

    /** Schreibt Plätze (null = unverändert lassen) und den aktiven Platz; Konto noch nicht erreicht → prov. */
    function writeSlots(slots, active) {
      const p = prof();
      if (!p) return;
      const prov = p.state() !== 'ok';
      const t = Date.now();
      p.update((d) => {
        if (!d.fig || typeof d.fig !== 'object') d.fig = { act: 0, slots: [null, null, null] };
        if (!Array.isArray(d.fig.slots)) d.fig.slots = [null, null, null];
        for (let i = 0; i < 3; i++) {
          const nl = slots[i];
          if (!validSlot(nl)) continue;
          const old = d.fig.slots[i];
          if (old && validSlot(old.l) && equal(decode(old.l), nl)) continue;
          d.fig.slots[i] = prov ? { l: nl.slice(), t, prov: true } : { l: nl.slice(), t };
        }
        d.fig.act = active;
      });
    }

    function emitChange() {
      const c = code();
      if (!c) return;
      const look = toRender(c);
      for (const fn of [...changeFns]) { try { fn(look, c.slice()); } catch (err) { warn('onChange', err); } }
    }
    function emitPreview(look) {
      for (const fn of [...previewFns]) { try { fn(look); } catch (err) { warn('onPreview', err); } }
    }

    /** Übernahme: schreiben, Merker aktualisieren, onChange nur wenn sich Code oder aktiver Platz geändert hat. */
    function commit(slots, active) {
      const beforeKey = keyOf();
      const beforeAct = activeIdx();
      writeSlots(slots, active);
      snap = keyOf();
      snapProv = isProv();
      if (snap !== beforeKey || activeIdx() !== beforeAct) {
        lastChangeAt = Date.now();
        emitChange();
        return true;
      }
      return false;
    }

    function commitCode(c) {
      const idx = activeIdx() >= 0 ? activeIdx() : 0;
      const slots = [null, null, null];
      slots[idx] = decode(c);
      return commit(slots, idx);
    }

    // --- Bühne (Studio) ---
    const getStudio = () => studio || (studio = createStudio());

    function poseCamera(focus, ms) {
      if (!studio) return;
      const pose = studio.cameraPose(focus);
      const cam = ctx.camera;
      const fov = ((cam && cam.fov) || 60) * (Math.PI / 180);
      const tanH = Math.tan(fov / 2);
      const k = Math.max(0.25, TAN_STUDIO_HALF / tanH); // Studio-Posen sind für 30° gedacht: bei weiterem Winkel näher heran
      const [lx, ly, lz] = pose.look;
      const px = lx + (pose.pos[0] - lx) * k;
      const py = ly + (pose.pos[1] - ly) * k;
      const pz = lz + (pose.pos[2] - lz) * k;
      const d = Math.hypot(px - lx, py - ly, pz - lz);
      const aspect = (cam && cam.aspect) || 1.6;
      let sx = 0;
      let sy = 0;
      if (aspect < 1.1) sy = -0.5 * d * tanH; // Hochformat: Figur ins obere Drittel, Formular darunter
      else sx = 0.5 * d * tanH * aspect; // Querformat: Figur rechts, Formular links
      try { ctx.player.camera.flyTo({ x: px + sx, y: py + sy, z: pz }, { x: lx + sx, y: ly + sy, z: lz }, ms); } catch (err) { warn('flyTo', err); }
    }

    const onResize = () => { if (onStage && session && session.focus) poseCamera(session.focus, 1); };

    function stageOn(c, focus) {
      const st = getStudio();
      st.figure(toRender(c));
      st.setYaw(0);
      rigNode = ctx.camera && ctx.camera.parent ? ctx.camera.parent : null;
      onStage = true;
      if (rigNode && st.scene) st.scene.add(rigNode);
      ctx.stage.setScene(st.scene);
      window.addEventListener('resize', onResize);
      poseCamera(focus, 1);
    }

    function stageOff() {
      if (!onStage) return;
      onStage = false;
      window.removeEventListener('resize', onResize);
      try { ctx.player.camera.release(); } catch { /* egal */ }
      try {
        if (rigNode && ctx.scene) ctx.scene.add(rigNode);
        ctx.stage.setScene(null);
      } catch (err) { warn('stage', err); }
      rigNode = null;
    }

    // --- Sitzung (Editor oder Gate) ---
    function applyLook(s, c) {
      const look = toRender(c);
      if (s.cfg.live) emitPreview(look);
      else if (studio) studio.setLook(look);
    }

    function pushLook(s, c) {
      s.pending = c;
      if (s.timer || s.finished) return;
      const run = () => {
        s.timer = null;
        const p = s.pending;
        s.pending = null;
        if (!p || s.finished) return;
        s.last = Date.now();
        applyLook(s, p);
      };
      const w = Math.max(0, PREVIEW_MS - (Date.now() - s.last));
      if (w <= 0) run();
      else { s.timer = setTimeout(run, w); }
    }

    function endSession(s, applied) {
      if (s.ended) return;
      s.ended = true;
      s.finished = true;
      if (s.timer) { clearTimeout(s.timer); s.timer = null; }
      if (s.cfg.live) emitPreview(null);
      const wasMine = s.ui.el.isConnected;
      s.ui.destroy();
      if (wasMine) { try { ctx.overlay.close(); } catch { /* egal */ } }
      if (s.cfg.live === false) stageOff();
      if (session === s) session = null;
      s.done(applied);
    }

    function startSession(cfg) {
      const found = foundIds();
      const gateMode = cfg.where === 'gate';
      const startCode = gateMode ? randomLook(Math.random, unlockedCodes(found)) : code() || defaultCode();
      const model = createEditorModel({ code: startCode, slots: gateMode ? [null, null, null] : slotCodes(), active: gateMode ? 0 : Math.max(0, activeIdx()), found });
      let done;
      const promise = new Promise((res) => { done = res; });
      const s = { cfg: { ...cfg, live: !!cfg.live }, model, promise, done, finished: false, ended: false, busy: false, pending: null, timer: null, last: -Infinity, ui: null, focus: cfg.focus || 'body' };
      const gateFlow = () => gateDone(s);
      s.ui = createCharEditor({
        model,
        where: cfg.where,
        live: s.cfg.live,
        focus: cfg.focus,
        name: (ctx.deps && ctx.deps.user && ctx.deps.user.name) || '',
        onChange: (c) => pushLook(s, c),
        onTab: (id) => { s.focus = focusOfTab(id); if (!s.cfg.live) poseCamera(s.focus, 450); },
        onRotate: (d) => { if (studio) studio.rotate(d); },
        onApply: () => {
          if (s.finished) return;
          s.finished = true;
          const r = model.result();
          if (s.cfg.live) emitPreview(null);
          commit(r.slots, r.active);
          endSession(s, true);
        },
        onCancel: () => { if (!s.finished) endSession(s, false); },
        onDone: gateFlow,
      });
      if (!s.cfg.live) {
        s.focus = focusOfTab(s.ui.tab());
        try { stageOn(startCode, s.focus); } catch (err) { warn('Studio', err); stageOff(); } // ohne Studio läuft das Formular trotzdem
      }
      session = s;
      const open = () => ctx.overlay.open(s.ui.el, { onClose: () => onOverlayClosed(s, open) });
      s.open = open;
      open();
      return s;
    }

    /** Overlay wurde geschlossen (Esc, Moduswechsel, anderes Overlay): Editor = Abbrechen, Gate = wieder öffnen. */
    function onOverlayClosed(s, open) {
      if (s.finished || disposed) return;
      if (s.cfg.where === 'gate') {
        queueMicrotask(() => { if (!s.finished && !disposed && session === s && !s.ui.el.isConnected) open(); });
        return;
      }
      s.finished = true;
      endSession(s, false);
    }

    function flash(host) {
      return new Promise((res) => {
        const soft = reduced();
        const d = document.createElement('div');
        d.className = `lfx-store-char-flash${soft ? ' is-soft' : ''}`;
        d.setAttribute('aria-hidden', 'true');
        host.appendChild(d);
        play('flash');
        later(() => { d.remove(); res(); }, soft ? FLASH_MS_REDUCED : FLASH_MS);
      });
    }

    async function gateDone(s) {
      if (s.busy || s.finished) return;
      s.busy = true;
      s.ui.busy(true);
      if (s.ui.stampEl) s.ui.stampEl.classList.add('is-stamped');
      play('stamp');
      await wait(reduced() ? STAMP_MS_REDUCED : STAMP_MS);
      if (s.finished || disposed) return;
      await flash(s.ui.el);
      if (s.finished || disposed) return;
      const r = s.model.result();
      s.finished = true; // ab jetzt kein Wiederöffnen mehr (der Ausweis ersetzt das Overlay)
      commit([r.code, null, null], 0);
      const m = ctx.use('member');
      if (m) {
        try {
          if (typeof m.ensure === 'function') await m.ensure();
          const data = m.cardData();
          if (data) await m.showCard(data, { mode: 'gate' });
        } catch (err) { warn('Ausweis', err); }
      }
      endSession(s, true);
    }

    function untilNoXr() {
      return new Promise((res) => {
        if (!ctx.xr.presenting()) { res(); return; }
        let off = () => {};
        const fin = () => { off(); xrWaiters.delete(fin); res(); };
        off = ctx.on('xr', (on) => { if (!on) fin(); });
        xrWaiters.add(fin);
      });
    }

    function gate() {
      if (gateP) return gateP;
      gateP = (async () => {
        while (!disposed && needsGate()) {
          await untilNoXr();
          if (disposed || !needsGate()) break;
          const s = startSession({ where: 'gate', focus: 'body', live: false });
          await s.promise;
        }
      })().finally(() => { gateP = null; });
      return gateP;
    }

    function openEditor(where = 'pause', focus, opts) {
      if (disposed) return Promise.resolve(false);
      const w = WHERES.includes(where) ? where : 'pause';
      if (w === 'gate') return gate().then(() => !needsGate());
      if (ctx.xr.presenting()) {
        try { const x = ctx.use('xrchar'); if (x) x.open(); } catch (err) { warn('xrchar', err); }
        return Promise.resolve(false);
      }
      if (session) return session.promise;
      if (code() === null) return Promise.resolve(false);
      return startSession({ where: w, focus, live: !!(opts && opts.live) }).promise;
    }

    // --- Konto-Daten kommen später ---
    function onRemote() {
      if (disposed) return;
      const had = snap;
      const hadProv = snapProv || had === '';
      snap = keyOf();
      snapProv = isProv();
      if (!snap) return;
      if (snap !== had) {
        lastChangeAt = Date.now();
        if (hadProv && !snapProv) { try { ctx.xr.toast('Deine Figur vom Konto ist geladen.', 3500); } catch { /* egal */ } }
        if (session && session.cfg.where === 'gate' && !session.finished) endSession(session, false); // Gate erübrigt sich
        emitChange();
      } else if (session && session.cfg.where === 'gate' && !session.finished) {
        endSession(session, false);
      }
    }

    const p0 = prof();
    const offRemote = p0 && typeof p0.onRemote === 'function' ? p0.onRemote(onRemote) : () => {};
    const offXr = ctx.on('xr', (on) => { if (on && session && !session.finished) endSession(session, false); }); // in VR gibt es kein DOM-Formular

    const provider = {
      look: () => { const c = code(); return c ? toRender(c) : null; },
      code: () => { const c = code(); return c ? c.slice() : null; },
      slots: () => slotCodes(),
      active: () => Math.max(0, activeIdx()),
      setSlot(i) {
        if (disposed || !isIdx(i) || !slotAt(i) || i === activeIdx()) return;
        commit([null, null, null], i);
      },
      needsGate,
      gate,
      openEditor,
      onChange(fn) { if (typeof fn !== 'function') return () => {}; changeFns.add(fn); return () => changeFns.delete(fn); },
      onPreview(fn) { if (typeof fn !== 'function') return () => {}; previewFns.add(fn); return () => previewFns.delete(fn); },
      hash: () => { const c = code(); return c ? outfitHash(c) : ''; },
      changedFor(npc) {
        if (!NPCS.includes(npc)) return false;
        const c = code();
        if (!c) return false;
        const p = prof();
        const d = p && p.get();
        const seen = d && d.seen && typeof d.seen === 'object' ? d.seen : {};
        return npcShould(seen[npc], outfitHash(c));
      },
      markSeen(npc) {
        const p = prof();
        const c = code();
        if (!p || !c || !NPCS.includes(npc)) return;
        const h = outfitHash(c);
        p.update((d) => {
          if (!d.seen || typeof d.seen !== 'object') d.seen = { t: 0 };
          d.seen[npc] = h;
          d.seen.t = Date.now();
        });
      },
      lastChange: () => lastChangeAt,
      portrait(c) {
        if (disposed || !ctx.renderer) return Promise.resolve(null);
        try { return Promise.resolve(getStudio().portrait(ctx.renderer, toRender(decode(c))) || null); } catch (err) { warn('portrait', err); return Promise.resolve(null); }
      },
      setCode(c, o) {
        if (disposed || !prof()) return;
        const d = decode(c);
        if (o && o.commit === false) { emitPreview(toRender(d)); return; }
        commitCode(d);
      },
      randomize(o) {
        const c = randomLook(Math.random, unlockedCodes(foundIds()));
        provider.setCode(c, o);
      },
      /** VR light: ein Farbfeld auf einen Palettenindex (0..15) setzen und übernehmen. */
      setColor(part, idx) {
        const field = COLOR_PART_FIELD[part];
        const cur = code();
        if (field === undefined || !cur || !Number.isInteger(idx) || idx < 0 || idx > 15) return;
        const next = cur.slice();
        next[field] = idx;
        commitCode(next);
      },
    };
    const off = ctx.provide('avatar', provider);

    return {
      update(dt) { if (onStage && studio) studio.update(dt); },
      dispose() {
        disposed = true;
        if (session) endSession(session, false);
        for (const fin of [...xrWaiters]) fin();
        for (const t of timers) clearTimeout(t);
        timers.clear();
        offRemote();
        offXr();
        stageOff();
        if (studio) { try { studio.dispose(); } catch { /* egal */ } studio = null; }
        changeFns.clear();
        previewFns.clear();
        off();
      },
    };
  },
};

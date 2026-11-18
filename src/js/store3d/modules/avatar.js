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
const HAIR_FIELDS = [5, 6, 9]; // Frisur, Haarfarbe, Bart
/** Outfit-Hash ohne die Haarfelder (unterscheidet „nur Haare geändert“ von „Outfit geändert“). */
const restHash = (c) => { const k = c.slice(); for (const i of HAIR_FIELDS) k[i] = 0; return outfitHash(k); };
const WHERES = ['pause', 'chair', 'booth', 'gate'];
const PREVIEW_MS = 33; // ≤ 30 Hz auf setLook
const STAMP_MS = 380;
const STAMP_MS_REDUCED = 150;
const FLASH_MS = 140;
const FLASH_MS_REDUCED = 320;
const STUDIO_FOV = 40; // vertikale Öffnung der Hauptkamera, solange das Studio läuft (weniger Verzerrung als die 70° des Laufens)

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
    let setFov = 0; // zuletzt von uns gesetzter Winkel
    let savedFov = null; // Öffnungswinkel der Hauptkamera vor dem Studio (null = nicht von uns gesetzt)
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
          // prov nur für einen bisher leeren (oder selbst vorläufigen) Platz; eine Änderung am bestehenden Platz gewinnt per Zeitstempel
          const wasProv = !old || !validSlot(old.l) || old.prov === true;
          d.fig.slots[i] = prov && wasProv ? { l: nl.slice(), t, prov: true } : { l: nl.slice(), t };
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

    /** Freie Bildfläche (normiert 0..1, y von oben) = die Vorschaufläche des Editors, relativ zur Bühne; null ohne Layout (z. B. jsdom, Live-Sheet). */
    function freeArea() {
      const s = session;
      const ui = s && s.ui;
      const host = ui && ui.el && ui.el.parentElement;
      if (!ui || !ui.preview || !host) return null;
      const hr = host.getBoundingClientRect();
      const n = (v) => Math.max(0, Math.min(1, v));
      if (s.cfg.live) {
        // Live-Blatt (Salon): die Vorschaufläche ist ausgeblendet, frei ist die Fläche neben (Querformat) bzw. über (Hochformat) dem Blatt
        const panel = ui.el.querySelector ? ui.el.querySelector('.lfx-store-char__panel') : null;
        const br = panel ? panel.getBoundingClientRect() : null;
        if (!br || hr.width < 2 || hr.height < 2 || br.width < 2 || br.height < 2) return null;
        const f = hr.width / hr.height >= 1.1
          ? { x0: n((br.right - hr.left) / hr.width), x1: 1, y0: 0, y1: 1 }
          : { x0: 0, x1: 1, y0: 0, y1: n((br.top - hr.top) / hr.height) };
        return f.x1 - f.x0 > 0.05 && f.y1 - f.y0 > 0.05 ? f : null;
      }
      const pr = ui.preview.getBoundingClientRect();
      if (hr.width < 2 || hr.height < 2 || pr.width < 2 || pr.height < 2) return null;
      const free = { x0: n((pr.left - hr.left) / hr.width), x1: n((pr.right - hr.left) / hr.width), y0: n((pr.top - hr.top) / hr.height), y1: n((pr.bottom - hr.top) / hr.height) };
      return free.x1 - free.x0 > 0.05 && free.y1 - free.y0 > 0.05 ? free : null;
    }

    /** Hauptkamera auf STUDIO_FOV stellen (merkt den natürlichen Winkel; ein Resize des Renderers setzt ihn zurück, dann neu merken). */
    function studioFov() {
      const cam = ctx.camera;
      if (!cam || !(onStage || (session && session.cfg.live && !session.ended))) return;
      // Salon (live) im Hochformat: horizontal ~40° statt vertikal 40° (sonst füllt die Figur im schmalen Bild die ganze Breite)
      const want = !onStage && cam.aspect > 0 && cam.aspect < 1 ? Math.min(75, ((2 * Math.atan(Math.tan((STUDIO_FOV * Math.PI) / 360) / cam.aspect)) * 180) / Math.PI) : STUDIO_FOV;
      if (cam.fov === want) return;
      if (cam.fov !== setFov) savedFov = cam.fov; // der Renderer hat den Winkel neu gesetzt (Resize): neuen natürlichen Wert merken
      setFov = want;
      cam.fov = want;
      if (typeof cam.updateProjectionMatrix === 'function') cam.updateProjectionMatrix();
    }
    function restoreFov() {
      const cam = ctx.camera;
      if (cam && savedFov !== null && cam.fov === setFov) {
        cam.fov = savedFov;
        if (typeof cam.updateProjectionMatrix === 'function') cam.updateProjectionMatrix();
      }
      savedFov = null;
      setFov = 0;
    }

    /** Das Studio liefert die fertige Pose für Seitenverhältnis, Öffnungswinkel und freie Fläche (char/studio.js cameraPose). */
    function poseCamera(focus, ms) {
      if (!studio) return;
      const cam = ctx.camera;
      studioFov();
      const o = { aspect: (cam && cam.aspect) || 1.6, fov: STUDIO_FOV };
      const free = freeArea();
      if (free) o.free = free;
      const pose = studio.cameraPose(focus, o);
      const [lx, ly, lz] = pose.look;
      try { ctx.player.camera.flyTo({ x: pose.pos[0], y: pose.pos[1], z: pose.pos[2] }, { x: lx, y: ly, z: lz }, ms); } catch (err) { warn('flyTo', err); }
    }

    const onResize = () => { if (onStage && session && session.focus) poseCamera(session.focus, 1); };

    function stageOn(c) {
      const st = getStudio();
      st.figure(toRender(c));
      st.setYaw(0);
      rigNode = ctx.camera && ctx.camera.parent ? ctx.camera.parent : null;
      onStage = true;
      if (rigNode && st.scene) st.scene.add(rigNode);
      ctx.stage.setScene(st.scene);
      window.addEventListener('resize', onResize); // die erste Pose setzt startSession, sobald das Formular steht (freie Fläche messbar)
    }

    function stageOff() {
      if (!onStage) return;
      onStage = false;
      restoreFov();
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
      else if (studio) {
        const t = studio.topY();
        studio.setLook(look);
        // hoher Hut/Frisur: Kamera neu ausrichten, sonst oben abgeschnitten
        if (onStage && s.focus && Math.abs(studio.topY() - t) > 0.005) poseCamera(s.focus, 250);
      }
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
      if (s.cfg.live) { emitPreview(null); restoreFov(); }
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
      const startSlots = gateMode ? [null, null, null] : slotCodes();
      const startAct = gateMode ? 0 : Math.max(0, activeIdx());
      const model = createEditorModel({ code: startCode, slots: startSlots, active: startAct, found });
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
          // nur im Editor geänderte Plätze schreiben (ein zwischenzeitlich vom Konto geänderter Platz bleibt), Platzwechsel nur bei Wahl des Nutzers
          const slots = r.slots.map((c, i) => (c && startSlots[i] && equal(startSlots[i], c) ? null : c));
          commit(slots, r.active === startAct ? Math.max(0, activeIdx()) : r.active);
          endSession(s, true);
        },
        onCancel: () => { if (!s.finished) endSession(s, false); },
        onDone: gateFlow,
      });
      if (!s.cfg.live) {
        s.focus = focusOfTab(s.ui.tab());
        try { stageOn(startCode); } catch (err) { warn('Studio', err); stageOff(); } // ohne Studio läuft das Formular trotzdem
      }
      session = s;
      if (s.cfg.live) studioFov(); // Salon: gleiche 40° wie im Studio (der Spiegel zeigt die Figur ohne Weitwinkel-Verzerrung)
      // Gate: Esc-fest (modal); der Editor schließt per Esc wie bisher
      ctx.overlay.open(s.ui.el, { modal: gateMode, onClose: () => onOverlayClosed(s) });
      if (onStage && !s.cfg.live) poseCamera(s.focus, 1);
      return s;
    }

    /**
     * Wächter fürs Pflicht-Gate (Befund Sichtprüfung 1.17.0, 844×390 einmal ohne sichtbares Formular, nicht reproduzierbar):
     * Steht die Sitzung noch, ist aber nicht mehr eingehängt bzw. das Overlay nicht mehr offen (fremdes Overlay, Moduswechsel ohne
     * onClose, abgelöstes Element), hängt er das Formular erneut in die Bühne. Läuft pro Bild, kostet nur zwei Abfragen.
     */
    function guardGate() {
      const s = session;
      if (!s || s.finished || s.ended || disposed || s.cfg.where !== 'gate' || !s.ui) return;
      let open;
      try { open = typeof ctx.overlay.isOpen === 'function' ? ctx.overlay.isOpen() : true; } catch { open = true; }
      if (s.ui.el.isConnected && open) return;
      try { ctx.overlay.open(s.ui.el, { modal: true, onClose: () => onOverlayClosed(s) }); } catch (err) { warn('Gate erneut öffnen', err); return; }
      if (onStage) poseCamera(s.focus, 1);
    }

    /** Overlay wurde geschlossen (Esc, Moduswechsel, anderes Overlay): Editor = Abbrechen; beim Gate beendet es die Sitzung, die Gate-Schleife öffnet eine neue. */
    function onOverlayClosed(s) {
      if (s.finished || disposed) return;
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
      /** Freie Bildfläche der laufenden Sitzung (normiert 0..1, y von oben) neben/über dem Formular oder null (kein Layout, keine Sitzung). */
      freeArea: () => freeArea(),
      needsGate,
      gate,
      openEditor,
      onChange(fn) { if (typeof fn !== 'function') return () => {}; changeFns.add(fn); return () => changeFns.delete(fn); },
      onPreview(fn) { if (typeof fn !== 'function') return () => {}; previewFns.add(fn); return () => previewFns.delete(fn); },
      hash: () => { const c = code(); return c ? outfitHash(c) : ''; },
      /** Art der Änderung seit dem letzten Gesehenen: 'hair' (nur Frisur/Haarfarbe/Bart), 'outfit' (anderes) oder null (keine Änderung / Vorgeschichte unbekannt). */
      changeKind(npc) {
        if (!NPCS.includes(npc) || !provider.changedFor(npc)) return null;
        const c = code();
        const p = prof();
        const d = p && p.get();
        const seen = d && d.seen && typeof d.seen === 'object' ? d.seen : {};
        const rest = seen[`${npc}R`];
        if (!c || typeof rest !== 'string') return null;
        return rest === restHash(c) ? 'hair' : 'outfit';
      },
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
        const r = restHash(c);
        p.update((d) => {
          if (!d.seen || typeof d.seen !== 'object') d.seen = { t: 0 };
          d.seen[npc] = h;
          d.seen[`${npc}R`] = r;
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
      update(dt) { if (onStage && studio) studio.update(dt); studioFov(); guardGate(); },
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

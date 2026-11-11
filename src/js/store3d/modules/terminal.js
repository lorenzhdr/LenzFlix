// VIDEOTHEK LENZ · M3: Kassen-PC. Interactable am PC, Provider 'terminal' { open(q) }, Overlay im Stil einer blau-weißen
// 90er-Datenbank-Textoberfläche (Live-Suche, Standortauskunft, Hinführen mit Leuchtspur, „Über den Tresen“),
// Bildschirm in 3D zeigt im Leerlauf einen Login-Screen (CanvasTexture, selten aktualisiert).
import { rankResults } from './search-rank.js';
import { Mesh, MeshBasicMaterial, CanvasTexture, SRGBColorSpace } from 'three';
import { quad } from '../util/geo.js';
import { makeCanvas } from '../world/textures.js';
import { h, button, MONO } from './m3-gfx.js';
import { createTrail } from './m3-trail.js';
import { debugHook } from './m3-debug.js';
import { describeResult, defaultSections, locationLabel, formatClock } from './m3-util.js';

const EYE = 1.65;
const SEARCH_DELAY = 250;
const MAX_RESULTS = 30;
const SCR_W = 320;
const SCR_H = 240;

function drawScreen(g, w, hh, t, name, blink) {
  const F = (px, b) => `${b ? 'bold ' : ''}${px}px ${MONO}`;
  g.fillStyle = '#14208f';
  g.fillRect(0, 0, w, hh);
  g.strokeStyle = '#d9e2ff';
  g.lineWidth = 2;
  g.strokeRect(6, 6, w - 12, hh - 12);
  g.strokeRect(10, 10, w - 20, hh - 20);
  g.fillStyle = '#d9e2ff';
  g.fillRect(12, 12, w - 24, 22);
  g.fillStyle = '#14208f';
  g.font = F(14, true);
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillText('VIDEOTHEK LENZ · Verleihsystem 2.3', 18, 23);
  g.fillStyle = '#d9e2ff';
  g.font = F(15, true);
  g.fillText(`Willkommen, ${String(name || 'Gast').slice(0, 18)}`, 22, 62);
  g.font = F(13, false);
  g.fillStyle = '#aebcff';
  g.fillText('Titelsuche · Standortauskunft', 22, 84);
  g.fillText('Hinführen · Über den Tresen', 22, 102);
  g.fillStyle = '#d9e2ff';
  g.font = F(15, true);
  g.fillText('Suchbegriff:', 22, 142);
  g.fillText(`> ${blink ? '_' : ' '}`, 22, 166);
  g.fillStyle = '#d9e2ff';
  g.fillRect(12, hh - 38, w - 24, 22);
  g.fillStyle = '#14208f';
  g.font = F(12, true);
  g.textAlign = 'center';
  g.fillText('E = Benutzen · Esc = Ende', w / 2, hh - 27);
  g.fillStyle = 'rgba(0,0,0,0.16)';
  for (let y = 0; y < hh; y += 3) g.fillRect(0, y, w, 1);
  void t;
}

const ACT_LABEL = { guide: 'Hinführen', counter: 'Über den Tresen', play: 'Abspielen', series: 'Serie über den Tresen' };
const MEDIA_TAG = { vhs: 'VHS', dvd: 'DVD', box: 'Box' };

/** Statuszeile der VR-Suche: „Suche läuft …“ / „3 Treffer“ / „Nichts gefunden“. */
export function termStatus(searching, count) {
  if (searching) return 'Suche läuft …';
  if (!count) return 'Nichts gefunden';
  return count === 1 ? '1 Treffer' : `${count} Treffer`;
}

/**
 * Panel-Spec der VR-Suche (rein). descs = describeResult-Ergebnisse; handlers.act(desc, kind) führt eine Aktion aus.
 * mediaOf(desc) → 'vhs'|'dvd'|'box'|'' (Hüllenformat des Titels, falls im Sortiment).
 */
export function buildTermSpec({ query = '', status = '', descs = [], mediaOf = () => '', handlers = {}, onClose } = {}) {
  const rows = descs.map((d) => ({
    label: d.title,
    sub: [d.sub, d.year, d.location, d.typeLabel].filter(Boolean).join(' · '),
    tag: MEDIA_TAG[mediaOf(d)] || '',
    actions: d.actions.map((k, i) => ({ label: ACT_LABEL[k], primary: i === 0, onSelect: () => handlers.act && handlers.act(d, k) })),
  }));
  return {
    title: 'Kassen-PC · Suche',
    lines: status ? [status] : [],
    input: { value: query, placeholder: 'Titel suchen …', onInput: (v) => handlers.onInput && handlers.onInput(v), onEnter: (v) => handlers.onEnter && handlers.onEnter(v) },
    list: { rows, visible: 6 },
    onClose,
  };
}

export default {
  name: 'terminal',
  init(ctx) {
    const L = ctx.layout;
    const cn = L.counter;
    const pcx = L.pc ? L.pc.x : L.w - 3.5; // Position kommt aus dem Layout (build-props.js liest dieselbe)
    const pcz = L.pc ? L.pc.z : (cn.z0 + cn.z1) / 2;
    const catalogItems = ctx.catalog.items instanceof Map ? ctx.catalog.items : new Map(Object.entries((ctx.catalog && ctx.catalog.items) || {}));
    const userName = (ctx.deps.user && ctx.deps.user.name) || '';
    let disposed = false;
    let st = null;
    let snap = null;
    const trail = createTrail(ctx);

    // --- 3D-Bildschirm ---
    const canvas = makeCanvas(SCR_W, SCR_H);
    const g = canvas.getContext('2d');
    const tex = ctx.track(new CanvasTexture(canvas));
    tex.colorSpace = SRGBColorSpace;
    const mat = ctx.track(new MeshBasicMaterial({ map: tex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const screen = new Mesh(ctx.track(quad({ w: 0.32, h: 0.25, x: pcx, y: 1.37, z: pcz - 0.2075, ry: Math.PI })), mat);
    ctx.scene.add(screen);
    ctx.track(screen);
    let lastDraw = -10;
    let lastBlink = null;
    const redraw = (t) => {
      const blink = Math.floor(t * 1.2) % 2 === 0;
      if (blink === lastBlink && t - lastDraw < 5) return;
      lastBlink = blink;
      lastDraw = t;
      drawScreen(g, SCR_W, SCR_H, t, userName, blink);
      tex.needsUpdate = true;
    };
    redraw(0);
    try { if (document.fonts && document.fonts.load) document.fonts.load('14px "LenzStore Mono"').then(() => { lastBlink = null; }).catch(() => {}); } catch { /* egal */ }

    // --- Daten ---
    const getItem = (id) => catalogItems.get(id);
    const env = () => {
      const cache = new Map();
      return {
        has: (id) => catalogItems.has(id),
        locate: (id) => {
          if (cache.has(id)) return cache.get(id);
          const slot = ctx.items.slotOf(id);
          const v = slot ? locationLabel(slot, ctx.layout, ctx.catalog.departments) : null;
          cache.set(id, v);
          return v;
        },
      };
    };

    // --- Kamera ---
    function eyeTarget(p) {
      const cp = Math.cos(p.pitch || 0);
      return { x: p.x - Math.sin(p.yaw) * cp, y: EYE + Math.sin(p.pitch || 0), z: p.z - Math.cos(p.yaw) * cp };
    }
    function restoreCam() {
      if (snap) ctx.player.teleport(snap.x, snap.z, snap.yaw, snap.pitch);
      ctx.player.camera.release();
    }
    function returnCam() {
      if (!snap) { ctx.player.camera.release(); return Promise.resolve(); }
      const s = snap;
      return ctx.player.camera.flyTo({ x: s.x, y: EYE, z: s.z }, eyeTarget(s), 520).then(() => { if (!disposed) restoreCam(); });
    }

    // --- Overlay ---
    // --- VR: Panel statt DOM-Overlay ---
    let xs = null;
    const xrOn = () => !!(ctx.xr && ctx.xr.presenting());
    const mediaOf = (d) => { const it = d.inCatalog ? getItem(d.targetId) : null; return it ? ((it.lfx && it.lfx.media) || 'dvd') : ''; };

    function xrRefresh(s) {
      if (xs !== s || !s.handle || !s.handle.open) return;
      s.handle.update(buildTermSpec({ query: s.query, status: s.status, descs: s.descs, mediaOf, handlers: s.handlers }));
    }

    async function xrRun(s, q) {
      if (s.ac) s.ac.abort();
      s.ac = new AbortController();
      const mine = ++s.token;
      s.status = termStatus(true, 0);
      xrRefresh(s);
      const e = env();
      try {
        const res = await ctx.deps.search(q, { signal: s.ac.signal });
        if (mine !== s.token || disposed || xs !== s) return;
        const ranked = rankResults(res, q).slice(0, MAX_RESULTS);
        s.descs = ranked.map((it) => describeResult(it, e));
        s.status = termStatus(false, s.descs.length);
      } catch (err) {
        if (mine !== s.token || (err && err.name === 'AbortError')) return;
        s.status = 'Verbindung zur Datenbank gestört';
      }
      xrRefresh(s);
    }

    function xrSchedule(s, q, immediate) {
      clearTimeout(s.timer);
      const t = q.trim();
      if (!t) {
        if (s.ac) s.ac.abort();
        s.token++;
        const e = env();
        s.descs = defaultSections(ctx.catalog, getItem, 6).flatMap((sec) => sec.items).map((it) => describeResult(it, e));
        s.status = 'Titel eingeben oder aus der Liste wählen';
        xrRefresh(s);
        return;
      }
      s.status = termStatus(true, 0);
      xrRefresh(s);
      if (immediate) xrRun(s, t);
      else s.timer = setTimeout(() => xrRun(s, t), SEARCH_DELAY);
    }

    function xrAct(s, d, kind) {
      const id = d.targetId;
      if (kind === 'guide') {
        const r = trail.start(id);
        ctx.xr.toast(r ? 'Der Spur folgen · Hülle leuchtet' : 'Zu diesem Titel finde ich gerade keinen Weg');
        if (r) s.handle.close();
      } else if (kind === 'counter' || kind === 'series') {
        s.handle.close();
        ctx.items.take(id, { from: 'counter' });
      } else if (kind === 'play') {
        s.handle.close();
        ctx.deps.play(d.item, { resume: false });
      }
    }

    function xrClose(s) {
      clearTimeout(s.timer);
      if (s.ac) s.ac.abort();
      s.token++;
      if (xs === s) xs = null;
    }

    function xrOpen(q) {
      if (xs) { xs.query = q || ''; xrSchedule(xs, xs.query, true); return; }
      const s = {
        handle: null, query: q || '', status: '', descs: [], timer: 0, ac: null, token: 0, handlers: null,
      };
      s.handlers = {
        onInput: (v) => { s.query = v; xrSchedule(s, v, false); },
        onEnter: (v) => { s.query = v; xrSchedule(s, v, true); },
        act: (d, k) => xrAct(s, d, k),
      };
      xs = s;
      const p = ctx.player.getPose();
      const far = Math.hypot(p.x - pcx, p.z - pcz) > 2.5;
      const go = far ? ctx.xr.jumpTo(pcx, pcz - 1.0, { face: { x: pcx, z: pcz } }) : Promise.resolve(true);
      go.then(() => {
        if (disposed || xs !== s || !xrOn()) { if (xs === s) xrClose(s); return; }
        s.handle = ctx.xr.panel.open(buildTermSpec({ query: s.query, status: s.status, descs: s.descs, mediaOf, handlers: s.handlers, onClose: () => xrClose(s) }));
        ctx.use('sound')?.play('beep');
        xrSchedule(s, s.query, true);
      });
    }

    function open(q) {
      if (disposed) return;
      if (xrOn()) { xrOpen(q); return; }
      if (st) { st.setQuery(q || ''); return; }
      snap = { ...ctx.player.getPose() };
      st = buildOverlay(q || '');
      ctx.overlay.open(st.root, { onClose: onClosed });
      ctx.player.camera.flyTo({ x: pcx, y: 1.45, z: pcz - 1.0 }, { x: pcx, y: 1.37, z: pcz - 0.2 }, 650);
      ctx.use('sound')?.play('beep');
      if (!ctx.isTouch) st.input.focus({ preventScroll: true });
      st.start();
    }

    function onClosed() {
      const s = st;
      st = null;
      if (!s) return;
      s.cleanup();
      if (disposed) return;
      const after = s.after;
      if (s.instant) { restoreCam(); if (after) after(); return; }
      returnCam().then(() => { if (after && !disposed) after(); });
    }

    function finish(fn, instant) {
      if (!st) return;
      st.after = fn;
      st.instant = !!instant;
      ctx.overlay.close();
    }

    function guide(targetId) {
      const r = trail.start(targetId);
      if (!r) { ctx.deps.toast('Zu diesem Titel finde ich gerade keinen Weg'); return; }
      ctx.deps.toast('Der Spur folgen · Hülle leuchtet');
      if (ctx.isTouch) ctx.player.walkTo(r.slot.stand.x, r.slot.stand.z, { face: r.slot.stand.yaw });
    }

    function buildOverlay(initialQuery) {
      const root = h('div', 'lfx-store-m3 lfx-store-term');
      const crt = h('div', 'lfx-store-term-crt');
      crt.setAttribute('role', 'dialog');
      crt.setAttribute('aria-label', 'Kassen-PC · Suche');
      const head = h('div', 'lfx-store-term-head');
      const title = h('span', 'lfx-store-term-title', 'VIDEOTHEK LENZ · Verleihsystem 2.3');
      const clock = h('span', 'lfx-store-term-clock', formatClock(new Date()));
      head.append(title, clock);
      const field = h('label', 'lfx-store-term-field');
      field.append(h('span', 'lfx-store-term-prompt', 'Suchbegriff ▸'));
      const input = h('input', 'lfx-store-term-input');
      input.type = 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.setAttribute('inputmode', 'search');
      input.setAttribute('enterkeyhint', 'search');
      input.setAttribute('autocapitalize', 'off');
      input.setAttribute('aria-label', 'Suchbegriff');
      input.placeholder = 'Titel, Serie oder Folge …';
      input.maxLength = 80;
      field.appendChild(input);
      const status = h('div', 'lfx-store-term-status');
      const list = h('div', 'lfx-store-term-list');
      list.setAttribute('role', 'listbox');
      const help = h('div', 'lfx-store-term-help');
      help.hidden = true;
      for (const line of [
        'F1  Hilfe ein/aus', 'F3  Hinführen: leuchtende Spur zum Regal', 'F5  Über den Tresen: Hülle holen lassen',
        '↑ ↓  Auswahl · Enter  Hauptaktion · Esc  Ende', 'Folgen und Titel außerhalb des Sortiments lassen sich direkt abspielen.',
      ]) help.appendChild(h('div', 'lfx-store-term-help-line', line));
      const keys = h('div', 'lfx-store-term-keys');
      const keyBtn = (label, fn) => { const b = button(label, 'lfx-store-term-key', fn); keys.appendChild(b); return b; };

      let results = [];
      let sel = -1;
      let timer = 0;
      let ac = null;
      let token = 0;
      let pending = false;
      let clockTimer = 0;
      const S = { root, input, after: null, instant: false, cleanup: null, setQuery: null, start: null };

      const setStatus = (t) => { status.textContent = t; };
      const selected = () => results[sel] || null;

      function select(i, scroll = true) {
        if (!results.length) { sel = -1; return; }
        sel = Math.max(0, Math.min(results.length - 1, i));
        results.forEach((r, k) => {
          const on = k === sel;
          r.el.classList.toggle('is-sel', on);
          r.el.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        if (scroll) { const el = results[sel].el; if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); }
        ctx.use('sound')?.play('click');
      }

      function act(kind) {
        const r = selected();
        if (!r) { setStatus('Bitte zuerst einen Titel auswählen.'); return; }
        const d = r.desc;
        if (!d.actions.includes(kind)) {
          if (kind === 'guide') setStatus(d.inCatalog ? 'Dieser Titel liegt im Lager – bitte „Über den Tresen“.' : 'Dieser Titel steht nicht im Regal.');
          else if (kind === 'counter') setStatus('Dafür gibt es „Abspielen“.');
          return;
        }
        if (kind === 'guide') finish(() => guide(d.targetId));
        else if (kind === 'counter' || kind === 'series') finish(() => ctx.items.take(d.targetId, { from: 'counter' }));
        else if (kind === 'play') finish(() => ctx.deps.play(d.item, { resume: false }), true);
      }

      function addRow(desc) {
        const row = h('div', 'lfx-store-term-row');
        row.setAttribute('role', 'option');
        const idx = results.length;
        const main = h('div', 'lfx-store-term-main');
        main.appendChild(h('span', 'lfx-store-term-name', desc.title));
        if (desc.sub) main.appendChild(h('span', 'lfx-store-term-subname', desc.sub));
        row.append(main, h('span', 'lfx-store-term-year', desc.year), h('span', 'lfx-store-term-type', desc.typeLabel), h('span', `lfx-store-term-loc${desc.inStore ? '' : ' is-stock'}`, desc.location));
        const acts = h('div', 'lfx-store-term-acts');
        for (const k of desc.actions) {
          const b = button(ACT_LABEL[k], `lfx-store-term-btn${k === desc.actions[0] ? ' is-main' : ''}`, () => { select(idx, false); act(k); });
          acts.appendChild(b);
        }
        row.appendChild(acts);
        row.addEventListener('click', () => { select(idx); });
        list.appendChild(row);
        results.push({ el: row, desc });
      }

      function render(sections, emptyText) {
        list.textContent = '';
        results = [];
        sel = -1;
        const e = env();
        let any = false;
        for (const sec of sections) {
          if (sec.title) list.appendChild(h('div', 'lfx-store-term-sec', `── ${sec.title} ──`));
          for (const it of sec.items.slice(0, MAX_RESULTS)) { addRow(describeResult(it, e)); any = true; }
        }
        if (!any) list.appendChild(h('div', 'lfx-store-term-empty', emptyText || 'Keine Einträge.'));
        else select(0, false);
        list.scrollTop = 0;
      }

      function showDefault() {
        const secs = defaultSections(ctx.catalog, getItem, 6);
        render(secs, 'Bitte einen Suchbegriff eingeben.');
        setStatus(secs.length ? 'Leere Suche · Neuheiten und Rückgaben' : 'Bitte einen Suchbegriff eingeben.');
      }

      async function run(q) {
        if (ac) ac.abort();
        ac = new AbortController();
        const mine = ++token;
        setStatus('Suche läuft …');
        try {
          const res = await ctx.deps.search(q, { signal: ac.signal });
          if (mine !== token || disposed || st !== S) return;
          const list2 = rankResults(res, q).slice(0, MAX_RESULTS);
          render([{ title: '', items: list2 }], `Keine Treffer für „${q}“.`);
          setStatus(list2.length ? `${list2.length} Treffer · ${list2.length === MAX_RESULTS ? 'Liste gekürzt' : 'F3 Hinführen · F5 Tresen'}` : `Keine Treffer für „${q}“.`);
        } catch (err) {
          if (mine !== token || (err && err.name === 'AbortError')) return;
          setStatus('Verbindung zur Datenbank gestört – bitte nochmal versuchen.');
        }
      }

      function schedule(q, immediate) {
        clearTimeout(timer);
        pending = false;
        const t = q.trim();
        if (!t) { if (ac) ac.abort(); token++; showDefault(); return; }
        setStatus('Suche läuft …');
        if (immediate) run(t);
        else { pending = true; timer = setTimeout(() => { pending = false; run(t); }, SEARCH_DELAY); }
      }

      input.addEventListener('input', () => schedule(input.value, false));
      keyBtn('F1 Hilfe', () => { help.hidden = !help.hidden; });
      keyBtn('F3 Hinführen', () => act('guide'));
      keyBtn('F5 Tresen', () => act(selected() && selected().desc.isEpisode ? 'series' : 'counter'));
      keyBtn('Esc Ende', () => ctx.overlay.close());

      root.addEventListener('keydown', (e) => {
        e.stopPropagation();
        const onBtn = e.target && e.target.tagName === 'BUTTON';
        switch (e.key) {
          case 'ArrowDown': e.preventDefault(); select(sel + 1); break;
          case 'ArrowUp': e.preventDefault(); select(sel - 1); break;
          case 'PageDown': e.preventDefault(); select(sel + 5); break;
          case 'PageUp': e.preventDefault(); select(sel - 5); break;
          case 'Enter': {
            if (onBtn) break;
            e.preventDefault();
            if (pending) { clearTimeout(timer); pending = false; run(input.value.trim()); break; }
            if (selected()) act(selected().desc.actions[0]);
            break;
          }
          case 'F1': e.preventDefault(); help.hidden = !help.hidden; break;
          case 'F3': e.preventDefault(); act('guide'); break;
          case 'F5': e.preventDefault(); act(selected() && selected().desc.isEpisode ? 'series' : 'counter'); break;
          case 'Escape': e.preventDefault(); ctx.overlay.close(); break;
          default: break;
        }
      });
      root.addEventListener('keyup', (e) => e.stopPropagation());
      root.addEventListener('click', (e) => { if (e.target === root) ctx.overlay.close(); });

      crt.append(head, field, status, list, help, keys);
      root.appendChild(crt);

      S.cleanup = () => { clearTimeout(timer); clearInterval(clockTimer); if (ac) ac.abort(); token++; };
      S.setQuery = (q) => { input.value = q; schedule(q, true); };
      S.start = () => {
        clockTimer = setInterval(() => { clock.textContent = formatClock(new Date()); }, 1000);
        input.value = initialQuery;
        schedule(initialQuery, true);
      };
      return S;
    }

    const removeIa = ctx.addInteractable({
      box: { min: { x: pcx - 0.32, y: 1.1, z: pcz - 0.26 }, max: { x: pcx + 0.32, y: 1.62, z: pcz + 0.26 } },
      label: 'Kassen-PC · Suchen',
      hint: 'E / Klick: Titel suchen',
      onUse: () => open(''),
    });
    const removeProvider = ctx.provide('terminal', { open });
    const offXr = ctx.on('xr', (on) => { if (!on && xs) { const s = xs; try { if (s.handle && s.handle.open) s.handle.close(); } catch { /* egal */ } xrClose(s); } });
    const offDbg = debugHook(ctx, 'terminal', {
      open, guide: (id) => guide(id), stopTrail: () => trail.stop(), look: (x, y, zz, ms) => ctx.player.lookAt(x, y, zz, ms || 1),
      pc: { x: pcx, z: pcz }, get trailActive() { return trail.active; }, trailPoints: () => trail.points.map((p) => ({ x: p.x, z: p.z })),
    });

    return {
      update(dt, t) {
        trail.update(dt, t);
        if (st) return;
        const p = ctx.player.getPose();
        if (Math.hypot(p.x - pcx, p.z - pcz) > 9) return;
        redraw(t);
      },
      onSuspend() {
        if (st) { st.instant = true; ctx.overlay.close(); }
        if (xs) { const s = xs; if (s.handle) s.handle.close(); xrClose(s); }
      },
      dispose() {
        disposed = true;
        if (xs) { const s = xs; if (s.handle && s.handle.open) s.handle.close(); xrClose(s); }
        removeIa();
        removeProvider();
        offXr();
        offDbg();
        trail.dispose();
        if (st) st.cleanup();
      },
    };
  },
};

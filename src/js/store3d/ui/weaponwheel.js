// VIDEOTHEK LENZ · Waffenrad (1.18.0), Muster net/emote-ui.js. Vertrag .tmp/v118/contracts.md §1. Kein three.
// Vier Segmente: Hand, Gürtel, Peitsche, Laserpointer (Symbole als Inline-SVG, per createElementNS). Auswahl per Maus/Tipp,
// Pfeiltasten + Enter, Ziffern 1–4; R/Esc schließen. Ohne `ctx.overlay` hängt das Rad als eigenes Element in `host`.
// Mit ctx.overlay gibt das Rad den Pointer-Lock nur kurz frei (Overlay-Modus) und holt ihn beim Schließen zurück.
// Bei „R halten“ (Welle 6) ruft die Verdrahtung beim Loslassen commit() auf: wählt das markierte Segment und schließt.
//   createWeaponWheel(host, { ctx, touch, onPick(id) → bool /* true/undefined = Rad schließen */ }) →
//     { open(current) → bool, close(), isOpen(), focused() → id|null, commit() → id|null, select(id) → bool, dispose(), el }
//   WEAPONS, weaponIndex(id), cycleWeapon(id, dir) (rein, für das Mausrad)

export const WEAPONS = [
  { id: 'hand', label: 'Hand', key: '1' },
  { id: 'belt', label: 'Gürtel', key: '2' },
  { id: 'whip', label: 'Peitsche', key: '3' },
  { id: 'laser', label: 'Laserpointer', key: '4' },
];

export const weaponIndex = (id) => WEAPONS.findIndex((w) => w.id === id);

/** Nächste Waffe in Richtung dir (+1/−1), zyklisch; unbekannte id → Hand-Nachbar ab Index 0. */
export function cycleWeapon(id, dir) {
  const n = WEAPONS.length;
  const i = Math.max(0, weaponIndex(id));
  return WEAPONS[(((i + (dir < 0 ? -1 : 1)) % n) + n) % n].id;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
// Symbole: Pfade im 24er-Raster, Strichzeichnung (currentColor)
const ICONS = {
  hand: ['M7 12V6.5a1.5 1.5 0 0 1 3 0V11', 'M10 11V4.5a1.5 1.5 0 0 1 3 0V11', 'M13 11V5.5a1.5 1.5 0 0 1 3 0V12', 'M16 12V8.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a5 5 0 0 1-4-2L4.5 15a1.5 1.5 0 0 1 2.3-1.9L7 13.5'],
  belt: ['M3 9h18v6H3z', 'M16 9v6', 'M16 12h2', 'M6 12h.01', 'M9 12h.01', 'M12 12h.01'],
  whip: ['M4 20c3-1 4-5 6-8s5-4 8-3', 'M18 9c1.5-.5 2.5-1.8 2.5-3.5', 'M4 20l2.5-2.5'],
  laser: ['M5 19l8-8', 'M13 11l2-2 3 3-2 2z', 'M19 5l.01 0', 'M17 3v2', 'M21 7h-2', 'M20.5 3.5l-1.4 1.4'],
};

function icon(id) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'lfx-store-fight-wicon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of ICONS[id] || []) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

const warn = (what, err) => { try { console.warn('[LenzFlix Store3D] weaponwheel', what, err && err.message ? err.message : ''); } catch { /* egal */ } };

export function createWeaponWheel(host, opts = {}) {
  const ctx = opts.ctx || null;
  const touch = opts.touch != null ? !!opts.touch : !!(ctx && ctx.isTouch);
  let el = null;
  let buttons = [];
  let current = null;
  let sel = 0; // markiertes Segment
  let viaOverlay = false;
  let closing = false;
  let disposed = false;

  const xrOn = () => !!(ctx && ctx.xr && ctx.xr.presenting && ctx.xr.presenting());

  function mark(i) {
    const n = WEAPONS.length;
    sel = ((i % n) + n) % n;
    buttons.forEach((b, k) => {
      b.classList.toggle('is-sel', k === sel);
      b.setAttribute('aria-pressed', WEAPONS[k].id === current ? 'true' : 'false');
    });
    try { buttons[sel].focus({ preventScroll: true }); } catch { /* egal */ }
  }

  function pick(id) {
    let done = true;
    try { done = opts.onPick ? opts.onPick(id) !== false : true; } catch (err) { warn('onPick', err); }
    if (done) api.close();
    return done;
  }

  function onKey(e) {
    if (!el || e.ctrlKey || e.altKey || e.metaKey) return;
    const c = e.code;
    if (/^(Digit|Numpad)[1-4]$/.test(c)) { e.preventDefault(); e.stopPropagation(); if (!e.repeat) pick(WEAPONS[Number(c.slice(-1)) - 1].id); return; }
    if (c === 'ArrowRight' || c === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); mark(sel + 1); return; }
    if (c === 'ArrowLeft' || c === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); mark(sel - 1); return; }
    if (c === 'Enter' || c === 'NumpadEnter' || c === 'Space') { e.preventDefault(); e.stopPropagation(); pick(WEAPONS[sel].id); return; }
    if (c === 'KeyR' || c === 'Escape') { e.preventDefault(); e.stopPropagation(); api.close(); }
  }

  function buildRoot() {
    const root = document.createElement('div');
    root.className = 'lfx-store-fight-wheel' + (touch ? ' is-touch' : ' is-desk');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Waffenrad');
    const ring = document.createElement('div');
    ring.className = 'lfx-store-fight-wheel-ring';
    WEAPONS.forEach((w, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lfx-store-fight-wslot';
      b.dataset.weapon = w.id;
      const a = (i / WEAPONS.length) * Math.PI * 2;
      b.style.left = (50 + 34 * Math.sin(a)).toFixed(2) + '%';
      b.style.top = (50 - 34 * Math.cos(a)).toFixed(2) + '%';
      b.appendChild(icon(w.id));
      const label = document.createElement('span');
      label.className = 'lfx-store-fight-wlabel';
      label.textContent = w.label;
      b.appendChild(label);
      if (!touch) {
        const key = document.createElement('span');
        key.className = 'lfx-store-fight-wkey';
        key.textContent = w.key;
        b.appendChild(key);
      }
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); pick(w.id); });
      b.addEventListener('pointerenter', () => { if (!touch) mark(i); });
      ring.appendChild(b);
      buttons.push(b);
    });
    const hub = document.createElement('button');
    hub.type = 'button';
    hub.className = 'lfx-store-fight-whub';
    hub.textContent = touch ? 'Schließen' : 'R / Esc';
    hub.setAttribute('aria-label', 'Waffenrad schließen');
    hub.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); api.close(); });
    ring.appendChild(hub);
    root.appendChild(ring);
    root.addEventListener('click', (e) => { if (e.target === root) api.close(); });
    return root;
  }

  function cleanup() {
    if (el) document.removeEventListener('keydown', onKey, true);
    el = null;
    buttons = [];
    viaOverlay = false;
  }

  const api = {
    get el() { return el; },
    /** Öffnet das Rad; current = aktuelle Waffe (wird markiert). false = nicht möglich (VR, schon offen, entsorgt). */
    open(cur) {
      if (disposed || el || xrOn()) return false;
      current = WEAPONS.some((w) => w.id === cur) ? cur : null;
      el = buildRoot();
      const useOverlay = !!(ctx && ctx.overlay && typeof ctx.overlay.open === 'function');
      if (useOverlay) {
        try { ctx.overlay.open(el, { onClose: () => { cleanup(); } }); } catch (err) { warn('overlay', err); cleanup(); return false; }
        if (!el) return false; // Overlay hat sofort wieder geschlossen
        viaOverlay = true;
      } else if (host) host.appendChild(el);
      else { cleanup(); return false; }
      document.addEventListener('keydown', onKey, true);
      mark(Math.max(0, weaponIndex(current)));
      return true;
    },
    close() {
      if (!el || closing) return;
      closing = true;
      try { if (viaOverlay && ctx.overlay.isOpen && ctx.overlay.isOpen()) ctx.overlay.close(); } catch (err) { warn('close', err); }
      if (el && el.parentNode) el.parentNode.removeChild(el);
      cleanup();
      closing = false;
    },
    isOpen: () => !!el,
    focused: () => (el ? WEAPONS[sel].id : null),
    /** Markiertes Segment wählen und schließen (Loslassen von R). */
    commit() {
      if (!el) return null;
      const id = WEAPONS[sel].id;
      pick(id);
      return id;
    },
    /** Segment direkt wählen (ohne Öffnen nutzbar: ruft onPick). */
    select(id) {
      if (weaponIndex(id) < 0 || disposed) return false;
      return pick(id) !== false;
    },
    dispose() {
      if (disposed) return;
      api.close();
      disposed = true;
    },
  };
  return api;
}

// LENZ LIVE · Dekor-Ebenen für die Röhren-Stile (crt80, silver): reines DOM, keine Abhängigkeiten außer den Spezifikationen.
//
// createDecor({ room, tv, screen, doc, onAction }) → { el, layers, setStyle(style), setDisplays({ on, clock, ch }), dispose() }
//   Ebenen (alle aria-hidden="true", per CSS pointer-events:none):
//     .lfx-live-decor          erstes Kind von .lfx-live-room (Raum-Dekor hinter TV und Seitenspalte)       ← spec.room
//     .lfx-live-tv__deco       letztes Kind von .lfx-live-tv (Gehäuse-Teile: Antenne, Gitter, Tasten, Klappe) ← spec.tv
//     .lfx-live-screen__glass  in .lfx-live-screen (über Bild/Rauschen/Karte, unter dem Overlay)              ← spec.glass
//   el = Wurzel .lfx-live-decor; layers = { room, tv, glass }.
//   setStyle(id): alle drei Ebenen leeren und aus der Spezifikation des Stils neu bauen (flat/plain/unbekannt: leer).
//   setDisplays({ on, clock:'HH:MM', ch:n }): Anzeigen [data-display] + Wanduhr-Variablen; nur Änderungen werden geschrieben.
//     vcr → clock (auch im Standby; '--:--' nur ohne bekannte Uhrzeit) · dvd → clock (aus: leer) · rcv → on ? 'P' + zweistellig(ch) : ''
//     Variablen an .lfx-live-decor: --lfx-live-clock-h (Stundenwinkel in deg, 0–360), --lfx-live-clock-m (Minutenwinkel).
//   Spezifikation (decor-<id>.js, default export): { room: Node[], tv: Node[], glass: Node[] }
//     Node = { cls, tag?='div', text?, display?: 'vcr'|'dvd'|'rcv', action?, tip?, count?: n, actionEach?: 'ch', children?: Node[] }
//     action = bedienbarer Knoten: 'power' | 'ch:N' | 'key:ch+' | 'key:ch-' | 'key:vol+' | 'key:vol-' | 'key:epg' → data-action; tip → title (Tooltip).
//     actionEach:'ch' (bei count): Kind k bekommt action 'ch:k' und den Tooltip „Sender k“. Per CSS pointer-events:auto, nicht fokussierbar
//     (Tastatur/Screenreader bedienen die Fernbedienung). Ein delegierter click auf .lfx-live-decor / .lfx-live-tv__deco ruft onAction(action).
//     data-on="1|0" an .lfx-live-tv__deco = Gerät an (eingerasteter Netzschalter, LED-Ring).
//     count = n gleichartige <span class="lfx-live-d__i" style="--i:k"> (k = 1…n) als erste Kinder des Knotens (vor children).
import crt80 from './decor-crt80.js';
import silver from './decor-silver.js';

export const SPECS = { crt80, silver };
const KINDS = ['vcr', 'dvd', 'rcv'];
const p2 = (n) => String(n).padStart(2, '0');

function buildNode(doc, node) {
  const e = doc.createElement(node.tag || 'div');
  if (node.cls) e.className = node.cls;
  if (node.text != null) e.textContent = node.text;
  if (node.display && KINDS.includes(node.display)) e.dataset.display = node.display;
  if (node.action) e.dataset.action = node.action;
  if (node.tip) e.title = node.tip;
  const n = Math.max(0, Math.floor(Number(node.count) || 0));
  for (let i = 1; i <= n; i++) {
    const c = doc.createElement('span');
    c.className = 'lfx-live-d__i';
    c.style.setProperty('--i', String(i));
    if (node.actionEach === 'ch') {
      c.dataset.action = `ch:${i}`;
      c.title = `Sender ${i}`;
    }
    e.append(c);
  }
  if (Array.isArray(node.children)) for (const c of node.children) e.append(buildNode(doc, c));
  return e;
}

export function createDecor({ room, tv, screen, doc = document, onAction }) {
  const mk = (cls) => {
    const e = doc.createElement('div');
    e.className = cls;
    e.setAttribute('aria-hidden', 'true');
    return e;
  };
  const decor = mk('lfx-live-decor');
  const deco = mk('lfx-live-tv__deco');
  const glass = mk('lfx-live-screen__glass');
  room.prepend(decor);
  tv.append(deco);
  // Glas liegt vor dem Overlay im DOM; die Schichtung regelt z-index (decor.css)
  const ov = screen.querySelector(':scope > .lfx-live-overlay');
  if (ov) screen.insertBefore(glass, ov); else screen.append(glass);

  // Delegation: ein click pro Ebene (Maus, Touch und Stift lösen genau einen click aus)
  const onClick = (e) => {
    const t = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
    if (!t || !e.currentTarget.contains(t)) return;
    if (typeof onAction === 'function') onAction(t.dataset.action, t);
  };
  decor.addEventListener('click', onClick);
  deco.addEventListener('click', onClick);

  let state = { on: false, clock: null, ch: 1 };
  const shown = new WeakMap(); // Element → zuletzt gesetzter Text
  let angles = '';

  function put(e, text) {
    if (shown.get(e) === text) return;
    shown.set(e, text);
    e.textContent = text;
  }

  function render() {
    const { on, clock, ch } = state;
    for (const layer of [decor, deco, glass]) {
      for (const e of layer.querySelectorAll('[data-display]')) {
        const k = e.dataset.display;
        if (k === 'vcr') put(e, clock || '--:--');
        else if (k === 'dvd') put(e, on && clock ? clock : '');
        else if (k === 'rcv') put(e, on ? `P${p2(ch)}` : '');
      }
    }
    // Aktiver Sender als Attribut (z. B. leuchtende Programmtaste am Gerät); aus: leer
    const chAttr = on ? String(ch) : '';
    if (deco.dataset.ch !== chAttr) deco.dataset.ch = chAttr;
    const onAttr = on ? '1' : '0';
    if (deco.dataset.on !== onAttr) deco.dataset.on = onAttr;
    const m = /^(\d{1,2}):(\d{2})/.exec(clock || '');
    if (m) {
      const h = Number(m[1]) % 12;
      const min = Number(m[2]);
      const key = `${h}:${min}`;
      if (key !== angles) {
        angles = key;
        decor.style.setProperty('--lfx-live-clock-h', String(h * 30 + min * 0.5));
        decor.style.setProperty('--lfx-live-clock-m', String(min * 6));
      }
    }
  }

  return {
    el: decor,
    layers: { room: decor, tv: deco, glass },
    setStyle(style) {
      const spec = SPECS[style] || {};
      for (const [layer, key] of [[decor, 'room'], [deco, 'tv'], [glass, 'glass']]) {
        layer.textContent = '';
        for (const node of spec[key] || []) layer.append(buildNode(doc, node));
      }
      render();
    },
    setDisplays(p = {}) {
      state = {
        on: p.on === undefined ? state.on : !!p.on,
        clock: p.clock === undefined ? state.clock : p.clock,
        ch: p.ch === undefined ? state.ch : p.ch,
      };
      render();
    },
    dispose() {
      decor.removeEventListener('click', onClick);
      deco.removeEventListener('click', onClick);
      decor.remove();
      deco.remove();
      glass.remove();
    },
  };
}

// VIDEOTHEK LENZ · LENZ PALAST: Auswahl am Sitz „Mitschauen“ oder „eigener Film“ (DOM und VR-Spec). Kein three.
// model = { offers: [{ sid, title, sub }] (nur Filme aus dem eigenen Katalog, siehe choice.js joinOffers), own: { title } | null (Ticket),
//   isPrivate, onJoin(offer), onOwn() }. Titel kommen nur aus dem eigenen Katalog; ohne Recht gibt es gar keine Zeile.
import { h, button } from '../modules/m3-gfx.js';
import { JOIN_FOOT, JOIN_PRIVATE } from './choice.js';

const HEAD = 'Saal 1 – was möchtest du sehen?';
const OWN_NONE = 'Eigener Film – erst ein Ticket an der Kasse holen';

export function renderJoin(panel, close, model) {
  panel.textContent = '';
  const head = h('div', 'lfx-store-palast-head');
  head.append(h('div', 'lfx-store-palast-title', HEAD), button('Abbrechen', 'lfx-store-act lfx-store-palast-close', close));
  panel.append(head);
  const list = h('div', 'lfx-store-palast-list');
  for (const o of model.offers) {
    const row = h('button', 'lfx-store-palast-row lfx-store-join-row');
    row.type = 'button';
    const txt = h('span', 'lfx-store-palast-txt');
    txt.append(h('span', 'lfx-store-palast-name', `Mitschauen: „${o.title}“`), h('span', 'lfx-store-palast-info', o.sub));
    row.append(txt, h('span', 'lfx-store-palast-go', 'Mitschauen'));
    row.addEventListener('click', (e) => { e.stopPropagation(); close(); model.onJoin(o); });
    list.append(row);
  }
  const own = h('button', 'lfx-store-palast-row lfx-store-join-row');
  own.type = 'button';
  const ot = h('span', 'lfx-store-palast-txt');
  ot.append(h('span', 'lfx-store-palast-name', model.own ? `Eigener Film: „${model.own.title}“` : OWN_NONE));
  own.append(ot);
  if (model.own) {
    own.append(h('span', 'lfx-store-palast-go', 'Starten'));
    own.addEventListener('click', (e) => { e.stopPropagation(); close(); model.onOwn(); });
  } else own.disabled = true;
  list.append(own);
  panel.append(list);
  if (model.isPrivate) panel.append(h('div', 'lfx-store-palast-tip', JOIN_PRIVATE));
  panel.append(h('div', 'lfx-store-palast-foot', JOIN_FOOT));
  // Esc schließt (der Kern fängt es im Modus „overlay“ ohnehin; hier zusätzlich lokal), Tab bleibt im Panel
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = [...panel.querySelectorAll('button:not([disabled])')];
    if (!f.length) return;
    const i = f.indexOf(panel.ownerDocument.activeElement);
    const to = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i < 0 || i === f.length - 1 ? 0 : i + 1);
    e.preventDefault();
    f[to].focus();
  });
}

/** VR-Spec (Form wie reserve.js): dieselben Zeilen, Abbrechen über das Panel-Schließen. */
export function joinSpec(model, close) {
  const rows = model.offers.map((o) => ({
    label: `Mitschauen: „${o.title}“`, sub: o.sub, actions: [{ label: 'Mitschauen', primary: true, onSelect: () => { close(); model.onJoin(o); } }],
  }));
  rows.push(model.own
    ? { label: `Eigener Film: „${model.own.title}“`, actions: [{ label: 'Starten', onSelect: () => { close(); model.onOwn(); } }] }
    : { label: OWN_NONE, actions: [] });
  const lines = [];
  if (model.isPrivate) lines.push(JOIN_PRIVATE);
  lines.push(JOIN_FOOT);
  return { title: HEAD, lines, anchor: 'front', width: 0.9, list: { visible: 5, rows } };
}

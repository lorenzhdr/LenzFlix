// VIDEOTHEK LENZ · LENZ PALAST: Kassen-Overlay (DOM). Füllt das Panel, das modules/m3-gfx.js openPanel liefert.
// Reine DOM-Logik ohne three; Handler kommen vom Modul. Texte Deutsch.
import { h, button } from '../modules/m3-gfx.js';

/**
 * model = {
 *   rows: showRows(...), ticket, tape (Item | null), footer, dayLabel,
 *   imageUrl(item) → url | '' , itemOf(show) → Item | null,
 *   onBuy(row), onHandIn(), onClear()
 * }
 * Rückgabe: { rebuild() } zum Neuzeichnen nach Ticketwechsel.
 */
export function renderPanel(panel, close, model) {
  function rebuild() {
    panel.textContent = '';
    const head = h('div', 'lfx-store-palast-head');
    head.append(h('div', 'lfx-store-palast-title', 'LENZ PALAST'), h('div', 'lfx-store-palast-sub', model.dayLabel || 'Heute im Programm'));
    head.append(button('Schließen', 'lfx-store-act lfx-store-palast-close', close));
    panel.append(head);

    const t = model.ticket;
    if (t) {
      const box = h('div', 'lfx-store-palast-ticket');
      box.append(
        h('span', 'lfx-store-palast-ticket-no', t.source === 'tape' ? 'EIGENE KASSETTE' : `TICKET ${t.no}`),
        h('span', 'lfx-store-palast-ticket-title', t.title),
        h('span', 'lfx-store-palast-ticket-hint', 'Saal 1 – bitte Platz nehmen'),
      );
      box.append(button('Zurückgeben', 'lfx-store-act lfx-store-palast-back', () => { model.onClear(); rebuild(); }));
      panel.append(box);
    }

    const list = h('div', 'lfx-store-palast-list');
    if (!model.rows.length) list.append(h('div', 'lfx-store-palast-empty', 'Heute läuft nichts – der Vorführer ist Popcorn holen. Bring doch eine eigene Kassette mit!'));
    for (const r of model.rows) {
      const row = h('button', `lfx-store-palast-row${r.mine ? ' is-mine' : ''}`);
      row.type = 'button';
      const url = model.imageUrl ? model.imageUrl(model.itemOf ? model.itemOf(r.show) : null) : '';
      if (url) {
        const img = h('img', 'lfx-store-palast-img');
        img.alt = '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.draggable = false;
        img.src = url;
        row.append(img);
      }
      const txt = h('span', 'lfx-store-palast-txt');
      txt.append(h('span', 'lfx-store-palast-time', r.time), h('span', 'lfx-store-palast-name', r.title), h('span', 'lfx-store-palast-info', r.sub));
      if (r.badge) txt.append(h('span', 'lfx-store-palast-badge', r.badge));
      txt.append(h('span', 'lfx-store-palast-line', r.line));
      row.append(txt, h('span', 'lfx-store-palast-go', r.mine ? 'Dein Ticket' : 'Ticket holen'));
      row.addEventListener('click', (e) => { e.stopPropagation(); model.onBuy(r); close(); });
      list.append(row);
    }
    panel.append(list);

    if (model.tape) {
      const tape = h('div', 'lfx-store-palast-tape');
      tape.append(h('span', 'lfx-store-palast-tape-text', `Du hast „${model.tape.Name || 'eine Kassette'}“ dabei.`));
      tape.append(button('Eigene Kassette abgeben', 'lfx-store-act lfx-store-palast-hand', () => { model.onHandIn(); close(); }));
      panel.append(tape);
    } else {
      panel.append(h('div', 'lfx-store-palast-tip', 'Tipp: Nimm im Laden eine Hülle in die Hand – dann kannst du sie hier als eigenes Programm abgeben.'));
    }
    if (model.footer) panel.append(h('div', 'lfx-store-palast-foot', model.footer));
  }
  rebuild();
  return { rebuild };
}

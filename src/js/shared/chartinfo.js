// LenzFlix: Info-Knopf (i) neben den Titeln der echten Top-10-Chart-Zeilen. Klick öffnet das Kästchen
// „So entsteht die Liste“ (core/sheet.js: am PC am Knopf, am Handy als Blatt von unten).
// Zahlen kommen ausschließlich aus chart.rules (Worker) und chart.windowDays; ohne rules gibt es keinen Knopf.
import { h } from '../core/dom.js';
import { ICON_INFO } from '../core/icons.js';
import { openSheet, closeChooser } from '../core/sheet.js';
import { computeMenuPosition, anchorRect } from '../core/itemmenu.js';

const LABEL = 'So entsteht die Liste';
const SHEET_W = 340;
const BTN_CLASS = 'lfx-chartinfo-btn';

const num = (v, fallback) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fallback);
const daysAgo = (n) => (n === 1 ? 'vor 1 Tag' : `vor ${n} Tagen`);
/** „13 Min.“ aus Sekunden; unter 60 s null (Teil wird weggelassen). */
const minutes = (s) => (Number(s) >= 60 ? `${Math.round(Number(s) / 60)}\u00a0Min.` : null); // geschütztes Leerzeichen: Zahl und Einheit nie getrennt

function windowText(days) {
  const d = Number(days);
  if (!Number.isFinite(d) || d <= 0) return 'zuletzt';
  return d === 1 ? 'am letzten Tag' : `in den letzten ${d} Tagen`;
}

const heading = (text) => h('h3', { class: 'lfx-chartinfo__h' }, text);
const para = (text) => h('p', { class: 'lfx-chartinfo__p' }, text);
const hint = (text) => h('p', { class: 'lfx-chartinfo__hint' }, text);

/** Punkte-Treppe: Folgen -> Punkte (log2(1 + Folgen)). */
function steps() {
  const rows = [[1, 1], [3, 2], [7, 3], [15, 4]];
  return h('ul', { class: 'lfx-chartinfo__steps' }, rows.map(([eps, pts]) => h('li', { class: 'lfx-chartinfo__step' }, [
    h('span', { class: 'lfx-chartinfo__step-n' }, eps === 1 ? '1 Folge' : `${eps} Folgen`),
    h('span', { class: 'lfx-chartinfo__dots', 'aria-hidden': 'true' }, Array.from({ length: pts }, () => h('span', { class: 'lfx-chartinfo__dot' }))),
    h('span', { class: 'lfx-chartinfo__step-v' }, pts === 1 ? '1 Punkt' : `${pts} Punkte`),
  ])));
}

/** Aktualitäts-Balken: heute 100 %, nach einer Halbwertszeit 50 %, nach zwei 25 %. */
function bars(halfLife) {
  const vals = ['1', '½', '¼'];
  return h('ul', { class: 'lfx-chartinfo__bars' }, vals.map((v, k) => h('li', { class: 'lfx-chartinfo__bar' }, [
    h('span', { class: 'lfx-chartinfo__bar-l' }, k === 0 ? 'heute' : daysAgo(halfLife * k)),
    h('span', { class: 'lfx-chartinfo__track', 'aria-hidden': 'true' }, [
      h('span', { class: 'lfx-chartinfo__fill', style: { width: `${Math.round(0.5 ** k * 100)}%` } }),
    ]),
    h('span', { class: 'lfx-chartinfo__bar-v' }, v),
  ])));
}

function content(chart) {
  const rules = chart.rules || {};
  const half = num(rules.halfLifeDays, 7);
  const win = windowText(chart.windowDays);
  if (chart.kind === 'movies') {
    const min = minutes(rules.minSecondsMovie);
    // Tagesgenaues Alter und Gleichstand nach gesehenem Anteil gibt es erst ab dem Worker mit rules.ageUnit 'day'.
    const byDay = rules.ageUnit === 'day';
    return [
      para(`Gezählt wird, wer einen Film ${win} geschaut hat${min ? `, ab ${min}` : '.'} Jede Person bringt höchstens 1 Punkt, mehrmals schauen zählt nicht extra.`),
      heading('Neues zählt mehr'),
      bars(half),
      hint(`${byDay ? 'Abrufe vom selben Tag zählen gleich. ' : ''}Wer den Film ${daysAgo(half)} gesehen hat, zählt nur noch halb.`),
      ...(byDay ? [
        heading('Bei Gleichstand'),
        para('Entscheidet, wie viel vom Film gesehen wurde: Zweimal ganz geschaut liegt vor zweimal halb geschaut, egal wie lang der Film ist.'),
      ] : []),
    ];
  }
  const min = minutes(rules.minSecondsEpisode);
  return [
    para(`Gezählt wird, was alle Konten ${win} geschaut haben.${min ? ` Eine Folge zählt ab ${min}` : ''}`),
    heading('Viel schauen zählt mehr, aber abnehmend'),
    steps(),
    hint('Das gilt pro Person, die Punkte aller Personen werden addiert.'),
    heading('Neues zählt mehr'),
    bars(half),
    hint(`Eine Folge von ${daysAgo(half)} zählt nur noch halb so viel.`),
  ];
}

/** Hängt das Kästchen nach dem Füllen ins Fenster (Höhe erst jetzt bekannt); am Handy übersteuert das Blatt-CSS die Werte. */
function fitToViewport(c, btn) {
  const hgt = c.sheet.offsetHeight;
  if (!hgt || !btn.isConnected) return;
  const pos = computeMenuPosition(anchorRect(btn), undefined, { w: SHEET_W, h: hgt });
  c.sheet.style.setProperty('--lfx-sheet-x', `${Math.round(pos.x)}px`);
  c.sheet.style.setProperty('--lfx-sheet-y', `${Math.round(pos.y)}px`);
}

function open(btn, chart) {
  const c = openSheet(btn, LABEL);
  c.sheet.classList.add('lfx-chartinfo-sheet');
  const close = h('button', { type: 'button', class: 'lfx-chartinfo__close', 'aria-label': 'Schließen', title: 'Schließen', onclick: () => closeChooser() }, '✕');
  c.list.replaceChildren(...content(chart));
  c.sheet.append(close);
  fitToViewport(c, btn);
  close.focus({ preventScroll: true });
}

/** Info-Knopf für eine Chart-Zeile oder null (kein chart/rules). chart = { kind: 'series'|'movies', rules, windowDays }. */
export function chartInfoButton(chart, { className = '' } = {}) {
  if (!chart || !chart.rules || typeof chart.rules !== 'object') return null;
  const btn = h('button', {
    type: 'button',
    class: `${BTN_CLASS} ${className}`.trim(),
    'aria-label': LABEL,
    'aria-haspopup': 'dialog',
    title: LABEL,
  });
  btn.innerHTML = ICON_INFO;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    open(btn, chart);
  });
  return btn;
}

/**
 * Knopf im Zeilenkopf abgleichen: vorhandenen entfernen, bei gültigem chart neu direkt hinter dem Titel
 * (`.lfx-row__title`/erste Überschrift) einfügen, bzw. vor `before` (Node), sonst ans Ende. Gibt den Knopf oder null zurück.
 */
export function syncChartInfo(headEl, chart, { className = '', before = null } = {}) {
  if (!headEl) return null;
  for (const old of headEl.querySelectorAll(`.${BTN_CLASS}`)) old.remove();
  const btn = chartInfoButton(chart, { className });
  if (!btn) return null;
  const title = headEl.querySelector('.lfx-row__title') || headEl.querySelector('h1, h2, h3');
  if (before && before.parentNode === headEl) before.before(btn);
  else if (title && title.parentNode === headEl) title.after(btn);
  else headEl.append(btn);
  return btn;
}

// LenzFlix: Panel des Geheimmenüs (Dialog). Öffnen/Schließen von features/secretmenu.js; alles räumt in close() auf.
import { h } from '../../core/dom.js';
import { VERSION } from '../../core/version.js';
import { getTheme } from '../../core/theme.js';
import { clearCache } from '../../core/cache.js';
import { clearItemStore } from '../../core/itemstore.js';
import {
  getNormalScale, getSaverScale, setImageScales, resetImageScales, onImageScaleChange, NORMAL_RANGE, SAVER_RANGE,
} from '../../core/imgscale.js';
import {
  isDataSaverOn, DATASAVER_PARTS, DATASAVER_PART_LABELS, getDataSaverParts, setDataSaverPart, resetDataSaverParts,
  onDataSaverPartsChange, onDataSaverChange,
} from '../../core/datasaver.js';
import { switchButton, setSwitchState } from '../../core/switch.js';
import {
  isZapStatsOn, setZapStats, isZapWarmOn, setZapWarm, isForceHlsOn, setForceHls,
} from '../tvdata/zapflag.js';
import { clearCatalogCache } from '../tvdata/data.js';

const PANEL_ID = 'lfx-secret';
const POSTER_BASE = 300;
const WIDE_BASE_DESKTOP = 600;
const WIDE_BASE_NARROW = 420;
const NARROW_PX = 800;

let state = null; // { root, prevFocus, offs[], onKey }

export const isSecretMenuOpen = () => Boolean(state);

const pct = (v) => `${Math.round(v * 100)} %`;
const isNarrowView = () => (window.innerWidth || 1024) < NARROW_PX;
const wideBase = () => (isNarrowView() ? WIDE_BASE_NARROW : WIDE_BASE_DESKTOP);
const px = (base, scale) => Math.round(base * scale);
const de = (n, digits = 1) => n.toFixed(digits).replace('.', ',');
const section = (title, children) => h('section', { class: 'lfx-secret__sec' }, [h('h3', { class: 'lfx-secret__h' }, title), ...children]);
const note = (text) => h('p', { class: 'lfx-secret__note' }, text);

/** Empfehlung für die Normal-Skala aus der ersten sichtbaren Breitbild-Karte, sonst null. */
function recommendScale() {
  const dpr = window.devicePixelRatio || 1;
  for (const img of document.querySelectorAll('.lfx-card img')) {
    const r = img.getBoundingClientRect();
    if (r.width < 40 || r.height < 10 || r.width / r.height < 1.3) continue;
    const need = r.width * dpr;
    const v = Math.ceil((need / wideBase()) * 20) * 5;
    return Math.min(NORMAL_RANGE[1] * 100, Math.max(NORMAL_RANGE[0] * 100, v));
  }
  return null;
}

function slider({ label, range, get, key, offs }) {
  const id = `lfx-secret-${key}`;
  const out = h('output', { class: 'lfx-secret__val', for: id }, pct(get()));
  const sizes = h('p', { class: 'lfx-secret__note' });
  const input = h('input', {
    type: 'range', id, min: Math.round(range[0] * 100), max: Math.round(range[1] * 100), step: 1, value: Math.round(get() * 100),
  });
  const showSizes = (s) => {
    sizes.textContent = `Poster ${px(POSTER_BASE, s)} px · Breitbild ${px(wideBase(), s)} px`;
  };
  const show = (s) => { out.textContent = pct(s); showSizes(s); };
  // Gespeichert wird in 5er-Schritten (imgscale); in Bewegungsrichtung runden, damit Pfeiltasten nicht auf dem Wert hängen
  const snap = (v) => {
    const cur = Math.round(get() * 100);
    return (v > cur ? Math.ceil(v / 5) * 5 : v < cur ? Math.floor(v / 5) * 5 : v) / 100;
  };
  show(get());
  input.addEventListener('input', () => show(snap(Number(input.value))));
  input.addEventListener('change', () => setImageScales({ [key]: snap(Number(input.value)) }));
  offs.push(onImageScaleChange(() => {
    const s = get();
    input.value = String(Math.round(s * 100));
    show(s);
  }));
  return h('div', { class: 'lfx-secret__slider' }, [
    h('label', { class: 'lfx-secret__lbl', for: id }, [label, out]), input, sizes,
  ]);
}

function imageSection(offs) {
  const dpr = window.devicePixelRatio || 1;
  const kids = [
    slider({ label: 'Normal', range: NORMAL_RANGE, get: getNormalScale, key: 'normal', offs }),
    slider({ label: 'Datensparmodus', range: SAVER_RANGE, get: getSaverScale, key: 'saver', offs }),
    note(`Bildschirm dieses Geräts: ${de(dpr)}× ${dpr < 1 ? 'weniger scharf' : 'schärfer'}`),
  ];
  const rec = recommendScale();
  if (rec !== null) kids.push(note(`Für scharfe Cover hier: ca. ${rec} %`));
  kids.push(
    h('button', { type: 'button', class: 'lfx-secret__btn', onclick: () => resetImageScales() }, 'Zurücksetzen'),
    note('Gilt für neu geladene Bilder, in allen Designs außer VIDEOTHEK LENZ.'),
  );
  return section('Bildgrößen', kids);
}

function tvSection() {
  const sw = (key, label, get, set) => switchButton(
    { key, label, checked: get(), onToggle: (on) => set(on) },
    { className: 'lfx-secret__switch', role: 'switch' },
  );
  return section('TV (Test)', [
    sw('zapstats', 'Messanzeige', isZapStatsOn, setZapStats),
    sw('zapwarm', 'Vorwärmen der Nachbarsender', isZapWarmOn, setZapWarm),
    sw('forcehls', 'HLS erzwingen', isForceHlsOn, setForceHls),
    note('„HLS erzwingen“ wirkt nur mit Messanzeige.'),
    note('Wirkt beim nächsten Öffnen des TV-Modus.'),
  ]);
}

function saverSection(offs) {
  const status = h('p', { class: 'lfx-secret__note' });
  const showStatus = () => { status.textContent = isDataSaverOn() ? 'Der Datensparmodus ist gerade an.' : 'Der Datensparmodus ist gerade aus.'; };
  showStatus();
  const btns = new Map();
  const parts = getDataSaverParts();
  const list = DATASAVER_PARTS.map((p) => {
    const b = switchButton(
      { key: p, label: DATASAVER_PART_LABELS[p] || p, checked: parts[p], onToggle: (on) => setDataSaverPart(p, on) },
      { className: 'lfx-secret__switch', role: 'switch' },
    );
    btns.set(p, b);
    return b;
  });
  offs.push(onDataSaverPartsChange((now) => {
    const cur = now || getDataSaverParts();
    for (const [p, b] of btns) setSwitchState(b, cur[p]);
  }));
  offs.push(onDataSaverChange(showStatus));
  return section('Datensparmodus im Detail', [
    status, ...list,
    h('button', { type: 'button', class: 'lfx-secret__btn', onclick: () => resetDataSaverParts() }, 'Alle wieder an'),
    note('Manche Teile wirken erst nach dem nächsten Seitenaufbau.'),
  ]);
}

function infoSection() {
  const dpr = window.devicePixelRatio || 1;
  const rows = [
    ['LenzFlix-Version', VERSION],
    ['Design', getTheme()],
    ['Bildschirm', `${window.innerWidth || 0} × ${window.innerHeight || 0} px (${de(dpr)}×)`],
  ].map(([k, v]) => h('div', { class: 'lfx-secret__row' }, [h('span', {}, k), h('span', { class: 'lfx-secret__v' }, v)]));
  const msg = h('p', { class: 'lfx-secret__note', role: 'status' });
  const reload = h('button', { type: 'button', class: 'lfx-secret__btn', hidden: true, onclick: () => window.location.reload() }, 'Neu laden');
  const clear = h('button', {
    type: 'button',
    class: 'lfx-secret__btn',
    onclick: async () => {
      clearCache();
      clearItemStore();
      await clearCatalogCache();
      msg.textContent = 'Cache geleert – Seite neu laden für frische Daten';
      reload.hidden = false;
    },
  }, 'Cache leeren');
  return section('Info', [...rows, clear, msg, reload]);
}

export function closeSecretMenu() {
  if (!state) return;
  const s = state;
  state = null;
  document.removeEventListener('keydown', s.onKey, true);
  for (const off of s.offs) { try { off(); } catch { /* egal */ } }
  s.root.remove();
  document.documentElement.classList.remove('lfx-secret-open');
  const prev = s.prevFocus;
  if (prev && prev.isConnected && typeof prev.focus === 'function') prev.focus();
}

export function openSecretMenu() {
  if (state) return;
  const offs = [];
  const close = () => closeSecretMenu();
  const title = h('h2', { class: 'lfx-secret__title', id: `${PANEL_ID}-title` }, 'Geheimmenü');
  const closeBtn = h('button', { type: 'button', class: 'lfx-secret__close', 'aria-label': 'Schließen', onclick: close }, '✕');
  const panel = h('div', { class: 'lfx-secret__panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': title.id, tabindex: '-1' }, [
    h('div', { class: 'lfx-secret__head' }, [title, closeBtn]),
    h('div', { class: 'lfx-secret__body' }, [imageSection(offs), tvSection(), saverSection(offs), infoSection()]),
  ]);
  const root = h('div', { id: PANEL_ID, class: 'lfx-secret' }, [panel]);
  root.addEventListener('mousedown', (e) => { if (e.target === root) close(); });
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const f = [...panel.querySelectorAll('button:not([hidden]), input')];
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', onKey, true);
  state = { root, prevFocus: document.activeElement, offs, onKey };
  document.body.append(root);
  document.documentElement.classList.add('lfx-secret-open');
  panel.focus();
}

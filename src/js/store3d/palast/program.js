// VIDEOTHEK LENZ · LENZ PALAST: Tagesprogramm (rein: kein three, kein DOM, kein Math.random, keine Systemuhr).
// Gleicher Katalog + gleicher Kalendertag = gleiches Programm (auch auf allen Clients). Uhrzeiten sind Stimmung: ein Film
// startet immer von vorn bzw. ab der Weiterschauen-Position. Eingabe: Katalog { items: Map|Objekt, resume: Item[], departments }.
import { seeded } from '../modules/m4-util.js';

/** Vorstellungsplätze. Bei weniger Filmen werden die späteren Zeiten bevorzugt (Abendkino). */
export const SLOTS = Object.freeze([
  Object.freeze({ time: '15:30', minutes: 15 * 60 + 30, tag: 'Nachmittags-Matinee' }),
  Object.freeze({ time: '18:00', minutes: 18 * 60, tag: 'Feierabend-Vorstellung' }),
  Object.freeze({ time: '20:15', minutes: 20 * 60 + 15, tag: 'Hauptfilm' }),
  Object.freeze({ time: '22:45', minutes: 22 * 60 + 45, tag: 'Spätvorstellung' }),
]);

const SLOT_SETS = { 1: [2], 2: [1, 2], 3: [1, 2, 3], 4: [0, 1, 2, 3] };

const LINES = {
  0: ['Mit Kakao und Kuchen im Foyer.', 'Für alle, die tagsüber lieber im Dunkeln sitzen.', 'Der Filmvorführer hat noch Kaffee im Bart.'],
  1: ['Erst Feierabend, dann Film.', 'Die Krawatte darf am Sitz hängen bleiben.', 'Schnell noch Popcorn, dann geht es los.'],
  2: ['Der Abend gehört der großen Leinwand.', 'Handys aus. Naja. Wenigstens leise.', 'Volles Haus, auch wenn es nur du bist.'],
  3: ['Nur für Nachteulen und Unvernünftige.', 'Ab hier gibt es Popcorn nur noch kalt.', 'Der Vorführer träumt schon mit.'],
};

const FOOTERS = [
  'Sneak? Nein, nur Popcorn.',
  'Das Programm ändert sich täglich – der Teppich nie.',
  'Eintritt frei, Schmunzeln Pflicht.',
  'Bitte keine Füße auf die Vordersitze. Auch nicht die eigenen.',
  'Heute im Angebot: Dunkelheit.',
  'Unser Saal hat eine Leinwand. Das ist unser Geheimnis.',
  'Pause? Gibt es nicht. Dafür gibt es den Pausenknopf.',
];

/** FNV-1a über einen String. */
export function hashStr(s) {
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** mulberry32 (= `seeded` aus modules/m4-util.js). */
export const rng = seeded;

const p2 = (n) => String(n).padStart(2, '0');

/** Kalendertag 'JJJJ-MM-TT' aus einem Date (Felder der übergebenen Zeitzone des Date, kein neuer Zeitbezug). Ungültig = null. */
export function dayKeyOf(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(d.getTime())) return null;
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

/** Minuten seit Mitternacht (0..1439) aus Date, Stunde (Zahl, Bruchteil = Minuten) oder null = unbekannt. */
export function minutesOf(now) {
  if (typeof now === 'number' && Number.isFinite(now)) return Math.floor((((now % 24) + 24) % 24) * 60);
  const d = now instanceof Date ? now : null;
  return d && Number.isFinite(d.getTime()) ? d.getHours() * 60 + d.getMinutes() : null;
}

/** 'HH:MM' aus Minuten seit Mitternacht. */
export function clockText(min) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${p2(Math.floor(m / 60))}:${p2(m % 60)}`;
}

function adultSet(cat) {
  const out = new Set();
  for (const d of (cat && cat.departments) || []) if (d && d.kind === 'adult') for (const id of d.itemIds || []) out.add(id);
  return out;
}

function listItems(cat) {
  const it = cat && cat.items;
  if (!it) return [];
  if (it instanceof Map) return [...it.values()];
  if (typeof it.values === 'function' && !Array.isArray(it)) return [...it.values()];
  return Array.isArray(it) ? it.slice() : Object.values(it);
}

const runtimeMin = (it) => (it && it.RunTimeTicks > 0 ? Math.round(it.RunTimeTicks / 600000000) : 0);

/** Kandidaten: nur Filme, kein Ab-18, mit Id und Namen, sortiert nach Id (Reihenfolge des Katalogs ist egal). */
export function candidates(cat) {
  const adult = adultSet(cat);
  const seen = new Set();
  const out = [];
  for (const it of listItems(cat)) {
    if (!it || it.Type !== 'Movie' || !it.Id || !it.Name || adult.has(it.Id) || seen.has(it.Id)) continue;
    seen.add(it.Id);
    out.push(it);
  }
  out.sort((a, b) => (a.Id < b.Id ? -1 : a.Id > b.Id ? 1 : 0));
  return out;
}

function shuffled(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

/**
 * Programm des Tages. Rückgabe { dayKey, shows: [{ slot, time, minutes, tag, line, itemId, title, year, runtimeMin, resume }], footer }.
 * Platz 1 (shows[0]) ist bevorzugt der erste Weiterschauen-Film (resume: true), wenn es einen gibt. Leerer Katalog: shows = [].
 */
export function buildProgram(cat, dayKey) {
  const key = String(dayKey || '');
  const rand = rng(hashStr(`palast|${key}`));
  const all = candidates(cat);
  const adult = adultSet(cat);
  const isOk = (it) => it && it.Type === 'Movie' && it.Id && it.Name && !adult.has(it.Id);
  const resumeItem = ((cat && cat.resume) || []).find(isOk) || null;
  const pool = all.filter((it) => !resumeItem || it.Id !== resumeItem.Id);
  const withRt = pool.filter((it) => runtimeMin(it) > 0);
  const base = withRt.length >= 4 ? withRt : withRt.concat(pool.filter((it) => !(runtimeMin(it) > 0)));
  const total = Math.min(4, base.length + (resumeItem ? 1 : 0));
  const picks = shuffled(base, rand).slice(0, Math.max(0, total - (resumeItem ? 1 : 0)));
  const chosen = resumeItem ? [resumeItem, ...picks] : picks;
  const slots = SLOT_SETS[chosen.length] || [];
  const shows = chosen.map((it, i) => {
    const s = SLOTS[slots[i]];
    const lines = LINES[slots[i]];
    const isResume = Boolean(resumeItem && it.Id === resumeItem.Id);
    return {
      slot: i, time: s.time, minutes: s.minutes, tag: s.tag,
      line: isResume ? 'Du warst noch nicht fertig – es geht dort weiter, wo du aufgehört hast.' : lines[Math.floor(rand() * lines.length)],
      itemId: it.Id, title: it.Name, year: it.ProductionYear || 0, runtimeMin: runtimeMin(it), resume: isResume,
    };
  });
  return { dayKey: key, shows, footer: FOOTERS[Math.floor(rand() * FOOTERS.length)] };
}

/** Index der hervorgehobenen Vorstellung: die nächste noch nicht begonnene, sonst die letzte; -1 ohne Programm. now = Minuten seit Mitternacht. */
export function highlightIndex(program, nowMin) {
  const sh = (program && program.shows) || [];
  if (!sh.length) return -1;
  if (!Number.isFinite(nowMin)) return 0;
  for (let i = 0; i < sh.length; i++) if (sh[i].minutes >= nowMin) return i;
  return sh.length - 1;
}

/** Status je Vorstellung: 'next' | 'later' | 'running' | 'done'. Läuft = Start höchstens Laufzeit (sonst 110 min) her. */
export function showState(show, nowMin) {
  if (!show || !Number.isFinite(nowMin)) return 'later';
  const len = show.runtimeMin > 0 ? show.runtimeMin : 110;
  if (nowMin < show.minutes) return 'later';
  return nowMin < show.minutes + len ? 'running' : 'done';
}

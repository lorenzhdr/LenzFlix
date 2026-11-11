// LENZ TV-Modus · Modell: reine Funktionen auf der öffentlichen Scheduler-API (kein DOM, kein Netzwerk, keine Lokalzeit, kein Intl).
// Importiert nur Dateien aus src/js/live/.
import { broadcastDayOf, formatClock, formatDay } from '../schedule/time.js';
import { describe as describeEntry, badges as entryBadges } from '../ui/overlay-util.js';

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const known = (n) => (n != null && n !== 9999 ? n : null);

export const KIND = { program: 'program', fill: 'fill', nightfill: 'fill', filler: 'filler', closedown: 'closedown' };

/** Anzeige-Art eines PlanEntry: 'program' | 'fill' | 'filler' | 'closedown'. */
export function kindOf(entry) {
  return (entry && KIND[entry.type]) || 'program';
}

/** Nächste Sendung nach `e` (Füller werden übersprungen, höchstens 4 Schritte, Tagesgrenzen inklusive). Kein Fehler: dann null. */
export function nextProgram(scheduler, no, e) {
  let cur = e;
  let first = null;
  for (let i = 0; i < 4; i++) {
    let n;
    try { n = scheduler.nowOn(no, cur.end).entry; } catch { return first; }
    if (!n || n.start <= cur.start) return first;
    if (!first) first = n;
    if (n.type !== 'filler') return n;
    cur = n;
  }
  return first;
}

function itemOf(scheduler, entry) {
  try { return entry && entry.itemId != null && scheduler.item ? scheduler.item(entry.itemId) : null; } catch { return null; }
}

/** Titel/Untertitel eines Eintrags aus dem Katalog: Serie → Serienname + 'S1 E3 · Folgentitel', Film → Titel. */
export function titleOf(scheduler, entry) {
  if (!entry) return { title: '', sub: '' };
  if (entry.type === 'closedown') return { title: 'Sendepause', sub: '' };
  const it = itemOf(scheduler, entry);
  if (!it) return { title: entry.label || '', sub: '' };
  const name = it.title || '';
  if (it.kind === 'episode' && it.seriesTitle) {
    const s = known(it.season);
    const ep = known(it.episode);
    let code = '';
    if (s != null) code += 'S' + s;
    if (ep != null) code += (code ? ' ' : '') + 'E' + ep;
    return { title: it.seriesTitle, sub: [code, name && name !== it.seriesTitle ? name : ''].filter(Boolean).join(' · ') };
  }
  return { title: name || 'Unbekannter Titel', sub: '' };
}

const timeRange = (e) => `${formatClock(e.start)}–${formatClock(e.end)}`;

/**
 * Alle Sender „jetzt“: [{ channel, entry, progress (0..1), next }]. Sender aus scheduler.channels(D) mit Sendetag D von t.
 * next = nächste Sendung (PlanEntry, ohne Füller) oder null.
 */
export function nowAll(scheduler, t) {
  const D = broadcastDayOf(t);
  const out = [];
  for (const channel of scheduler.channels(D)) {
    let entry;
    try { entry = scheduler.nowOn(channel.no, t).entry; } catch { entry = null; }
    if (!entry) { out.push({ channel, entry: null, progress: 0, next: null }); continue; }
    out.push({
      channel,
      entry,
      progress: clamp((t - entry.start) / Math.max(1, entry.end - entry.start), 0, 1),
      next: nextProgram(scheduler, channel.no, entry),
    });
  }
  return out;
}

function cellOf(scheduler, no, e, from, to, now) {
  const kind = kindOf(e);
  let title;
  let sub = '';
  if (kind === 'closedown') title = 'Sendepause';
  else if (kind === 'filler') {
    const nx = nextProgram(scheduler, no, e);
    const nt = nx && nx.type !== 'closedown' && nx.type !== 'filler' ? titleOf(scheduler, nx).title : '';
    title = nt ? `Gleich: ${nt}` : 'Kurze Pause';
  } else if (kind === 'fill') {
    title = 'Füllprogramm';
    sub = titleOf(scheduler, e).title;
  } else ({ title, sub } = titleOf(scheduler, e));
  return {
    entry: e,
    start: Math.max(e.start, from),
    end: Math.min(e.end, to),
    title,
    sub,
    kind,
    now: now != null && e.start <= now && now < e.end,
  };
}

/**
 * Programm-Raster für das Fenster [from, to): [{ channel, cells:[{ entry, start, end, title, sub, kind, now }] }].
 * start/end sind auf das Fenster zugeschnitten; ein Fenster über 05:00 nutzt mehrere planDay-Aufrufe.
 * Senderköpfe aus scheduler.channels(D) (Belegung ist tagesabhängig), D = opts.D oder Sendetag von `from`.
 * opts.now (ms, optional) markiert die laufende Zelle (`now: true`).
 */
export function gridRows(scheduler, { from, to, D, now } = {}) {
  const D0 = Number.isInteger(D) ? D : broadcastDayOf(from);
  const rows = scheduler.channels(D0).map((channel) => ({ channel, cells: [] }));
  if (!(to > from)) return rows;
  const D1 = broadcastDayOf(to - 1);
  for (const row of rows) {
    for (let d = Math.min(D0, broadcastDayOf(from)); d <= D1; d++) {
      let list;
      try { list = scheduler.planDay(row.channel.no, d); } catch { continue; }
      for (const e of list) {
        if (e.end <= from || e.start >= to) continue;
        row.cells.push(cellOf(scheduler, row.channel.no, e, from, to, now));
      }
    }
  }
  return rows;
}

/**
 * Beschreibung für Info-Bereich/Info-Karte.
 * → { title, sub, time:'20:15–22:05', progress, badges[], kind, itemId, seriesId, imageItemId, overview, year, genres[], runMin }
 * imageItemId: Id, deren Bild gezeigt werden soll (Serie bei Folgen, sonst die Sendung selbst); null ohne Titel.
 * overview kommt nicht aus dem Katalog: leer, außer item.overview oder opts.overviews (Map id → Text) liefert sie.
 */
export function describe(scheduler, no, entry, t, opts = {}) {
  const kind = kindOf(entry);
  const base = describeEntry(scheduler, entry);
  const it = itemOf(scheduler, entry);
  const tt = kind === 'filler'
    ? { title: cellOf(scheduler, no, entry, entry.start, entry.end, null).title, sub: '' }
    : kind === 'fill'
      ? { title: 'Füllprogramm', sub: titleOf(scheduler, entry).title }
      : titleOf(scheduler, entry);
  const b = entryBadges(entry);
  if (entry.theme) b.push(`Thementag: ${entry.theme}`);
  if (kind === 'fill') b.push(entry.label || 'Füllprogramm');
  const seriesId = base.seriesId || null;
  const hasItem = !!(it && entry.itemId != null);
  let overview = '';
  if (it && typeof it.overview === 'string') overview = it.overview;
  else if (opts.overviews && entry.itemId != null && typeof opts.overviews.get === 'function') overview = opts.overviews.get(entry.itemId) || '';
  return {
    title: tt.title,
    sub: tt.sub,
    time: timeRange(entry),
    progress: clamp((t - entry.start) / Math.max(1, entry.end - entry.start), 0, 1),
    badges: b,
    kind,
    itemId: entry.itemId != null ? entry.itemId : null,
    seriesId,
    imageItemId: hasItem ? (it.kind === 'episode' && seriesId ? seriesId : entry.itemId) : null,
    overview,
    year: base.year,
    genres: base.genres,
    runMin: base.runMin,
  };
}

/** Sieben Sendetage ab dem Sendetag von t: [{ D, label }] mit 'Heute', 'Morgen', dann z. B. 'Fr 14.11.'. */
export function days(t) {
  const D = broadcastDayOf(t);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const f = formatDay(D + i);
    out.push({ D: D + i, label: i === 0 ? 'Heute' : i === 1 ? 'Morgen' : `${f.weekday} ${f.date}` });
  }
  return out;
}

/**
 * Sendername für den TV-Modus: ohne das LIVE-Präfix des Planers („LIVE Kino“ → „Kino“, „LIVE 7“ → „Sender 7“).
 * @param {{no?: number, name?: string, genreLabel?: string}|null} channel
 */
export function channelName(channel) {
  if (!channel) return '';
  const raw = String(channel.genreLabel || channel.name || '').replace(/^LIVE\s+/i, '').trim();
  if (!raw || /^\d+$/.test(raw)) return channel.no ? `Sender ${channel.no}` : '';
  return raw;
}

// LENZ LIVE Fernsehzeitung „LIVE Programm“: reines Heftmodell für 7 Tage (siehe docs/live.md „Heftmodell“).
// Liest nur den Plan (scheduler.planDay/channels/item/genres), verändert nichts; kein DOM, keine Lokalzeit, kein Intl, kein Math.random.
// Zeit/Tag ausschließlich über die übergebenen Planzone-Funktionen (formatClock, formatDay, dayBounds).
import { describe, badges } from '../ui/overlay-util.js';

const DAYS = 7;
const OVERVIEW_MAX = 240;

const known = (n) => (n != null && n !== 9999 ? n : null);

/** Folgenspanne 'S1 E3–E7' bzw. 'S1 E9 – S2 E2' (unbekannte Teile entfallen). */
function episodeSpan(a, b) {
  const sa = known(a.season);
  const ea = known(a.episode);
  const sb = known(b.season);
  const eb = known(b.episode);
  const one = (s, e) => [s != null ? 'S' + s : '', e != null ? 'E' + e : ''].filter(Boolean).join(' ');
  if (a === b || (sa === sb && ea === eb)) return one(sa, ea);
  // Rückwärts (Serie läuft im Kreis weiter): nur der Beginn
  if (sa != null && sb != null && (sb < sa || (sb === sa && ea != null && eb != null && eb < ea))) return 'ab ' + one(sa, ea);
  if (sa === sb) {
    if (ea == null || eb == null) return one(sa, ea != null ? ea : eb);
    return (sa != null ? 'S' + sa + ' ' : '') + 'E' + ea + '–E' + eb;
  }
  return one(sa, ea) + ' – ' + one(sb, eb);
}

const sigOf = (e) => (e.premiere || '') + '|' + (e.rerun ? 'r' : '') + '|' + (e.age || '') + '|' + (e.theme || '');

function badgesOf(entry) {
  const b = badges(entry);
  if (entry.theme) b.push('Thementag');
  return b;
}

/** Plan-Einträge → Zeilen (ohne filler; Füllprogramm/Sendeschluss zusammengezogen; Folgenreihen zu einer Zeile). */
function buildRows(scheduler, formatClock, entries) {
  const list = entries.filter((e) => e.type !== 'filler');
  const rows = [];
  for (let i = 0; i < list.length; ) {
    const e = list[i];
    if (e.type === 'fill' || e.type === 'nightfill') {
      let j = i + 1;
      while (j < list.length && (list[j].type === 'fill' || list[j].type === 'nightfill')) j++;
      rows.push({ time: formatClock(e.start), start: e.start, title: 'Füllprogramm', sub: '', badges: [], kind: 'fill' });
      i = j;
      continue;
    }
    if (e.type === 'closedown') {
      let j = i + 1;
      while (j < list.length && list[j].type === 'closedown') j++;
      rows.push({ time: formatClock(e.start), start: e.start, title: 'Sendeschluss', sub: '', badges: [], kind: 'closedown' });
      i = j;
      continue;
    }
    const it = e.itemId && scheduler.item ? scheduler.item(e.itemId) : null;
    if (e.type === 'program' && it && it.kind === 'episode') {
      const sid = e.seriesId || it.seriesId || null;
      let j = i + 1;
      let last = it;
      while (j < list.length) {
        const n = list[j];
        const ni = n.type === 'program' && n.itemId ? scheduler.item(n.itemId) : null;
        if (!ni || ni.kind !== 'episode' || (n.seriesId || ni.seriesId || null) !== sid || sigOf(n) !== sigOf(e)) break;
        last = ni;
        j++;
      }
      rows.push({ time: formatClock(e.start), start: e.start, title: it.seriesTitle || it.title || '', sub: episodeSpan(it, last), badges: badgesOf(e), kind: 'program' });
      i = j;
      continue;
    }
    const d = describe(scheduler, e);
    rows.push({ time: formatClock(e.start), start: e.start, title: d.title || '–', sub: '', badges: badgesOf(e), kind: 'program' });
    i++;
  }
  return rows;
}

/** Tipp aus einem Planeintrag (bei Folgen: Serientitel + Folgenspanne der unmittelbar folgenden gleichen Serie). */
function makeTip(ctx, ch, list, idx, kindLabel, overviews) {
  const { scheduler, formatClock } = ctx;
  const e = list[idx];
  const d = describe(scheduler, e);
  const it = e.itemId ? scheduler.item(e.itemId) : null;
  const isEp = it && it.kind === 'episode';
  let title = d.title;
  let sub = '';
  let imageId = e.itemId || null;
  if (isEp) {
    const sid = e.seriesId || it.seriesId || null;
    let last = it;
    for (let j = idx + 1; j < list.length; j++) {
      const n = list[j];
      if (n.type === 'filler') continue;
      const ni = n.type === 'program' && n.itemId ? scheduler.item(n.itemId) : null;
      if (!ni || ni.kind !== 'episode' || (n.seriesId || ni.seriesId || null) !== sid) break;
      last = ni;
    }
    title = it.seriesTitle || it.title || '';
    const span = episodeSpan(it, last);
    sub = it === last && it.title && it.title !== title ? [span, it.title].filter(Boolean).join(' · ') : span;
    imageId = sid || e.itemId;
  }
  if (e.theme) sub = [e.theme, sub].filter(Boolean).join(' · ');
  const age = e.age != null ? e.age : it && it.age != null ? it.age : null;
  return {
    imageId,
    itemId: e.itemId || null,
    title,
    sub,
    year: d.year,
    genres: d.genres,
    runMin: d.runMin,
    channelNo: ch.no,
    channelName: ch.name,
    time: formatClock(e.start),
    start: e.start,
    badges: badgesOf(e),
    age,
    overview: (overviews && e.itemId && overviews.get(e.itemId)) || null,
    kindLabel: kindLabel || (isEp ? 'Serie' : 'Film'),
  };
}

function dayTips(ctx, D, chans, overviews) {
  const { scheduler, dayBounds } = ctx;
  const b = dayBounds(D);
  const chOf = (no) => chans.find((c) => c.no === no);
  const plan = (no) => scheduler.planDay(no, D);
  const tips = [];
  // Film um 20:15 auf Kino (1) und Klassik (2)
  for (const no of [1, 2]) {
    const ch = chOf(no);
    if (!ch) continue;
    const list = plan(no);
    let idx = list.findIndex((e) => e.type === 'program' && e.itemId && e.start === b.a2015);
    if (idx < 0) idx = list.findIndex((e) => e.type === 'program' && e.itemId && e.start >= b.a2015);
    if (idx >= 0) tips.push(makeTip(ctx, ch, list, idx, null, overviews));
  }
  // Premiere des Abends auf 17
  const ch17 = chOf(17);
  if (ch17) {
    const list = plan(17);
    const idx = list.findIndex((e) => e.type === 'program' && e.itemId && e.premiere);
    if (idx >= 0) tips.push(makeTip(ctx, ch17, list, idx, 'Premiere', overviews));
  }
  // Thementag auf 18
  let theme = null;
  const ch18 = chOf(18);
  if (ch18) {
    const list = plan(18);
    const first = list.find((e) => e.theme);
    theme = first ? first.theme : null;
    const idx = list.findIndex((e) => e.type === 'program' && e.itemId && e.theme);
    if (idx >= 0) tips.push(makeTip(ctx, ch18, list, idx, 'Thementag', overviews));
  }
  // Marathon auf 4: Serie des Tages = Serie mit den meisten Programm-Einträgen (Gleichstand: die früher beginnende)
  const ch4 = chOf(4);
  if (ch4) {
    const list = plan(4);
    const count = new Map();
    list.forEach((e, i) => {
      if (e.type !== 'program' || !e.itemId) return;
      const it = scheduler.item(e.itemId);
      const key = it && it.kind === 'episode' ? e.seriesId || it.seriesId : e.itemId;
      const c = count.get(key);
      if (c) c.n++;
      else count.set(key, { n: 1, i });
    });
    let best = null;
    for (const c of count.values()) if (!best || c.n > best.n || (c.n === best.n && c.i < best.i)) best = c;
    if (best) tips.push(makeTip(ctx, ch4, list, best.i, 'Marathon', overviews));
  }
  return { tips: tips.slice(0, 5), theme };
}

function rangeText(D0, D1) {
  const a = new Date(D0 * 864e5);
  const b = new Date(D1 * 864e5);
  const [da, ma, ya] = [a.getUTCDate(), a.getUTCMonth() + 1, a.getUTCFullYear()];
  const [db, mb, yb] = [b.getUTCDate(), b.getUTCMonth() + 1, b.getUTCFullYear()];
  if (ya !== yb) return da + '.' + ma + '.' + ya + '–' + db + '.' + mb + '.' + yb;
  if (ma !== mb) return da + '.' + ma + '.–' + db + '.' + mb + '.' + yb;
  return da + '.–' + db + '.' + mb + '.' + yb;
}

const p2 = (n) => (n < 10 ? '0' : '') + n;

/** buildMagazine({ scheduler, today, formatClock, formatDay, dayBounds, overviews? }) → Magazine */
export function buildMagazine(ctx) {
  const { scheduler, today: D0, formatDay, formatClock, dayBounds } = ctx;
  const overviews = ctx.overviews instanceof Map ? ctx.overviews : null;
  const c = { scheduler, formatClock, dayBounds, formatDay };
  const days = [];
  const pages = [{ kind: 'cover', no: 1 }];
  const teasers = [];
  let premiereTip = null;
  let kinoTip = null;
  for (let i = 0; i < DAYS; i++) {
    const D = D0 + i;
    const fd = formatDay(D);
    days.push({ D, weekday: fd.weekday, date: fd.date });
    const chans = scheduler.channels(D);
    const { tips, theme } = dayTips(c, D, chans, overviews);
    if (theme) teasers.push({ D, weekday: fd.weekday, label: theme });
    if (!premiereTip) premiereTip = tips.find((t) => t.kindLabel === 'Premiere') || null;
    if (i === 0) kinoTip = tips.find((t) => t.channelNo === 1) || null;
    const b = dayBounds(D);
    const head = { D, weekday: fd.weekday, date: fd.date };
    pages.push({ kind: 'tips', no: pages.length + 1, ...head, tips, theme });
    pages.push({
      kind: 'evening',
      no: pages.length + 1,
      ...head,
      channels: chans.map((ch) => ({
        no: ch.no,
        name: ch.name,
        rows: buildRows(scheduler, formatClock, scheduler.planDay(ch.no, D).filter((e) => e.end > b.a2015)),
      })),
    });
    for (const part of [1, 2]) {
      const sel = chans.filter((ch) => (part === 1 ? ch.no <= 9 : ch.no >= 10));
      pages.push({
        kind: 'day',
        no: pages.length + 1,
        part,
        ...head,
        channels: sel.map((ch) => {
          const plan = scheduler.planDay(ch.no, D);
          const th = plan.find((e) => e.theme);
          return { no: ch.no, name: ch.name, theme: th ? th.theme : null, rows: buildRows(scheduler, formatClock, plan) };
        }),
      });
    }
  }
  pages.push({ kind: 'back', no: pages.length + 1 });

  const hero = premiereTip || kinoTip;
  const d0 = new Date(D0 * 864e5);
  return {
    title: 'LIVE Programm',
    subtitle: 'Die Fernsehwoche · ' + rangeText(D0, D0 + DAYS - 1),
    fileName: 'LIVE-Programm_' + d0.getUTCFullYear() + '-' + p2(d0.getUTCMonth() + 1) + '-' + p2(d0.getUTCDate()) + '.pdf',
    days,
    cover: { hero: hero ? { ...hero } : null, teasers },
    pages,
  };
}

/** Item-IDs aller Tipps und des Titelseiten-Heros (eindeutig, in Heftreihenfolge). */
export function collectTipIds(magazine) {
  const seen = new Set();
  const add = (t) => { if (t && t.itemId) seen.add(t.itemId); };
  if (!magazine) return [];
  add(magazine.cover && magazine.cover.hero);
  for (const p of magazine.pages || []) if (p.kind === 'tips') for (const t of p.tips || []) add(t);
  return [...seen];
}

/** Kürzt auf ~240 Zeichen an einer Satzgrenze (sonst Wortgrenze + „…“). */
function shorten(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= OVERVIEW_MAX) return s;
  const cut = s.slice(0, OVERVIEW_MAX);
  let end = -1;
  const re = /[.!?…](?=\s|$)/g;
  let m;
  while ((m = re.exec(cut))) end = m.index;
  if (end >= 80) return cut.slice(0, end + 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > 40 ? cut.slice(0, sp) : cut).replace(/[\s,;:–-]+$/, '') + '…';
}

/** loadOverviews(ids, itemDetails) → Promise<Map<id, string>>; eine Anfrage, Fehler → leere Map. */
export async function loadOverviews(ids, itemDetails) {
  const out = new Map();
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!list.length || typeof itemDetails !== 'function') return out;
  try {
    const res = await itemDetails(list);
    const entries = res instanceof Map ? [...res.entries()] : res && typeof res === 'object' ? Object.entries(res) : [];
    for (const [id, v] of entries) {
      const raw = typeof v === 'string' ? v : v && v.overview;
      const t = raw ? shorten(raw) : '';
      if (t) out.set(id, t);
    }
  } catch {
    return new Map();
  }
  return out;
}

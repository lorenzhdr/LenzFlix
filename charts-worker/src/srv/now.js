import { normId } from '../jellyfin.js';
import { deviceKind } from './device.js';

/**
 * „Jetzt“: laufende Wiedergaben aller Konten, anonymisiert.
 * Roh-/Sessions wird je Isolate gemeinsam gecacht und sofort auf eine interne Liste ohne
 * Konto-, Geräte- und Sitzungsdaten reduziert. Die Ausgabe entsteht nur per Whitelist.
 */
const TIMEOUT_MS = 8000;
const RAW_TTL_MS = 10_000;
const FAIL_TTL_MS = 5000;
const MAX_TEXT = 512 * 1024;
const VIS_TTL_MS = 60_000;
const VIS_CAP = 200;
const CHUNK = 100;
const BR_TTL_MS = 3_600_000;
const BR_CAP = 500;
const BR_MAX_FETCH = 5;
const TICKS = 10_000_000;

const base = (env) => String(env.JELLYFIN_URL).replace(/\/+$/, '');
const auth = (token) => `MediaBrowser Token="${token}"`;

let raw = null; // { at, list | null }  (list null = Fehlschlag)
let inflight = null;
const vis = new Map(); // `${uid}|${ids}` -> { at, set }
const brCache = new Map(); // itemId -> { at, mbps }

export function clearNowCache() {
  raw = null;
  inflight = null;
  vis.clear();
  brCache.clear();
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const mbpsOf = (bps) => {
  const n = num(bps);
  return n !== null && n > 0 ? Math.round(n / 1e5) / 10 : null;
};
const str = (v) => (typeof v === 'string' && v ? v : '');

/** Eine Sitzung -> interner Eintrag (oder null ohne Wiedergabe). Alles andere wird verworfen. */
function reduce(s) {
  const it = s?.NowPlayingItem;
  if (!it || typeof it !== 'object') return null;
  const ps = s.PlayState && typeof s.PlayState === 'object' ? s.PlayState : {};
  const streams = Array.isArray(it.MediaStreams) ? it.MediaStreams : [];
  const ti = s.TranscodingInfo && typeof s.TranscodingInfo === 'object' ? s.TranscodingInfo : null;
  const method = str(ps.PlayMethod);

  let bps = null;
  if (method === 'Transcode' && ti) bps = num(ti.Bitrate);
  if (!(bps > 0)) {
    const video = streams.find((x) => x?.Type === 'Video' && num(x.BitRate) > 0);
    const audios = streams.filter((x) => x?.Type === 'Audio');
    const ai = num(ps.AudioStreamIndex);
    const audio = (ai !== null && audios.find((x) => num(x.Index) === ai)) || audios[0];
    const v = video ? num(video.BitRate) : 0;
    const a = audio && num(audio.BitRate) > 0 ? num(audio.BitRate) : 0;
    bps = v + a > 0 ? v + a : null;
  }

  const type = it.Type === 'Movie' ? 'movie' : it.Type === 'Episode' ? 'episode' : 'other';
  const ticks = num(ps.PositionTicks);
  const rt = num(it.RunTimeTicks);
  const primary = str(it.ImageTags?.Primary);
  return {
    uid: normId(s.UserId),
    id: normId(it.Id),
    t: type,
    name: str(it.Name),
    seriesName: str(it.SeriesName),
    seriesId: normId(it.SeriesId),
    s: num(it.ParentIndexNumber),
    e: num(it.IndexNumber),
    pos: ticks !== null && ticks > 0 ? Math.round(ticks / TICKS) : 0,
    dur: rt !== null && rt > 0 ? Math.round(rt / TICKS) : 0,
    paused: ps.IsPaused === true,
    tc: method === 'Transcode' && !(ti && ti.IsVideoDirect === true && ti.IsAudioDirect === true),
    mbps: mbpsOf(bps),
    primary,
    seriesTag: str(it.SeriesPrimaryImageTag),
    dev: deviceKind(s.Client, s.DeviceName),
  };
}

async function fetchRaw(env) {
  try {
    const res = await fetch(`${base(env)}/Sessions?ActiveWithinSeconds=960`, {
      headers: { Authorization: auth(env.JELLYFIN_API_KEY) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error('http');
    const text = await res.text();
    if (text.length > MAX_TEXT) throw new Error('big');
    const json = JSON.parse(text);
    if (!Array.isArray(json)) throw new Error('shape');
    return { at: Date.now(), list: json.map(reduce).filter(Boolean) };
  } catch {
    console.error('srv: sessions');
    return { at: Date.now(), list: null };
  }
}

async function getRaw(env) {
  const now = Date.now();
  if (raw && now - raw.at < (raw.list ? RAW_TTL_MS : FAIL_TTL_MS)) return raw;
  if (!inflight) {
    inflight = fetchRaw(env)
      .then((r) => {
        raw = r;
        return r;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Sichtbare Item-IDs für den Betrachter (Token des Betrachters). Wirft bei Fehler. */
async function visibleIds(env, token, uid, ids) {
  const key = `${uid}|${ids.join(',')}`;
  const now = Date.now();
  const hit = vis.get(key);
  if (hit && now - hit.at < VIS_TTL_MS) return hit.set;
  const set = new Set();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const res = await fetch(`${base(env)}/Items?Ids=${part.join(',')}&EnableImages=false`, {
      headers: { Authorization: auth(token) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error('http');
    const data = await res.json();
    if (!data || !Array.isArray(data.Items)) throw new Error('shape');
    for (const x of data.Items) if (x?.Id) set.add(normId(x.Id));
  }
  if (vis.size >= VIS_CAP) {
    for (const [k, v] of vis) if (now - v.at >= VIS_TTL_MS) vis.delete(k);
    while (vis.size >= VIS_CAP) vis.delete(vis.keys().next().value);
  }
  vis.set(key, { at: now, set });
  return set;
}

/** Rückfall für fehlende Bitrate: MediaSources[0].Bitrate, 1 h je Item, höchstens 5 Abrufe je Anfrage. */
async function fillBitrates(env, list) {
  const now = Date.now();
  const need = [];
  for (const r of list) {
    if (r.mbps !== null || !r.id) continue;
    const c = brCache.get(r.id);
    if (c && now - c.at < BR_TTL_MS) r.mbps = c.mbps;
    else if (!need.includes(r.id)) need.push(r.id);
  }
  await Promise.all(
    need.slice(0, BR_MAX_FETCH).map(async (id) => {
      let mbps = null;
      try {
        const res = await fetch(`${base(env)}/Items?Ids=${id}&Fields=MediaSources&EnableImages=false`, {
          headers: { Authorization: auth(env.JELLYFIN_API_KEY) },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.ok) {
          const data = await res.json();
          const it = Array.isArray(data?.Items) ? data.Items[0] : null;
          mbps = mbpsOf(it?.MediaSources?.[0]?.Bitrate);
        }
      } catch {
        console.error('srv: bitrate');
      }
      if (brCache.size >= BR_CAP) brCache.delete(brCache.keys().next().value);
      brCache.set(id, { at: now, mbps });
      for (const r of list) if (r.id === id && r.mbps === null) r.mbps = mbps;
    }),
  );
}

const p2 = (r) => (r.dur > 0 ? Math.round(Math.min(1, Math.max(0, r.pos / r.dur)) * 100) / 100 : 0);

function visibleRow(r, me) {
  const ep = r.t === 'episode';
  const out = { id: r.id, t: r.t, title: ep ? r.seriesName || r.name : r.name };
  if (ep) {
    if (r.name) out.ep = r.name;
    if (r.s !== null) out.s = r.s;
    if (r.e !== null) out.e = r.e;
  }
  if (ep && r.seriesId && r.seriesTag) out.img = { id: r.seriesId, tag: r.seriesTag };
  else if (r.id && r.primary) out.img = { id: r.id, tag: r.primary };
  out.pos = r.pos;
  out.dur = r.dur;
  out.paused = r.paused ? 1 : 0;
  out.tc = r.tc ? 1 : 0;
  out.mbps = r.mbps;
  out.dev = r.dev;
  if (me) out.me = 1;
  return out;
}

function hiddenRow(r) {
  return { hidden: 1, p: p2(r), paused: r.paused ? 1 : 0, tc: r.tc ? 1 : 0, mbps: r.mbps, dev: r.dev };
}

/** user = {uid,name,admin}, token = Token des Betrachters. Wirft nie. */
export async function getNow(env, ctx, user, token) {
  try {
    const r = await getRaw(env);
    if (!r.list) return { v: 1, down: 1 };
    const list = r.list.map((x) => ({ ...x }));
    await fillBitrates(env, list);

    const me = normId(user?.uid);
    const foreign = [...new Set(list.filter((x) => x.uid !== me && x.id).map((x) => x.id))].sort();
    let visible = null;
    if (foreign.length) {
      try {
        visible = await visibleIds(env, token, me, foreign);
      } catch {
        console.error('srv: visibility');
        visible = new Set(); // fail-closed
      }
    }

    const mine = [];
    const shown = [];
    const hidden = [];
    for (const x of list) {
      if (me && x.uid === me) mine.push(x);
      else if (x.id && visible?.has(x.id)) shown.push(x);
      else hidden.push(x);
    }
    const byTitle = (a, b) => a.title.localeCompare(b.title, 'de');
    const rows = [
      ...mine.map((x) => visibleRow(x, true)).sort(byTitle),
      ...shown.map((x) => visibleRow(x, false)).sort(byTitle),
      ...hidden.map((x) => ({ x, p: p2(x) })).sort((a, b) => b.p - a.p).map((o) => hiddenRow(o.x)),
    ];
    const sum = list.reduce((a, x) => a + (x.mbps || 0), 0);
    return { v: 1, n: rows.length, mbps: Math.round(sum * 10) / 10, rows };
  } catch {
    console.error('srv: now');
    return { v: 1, down: 1 };
  }
}

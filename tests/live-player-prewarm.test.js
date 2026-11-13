// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPlayer } from '../src/js/live/player/index.js';
import { parseMaster, parseMedia, pickSegment, resourceStats } from '../src/js/live/player/warm.js';
import { makeVideo, makeDeps, ms, info, fire, flush, SECRET } from './live-player-helpers.js';

const players = [];
afterEach(() => { for (const p of players.splice(0)) p.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); });

const SEGS = 6; // 6 Segmente à 6 s
const MASTER = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000,CODECS="avc1"\nmain.m3u8?PlaySessionId=SID&ApiKey=' + SECRET + '\n';
const variant = (sid) => '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MAP:URI="hls1/main/-1.mp4?PlaySessionId=' + sid + '"\n'
  + Array.from({ length: SEGS }, (_, i) => `#EXTINF:6.0,\nhls1/main/${i}.mp4?PlaySessionId=${sid}`).join('\n') + '\n#EXT-X-ENDLIST\n';

/** Antwort mit Textkörper und Stream-Reader; aborts protokolliert die Signale. */
function makeFetch({ failSeg = false } = {}) {
  const calls = [];
  const fn = vi.fn(async (url, o = {}) => {
    const u = new URL(url);
    const sid = u.searchParams.get('PlaySessionId') || '';
    const rec = { path: u.pathname, sid, signal: o.signal, chunks: 0 };
    calls.push(rec);
    const text = u.pathname.endsWith('master.m3u8') ? MASTER.replace('SID', sid) : u.pathname.endsWith('main.m3u8') ? variant(sid) : '';
    const isSeg = /hls1\/main\/\d+\.mp4$/.test(u.pathname);
    return {
      ok: !(isSeg && failSeg),
      text: async () => text,
      arrayBuffer: async () => new ArrayBuffer(8),
      body: { getReader: () => ({ read: async () => { rec.chunks++; return { done: false, value: new Uint8Array(4) }; } }) },
    };
  });
  return { fn, calls };
}

const itemPath = (p) => /Items\/([^/]+)\/PlaybackInfo/.exec(p)[1];

/** respond: je Item eigene PlaySessionId (psid-<item>); HLS-Remux. */
function setup({ warmOn = true, direct = [], fetchOpts, hevc = false, storage } = {}) {
  const log = [];
  const f = makeFetch(fetchOpts);
  const respond = (method, path) => {
    const id = itemPath(path);
    const sid = `ps-${id}`;
    if (direct.includes(id)) return info(ms({ id: 'msd' }), { PlaySessionId: sid });
    return info(ms({ direct: false, transcodingUrl: `/videos/${id}/master.m3u8?MediaSourceId=ms1&PlaySessionId=${sid}&ApiKey=${SECRET}` }), { PlaySessionId: sid });
  };
  const video = makeVideo({ log, hevc });
  const deps = makeDeps({ respond, log });
  deps.fetch = f.fn;
  if (storage) deps.storage = storage;
  if (warmOn) deps.zapWarm = true;
  const clock = { t: 5000000 };
  const player = createPlayer({ video, deps, now: () => clock.t });
  players.push(player);
  const pbi = () => deps.request.mock.calls.filter((c) => c[0] === 'POST' && /PlaybackInfo/.test(c[1])).length;
  const deletes = () => deps.request.mock.calls.filter((c) => c[0] === 'DELETE').map((c) => c[2].params);
  return { player, deps, video, f, clock, log, pbi, deletes };
}

describe('Hilfen (warm.js)', () => {
  it('parseMaster/parseMedia lösen relative URLs auf und kumulieren Dauern', () => {
    const base = 'http://srv:8096/videos/it1/master.m3u8?x=1';
    expect(parseMaster(MASTER.replace('SID', 'p'), base)).toBe(`http://srv:8096/videos/it1/main.m3u8?PlaySessionId=p&ApiKey=${SECRET}`);
    expect(parseMaster('#EXTM3U\n#EXTINF:6,\na.ts\n', base)).toBeNull();
    const m = parseMedia(variant('p'), 'http://srv:8096/videos/it1/main.m3u8');
    expect(m.init).toBe('http://srv:8096/videos/it1/hls1/main/-1.mp4?PlaySessionId=p');
    expect(m.segments).toHaveLength(SEGS);
    expect(m.segments[2]).toMatchObject({ start: 12, dur: 6, url: 'http://srv:8096/videos/it1/hls1/main/2.mp4?PlaySessionId=p' });
  });
  it('pickSegment: deckt den Offset ab, klemmt an den Rändern', () => {
    const { segments } = parseMedia(variant('p'), 'http://srv/x/main.m3u8');
    expect(pickSegment(segments, 0).start).toBe(0);
    expect(pickSegment(segments, 5.9).start).toBe(0);
    expect(pickSegment(segments, 6).start).toBe(6);
    expect(pickSegment(segments, 14).start).toBe(12);
    expect(pickSegment(segments, 9999).start).toBe(30);
    expect(pickSegment([], 3)).toBeNull();
  });
  it('resourceStats zählt nur Einträge ab src und gibt nie Namen heraus', () => {
    const perf = { getEntriesByType: () => [
      { name: 'http://a/videos/x/master.m3u8?ApiKey=SECRET', startTime: 50, responseStart: 60 },
      { name: 'http://a/videos/x/main.m3u8?ApiKey=SECRET', startTime: 110, responseStart: 120 },
      { name: 'http://a/videos/x/hls1/main/3.mp4?ApiKey=SECRET', startTime: 130, responseStart: 400 },
      { name: 'http://a/Items/1/Images/Primary', startTime: 140, responseStart: 150 },
    ] };
    const r = resourceStats(perf, 100);
    expect(r).toEqual({ n: 2, firstSegMs: 300 });
    expect(JSON.stringify(r)).not.toMatch(/SECRET|http/);
    expect(resourceStats({ getEntriesByType: () => [] }, 0)).toBeNull();
    expect(resourceStats({}, 0)).toBeNull();
  });
});

describe('prewarm', () => {
  it('ohne zapWarm: kein fetch, kein PlaybackInfo, kein DELETE', async () => {
    const c = setup({ warmOn: false });
    await c.player.prewarm('it1', 5000);
    expect(c.f.fn).not.toHaveBeenCalled();
    expect(c.deps.request).not.toHaveBeenCalled();
    await c.player.prewarm(null, 0);
    expect(c.f.fn).not.toHaveBeenCalled();
  });

  it('HLS: master → Variante → Init → Zielsegment (Auswahl nach Offset), Segment nach erstem Chunk abgebrochen', async () => {
    const c = setup();
    const res = await c.player.prewarm('it1', 14000);
    expect(res).toMatchObject({ ok: true, mode: 'hls' });
    expect(c.f.calls.map((x) => x.path)).toEqual([
      '/videos/it1/master.m3u8', '/videos/it1/main.m3u8', '/videos/it1/hls1/main/-1.mp4', '/videos/it1/hls1/main/2.mp4',
    ]);
    const seg = c.f.calls[3];
    expect(seg.chunks).toBe(1);
    expect(seg.signal.aborted).toBe(true);
    expect(c.f.calls[0].signal.aborted).toBe(false);
    expect(c.pbi()).toBe(1);
    expect(c.deletes()).toEqual([]);
  });

  it('Direct: kein m3u8-Abruf', async () => {
    const c = setup({ direct: ['it1'] });
    const res = await c.player.prewarm('it1', 1000);
    expect(res).toMatchObject({ ok: true, mode: 'direct' });
    expect(c.f.fn).not.toHaveBeenCalled();
  });

  it('wartet auf eine laufende Vorauflösung und überspringt Direct-Treffer ohne zweites PlaybackInfo', async () => {
    const c = setup({ direct: ['it1'] });
    const pf = c.player.prefetch('it1');
    await c.player.prewarm('it1', 0);
    await pf;
    expect(c.pbi()).toBe(1);
    expect(c.f.fn).not.toHaveBeenCalled();
  });

  it('play übernimmt den Eintrag einmal: gleiche PlaySessionId, kein zweites PlaybackInfo, kein DELETE; Messung warm.used', async () => {
    const c = setup();
    await c.player.prewarm('it1', 14000);
    c.clock.t += 12000;
    const p = c.player.play({ itemId: 'it1', offsetMs: 26000 });
    await flush();
    expect(c.pbi()).toBe(1);
    expect(c.video.getAttribute('src')).toContain('PlaySessionId=ps-it1');
    fire(c.video, 'loadedmetadata');
    fire(c.video, 'playing');
    const res = await p;
    expect(res.ok).toBe(true);
    expect(res.timing.warm).toMatchObject({ on: true, used: true, ageMs: 12000 });
    expect(res.timing.warm.playlistMs).not.toBeNull();
    expect(res.timing.warm.segFirstByteMs).not.toBeNull();
    expect(c.deletes()).toEqual([]);
    // zweiter Start desselben Items: Eintrag ist verbraucht → neues PlaybackInfo
    const p2 = c.player.play({ itemId: 'it1', offsetMs: 30000 });
    await flush();
    expect(c.pbi()).toBe(2);
    fire(c.video, 'loadedmetadata');
    fire(c.video, 'playing');
    expect((await p2).timing.warm).toMatchObject({ on: true, used: false });
  });

  it('ohne Schalter meldet timing.warm nur { on: false }; keine URL/Token in der Messung', async () => {
    const off = setup({ warmOn: false });
    const p = off.player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    fire(off.video, 'loadedmetadata');
    fire(off.video, 'playing');
    expect((await p).timing.warm).toEqual({ on: false });

    const on = setup();
    await on.player.prewarm('it1', 0);
    const p2 = on.player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    fire(on.video, 'loadedmetadata');
    fire(on.video, 'playing');
    const t = (await p2).timing;
    const json = JSON.stringify(t);
    expect(json).not.toContain(SECRET);
    expect(json).not.toMatch(/https?:|m3u8|master/);
  });

  it('Verdrängung: ein dritter Eintrag beendet den ältesten per DELETE ActiveEncodings (richtige playSessionId)', async () => {
    const c = setup();
    await c.player.prewarm('a', 0);
    c.clock.t += 1000;
    await c.player.prewarm('b', 0);
    c.clock.t += 1000;
    await c.player.prewarm('c', 0);
    expect(c.deletes()).toEqual([{ deviceId: 'dev1', playSessionId: 'ps-a' }]);
  });

  it('Verfall nach 40 s: DELETE per Zeitgeber; ein veralteter Eintrag wird nicht übernommen', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
    const log = [];
    const f = makeFetch();
    const deps = makeDeps({ respond: (m, p) => info(ms({ direct: false, transcodingUrl: `/videos/${itemPath(p)}/master.m3u8?PlaySessionId=ps-${itemPath(p)}&ApiKey=${SECRET}` }), { PlaySessionId: `ps-${itemPath(p)}` }), log });
    deps.fetch = f.fn;
    deps.zapWarm = true;
    const player = createPlayer({ video: makeVideo({ log }), deps });
    players.push(player);
    await player.prewarm('x', 0);
    await vi.advanceTimersByTimeAsync(39000);
    expect(deps.request.mock.calls.filter((c) => c[0] === 'DELETE')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(deps.request.mock.calls.filter((c) => c[0] === 'DELETE').map((c) => c[2].params)).toEqual([{ deviceId: 'dev1', playSessionId: 'ps-x' }]);
  });

  it('veralteter Eintrag (ohne Zeitgeber-Lauf) wird bei play verworfen und beendet', async () => {
    const c = setup();
    await c.player.prewarm('it1', 0);
    c.clock.t += 41000;
    const p = c.player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    expect(c.pbi()).toBe(2);
    expect(c.deletes()).toEqual([{ deviceId: 'dev1', playSessionId: 'ps-it1' }]);
    fire(c.video, 'loadedmetadata');
    fire(c.video, 'playing');
    expect((await p).timing.warm.used).toBe(false);
  });

  it('dispose beendet alle Einträge und bricht laufende Abrufe ab', async () => {
    const c = setup();
    await c.player.prewarm('a', 0);
    await c.player.prewarm('b', 0);
    c.player.dispose();
    const d = c.deletes();
    expect(d).toHaveLength(2);
    expect(d.map((x) => x.playSessionId).sort()).toEqual(['ps-a', 'ps-b']);
    const n = c.f.fn.mock.calls.length;
    expect(await c.player.prewarm('c', 0)).toMatchObject({ ok: false });
    expect(c.f.fn.mock.calls.length).toBe(n);
  });

  it('dispose mitten im Abruf: Signal abgebrochen, Sitzung beendet', async () => {
    const c = setup();
    const sigs = [];
    c.f.fn.mockImplementation((url, o) => new Promise((resolve, reject) => {
      sigs.push(o.signal);
      o.signal.addEventListener('abort', () => reject(new Error('abort')));
    }));
    const p = c.player.prewarm('a', 0);
    await flush(3);
    expect(sigs).toHaveLength(1);
    expect(sigs[0].aborted).toBe(false);
    c.player.dispose();
    expect(sigs[0].aborted).toBe(true);
    expect(await p).toMatchObject({ ok: false });
    await flush();
    expect(c.deletes()).toEqual([{ deviceId: 'dev1', playSessionId: 'ps-a' }]);
  });

  it('Auffrischen: kein neues PlaybackInfo, nur erster Byte des neuen Segments; at wird erneuert; max. 10', async () => {
    const c = setup();
    await c.player.prewarm('it1', 0);
    const n0 = c.f.fn.mock.calls.length;
    c.clock.t += 35000;
    const r = await c.player.prewarm('it1', 20000);
    expect(r).toMatchObject({ ok: true, refreshed: true });
    expect(c.pbi()).toBe(1);
    expect(c.f.fn.mock.calls.length).toBe(n0 + 1);
    const last = c.f.calls[c.f.calls.length - 1];
    expect(last.path).toBe('/videos/it1/hls1/main/3.mp4');
    expect(last.signal.aborted).toBe(true);
    // 35 s später ist der Eintrag dank Auffrischen noch frisch (insgesamt 70 s alt) → Übernahme
    for (let i = 0; i < 9; i++) { c.clock.t += 35000; await c.player.prewarm('it1', 20000 + i * 1000); }
    const n1 = c.f.fn.mock.calls.length;
    c.clock.t += 35000;
    expect(await c.player.prewarm('it1', 0)).toMatchObject({ skipped: true }); // 11. Auffrischung entfällt
    expect(c.f.fn.mock.calls.length).toBe(n1);
    expect(c.pbi()).toBe(1);
  });

  it('Auffrischen mit Serverfehler am Segment verwirft den Eintrag (DELETE)', async () => {
    const c = setup();
    await c.player.prewarm('it1', 0);
    c.f.fn.mockImplementationOnce(async () => ({ ok: false, body: null }));
    c.clock.t += 30000;
    await c.player.prewarm('it1', 0);
    expect(c.deletes()).toEqual([{ deviceId: 'dev1', playSessionId: 'ps-it1' }]);
  });

  it('Umschalten während des Vorwärmens (PlaybackInfo da): Sitzung übernehmen, Abrufe abbrechen, nicht löschen; used + partial', async () => {
    const c = setup();
    const sigs = [];
    c.f.fn.mockImplementation((url, o) => new Promise((resolve, reject) => {
      sigs.push(o.signal);
      o.signal.addEventListener('abort', () => reject(new Error('abort')));
    }));
    const pw = c.player.prewarm('it1', 0);
    await flush(3);
    expect(sigs).toHaveLength(1);
    const p = c.player.play({ itemId: 'it1', offsetMs: 1000 });
    await flush();
    expect(sigs[0].aborted).toBe(true);
    expect(c.pbi()).toBe(1);
    expect(c.video.getAttribute('src')).toContain('PlaySessionId=ps-it1');
    fire(c.video, 'loadedmetadata');
    fire(c.video, 'playing');
    const res = await p;
    await pw;
    await flush();
    expect(c.deletes()).toEqual([]);
    expect(res.timing.warm).toMatchObject({ on: true, used: true, partial: true, playlistMs: null, initMs: null, segFirstByteMs: null, started: 1, done: 0 });
    expect(JSON.stringify(res.timing)).not.toContain(SECRET);
  });

  it('Teilmessung enthält die bis dahin gemessenen Zeiten', async () => {
    const c = setup();
    let hold;
    c.f.fn.mockImplementation(async (url, o) => {
      const path = new URL(url).pathname;
      if (path.endsWith('master.m3u8')) return { ok: true, text: async () => MASTER.replace('SID', 'ps-it1') };
      if (path.endsWith('main.m3u8')) return { ok: true, text: async () => variant('ps-it1') };
      return new Promise((resolve, reject) => { hold = o.signal; o.signal.addEventListener('abort', () => reject(new Error('abort'))); });
    });
    const pw = c.player.prewarm('it1', 0);
    await flush(4);
    expect(hold).toBeTruthy(); // hängt am Init
    const p = c.player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    fire(c.video, 'loadedmetadata');
    fire(c.video, 'playing');
    const w = (await p).timing.warm;
    await pw;
    expect(w).toMatchObject({ used: true, partial: true, initMs: null, segFirstByteMs: null });
    expect(w.playlistMs).not.toBeNull();
    expect(c.deletes()).toEqual([]);
  });

  it('Umschalten, bevor PlaybackInfo da ist: Vorwärmen wird abgebrochen, normal aufgelöst, genutzt nein', async () => {
    const log = [];
    const f = makeFetch();
    let release;
    let first = true;
    const deps = makeDeps({
      log,
      respond: () => {
        const r = info(ms({ direct: false, transcodingUrl: `/videos/it1/master.m3u8?PlaySessionId=ps-it1&ApiKey=${SECRET}` }), { PlaySessionId: 'ps-it1' });
        if (first) { first = false; return new Promise((res) => { release = () => res(r); }); }
        return r;
      },
    });
    deps.fetch = f.fn;
    deps.zapWarm = true;
    const video = makeVideo({ log });
    const player = createPlayer({ video, deps });
    players.push(player);
    const pw = player.prewarm('it1', 0);
    await flush(2);
    const p = player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    release();
    await flush();
    fire(video, 'loadedmetadata');
    fire(video, 'playing');
    const res = await p;
    await pw;
    // play wartet auf das laufende PlaybackInfo des Vorwärmens (kein zweites) und übernimmt es teilweise
    expect(res.timing.warm).toMatchObject({ on: true, used: true, partial: true });
    expect(deps.request.mock.calls.filter((x) => x[0] === 'POST' && /PlaybackInfo/.test(x[1]))).toHaveLength(1);
    expect(deps.request.mock.calls.filter((x) => x[0] === 'DELETE')).toEqual([]);
  });

  it('Grund skip: pending bei doppeltem prewarm, direct bei Direct-Item, per warmNote vom Controller', async () => {
    const c = setup({ direct: ['d1'] });
    await c.player.prewarm('d1', 0);
    const run = async (item) => {
      const p = c.player.play({ itemId: item, offsetMs: 0 });
      await flush();
      fire(c.video, 'loadedmetadata');
      fire(c.video, 'playing');
      return (await p).timing.warm;
    };
    expect((await run('d1')).skip).toBe('direct');
    c.player.warmNote('phase');
    expect((await run('x2')).skip).toBe('phase');
    expect((await run('x3')).skip).toBe('keiner'); // Controller-Notiz gilt nur bis zum nächsten Umschalten
    const p1 = c.player.prewarm('h1', 0);
    const p2 = c.player.prewarm('h1', 0);
    await Promise.all([p1, p2]);
    expect((await run('h1')).skip).toBeNull(); // Übernahme: kein Grund
  });

  it('hängender Vorwärm-Vorgang wird nach 25 s abgebrochen (Grund timeout) und die Sitzung beendet', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
    const log = [];
    const deps = makeDeps({ respond: (m, p) => info(ms({ direct: false, transcodingUrl: `/videos/${itemPath(p)}/master.m3u8?PlaySessionId=ps-${itemPath(p)}&ApiKey=${SECRET}` }), { PlaySessionId: `ps-${itemPath(p)}` }), log });
    deps.fetch = vi.fn((url, o) => new Promise((resolve, reject) => { o.signal.addEventListener('abort', () => reject(new Error('abort'))); }));
    deps.zapWarm = true;
    const video = makeVideo({ log });
    const player = createPlayer({ video, deps });
    players.push(player);
    const p = player.prewarm('h', 0);
    await vi.advanceTimersByTimeAsync(24000);
    expect(deps.request.mock.calls.filter((c) => c[0] === 'DELETE')).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    await p;
    expect(deps.request.mock.calls.filter((c) => c[0] === 'DELETE').map((c) => c[2].params)).toEqual([{ deviceId: 'dev1', playSessionId: 'ps-h' }]);
    // Grund 'timeout' steht danach in der Messung
    const pl = player.play({ itemId: 'h', offsetMs: 0 });
    await vi.advanceTimersByTimeAsync(10);
    fire(video, 'loadedmetadata');
    fire(video, 'playing');
    expect((await pl).timing.warm).toMatchObject({ used: false, skip: 'timeout' });
    const pz = player.play({ itemId: 'z', offsetMs: 0 }); // anderer Titel: kein Titelgrund
    await vi.advanceTimersByTimeAsync(10);
    fire(video, 'loadedmetadata');
    fire(video, 'playing');
    expect((await pz).timing.warm).toMatchObject({ used: false, skip: 'keiner' });
  });
});

describe('Vorwärmen: Grund pro Umschalten und fMP4 pro Titel', () => {
  const run = async (c, item) => {
    Object.defineProperty(c.video, 'error', { value: null, configurable: true });
    const p = c.player.play({ itemId: item, offsetMs: 0 });
    await flush();
    fire(c.video, 'loadedmetadata');
    fire(c.video, 'playing');
    return (await p).timing.warm;
  };
  const failF = (c) => {
    Object.defineProperty(c.video, 'error', { value: { code: 4 }, configurable: true });
    fire(c.video, 'error');
  };
  // F scheitert (M4), ts läuft
  const fToT = async (c, item) => {
    Object.defineProperty(c.video, 'error', { value: null, configurable: true });
    const p = c.player.play({ itemId: item, offsetMs: 0 });
    await flush();
    fire(c.video, 'loadedmetadata');
    failF(c);
    await flush();
    Object.defineProperty(c.video, 'error', { value: null, configurable: true });
    fire(c.video, 'loadedmetadata');
    fire(c.video, 'playing');
    return p;
  };
  const containers = (c) => c.deps.request.mock.calls.filter((x) => x[0] === 'POST').map((x) => x[2].body.DeviceProfile.TranscodingProfiles[0].Container);

  it('F-gewärmter Eintrag bleibt nutzbar, wenn bei einem anderen Titel F>T lief', async () => {
    const c = setup({ hevc: true });
    await c.player.prewarm('b', 0);
    expect((await fToT(c, 'a')).ok).toBe(true);
    const w = await run(c, 'b');
    expect(w).toMatchObject({ used: true, skip: null });
  });

  it('Grund kette: Eintrag mit F passt nicht mehr (geräteweiter ts-Modus)', async () => {
    const c = setup({ hevc: true });
    await c.player.prewarm('a', 0);
    await fToT(c, 'b');
    await fToT(c, 'c');
    expect(await run(c, 'a')).toMatchObject({ used: false, skip: 'kette' });
    expect(c.deletes().some((d) => d.playSessionId === 'ps-a')).toBe(true);
  });

  it('Grund alt (TTL), verdrängt (max. 2), fehler (Vorwärmen scheiterte), keiner', async () => {
    const c = setup();
    await c.player.prewarm('a', 0);
    c.clock.t += 41000;
    expect(await run(c, 'a')).toMatchObject({ used: false, skip: 'alt' });

    await c.player.prewarm('v1', 0);
    c.clock.t += 1000;
    await c.player.prewarm('v2', 0);
    c.clock.t += 1000;
    await c.player.prewarm('v3', 0);
    expect(await run(c, 'v1')).toMatchObject({ used: false, skip: 'verdrängt' });

    c.f.fn.mockImplementationOnce(async () => { throw new Error('netz'); });
    await c.player.prewarm('f1', 0);
    expect(await run(c, 'f1')).toMatchObject({ used: false, skip: 'fehler' });

    expect(await run(c, 'nie')).toMatchObject({ used: false, skip: 'keiner' });
  });

  it('Controller-Notiz greift nur ohne Titelgrund und nur einmal', async () => {
    const c = setup();
    await c.player.prewarm('a', 0);
    c.clock.t += 41000;
    c.player.warmNote('phase');
    expect(await run(c, 'a')).toMatchObject({ skip: 'alt' });
    c.player.warmNote('filler');
    expect(await run(c, 'q')).toMatchObject({ skip: 'filler' });
    expect(await run(c, 'r')).toMatchObject({ skip: 'keiner' });
  });

  it('übernommene Vorwärm-Sitzung + F-Fehler (M4, ts läuft): nur Speicher, nicht dauerhaft', async () => {
    const mem = {};
    const storage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; } };
    const c = setup({ hevc: true, storage });
    await c.player.prewarm('a', 0);
    expect((await fToT(c, 'a')).ok).toBe(true);
    expect(mem['lfx-fmp4failed']).toBeUndefined();
    c.deps.request.mockClear();
    const p = c.player.play({ itemId: 'a', offsetMs: 0 });
    await flush();
    expect(containers(c)).toEqual(['ts']); // im Speicher gemerkt: ein PlaybackInfo, gleich ts
    c.player.stop();
    await p;
  });
});


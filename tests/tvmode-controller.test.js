import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeCatalog, createScheduler, dayOfDate, dayBounds } from '../src/js/live/schedule/index.js';
import { createWatchTracker } from '../src/js/live/player/watch.js';
import { createEmitter } from '../src/js/live/player/events.js';
import { createTvController, DEBOUNCE_MS, RETRY_MS } from '../src/js/live/tvmode/controller.js';

const HOUR = 3600000;
const T0 = Date.UTC(2026, 10, 11, 18, 0, 0); // 19:00 MEZ, volle Stunde
const now = () => Date.now();

const programAt = (no, t, extra = {}) => {
  const start = Math.floor(t / HOUR) * HOUR;
  return { start, end: start + HOUR, type: 'program', itemId: `it-${no}-${start}`, ...extra };
};

function makeEnv(over = {}) {
  const entryFor = over.entryFor || ((no, t) => programAt(no, t));
  const channels = Array.from({ length: 18 }, (_, i) => ({ no: i + 1, key: `k${i}`, name: `LIVE ${i + 1}` }));
  const scheduler = {
    channels: () => channels,
    prepare: vi.fn(async () => {}),
    nowOn: vi.fn((no, t) => { const entry = entryFor(no, t); return { entry, offsetMs: t - entry.start, D: 1 }; }),
    item: vi.fn((id) => (over.item ? over.item(id) : { id, kind: 'movie', title: `Titel ${id}` })),
  };
  const em = createEmitter();
  const player = {
    unlock: vi.fn(),
    play: vi.fn(async () => ({ ok: true, mode: 'direct' })),
    playUrl: vi.fn(async () => ({ ok: true, mode: 'direct' })),
    stop: vi.fn(async () => {}),
    syncTo: vi.fn(),
    setVolume: vi.fn(),
    setMuted: vi.fn(),
    volumeSupported: true,
    tracks: vi.fn(() => ({ audio: [], subs: [], audioIndex: 0, subtitleIndex: -1 })),
    setAudio: vi.fn(async () => ({ ok: true, mode: 'direct' })),
    setSubtitle: vi.fn(async () => {}),
    on: em.on,
    dispose: vi.fn(),
    ...(over.player || {}),
  };
  const watch = over.watch === undefined ? { tune: vi.fn(), tick: vi.fn(), leave: vi.fn(), dispose: vi.fn() } : over.watch;
  const pickFiller = over.pickFiller || vi.fn(async () => ({ kind: 'card' }));
  const deps = { savePrefs: vi.fn(), ...(over.deps || {}) };
  const ctl = createTvController({
    scheduler: over.scheduler || scheduler, player, watch, pickFiller, deps, now,
    opts: { lastChannel: 1, volume: 1, muted: false, ...(over.opts || {}) },
  });
  return { ctl, scheduler, player, watch, pickFiller, deps, emit: em.emit };
}

const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
afterEach(() => vi.useRealTimers());

describe('Start und Wiedergabe', () => {
  it('start: unlock synchron, dann play mit Offset aus der Uhr, Snapshot playing', async () => {
    vi.setSystemTime(T0 + 20 * 60000 + 5000);
    const env = makeEnv({ opts: { lastChannel: 7 } });
    const order = [];
    env.player.unlock.mockImplementation(() => order.push('unlock'));
    env.player.play.mockImplementation(async () => { order.push('play'); return { ok: true, mode: 'direct' }; });
    env.ctl.start();
    expect(order[0]).toBe('unlock'); // synchron im Aufruf, vor play
    expect(env.ctl.state().on).toBe(true);
    expect(env.ctl.state().phase).toBe('loading');
    await flush();
    expect(order).toEqual(['unlock', 'play']);
    expect(env.player.play).toHaveBeenCalledWith({ itemId: `it-7-${T0}`, offsetMs: 20 * 60000 + 5000 });
    const s = env.ctl.state();
    expect(s).toMatchObject({ on: true, channel: 7, phase: 'playing', reason: null, card: null, banner: null, needsTap: false, mutedByPolicy: false, volume: 100, muted: false });
    expect(s.entry.itemId).toBe(`it-7-${T0}`);
    expect(Object.isFrozen(s)).toBe(true);
    expect(env.watch.tune).toHaveBeenCalledTimes(1);
    expect(env.deps.savePrefs).toHaveBeenCalledWith({ lastChannel: 7 });
    expect(env.ctl.state()).toBe(s); // zwischengespeichert, solange sich nichts ändert
  });

  it('Standard-Sender 1; ein zweites start() ruft nur unlock', async () => {
    const env = makeEnv({ opts: { lastChannel: 0 } });
    env.ctl.start();
    await flush();
    env.ctl.start();
    await flush();
    expect(env.ctl.state().channel).toBe(1);
    expect(env.player.play).toHaveBeenCalledTimes(1);
    expect(env.player.unlock).toHaveBeenCalledTimes(2);
  });

  it('Sendungsende schaltet mit +30 ms zur nächsten Sendung und verlässt die alte', async () => {
    const env = makeEnv();
    env.ctl.start();
    await flush();
    expect(env.player.play).toHaveBeenCalledTimes(1);
    await flush(HOUR - 100);
    expect(env.player.play).toHaveBeenCalledTimes(1);
    await flush(100);
    expect(env.player.play).toHaveBeenCalledTimes(1); // erst +30 ms nach dem Ende
    await flush(100);
    expect(env.player.play).toHaveBeenCalledTimes(2);
    expect(env.player.play.mock.calls[1][0]).toEqual({ itemId: `it-1-${T0 + HOUR}`, offsetMs: expect.any(Number) });
    expect(env.player.play.mock.calls[1][0].offsetMs).toBeLessThan(1000);
    expect(env.watch.leave).toHaveBeenCalled();
  });

  it('meldet nie Fortschritt (nur player/deps, keine Netzwerk-API)', async () => {
    const env = makeEnv();
    env.ctl.start();
    await flush(5000);
    expect(Object.keys(env.deps)).toEqual(['savePrefs']);
  });
});

describe('Zappen', () => {
  it('Entprellung: mehrere zap() innerhalb 400 ms ergeben genau einen play-Aufruf', async () => {
    const env = makeEnv();
    env.ctl.start();
    await flush();
    env.player.play.mockClear();
    env.player.stop.mockClear();
    env.ctl.zap(1);
    await flush(100);
    env.ctl.zap(1);
    await flush(100);
    env.ctl.zap(1);
    expect(env.ctl.state().channel).toBe(4);
    expect(env.ctl.state().phase).toBe('loading');
    expect(env.ctl.state().entry.itemId).toBe(`it-4-${T0}`); // Vorschau des neuen Senders
    expect(env.player.stop).toHaveBeenCalled();
    await flush(DEBOUNCE_MS - 1);
    expect(env.player.play).not.toHaveBeenCalled();
    await flush(2);
    expect(env.player.play).toHaveBeenCalledTimes(1);
    expect(env.player.play.mock.calls[0][0].itemId).toBe(`it-4-${T0}`);
    expect(env.ctl.state().phase).toBe('playing');
  });

  it('Umlauf 1–18 in beide Richtungen', async () => {
    const env = makeEnv({ opts: { lastChannel: 18 } });
    env.ctl.start();
    await flush();
    env.ctl.zap(1);
    expect(env.ctl.state().channel).toBe(1);
    env.ctl.zap(-1);
    expect(env.ctl.state().channel).toBe(18);
    env.ctl.tune(0);
    expect(env.ctl.state().channel).toBe(18);
    env.ctl.tune(20);
    expect(env.ctl.state().channel).toBe(2);
    await flush(DEBOUNCE_MS);
  });

  it('immediate überspringt Entprellung und player.stop', async () => {
    const env = makeEnv();
    env.ctl.start();
    await flush();
    env.player.play.mockClear();
    env.player.stop.mockClear();
    env.ctl.tune(5, { immediate: true });
    await flush();
    expect(env.player.stop).not.toHaveBeenCalled();
    expect(env.player.play).toHaveBeenCalledTimes(1);
    expect(env.player.play.mock.calls[0][0].itemId).toBe(`it-5-${T0}`);
  });

  it('gleicher Sender mit laufender Sendung ist ein No-op', async () => {
    const env = makeEnv();
    env.ctl.start();
    await flush();
    env.player.play.mockClear();
    env.ctl.tune(1);
    await flush(DEBOUNCE_MS);
    expect(env.player.play).not.toHaveBeenCalled();
  });

  it('verwirft veraltete Antworten (Generationszähler)', async () => {
    const env = makeEnv();
    let resolveFirst;
    env.player.play
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockImplementation(async () => ({ ok: true, mode: 'direct' }));
    env.ctl.start();
    await flush();
    env.ctl.tune(2, { immediate: true });
    await flush();
    expect(env.ctl.state().channel).toBe(2);
    expect(env.ctl.state().phase).toBe('playing');
    env.watch.tune.mockClear();
    resolveFirst({ ok: false, reason: 'video' }); // veraltet: darf nichts mehr ändern
    await flush();
    expect(env.ctl.state()).toMatchObject({ channel: 2, phase: 'playing', card: null });
    expect(env.watch.tune).not.toHaveBeenCalled();
  });

  it('zap im ausgeschalteten Zustand tut nichts', () => {
    const env = makeEnv();
    env.ctl.zap(1);
    env.ctl.tune(3);
    expect(env.ctl.state()).toMatchObject({ on: false, phase: 'off' });
  });
});

describe('Füller, Füllprogramm, Sendepause', () => {
  const fillerEntryFor = (no, t) => {
    const s0 = Math.floor(t / HOUR) * HOUR;
    if (t - s0 < 20 * 60000) return { start: s0, end: s0 + 20 * 60000, type: 'filler' };
    return { start: s0 + 20 * 60000, end: s0 + HOUR, type: 'program', itemId: `nx-${s0}` };
  };
  const item = (id) => ({ id, kind: 'movie', title: id === `nx-${T0}` ? 'Der Nächste' : `Titel ${id}` });

  it('filler ohne Trailer: Pausenkarte „Gleich“ und neuer Versuch zum Trailerstart', async () => {
    const trailerStart = T0 + 15 * 60000;
    const pickFiller = vi.fn()
      .mockResolvedValueOnce({ kind: 'card', trailerStartMs: trailerStart })
      .mockResolvedValueOnce({ kind: 'trailer', url: 'http://x/t.mp4', offsetMs: 500 });
    const env = makeEnv({ entryFor: fillerEntryFor, item, pickFiller });
    env.ctl.start();
    await flush();
    const s = env.ctl.state();
    expect(s.phase).toBe('pause');
    expect(s.card).toMatchObject({ kind: 'next', title: 'Der Nächste', at: '19:20' });
    expect(s.banner).toBe(null);
    expect(env.player.play).not.toHaveBeenCalled();
    expect(env.player.stop).toHaveBeenCalled();
    await flush(15 * 60000 + 100);
    expect(pickFiller).toHaveBeenCalledTimes(2);
    expect(env.player.playUrl).toHaveBeenCalledWith('http://x/t.mp4', 500);
    expect(env.ctl.state()).toMatchObject({ phase: 'playing', card: null });
  });

  it('filler mit Trailer spielt per playUrl; Trailer-Ende führt zur Pausenkarte', async () => {
    const pickFiller = vi.fn(async () => ({ kind: 'trailer', url: 'http://x/t.mp4', offsetMs: 0 }));
    const env = makeEnv({ entryFor: fillerEntryFor, item, pickFiller });
    env.ctl.start();
    await flush();
    expect(env.player.playUrl).toHaveBeenCalledWith('http://x/t.mp4', 0);
    expect(env.ctl.state().phase).toBe('playing');
    expect(env.watch.tune).not.toHaveBeenCalled(); // Trailer zählt nie als gesehen
    env.emit('state', { phase: 'ended' });
    expect(env.ctl.state().phase).toBe('pause');
    expect(env.ctl.state().card.kind).toBe('next');
  });

  it('Trailer schlägt fehl: Pausenkarte statt Fehler', async () => {
    const pickFiller = vi.fn(async () => ({ kind: 'trailer', url: 'u', offsetMs: 0 }));
    const env = makeEnv({ entryFor: fillerEntryFor, item, pickFiller, player: { playUrl: vi.fn(async () => ({ ok: false, reason: 'video' })) } });
    env.ctl.start();
    await flush();
    expect(env.ctl.state().phase).toBe('pause');
    expect(env.ctl.state().card.kind).toBe('next');
  });

  it('fill mit itemId wird gespielt, Banner „Füllprogramm“', async () => {
    const env = makeEnv({ entryFor: (no, t) => programAt(no, t, { type: 'fill' }) });
    env.ctl.start();
    await flush();
    expect(env.player.play).toHaveBeenCalledTimes(1);
    expect(env.ctl.state()).toMatchObject({ phase: 'playing', banner: 'Füllprogramm' });
    expect(env.watch.tune).toHaveBeenCalled(); // fill zählt wie in LIVE (Regel liegt im Tracker)
  });

  it('nightfill zeigt das Banner mit Hinweis auf 5:00 (Label des Plans hat Vorrang)', async () => {
    let env = makeEnv({ entryFor: (no, t) => programAt(no, t, { type: 'nightfill' }) });
    env.ctl.start();
    await flush();
    expect(env.ctl.state().banner).toBe('Füllprogramm – reguläres Programm ab 5:00');
    env.ctl.dispose();
    env = makeEnv({ entryFor: (no, t) => programAt(no, t, { type: 'nightfill', label: 'Nachtprogramm' }) });
    env.ctl.start();
    await flush();
    expect(env.ctl.state().banner).toBe('Nachtprogramm');
  });

  it('fill ohne Titel: Pausenkarte mit Banner, kein play', async () => {
    const env = makeEnv({
      entryFor: (no, t) => {
        const s0 = Math.floor(t / HOUR) * HOUR;
        return t - s0 < 30 * 60000 ? { start: s0, end: s0 + 30 * 60000, type: 'fill' } : { start: s0 + 30 * 60000, end: s0 + HOUR, type: 'program', itemId: `p-${s0}` };
      },
    });
    env.ctl.start();
    await flush();
    expect(env.player.play).not.toHaveBeenCalled();
    expect(env.ctl.state()).toMatchObject({ phase: 'pause', banner: 'Füllprogramm' });
    expect(env.ctl.state().card).toMatchObject({ kind: 'next', at: '19:30' });
  });

  it('closedown: Karte mit Uhrzeit, kein Testbild, kein play, phase closedown', async () => {
    const b = dayBounds(dayOfDate(2026, 10, 11));
    const env = makeEnv({
      entryFor: (no, t) => (t < b.end ? { start: b.end - HOUR, end: b.end, type: 'closedown', reason: 'nightly' } : { start: b.end, end: b.end + HOUR, type: 'program', itemId: 'm' }),
    });
    vi.setSystemTime(b.end - 30 * 60000);
    env.ctl.start();
    await flush();
    const s = env.ctl.state();
    expect(s.phase).toBe('closedown');
    expect(s.card).toEqual({ kind: 'closedown', text: 'Sendepause', until: '05:00' });
    expect(env.player.play).not.toHaveBeenCalled();
    expect(env.player.playUrl).not.toHaveBeenCalled();
    expect(env.player.stop).toHaveBeenCalled();
  });

  it('closedown mit reason empty: „Auf diesem Sender läuft gerade nichts“', async () => {
    const env = makeEnv({ entryFor: (no, t) => ({ start: Math.floor(t / HOUR) * HOUR, end: Math.floor(t / HOUR) * HOUR + HOUR, type: 'closedown', reason: 'empty' }) });
    env.ctl.start();
    await flush();
    expect(env.ctl.state()).toMatchObject({ phase: 'closedown', reason: 'empty' });
    expect(env.ctl.state().card.text).toBe('Auf diesem Sender läuft gerade nichts');
  });
});

describe('Fehler und Autoplay', () => {
  it('network: Fehlerkarte, neuer Versuch nach 10 s', async () => {
    const env = makeEnv();
    env.player.play.mockResolvedValueOnce({ ok: false, mode: 'none', reason: 'network' });
    env.ctl.start();
    await flush();
    expect(env.ctl.state()).toMatchObject({ phase: 'error', reason: 'network', needsTap: false });
    expect(env.ctl.state().card.kind).toBe('error');
    expect(env.watch.tune).not.toHaveBeenCalled();
    await flush(RETRY_MS - 100);
    expect(env.player.play).toHaveBeenCalledTimes(1);
    await flush(200);
    expect(env.player.play).toHaveBeenCalledTimes(2);
    expect(env.ctl.state().phase).toBe('playing');
  });

  it('video/audio/browser bleiben stehen (kein automatischer Retry)', async () => {
    for (const reason of ['video', 'audio', 'browser']) {
      const env = makeEnv();
      env.player.play.mockResolvedValue({ ok: false, mode: 'none', reason });
      env.ctl.start();
      await flush(RETRY_MS * 2);
      expect(env.ctl.state()).toMatchObject({ phase: 'error', reason });
      expect(env.player.play).toHaveBeenCalledTimes(1);
      env.ctl.dispose();
    }
  });

  it('Player-Fehlerereignis während der Wiedergabe zeigt die Fehlerkarte', async () => {
    const env = makeEnv();
    env.ctl.start();
    await flush();
    env.emit('error', { reason: 'video' });
    expect(env.ctl.state()).toMatchObject({ phase: 'error', reason: 'video' });
    expect(env.watch.leave).toHaveBeenCalledWith(true);
  });

  it('gesture: needsTap, gesture() entsperrt synchron und versucht neu', async () => {
    const env = makeEnv();
    env.player.play.mockResolvedValueOnce({ ok: false, mode: 'none', reason: 'gesture' });
    env.ctl.start();
    await flush();
    expect(env.ctl.state()).toMatchObject({ phase: 'error', reason: 'gesture', needsTap: true });
    await flush(RETRY_MS * 2);
    expect(env.player.play).toHaveBeenCalledTimes(1); // kein Auto-Retry
    env.ctl.gesture();
    expect(env.player.unlock).toHaveBeenCalledTimes(2);
    expect(env.ctl.state().needsTap).toBe(false);
    await flush();
    expect(env.player.play).toHaveBeenCalledTimes(2);
    expect(env.ctl.state().phase).toBe('playing');
  });

  it('autoplay-muted: mutedByPolicy und muted, Hinweis; gesture schaltet den Ton an', async () => {
    const env = makeEnv();
    const msgs = [];
    env.ctl.on('message', (m) => msgs.push(m));
    env.ctl.start();
    await flush();
    env.emit('autoplay-muted', {});
    expect(env.ctl.state()).toMatchObject({ mutedByPolicy: true, muted: true });
    expect(msgs).toHaveLength(1);
    env.player.setMuted.mockClear();
    env.ctl.gesture();
    expect(env.ctl.state()).toMatchObject({ mutedByPolicy: false, muted: false, needsTap: false });
    expect(env.player.setMuted).toHaveBeenLastCalledWith(false);
    expect(env.player.play).toHaveBeenCalledTimes(1); // kein neuer Versuch nötig
  });

  it('autoplay-muted bei selbst stummem Nutzer: Stumm bleibt nach gesture', async () => {
    const env = makeEnv({ opts: { muted: true } });
    env.ctl.start();
    await flush();
    env.emit('autoplay-muted', {});
    env.ctl.gesture();
    expect(env.ctl.state()).toMatchObject({ mutedByPolicy: false, muted: true });
  });

  it('retry() startet den Sender neu', async () => {
    const env = makeEnv();
    env.player.play.mockResolvedValueOnce({ ok: false, reason: 'video' });
    env.ctl.start();
    await flush();
    env.ctl.retry();
    await flush();
    expect(env.player.play).toHaveBeenCalledTimes(2);
    expect(env.ctl.state().phase).toBe('playing');
  });
});

describe('Gesehen-Zählung', () => {
  const setup = (over = {}) => {
    const setPlayed = vi.fn();
    const watch = createWatchTracker({ setPlayed, now });
    const env = makeEnv({ watch, ...over });
    return { setPlayed, ...env };
  };

  it('zählt erst nach erfüllter Regel (>= 90 %) und nur einmal', async () => {
    const { ctl, setPlayed } = setup();
    ctl.start();
    await flush(0);
    await flush(0.5 * HOUR);
    expect(setPlayed).not.toHaveBeenCalled();
    await flush(0.41 * HOUR);
    expect(setPlayed).toHaveBeenCalledTimes(1);
    expect(setPlayed).toHaveBeenCalledWith(`it-1-${T0}`, true);
    await flush(0.05 * HOUR);
    expect(setPlayed).toHaveBeenCalledTimes(1);
  });

  it('Wegzappen vor der Regel zählt nicht', async () => {
    const { ctl, setPlayed } = setup();
    ctl.start();
    await flush();
    await flush(0.5 * HOUR);
    ctl.tune(2, { immediate: true });
    await flush(0.6 * HOUR);
    expect(setPlayed).not.toHaveBeenCalled();
  });

  it('Start ist erst nach erfolgreichem Abspielen registriert (nicht beim Laden, nicht bei Fehler)', async () => {
    const env = makeEnv();
    let resolve;
    env.player.play.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    env.ctl.start();
    await flush();
    expect(env.watch.tune).not.toHaveBeenCalled();
    resolve({ ok: true, mode: 'direct' });
    await flush();
    expect(env.watch.tune).toHaveBeenCalledTimes(1);
    expect(env.watch.tune.mock.calls[0][1]).toBe(0);
  });

  it('Zappen verlässt den Eintrag (leave ohne silent), Stillstand > 60 s verwirft still', async () => {
    const env = makeEnv();
    env.ctl.start();
    await flush();
    env.watch.leave.mockClear();
    env.emit('state', { phase: 'stalled' });
    expect(env.ctl.state().phase).toBe('loading');
    await flush(59000);
    expect(env.watch.leave).not.toHaveBeenCalledWith(true);
    await flush(1500);
    expect(env.watch.leave).toHaveBeenCalledWith(true);
    env.watch.tune.mockClear();
    env.emit('state', { phase: 'playing' });
    expect(env.ctl.state().phase).toBe('playing');
    expect(env.watch.tune).toHaveBeenCalled(); // nach Stillstand wieder aufnehmen
    env.watch.leave.mockClear();
    env.ctl.tune(3, { immediate: true });
    expect(env.watch.leave.mock.calls[0][0]).toBeUndefined(); // beim Zappen mit Prüfung (nicht still)
  });

  it('ohne watch (null) läuft alles ohne Zählung', async () => {
    const env = makeEnv({ watch: null });
    env.ctl.start();
    await flush(2000);
    env.ctl.tune(2, { immediate: true });
    await flush();
    expect(env.ctl.state().phase).toBe('playing');
  });
});

describe('Lautstärke und Ton', () => {
  it('setVolume rundet auf 5er-Schritte, begrenzt und speichert', async () => {
    const env = makeEnv();
    env.ctl.setVolume(47);
    expect(env.ctl.state().volume).toBe(45);
    expect(env.player.setVolume).toHaveBeenLastCalledWith(0.45);
    env.ctl.setVolume(250);
    expect(env.ctl.state().volume).toBe(100);
    env.ctl.setVolume(-5);
    expect(env.ctl.state().volume).toBe(0);
    expect(env.deps.savePrefs).toHaveBeenCalledWith({ volume: 0.45, muted: false });
  });

  it('opts.volume 0..1 wie LIVE', () => {
    expect(makeEnv({ opts: { volume: 0.35 } }).ctl.state().volume).toBe(35);
  });

  it('toggleMute und setMuted', () => {
    const env = makeEnv();
    env.ctl.toggleMute();
    expect(env.ctl.state().muted).toBe(true);
    expect(env.player.setMuted).toHaveBeenLastCalledWith(true);
    env.ctl.setMuted(false);
    expect(env.ctl.state().muted).toBe(false);
  });

  it('Stumm-Taste unter Autoplay-Sperre schaltet nur den Ton ein', async () => {
    const env = makeEnv();
    env.ctl.start();
    await flush();
    env.emit('autoplay-muted', {});
    env.ctl.toggleMute();
    expect(env.ctl.state()).toMatchObject({ mutedByPolicy: false, muted: false });
  });

  it('iOS (volumeSupported=false): Regler bleibt, 0 → stumm, ab 5 Ton an, kein Hinweis, video.volume bleibt 1', () => {
    const env = makeEnv({ player: { volumeSupported: false } });
    const msgs = [];
    env.ctl.on('message', (m) => msgs.push(m));
    expect(env.ctl.volumeSupported).toBe(true);
    env.ctl.setVolume(0);
    expect(env.ctl.state()).toMatchObject({ volume: 0, muted: true });
    env.ctl.setVolume(30);
    expect(env.ctl.state()).toMatchObject({ volume: 30, muted: false });
    expect(env.player.setVolume).toHaveBeenLastCalledWith(1);
    expect(msgs).toEqual([]);
  });

  it('Ton- und Untertitelwahl werden an den Player weitergereicht', async () => {
    const env = makeEnv();
    const tr = { audio: [{ index: 1 }, { index: 2 }], subs: [{ index: 3 }], audioIndex: 1, subtitleIndex: -1 };
    env.player.tracks.mockReturnValue(tr);
    expect(env.ctl.tracks()).toBe(tr);
    await env.ctl.setAudio(2);
    expect(env.player.setAudio).toHaveBeenCalledWith(2);
    await env.ctl.setSubtitle(3);
    await env.ctl.setSubtitle(-1);
    expect(env.player.setSubtitle).toHaveBeenNthCalledWith(1, 3);
    expect(env.player.setSubtitle).toHaveBeenNthCalledWith(2, -1);
  });

  it('Fehler beim Tonwechsel meldet einen Hinweis', async () => {
    const env = makeEnv({ player: { setAudio: vi.fn(async () => ({ ok: false, reason: 'audio' })), setSubtitle: vi.fn(async () => { throw new Error('x'); }) } });
    const msgs = [];
    env.ctl.on('message', (m) => msgs.push(m));
    await env.ctl.setAudio(2);
    await env.ctl.setSubtitle(1);
    expect(msgs).toEqual(['Diese Tonspur ist nicht verfügbar', 'Untertitel nicht verfügbar']);
  });
});

describe('restartTarget', () => {
  it('liefert itemId/type/seriesId der laufenden Sendung', async () => {
    const env = makeEnv({
      item: (id) => ({ id, kind: 'episode', seriesId: 'se1', title: 'Folge' }),
      entryFor: (no, t) => programAt(no, t, { seriesId: 'se1' }),
    });
    expect(env.ctl.restartTarget()).toBe(null); // aus
    env.ctl.start();
    await flush();
    expect(env.ctl.restartTarget()).toEqual({ itemId: `it-1-${T0}`, type: 'episode', seriesId: 'se1' });
  });

  it('Film ohne Serie', async () => {
    const env = makeEnv();
    env.ctl.start();
    await flush();
    expect(env.ctl.restartTarget()).toEqual({ itemId: `it-1-${T0}`, type: 'movie', seriesId: null });
  });

  it('null bei filler und closedown', async () => {
    const env = makeEnv({ entryFor: (no, t) => ({ start: Math.floor(t / HOUR) * HOUR, end: Math.floor(t / HOUR) * HOUR + HOUR, type: 'closedown', reason: 'empty' }) });
    env.ctl.start();
    await flush();
    expect(env.ctl.restartTarget()).toBe(null);
    const env2 = makeEnv({ entryFor: (no, t) => ({ start: Math.floor(t / HOUR) * HOUR, end: Math.floor(t / HOUR) * HOUR + HOUR, type: 'filler' }) });
    env2.ctl.start();
    await flush();
    expect(env2.ctl.restartTarget()).toBe(null);
  });
});

describe('Takt, Sync, Tageswechsel', () => {
  it('tick-Ereignis jede Sekunde, syncTo alle 30 s mit Offset', async () => {
    const env = makeEnv();
    const ticks = vi.fn();
    env.ctl.on('tick', ticks);
    env.ctl.start();
    await flush();
    await flush(5000);
    expect(ticks).toHaveBeenCalledTimes(5);
    expect(env.watch.tick).toHaveBeenCalledTimes(5);
    expect(env.player.syncTo).not.toHaveBeenCalled();
    await flush(25000);
    expect(env.player.syncTo).toHaveBeenCalledTimes(1);
    expect(env.player.syncTo).toHaveBeenCalledWith(Date.now() - T0);
  });

  it('Tageswechsel um 05:00 plant D..D+6 neu und meldet day', async () => {
    const b = dayBounds(dayOfDate(2026, 10, 11));
    vi.setSystemTime(b.end - 2500);
    const env = makeEnv();
    const day = vi.fn();
    env.ctl.on('day', day);
    env.ctl.start();
    await flush();
    await flush(2000);
    expect(day).not.toHaveBeenCalled();
    await flush(1000);
    const D = dayOfDate(2026, 10, 12);
    expect(day).toHaveBeenCalledWith(D);
    expect(env.scheduler.prepare).toHaveBeenCalledWith([0, 1, 2, 3, 4, 5, 6].map((i) => D + i));
    await flush(3000);
    expect(day).toHaveBeenCalledTimes(1);
  });

  it('Abmeldefunktion von on() funktioniert', async () => {
    const env = makeEnv();
    const fn = vi.fn();
    const off = env.ctl.on('change', fn);
    off();
    env.ctl.start();
    await flush();
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('Aufräumen', () => {
  it('stop: player.stop, keine Timer, phase off, Gesehen-Stand zurück, Neustart möglich', async () => {
    const env = makeEnv();
    env.ctl.start();
    await flush();
    env.ctl.zap(1);
    env.player.stop.mockClear();
    env.watch.leave.mockClear();
    env.ctl.stop();
    expect(env.player.stop).toHaveBeenCalledTimes(1);
    expect(env.watch.leave).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(env.ctl.state()).toMatchObject({ on: false, phase: 'off', entry: null, card: null, banner: null, needsTap: false, mutedByPolicy: false });
    env.player.play.mockClear();
    await flush(DEBOUNCE_MS + 1000);
    expect(env.player.play).not.toHaveBeenCalled(); // Entprellung wurde abgeräumt
    env.ctl.start();
    await flush();
    expect(env.player.play).toHaveBeenCalledTimes(1);
  });

  it('stop während laufendem play verwirft das Ergebnis', async () => {
    const env = makeEnv();
    let resolve;
    env.player.play.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    env.ctl.start();
    await flush();
    env.ctl.stop();
    resolve({ ok: true });
    await flush();
    expect(env.ctl.state().phase).toBe('off');
    expect(env.watch.tune).not.toHaveBeenCalled();
  });

  it('stop räumt auch den Netzwerk-Retry ab', async () => {
    const env = makeEnv();
    env.player.play.mockResolvedValue({ ok: false, reason: 'network' });
    env.ctl.start();
    await flush();
    env.ctl.stop();
    expect(vi.getTimerCount()).toBe(0);
    await flush(RETRY_MS * 2);
    expect(env.player.play).toHaveBeenCalledTimes(1);
  });

  it('dispose ist idempotent, räumt Timer und Hörer ab, ruft player.stop und dispose', async () => {
    const env = makeEnv();
    const fn = vi.fn();
    env.ctl.on('change', fn);
    env.ctl.start();
    await flush();
    env.ctl.dispose();
    env.ctl.dispose();
    expect(env.player.stop).toHaveBeenCalled();
    expect(env.player.dispose).toHaveBeenCalledTimes(1);
    expect(env.watch.dispose).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    const calls = fn.mock.calls.length;
    env.emit('autoplay-muted', {});
    env.ctl.start();
    env.ctl.zap(1);
    await flush(5000);
    expect(fn.mock.calls.length).toBe(calls);
    expect(env.player.play).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('mit echtem Scheduler', () => {
  const MIN = 6e8;
  const raw = () => {
    const out = { movies: [], series: [], episodes: [], boxsets: [], loadedAt: 0 };
    for (let i = 0; i < 60; i++) out.movies.push({ Id: 'm' + i, Name: 'Film ' + i, RunTimeTicks: (80 + (i % 5) * 10) * MIN, Genres: ['Drama'], OfficialRating: 'FSK-12', ProductionYear: 2000, DateCreated: '2026-01-01T00:00:00Z' });
    return out;
  };

  it('start spielt den Plan-Eintrag mit dem Offset der Uhr', async () => {
    const sch = createScheduler(normalizeCatalog(raw()), { now });
    vi.setSystemTime(Date.UTC(2026, 10, 11, 19, 42, 17));
    const t = Date.now();
    const { ctl, player } = makeEnv({ scheduler: sch, opts: { lastChannel: 3 } });
    ctl.start();
    await flush();
    const exp = sch.nowOn(3, t);
    const first = player.play.mock.calls[0];
    if (exp.entry.itemId && exp.entry.type !== 'filler') {
      expect(first[0]).toEqual({ itemId: exp.entry.itemId, offsetMs: exp.offsetMs });
    }
    expect(ctl.state().entry).toBe(exp.entry);
    expect(ctl.state().channel).toBe(3);
    ctl.dispose();
  });

  it('leere Mediathek: Sender zeigen Sendepause bzw. „nichts“ ohne play', async () => {
    const sch = createScheduler(normalizeCatalog({ movies: [], series: [], episodes: [], boxsets: [] }), { now });
    const { ctl, player } = makeEnv({ scheduler: sch });
    ctl.start();
    await flush();
    expect(player.play).not.toHaveBeenCalled();
    expect(ctl.state().phase).toBe('closedown');
    expect(ctl.state().card.kind === 'empty' || ctl.state().card.kind === 'closedown').toBe(true);
    ctl.dispose();
  });
});

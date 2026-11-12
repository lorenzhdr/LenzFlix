// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp } from '../src/js/live/ui/app.js';

const T0 = Date.UTC(2026, 10, 11, 18, 0, 0);

function makeEnv(over = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const clock = { t: T0 };
  const channels = Array.from({ length: 18 }, (_, i) => ({ no: i + 1, key: `k${i}`, name: `LIVE ${i + 1}`, kind: 'movies' }));
  const defaultEntry = (no, t) => {
    const start = Math.floor(t / 3600000) * 3600000;
    return { start, end: start + 3600000, type: 'program', itemId: `it-${no}-${start}` };
  };
  const entryFor = over.entryFor || defaultEntry;
  const scheduler = {
    channels: () => channels,
    prepare: vi.fn(async () => {}),
    nowOn: vi.fn((no, t) => { const entry = entryFor(no, t); return { entry, offsetMs: t - entry.start, D: 1 }; }),
    item: vi.fn((id) => (over.item ? over.item(id) : { title: `Titel ${id}`, year: 2001, genres: ['Drama'], durMs: 5400000, age: 12 })),
    planDay: vi.fn(() => []),
  };
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
    on: vi.fn(() => () => {}),
    dispose: vi.fn(),
    ...(over.player || {}),
  };
  const watch = over.watch || { tune: vi.fn(), tick: vi.fn(), leave: vi.fn(), dispose: vi.fn() };
  const pickFiller = vi.fn(async () => ({ kind: 'card' }));
  const mkOverlay = (name) => {
    const o = { name, open: false, el: document.createElement('div') };
    o.inst = {
      el: o.el,
      open: vi.fn(() => { o.open = true; }),
      close: vi.fn(() => { o.open = false; }),
      isOpen: () => o.open,
      onKey: vi.fn(() => false),
      tick: vi.fn(),
    };
    return o;
  };
  const ov = { epg: mkOverlay('epg'), ttx: mkOverlay('ttx'), menu: mkOverlay('menu') };
  const ctxs = {};
  const overlays = {};
  for (const k of Object.keys(ov)) overlays[k] = vi.fn((ctx) => { ctxs[k] = ctx; return ov[k].inst; });
  const deps = {
    user: { id: 'u', name: 'Test', isAdmin: false },
    previousThemeName: 'LENZFLIX',
    savePrefs: vi.fn(),
    leaveToLibrary: vi.fn(async () => {}),
    toast: vi.fn(),
    ...(over.deps || {}),
  };
  const opts = { style: 'crt80', volume: 0.5, muted: false, lastChannel: 1, now: () => clock.t, ...(over.opts || {}) };
  const app = createApp(host, { scheduler, player, watch, pickFiller, overlays, deps, opts, time: {}, sfx: over.sfx });
  return { host, clock, scheduler, player, watch, pickFiller, overlays, ov, ctxs, deps, app, opts };
}

const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
const q = (env, sel) => env.host.querySelector(sel);
const btn = (env, key) => env.host.querySelector(`.lfx-live-remote button[data-key="${key}"]`);

beforeEach(() => {
  vi.useFakeTimers();
  HTMLCanvasElement.prototype.getContext = () => null;
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
  delete window.__lfxLive;
});

describe('Standby und Power', () => {
  it('startet im Standby mit der Struktur aus dem Vertrag', () => {
    const env = makeEnv();
    expect(q(env, '.lfx-live-app.lfx-live--style-crt80')).toBeTruthy();
    for (const sel of ['.lfx-live-room', '.lfx-live-tv', '.lfx-live-screen', 'video.lfx-live-video', 'canvas.lfx-live-noise', '.lfx-live-card', '.lfx-live-osd', '.lfx-live-overlay', '.lfx-live-tv__led', '.lfx-live-remote']) {
      expect(q(env, sel), sel).toBeTruthy();
    }
    expect(env.app.isOn()).toBe(false);
    expect(env.player.play).not.toHaveBeenCalled();
  });

  it('Power ruft unlock synchron im Klick und spielt lastChannel', async () => {
    const env = makeEnv({ opts: { lastChannel: 7 } });
    btn(env, 'power').click();
    expect(env.player.unlock).toHaveBeenCalledTimes(1);
    expect(env.app.isOn()).toBe(true);
    await flush();
    expect(env.scheduler.nowOn).toHaveBeenCalledWith(7, T0);
    expect(env.player.play).toHaveBeenCalledTimes(1);
    expect(env.player.play.mock.calls[0][0].itemId).toMatch(/^it-7-/);
    expect(q(env, '.lfx-live-app').classList.contains('is-on')).toBe(true);
    expect(env.watch.tune).toHaveBeenCalled();
  });

  it('Power aus stoppt Stream und Beobachter', async () => {
    const env = makeEnv();
    env.app.press('power');
    await flush();
    env.app.press('power');
    expect(env.app.isOn()).toBe(false);
    expect(env.player.stop).toHaveBeenCalled();
    expect(env.watch.leave).toHaveBeenCalled();
  });

  it('im Standby wirken nur Power, OK und Vollbild', async () => {
    const env = makeEnv();
    env.app.press('ch+');
    env.app.press('vol+');
    await flush(1000);
    expect(env.player.play).not.toHaveBeenCalled();
    env.app.press('ok');
    expect(env.app.isOn()).toBe(true);
  });
});

describe('Senderwahl', () => {
  it('ch± zyklisch 1–18', async () => {
    const env = makeEnv({ opts: { lastChannel: 18 } });
    env.app.press('power');
    await flush();
    env.app.press('ch+');
    expect(env.app.channel()).toBe(1);
    env.app.press('ch-');
    expect(env.app.channel()).toBe(18);
  });

  it('schnelles Zappen: nur EIN weiteres play nach der Entprellung', async () => {
    const env = makeEnv();
    env.app.press('power');
    await flush();
    expect(env.player.play).toHaveBeenCalledTimes(1);
    env.app.press('ch+');
    await flush(100);
    env.app.press('ch+');
    await flush(100);
    env.app.press('ch+');
    await flush(300);
    expect(env.player.play).toHaveBeenCalledTimes(1);
    await flush(200);
    expect(env.player.play).toHaveBeenCalledTimes(2);
    expect(env.player.play.mock.calls[1][0].itemId).toMatch(/^it-4-/);
    expect(env.deps.savePrefs).toHaveBeenCalledWith({ lastChannel: 4 });
  });

  it('beim Umschalten sofort Rauschen/OSD, Stream erst nach Entprellung', async () => {
    const env = makeEnv();
    env.app.press('power');
    await flush();
    env.app.press('ch+');
    expect(q(env, '.lfx-live-noise').classList.contains('is-active')).toBe(true);
    expect(q(env, '.lfx-live-osd').classList.contains('is-ch')).toBe(true);
    expect(q(env, '.lfx-live-osd__no').textContent).toBe('2');
    expect(env.player.stop).toHaveBeenCalled();
  });

  it('einstellige Ziffer 2–9 schaltet sofort (mit Entprellung)', async () => {
    const env = makeEnv();
    env.app.press('power');
    await flush();
    env.app.press('5');
    expect(env.app.channel()).toBe(5);
    await flush(400);
    expect(env.player.play.mock.calls.at(-1)[0].itemId).toMatch(/^it-5-/);
  });

  it('zweistellig: „1“ wartet auf die zweite Ziffer und zeigt „1_“', async () => {
    const env = makeEnv({ opts: { lastChannel: 5 } });
    env.app.press('power');
    await flush();
    env.app.press('1');
    expect(q(env, '.lfx-live-osd__input').textContent).toBe('1_');
    expect(q(env, '.lfx-live-osd').classList.contains('is-input')).toBe(true);
    expect(env.app.channel()).toBe(5);
    await flush(500);
    env.app.press('2');
    expect(env.app.channel()).toBe(12);
    await flush(400);
    expect(env.player.play.mock.calls.at(-1)[0].itemId).toMatch(/^it-12-/);
  });

  it('einzelne „1“ schaltet nach 1,5 s auf Sender 1', async () => {
    const env = makeEnv({ opts: { lastChannel: 5 } });
    env.app.press('power');
    await flush();
    env.app.press('1');
    await flush(1400);
    expect(env.app.channel()).toBe(5);
    await flush(200);
    expect(env.app.channel()).toBe(1);
  });

  it('ungültige Nummer 19 meldet „existiert nicht“', async () => {
    const env = makeEnv();
    env.app.press('power');
    await flush();
    env.app.press('1');
    env.app.press('9');
    expect(q(env, '.lfx-live-osd__msg').textContent).toMatch(/existiert nicht/);
    expect(env.app.channel()).toBe(1);
  });
});

describe('Eintragstypen', () => {
  const fillerEnv = (extra = {}) => makeEnv({
    entryFor: (no, t) => (t < T0 + 600000
      ? { start: T0 - 1000, end: T0 + 600000, type: 'filler' }
      : { start: T0 + 600000, end: T0 + 4200000, type: 'program', itemId: 'next-1' }),
    item: (id) => ({ title: id === 'next-1' ? 'Der Nachtzug' : 'x' }),
    ...extra,
  });

  it('filler mit Trailer → playUrl mit Offset', async () => {
    const env = fillerEnv();
    env.pickFiller.mockResolvedValue({ kind: 'trailer', url: 'https://t/x.mp4', offsetMs: 1500 });
    env.app.press('power');
    await flush();
    expect(env.pickFiller).toHaveBeenCalled();
    expect(env.player.playUrl).toHaveBeenCalledWith('https://t/x.mp4', 1500);
    expect(env.player.play).not.toHaveBeenCalled();
  });

  it('filler ohne Trailer → Pausenbild mit „Gleich: …“ und Countdown', async () => {
    const env = fillerEnv();
    env.app.press('power');
    await flush();
    const card = q(env, '.lfx-live-card');
    expect(card.hidden).toBe(false);
    expect(card.dataset.kind).toBe('pause');
    expect(card.textContent).toMatch(/Gleich: Der Nachtzug um \d\d:\d\d/);
    expect(card.querySelector('.lfx-live-card__count').textContent).toMatch(/^in \d+:\d\d$/);
    expect(card.querySelector('.lfx-live-logo')).toBeTruthy();
    expect(env.player.play).not.toHaveBeenCalled();
  });

  it('closedown → Testbild „Sendeschluss“, bei leerem Sender anderer Text', async () => {
    const a = makeEnv({ entryFor: () => ({ start: T0 - 1000, end: T0 + 99999, type: 'closedown', reason: 'end' }) });
    a.app.press('power');
    await flush();
    expect(q(a, '.lfx-live-card').dataset.kind).toBe('test');
    expect(q(a, '.lfx-live-card').textContent).toContain('Sendeschluss');
    const b = makeEnv({ entryFor: () => ({ start: T0 - 1000, end: T0 + 99999, type: 'closedown', reason: 'empty' }) });
    b.app.press('power');
    await flush();
    expect(q(b, '.lfx-live-card').textContent).toContain('Auf diesem Sender läuft gerade nichts');
  });

  it('fill/nightfill → play plus Hinweis-Banner', async () => {
    const a = makeEnv({ entryFor: () => ({ start: T0 - 1000, end: T0 + 99999, type: 'fill', itemId: 'f1' }) });
    a.app.press('power');
    await flush();
    expect(a.player.play).toHaveBeenCalledWith({ itemId: 'f1', offsetMs: 1000 });
    expect(q(a, '.lfx-live-banner').hidden).toBe(false);
    expect(q(a, '.lfx-live-banner').textContent).toBe('Füllprogramm');
    const b = makeEnv({ entryFor: () => ({ start: T0 - 1000, end: T0 + 99999, type: 'nightfill', itemId: 'n1', label: 'Füllprogramm – reguläres Programm ab 5:00' }) });
    b.app.press('power');
    await flush();
    expect(q(b, '.lfx-live-banner').textContent).toContain('ab 5:00');
  });

  it('Badges: Wdh., Premiere, Neue Folge, Thementag', async () => {
    const env = makeEnv({ entryFor: () => ({ start: T0 - 1000, end: T0 + 99999, type: 'program', itemId: 'p', rerun: true, premiere: 'episode', theme: 'Die 90er' }) });
    env.app.press('power');
    await flush();
    const txt = q(env, '.lfx-live-osd__badges').textContent;
    expect(txt).toContain('Wdh.');
    expect(txt).toContain('Neue Folge');
    expect(txt).toContain('Thementag: Die 90er');
  });
});

describe('Störbilder', () => {
  const cases = [
    ['video', 'Kein Empfang auf diesem Gerät', 'Dieses Gerät kann den Sender nicht empfangen'],
    ['browser', 'Kein Empfang auf diesem Gerät', 'Bitte einen anderen Browser verwenden'],
    ['audio', 'Ton auf diesem Gerät nicht empfangbar', null],
    ['network', 'Empfangsstörung – erneuter Versuch …', null],
  ];
  for (const [reason, title, sub] of cases) {
    it(`reason ${reason}`, async () => {
      const env = makeEnv();
      env.player.play.mockResolvedValue({ ok: false, mode: 'none', reason });
      env.app.press('power');
      await flush();
      const card = q(env, '.lfx-live-card');
      expect(card.dataset.kind).toBe('error');
      expect(card.textContent).toContain(title);
      if (sub) expect(card.textContent).toContain(sub);
    });
  }

  it('network: Wiederholung nach 10 s', async () => {
    const env = makeEnv();
    env.player.play.mockResolvedValueOnce({ ok: false, mode: 'none', reason: 'network' });
    env.app.press('power');
    await flush();
    expect(env.player.play).toHaveBeenCalledTimes(1);
    await flush(9000);
    expect(env.player.play).toHaveBeenCalledTimes(1);
    await flush(1100);
    expect(env.player.play).toHaveBeenCalledTimes(2);
    expect(q(env, '.lfx-live-card').hidden).toBe(true);
  });

  it('video-Störbild wird nicht wiederholt', async () => {
    const env = makeEnv();
    env.player.play.mockResolvedValue({ ok: false, mode: 'none', reason: 'video' });
    env.app.press('power');
    await flush(30000);
    expect(env.player.play).toHaveBeenCalledTimes(1);
  });
});

describe('Programmwechsel, Sync, Beobachter', () => {
  it('wechselt automatisch am entry.end', async () => {
    const env = makeEnv({
      entryFor: (no, t) => (t < T0 + 60000
        ? { start: T0 - 1000, end: T0 + 60000, type: 'program', itemId: 'a' }
        : { start: T0 + 60000, end: T0 + 3600000, type: 'program', itemId: 'b' }),
    });
    env.app.press('power');
    await flush();
    expect(env.player.play).toHaveBeenCalledTimes(1);
    env.clock.t = T0 + 60100;
    await flush(60100);
    expect(env.player.play).toHaveBeenCalledTimes(2);
    expect(env.player.play.mock.calls[1][0]).toEqual({ itemId: 'b', offsetMs: 100 });
    expect(q(env, '.lfx-live-app').classList.contains('is-blend')).toBe(true);
    expect(q(env, '.lfx-live-noise').classList.contains('is-active')).toBe(false);
  });

  it('syncTo alle 30 s mit aktuellem Offset, Watch-Tick jede Sekunde', async () => {
    const env = makeEnv();
    env.app.press('power');
    await flush();
    env.clock.t = T0 + 30000;
    await flush(30000);
    expect(env.player.syncTo).toHaveBeenCalledTimes(1);
    expect(env.player.syncTo.mock.calls[0][0]).toBe(30000);
    expect(env.watch.tick.mock.calls.length).toBeGreaterThanOrEqual(30);
  });
});

describe('Lautstärke', () => {
  it('vol± in 5-%-Schritten, mute, savePrefs', async () => {
    const env = makeEnv();
    env.app.press('power');
    await flush();
    env.app.press('vol+');
    expect(env.player.setVolume).toHaveBeenLastCalledWith(0.55);
    expect(env.deps.savePrefs).toHaveBeenLastCalledWith({ volume: 0.55, muted: false });
    env.app.press('vol-');
    env.app.press('vol-');
    expect(env.player.setVolume).toHaveBeenLastCalledWith(0.45);
    env.app.press('mute');
    expect(env.player.setMuted).toHaveBeenLastCalledWith(true);
    expect(env.deps.savePrefs).toHaveBeenLastCalledWith({ volume: 0.45, muted: true });
    expect(q(env, '.lfx-live-osd__vol-num').textContent).toBe('Stumm');
    env.app.press('vol+');
    expect(env.player.setMuted).toHaveBeenLastCalledWith(false);
  });

  it('volumeSupported=false (ohne volumeMode): wie mute-only, Pegel 0 → stumm, volume fest 1', async () => {
    const env = makeEnv({ player: { volumeSupported: false } });
    env.app.press('power');
    await flush();
    env.app.press('vol-');
    expect(env.player.setMuted).toHaveBeenLastCalledWith(false);
    expect(env.player.setVolume).toHaveBeenLastCalledWith(1);
    expect(env.deps.savePrefs).toHaveBeenLastCalledWith({ volume: 0.45, muted: false });
    expect(q(env, '.lfx-live-osd__vol-hint').textContent).toBe('Lautstärke bitte am Gerät einstellen');
  });

  it('Ton- und Untertiteltasten zyklisch, ohne Spuren mit Hinweis', async () => {
    const tracks = { audio: [{ index: 0, label: 'Deutsch' }, { index: 1, label: 'Englisch' }], subs: [{ index: 3, label: 'Deutsch' }], audioIndex: 0, subtitleIndex: -1 };
    const env = makeEnv({ player: { tracks: vi.fn(() => tracks) } });
    env.app.press('power');
    await flush();
    env.app.press('audio');
    await flush();
    expect(env.player.setAudio).toHaveBeenCalledWith(1);
    expect(q(env, '.lfx-live-osd__msg').textContent).toBe('Ton: Englisch');
    env.app.press('subs');
    await flush();
    expect(env.player.setSubtitle).toHaveBeenCalledWith(3);
    expect(q(env, '.lfx-live-osd__msg').textContent).toBe('Untertitel: Deutsch');
    tracks.subtitleIndex = 3;
    env.app.press('subs');
    await flush();
    expect(env.player.setSubtitle).toHaveBeenLastCalledWith(-1);
    expect(q(env, '.lfx-live-osd__msg').textContent).toBe('Untertitel: aus');

    const none = makeEnv();
    none.app.press('power');
    await flush();
    none.app.press('audio');
    expect(q(none, '.lfx-live-osd__msg').textContent).toBe('Keine weiteren Tonspuren');
  });
});

describe('Overlays', () => {
  it('öffnen per Taste, Klasse am App-Element, lazy erzeugt, ctx laut Vertrag', async () => {
    const env = makeEnv();
    env.app.press('power');
    await flush();
    expect(env.overlays.epg).not.toHaveBeenCalled();
    env.app.press('epg');
    expect(env.overlays.epg).toHaveBeenCalledTimes(1);
    expect(env.ov.epg.inst.open).toHaveBeenCalled();
    expect(q(env, '.lfx-live-app').classList.contains('has-epg')).toBe(true);
    expect(q(env, '.lfx-live-overlay').contains(env.ov.epg.el)).toBe(true);
    const ctx = env.ctxs.epg;
    for (const k of ['scheduler', 'now', 'channels', 'currentChannel', 'tune', 'closeOverlay', 'style', 'setStyle', 'styles', 'leaveToLibrary', 'openThemePicker', 'imageUrl', 'toast', 'previousThemeName']) {
      expect(ctx, k).toHaveProperty(k);
    }
    expect(ctx.currentChannel()).toBe(1);
    expect(ctx.styles.map((s) => s.id)).toEqual(['flat', 'crt80', 'silver', 'plain']);
  });

  it('offene Overlays bekommen Tasten zuerst; consumed stoppt Standardaktion', async () => {
    const env = makeEnv();
    env.app.press('power');
    await flush();
    env.app.press('txt');
    env.ov.ttx.inst.onKey.mockReturnValue(true);
    env.app.press('ch+');
    expect(env.ov.ttx.inst.onKey).toHaveBeenCalledWith('ch+');
    expect(env.app.channel()).toBe(1);
    env.ov.ttx.inst.onKey.mockReturnValue(false);
    env.app.press('ch+');
    expect(env.app.channel()).toBe(2);
  });

  it('back schließt das Overlay, wenn es die Taste nicht verbraucht; Overlay-Wechsel', async () => {
    const env = makeEnv();
    env.app.press('power');
    await flush();
    env.app.press('epg');
    env.app.press('menu');
    expect(env.ov.epg.inst.close).toHaveBeenCalled();
    expect(q(env, '.lfx-live-app').classList.contains('has-menu')).toBe(true);
    expect(q(env, '.lfx-live-app').classList.contains('has-epg')).toBe(false);
    env.app.press('back');
    expect(env.ov.menu.inst.close).toHaveBeenCalled();
    expect(q(env, '.lfx-live-app').classList.contains('has-menu')).toBe(false);
  });

  it('tick(now) jede Sekunde nur für offene Overlays; closeOverlay aus ctx', async () => {
    const env = makeEnv();
    env.app.press('power');
    await flush();
    env.app.press('epg');
    await flush(2000);
    expect(env.ov.epg.inst.tick).toHaveBeenCalled();
    env.ctxs.epg.closeOverlay();
    expect(env.ov.epg.inst.close).toHaveBeenCalled();
    env.ov.epg.inst.tick.mockClear();
    await flush(2000);
    expect(env.ov.epg.inst.tick).not.toHaveBeenCalled();
  });

  it('ctx.tune schaltet um (entprellt); setStyle speichert', async () => {
    const env = makeEnv();
    env.app.press('power');
    await flush();
    env.app.press('epg');
    env.ctxs.epg.tune(9);
    expect(env.app.channel()).toBe(9);
    env.ctxs.epg.setStyle('flat');
    expect(q(env, '.lfx-live-app').classList.contains('lfx-live--style-flat')).toBe(true);
    expect(env.deps.savePrefs).toHaveBeenCalledWith({ style: 'flat' });
  });
});

describe('Stil speichern nur bei aktiver Wahl', () => {
  it('Standard flat ohne opts.style; Lautstärke, Stumm und Senderwechsel speichern keinen Stil', async () => {
    const env = makeEnv({ opts: { style: undefined } });
    expect(q(env, '.lfx-live-app.lfx-live--style-flat')).toBeTruthy();
    env.app.press('power');
    await flush();
    env.app.press('vol+');
    env.app.press('mute');
    env.app.press('ch+');
    await flush(600);
    expect(env.deps.savePrefs).toHaveBeenCalled();
    for (const [arg] of env.deps.savePrefs.mock.calls) expect(arg).not.toHaveProperty('style');
  });

  it('aktive Wahl im Menü speichert, auch wenn der Stil schon gilt', async () => {
    const env = makeEnv({ opts: { style: undefined } });
    env.app.press('power');
    await flush();
    env.app.press('epg');
    env.ctxs.epg.setStyle('flat');
    expect(env.deps.savePrefs).toHaveBeenCalledWith({ style: 'flat' });
  });
});

describe('Von vorne ansehen', () => {
  it('Bestätigung per OK → leaveToLibrary mit Meta (Film)', async () => {
    const env = makeEnv();
    env.app.press('power');
    await flush();
    env.app.press('restart');
    expect(q(env, '.lfx-live-osd__msg').textContent).toBe('In LENZFLIX von vorne ansehen? OK drücken');
    expect(env.deps.leaveToLibrary).not.toHaveBeenCalled();
    env.app.press('ok');
    await flush();
    expect(env.deps.leaveToLibrary).toHaveBeenCalledWith(expect.stringMatching(/^it-1-/), { type: 'movie', seriesId: null });
  });

  it('Folgen: type episode und seriesId; andere Taste bricht ab', async () => {
    const env = makeEnv({ item: () => ({ title: 'Pilot', seriesTitle: 'Serie X', season: 1, episode: 2, seriesId: 'S1' }) });
    env.app.press('power');
    await flush();
    expect(q(env, '.lfx-live-osd__title').textContent).toContain('Serie X · S01E02 · Pilot');
    env.app.press('restart');
    env.app.press('vol+');
    env.app.press('ok');
    expect(env.deps.leaveToLibrary).not.toHaveBeenCalled();
    env.app.press('restart');
    env.app.press('ok');
    await flush();
    expect(env.deps.leaveToLibrary).toHaveBeenCalledWith(expect.any(String), { type: 'episode', seriesId: 'S1' });
  });

  it('bei Pausenbild nicht möglich', async () => {
    const env = makeEnv({ entryFor: () => ({ start: T0 - 1000, end: T0 + 99999, type: 'closedown' }) });
    env.app.press('power');
    await flush();
    env.app.press('restart');
    env.app.press('ok');
    expect(env.deps.leaveToLibrary).not.toHaveBeenCalled();
  });
});

describe('Info, Handy, Vollbild, Lebenszyklus', () => {
  it('Info zeigt erweitertes OSD mit Jahr, Genre, Laufzeit, Freigabe', async () => {
    const env = makeEnv();
    env.app.press('power');
    await flush();
    env.app.press('info');
    expect(q(env, '.lfx-live-osd').classList.contains('is-info')).toBe(true);
    expect(q(env, '.lfx-live-osd__info-meta').textContent).toBe('2001 · Drama · 90 Min. · ab 12');
    expect(q(env, '.lfx-live-osd__info-next').textContent).toMatch(/^Danach \d\d:\d\d: /);
  });

  it('Handy: is-phone, Querformat per matchMedia', () => {
    const listeners = [];
    window.matchMedia = vi.fn(() => ({ matches: true, addEventListener: (_, f) => listeners.push(f), removeEventListener: () => {} }));
    const env = makeEnv({ opts: { phone: true } });
    const el = q(env, '.lfx-live-app');
    expect(el.classList.contains('is-phone')).toBe(true);
    expect(el.classList.contains('is-landscape')).toBe(true);
    delete window.matchMedia;
  });

  it('Vollbild-Fallback: Klasse .is-fullscreen, Taste zurück verlässt', async () => {
    const env = makeEnv();
    env.app.press('power');
    await flush();
    env.app.press('fullscreen');
    expect(q(env, '.lfx-live-app').classList.contains('is-fullscreen')).toBe(true);
    env.app.press('back');
    expect(q(env, '.lfx-live-app').classList.contains('is-fullscreen')).toBe(false);
    q(env, '.lfx-live-screen').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(q(env, '.lfx-live-app').classList.contains('is-fullscreen')).toBe(true);
  });

  it('suspend → Standby ohne Stream; resume hängt wieder ein', async () => {
    const env = makeEnv();
    env.app.press('power');
    await flush();
    env.app.suspend();
    expect(env.app.isOn()).toBe(false);
    expect(env.player.stop).toHaveBeenCalled();
    env.app.press('power');
    expect(env.app.isOn()).toBe(false);
    const other = document.createElement('div');
    document.body.append(other);
    env.app.resume(other);
    expect(other.querySelector('.lfx-live-app')).toBeTruthy();
    env.app.press('power');
    expect(env.app.isOn()).toBe(true);
  });

  it('Debug: window.__lfxLive nur mit opts.debug, wird bei dispose entfernt', async () => {
    const off = makeEnv();
    expect(window.__lfxLive).toBeUndefined();
    off.app.dispose();
    const env = makeEnv({ opts: { debug: true } });
    expect(Object.keys(window.__lfxLive).sort()).toEqual(['app', 'now', 'plan', 'scheduler', 'tune']);
    expect(window.__lfxLive.now()).toBe(T0);
    env.app.dispose();
    expect(window.__lfxLive).toBeUndefined();
  });

  it('dispose räumt Timer, Listener, DOM und Player auf', async () => {
    const env = makeEnv({ opts: { debug: true } });
    env.app.press('power');
    await flush();
    env.app.press('ch+');
    env.app.press('epg');
    env.app.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(env.host.querySelector('.lfx-live-app')).toBeNull();
    expect(env.player.dispose).toHaveBeenCalled();
    expect(env.watch.dispose).toHaveBeenCalled();
    expect(window.__lfxLive).toBeUndefined();
    const before = env.player.play.mock.calls.length;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    await flush(1000);
    expect(env.player.play.mock.calls.length).toBe(before);
  });
});

describe('Gerätetasten und Drehknöpfe', () => {
  const act = (env, sel) => q(env, sel).click();
  const preBtn = (env, n) => env.host.querySelectorAll('.lfx-live-d-btns > .lfx-live-d__i')[n - 1];

  it('Programmtaste 3 schaltet aus dem Standby auf Sender 3 ein', async () => {
    const env = makeEnv();
    expect(env.app.isOn()).toBe(false);
    preBtn(env, 3).click();
    expect(env.app.isOn()).toBe(true);
    expect(env.app.channel()).toBe(3);
    await flush();
    expect(env.scheduler.nowOn).toHaveBeenCalledWith(3, T0);
    expect(q(env, '.lfx-live-tv__deco').dataset.ch).toBe('3');
    expect(q(env, '.lfx-live-tv__deco').dataset.on).toBe('1');
  });

  it('Programmtaste bei an wechselt den Sender', async () => {
    const env = makeEnv();
    env.app.press('power');
    await flush();
    preBtn(env, 5).click();
    await flush(500);
    expect(env.app.channel()).toBe(5);
  });

  it('Netzschalter schaltet um', async () => {
    const env = makeEnv();
    act(env, '.lfx-live-d-power');
    expect(env.app.isOn()).toBe(true);
    await flush();
    act(env, '.lfx-live-d-power');
    expect(env.app.isOn()).toBe(false);
    expect(q(env, '.lfx-live-tv__deco').dataset.on).toBe('0');
  });

  it('Videorekorder zeigt im Standby die Uhrzeit', () => {
    const env = makeEnv();
    expect(q(env, '[data-display="vcr"]').textContent).toMatch(/^\d\d:\d\d$/);
  });

  it('Silber: P+ schaltet ein (nächster Sender ab dem zuletzt gesehenen), V+ lässt den TV aus', async () => {
    const env = makeEnv({ opts: { style: 'silver', lastChannel: 4 } });
    const key = (a) => env.host.querySelector(`.lfx-live-d-key[data-action="${a}"]`);
    key('key:vol+').click();
    expect(env.app.isOn()).toBe(false);
    expect(env.player.setVolume).toHaveBeenLastCalledWith(0.55);
    expect(q(env, '.lfx-live-osd__vol-num')?.textContent || '').not.toMatch(/55/);
    key('key:ch+').click();
    expect(env.app.isOn()).toBe(true);
    expect(env.app.channel()).toBe(5);
    await flush();
    key('key:ch-').click();
    await flush(500);
    expect(env.app.channel()).toBe(4);
  });

  it('Silber: P− aus dem Standby geht rückwärts, 1 → 18', () => {
    const env = makeEnv({ opts: { style: 'silver', lastChannel: 1 } });
    env.host.querySelector('.lfx-live-d-key[data-action="key:ch-"]').click();
    expect(env.app.channel()).toBe(18);
    expect(env.app.isOn()).toBe(true);
  });

  it('Silber: EPG aus dem Standby schaltet ein und öffnet die Programmübersicht', async () => {
    const env = makeEnv({ opts: { style: 'silver' } });
    env.host.querySelector('.lfx-live-d-key[data-action="key:epg"]').click();
    expect(env.app.isOn()).toBe(true);
    expect(env.ov.epg.inst.open).toHaveBeenCalled();
    await flush();
  });

  it('Gerätetasten und Knöpfe spielen Klicks über sfx, Lautstärke folgt', async () => {
    const sfx = { click: vi.fn(), setLevel: vi.fn(), dispose: vi.fn() };
    const env = makeEnv({ sfx });
    act(env, '.lfx-live-d-power');
    expect(sfx.click).toHaveBeenLastCalledWith('power');
    preBtn(env, 2).click();
    expect(sfx.click).toHaveBeenLastCalledWith('press');
    q(env, '.lfx-live-tv__knob--b').dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
    expect(sfx.click).toHaveBeenLastCalledWith('detent');
    expect(sfx.setLevel).toHaveBeenLastCalledWith(0.55, false);
    await flush();
    env.app.dispose();
    expect(sfx.dispose).not.toHaveBeenCalled(); // injizierte Instanz gehört dem Aufrufer
  });

  it('Drehknopf: Rad am Lautstärkeknopf ändert die Lautstärke absolut', async () => {
    const env = makeEnv();
    const knob = q(env, '.lfx-live-tv__knob--b');
    knob.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
    expect(env.player.setVolume).toHaveBeenLastCalledWith(0.55);
    expect(env.deps.savePrefs).toHaveBeenLastCalledWith({ volume: 0.55, muted: false });
    expect(knob.style.getPropertyValue('--lfx-live-knob-b')).toBe('13.5deg');
    expect(env.app.isOn()).toBe(false);
  });

  it('Drehknopf: Rad am Senderknopf wechselt nach 400 ms (schaltet aus dem Standby ein)', async () => {
    const env = makeEnv();
    const knob = q(env, '.lfx-live-tv__knob--a');
    knob.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
    expect(env.app.isOn()).toBe(false);
    await flush(401);
    expect(env.app.isOn()).toBe(true);
    expect(env.app.channel()).toBe(2);
    expect(knob.style.getPropertyValue('--lfx-live-knob-a')).toBe('20deg');
  });

  it('Drehknöpfe wirken nur bei crt80; bei Silber kein Eingriff', () => {
    const env = makeEnv({ opts: { style: 'silver' } });
    const knob = q(env, '.lfx-live-tv__knob--b');
    const w = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    knob.dispatchEvent(w);
    expect(w.defaultPrevented).toBe(false);
    expect(env.player.setVolume).not.toHaveBeenCalledWith(0.55);
  });

  it('Stilwechsel auf crt80 aktiviert die Knöpfe', () => {
    const env = makeEnv({ opts: { style: 'flat' } });
    const knob = q(env, '.lfx-live-tv__knob--b');
    const w = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    knob.dispatchEvent(w);
    expect(w.defaultPrevented).toBe(false);
    env.app.dispose();
  });
});

describe('Lautstärke-Modus (volumeMode)', () => {
  it("'native': normale Stufen wie am PC, kein Hinweis", async () => {
    const env = makeEnv({ player: { volumeSupported: false, volumeMode: vi.fn(() => 'native') } });
    env.app.press('power');
    await flush();
    env.app.press('vol+');
    expect(env.player.setVolume).toHaveBeenLastCalledWith(0.55);
    expect(env.deps.savePrefs).toHaveBeenLastCalledWith({ volume: 0.55, muted: false });
    expect(q(env, '.lfx-live-osd__vol-hint').textContent).toBe('');
    expect(q(env, '.lfx-live-osd__vol').classList.contains('is-hint-only')).toBe(false);
  });

  it("'mute-only': Anzeige 0–100 normal, Pegel 0 → stumm, sonst Ton an (volume fest 1), Hinweis nur einmal", async () => {
    const env = makeEnv({ player: { volumeMode: vi.fn(() => 'mute-only') } });
    env.app.press('power');
    await flush();
    env.app.press('vol+');
    expect(env.player.setVolume).toHaveBeenLastCalledWith(1);
    expect(env.player.setMuted).toHaveBeenLastCalledWith(false);
    expect(env.deps.savePrefs).toHaveBeenLastCalledWith({ volume: 0.55, muted: false });
    expect(q(env, '.lfx-live-osd__vol').classList.contains('is-hint-only')).toBe(false);
    expect(q(env, '.lfx-live-osd__vol-label').textContent).toBe('Lautstärke');
    expect(q(env, '.lfx-live-osd__vol-hint').textContent).toBe('Lautstärke bitte am Gerät einstellen');
    env.app.press('vol+');
    expect(q(env, '.lfx-live-osd__vol-hint').textContent).toBe('');
    for (let i = 0; i < 12; i++) env.app.press('vol-');
    expect(env.player.setMuted).toHaveBeenLastCalledWith(true);
    env.app.press('vol+');
    expect(env.player.setMuted).toHaveBeenLastCalledWith(false);
    expect(env.player.setVolume).toHaveBeenLastCalledWith(1);
  });

  it('Modus wird dynamisch gelesen (mute-only → native)', async () => {
    let mode = 'mute-only';
    const env = makeEnv({ player: { volumeMode: () => mode } });
    env.app.press('power');
    await flush();
    env.app.press('vol+');
    expect(env.player.setVolume).toHaveBeenLastCalledWith(1);
    mode = 'native';
    env.app.press('vol+');
    expect(env.player.setVolume).toHaveBeenLastCalledWith(0.6);
  });
});

describe('Ladeanimation', () => {
  function withState() {
    const h = {};
    const env = makeEnv({ player: { on: vi.fn((ev, fn) => { h[ev] = fn; return () => {}; }) } });
    return { env, h };
  }
  it('is-loading erst nach 400 ms, sofort weg bei playing', async () => {
    const { env, h } = withState();
    env.app.press('power');
    await flush();
    const app = q(env, '.lfx-live-app');
    h.state({ phase: 'loading' });
    await flush(300);
    expect(app.classList.contains('is-loading')).toBe(false);
    await flush(150);
    expect(app.classList.contains('is-loading')).toBe(true);
    h.state({ phase: 'playing' });
    expect(app.classList.contains('is-loading')).toBe(false);
  });

  it('kurzer Ladezustand zeigt nie die Animation; Taste i ändert nichts', async () => {
    const { env, h } = withState();
    env.app.press('power');
    await flush();
    const app = q(env, '.lfx-live-app');
    h.state({ phase: 'loading' });
    await flush(100);
    h.state({ phase: 'playing' });
    await flush(1000);
    expect(app.classList.contains('is-loading')).toBe(false);
    h.state({ phase: 'loading' });
    await flush(500);
    expect(app.classList.contains('is-loading')).toBe(true);
    env.app.press('info');
    expect(app.classList.contains('is-loading')).toBe(true);
  });
});

describe('Menü: Tippen außerhalb schließt', () => {
  const down = (el) => el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  it('schließt bei Tippen auf den Bildschirm und verschluckt den click (Standby bleibt aus)', async () => {
    const env = makeEnv();
    env.app.press('menu');
    expect(env.ov.menu.open).toBe(true);
    const screen = q(env, '.lfx-live-screen');
    down(screen);
    expect(env.ov.menu.open).toBe(false);
    screen.click();
    expect(env.app.isOn()).toBe(false);
    screen.click(); // zweiter Klick wirkt wieder normal
    expect(env.app.isOn()).toBe(true);
  });

  it('Panel und Fernbedienung schließen nicht', () => {
    const env = makeEnv();
    const panel = document.createElement('div');
    panel.className = 'lfx-live-menu__panel';
    env.ov.menu.el.append(panel);
    env.app.press('menu');
    down(panel);
    expect(env.ov.menu.open).toBe(true);
    down(q(env, '.lfx-live-remote'));
    expect(env.ov.menu.open).toBe(true);
  });

  it('EPG schließt nicht bei Tippen außerhalb', async () => {
    const env = makeEnv();
    env.app.press('power');
    await flush();
    env.app.press('epg');
    down(q(env, '.lfx-live-screen'));
    expect(env.ov.epg.open).toBe(true);
  });
});

// @vitest-environment jsdom
// Integration 1.9.1: Fernsehzeitung (guide-Overlay, Heft-Objekt, Menüeinträge) und Pausenmusik-Anbindung der App.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const model = vi.hoisted(() => ({
  buildMagazine: vi.fn((input) => ({ title: 'LIVE Programm', today: input.today, overviews: input.overviews || null, cover: { hero: { imageId: 'hero1' } }, pages: [{ kind: 'cover', no: 1 }] })),
  collectTipIds: vi.fn(() => ['t1', 't2']),
  loadOverviews: vi.fn(async (ids, fn) => (typeof fn === 'function' ? new Map([[ids[0], 'Text']]) : new Map())),
}));
vi.mock('../src/js/live/magazine/model.js', () => model);

import { createApp } from '../src/js/live/ui/app.js';
import { createMenu } from '../src/js/live/ui/menu.js';

const T0 = Date.UTC(2026, 10, 11, 18, 0, 0);

let roCallbacks = [];
class FakeRO {
  constructor(cb) { this.cb = cb; roCallbacks.push(cb); }
  observe() {}
  disconnect() {}
}

function makeEnv(over = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const clock = { t: T0 };
  const channels = Array.from({ length: 18 }, (_, i) => ({ no: i + 1, key: `k${i}`, name: `LIVE ${i + 1}`, kind: 'movies' }));
  const entryFor = over.entryFor || ((no, t) => {
    const start = Math.floor(t / 3600000) * 3600000;
    return { start, end: start + 3600000, type: 'program', itemId: `it-${no}-${start}` };
  });
  const scheduler = {
    channels: () => channels,
    prepare: vi.fn(async () => {}),
    nowOn: vi.fn((no, t) => { const entry = entryFor(no, t); return { entry, offsetMs: t - entry.start, D: 1 }; }),
    item: vi.fn((id) => ({ title: `Titel ${id}`, year: 2001, genres: ['Drama'], durMs: 5400000, age: 12 })),
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
    on: vi.fn(() => () => {}),
    dispose: vi.fn(),
    ...(over.player || {}),
  };
  const guideEl = document.createElement('div');
  const guide = { open: false, el: guideEl };
  guide.inst = {
    el: guideEl,
    open: vi.fn(() => { guide.open = true; }),
    close: vi.fn(() => { guide.open = false; }),
    isOpen: () => guide.open,
    onKey: vi.fn(() => false),
  };
  const ctxs = {};
  const menuEl = document.createElement('div');
  const menu = { open: false, el: menuEl };
  menu.inst = {
    el: menuEl,
    open: vi.fn(() => { menu.open = true; }),
    close: vi.fn(() => { menu.open = false; }),
    isOpen: () => menu.open,
    onKey: vi.fn(() => false),
  };
  const overlays = { guide: vi.fn((ctx) => { ctxs.guide = ctx; return guide.inst; }) };
  if (over.withMenu) overlays.menu = vi.fn((ctx) => { ctxs.menu = ctx; return menu.inst; });
  const music = {
    unlock: vi.fn(), setStyle: vi.fn(), setLevel: vi.fn(), setEnabled: vi.fn(), setIdle: vi.fn(), isPlaying: vi.fn(() => false), dispose: vi.fn(),
  };
  const pdf = { downloadPdf: vi.fn(async () => ({ url: 'blob:x', fileName: 'x.pdf' })) };
  const deps = {
    user: { id: 'u', name: 'Test', isAdmin: false },
    savePrefs: vi.fn(),
    toast: vi.fn(),
    imageUrl: vi.fn((id) => `img:${id}`),
    itemDetails: vi.fn(async () => new Map()),
    ...(over.deps || {}),
  };
  const time = {
    formatClock: (t) => new Date(t).toISOString().slice(11, 16),
    formatDay: () => ({ weekday: 'Mi', long: 'Mittwoch', date: '11.11.' }),
    broadcastDayOf: (t) => Math.floor((t - 5 * 3600000) / 864e5),
    dayBounds: (D) => ({ start: D * 864e5 + 5 * 3600000, end: (D + 1) * 864e5 + 5 * 3600000 }),
  };
  const opts = { style: 'crt80', volume: 0.5, muted: false, lastChannel: 1, now: () => clock.t, ...(over.opts || {}) };
  const app = createApp(host, { scheduler, player, watch: null, pickFiller: async () => ({ kind: 'card' }), overlays, music, pdf, deps, opts, time });
  return { host, clock, scheduler, player, ctxs, guide, menu, music, pdf, deps, app, opts };
}

const esc = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
const q = (env, sel) => env.host.querySelector(sel);
const btn = (env, key) => env.host.querySelector(`.lfx-live-remote button[data-key="${key}"]`);
const root = (env) => q(env, '.lfx-live-app');

beforeEach(() => {
  vi.useFakeTimers();
  roCallbacks = [];
  vi.stubGlobal('ResizeObserver', FakeRO);
  HTMLCanvasElement.prototype.getContext = () => null;
  model.buildMagazine.mockClear();
  model.loadOverviews.mockClear();
  model.collectTipIds.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  delete window.__lfxLive;
});

describe('Fernsehzeitung (guide)', () => {
  it('Aufbau: Seitenspalte mit Slot (Heft-Objekt) und Fernbedienung im Raum; Heft-Taste vorhanden', () => {
    const env = makeEnv();
    const side = q(env, '.lfx-live-room > .lfx-live-side');
    expect(side).toBeTruthy();
    expect(side.querySelector('.lfx-live-side__slot .lfx-live-mag-prop')).toBeTruthy();
    expect(side.querySelector('.lfx-live-remote')).toBeTruthy();
    expect(btn(env, 'guide').textContent).toBe('Heft');
    expect(btn(env, 'guide').getAttribute('aria-label')).toBe('Fernsehzeitung');
  });

  it('press(guide) öffnet das Heft und toggelt; Klasse has-guide; Taste z', async () => {
    const env = makeEnv();
    env.app.press('power');
    await flush();
    env.app.press('guide');
    expect(env.guide.inst.open).toHaveBeenCalledTimes(1);
    expect(env.guide.inst.open).toHaveBeenCalledWith();
    expect(root(env).classList.contains('has-guide')).toBe(true);
    env.app.press('guide');
    expect(env.guide.inst.close).toHaveBeenCalled();
    expect(root(env).classList.contains('has-guide')).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true, cancelable: true }));
    expect(env.guide.inst.open).toHaveBeenCalledTimes(2);
    btn(env, 'guide').click();
    expect(env.guide.inst.close).toHaveBeenCalledTimes(2);
  });

  it('ctx.openOverlay reicht Optionen durch (autoPdf), ohne Optionen bleibt open() argumentlos; andere Overlays schließen', async () => {
    const env = makeEnv();
    env.app.press('power');
    await flush();
    env.app.press('guide');
    expect(env.ctxs.guide).toBeTruthy();
    env.guide.inst.open.mockClear();
    env.ctxs.guide.openOverlay('guide', { autoPdf: true });
    expect(env.guide.inst.open).toHaveBeenCalledWith({ autoPdf: true });
  });

  it('Standby: Heft per Taste, Z und Prop-Klick, ohne einzuschalten; Tasten gehen ans Heft; Zurück schließt', async () => {
    const env = makeEnv();
    q(env, '.lfx-live-mag-prop').click();
    expect(env.guide.inst.open).toHaveBeenCalledTimes(1);
    expect(env.app.isOn()).toBe(false);
    expect(root(env).classList.contains('has-guide')).toBe(true);
    env.app.press('right');
    env.app.press('ok');
    expect(env.guide.inst.onKey).toHaveBeenCalledWith('right');
    expect(env.guide.inst.onKey).toHaveBeenCalledWith('ok');
    expect(env.app.isOn()).toBe(false);
    env.app.press('back');
    expect(env.guide.inst.close).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true, cancelable: true }));
    expect(env.guide.inst.open).toHaveBeenCalledTimes(2);
    env.app.press('guide');
    expect(env.guide.inst.close).toHaveBeenCalledTimes(2);
    expect(env.player.play).not.toHaveBeenCalled();
    env.app.press('ok');   // ohne offenes Overlay schaltet OK weiterhin ein
    expect(env.app.isOn()).toBe(true);
  });

  it('Esc öffnet das Menü an und aus, schließt es wieder; im Vollbild nur Zurück (Vollbild verlassen)', async () => {
    const env = makeEnv({ withMenu: true });
    esc();
    expect(env.menu.inst.open).toHaveBeenCalledTimes(1);
    expect(env.app.isOn()).toBe(false);
    esc();
    expect(env.menu.inst.close).toHaveBeenCalledTimes(1);
    env.app.press('menu');
    expect(env.menu.inst.open).toHaveBeenCalledTimes(2);
    q(env, '.lfx-live-screen').click();          // Klick im Standby-Menü schaltet nicht ein
    expect(env.app.isOn()).toBe(false);
    env.app.press('back');
    env.app.press('power');
    await flush();
    esc();
    expect(env.menu.inst.open).toHaveBeenCalledTimes(3);
    esc();
    expect(env.menu.inst.close).toHaveBeenCalledTimes(3);
    env.app.press('fullscreen');
    expect(root(env).classList.contains('is-fullscreen')).toBe(true);
    esc();
    expect(env.menu.inst.open).toHaveBeenCalledTimes(3);
    expect(root(env).classList.contains('is-fullscreen')).toBe(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    expect(env.menu.inst.open).toHaveBeenCalledTimes(3);
  });

  it('Standby-Menü: Senderwahl schaltet direkt auf diesem Sender ein', async () => {
    const env = makeEnv({ withMenu: true });
    env.app.press('menu');
    env.ctxs.menu.tune(7);
    await flush();
    expect(env.app.isOn()).toBe(true);
    expect(env.app.channel()).toBe(7);
    expect(env.player.unlock).toHaveBeenCalled();
  });

  it('Prop-Klick öffnet das Heft (Ein-Zustand)', async () => {
    const env = makeEnv();
    env.app.press('power');
    await flush();
    q(env, '.lfx-live-mag-prop').click();
    expect(env.guide.inst.open).toHaveBeenCalledTimes(1);
  });

  it('Platzwächter: der erste passende Slot gewinnt (crt80: Lowboard, dann über der Fernbedienung), sonst is-guide-key', async () => {
    const env = makeEnv(); // Stil crt80
    const slot = q(env, '.lfx-live-side__slot');
    const low = q(env, '.lfx-live-room__prop');
    // jsdom hat kein Layout: nichts passt → nur die Heft-Taste
    expect(root(env).classList.contains('is-guide-key')).toBe(true);
    expect(q(env, '.lfx-live-mag-prop').hidden).toBe(true);
    expect(root(env).dataset.prop).toBeUndefined();
    Object.defineProperty(slot, 'clientHeight', { configurable: true, value: 200 });
    roCallbacks.forEach((cb) => cb());
    await flush(50);
    expect(root(env).classList.contains('is-guide-key')).toBe(false);
    expect(root(env).dataset.prop).toBe('above');
    expect(q(env, '.lfx-live-mag-prop').parentNode).toBe(slot);
    Object.defineProperty(low, 'clientHeight', { configurable: true, value: 150 });
    roCallbacks.forEach((cb) => cb());
    await flush(50);
    expect(root(env).dataset.prop).toBe('lowboard');
    expect(q(env, '.lfx-live-mag-prop').parentNode).toBe(low);
    Object.defineProperty(low, 'clientHeight', { configurable: true, value: 40 });
    Object.defineProperty(slot, 'clientHeight', { configurable: true, value: 40 });
    roCallbacks.forEach((cb) => cb());
    await flush(50);
    expect(root(env).classList.contains('is-guide-key')).toBe(true);
  });

  it('Schlicht: zweite Wahl „above-low“ (Fernbedienung unten), flat nur über der Fernbedienung', async () => {
    const env = makeEnv({ opts: { style: 'plain' } });
    const slot = q(env, '.lfx-live-side__slot');
    let h = 40;
    Object.defineProperty(slot, 'clientHeight', { configurable: true, get: () => (root(env).dataset.prop === 'above-low' ? 130 : h) });
    roCallbacks.forEach((cb) => cb());
    await flush(50);
    expect(root(env).dataset.prop).toBe('above-low');
    expect(root(env).classList.contains('is-guide-key')).toBe(false);
    h = 150;
    roCallbacks.forEach((cb) => cb());
    await flush(50);
    expect(root(env).dataset.prop).toBe('above');
  });

  it('Prop-Titelbild kommt ohne Inhaltsangaben-Anfrage (kein itemDetails beim Start)', async () => {
    const env = makeEnv();
    await flush(10);
    expect(model.buildMagazine).toHaveBeenCalledTimes(1);
    expect(model.buildMagazine.mock.calls[0][0].overviews).toBeUndefined();
    expect(q(env, '.lfx-live-mag-prop img').getAttribute('src')).toBe('img:hero1');
    expect(env.deps.itemDetails).not.toHaveBeenCalled();
    expect(model.loadOverviews).not.toHaveBeenCalled();
  });

  it('ctx.buildMagazine: Inhaltsangaben (eine Anfrage), Cache pro Sendetag, neuer Tag → neu', async () => {
    const env = makeEnv();
    await flush(10);
    const ctx = (env.app.press('power'), env.app.press('guide'), env.ctxs.guide);
    const m1 = await ctx.buildMagazine();
    expect(model.loadOverviews).toHaveBeenCalledTimes(1);
    expect(model.loadOverviews.mock.calls[0][0]).toEqual(['t1', 't2']);
    expect(model.loadOverviews.mock.calls[0][1]).toBe(env.deps.itemDetails);
    expect(m1.overviews.get('t1')).toBe('Text');
    const m2 = await ctx.buildMagazine();
    expect(m2).toBe(m1);
    expect(model.loadOverviews).toHaveBeenCalledTimes(1);
    env.clock.t += 86400000;
    const m3 = await ctx.buildMagazine();
    expect(m3).not.toBe(m1);
    expect(m3.today).toBe(m1.today + 1);
    expect(model.loadOverviews).toHaveBeenCalledTimes(2);
  });

  it('ctx.buildMagazine: Fehler im Modell → Ablehnung, nächster Aufruf versucht es neu', async () => {
    const env = makeEnv();
    await flush(10);
    env.app.press('power');
    env.app.press('guide');
    model.loadOverviews.mockRejectedValueOnce(new Error('x'));
    await expect(env.ctxs.guide.buildMagazine()).rejects.toThrow('x');
    await expect(env.ctxs.guide.buildMagazine()).resolves.toBeTruthy();
  });

  it('ctx.downloadPdf ruft den Export mit dem aktuellen Stil', async () => {
    const env = makeEnv();
    env.app.press('power');
    env.app.press('guide');
    const prog = vi.fn();
    const r = await env.ctxs.guide.downloadPdf({ pages: [] }, prog);
    expect(r).toEqual({ url: 'blob:x', fileName: 'x.pdf' });
    expect(env.pdf.downloadPdf).toHaveBeenCalledWith({ pages: [] }, 'crt80', prog);
    env.app.press('menu'); // kein Menü-Overlay in diesem Env → ohne Wirkung
    env.ctxs.guide.setStyle('silver');
    await env.ctxs.guide.downloadPdf({ pages: [] }, prog);
    expect(env.pdf.downloadPdf.mock.calls[1][1]).toBe('silver');
    expect(q(env, '.lfx-live-mag-prop').dataset.style).toBe('silver');
  });
});

describe('Pausenmusik-Anbindung', () => {
  const fillEntry = (no, t) => ({ start: Math.floor(t / 3600000) * 3600000 - 1000, end: Math.floor(t / 3600000) * 3600000 + 3600000, type: 'fill' });

  it('Pref music=false → setEnabled(false); Stil wird gesetzt', () => {
    const env = makeEnv({ opts: { music: false } });
    expect(env.music.setEnabled).toHaveBeenCalledWith(false);
    expect(env.music.setStyle).toHaveBeenCalledWith('crt80');
  });

  it('unlock läuft synchron im Power-Klick', () => {
    const env = makeEnv();
    btn(env, 'power').click();
    expect(env.music.unlock).toHaveBeenCalledTimes(1);
    expect(env.player.unlock).toHaveBeenCalledTimes(1);
  });

  it('Pausenbild → setIdle(pause); Programm → setIdle(null); Aus → setIdle(null)', async () => {
    const env = makeEnv({ entryFor: fillEntry });
    env.app.press('power');
    await flush();
    expect(env.music.setIdle).toHaveBeenCalledWith('pause');
    env.music.setIdle.mockClear();
    env.app.press('power');
    expect(env.music.setIdle).toHaveBeenLastCalledWith(null);
  });

  it('Programm läuft → keine Musik; Wechsel von Pause auf Programm stoppt sie', async () => {
    let pause = true;
    const env = makeEnv({
      entryFor: (no, t) => (pause
        ? fillEntry(no, t)
        : { start: Math.floor(t / 3600000) * 3600000, end: Math.floor(t / 3600000) * 3600000 + 3600000, type: 'program', itemId: `it-${no}` }),
    });
    env.app.press('power');
    await flush();
    expect(env.music.setIdle).toHaveBeenLastCalledWith('pause');
    pause = false;
    env.app.press('ch+');
    await flush(500);
    expect(env.music.setIdle).toHaveBeenLastCalledWith(null);
    expect(env.music.setIdle.mock.calls.filter((c) => c[0] === 'pause').length).toBe(1);
  });

  it('Testbild (Sendeschluss) → test; Störbild (Netz) → error; „Zum Starten tippen“ (gesture) → keine Musik', async () => {
    const env = makeEnv({ entryFor: (no, t) => ({ start: t - 1000, end: t + 3600000, type: 'closedown' }) });
    env.app.press('power');
    await flush();
    expect(env.music.setIdle).toHaveBeenLastCalledWith('test');

    const env2 = makeEnv({ player: { play: vi.fn(async () => ({ ok: false, reason: 'video' })) } });
    env2.app.press('power');
    await flush();
    expect(env2.music.setIdle).toHaveBeenLastCalledWith('error');

    const env3 = makeEnv({ player: { play: vi.fn(async () => ({ ok: false, reason: 'gesture' })) } });
    env3.app.press('power');
    await flush();
    expect(env3.music.setIdle).not.toHaveBeenCalledWith('error');
    expect(env3.music.setIdle.mock.calls.every((c) => c[0] === null)).toBe(true);
  });

  it('Lautstärke und Stumm → setLevel(vol01, muted); Autoplay-stumm zählt als stumm', async () => {
    let autoplayCb = null;
    const env = makeEnv({ player: { on: vi.fn((name, cb) => { if (name === 'autoplay-muted') autoplayCb = cb; return () => {}; }) } });
    env.app.press('power');
    await flush();
    expect(env.music.setLevel).toHaveBeenLastCalledWith(0.5, false);
    env.app.press('vol+');
    expect(env.music.setLevel).toHaveBeenLastCalledWith(0.55, false);
    env.app.press('mute');
    expect(env.music.setLevel).toHaveBeenLastCalledWith(0.55, true);
    env.app.press('mute');
    autoplayCb();
    expect(env.music.setLevel).toHaveBeenLastCalledWith(0.55, true);
  });

  it('iOS ohne Lautstärke (volumeSupported=false): nur stumm/an', async () => {
    const env = makeEnv({ player: { volumeSupported: false } });
    env.app.press('power');
    await flush();
    expect(env.music.setLevel).toHaveBeenLastCalledWith(1, false);
    env.app.press('vol-'); // Pegel 45, Ton bleibt an (voller Gerätepegel)
    expect(env.music.setLevel).toHaveBeenLastCalledWith(1, false);
    env.app.press('mute');
    expect(env.music.setLevel).toHaveBeenLastCalledWith(1, true);
  });

  it('Tippen nach Autoplay-Sperre ruft music.unlock synchron mit player.unlock', async () => {
    const env = makeEnv({ player: { play: vi.fn(async () => ({ ok: false, reason: 'gesture' })) } });
    env.app.press('power');
    await flush();
    env.music.unlock.mockClear();
    env.player.unlock.mockClear();
    q(env, '.lfx-live-screen').click();
    expect(env.music.unlock).toHaveBeenCalledTimes(1);
    expect(env.player.unlock).toHaveBeenCalledTimes(1);
  });

  it('ctx.toggleMusic schaltet, speichert { music } und meldet den Zustand; dispose räumt auf', () => {
    const env = makeEnv();
    env.app.press('power');
    env.app.press('guide');
    expect(env.ctxs.guide.musicEnabled()).toBe(true);
    expect(env.ctxs.guide.toggleMusic()).toBe(false);
    expect(env.music.setEnabled).toHaveBeenLastCalledWith(false);
    expect(env.deps.savePrefs).toHaveBeenCalledWith({ music: false });
    expect(env.ctxs.guide.musicEnabled()).toBe(false);
    env.app.dispose();
    expect(env.music.dispose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.lfx-live-mag-prop')).toBeNull();
  });
});

describe('Menü: Pausenmusik und Fernsehzeitung als PDF', () => {
  function menuCtx(over = {}) {
    let on = true;
    return {
      scheduler: { channels: () => [], genres: () => [] },
      channels: () => [],
      currentChannel: () => 1,
      styles: [{ id: 'flat', name: 'Flachbild' }],
      style: () => 'flat',
      setStyle: vi.fn(),
      closeOverlay: vi.fn(),
      tune: vi.fn(),
      leaveToLibrary: vi.fn(),
      openThemePicker: vi.fn(),
      openDashboard: vi.fn(),
      logout: vi.fn(),
      toast: vi.fn(),
      musicEnabled: () => on,
      toggleMusic: vi.fn(() => { on = !on; return on; }),
      openOverlay: vi.fn(),
      ...over,
    };
  }
  const items = (menu) => [...menu.el.querySelectorAll('.lfx-live-menu__item')];
  const find = (menu, label) => items(menu).find((b) => b.querySelector('.lfx-live-menu__label').textContent === label);

  it('zeigt Pausenmusik mit Wert, schaltet um und meldet per Toast', () => {
    const ctx = menuCtx();
    const menu = createMenu(ctx);
    document.body.append(menu.el);
    menu.open();
    const labels = items(menu).map((b) => b.querySelector('.lfx-live-menu__label').textContent);
    expect(labels.indexOf('Pausenmusik')).toBe(labels.indexOf('Senderliste') + 1);
    expect(labels).toContain('Fernsehzeitung als PDF');
    expect(find(menu, 'Pausenmusik').querySelector('.lfx-live-menu__value').textContent).toBe('An');
    find(menu, 'Pausenmusik').click();
    expect(ctx.toggleMusic).toHaveBeenCalledTimes(1);
    expect(ctx.toast).toHaveBeenCalledWith('Pausenmusik aus.');
    expect(find(menu, 'Pausenmusik').querySelector('.lfx-live-menu__value').textContent).toBe('Aus');
  });

  it('„Fernsehzeitung als PDF“ schließt das Menü und öffnet das Heft mit autoPdf', () => {
    const ctx = menuCtx();
    const menu = createMenu(ctx);
    document.body.append(menu.el);
    menu.open();
    find(menu, 'Fernsehzeitung als PDF').click();
    expect(ctx.closeOverlay).toHaveBeenCalled();
    expect(ctx.openOverlay).toHaveBeenCalledWith('guide', { autoPdf: true });
  });
});

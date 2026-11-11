// @vitest-environment jsdom
// Dekor-Ebenen (ui/decor.js), Einbau in die App (Stilwechsel, Anzeigen) und Pref „Röhren-Effekte“ (fx).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDecor, SPECS } from '../src/js/live/ui/decor.js';
import { buildTv } from '../src/js/live/ui/tv.js';
import { createApp } from '../src/js/live/ui/app.js';
import { createMenu } from '../src/js/live/ui/menu.js';

const T0 = Date.UTC(2026, 10, 11, 20, 15, 0);

function make(style = 'crt80') {
  const refs = buildTv({ style, doc: document });
  document.body.append(refs.app);
  const decor = createDecor({ room: refs.room, tv: refs.tv, screen: refs.screen, doc: document });
  return { refs, decor };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('createDecor: Ebenen', () => {
  it('legt drei aria-hidden-Ebenen an der richtigen Stelle an', () => {
    const { refs, decor } = make();
    const { room, tv, screen } = refs;
    expect(room.firstElementChild).toBe(decor.el);
    expect(decor.el.classList.contains('lfx-live-decor')).toBe(true);
    expect(decor.el.getAttribute('aria-hidden')).toBe('true');
    expect(tv.lastElementChild).toBe(decor.layers.tv);
    expect(decor.layers.tv.className).toBe('lfx-live-tv__deco');
    expect(decor.layers.tv.getAttribute('aria-hidden')).toBe('true');
    const glass = screen.querySelector(':scope > .lfx-live-screen__glass');
    expect(glass).toBe(decor.layers.glass);
    expect(glass.getAttribute('aria-hidden')).toBe('true');
    const kids = [...screen.children];
    expect(kids.indexOf(glass)).toBeGreaterThan(kids.indexOf(refs.noise));
    expect(kids.indexOf(glass)).toBeLessThan(kids.indexOf(refs.overlay));
  });

  it('flat/plain/unbekannt: Ebenen leer', () => {
    const { decor } = make('flat');
    for (const s of ['flat', 'plain', 'xyz']) {
      decor.setStyle(s);
      expect(decor.layers.room.children.length).toBe(0);
      expect(decor.layers.tv.children.length).toBe(0);
      expect(decor.layers.glass.children.length).toBe(0);
    }
  });

  it('Stilwechsel baut neu: crt80 → flat leer → silver', () => {
    const { decor } = make();
    decor.setStyle('crt80');
    expect(decor.el.querySelector('[data-display="vcr"]')).toBeTruthy();
    expect(decor.el.querySelector('[data-display="dvd"]')).toBeNull();
    const old = decor.el.querySelector('[data-display="vcr"]');
    decor.setStyle('flat');
    expect(decor.el.children.length).toBe(0);
    expect(old.isConnected).toBe(false);
    decor.setStyle('silver');
    expect(decor.el.querySelector('[data-display="vcr"]')).toBeNull();
    expect(decor.el.querySelector('[data-display="dvd"]')).toBeTruthy();
    expect(decor.el.querySelector('[data-display="rcv"]')).toBeTruthy();
  });

  it('baut Spezifikationen: cls, children, text, count', () => {
    const { decor } = make();
    const spec = SPECS.crt80;
    const saved = { room: spec.room, tv: spec.tv, glass: spec.glass };
    spec.room = [{ cls: 'lfx-live-d-a', children: [{ cls: 'lfx-live-d-b', tag: 'span', text: 'x' }] }];
    spec.tv = [{ cls: 'lfx-live-d-keys', count: 4 }];
    spec.glass = [{ cls: 'lfx-live-d-gl' }];
    try {
      decor.setStyle('crt80');
      expect(decor.layers.room.querySelector('.lfx-live-d-a > span.lfx-live-d-b').textContent).toBe('x');
      const keys = decor.layers.tv.querySelectorAll('.lfx-live-d-keys > .lfx-live-d__i');
      expect(keys.length).toBe(4);
      expect(keys[2].style.getPropertyValue('--i')).toBe('3');
      expect(decor.layers.glass.querySelector('.lfx-live-d-gl')).toBeTruthy();
    } finally {
      Object.assign(spec, saved);
    }
  });

  it('dispose entfernt alle Ebenen', () => {
    const { refs, decor } = make();
    decor.dispose();
    expect(refs.app.querySelector('.lfx-live-decor, .lfx-live-tv__deco, .lfx-live-screen__glass')).toBeNull();
  });
});

describe('createDecor: Anzeigen und Uhr', () => {
  const txt = (decor, k) => decor.el.querySelector(`[data-display="${k}"]`).textContent;

  it('vcr/dvd/rcv folgen Zustand, Uhrzeit und Sender', () => {
    const { decor } = make('silver');
    decor.setStyle('silver');
    decor.setDisplays({ on: false, clock: '20:15', ch: 5 });
    expect(txt(decor, 'dvd')).toBe('');
    expect(txt(decor, 'rcv')).toBe('');
    decor.setDisplays({ on: true, clock: '20:15', ch: 5 });
    expect(txt(decor, 'dvd')).toBe('20:15');
    expect(txt(decor, 'rcv')).toBe('P05');
    decor.setDisplays({ ch: 12 });
    expect(txt(decor, 'rcv')).toBe('P12');
    expect(decor.layers.tv.dataset.ch).toBe('12');
    decor.setStyle('crt80');
    expect(txt(decor, 'vcr')).toBe('20:15');
    decor.setDisplays({ on: false });
    expect(txt(decor, 'vcr')).toBe('--:--');
    expect(decor.layers.tv.dataset.ch).toBe('');
  });

  it('Wanduhr-Variablen an .lfx-live-decor', () => {
    const { decor } = make();
    decor.setDisplays({ clock: '20:15' });
    expect(decor.el.style.getPropertyValue('--lfx-live-clock-h')).toBe(String(8 * 30 + 7.5));
    expect(decor.el.style.getPropertyValue('--lfx-live-clock-m')).toBe('90');
    decor.setDisplays({ clock: '00:00' });
    expect(decor.el.style.getPropertyValue('--lfx-live-clock-h')).toBe('0');
  });

  it('schreibt unveränderten Text nicht erneut', () => {
    const { decor } = make();
    decor.setStyle('crt80');
    decor.setDisplays({ on: true, clock: '20:15' });
    const el = decor.el.querySelector('[data-display="vcr"]');
    const node = el.firstChild;
    decor.setDisplays({ on: true, clock: '20:15' });
    expect(el.firstChild).toBe(node);
    decor.setDisplays({ on: true, clock: '20:16' });
    expect(el.textContent).toBe('20:16');
  });
});

const fakeMenu = (store) => (c) => {
  store.ctx = c;
  return { el: document.createElement('div'), open() {}, close() {}, isOpen: () => false, onKey: () => false };
};

describe('App: Dekor und Pref fx', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete window.__lfxLive;
  });

  function mk(over = {}) {
    const host = document.createElement('div');
    document.body.append(host);
    const clock = { t: T0 };
    const channels = Array.from({ length: 18 }, (_, i) => ({ no: i + 1, key: `k${i}`, name: `LIVE ${i + 1}`, kind: 'movies' }));
    const scheduler = {
      channels: () => channels,
      item: () => null,
      nowOn: (no, t) => {
        const start = Math.floor(t / 3600000) * 3600000;
        return { entry: { type: 'closedown', start, end: start + 3600000, reason: 'empty' }, offsetMs: t - start };
      },
    };
    const player = {
      play: vi.fn(async () => ({ ok: true })), playUrl: vi.fn(async () => ({ ok: true })), stop: vi.fn(), on: vi.fn(() => () => {}),
      setVolume: vi.fn(), setMuted: vi.fn(), dispose: vi.fn(), unlock: vi.fn(), syncTo: vi.fn(),
    };
    const deps = { savePrefs: vi.fn(), toast: vi.fn(), previousThemeName: 'X', ...(over.deps || {}) };
    const opts = { style: 'silver', volume: 0.5, muted: false, lastChannel: 5, now: () => clock.t, ...(over.opts || {}) };
    const time = { formatClock: (t) => new Date(t).toISOString().slice(11, 16) };
    const app = createApp(host, { scheduler, player, watch: null, pickFiller: async () => ({ kind: 'card' }), overlays: over.overlays || {}, deps, opts, time });
    return { host, clock, app, deps, player };
  }
  const t = (env, k) => env.host.querySelector(`[data-display="${k}"]`).textContent;

  it('Dekor-Ebenen im Gerüst; Anzeigen folgen Ein/Aus, Sender und Minutentakt', async () => {
    const env = mk();
    const room = env.host.querySelector('.lfx-live-room');
    expect(room.firstElementChild.classList.contains('lfx-live-decor')).toBe(true);
    expect(t(env, 'dvd')).toBe('');
    env.app.press('power');
    expect(t(env, 'dvd')).toBe('20:15');
    expect(t(env, 'rcv')).toBe('P05');
    env.app.tune(7);
    expect(t(env, 'rcv')).toBe('P07');
    env.clock.t = T0 + 60000;
    await vi.advanceTimersByTimeAsync(61000);
    expect(t(env, 'dvd')).toBe('20:16');
    env.app.press('power');
    expect(t(env, 'dvd')).toBe('');
    expect(t(env, 'rcv')).toBe('');
  });

  it('Stilwechsel über ctx.setStyle: crt80 → flat → silver', () => {
    const st = {};
    const env = mk({ opts: { style: 'crt80' }, overlays: { menu: fakeMenu(st) } });
    expect(env.host.querySelector('[data-display="vcr"]')).toBeTruthy();
    env.app.press('menu');
    st.ctx.setStyle('flat');
    expect(env.host.querySelector('.lfx-live-decor').children.length).toBe(0);
    st.ctx.setStyle('silver');
    expect(env.host.querySelector('[data-display="dvd"]')).toBeTruthy();
    expect(env.host.querySelector('[data-display="vcr"]')).toBeNull();
  });

  it('fx: Klasse no-tubefx, toggleFx speichert { fx }', () => {
    const a = mk();
    expect(a.host.querySelector('.lfx-live-app').classList.contains('no-tubefx')).toBe(false);
    const b = mk({ opts: { fx: false } });
    expect(b.host.querySelector('.lfx-live-app').classList.contains('no-tubefx')).toBe(true);
    const st = {};
    const c = mk({ overlays: { menu: fakeMenu(st) } });
    c.app.press('menu');
    expect(st.ctx.fxEnabled()).toBe(true);
    expect(st.ctx.toggleFx()).toBe(false);
    expect(c.host.querySelector('.lfx-live-app').classList.contains('no-tubefx')).toBe(true);
    expect(c.deps.savePrefs).toHaveBeenCalledWith({ fx: false });
    expect(st.ctx.toggleFx()).toBe(true);
    expect(c.host.querySelector('.lfx-live-app').classList.contains('no-tubefx')).toBe(false);
  });

  it('dispose räumt die Ebenen auf', () => {
    const env = mk();
    env.app.dispose();
    expect(document.querySelector('.lfx-live-decor, .lfx-live-tv__deco, .lfx-live-screen__glass')).toBeNull();
  });
});

describe('Menü: Röhren-Effekte', () => {
  function ctxOf(style) {
    let on = true;
    return {
      scheduler: { channels: () => [], genres: () => [] },
      channels: () => [],
      currentChannel: () => 1,
      styles: [{ id: 'flat', name: 'Flachbild' }],
      style: () => style,
      setStyle: vi.fn(),
      closeOverlay: vi.fn(),
      tune: vi.fn(),
      leaveToLibrary: vi.fn(),
      openThemePicker: vi.fn(),
      openDashboard: vi.fn(),
      logout: vi.fn(),
      toast: vi.fn(),
      fxEnabled: () => on,
      toggleFx: vi.fn(() => { on = !on; return on; }),
    };
  }
  const labels = (m) => [...m.el.querySelectorAll('.lfx-live-menu__label')].map((e) => e.textContent);
  const open = (ctx) => {
    document.body.innerHTML = '';
    const m = createMenu(ctx);
    document.body.append(m.el);
    m.open();
    return m;
  };

  it('nur bei crt80 und silver sichtbar', () => {
    expect(labels(open(ctxOf('flat')))).not.toContain('Röhren-Effekte');
    expect(labels(open(ctxOf('plain')))).not.toContain('Röhren-Effekte');
    expect(labels(open(ctxOf('crt80')))).toContain('Röhren-Effekte');
    expect(labels(open(ctxOf('silver')))).toContain('Röhren-Effekte');
  });

  it('schaltet um, zeigt An/Aus und meldet per Toast', () => {
    const ctx = ctxOf('crt80');
    const m = open(ctx);
    const item = () => [...m.el.querySelectorAll('.lfx-live-menu__item')].find((b) => b.querySelector('.lfx-live-menu__label').textContent === 'Röhren-Effekte');
    expect(item().querySelector('.lfx-live-menu__value').textContent).toBe('An');
    item().click();
    expect(ctx.toggleFx).toHaveBeenCalledTimes(1);
    expect(ctx.toast).toHaveBeenCalledWith('Röhren-Effekte aus.');
    expect(item().querySelector('.lfx-live-menu__value').textContent).toBe('Aus');
  });
});

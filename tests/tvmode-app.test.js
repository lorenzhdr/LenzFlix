// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const made = vi.hoisted(() => ({ list: [] }));
const build = vi.hoisted(() => (name, a, extra = {}) => {
  const c = { name, args: a, el: document.createElement('div'), update: () => {}, tick: () => {}, destroy: () => {}, ...extra };
  c.update = vi.fn();
  c.tick = vi.fn();
  c.destroy = vi.fn();
  made.list.push(c);
  return c;
});
vi.mock('../src/js/live/tvmode/player-view.js', () => ({
  createPlayerView: (a) => {
    const c = build('player', a);
    c.el.className = 'lfx-tvm__player';
    const slot = document.createElement('div');
    slot.className = 'lfx-tvm__video-slot';
    c.el.append(slot);
    return c;
  },
}));
vi.mock('../src/js/live/tvmode/channel-list.js', () => ({ createChannelList: (a) => build('list', a), createChannelBadge: (d) => d.createElement('span') }));
vi.mock('../src/js/live/tvmode/epg-grid.js', () => ({ createEpgGrid: (a) => build('epg', a) }));
vi.mock('../src/js/live/tvmode/info-card.js', () => ({ createInfoCard: (a) => build('card', a, { open: vi.fn() }) }));

import { createApp, bindModel } from '../src/js/live/tvmode/app.js';

const T = Date.UTC(2026, 10, 11, 19, 0, 0);
const PHONE = '(max-width: 799px)';
const LAND = '(orientation: landscape) and (max-height: 500px)';
const get = (n) => made.list.find((c) => c.name === n);
let host;
let handlers;
let ctl;
let snap;
let scheduler;
let mqs;

function fakeMatchMedia() {
  mqs = {};
  window.matchMedia = (q) => {
    const m = { matches: false, _l: new Set(), media: q, addEventListener: (_, f) => m._l.add(f), removeEventListener: (_, f) => m._l.delete(f) };
    mqs[q] = m;
    return m;
  };
}
const setMq = (q, v) => { mqs[q].matches = v; for (const f of [...mqs[q]._l]) f({ matches: v }); };
const emit = (n, ...a) => { for (const f of [...(handlers[n] || [])]) f(...a); };
const mount = (opts = {}, extra = {}) => createApp(host, { scheduler, ctl, video: document.createElement('video'), pip: null, deps: {}, opts: { now: () => T, ...opts }, ...extra });

beforeEach(() => {
  made.list.length = 0;
  document.body.innerHTML = '<div id="h" class="lfx-tvm"></div>';
  host = document.getElementById('h');
  handlers = {};
  snap = { on: true, channel: 1, entry: null, phase: 'playing', card: null, muted: false, volume: 100 };
  ctl = {
    state: () => snap,
    on: (n, f) => { (handlers[n] = handlers[n] || new Set()).add(f); return () => handlers[n].delete(f); },
    tune: vi.fn(), zap: vi.fn(), toggleMute: vi.fn(),
  };
  scheduler = { channels: () => [], item: () => null, nowOn: () => ({ entry: null }) };
  fakeMatchMedia();
});
afterEach(() => { vi.useRealTimers(); });

describe('app: Gerüst und Klassen', () => {
  it('baut das BEM-Gerüst und verdrahtet update/tick', () => {
    const app = mount();
    expect(host.querySelector('.lfx-tvm__stage > .lfx-tvm__main > .lfx-tvm__player')).not.toBeNull();
    expect(host.querySelector('.lfx-tvm__main > .lfx-tvm__info')).not.toBeNull();
    expect(host.querySelector('.lfx-tvm__side > .lfx-tvm__tabs[role=tablist]')).not.toBeNull();
    expect(host.querySelector('.lfx-tvm__side > .lfx-tvm__list')).not.toBeNull();
    expect(host.querySelector('.lfx-tvm__stage > .lfx-tvm__epg')).not.toBeNull();
    expect(host.querySelector('.lfx-tvm__infocard')).not.toBeNull();
    expect(host.querySelector('.lfx-tvm__toast')).not.toBeNull();
    expect(app.slot()).not.toBeNull();
    expect(get('list').update).toHaveBeenCalledWith(snap);
    emit('tick', T);
    expect(get('epg').tick).toHaveBeenCalledWith(T);
    snap = { ...snap, phase: 'error' };
    emit('change', snap);
    expect(host.classList.contains('is-error')).toBe(true);
    expect(host.classList.contains('is-paused-card')).toBe(true);
    expect(host.classList.contains('is-playing')).toBe(false);
    expect(host.classList.contains('is-on')).toBe(true);
  });

  it('reicht die Optionen an die Komponenten durch (details, onInfo, Modell)', () => {
    mount({ touch: true });
    const l = get('list').args;
    expect(l.opts.details).toBeTruthy();
    expect(l.opts.touch).toBe(true);
    expect(typeof l.model.nowAll).toBe('function');
    get('epg').args.opts.onInfo({ no: 2 });
    expect(get('card').open).toHaveBeenCalledWith({ no: 2 });
    expect(get('player').args.opts.digits.on).toBeTypeOf('function');
    expect(host.classList.contains('is-touch')).toBe(true);
  });

  it('Handy per Media Query, Querformat nur mit Handy', () => {
    mount();
    expect(host.classList.contains('is-phone')).toBe(false);
    setMq(LAND, true);
    expect(host.classList.contains('is-landscape')).toBe(false);
    setMq(PHONE, true);
    expect(host.classList.contains('is-phone')).toBe(true);
    expect(host.classList.contains('is-landscape')).toBe(true);
    setMq(LAND, false);
    expect(host.classList.contains('is-landscape')).toBe(false);
  });

  it('opts.phone erzwingt is-phone', () => {
    mount({ phone: true });
    expect(host.classList.contains('is-phone')).toBe(true);
  });

  it('Tabs: Standard „Jetzt im TV“, Wechsel setzt genau eine Klasse, Rückkehr aktualisiert die Liste', () => {
    mount({ phone: true });
    expect(host.classList.contains('is-tab-now')).toBe(true);
    host.querySelector('.lfx-tvm__tab--epg').click();
    expect(host.classList.contains('is-tab-epg')).toBe(true);
    expect(host.classList.contains('is-tab-now')).toBe(false);
    expect(host.querySelector('.lfx-tvm__tab--epg').getAttribute('aria-selected')).toBe('true');
    get('list').update.mockClear();
    host.querySelector('.lfx-tvm__tab--now').click();
    expect(get('list').update).toHaveBeenCalled();
    expect(host.querySelector('.lfx-tvm__tab--epg').classList.contains('is-active')).toBe(false);
  });

  it('message zeigt den Toast; Ziffern-Vorschau erreicht digits.on', () => {
    vi.useFakeTimers();
    mount();
    emit('message', 'Hallo');
    const t = host.querySelector('.lfx-tvm__toast');
    expect(t.textContent).toBe('Hallo');
    expect(t.classList.contains('is-visible')).toBe(true);
    vi.advanceTimersByTime(4000);
    expect(t.classList.contains('is-visible')).toBe(false);
    const seen = [];
    get('player').args.opts.digits.on((x) => seen.push(x));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    expect(seen).toEqual(['1_']);
  });

  it('Tastatur ist bei offener Info-Karte und keysBlocked gesperrt', () => {
    let blocked = false;
    mount({}, { deps: { keysBlocked: () => blocked } });
    const key = () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    key();
    expect(ctl.zap).toHaveBeenCalledTimes(1);
    blocked = true;
    key();
    blocked = false;
    get('card').el.classList.add('is-open');
    key();
    expect(ctl.zap).toHaveBeenCalledTimes(1);
  });

  it('Overlay überlagert den Snapshot nur für die Komponenten', () => {
    const app = mount();
    app.setOverlay({ phase: 'pause' });
    expect(get('list').update).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'pause', on: true }));
    expect(ctl.state().phase).toBe('playing');
    app.setOverlay(null);
    expect(get('list').update).toHaveBeenLastCalledWith(snap);
  });

  it('suspend stoppt UI-Updates, resume dockt an neuen Host an', () => {
    const app = mount({ phone: true });
    app.suspend();
    get('list').update.mockClear();
    emit('change', snap);
    expect(get('list').update).not.toHaveBeenCalled();
    const h2 = document.createElement('div');
    h2.className = 'lfx-tvm';
    document.body.append(h2);
    app.resume(h2);
    expect(h2.querySelector('.lfx-tvm__stage')).not.toBeNull();
    expect(host.querySelector('.lfx-tvm__stage')).toBeNull();
    expect(h2.classList.contains('is-phone')).toBe(true);
    expect(host.classList.contains('is-phone')).toBe(false);
    expect(get('list').update).toHaveBeenCalled();
  });

  it('dispose räumt Klassen, Listener und Komponenten auf', () => {
    const app = mount({ phone: true });
    app.dispose();
    expect(host.className).toBe('lfx-tvm');
    expect(host.querySelector('.lfx-tvm__stage')).toBeNull();
    expect(get('list').destroy).toHaveBeenCalled();
    expect(mqs[PHONE]._l.size).toBe(0);
    expect(handlers.change.size).toBe(0);
    get('list').update.mockClear();
    emit('change', snap);
    expect(get('list').update).not.toHaveBeenCalled();
  });
});

describe('bindModel', () => {
  it('lässt das Scheduler-Argument weg', () => {
    const m = bindModel({ channels: (D) => [D], item: (id) => ({ id }), nowOn: () => ({ entry: null }) });
    expect(m.channels(5)).toEqual([5]);
    expect(m.item('a')).toEqual({ id: 'a' });
    expect(m.days(T)).toHaveLength(7);
  });
});

describe('app: Messanzeige (opts.zapStats)', () => {
  it('ohne Option kein DOM', () => {
    mount();
    expect(host.querySelector('.lfx-zapstats')).toBeNull();
  });

  it('mit Option: Box im Player, gefüttert aus zap und change, destroy räumt ab', () => {
    ctl.volumeMode = () => 'mute-only';
    const app = mount({ zapStats: true });
    const box = host.querySelector('.lfx-tvm__player .lfx-zapstats');
    expect(box).not.toBeNull();
    expect(box.children[1].textContent).toContain('Ton: mute-only');
    emit('zap', { channel: 3, ok: true, keyMs: 1500, timing: { totalMs: 1200, infoMs: 100, loadMs: 900, startMs: 200, chain: 'D', cached: false } });
    expect(box.children[0].textContent).toContain('Sender 3 · 1,2 s · D');
    snap = { ...snap, volume: 0 };
    emit('change', snap);
    expect(box.children[1].textContent).toContain('Regler 0');
    app.dispose();
    expect(host.querySelector('.lfx-zapstats')).toBeNull();
  });
});

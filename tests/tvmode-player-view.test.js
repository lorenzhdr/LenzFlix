// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPlayerView, ZAP_MS, CONTROLS_MS, LOADING_DELAY_MS } from '../src/js/live/tvmode/player-view.js';

const snap = (o = {}) => ({
  on: true, channel: 3, entry: { itemId: 'x' }, phase: 'playing', reason: null, card: null,
  banner: null, needsTap: false, mutedByPolicy: false, volume: 50, muted: false, ...o,
});

function setup({ opts = {}, model } = {}) {
  const ctl = {
    volumeSupported: true, zap: vi.fn(), retry: vi.fn(), gesture: vi.fn(), setVolume: vi.fn(),
    toggleMute: vi.fn(), tracks: () => ({ audio: [], subs: [], audioIndex: 0, subtitleIndex: -1 }),
  };
  const pipCbs = [];
  const pip = {
    supported: () => true, active: vi.fn(() => false), enter: vi.fn(), exit: vi.fn(), toggle: vi.fn(),
    on: vi.fn((fn) => { pipCbs.push(fn); return () => pipCbs.splice(pipCbs.indexOf(fn), 1); }),
  };
  const fullscreen = { toggle: vi.fn(), active: () => false };
  const digitCbs = [];
  const digits = { on: (fn) => { digitCbs.push(fn); return () => digitCbs.splice(digitCbs.indexOf(fn), 1); } };
  const video = document.createElement('video');
  const m = model === undefined
    ? {
        nowAll: () => [{ channel: { no: 3, key: 'kino', name: 'LIVE Kino' } }],
        describe: () => ({ title: 'Titel A', sub: 'S1 E2', time: '20:15–22:05', progress: 0.5 }),
      }
    : model;
  const v = createPlayerView({ doc: document, ctl, model: m, opts: { video, pip, fullscreen, digits, ...opts } });
  document.body.appendChild(v.el);
  return { v, ctl, pip, pipCbs, fullscreen, digitCbs, video };
}

const ptr = (type, o = {}) => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerType: 'touch', clientX: 100, clientY: 100, pointerId: 1 }, o);
  return e;
};
const swipe = (el, dy, dx = 0, pointerType = 'touch') => {
  el.dispatchEvent(ptr('pointerdown', { pointerType }));
  el.dispatchEvent(ptr('pointerup', { pointerType, clientX: 100 + dx, clientY: 100 + dy }));
};

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.useRealTimers();
});

describe('player-view Grundaufbau', () => {
  it('hängt das Video in den Slot', () => {
    const { v, video } = setup();
    expect(v.el.querySelector('.lfx-tvm__video-slot').contains(video)).toBe(true);
    expect(video.classList.contains('lfx-tvm__video')).toBe(true);
    expect(v.el.className).not.toMatch(/lfx-live|lfx-card/);
  });
});

describe('Zustandskarten', () => {
  it.each([
    [{ kind: 'next', title: 'Film', at: '20:15', atMs: 1 }, 'next', 'Gleich: Film · 20:15'],
    [{ kind: 'pause', text: 'Gleich geht es weiter' }, 'pause', 'Gleich geht es weiter'],
    [{ kind: 'closedown', text: 'Sendepause', until: '05:00' }, 'closedown', 'Sendepause'],
    [{ kind: 'empty', text: 'Auf diesem Sender läuft gerade nichts' }, 'empty', 'Auf diesem Sender läuft gerade nichts'],
  ])('Karte %#', (card, kind, text) => {
    const { v } = setup();
    v.update(snap({ phase: 'pause', card }));
    const el = v.el.querySelector(`.lfx-tvm__card--${kind}`);
    expect(el).not.toBeNull();
    expect(el.textContent).toContain(text);
    expect(el.querySelector('button')).toBeNull();
    if (kind === 'closedown') expect(el.textContent).toContain('Weiter um 05:00');
    v.update(snap());
    expect(v.el.querySelector('.lfx-tvm__card')).toBeNull();
  });

  it('Fehlerkarte mit „Erneut versuchen“ ruft retry', () => {
    const { v, ctl } = setup();
    v.update(snap({ phase: 'error', reason: 'network', card: { kind: 'error', reason: 'network', title: 'Kein Empfang', sub: 'Netz weg' } }));
    const c = v.el.querySelector('.lfx-tvm__card--error');
    expect(c.textContent).toContain('Kein Empfang');
    expect(c.textContent).toContain('Netz weg');
    c.querySelector('button').click();
    expect(ctl.retry).toHaveBeenCalled();
  });

  it('Fehlerkarte reason gesture: --tap, Knopf ruft gesture', () => {
    const { v, ctl } = setup();
    v.update(snap({ phase: 'error', needsTap: true, reason: 'gesture', card: { kind: 'error', reason: 'gesture', title: 'Zum Starten tippen', sub: '' } }));
    const c = v.el.querySelector('.lfx-tvm__card--tap');
    expect(c).not.toBeNull();
    c.querySelector('button').click();
    expect(ctl.gesture).toHaveBeenCalled();
    expect(ctl.retry).not.toHaveBeenCalled();
    expect(v.el.querySelector('.lfx-tvm__tap').hidden).toBe(true);
  });

  it('needsTap ohne Karte: großer Knopf ruft gesture', () => {
    const { v, ctl } = setup();
    v.update(snap({ needsTap: true }));
    const b = v.el.querySelector('.lfx-tvm__tap');
    expect(b.hidden).toBe(false);
    expect(b.textContent).toBe('Zum Starten tippen');
    b.click();
    expect(ctl.gesture).toHaveBeenCalledTimes(1);
  });

  it('mutedByPolicy: „Ton an“ ruft gesture; Banner wird angezeigt', () => {
    const { v, ctl } = setup();
    v.update(snap({ mutedByPolicy: true, muted: true, banner: 'Füllprogramm' }));
    const b = v.el.querySelector('.lfx-tvm__unmute');
    expect(b.hidden).toBe(false);
    b.click();
    expect(ctl.gesture).toHaveBeenCalled();
    expect(v.el.querySelector('.lfx-tvm__banner').textContent).toBe('Füllprogramm');
    expect(v.el.classList.contains('is-muted')).toBe(true);
    v.update(snap());
    expect(v.el.querySelector('.lfx-tvm__unmute').hidden).toBe(true);
    expect(v.el.querySelector('.lfx-tvm__banner').hidden).toBe(true);
  });

  it('Ladezustand: Spinner erst nach 300 ms', () => {
    const { v } = setup();
    v.update(snap({ phase: 'loading' }));
    const l = v.el.querySelector('.lfx-tvm__loading');
    expect(v.el.classList.contains('is-loading')).toBe(true);
    expect(l.hidden).toBe(true);
    vi.advanceTimersByTime(LOADING_DELAY_MS - 1);
    expect(l.hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect(l.hidden).toBe(false);
    v.update(snap());
    expect(l.hidden).toBe(true);
    expect(v.el.classList.contains('is-loading')).toBe(false);
  });
});

describe('Bild-in-Bild', () => {
  it('Karte erscheint bei aktivem PiP, „Zurückholen“ ruft exit, Video bleibt draußen', () => {
    const { v, pip, pipCbs, video } = setup();
    const card = v.el.querySelector('.lfx-tvm__pip-card');
    expect(card.hidden).toBe(true);
    pip.active.mockReturnValue(true);
    const bg = document.createElement('div');
    bg.appendChild(video);
    pipCbs.forEach((f) => f());
    expect(card.hidden).toBe(false);
    expect(v.el.classList.contains('is-pip')).toBe(true);
    v.update(snap());
    expect(bg.contains(video)).toBe(true);
    expect(card.textContent).toContain('Läuft im Bild-in-Bild');
    card.querySelector('.lfx-tvm__btn--pip-back').click();
    expect(pip.exit).toHaveBeenCalled();
    pip.active.mockReturnValue(false);
    pipCbs.forEach((f) => f());
    expect(card.hidden).toBe(true);
    expect(v.el.querySelector('.lfx-tvm__video-slot').contains(video)).toBe(true);
  });
});

describe('Zapp-Einblendung', () => {
  it('erscheint beim Start und bei Kanalwechsel, verschwindet nach 4 s', () => {
    const { v } = setup();
    v.update(snap({ on: false }));
    expect(v.el.classList.contains('is-zapping')).toBe(false);
    v.update(snap());
    expect(v.el.classList.contains('is-zapping')).toBe(true);
    expect(v.el.querySelector('.lfx-tvm__zap-no').textContent).toBe('3');
    expect(v.el.querySelector('.lfx-tvm__zap-name').textContent).toBe('KINO');
    expect(v.el.querySelector('.lfx-tvm__zap-title').textContent).toBe('Titel A');
    expect(v.el.querySelector('.lfx-tvm__zap-time').textContent).toBe('20:15–22:05');
    expect(v.el.querySelector('.lfx-tvm__zap-fill').style.width).toBe('50%');
    vi.advanceTimersByTime(ZAP_MS - 1);
    expect(v.el.classList.contains('is-zapping')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(v.el.classList.contains('is-zapping')).toBe(false);
    v.update(snap({ volume: 60 }));
    expect(v.el.classList.contains('is-zapping')).toBe(false);
    v.update(snap({ channel: 4 }));
    expect(v.el.classList.contains('is-zapping')).toBe(true);
    expect(v.el.querySelector('.lfx-tvm__zap-no').textContent).toBe('4');
  });

  it('funktioniert ohne Modell', () => {
    const { v } = setup({ model: null });
    v.update(snap());
    expect(v.el.classList.contains('is-zapping')).toBe(true);
  });

  it('Ziffernanzeige', () => {
    const { v, digitCbs } = setup();
    const d = v.el.querySelector('.lfx-tvm__digits');
    expect(d.hidden).toBe(true);
    digitCbs.forEach((f) => f('1_'));
    expect(d.textContent).toBe('1_');
    expect(d.hidden).toBe(false);
    digitCbs.forEach((f) => f(null));
    expect(d.hidden).toBe(true);
  });
});

describe('Gesten und Bedienleiste', () => {
  it('Wischen hoch/runter zappt nur bei touch', () => {
    const { v, ctl } = setup();
    swipe(v.el, -60);
    expect(ctl.zap).toHaveBeenLastCalledWith(1);
    swipe(v.el, 60);
    expect(ctl.zap).toHaveBeenLastCalledWith(-1);
    ctl.zap.mockClear();
    swipe(v.el, -80, 0, 'mouse');
    swipe(v.el, -30);
    swipe(v.el, -60, 90);
    expect(ctl.zap).not.toHaveBeenCalled();
  });

  it('Tippen schaltet die Bedienung ein/aus, Ausblenden nach 3 s', () => {
    const { v } = setup();
    swipe(v.el, 0);
    expect(v.el.classList.contains('is-controls')).toBe(true);
    vi.advanceTimersByTime(CONTROLS_MS);
    expect(v.el.classList.contains('is-controls')).toBe(false);
    vi.advanceTimersByTime(1000); // Doppeltipp-Fenster nutzt echte Zeit, hier egal
    v.el.dispatchEvent(ptr('pointermove', { pointerType: 'mouse' }));
    expect(v.el.classList.contains('is-controls')).toBe(true);
  });

  it('bleibt sichtbar, solange das Menü offen oder der Fokus in der Leiste ist', () => {
    const { v, ctl } = setup();
    ctl.tracks = () => ({ audio: [{ index: 0, label: 'A' }, { index: 1, label: 'B' }], subs: [], audioIndex: 0, subtitleIndex: -1 });
    v.update(snap());
    v.el.dispatchEvent(ptr('pointermove', { pointerType: 'mouse' }));
    v.el.querySelector('.lfx-tvm__btn--tracks').click();
    expect(v.controls.isMenuOpen()).toBe(true);
    vi.advanceTimersByTime(CONTROLS_MS * 3);
    expect(v.el.classList.contains('is-controls')).toBe(true);
    v.controls.closeMenu();
    document.activeElement.blur();
    v.el.querySelector('.lfx-tvm__btn--mute').focus();
    vi.advanceTimersByTime(CONTROLS_MS * 3);
    expect(v.el.classList.contains('is-controls')).toBe(true);
    v.el.querySelector('.lfx-tvm__btn--mute').blur();
    vi.advanceTimersByTime(CONTROLS_MS);
    expect(v.el.classList.contains('is-controls')).toBe(false);
  });

  it('Doppelklick schaltet Vollbild', () => {
    const { v, fullscreen } = setup();
    v.el.dispatchEvent(new Event('dblclick', { bubbles: true }));
    expect(fullscreen.toggle).toHaveBeenCalledTimes(1);
  });

  it('Klick auf Knöpfe der Leiste löst kein Vollbild/Wischen aus', () => {
    const { v, ctl, fullscreen } = setup();
    const b = v.el.querySelector('.lfx-tvm__btn--mute');
    b.dispatchEvent(new Event('dblclick', { bubbles: true }));
    expect(fullscreen.toggle).not.toHaveBeenCalled();
    b.dispatchEvent(ptr('pointerdown'));
    b.dispatchEvent(ptr('pointerup', { clientY: 20 }));
    expect(ctl.zap).not.toHaveBeenCalled();
  });
});

describe('destroy', () => {
  it('räumt Timer, Listener und DOM auf', () => {
    const { v, ctl, pip, pipCbs, digitCbs } = setup();
    v.update(snap({ phase: 'loading' }));
    v.el.dispatchEvent(ptr('pointermove', { pointerType: 'mouse' }));
    v.destroy();
    expect(vi.getTimerCount()).toBe(0);
    expect(v.el.isConnected).toBe(false);
    expect(pipCbs.length).toBe(0);
    expect(digitCbs.length).toBe(0);
    expect(pip.on).toHaveBeenCalled();
    swipe(v.el, -80);
    expect(ctl.zap).not.toHaveBeenCalled();
    v.update(snap({ channel: 9 }));
    expect(vi.getTimerCount()).toBe(0);
    v.destroy();
  });
});

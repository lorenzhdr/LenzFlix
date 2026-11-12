// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPlayerView } from '../src/js/live/tvmode/player-view.js';

const ptr = (type, o = {}) => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerType: 'touch', clientX: 100, clientY: 100, pointerId: 1 }, o);
  return e;
};
const tapOn = (target) => {
  target.dispatchEvent(ptr('pointerdown'));
  target.dispatchEvent(ptr('pointerup'));
};

function setup(opts = {}) {
  const ctl = { volumeSupported: true, zap: vi.fn(), retry: vi.fn(), gesture: vi.fn(), setVolume: vi.fn(), toggleMute: vi.fn(), tracks: () => ({ audio: [], subs: [], audioIndex: 0, subtitleIndex: -1 }) };
  const fullscreen = { toggle: vi.fn(), active: () => false, isOn: () => false };
  const v = createPlayerView({ doc: document, ctl, model: null, opts: { video: document.createElement('video'), fullscreen, ...opts } });
  document.body.appendChild(v.el);
  return { v, ctl, fullscreen };
}

beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = ''; delete document.fullscreenEnabled; delete document.webkitFullscreenEnabled; });
afterEach(() => { vi.useRealTimers(); delete document.fullscreenEnabled; delete document.webkitFullscreenEnabled; });

describe('Doppeltipp = Vollbild nur mit echtem Element-Vollbild', () => {
  it('ohne Element-Vollbild (iOS-Safari/jsdom): kein Vollbild per Doppeltipp', () => {
    const { v, fullscreen } = setup();
    tapOn(v.el);
    tapOn(v.el);
    expect(fullscreen.toggle).not.toHaveBeenCalled();
  });

  it('mit fullscreenEnabled und requestFullscreen am Root: Doppeltipp schaltet', () => {
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
    document.documentElement.requestFullscreen = vi.fn();
    const { v, fullscreen } = setup();
    tapOn(v.el);
    tapOn(v.el);
    expect(fullscreen.toggle).toHaveBeenCalledTimes(1);
    delete document.documentElement.requestFullscreen;
  });

  it('fullscreenEnabled true, aber kein requestFullscreen: nichts', () => {
    Object.defineProperty(document, 'fullscreenEnabled', { value: true, configurable: true });
    const { v, fullscreen } = setup();
    tapOn(v.el);
    tapOn(v.el);
    expect(fullscreen.toggle).not.toHaveBeenCalled();
  });

  it('opts.canNativeFullscreen überschreibt die Erkennung', () => {
    const { v, fullscreen } = setup({ canNativeFullscreen: () => true });
    tapOn(v.el);
    tapOn(v.el);
    expect(fullscreen.toggle).toHaveBeenCalledTimes(1);
  });

  it('Tipp auf die Zapp-Einblendung zählt nicht als erster (und nicht als zweiter) Tipp', () => {
    const { v, fullscreen } = setup({ canNativeFullscreen: () => true });
    const zap = v.el.querySelector('.lfx-tvm__zap');
    tapOn(zap);
    tapOn(v.el);
    expect(fullscreen.toggle).not.toHaveBeenCalled();
    tapOn(v.el); // zwei echte Tipps in Folge
    expect(fullscreen.toggle).toHaveBeenCalledTimes(1);
    tapOn(v.el);
    tapOn(zap);
    expect(fullscreen.toggle).toHaveBeenCalledTimes(1);
  });
});

describe('Fehlerkarte mit Code', () => {
  it('zeigt „Code: X“ unter dem Text; ohne Code kein Element', () => {
    const { v } = setup();
    const card = { kind: 'error', reason: 'video', title: 'Kein Empfang auf diesem Gerät', sub: 'Dieses Gerät kann den Sender nicht empfangen', code: 'V-RANGE' };
    v.update({ on: true, channel: 1, entry: null, phase: 'error', reason: 'video', card, banner: null, needsTap: false, mutedByPolicy: false, volume: 100, muted: false });
    const c = v.el.querySelector('.lfx-tvm__card-code');
    expect(c.textContent).toBe('Code: V-RANGE');
    v.update({ on: true, channel: 1, entry: null, phase: 'error', reason: 'video', card: { ...card, code: undefined }, banner: null, needsTap: false, mutedByPolicy: false, volume: 100, muted: false });
    expect(v.el.querySelector('.lfx-tvm__card-code')).toBeNull();
  });
});

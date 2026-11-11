// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { INTENT_TTL_MS, destroyUnlock, initUnlock, takeIntentVideo } from '../src/js/features/tvmode/unlock.js';

const fire = () => window.dispatchEvent(new CustomEvent('lfx:tvmode-intent'));
let playSpy;

beforeEach(() => {
  vi.useFakeTimers();
  playSpy = vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.reject(new Error('blocked')));
  initUnlock();
});
afterEach(() => {
  destroyUnlock();
  playSpy.mockRestore();
  vi.useRealTimers();
});

describe('tvmode unlock', () => {
  it('erzeugt bei Intent synchron ein playsinline-Video und ruft play()', () => {
    expect(takeIntentVideo()).toBe(null);
    fire();
    expect(playSpy).toHaveBeenCalledTimes(1);
    const v = takeIntentVideo();
    expect(v).toBeInstanceOf(HTMLVideoElement);
    expect(v.hasAttribute('playsinline')).toBe(true);
  });
  it('gibt das Video nur einmal heraus', () => {
    fire();
    expect(takeIntentVideo()).not.toBe(null);
    expect(takeIntentVideo()).toBe(null);
  });
  it('verfällt nach ca. 30 s', () => {
    fire();
    vi.advanceTimersByTime(INTENT_TTL_MS - 1);
    fire(); // neuer Intent setzt die Frist neu
    vi.advanceTimersByTime(INTENT_TTL_MS - 1);
    expect(takeIntentVideo()).not.toBe(null);
    fire();
    vi.advanceTimersByTime(INTENT_TTL_MS + 1);
    expect(takeIntentVideo()).toBe(null);
  });
  it('destroy entfernt den Listener und das Video', () => {
    fire();
    destroyUnlock();
    expect(takeIntentVideo()).toBe(null);
    fire();
    expect(takeIntentVideo()).toBe(null);
  });
  it('initUnlock ist idempotent', () => {
    initUnlock();
    fire();
    expect(playSpy).toHaveBeenCalledTimes(1);
  });
});

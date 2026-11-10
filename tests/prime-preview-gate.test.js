// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { autoPause, setPreviewHold } from '../src/js/features/prime/preview-gate.js';

let ioCb;
beforeEach(() => {
  ioCb = null;
  window.IntersectionObserver = vi.fn(function IO(cb) { ioCb = cb; this.observe = vi.fn(); this.disconnect = vi.fn(); });
  globalThis.IntersectionObserver = window.IntersectionObserver;
});
afterEach(() => { delete globalThis.IntersectionObserver; });

function fakeVideo() {
  const v = document.createElement('video');
  let paused = false;
  Object.defineProperty(v, 'paused', { get: () => paused });
  v.pause = vi.fn(() => { paused = true; });
  v.play = vi.fn(() => { paused = false; return Promise.resolve(); });
  return v;
}

describe('autoPause', () => {
  it('pausiert außerhalb des Viewports und läuft danach weiter', () => {
    const v = fakeVideo();
    const g = autoPause(v);
    ioCb([{ isIntersecting: true, intersectionRatio: 0.1 }]);
    expect(v.pause).toHaveBeenCalledTimes(1);
    ioCb([{ isIntersecting: true, intersectionRatio: 0.8 }]);
    expect(v.play).toHaveBeenCalledTimes(1);
    g.stop();
  });

  it('Hold-Event pausiert nur mit respectHold', () => {
    const a = fakeVideo();
    const b = fakeVideo();
    const ga = autoPause(a, { respectHold: true });
    const gb = autoPause(b);
    setPreviewHold(true);
    expect(a.pause).toHaveBeenCalled();
    expect(b.pause).not.toHaveBeenCalled();
    setPreviewHold(false);
    expect(a.play).toHaveBeenCalled();
    ga.stop(); gb.stop();
  });

  it('stop entfernt die Listener', () => {
    const a = fakeVideo();
    const g = autoPause(a, { respectHold: true });
    g.stop();
    setPreviewHold(true);
    expect(a.pause).not.toHaveBeenCalled();
  });
});

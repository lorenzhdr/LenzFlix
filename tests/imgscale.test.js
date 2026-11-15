// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getNormalScale, getSaverScale, setImageScales, resetImageScales, isImageScaleCustom, onImageScaleChange, DATASAVER_SCALE,
} from '../src/js/core/imgscale.js';
import { DATASAVER_SCALE as reexported } from '../src/js/core/datasaver.js';
import { imageUrlFor, setImageScale } from '../src/js/core/api.js';

let uid;
beforeEach(() => {
  window.localStorage.clear();
  uid = 'u1';
  window.ApiClient = { getCurrentUserId: () => uid, serverAddress: () => 'http://srv', accessToken: () => 'tok', serverId: () => 'sid' };
});
afterEach(() => {
  setImageScale(1);
  delete window.ApiClient;
});

describe('imgscale', () => {
  it('Standards: normal 1, saver exakt 2/3', () => {
    expect(getNormalScale()).toBe(1);
    expect(getSaverScale()).toBe(2 / 3);
    expect(reexported).toBe(DATASAVER_SCALE);
    expect(isImageScaleCustom()).toBe(false);
  });

  it('klemmt und rundet auf 0.05', () => {
    setImageScales({ normal: 5, saver: 0.01 });
    expect(getNormalScale()).toBe(2);
    expect(getSaverScale()).toBe(0.25);
    setImageScales({ normal: 0.77, saver: 0.82 });
    expect(getNormalScale()).toBe(0.75);
    expect(getSaverScale()).toBe(0.8);
    expect(isImageScaleCustom()).toBe(true);
  });

  it('Teil-Update behält den anderen Wert; Reset; Event; Nutzerwechsel', () => {
    const cb = vi.fn();
    const off = onImageScaleChange(cb);
    setImageScales({ normal: 1.5 });
    setImageScales({ saver: 0.5 });
    expect(getNormalScale()).toBe(1.5);
    expect(getSaverScale()).toBe(0.5);
    expect(cb).toHaveBeenCalledTimes(2);
    uid = 'u2';
    expect(getNormalScale()).toBe(1);
    uid = 'u1';
    resetImageScales();
    expect(getNormalScale()).toBe(1);
    expect(cb).toHaveBeenCalledTimes(3);
    off();
  });

  it('kaputter Speicher fällt auf Standard', () => {
    window.localStorage.setItem('lfx.imgscale.u1', 'x{');
    expect(getNormalScale()).toBe(1);
  });

  it('api: Skala bis 2 erlaubt, scale:false unskaliert', () => {
    setImageScale(1.5);
    expect(imageUrlFor('x', { maxWidth: 200 })).toContain('maxWidth=300');
    expect(imageUrlFor('x', { maxWidth: 200, scale: false })).toContain('maxWidth=200');
    setImageScale(3);
    expect(imageUrlFor('x', { maxWidth: 200 })).toContain('maxWidth=200');
  });
});

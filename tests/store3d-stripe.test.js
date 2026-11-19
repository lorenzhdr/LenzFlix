// @vitest-environment jsdom
// Streifen-Upload (covers/stripe.js, 1.19.0): Zieltextur ohne Daten, Streifen über copyTextureToTexture, Mipmap nur am Ende, Rückfall ohne Fähigkeit.
import { describe, it, expect, vi } from 'vitest';
import { createStripeUpload, STRIPES } from '../src/js/store3d/covers/stripe.js';

const cv = (w = 2048, h = 2048) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function fakeRenderer() {
  const mips = [];
  const r = {
    initTexture: vi.fn(),
    copyTextureToTexture: vi.fn((src, dst) => { mips.push(dst.generateMipmaps); }),
  };
  return { r, mips };
}

describe('createStripeUpload', () => {
  it('ohne copyTextureToTexture/initTexture oder bei nicht teilbarer Höhe: null (Rückfall auf den ganzen Upload)', () => {
    expect(createStripeUpload({ initTexture() {} }, cv())).toBe(null);
    expect(createStripeUpload({ copyTextureToTexture() {} }, cv())).toBe(null);
    expect(createStripeUpload(fakeRenderer().r, cv(2048, 2047))).toBe(null);
    expect(createStripeUpload(null, cv())).toBe(null);
  });

  it('Zieltextur wird ohne Daten angelegt (dataReady=false), sRGB, Mipmap-Filter, flipY wie CanvasTexture', () => {
    const { r } = fakeRenderer();
    const up = createStripeUpload(r, cv(), { anisotropy: 4 });
    expect(r.initTexture).toHaveBeenCalledTimes(1);
    const t = up.tex;
    expect(r.initTexture.mock.calls[0][0]).toBe(t);
    expect(t.source.dataReady).toBe(false);
    expect(t.flipY).toBe(true);
    expect(t.colorSpace).toBe('srgb');
    expect(t.anisotropy).toBe(4);
    expect(t.image.width).toBe(2048);
    expect(up.done).toBe(false);
  });

  it('STRIPES Schritte: lückenlose Streifen y = a (Quelle und Ziel), Mipmap nur im letzten, danach Canvas frei', () => {
    const { r, mips } = fakeRenderer();
    const c = cv();
    const up = createStripeUpload(r, c);
    const sh = 2048 / STRIPES;
    for (let i = 0; i < STRIPES; i++) {
      expect(up.done).toBe(false);
      expect(up.step()).toBe(i === STRIPES - 1);
    }
    expect(up.done).toBe(true);
    const calls = r.copyTextureToTexture.mock.calls;
    expect(calls.length).toBe(STRIPES);
    calls.forEach(([, dst, region, pos], i) => {
      expect(region.min).toEqual({ x: 0, y: i * sh });
      expect(region.max).toEqual({ x: 2048, y: (i + 1) * sh });
      expect(pos.x).toBe(0);
      expect(pos.y).toBe(i * sh);
      expect(dst).toBe(up.tex);
    });
    expect(mips).toEqual([...Array(STRIPES - 1).fill(false), true]);
    expect(up.tex.generateMipmaps).toBe(true);
    expect(c.width).toBe(1);
    expect(up.step()).toBe(true); // nach dem Ende wirkungslos
    expect(r.copyTextureToTexture).toHaveBeenCalledTimes(STRIPES);
  });

  it('dispose mittendrin: Canvas frei, Textur freigegeben, kein weiterer Streifen', () => {
    const { r } = fakeRenderer();
    const c = cv();
    const up = createStripeUpload(r, c);
    const spy = vi.fn();
    up.tex.addEventListener('dispose', spy);
    up.step();
    up.dispose();
    expect(spy).toHaveBeenCalled();
    expect(c.width).toBe(1);
    up.step();
    expect(r.copyTextureToTexture).toHaveBeenCalledTimes(1);
  });

  it('abandon (Kontextverlust): Canvas frei, Zieltextur NICHT dispose()t, kein weiterer Streifen', () => {
    const { r } = fakeRenderer();
    const c = cv();
    const up = createStripeUpload(r, c);
    const spy = vi.fn();
    up.tex.addEventListener('dispose', spy);
    up.step();
    up.abandon();
    expect(spy).not.toHaveBeenCalled();
    expect(c.width).toBe(1);
    expect(up.step()).toBe(true);
    expect(r.copyTextureToTexture).toHaveBeenCalledTimes(1);
  });

  it('Fehler beim Anlegen (initTexture wirft): null', () => {
    const r = { initTexture: () => { throw new Error('x'); }, copyTextureToTexture() {} };
    expect(createStripeUpload(r, cv())).toBe(null);
  });
});

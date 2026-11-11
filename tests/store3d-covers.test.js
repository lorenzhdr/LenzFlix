import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/js/store3d/covers/atlas.js', () => ({
  drawAtlas: vi.fn(({ size }) => ({ width: size, height: size })),
}));
vi.mock('../src/js/store3d/covers/loader.js', () => ({
  loadBitmap: vi.fn(() => Promise.resolve({ close() {} })),
  closeBitmap: () => {},
}));

const { CoverManager, HI_SIZE, HI_COST } = await import('../src/js/store3d/covers/manager.js');
const { drawAtlas } = await import('../src/js/store3d/covers/atlas.js');
const { shelfSpec } = await import('../src/js/store3d/world/layout.js');

const preset = (over = {}) => ({ level: 'high', atlas: 1024, anisotropy: 1, maxAtlases: 100, loadRadius: 30, ...over });

function setup({ phone = false, n = 14, pre = preset(), maxTex = 4096, big = false } = {}) {
  const items = new Map();
  const faceViews = Array.from({ length: n }, (_, i) => {
    const ids = [`a${i}`, `b${i}`];
    ids.forEach((id) => items.set(id, { Id: id, ImageTags: { Primary: 't' } }));
    return {
      face: { index: i, x: (i - n / 2) * 0.4, z: -3, nx: 0, nz: 1, slots: ids },
      mesh: {}, material: { map: null, color: { setRGB() {}, copy() {} } }, flatColor: {},
    };
  });
  const deps = { imageUrl: vi.fn((id, o) => `/img/${id}?w=${o.maxWidth}`) };
  const m = new CoverManager({
    faceViews, items, deps, preset: pre, blankTex: { blank: true }, phone, spec: shelfSpec(big),
    renderer: maxTex === null ? null : { capabilities: { maxTextureSize: maxTex }, initTexture() {} },
  });
  return { m, faceViews, deps };
}

async function settle(m, args = [0, 0, 0, { zoom: 1, pitch: 0 }], rounds = 90) {
  for (let i = 0; i < rounds; i++) {
    m.update(...args);
    await new Promise((r) => setTimeout(r, 0));
    m.tick();
  }
}

describe('store3d CoverManager Schärfestufe', () => {
  it('Desktop: höchstens 8 Seiten in 2048², Handy: höchstens 4', async () => {
    const d = setup({ n: 14 });
    await settle(d.m);
    expect(d.m.hiCount).toBe(8);
    expect(d.m.hiPending).toBeLessThanOrEqual(8);
    const p = setup({ n: 14, phone: true });
    await settle(p.m);
    expect(p.m.hiCount).toBe(4);
  });

  it('Bilder der Schärfestufe mit maxWidth 400, Atlas 2048', async () => {
    const d = setup({ n: 3 });
    await settle(d.m);
    expect(d.deps.imageUrl.mock.calls.some((c) => c[1].maxWidth === 400)).toBe(true);
    expect(drawAtlas.mock.calls.some((c) => c[0].size === HI_SIZE)).toBe(true);
    expect(d.faceViews.every((fv) => fv.material.map !== d.m.blank)).toBe(true);
  });

  it('Qualität low: keine Hochstufung', async () => {
    const d = setup({ pre: preset({ level: 'low', atlas: 512 }) });
    await settle(d.m);
    expect(d.m.hiCap).toBe(0);
    expect(d.m.hiPending).toBe(0);
    expect(d.m.fullCount).toBeGreaterThan(0);
  });

  it('maxTextureSize < 2048 oder kein Renderer: aus', async () => {
    for (const maxTex of [1024, null]) {
      const d = setup({ maxTex });
      await settle(d.m);
      expect(d.m.hiCap).toBe(0);
      expect(d.m.hiPending).toBe(0);
    }
  });

  it('Budget: 2048er zählen HI_COST Einheiten, höchstens die Hälfte des Atlas-Budgets', () => {
    expect(HI_COST).toBe(4);
    expect(setup({ pre: preset({ maxAtlases: 40 }) }).m.hiCap).toBe(5);
    expect(setup({ pre: preset({ maxAtlases: 14 }), phone: true }).m.hiCap).toBe(1);
    expect(setup({ pre: preset({ maxAtlases: 56 }) }).m.hiCap).toBe(7);
  });

  it('Hochstufen erst nach geladenem Grund-Atlas', async () => {
    const d = setup({ n: 2 });
    d.m.update(0, 0, 0, { zoom: 1, pitch: 0 });
    expect(d.m.hiPending).toBe(0);
    await settle(d.m);
    expect(d.m.hiCount).toBe(2);
  });

  it('Herabstufen: erst auf den Grund-Atlas tauschen, dann 2048er disposen', async () => {
    const d = setup({ n: 3 });
    await settle(d.m);
    const f = d.m.faces[1];
    const hi = f.hiTex;
    const base = f.tex;
    expect(hi).toBeTruthy();
    expect(f.fv.material.map).toBe(hi);
    let mapAtDispose = null;
    vi.spyOn(hi, 'dispose').mockImplementation(() => { mapAtDispose = f.fv.material.map; });
    d.m.update(0, 0, Math.PI, { zoom: 1, pitch: 0 }); // abgewandt
    expect(f.hiTex).toBeNull();
    expect(mapAtDispose).toBe(base);
    expect(f.fv.material.map).toBe(base);
    expect(hi.dispose).toHaveBeenCalledTimes(1);
  });

  it('Zoom bevorzugt die Seite in Blickrichtung', async () => {
    const d = setup({ n: 14, pre: preset({ maxAtlases: 16 }) }); // hiCap 2
    await settle(d.m, [0, 0, 0, { zoom: 1, pitch: 0 }]);
    d.m.update(0, 0, 0.2, { zoom: 2, pitch: 0 });
    const want = d.m.updateHi(2, 0).map((f) => f.face.index);
    expect(want.length).toBe(2);
    // Blick nach links-vorn (yaw > 0 dreht nach links): bevorzugte Seiten liegen links (kleineres x)
    expect(want.every((i) => d.faceViews[i].face.x <= 0.5)).toBe(true);
  });

  it('evict/dispose/invalidateAll hinterlassen keine 2048er-Texturen', async () => {
    const d = setup({ n: 4 });
    await settle(d.m);
    const his = d.m.faces.map((f) => f.hiTex).filter(Boolean);
    expect(his.length).toBe(4);
    const spies = his.map((t) => vi.spyOn(t, 'dispose'));
    d.m.dispose();
    expect(d.m.hiPending).toBe(0);
    expect(d.m.loadedCount).toBe(0);
    spies.forEach((s) => expect(s).toHaveBeenCalledTimes(1));

    const e = setup({ n: 4 });
    await settle(e.m);
    const t = e.m.faces[0].hiTex;
    const sp = vi.spyOn(t, 'dispose');
    e.m.invalidateAll();
    expect(sp).not.toHaveBeenCalled(); // Kontext verloren: nur vergessen
    expect(e.m.hiPending).toBe(0);
    expect(e.faceViews.every((fv) => fv.material.map === e.m.blank)).toBe(true);
  });

  it('laufender Hi-Load wird beim Herabstufen abgebrochen', async () => {
    const d = setup({ n: 2 });
    for (let i = 0; i < 40; i++) {
      d.m.update(0, 0, 0, { zoom: 1, pitch: 0 });
      await new Promise((r) => setTimeout(r, 0));
      d.m.tick();
      if (d.m.faces.some((f) => f.hiLoading)) break;
    }
    const f = d.m.faces.find((x) => x.hiLoading);
    if (f) {
      const sig = f.hiLoading.ac.signal;
      d.m.update(0, 0, Math.PI, { zoom: 1, pitch: 0 });
      expect(f.hiLoading).toBeNull();
      expect(sig.aborted).toBe(true);
    }
  });
});

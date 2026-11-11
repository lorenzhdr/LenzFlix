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

function setup({ phone = false, n = 14, pre = preset(), maxTex = 4096, big = false, zs = () => -3 } = {}) {
  const clock = { t: 1000 };
  const items = new Map();
  const faceViews = Array.from({ length: n }, (_, i) => {
    const ids = [`a${i}`, `b${i}`];
    ids.forEach((id) => items.set(id, { Id: id, ImageTags: { Primary: 't' } }));
    return {
      face: { index: i, x: (i - n / 2) * 0.4, z: zs(i, n), nx: 0, nz: 1, slots: ids },
      mesh: {}, material: { map: null, color: { setRGB() {}, copy() {} } }, flatColor: {},
    };
  });
  const deps = { imageUrl: vi.fn((id, o) => `/img/${id}?w=${o.maxWidth}`) };
  const m = new CoverManager({
    faceViews, items, deps, preset: pre, blankTex: { blank: true }, phone, spec: shelfSpec(big),
    now: () => clock.t,
    renderer: maxTex === null ? null : { capabilities: { maxTextureSize: maxTex }, initTexture() {} },
  });
  m.clockRef = clock;
  return { m, faceViews, deps, clock };
}

// Pro Runde 250 ms (Fake-Uhr des Managers), ein update + 8 Frames; `clock` aus setup()
async function settle(m, args = [0, 0, 0, { zoom: 1, pitch: 0 }], rounds = 90, clock = m.clockRef) {
  for (let i = 0; i < rounds; i++) {
    m.update(...args);
    await new Promise((r) => setTimeout(r, 0));
    for (let k = 0; k < 8; k++) { // 8 Frames à 31 ms pro Runde (250 ms)
      if (clock) clock.t += 31.25;
      m.tick();
    }
  }
}

describe('store3d CoverManager Schärfestufe', () => {
  it('Desktop: höchstens 4 Seiten in 2048², Handy: höchstens 2', async () => {
    const d = setup({ n: 14 });
    await settle(d.m);
    expect(d.m.hiCount).toBe(4);
    expect(d.m.hiPending).toBeLessThanOrEqual(4);
    const p = setup({ n: 14, phone: true });
    await settle(p.m);
    expect(p.m.hiCount).toBe(2);
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
    expect(setup({ pre: preset({ maxAtlases: 40 }) }).m.hiCap).toBe(4);
    expect(setup({ pre: preset({ maxAtlases: 14 }), phone: true }).m.hiCap).toBe(1);
    expect(setup({ pre: preset({ maxAtlases: 56 }) }).m.hiCap).toBe(4);
    expect(setup({ pre: preset({ maxAtlases: 8 }) }).m.hiCap).toBe(1);
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
    d.clock.t += 5000;
    d.m.update(0, 0, Math.PI, { zoom: 1, pitch: 0 }); // abgewandt: bleibt zunächst (Hysterese)
    expect(f.hiTex).toBe(hi);
    d.clock.t += 2500;
    d.m.update(0, 0, Math.PI, { zoom: 1, pitch: 0 }); // > 2 s abgewandt
    expect(f.hiTex).toBeNull();
    expect(mapAtDispose).toBe(base);
    expect(f.fv.material.map).toBe(base);
    expect(hi.dispose).toHaveBeenCalledTimes(1);
  });

  it('Zoom bevorzugt die Seite in Blickrichtung', async () => {
    const d = setup({ n: 14, pre: preset({ maxAtlases: 16 }) }); // hiCap 2
    await settle(d.m, [0, 0, 0, { zoom: 1, pitch: 0 }]);
    d.clock.t += 250;
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
      d.clock.t += 250;
      d.m.update(0, 0, 0, { zoom: 1, pitch: 0 });
      await new Promise((r) => setTimeout(r, 0));
      d.m.tick();
      if (d.m.faces.some((f) => f.hiLoading)) break;
    }
    const f = d.m.faces.find((x) => x.hiLoading);
    if (f) {
      const sig = f.hiLoading.ac.signal;
      d.m.setPreset(preset({ level: 'low', atlas: 512 })); // Hi aus: sofort weg
      d.m.update(0, 0, Math.PI, { zoom: 1, pitch: 0 });
      expect(f.hiLoading).toBeNull();
      expect(sig.aborted).toBe(true);
    }
  });

  it('Hi: nur bei Ruhe oder Zoom, Hochstufen erst nach 400 ms Auswahl', async () => {
    const d = setup({ n: 3 });
    await settle(d.m, [0, 12, 0, { zoom: 1, pitch: 0 }], 12); // Regale vorladen (außer Reichweite für Hi)
    for (let i = 0; i < 30; i++) { // Gehen auf das Regal zu mit 1,6 m/s (0,4 m je 250 ms)
      d.clock.t += 250;
      d.m.update(0, 12 - 0.4 * i, 0, { zoom: 1, pitch: 0 });
      await new Promise((r) => setTimeout(r, 0));
      d.m.tick();
    }
    const x = 0;
    expect(d.m.calm).toBe(false);
    expect(d.m.hiPending).toBe(0);
    // Stehen: nach der Auswahlzeit Hi
    d.clock.t += 250; d.m.update(x, 0.4, 0, { zoom: 1, pitch: 0 });
    d.clock.t += 250; d.m.update(x, 0.4, 0, { zoom: 1, pitch: 0 });
    d.clock.t += 250; d.m.update(x, 0.4, 0, { zoom: 1, pitch: 0 });
    expect(d.m.calm).toBe(true);
    await settle(d.m, [x, 0.4, 0, { zoom: 1, pitch: 0 }], 20);
    expect(d.m.hiCount).toBeGreaterThan(0);
    // Zoom erlaubt Hochstufen auch beim Gehen
    const z = setup({ n: 3 });
    await settle(z.m, [0, 12, 0, { zoom: 2, pitch: 0 }], 12);
    for (let i = 0; i < 30; i++) {
      z.clock.t += 250;
      z.m.update(0, 12 - 0.4 * i, 0, { zoom: 2, pitch: 0 });
      await new Promise((r) => setTimeout(r, 0));
      for (let k = 0; k < 8; k++) { z.clock.t += 31.25; z.m.tick(); }
    }
    expect(z.m.hiPending).toBeGreaterThan(0);
  });

  it('Hysterese: pendelnder Blick erzeugt kein Hin-und-Her der Hi-Stufe', async () => {
    const d = setup({ n: 14 });
    await settle(d.m, [0, 0, 0, { zoom: 1, pitch: 0 }], 60);
    const down0 = d.m.counters.hiDown;
    const up0 = d.m.counters.hiUp;
    for (let i = 0; i < 80; i++) { // ±0,9 rad, ~0,18 Hz
      d.clock.t += 250;
      d.m.update(0, 0, 0.9 * Math.sin(i * 0.25 * 2 * Math.PI * 0.18), { zoom: 1, pitch: 0 });
      await new Promise((r) => setTimeout(r, 0));
      d.m.tick();
    }
    expect(d.m.counters.hiDown - down0).toBeLessThanOrEqual(2);
    expect(d.m.counters.hiUp - up0).toBeLessThanOrEqual(4);
  });

  it('keine Hochstufung derselben Seite innerhalb von 3 s nach Herabstufen', async () => {
    const d = setup({ n: 3 });
    await settle(d.m);
    const f = d.m.faces[1];
    expect(f.hiTex).toBeTruthy();
    d.m.dropHi(f);
    const t0 = d.clock.t;
    for (let i = 0; i < 10; i++) { // 2,5 s
      d.clock.t += 250;
      d.m.update(0, 0, 0, { zoom: 1, pitch: 0 });
      await new Promise((r) => setTimeout(r, 0));
      d.m.tick();
    }
    expect(d.clock.t - t0).toBeLessThan(3000);
    expect(f.hiTex).toBeNull();
    expect(f.hiLoading).toBeNull();
    await settle(d.m, [0, 0, 0, { zoom: 1, pitch: 0 }], 10);
    expect(f.hiTex).toBeTruthy();
  });

  it('Hi-LRU: bei vollem hiCap ersetzt die neue Seite die am längsten nicht gewollte', async () => {
    const d = setup({ n: 14, pre: preset({ maxAtlases: 16 }) }); // hiCap 2
    await settle(d.m, [-2, 0, 0.5, { zoom: 1, pitch: 0 }], 60);
    const before = d.m.faces.filter((f) => f.hiTex).map((f) => f.face.index);
    expect(before.length).toBe(2);
    await settle(d.m, [2, 0, -0.5, { zoom: 1, pitch: 0 }], 60);
    const after = d.m.faces.filter((f) => f.hiTex).map((f) => f.face.index);
    expect(after.length).toBe(2);
    expect(after.some((i) => !before.includes(i))).toBe(true);
    expect(d.m.hiPending).toBeLessThanOrEqual(2);
  });

  it('Upload-Pacing: höchstens ein Upload alle 2 Frames, Hi höchstens alle 600 ms', async () => {
    const d = setup({ n: 8 });
    for (let i = 0; i < 20; i++) { d.clock.t += 250; d.m.update(0, 0, 0, { zoom: 1, pitch: 0 }); await new Promise((r) => setTimeout(r, 0)); }
    const log = [];
    for (let i = 0; i < 40; i++) {
      const c = d.m.counters.coverUploads;
      d.clock.t += 16;
      d.m.tick();
      if (d.m.counters.coverUploads > c) log.push(i);
    }
    for (let i = 1; i < log.length; i++) expect(log[i] - log[i - 1]).toBeGreaterThanOrEqual(2);
    expect(log.length).toBeGreaterThan(0);
    // Hi-Pacing
    const h = setup({ n: 8 });
    await settle(h.m, [0, 0, 0, { zoom: 1, pitch: 0 }], 30);
    h.m.lastHiAt = h.clock.t;
    expect(h.m.hiUploadOk(h.clock.t + 400)).toBe(false);
    expect(h.m.hiUploadOk(h.clock.t + 700)).toBe(true);
  });

  it('Hi-Upload zurückgestellt bei schneller Drehung und auffälligen Frames', async () => {
    const d = setup({ n: 4 });
    await settle(d.m, [0, 0, 0, { zoom: 1, pitch: 0 }], 4);
    d.clock.t += 250; d.m.update(0, 0, 0, { zoom: 1, pitch: 0 });
    d.clock.t += 250; d.m.update(0, 0, 1.0, { zoom: 1, pitch: 0 }); // 2 rad/s über 500 ms
    expect(d.m.turnFast).toBe(true);
    expect(d.m.hiUploadOk(d.clock.t + 1000)).toBe(false);
    for (let i = 0; i < 3; i++) { d.clock.t += 250; d.m.update(0, 0, 1.0, { zoom: 1, pitch: 0 }); }
    expect(d.m.turnFast).toBe(false);
    d.m.frameDts = [...Array(29).fill(11), 60];
    expect(d.m.framesSteady()).toBe(false);
    d.m.frameDts = Array(30).fill(11);
    expect(d.m.framesSteady()).toBe(true);
  });

  it('Eviction: nur wenn neue Seite >= 3 m näher; Blickwechsel verdrängt nichts', async () => {
    const d = setup({ n: 10, pre: preset({ maxAtlases: 4, loadRadius: 40 }), maxTex: null, zs: () => 0 });
    await settle(d.m, [-2, 0, 0, { zoom: 1, pitch: 0 }], 20);
    expect(d.m.fullCount).toBe(4);
    const loaded0 = d.m.faces.filter((f) => f.state === 'full').map((f) => f.face.index);
    d.clock.t += 10000;
    const ev0 = d.m.counters.fullEvicts;
    d.m.update(-1.2, 0, 0, { zoom: 1, pitch: 0 });
    expect(d.m.counters.fullEvicts).toBe(ev0);
    for (let i = 0; i < 10; i++) { d.clock.t += 250; d.m.update(-1.2, 0, i % 2 ? 2.5 : -2.5, { zoom: 1, pitch: 0 }); }
    expect(d.m.counters.fullEvicts).toBe(ev0);
    expect(d.m.faces.filter((f) => f.state === 'full').map((f) => f.face.index)).toEqual(loaded0);
    expect(d.m.counters.fullLoads).toBe(4);
  });

  it('Eviction: entfernte Seite weicht einer >= 3 m näheren, frisch geladene (< 5 s) nicht', async () => {
    const d = setup({ n: 5, pre: preset({ maxAtlases: 4, loadRadius: 80 }), maxTex: null, zs: (i) => -i * 5 });
    await settle(d.m, [0, 0, 0, { zoom: 1, pitch: 0 }], 20);
    expect(d.m.faces.filter((f) => f.state === 'full').length).toBe(4);
    expect(d.m.faces[4].state).toBe('flat');
    for (const f of d.m.faces) f.loadedAt = d.clock.t; // alle gerade geladen
    // Spieler steht bei Seite 4 (z = -20): Seite 4 ist 15 m näher als Seite 0
    d.m.update(0, -20, 0, { zoom: 1, pitch: 0 });
    d.clock.t += 100;
    d.m.update(0, -20, 0, { zoom: 1, pitch: 0 });
    expect(d.m.counters.fullEvicts).toBe(0); // alle < 5 s alt: geschützt
    d.clock.t += 6000;
    d.m.update(0, -20, 0, { zoom: 1, pitch: 0 });
    expect(d.m.counters.fullEvicts).toBe(1);
    expect(d.m.faces[0].state).not.toBe('full');
    expect(d.m.faces[4].loading).toBeTruthy();
  });

  it('stats-Zähler wachsen kumulativ', async () => {
    const d = setup({ n: 3 });
    await settle(d.m);
    const c = d.m.counters;
    expect(c.coverUploads).toBeGreaterThanOrEqual(6);
    expect(c.fullLoads).toBe(3);
    expect(c.hiUp).toBe(3);
    expect(c.hiDown).toBe(0);
    d.m.dropHi(d.m.faces[0]);
    expect(d.m.counters.hiDown).toBe(1);
  });
});

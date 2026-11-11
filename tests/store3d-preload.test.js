// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../src/js/store3d/covers/atlas.js', () => ({
  drawAtlas: vi.fn(({ size }) => ({ width: size, height: size })),
}));
vi.mock('../src/js/store3d/covers/loader.js', () => ({
  loadBitmap: vi.fn(() => Promise.resolve({ close() {}, width: 64 })),
  closeBitmap: () => {},
}));

const { CoverPreloader, coverUrl } = await import('../src/js/store3d/covers/preload.js');
const { CoverManager, lowSizeFor } = await import('../src/js/store3d/covers/manager.js');
const { drawAtlas } = await import('../src/js/store3d/covers/atlas.js');
const { shelfSpec } = await import('../src/js/store3d/world/layout.js');

afterEach(() => { vi.useRealTimers(); });

const mkItems = (ids, tagged = true) => new Map(ids.map((id) => [id, { Id: id, ImageTags: tagged ? { Primary: `t${id}` } : {} }]));
const deps = () => ({ imageUrl: vi.fn((id, o) => `/img/${id}?w=${o.maxWidth}&q=${o.quality}&t=${o.tag}`) });
const bm = () => ({ close: vi.fn(), width: 40 });

describe('coverUrl', () => {
  it('gleiche Parameter wie full, nur Breite/Qualität; ohne Tag null', () => {
    const d = deps();
    expect(coverUrl(d, 'a', { ImageTags: { Primary: 'x' } }, 64, 60)).toBe('/img/a?w=64&q=60&t=x');
    expect(d.imageUrl).toHaveBeenCalledWith('a', { type: 'Primary', maxWidth: 64, tag: 'x', quality: 60 });
    expect(coverUrl(d, 'a', { ImageTags: {} }, 64, 60)).toBeNull();
    expect(coverUrl(d, 'a', undefined, 64, 60)).toBeNull();
  });
});

describe('CoverPreloader', () => {
  it('Reihenfolge: nahe Seiten zuerst, Ids einmalig', async () => {
    const order = [];
    const load = vi.fn((url) => { order.push(url.split('?')[0]); return Promise.resolve(bm()); });
    const faces = [
      { x: 10, z: 0, slots: ['far1', 'dup'] },
      { x: 1, z: 0, slots: ['near1', 'dup'] },
      { x: 5, z: 0, slots: ['mid', null] },
    ];
    const p = new CoverPreloader({ faces, items: mkItems(['far1', 'dup', 'near1', 'mid']), deps: deps(), loadBitmap: load, concurrency: 1, resize: async (b) => b, px: 0, pz: 0 });
    p.start();
    await p.wait(1000);
    expect(order).toEqual(['/img/near1', '/img/dup', '/img/mid', '/img/far1']);
    expect(p.stats().total).toBe(4);
  });

  it('Concurrency-Grenze wird eingehalten', async () => {
    let active = 0;
    let peak = 0;
    const load = () => new Promise((res) => { active++; peak = Math.max(peak, active); setTimeout(() => { active--; res(bm()); }, 5); });
    const ids = Array.from({ length: 30 }, (_, i) => `i${i}`);
    const p = new CoverPreloader({ faces: [{ x: 0, z: 0, slots: ids }], items: mkItems(ids), deps: deps(), loadBitmap: load, concurrency: 6, resize: async (b) => b });
    p.start();
    await p.wait(5000);
    expect(peak).toBe(6);
    expect(p.done).toBe(30);
  });

  it('Fehler/404/kein Bild zählen als erledigt (null) – kein Warten auf den Timeout', async () => {
    vi.useFakeTimers();
    const items = mkItems(['ok', 'fail', 'throw']);
    items.set('noimg', { Id: 'noimg', ImageTags: {} });
    const load = vi.fn((url) => {
      if (url.includes('/fail')) return Promise.resolve(null);
      if (url.includes('/throw')) return Promise.reject(new Error('x'));
      return Promise.resolve(bm());
    });
    const prog = vi.fn();
    const p = new CoverPreloader({ faces: [{ x: 0, z: 0, slots: ['ok', 'fail', 'throw', 'noimg'] }], items, deps: deps(), loadBitmap: load, resize: async (b) => b, onProgress: prog });
    p.start();
    let resolved = false;
    p.wait(15000).then(() => { resolved = true; });
    await vi.advanceTimersByTimeAsync(10); // weit unter 15 s
    expect(resolved).toBe(true);
    expect(p.done).toBe(4);
    expect(p.cache.get('ok')).toBeTruthy();
    expect(p.cache.get('fail')).toBeNull();
    expect(p.cache.get('throw')).toBeNull();
    expect(p.cache.get('noimg')).toBeNull();
    expect(prog).toHaveBeenLastCalledWith(4, 4);
  });

  it('Timeout 15 s: wait löst auf, Laden läuft weiter, Nachzügler melden onItem', async () => {
    vi.useFakeTimers();
    const pending = [];
    const load = () => new Promise((res) => pending.push(res));
    const onItem = vi.fn();
    const p = new CoverPreloader({ faces: [{ x: 0, z: 0, slots: ['a', 'b'] }], items: mkItems(['a', 'b']), deps: deps(), loadBitmap: load, resize: async (b) => b, onItem });
    p.start();
    let resolved = false;
    p.wait(15000).then(() => { resolved = true; });
    await vi.advanceTimersByTimeAsync(14900);
    expect(resolved).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(resolved).toBe(true);
    expect(p.finished).toBe(false);
    pending[0](bm());
    await vi.advanceTimersByTimeAsync(0);
    expect(onItem).toHaveBeenCalledTimes(1);
    expect(p.done).toBe(1);
  });

  it('0 Titel: sofort fertig, keine Endlosschleife', async () => {
    const p = new CoverPreloader({ faces: [], items: new Map(), deps: deps() });
    p.start();
    await p.wait(1000);
    expect(p.finished).toBe(true);
    expect(p.stats().total).toBe(0);
  });

  it('Originale werden nach dem Skalieren geschlossen, dispose schließt Cache und bricht ab', async () => {
    const orig = bm();
    const small = bm();
    const p = new CoverPreloader({ faces: [{ x: 0, z: 0, slots: ['a'] }], items: mkItems(['a']), deps: deps(), loadBitmap: async () => orig, resize: async () => small, closeBitmap: (b) => b.close() });
    p.start();
    await p.wait(1000);
    expect(orig.close).toHaveBeenCalledTimes(1);
    expect(small.close).not.toHaveBeenCalled();
    p.dispose();
    expect(small.close).toHaveBeenCalledTimes(1);
    expect(p.cache.size).toBe(0);
    expect(p.ac.signal.aborted).toBe(true);
  });

  it('Abbruch während des Ladens: ankommende Bitmaps werden geschlossen', async () => {
    const late = bm();
    let res;
    const p = new CoverPreloader({ faces: [{ x: 0, z: 0, slots: ['a'] }], items: mkItems(['a']), deps: deps(), loadBitmap: () => new Promise((r) => { res = r; }), resize: async (b) => b, closeBitmap: (b) => b && b.close() });
    p.start();
    p.dispose();
    res(late);
    await new Promise((r) => setTimeout(r, 0));
    expect(late.close).toHaveBeenCalledTimes(1);
    expect(p.cache.size).toBe(0);
  });
});

describe('lowSizeFor', () => {
  it('256 normal, 128 bei Handy/low/vielen Seiten', () => {
    expect(lowSizeFor(100, false, 'high')).toBe(256);
    expect(lowSizeFor(100, true, 'high')).toBe(128);
    expect(lowSizeFor(100, false, 'low')).toBe(128);
    expect(lowSizeFor(161, false, 'high')).toBe(128);
  });
});

describe('CoverManager Low-Stufe', () => {
  const preset = (over = {}) => ({ level: 'high', atlas: 1024, anisotropy: 1, maxAtlases: 100, loadRadius: 30, ...over });
  function setup({ n = 4, pre = preset(), phone = false } = {}) {
    const items = new Map();
    const faceViews = Array.from({ length: n }, (_, i) => {
      const ids = [`a${i}`, `b${i}`];
      ids.forEach((id) => items.set(id, { Id: id, ImageTags: { Primary: 't' } }));
      return { face: { index: i, x: i * 0.4, z: -3, nx: 0, nz: 1, slots: ids }, mesh: {}, material: { map: null, color: { setRGB() {}, copy() {} } }, flatColor: {} };
    });
    const d = deps();
    const m = new CoverManager({ faceViews, items, deps: d, preset: pre, blankTex: { blank: true }, phone, spec: shelfSpec(false), renderer: { capabilities: { maxTextureSize: 4096 }, initTexture() {} } });
    return { m, faceViews, d };
  }
  const opts = { loadBitmap: async () => ({ close() {}, width: 40 }), closeBitmap() {}, resize: async (b) => b };

  it('Low für alle Seiten nach dem Vorladen, Größe 256, danach full → evict → low', async () => {
    const { m, faceViews } = setup({ n: 4 });
    m.update(0, 0, 0, { zoom: 1, pitch: 0 });
    const pl = m.startPreload({ px: 0, pz: 0, ...opts });
    await pl.wait(1000);
    expect(pl.stats().done).toBe(8);
    await m.buildLowAll();
    expect(m.lowCount).toBe(4);
    expect(m.loadedCount).toBe(0); // eigenes Budget
    expect(drawAtlas.mock.calls.filter((c) => c[0].size === 256).length).toBe(4);
    const lowTexs = m.faces.map((f) => f.tex);
    expect(faceViews.every((fv, i) => fv.material.map === lowTexs[i])).toBe(true);

    // full lädt nach: Low wird ersetzt und disposed
    const spy = vi.spyOn(lowTexs[0], 'dispose');
    for (let i = 0; i < 40; i++) { m.update(0, 0, 0, { zoom: 1, pitch: 0 }); await new Promise((r) => setTimeout(r, 0)); m.tick(); }
    expect(m.fullCount).toBe(4);
    expect(m.lowCount).toBe(0);
    expect(spy).toHaveBeenCalledTimes(1);

    // evict full → zurück auf low (nicht flat)
    const f = m.faces[1];
    m.evict(f);
    expect(f.state).toBe('low');
    expect(f.fv.material.map).toBe(f.tex);
    expect(f.fv.material.map).not.toBe(m.blank);
  });

  it('evictAll (Atlasgröße) wirft Low nicht weg; invalidateAll baut über tick aus dem Cache neu', async () => {
    const { m } = setup({ n: 3 });
    m.update(0, 0, 0, { zoom: 1, pitch: 0 });
    await (m.startPreload({ px: 0, pz: 0, ...opts })).wait(1000);
    await m.buildLowAll();
    const before = m.faces.map((f) => f.tex);
    m.setPreset(preset({ atlas: 512 }));
    expect(m.faces.map((f) => f.tex)).toEqual(before);
    m.invalidateAll();
    expect(m.lowCount).toBe(0);
    for (let i = 0; i < 6; i++) m.tick(); // höchstens 1 Upload alle 2 Frames
    expect(m.lowCount).toBe(3);
  });

  it('Nachzügler: höchstens 1 Low-Neuzeichnung pro Frame; low-Größe 128 auf dem Handy', async () => {
    const { m } = setup({ n: 3, phone: true });
    expect(m.lowSize).toBe(128);
    m.update(0, 0, 0, { zoom: 1, pitch: 0 });
    await (m.startPreload({ px: 0, pz: 0, ...opts })).wait(1000);
    await m.buildLowAll();
    drawAtlas.mockClear();
    m.markLowItem('a0'); m.markLowItem('a1'); m.markLowItem('a2');
    m.tick();
    expect(drawAtlas).toHaveBeenCalledTimes(1);
    m.tick();
    expect(drawAtlas).toHaveBeenCalledTimes(1); // Pacing: erst nach 2 Frames wieder
    for (let i = 0; i < 4; i++) m.tick();
    expect(drawAtlas).toHaveBeenCalledTimes(3);
  });

  it('0 Seiten: buildLowAll/tick laufen ohne Fehler', async () => {
    const { m } = setup({ n: 0 });
    const pl = m.startPreload({ px: 0, pz: 0, ...opts });
    await pl.wait(100);
    await m.buildLowAll();
    m.tick();
    expect(m.lowCount).toBe(0);
  });

  it('dispose schließt den Vorlader', async () => {
    const { m } = setup({ n: 2 });
    const pl = m.startPreload({ px: 0, pz: 0, ...opts });
    await pl.wait(1000);
    m.dispose();
    expect(pl.disposed).toBe(true);
    expect(m.preloadStats.done).toBe(0);
  });
});

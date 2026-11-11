// @vitest-environment jsdom
// PDF-Export der Fernsehzeitung: Bilder (Canvas → JPEG), Fehler/Timeout/tainted → null, Blob-URL.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const render = vi.hoisted(() => ({ renderMagazinePdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));
vi.mock('../src/js/live/pdf/render.js', () => render);

import { createPdfExport, IMG_MAX_W, IMG_TIMEOUT_MS } from '../src/js/live/magazine/pdf-export.js';

let imgMode = 'ok';
let canvasInfo;
class FakeImage {
  constructor() { this.naturalWidth = 720; this.naturalHeight = 1080; }
  set src(v) {
    this._src = v;
    FakeImage.last = this;
    if (imgMode === 'ok') queueMicrotask(() => this.onload && this.onload());
    else if (imgMode === 'error') queueMicrotask(() => this.onerror && this.onerror());
  }
  get src() { return this._src; }
}

beforeEach(() => {
  vi.useFakeTimers();
  imgMode = 'ok';
  canvasInfo = { tainted: false, blob: new Blob([new Uint8Array([255, 216, 255, 217])], { type: 'image/jpeg' }) };
  HTMLCanvasElement.prototype.getContext = () => ({ fillRect() {}, drawImage() { if (canvasInfo.tainted) throw new Error('SecurityError'); }, set fillStyle(v) {} });
  HTMLCanvasElement.prototype.toBlob = function toBlob(cb, type, q) { canvasInfo.size = [this.width, this.height]; canvasInfo.type = type; canvasInfo.q = q; cb(canvasInfo.blob); };
  render.renderMagazinePdf.mockClear();
  URL.createObjectURL = vi.fn(() => 'blob:pdf-1');
});
afterEach(() => vi.useRealTimers());

const mk = (over = {}) => createPdfExport({ imageUrl: vi.fn((id, o) => `img/${id}?w=${o.maxWidth}`), doc: document, win: { Image: FakeImage }, ...over });

describe('pdf-export loadImage', () => {
  it('lädt crossOrigin=anonymous, skaliert auf max. 360 px Breite, JPEG 0,8 → Uint8Array', async () => {
    const imageUrl = vi.fn((id, o) => `img/${id}?w=${o.maxWidth}`);
    const ex = mk({ imageUrl });
    const bytes = await ex.loadImage('abc');
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes)).toEqual([255, 216, 255, 217]);
    expect(FakeImage.last.crossOrigin).toBe('anonymous');
    expect(imageUrl).toHaveBeenCalledWith('abc', { maxWidth: IMG_MAX_W });
    expect(canvasInfo.size).toEqual([360, 540]);
    expect(canvasInfo.type).toBe('image/jpeg');
    expect(canvasInfo.q).toBe(0.8);
  });

  it('Ladefehler → null', async () => {
    imgMode = 'error';
    expect(await mk().loadImage('abc')).toBeNull();
  });

  it('Timeout (8 s) → null', async () => {
    imgMode = 'hang';
    const p = mk().loadImage('abc');
    await vi.advanceTimersByTimeAsync(IMG_TIMEOUT_MS + 10);
    expect(await p).toBeNull();
  });

  it('tainted Canvas (SecurityError) → null', async () => {
    canvasInfo.tainted = true;
    expect(await mk().loadImage('abc')).toBeNull();
  });

  it('toBlob ohne Ergebnis oder fehlende Id/imageUrl → null', async () => {
    canvasInfo.blob = null;
    expect(await mk().loadImage('abc')).toBeNull();
    expect(await mk().loadImage('')).toBeNull();
    expect(await createPdfExport({ doc: document }).loadImage('x')).toBeNull();
  });
});

describe('pdf-export downloadPdf', () => {
  it('rendert mit Stil, Fortschritt und loadImage; liefert Blob-URL und Dateinamen', async () => {
    const time = {
      formatClock: () => '12:05',
      formatDay: () => ({ weekday: 'Mi', long: 'Mittwoch', date: '11.11.' }),
      broadcastDayOf: () => 20000,
    };
    const ex = mk({ now: () => 1000, time });
    const onProgress = vi.fn();
    const mag = { fileName: 'LIVE-Programm_2026-11-11.pdf', pages: [] };
    const r = await ex.downloadPdf(mag, 'silver', onProgress);
    expect(r).toEqual({ url: 'blob:pdf-1', fileName: 'LIVE-Programm_2026-11-11.pdf' });
    const [m, o] = render.renderMagazinePdf.mock.calls[0];
    expect(m).toBe(mag);
    expect(o.style).toBe('silver');
    expect(o.onProgress).toBe(onProgress);
    expect(typeof o.loadImage).toBe('function');
    expect(o.created).toBe('11.11. 12:05 Uhr');
    const blob = URL.createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBe(4);
  });

  it('ohne Zeitfunktionen entfällt „created“; Render-Fehler wird durchgereicht', async () => {
    await mk().downloadPdf({ pages: [] }, 'flat');
    expect(render.renderMagazinePdf.mock.calls[0][1].created).toBeUndefined();
    render.renderMagazinePdf.mockRejectedValueOnce(new Error('kaputt'));
    await expect(mk().downloadPdf({ pages: [] }, 'flat')).rejects.toThrow('kaputt');
  });
});

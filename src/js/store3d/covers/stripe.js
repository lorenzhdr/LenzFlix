// VIDEOTHEK LENZ · Streifen-Upload (1.19.0): ein 2048²-Atlas wird nicht in einem Bild hochgeladen (blockiert den GPU-Prozess 25-56 ms),
// sondern als STRIPES Streifen über mehrere Bilder (renderer.copyTextureToTexture mit Quellbereich). Die Zieltextur (DataTexture ohne Daten,
// `dataReady=false`) wird vorab angelegt; das Mipmap entsteht erst beim letzten Streifen. Erst danach wird sie am Material eingehängt (kein halbes Cover).
// Rückgabe null = nicht möglich (Renderer ohne copyTextureToTexture/initTexture, Größe nicht teilbar) → Aufrufer lädt wie bisher in einem Stück hoch.
import { DataTexture, Texture, RGBAFormat, UnsignedByteType, LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace } from 'three';

export const STRIPES = 8;

/**
 * @param {object} renderer WebGLRenderer
 * @param {HTMLCanvasElement} canvas fertig gezeichneter Atlas (wird nach dem letzten Streifen auf 1×1 verkleinert)
 * @param {{anisotropy?: number, stripes?: number}} [o]
 * @returns {{tex: object, step: () => boolean, dispose: () => void, readonly done: boolean} | null} step() kopiert den nächsten Streifen, liefert true, wenn fertig.
 */
export function createStripeUpload(renderer, canvas, o = {}) {
  const stripes = o.stripes || STRIPES;
  if (!renderer || typeof renderer.copyTextureToTexture !== 'function' || typeof renderer.initTexture !== 'function' || !canvas) return null;
  const W = canvas.width;
  const H = canvas.height;
  if (!W || !H || H % stripes) return null;
  const sh = H / stripes;
  let dst = null;
  let src = null;
  try {
    dst = new DataTexture(null, W, H, RGBAFormat, UnsignedByteType);
    dst.colorSpace = SRGBColorSpace;
    dst.flipY = true; // wie CanvasTexture: oberste Bildzeile = oberste Texturzeile
    dst.unpackAlignment = 4;
    dst.generateMipmaps = true;
    dst.minFilter = LinearMipmapLinearFilter;
    dst.magFilter = LinearFilter;
    dst.anisotropy = o.anisotropy || 1;
    dst.source.dataReady = false; // nur Speicher anlegen, nichts hochladen
    dst.needsUpdate = true;
    renderer.initTexture(dst);
    src = new Texture(canvas); // bleibt ohne GPU-Gegenstück (nie gerendert), liefert nur Bild und Maße
  } catch {
    if (dst) try { dst.dispose(); } catch { /* egal */ }
    return null;
  }
  let next = 0;
  let finished = false;
  const free = () => {
    if (src) { try { src.dispose(); } catch { /* egal */ } src = null; }
    try { canvas.width = 1; canvas.height = 1; } catch { /* egal */ }
  };
  return {
    tex: dst,
    get done() { return finished; },
    step() {
      if (finished) return true;
      const a = next * sh;
      dst.generateMipmaps = next === stripes - 1; // Mipmap-Kette nur einmal, am Ende
      renderer.copyTextureToTexture(src, dst, { min: { x: 0, y: a }, max: { x: W, y: a + sh } }, { x: 0, y: a, z: 0 });
      next++;
      if (next >= stripes) { finished = true; dst.generateMipmaps = true; free(); }
      return finished;
    },
    dispose() { free(); finished = true; try { dst.dispose(); } catch { /* egal */ } },
    /** Nach Kontextverlust: nur Leinwand freigeben, die (verlorene) Zieltextur nicht mehr dispose()n (sonst WebGL-Warnungen). */
    abandon() { free(); finished = true; },
  };
}

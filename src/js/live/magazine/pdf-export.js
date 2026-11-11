// LENZ LIVE · PDF-Export der Fernsehzeitung: Cover-Bilder holen (Canvas → JPEG), PDF rendern, als Blob-URL liefern.
// createPdfExport({ imageUrl, doc, win?, now?, time? }) → downloadPdf(magazine, style, onProgress) → Promise<{ url, fileName }>
// Importiert nur Dateien aus src/js/live/. Bildfehler (Netz, Timeout, tainted Canvas) ergeben nie einen Abbruch, nur ein fehlendes Bild.
import { renderMagazinePdf } from '../pdf/render.js';

export const IMG_MAX_W = 360;
export const IMG_TIMEOUT_MS = 8000;
export const JPEG_QUALITY = 0.8;

export function createPdfExport({ imageUrl, doc = document, win = null, now = null, time = {} } = {}) {
  const w = win || doc.defaultView || (typeof window !== 'undefined' ? window : null);
  const clockNow = typeof now === 'function' ? now : () => Date.now();

  /** loadImage(imageId) → Promise<Uint8Array|null> (JPEG, max. 360 px breit). */
  function loadImage(imageId) {
    return new Promise((resolve) => {
      if (!imageId || typeof imageUrl !== 'function') { resolve(null); return; }
      let done = false;
      let timer = null;
      const finish = (v) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
      };
      timer = setTimeout(() => finish(null), IMG_TIMEOUT_MS);
      try {
        const img = new (w && w.Image ? w.Image : Image)();
        img.crossOrigin = 'anonymous';
        img.onerror = () => finish(null);
        img.onload = () => {
          try {
            const iw = img.naturalWidth || img.width;
            const ih = img.naturalHeight || img.height;
            if (!iw || !ih) { finish(null); return; }
            const k = Math.min(1, IMG_MAX_W / iw);
            const cw = Math.max(1, Math.round(iw * k));
            const ch = Math.max(1, Math.round(ih * k));
            const canvas = doc.createElement('canvas');
            canvas.width = cw;
            canvas.height = ch;
            const c2 = canvas.getContext('2d');
            if (!c2) { finish(null); return; }
            c2.fillStyle = '#fff';
            c2.fillRect(0, 0, cw, ch);
            c2.drawImage(img, 0, 0, cw, ch);
            canvas.toBlob((blob) => {
              if (!blob) { finish(null); return; }
              blobBytes(blob).then(finish, () => finish(null));
            }, 'image/jpeg', JPEG_QUALITY);
          } catch {
            finish(null); // tainted Canvas (SecurityError) u. a.
          }
        };
        img.src = imageUrl(imageId, { maxWidth: IMG_MAX_W });
      } catch {
        finish(null);
      }
    });
  }

  async function blobBytes(blob) {
    if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(new Uint8Array(r.result));
      r.onerror = () => rej(r.error);
      r.readAsArrayBuffer(blob);
    });
  }

  function createdText() {
    try {
      const t = clockNow();
      if (!time.formatDay || !time.broadcastDayOf || !time.formatClock) return undefined;
      const d = time.formatDay(time.broadcastDayOf(t));
      return `${d.date} ${time.formatClock(t)} Uhr`;
    } catch {
      return undefined;
    }
  }

  async function downloadPdf(magazine, style, onProgress) {
    const bytes = await renderMagazinePdf(magazine, { style, loadImage, onProgress, created: createdText() });
    const blob = new Blob([bytes], { type: 'application/pdf' });
    return { url: URL.createObjectURL(blob), fileName: magazine.fileName || 'LIVE-Programm.pdf' };
  }

  return { downloadPdf, loadImage };
}

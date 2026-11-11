// VIDEOTHEK LENZ · Bild laden und dekodieren (fetch + createImageBitmap, Fallback Image). Wirft nie: Fehler → null.

function blobToImage(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    const done = (v) => { URL.revokeObjectURL(url); resolve(v); };
    img.onload = () => done(img);
    img.onerror = () => done(null);
    img.src = url;
  });
}

/**
 * @param {string} url same-origin Bild-URL (ohne api_key)
 * @param {AbortSignal} [signal]
 * @param {number} [timeoutMs]
 * @returns {Promise<ImageBitmap|HTMLImageElement|null>}
 */
export async function loadBitmap(url, signal, timeoutMs = 12000) {
  if (!url) return null;
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  if (signal) {
    if (signal.aborted) return null;
    signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, credentials: 'same-origin' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (ac.signal.aborted) return null;
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(blob); } catch { /* Fallback unten */ }
    }
    return await blobToImage(blob);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

export function closeBitmap(b) {
  try { if (b && typeof b.close === 'function') b.close(); } catch { /* egal */ }
}

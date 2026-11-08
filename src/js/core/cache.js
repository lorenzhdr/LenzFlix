// LenzFlix: Mini-Cache mit TTL + Dedupe gleichzeitiger Requests.

const store = new Map(); // key -> {value, expires}
const inflight = new Map(); // key -> Promise

/** Liefert gecachten Wert oder ruft loader() genau einmal auf (auch bei parallelen Aufrufen). */
export function cached(key, loader, ttlMs = 60_000) {
  const hit = store.get(key);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value);
  if (inflight.has(key)) return inflight.get(key);
  const p = Promise.resolve()
    .then(loader)
    .then((value) => {
      store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Ohne Argument alles leeren, sonst nur Schlüssel mit Präfix. */
export function clearCache(prefix) {
  for (const k of [...store.keys()]) if (!prefix || k.startsWith(prefix)) store.delete(k);
}

export function debounce(fn, ms) {
  let t = null;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn(...args);
    }, ms);
  };
  wrapped.cancel = () => {
    clearTimeout(t);
    t = null;
  };
  return wrapped;
}

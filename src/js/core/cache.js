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
      if (inflight.get(key) === p) store.set(key, { value, expires: Date.now() + ttlMs }); // clearCache() währenddessen: Ergebnis verwerfen
      return value;
    })
    .finally(() => { if (inflight.get(key) === p) inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

/** Synchroner Treffer (noch gültig) oder undefined – startet nie einen Abruf. */
export function peekCached(key) {
  const hit = store.get(key);
  return hit && hit.expires > Date.now() ? hit.value : undefined;
}

/** Startseiten-Cache (Zeilen, Billboard/Hero): 10 min, Schlüssel immer `home:<userId>:…`, Invalidierung: core/homecache.js. */
export const HOME_TTL = 10 * 60_000;
export const homeKey = (userId, ...parts) => ['home', userId || 'anon', ...parts].join(':');

/** Ohne Argument alles leeren, sonst nur Schlüssel mit Präfix (auch laufende Abrufe: ihr Ergebnis wird nicht mehr gespeichert). */
export function clearCache(prefix) {
  for (const k of [...store.keys()]) if (!prefix || k.startsWith(prefix)) store.delete(k);
  for (const k of [...inflight.keys()]) if (!prefix || k.startsWith(prefix)) inflight.delete(k);
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

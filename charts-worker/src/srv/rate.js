/** Einfaches Fenster-Limit je Schlüssel (Isolate-lokal), Logik wie rateHit in mp/route.js. */
export function makeLimiter({ max, windowMs = 60000, cap = 500 }) {
  const map = new Map(); // Schlüssel -> Zeitstempel[]
  return {
    /** true = erlaubt (und gezählt), false = Limit erreicht. */
    hit(key, now = Date.now()) {
      let list = map.get(key);
      if (!list) {
        if (map.size >= cap) {
          for (const [k, v] of map) if (!v.length || now - v[v.length - 1] >= windowMs) map.delete(k);
          if (map.size >= cap) map.delete(map.keys().next().value);
        }
        list = [];
        map.set(key, list);
      }
      while (list.length && now - list[0] >= windowMs) list.shift();
      if (list.length >= max) return false;
      list.push(now);
      return true;
    },
    clear() {
      map.clear();
    },
  };
}

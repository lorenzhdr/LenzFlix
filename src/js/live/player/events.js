// LENZ LIVE Player: winziger Ereignis-Verteiler (Payloads nie mit URLs/Token füllen).
export function createEmitter() {
  const map = new Map();
  return {
    on(name, fn) {
      if (typeof fn !== 'function') return () => {};
      let set = map.get(name);
      if (!set) map.set(name, (set = new Set()));
      set.add(fn);
      return () => set.delete(fn);
    },
    emit(name, payload) {
      const set = map.get(name);
      if (!set) return;
      for (const fn of [...set]) {
        try { fn(payload); } catch { /* Hörerfehler egal */ }
      }
    },
    clear() { map.clear(); },
  };
}

// LenzFlix: kleiner In-Memory-Speicher für Item-Daten, die beim Rendern von Karten bereits geladen wurden.
const store = new Map();
const MAX = 2000;

export function putItems(items) {
  for (const it of items || []) {
    if (!it || !it.Id) continue;
    store.delete(it.Id);
    store.set(it.Id, it);
  }
  while (store.size > MAX) store.delete(store.keys().next().value);
}

export function getStoredItem(id) {
  return store.get(id) || null;
}

export function clearItemStore() {
  store.clear();
}

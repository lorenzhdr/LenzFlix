// Unter-Reducer "phys": Platzhalter (Welle a). Schnittstelle laut docs/mp-api.md §12; wird in
// einer späteren Welle befüllt, room.js bleibt unverändert.
export const cap = null; // string | string[] | null
export const handlers = {};
export default {
  cap,
  handlers,
  onOpen() {},
  onClose() {},
  onFlags() {},
  welcome() { return {}; },
  nextDeadline() { return null; },
  onAlarm() {},
  storeKeys: [],
};

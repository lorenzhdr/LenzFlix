// VIDEOTHEK LENZ · Mehrspieler: Teil-Register des Moduls net (modules/net.js). Spätere Wellen ersetzen hier nur ihren Stub
// (Import + Eintrag), modules/net.js bleibt unberührt. Jede Fabrik: createX(core) → Handle oder null; alle Methoden optional:
//   { welcome(wl), ev(e) /* Frame b */, x(e) /* Frame x */, tick(dt, t), stop() /* Verbindung weg: auf 1.15 zurück */, dispose() }
// core = { ctx, frame, send(msg) → bool, me() → {c,k,admin}|null, cap(name) → bool, active() → bool, serverNow() → ms|null,
//          peers /* net/peers.js */, prefs() → {...}, toast(text), on(t, fn) → off /* Nachrichtentyp, z. B. 'kx' */ }
const stub = () => ({});

export const PART_FACTORIES = {
  chat: stub, // Welle b
  emotes: stub, // Welle b
  phys: stub, // Welle c
  push: stub, // Welle c
  richard: stub, // Welle c
  weather: stub, // Welle c
  kino: stub, // Welle d
};

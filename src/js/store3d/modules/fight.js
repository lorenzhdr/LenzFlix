// VIDEOTHEK LENZ · Modul `fight` (1.18.0, Stub aus Welle 4; gefüllt in Welle 6): Waffen, Energie, K.O., Schutz.
// Provider 'fight' (Vertrag .tmp/v118/contracts.md §4):
//   weapon() → 'hand'|'belt'|'whip'|'laser' · setWeapon(id) · energy() → 0..100 · protected() → bool
//   onKO(fn) → off · hitPlayer({ dmg, knock:{x,z}, src }) → bool (prüft Schutz, VR, Menü) · blind(ms)
// Stub: tut nichts (alles bitgleich wie 1.17.0).
export default {
  name: 'fight',
  init(ctx) {
    const provider = {
      weapon: () => 'hand',
      setWeapon() {},
      energy: () => 100,
      protected: () => false,
      onKO: () => () => {},
      hitPlayer: () => false,
      blind() {},
    };
    const off = ctx.provide('fight', provider);
    return { dispose() { off(); } };
  },
};

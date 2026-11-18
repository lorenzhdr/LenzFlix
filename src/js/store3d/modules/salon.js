// VIDEOTHEK LENZ · Modul `salon` (1.17.0, Stub aus Welle 0): Friseursalon (Stuhl, Figur-Editor „chair“). Die Welle „Salon“ füllt diese Datei.
// Provider 'salon' (Vertrag .tmp/v117/contracts.md §5):
//   busy() → boolean (Salon-Ablauf läuft) · inside() → boolean (Spieler im Salon)
// Stub: immer false.
export default {
  name: 'salon',
  init(ctx) {
    const provider = {
      busy: () => false,
      inside: () => false,
    };
    const off = ctx.provide('salon', provider);
    return { dispose() { off(); } };
  },
};

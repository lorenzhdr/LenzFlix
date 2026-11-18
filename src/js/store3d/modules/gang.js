// VIDEOTHEK LENZ · Modul `gang` (1.18.0, Stub aus Welle 4; gefüllt in Welle 7): Rowdy-Bande.
// Provider 'gang' (Vertrag .tmp/v118/contracts.md §4): active() → bool · members() → [{ i, handle, st, hp }] · hit(i, weapon) → bool
// Stub: keine Bande.
export default {
  name: 'gang',
  init(ctx) {
    const off = ctx.provide('gang', { active: () => false, members: () => [], hit: () => false });
    return { dispose() { off(); } };
  },
};

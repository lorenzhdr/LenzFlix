// VIDEOTHEK LENZ · Modul `shopmirror` (1.17.0, Stub aus Welle 0): Spiegel/Spiegelung im Laden. Eine spätere Welle füllt diese Datei.
// Provider 'shopmirror': keine öffentliche API (Vertrag .tmp/v117/contracts.md §5); der Stub stellt einen leeren Provider bereit.
export default {
  name: 'shopmirror',
  init(ctx) {
    const off = ctx.provide('shopmirror', {});
    return { dispose() { off(); } };
  },
};

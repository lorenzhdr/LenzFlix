// VIDEOTHEK LENZ · Modul `xrchar` (1.17.0, Stub): „VR light“-Figurpanel (Outfit-Platz, Zufall, Paletten-Farben) in der Brille.
// Provider 'xrchar' { open(): boolean } – Welle 2 (coder F) füllt diese Datei; Panel-Bau in xr/charpanel.js über ctx.xr.panel.open(spec).
export default {
  name: 'xrchar',
  init(ctx) {
    const off = ctx.provide('xrchar', { open: () => false });
    return { dispose() { off(); } };
  },
};

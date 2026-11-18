// VIDEOTHEK LENZ · Modul `xrchar` (1.17.0): „VR light“-Figurpanel (Outfit-Platz, Zufall, Paletten-Farben) in der Brille.
// Provider 'xrchar' { open(): boolean } – öffnet das Panel nur in einer VR-Sitzung (sonst false, 2D bleibt unberührt).
// Panel-Spec in xr/charpanel.js; Daten über den Provider `avatar` (immer mit Guard).
import { buildCharSpec } from '../xr/charpanel.js';

export default {
  name: 'xrchar',
  init(ctx) {
    let handle = null;
    let offChange = null;
    const state = { part: 0 };

    const isOpen = () => !!(handle && handle.open);
    const stop = () => { if (offChange) { offChange(); offChange = null; } };
    const close = () => { const h = handle; handle = null; stop(); if (h && h.open) h.close(); };
    const spec = (avatar) => buildCharSpec(avatar, state, {
      refresh: () => { if (isOpen()) handle.update(spec(avatar)); },
      close,
      onClose: () => { handle = null; stop(); },
    });

    function open() {
      if (!(ctx.xr && ctx.xr.presenting())) return false;
      const avatar = ctx.use('avatar');
      if (!avatar || typeof avatar.setColor !== 'function') return false;
      if (isOpen()) { close(); return true; }
      const h = ctx.xr.panel.open(spec(avatar));
      if (!h || !h.open) return false;
      handle = h;
      // Änderungen von außen (Platzwechsel, Zufall): kein Neuaufbau der Szene, nur die Panel-Spec frisch zeichnen
      if (typeof avatar.onChange === 'function') offChange = avatar.onChange(() => { if (isOpen()) handle.update(spec(avatar)); });
      return true;
    }

    const off = ctx.provide('xrchar', { open });
    return { dispose() { off(); close(); } };
  },
};

// VIDEOTHEK LENZ · Modul `ultra-light` (1.19.0): Ultra-Details „Licht & Atmosphäre“ – Keys 'neon', 'pools', 'shadows'.
// Registriert nur beim Provider 'ultra' (engine/ultra.js): gebaut wird lazy im Leerlauf, sichtbar nur auf Stufe 'ultra'. Bauer: world/build-ultra-light.js.
// neon/pools hängen an der Straßengruppe (verschwinden mit ihr, z. B. im Palastsaal); shadows liegt an der Szene (Laden + Straße).
import { buildNeon, buildPools, buildShadows } from '../world/build-ultra-light.js';

export default {
  name: 'ultra-light',
  init(ctx) {
    const ultra = ctx.use('ultra');
    if (!ultra || typeof ultra.register !== 'function') return {};
    const offs = [];
    const city = ctx.use('city');
    const street = city && city.groups && city.groups.street;
    if (ctx.layout && ctx.layout.city && street) {
      offs.push(ultra.register('neon', buildNeon, { parent: street }));
      offs.push(ultra.register('pools', buildPools, { parent: street }));
    }
    offs.push(ultra.register('shadows', buildShadows));
    return { dispose() { for (const off of offs.splice(0)) off(); } };
  },
};

// VIDEOTHEK LENZ · Modul `ultra-city` (1.19.0): Ultra-Details der Außenwelt über den Provider 'ultra' (engine/ultra.js).
// Keys: facade (Gesimse, Fensterrahmen, Fallrohre, Klimageräte, Dachdetails), street (Bordsteinfasen, Gullys, Poller, Mülleimer, Schilder …),
// trees (Straßenbäume als InstancedMesh), skyline (ferne Silhouetten). Nur Stufe 'ultra' sichtbar; gebaut wird lazy im Leerlauf.
// Hängt die Teile an den Wurzelknoten der Stadt (city-root) und folgt den Bereichsgruppen des Moduls `city` (street/yard) pro Bild,
// damit das bestehende Bereichs-Culling greift. Keine Kollider (addCollider wird nie gerufen). Reihenfolge: nach `city`.
import { getOutdoor } from './outdoor.js';
import { planUltraCity } from '../world/ultra-plan.js';
import { buildUltraFacade, buildUltraStreet, buildUltraTrees, buildUltraSkyline } from '../world/build-city-ultra.js';

export default {
  name: 'ultra-city',
  init(ctx) {
    const L = ctx.layout;
    const ultra = ctx.use('ultra');
    const cityP = ctx.use('city');
    if (!L || !L.city || !ultra || !cityP || !cityP.groups) return {};
    const out = getOutdoor(ctx);
    const groups = cityP.groups;
    const parent = groups.street.parent || ctx.scene;
    const areas = ctx.use('areas');
    let plan = null;
    const getPlan = () => plan || (plan = planUltraCity(L)); // erst beim ersten Bau (lazy)
    const wrap = (build, withArea) => (c) => {
      const r = build(c);
      const base = r.update;
      const doSync = () => { if (r.sync) r.sync(groups, withArea && areas ? areas.current() : ''); };
      return {
        object: r.object,
        dispose: r.dispose,
        // Sichtbarwerden (nach Bau oder Wechsel auf Ultra): Teilmesh-Sichtbarkeit sofort setzen, nicht erst im nächsten update()
        onVisible(v) { if (v) doSync(); },
        update(dt, t) {
          doSync();
          if (base) base(dt, t);
        },
      };
    };
    const offs = [
      ultra.register('facade', wrap(() => buildUltraFacade(out, L.city, getPlan())), { parent }),
      ultra.register('street', wrap(() => buildUltraStreet(out, L.city, getPlan())), { parent }),
      ultra.register('trees', wrap(() => buildUltraTrees(out, L.city, getPlan())), { parent }),
      ultra.register('skyline', wrap(() => buildUltraSkyline(out, L.city, getPlan(), ctx.camera), true), { parent }),
    ];
    return { dispose() { for (const off of offs) off(); plan = null; } };
  },
};

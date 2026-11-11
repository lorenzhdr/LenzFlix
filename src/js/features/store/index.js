// VIDEOTHEK LENZ (store, Beta): Hülle im Hauptbundle. Das 3D-Bundle (src/js/store3d) lädt core/themejs.js lazy; Vertrag: docs/store3d.md.
// Die Hülle importiert nie `three`.
import home from './home.js';
import bar from './bar.js';

export const storeFeatures = [home, bar];

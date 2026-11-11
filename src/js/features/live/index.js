// LENZ LIVE (live, Beta): Hülle im Hauptbundle. Die Engine (src/js/live) lädt core/themejs.js lazy; Vertrag: docs/live.md.
// Die Hülle importiert nie etwas aus src/js/live (eigenes Bundle).
import home from './home.js';
import guard from './guard.js';

export const liveFeatures = [home, guard];

// VIDEOTHEK LENZ: Einstieg des lazy 3D-Bundles (dist/lenzstore.js). Vertrag: docs/store3d.md.
// Importiert nur three und Dateien aus src/js/store3d/ – nie core/, shared/ oder features/.
import { create } from './store.js';

window.LenzFlixStore3D = { version: 1, create };

// TV-Modus-Hülle (Hauptbundle). Die Engine (src/js/live/tvmode) lädt lazy über core/themejs.js.
import tvmode, { destroyTvMode } from './page.js';
import { initUnlock } from './unlock.js';

export const tvmodeFeatures = [tvmode];
export { destroyTvMode, initUnlock };

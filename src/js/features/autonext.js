// LenzFlix: Auto-Weiter im „Nächste Folge“-Overlay (Kern in ../autonext/autonext.js, eigenständig; Dauer-Schalter pro Konto).
// Gilt in allen Designs und im TV-Layout außer VIDEOTHEK LENZ (dort nutzt das 3D-Kino denselben Player; der Kern prüft das zusätzlich).
import { isTheme } from '../core/theme.js';
import { startAutoNext, stopAutoNext } from '../autonext/autonext.js';

export default {
  name: 'autonext',
  match() {
    return !isTheme('store');
  },
  mount() {
    startAutoNext();
  },
  unmount() {
    stopAutoNext();
  },
};

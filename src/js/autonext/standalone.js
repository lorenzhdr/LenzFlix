// LenzFlix Auto-Weiter als eigenständiges Skript (dist/lenzupnext.js): für Fernseher (Chromium 53, z. B. LG webOS 4)
// als zusätzlicher JS-Injector-Eintrag, wenn das Hauptbundle dort nicht läuft. Besitzt schon eine Instanz
// (window.__lfxAutoNext), tut es nichts.
import { startAutoNext } from './autonext.js';

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startAutoNext);
else startAutoNext();

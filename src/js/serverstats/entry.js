// Nachlade-Bundle „Server-Statistik“: setzt nur das Global, exportiert nichts.
import { create } from './app.js';

window.LenzFlixServerStats = { version: 1, mark: '__LFX_SRVSTATS_UI__', create };

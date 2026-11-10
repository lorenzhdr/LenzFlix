// LENZ//84: Feature-Liste. Jede Datei gehört genau einem Worker (siehe Kopfkommentar der Datei).
// Features matchen per isTheme('retro'). Reihenfolge = Mount-Reihenfolge des Routers.
import header from './header.js';
import tabbar from './tabbar.js';
import home from './home.js';
import title from './title.js';
import search from './search.js';
import browse from './browse.js';
import nativedetail from './nativedetail.js';
import fx from './fx/index.js';

export const retroFeatures = [header, tabbar, home, title, search, browse, nativedetail, fx];

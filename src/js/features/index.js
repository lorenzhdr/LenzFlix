// LenzFlix: Feature-Liste. Neue Features hier eintragen.
// Seiten-Features (library, mylist) stehen vor newpopular; secretmenu vor statshint.
import themeroute from './themeroute.js';
import nav from './nav.js';
import mobilenav from './mobilenav.js';
import tvbtn from './tvbtn.js';
import dsbtn from './dsbtn.js';
import osdcenter from './osdcenter.js';
import autonext from './autonext.js';
import playerbg from './playerbg.js';
import home from './home.js';
import hovercard from './hovercard.js';
import modal from './modal.js';
import library from './library.js';
import mylist from './mylist.js';
import newpopular from './newpopular.js';
import { tvmodeFeatures } from './tvmode/index.js';
import contextmenu from './contextmenu.js';
import secretmenu from './secretmenu.js';
import statshint from './statshint.js';
import sabback from './sabback.js';
import { plusFeatures } from './plus/index.js';
import { primeFeatures } from './prime/index.js';
import { retroFeatures } from './retro/index.js';
import { storeFeatures } from './store/index.js';

export const features = [themeroute, nav, mobilenav, tvbtn, dsbtn, osdcenter, autonext, playerbg, home, hovercard, modal, library, mylist, newpopular, ...tvmodeFeatures, contextmenu, secretmenu, statshint, sabback, ...plusFeatures, ...primeFeatures, ...retroFeatures, ...storeFeatures];

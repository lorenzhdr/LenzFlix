// LenzFlix: Feature-Liste. Neue Features hier eintragen.
import themeroute from './themeroute.js';
import nav from './nav.js';
import mobilenav from './mobilenav.js';
import tvbtn from './tvbtn.js';
import osdcenter from './osdcenter.js';
import home from './home.js';
import hovercard from './hovercard.js';
import modal from './modal.js';
import newpopular from './newpopular.js';
import { tvmodeFeatures } from './tvmode/index.js';
import contextmenu from './contextmenu.js';
import statshint from './statshint.js';
import { plusFeatures } from './plus/index.js';
import { primeFeatures } from './prime/index.js';
import { retroFeatures } from './retro/index.js';
import { storeFeatures } from './store/index.js';
import { liveFeatures } from './live/index.js';

export const features = [themeroute, nav, mobilenav, tvbtn, osdcenter, home, hovercard, modal, newpopular, ...tvmodeFeatures, contextmenu, statshint, ...plusFeatures, ...primeFeatures, ...retroFeatures, ...storeFeatures, ...liveFeatures];

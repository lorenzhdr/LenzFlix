// LenzFlix: Feature-Liste. Neue Features hier eintragen.
import themeroute from './themeroute.js';
import nav from './nav.js';
import mobilenav from './mobilenav.js';
import home from './home.js';
import hovercard from './hovercard.js';
import modal from './modal.js';
import newpopular from './newpopular.js';
import contextmenu from './contextmenu.js';
import statshint from './statshint.js';
import { plusFeatures } from './plus/index.js';
import { primeFeatures } from './prime/index.js';

export const features = [themeroute, nav, mobilenav, home, hovercard, modal, newpopular, contextmenu, statshint, ...plusFeatures, ...primeFeatures];

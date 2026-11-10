// LENZ+: Handy-Erkennung für die Handy-Layouts (deckungsgleich mit @media (max-width: 799px) in mobile.css).
import { isMobile } from '../../core/layout.js';

/** True nur bei Breite < 800 px; html.layout-mobile allein genügt nicht, weil die Handy-CSS-Regeln an die Breite gebunden sind. */
export function isPhone() {
  return isMobile() && window.innerWidth < 800;
}

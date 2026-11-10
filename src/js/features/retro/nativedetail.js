// LENZ//84: native Detailseite (#/details). Setzt lfx-retro-nologo / lfx-retro-nobackdrop auf #itemDetailPage
// (Logik geteilt mit LENZ+/LENZPRIME über die Fabrik createNativeDetail). Gehört Worker P2.
import { createNativeDetail } from '../plus/nativedetail.js';

export default createNativeDetail({
  name: 'retro-nativedetail',
  theme: 'retro',
  nologoClass: 'lfx-retro-nologo',
  nobdClass: 'lfx-retro-nobackdrop',
}).feature;

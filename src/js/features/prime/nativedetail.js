// LENZPRIME: native Detailseite (#/details). Setzt lfx-prime-nologo auf #itemDetailPage, wenn kein Titel-Logo sichtbar ist
// (kein Logo, Logo lädt nicht oder per CSS display:none) -> Name wird als Text gezeigt (modern/detail.css klippt ihn sonst auf 1 px).
// Logik geteilt mit LENZ+ (plus/nativedetail.js).
import { createNativeDetail } from '../plus/nativedetail.js';

export default createNativeDetail({ name: 'prime-nativedetail', theme: 'prime', nologoClass: 'lfx-prime-nologo' }).feature;

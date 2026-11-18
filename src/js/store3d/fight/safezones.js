// VIDEOTHEK LENZ · Schutzzonen (1.18.0; rein): Kinosaal (Film läuft), Kinder-Ecke, Couch, Friseurstuhl/Umkleide, offenes Menü, VR.
/** isSafe({ area, inKids, cinemaPlaying, couchSeated, salonBusy, menu, xr }) → Grund | null. Gilt in beide Richtungen (auch fürs Blenden). */
export function isSafe(s) {
  if (!s) return null;
  if (s.xr) return 'xr';
  if (s.menu) return 'menu';
  if (s.cinemaPlaying) return 'cinema';
  if (s.inKids) return 'kids';
  if (s.couchSeated) return 'couch';
  if (s.salonBusy) return 'salon';
  return null;
}
/** inSafeZone(state) → bool. */
export function inSafeZone(s) { return isSafe(s) !== null; }

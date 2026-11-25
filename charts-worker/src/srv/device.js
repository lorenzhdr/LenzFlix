/**
 * Grober Gerätetyp aus Client- und Gerätename: 'tv' | 'phone' | 'web' | 'other'.
 * Rein, ohne Seiteneffekte. Der Name selbst verlässt die Funktion nie.
 */
const TV_RE = /smart\s*-?tv|\btv\b|android\s*tv|google\s*tv|fire\s*tv|apple\s*tv|tvos|webos|web0s|tizen|roku|bravia|chromecast|shield|vidaa|hisense|samsung\s*tv|lg\s*tv|nvidia|kodi|firestick|xbox|playstation|console|dlna|set-?top/i;
const PHONE_RE = /iphone|ipad|ipod|\bios\b|android|mobile|phone|tablet|\bpixel\b|galaxy|\bsm-[a-z0-9]+/i;
const WEB_RE = /chrome|chromium|safari|firefox|edge|opera|brave|vivaldi|\bweb\b|browser|jellyfin\s*web|lenzflix|msie|trident/i;

export function deviceKind(client, deviceName) {
  const c = typeof client === 'string' ? client : '';
  const d = typeof deviceName === 'string' ? deviceName : '';
  const all = `${c} ${d}`;
  if (TV_RE.test(all)) return 'tv';
  if (PHONE_RE.test(all)) return 'phone';
  if (WEB_RE.test(all)) return 'web';
  return 'other';
}

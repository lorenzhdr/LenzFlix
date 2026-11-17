// TV-Modus: Admin-Belegung der Senderplätze 5–16.
// Quelle: window.LenzFlixConfig.tvChannels (Objekt { 5: 'Action' } oder String "5=Action;6=Komödie"),
// sonst die CSS-Variable --lfx-tv-channels (Custom CSS), Format wie der String.
// Kompatibilität mit bestehenden Admin-Konfigurationen: die alten Namen liveChannels / --lfx-live-channels (LENZ LIVE) werden weiter gelesen.
const MIN_NO = 5;
const MAX_NO = 16;

const stripQuotes = (s) => String(s == null ? '' : s).trim().replace(/^["'\s]+|["'\s]+$/g, '');

function put(out, no, label) {
  const n = Number(no);
  if (!Number.isInteger(n) || n < MIN_NO || n > MAX_NO) return;
  const l = stripQuotes(label);
  if (l) out[n] = l;
}

/** Objekt oder String -> { [no]: genreLabel } (nur Plätze 5–16, ungültige Einträge entfallen). */
export function parseChannelConfig(raw) {
  const out = {};
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string') put(out, k, v);
    }
    return out;
  }
  const s = stripQuotes(raw);
  if (!s) return out;
  for (const part of s.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    put(out, part.slice(0, i).trim(), part.slice(i + 1));
  }
  return out;
}

const CONFIG_KEYS = ['tvChannels', 'liveChannels']; // liveChannels: Rückfall (Kompatibilität)
const CSS_VARS = ['--lfx-tv-channels', '--lfx-live-channels']; // --lfx-live-channels: Rückfall (Kompatibilität)

/** window.LenzFlixConfig.tvChannels (Rückfall liveChannels) -> CSS-Variable --lfx-tv-channels (Rückfall --lfx-live-channels) -> {}. */
export function getChannelConfig() {
  for (const key of CONFIG_KEYS) {
    const cfg = window.LenzFlixConfig && window.LenzFlixConfig[key];
    if (cfg !== undefined && cfg !== null && cfg !== '') {
      const parsed = parseChannelConfig(cfg);
      if (Object.keys(parsed).length) return parsed;
    }
  }
  try {
    const style = getComputedStyle(document.documentElement);
    for (const name of CSS_VARS) {
      const parsed = parseChannelConfig(style.getPropertyValue(name));
      if (Object.keys(parsed).length) return parsed;
    }
  } catch { /* ignorieren */ }
  return {};
}

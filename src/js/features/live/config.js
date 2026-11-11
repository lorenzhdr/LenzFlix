// LENZ LIVE: Admin-Belegung der Senderplätze 5–16 (docs/live.md).
// Quelle: window.LenzFlixConfig.liveChannels (Objekt { 5: 'Action' } oder String "5=Action;6=Komödie"),
// sonst die CSS-Variable --lfx-live-channels (Custom CSS), Format wie der String.
export const MIN_NO = 5;
export const MAX_NO = 16;

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

/** window.LenzFlixConfig.liveChannels -> CSS-Variable --lfx-live-channels -> {}. */
export function getChannelConfig() {
  const cfg = window.LenzFlixConfig && window.LenzFlixConfig.liveChannels;
  if (cfg !== undefined && cfg !== null && cfg !== '') {
    const parsed = parseChannelConfig(cfg);
    if (Object.keys(parsed).length) return parsed;
  }
  try {
    return parseChannelConfig(getComputedStyle(document.documentElement).getPropertyValue('--lfx-live-channels'));
  } catch {
    return {};
  }
}

/** Admin-Zeile zum Kopieren: :root{--lfx-live-channels:"5=Action;6=Komödie"} */
export function channelConfigLine(map) {
  const clean = parseChannelConfig(map || {});
  const body = Object.keys(clean)
    .map(Number)
    .sort((a, b) => a - b)
    .map((n) => `${n}=${clean[n].replace(/["';=]/g, '')}`)
    .join(';');
  return `:root{--lfx-live-channels:"${body}"}`;
}

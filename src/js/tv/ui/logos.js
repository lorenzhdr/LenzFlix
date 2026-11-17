// TV-Modus · Senderfarben und Kurznamen (Farbe je Platz eindeutig, genutzt von Senderliste und Vorschaubild).

/** 18 verschiedene Senderfarben (Platz 1–18). */
export const LOGO_COLORS = [
  '#e53935', '#fb8c00', '#fdd835', '#7cb342', '#00897b', '#00acc1',
  '#1e88e5', '#3949ab', '#8e24aa', '#d81b60', '#6d4c41', '#546e7a',
  '#f4511e', '#c0ca33', '#43a047', '#039be5', '#5e35b1', '#ec407a',
];

const FIXED = { kino: 'KINO', klassik: 'KLASSIK', serie: 'SERIE', marathon: 'MARATHON', premiere: 'PREMIERE', thema: 'THEMA' };
const MAX_NAME = 9;

export function channelColor(no) {
  const n = Math.max(1, Math.floor(Number(no) || 1));
  return LOGO_COLORS[(n - 1) % LOGO_COLORS.length];
}

/** Dunkle (#1a1a1a) oder weiße Schrift: die Farbe mit dem höheren WCAG-Kontrast zur Senderfarbe. */
export function channelInk(no) {
  const c = channelColor(no).slice(1);
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) + 0.05;
  return L / 0.0603 > 1.05 / L ? '#1a1a1a' : '#ffffff'; // 0,0603 = Luminanz von #1a1a1a + 0,05
}

/** Kurzname: „KINO“, „KLASSIK“, Genre gekürzt auf 9 Zeichen. */
export function shortName(channel) {
  if (!channel) return '';
  if (FIXED[channel.key]) return FIXED[channel.key];
  let base = channel.genreLabel || String(channel.name || '').replace(/^LIVE\s+/i, '') || `P${channel.no}`;
  base = String(base).trim().toUpperCase();
  return base.length > MAX_NAME ? base.slice(0, MAX_NAME).trim() : base;
}

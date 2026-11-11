// LENZ LIVE · generierte Senderlogos (DOM/CSS, kein Canvas, keine Bilder). Farbe je Platz eindeutig.

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

/** Dunkle oder helle Schrift je nach Helligkeit der Senderfarbe. */
export function channelInk(no) {
  const c = channelColor(no).slice(1);
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#1a1a1a' : '#ffffff';
}

/** Kurzname: „KINO“, „KLASSIK“, Genre gekürzt auf 9 Zeichen. */
export function shortName(channel) {
  if (!channel) return '';
  if (FIXED[channel.key]) return FIXED[channel.key];
  let base = channel.genreLabel || String(channel.name || '').replace(/^LIVE\s+/i, '') || `P${channel.no}`;
  base = String(base).trim().toUpperCase();
  return base.length > MAX_NAME ? base.slice(0, MAX_NAME).trim() : base;
}

/** @returns {HTMLElement} .lfx-live-logo mit Wortmarke LIVE, Kurzname und optional Nummer. */
export function createLogo(channel, { number = false, doc = document } = {}) {
  const no = channel ? channel.no : 1;
  const root = doc.createElement('div');
  root.className = 'lfx-live-logo';
  root.style.setProperty('--lfx-live-logo-bg', channelColor(no));
  root.style.setProperty('--lfx-live-logo-ink', channelInk(no));
  const mark = doc.createElement('span');
  mark.className = 'lfx-live-logo__mark';
  mark.textContent = 'LIVE';
  const name = doc.createElement('span');
  name.className = 'lfx-live-logo__name';
  name.textContent = shortName(channel);
  root.append(mark, name);
  if (number) {
    const n = doc.createElement('span');
    n.className = 'lfx-live-logo__no';
    n.textContent = String(no);
    root.append(n);
  }
  return root;
}

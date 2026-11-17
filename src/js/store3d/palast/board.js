// VIDEOTHEK LENZ · LENZ PALAST: Zeichnen der Anzeigetafel und der Schilder (Canvas 2D, kein three).
import { clockText, highlightIndex, showState } from './program.js';

const FONT = '"Arial Black","Impact","Helvetica Neue",Arial,sans-serif';

function fit(g, text, maxW, size, weight = 'bold') {
  let s = size;
  g.font = `${weight} ${s}px ${FONT}`;
  while (g.measureText(text).width > maxW && s > 10) { s -= 2; g.font = `${weight} ${s}px ${FONT}`; }
  return s;
}

/** Tafel 1024×328: Kopf mit Uhrzeit, bis zu vier Zeilen, Fußspruch. state = { program, nowMin }. */
export function drawBoard(g, w, h, { program, nowMin } = {}) {
  g.fillStyle = '#0a0b16';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffd23f';
  g.fillRect(0, 0, w, 6);
  g.fillRect(0, h - 6, w, 6);
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.fillStyle = '#ff3d7f';
  g.font = `bold 34px ${FONT}`;
  g.fillText('LENZ PALAST · HEUTE', 24, 34);
  g.textAlign = 'right';
  g.fillStyle = '#ffd23f';
  g.font = `bold 38px ${FONT}`;
  g.fillText(Number.isFinite(nowMin) ? clockText(nowMin) : '--:--', w - 24, 34);
  const shows = (program && program.shows) || [];
  const hi = highlightIndex(program, nowMin);
  const rowH = 50;
  const y0 = 76;
  if (!shows.length) {
    g.textAlign = 'center';
    g.fillStyle = '#aab4e8';
    g.font = `bold 40px ${FONT}`;
    g.fillText('Heute leider kein Programm.', w / 2, 170);
    g.font = `bold 26px ${FONT}`;
    g.fillText('Der Vorführer ist Popcorn holen.', w / 2, 220);
  }
  shows.forEach((s, i) => {
    const y = y0 + i * rowH + rowH / 2;
    const st = showState(s, nowMin);
    const on = i === hi;
    if (on) { g.fillStyle = 'rgba(255,61,127,0.28)'; g.fillRect(12, y - rowH / 2 + 3, w - 24, rowH - 6); }
    g.textAlign = 'left';
    g.fillStyle = on ? '#ffd23f' : st === 'done' ? '#5b6086' : '#f4f6ff';
    g.font = `bold 38px ${FONT}`;
    g.fillText(s.time, 28, y);
    g.fillStyle = on ? '#ffffff' : st === 'done' ? '#5b6086' : '#d6dcff';
    const label = s.title + (s.resume ? '  ▶ weiter' : '');
    fit(g, label, w - 380, 36);
    g.fillText(label, 170, y);
    g.textAlign = 'right';
    g.fillStyle = on ? '#35e6ff' : '#7a82b4';
    const tagText = st === 'running' ? 'LÄUFT' : st === 'done' ? 'VORBEI' : on ? 'GLEICH' : s.tag.toUpperCase();
    fit(g, tagText, 250, 22);
    g.fillText(tagText, w - 28, y);
  });
  g.textAlign = 'center';
  g.fillStyle = '#8c94c8';
  fit(g, (program && program.footer) || '', w - 60, 26, 'normal');
  g.fillText((program && program.footer) || '', w / 2, h - 24);
}

/** Schildatlas 1024×256: vier Schilder (2×2, je 512×128): KASSE, SAAL 1, POPCORN, LENZ PALAST. Zellen siehe SIGN_CELLS (uv: [u0,v0,u1,v1]). */
const SIGN_TEXT = ['KASSE', 'SAAL 1', 'POPCORN', 'LENZ PALAST'];
export const SIGN_CELLS = SIGN_TEXT.map((_, i) => ({ x: (i % 2) * 512, y: Math.floor(i / 2) * 128, uv: [(i % 2) / 2, 1 - (Math.floor(i / 2) + 1) / 2, (i % 2 + 1) / 2, 1 - Math.floor(i / 2) / 2] }));
const SIGN_COLORS = ['#35e6ff', '#ff3d7f', '#ffd23f', '#ff9f1c'];

export function drawSigns(g) {
  g.fillStyle = '#10101c';
  g.fillRect(0, 0, 1024, 256);
  SIGN_TEXT.forEach((t, i) => {
    const { x, y } = SIGN_CELLS[i];
    g.strokeStyle = SIGN_COLORS[i];
    g.lineWidth = 6;
    g.strokeRect(x + 8, y + 8, 496, 112);
    g.fillStyle = SIGN_COLORS[i];
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fit(g, t, 460, 70);
    g.fillText(t, x + 256, y + 66);
  });
}

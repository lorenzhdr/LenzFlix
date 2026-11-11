// Heft-Renderer: Magazine (magazine/model.js) → PDF-Bytes (A4 hoch, eine PDF-Seite je Heftseite). Kein DOM, kein Netzwerk:
// Bilder liefert der Aufrufer über loadImage(imageId) → Promise<Uint8Array (JPEG)|null>. Keine URLs/Tokens im Ergebnis.
import { createPdf } from './writer.js';
import { textWidth, wrap, ellipsize } from './metrics.js';

const PW = 595;
const PH = 842;
const M = 28; // Seitenrand
const CW = PW - 2 * M;
const TOP = 88; // Inhalt beginnt unter Kopf und Seitentitel
const BOT = 806;

const hex = (s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];

/** Stil-Themen je TV-Stil. head/headInk = Senderkopf, zebra = Zeilenstreifen, band = Kopfband der Titelseite. */
const STYLES = {
  crt80: {
    bg: hex('#f3e9cf'), ink: hex('#1d1710'), muted: hex('#6b5d44'), accent: hex('#c8281e'), accent2: hex('#f2b705'),
    head: hex('#c8281e'), headInk: hex('#fff4d6'), zebra: hex('#eadfc0'), panel: hex('#e4d6ad'), rule: hex('#1d1710'),
    bandInk: hex('#fff4d6'), title: 'serif-bold', body: 'sans', bold: 'sans-bold', chipInk: hex('#fff4d6'),
  },
  silver: {
    bg: hex('#ffffff'), ink: hex('#1a2230'), muted: hex('#5d6b7e'), accent: hex('#1f5fbf'), accent2: hex('#9cc2ff'),
    head: hex('#1f5fbf'), headInk: hex('#ffffff'), zebra: hex('#eef1f5'), panel: hex('#dde4ee'), rule: hex('#b8c2d1'),
    bandInk: hex('#ffffff'), title: 'sans-bold', body: 'sans', bold: 'sans-bold', chipInk: hex('#ffffff'),
  },
  flat: {
    bg: hex('#141414'), ink: hex('#ffffff'), muted: hex('#a8a8a8'), accent: hex('#e50914'), accent2: null,
    head: hex('#2b2b2b'), headInk: hex('#ffffff'), zebra: hex('#1e1e1e'), panel: hex('#2b2b2b'), rule: hex('#3a3a3a'),
    bandInk: hex('#ffffff'), title: 'sans-bold', body: 'sans', bold: 'sans-bold', chipInk: hex('#ffffff'),
  },
  plain: {
    bg: hex('#ffffff'), ink: hex('#000000'), muted: hex('#666666'), accent: hex('#000000'), accent2: null,
    head: hex('#e6e6e6'), headInk: hex('#000000'), zebra: hex('#f4f4f4'), panel: hex('#e6e6e6'), rule: hex('#999999'),
    bandInk: hex('#ffffff'), title: 'sans-bold', body: 'sans', bold: 'sans-bold', chipInk: hex('#ffffff'),
  },
};

const BADGE_SHORT = { 'Premiere': 'Prem.', 'Neue Folge': 'Neu', 'Wdh.': 'Wdh.', 'ab 16': '16', 'ab 18': '18' };

function makeCtx(P, st) {
  const fill = (c) => P.setFill(c[0], c[1], c[2]);
  const T = (str, x, y, font, size, col) => { fill(col || st.ink); P.text(str, x, y, { font, size }); };
  const TR = (str, xr, y, font, size, col) => T(str, xr - textWidth(str, font, size), y, font, size, col);
  const TC = (str, xc, y, font, size, col) => T(str, xc - textWidth(str, font, size) / 2, y, font, size, col);
  const R = (x, y, w, h, col) => { fill(col); P.rect(x, y, w, h, { fill: true }); };
  /** Absatz ab Grundlinie y; höchstens maxLines Zeilen (letzte mit „…“). Gibt die nächste freie Grundlinie zurück. */
  const para = (text, x, y, w, font, size, lead, maxLines, col) => {
    let lines = wrap(text, font, size, w);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      const last = lines[maxLines - 1].replace(/[\s.,;:!?–-]+$/, '') + '…';
      lines[maxLines - 1] = ellipsize(last, font, size, w);
    }
    for (const l of lines) { T(l, x, y, font, size, col); y += lead; }
    return y;
  };
  return { fill, T, TR, TC, R, para };
}

const ageText = (age) => (age != null && age > 0 ? 'ab ' + age : '');

function metaLine(tip) {
  return [tip.year, (tip.genres || []).slice(0, 3).join(', '), tip.runMin ? tip.runMin + ' Min.' : '', ageText(tip.age)].filter(Boolean).join(' · ');
}

/** Wochentag/Datum zu einem Tipp (Sendetag aus start: Sendetag D beginnt 03:00/04:00 UTC, Rechnung ohne Datumsobjekte). */
function dayLabelOf(mag, tip) {
  if (!tip || !(tip.start > 0)) return '';
  const D = Math.floor((tip.start - 3 * 36e5) / 864e5);
  const d = (mag.days || []).find((x) => x.D === D);
  return d ? d.weekday + ' ' + d.date : '';
}

function chips(c, st, list, x, y) {
  for (const b of list.slice(0, 4)) {
    const w = textWidth(b, st.bold, 6.5) + 7;
    c.R(x, y - 8, w, 10.5, st.accent);
    c.T(b, x + 3.5, y - 0.5, st.bold, 6.5, st.chipInk);
    x += w + 4;
  }
}

function frame(c, P, st, mag, page, label, total) {
  c.R(0, 0, PW, PH, st.bg);
  c.R(0, 0, PW, 14, st.accent);
  if (st.accent2) c.R(0, 14, PW, 3, st.accent2);
  c.T('LIVE Programm', M, 30, st.bold, 8, st.accent);
  if (label) c.TR(label, PW - M, 30, st.body, 8, st.muted);
  P.setStroke(...st.rule);
  P.line(M, 818, PW - M, 818, 0.5);
  c.T(mag.subtitle || '', M, 830, st.body, 7, st.muted);
  c.TR('Seite ' + page.no + ' von ' + total, PW - M, 830, st.bold, 7.5, st.muted);
}

function pageTitle(c, P, st, text, sub) {
  c.T(ellipsize(text, st.title, 22, CW), M, 66, st.title, 22, st.ink);
  if (sub) c.TR(ellipsize(sub, st.body, 9, 200), PW - M, 66, st.body, 9, st.muted);
  c.R(M, 72, CW, 2.5, st.accent);
}

function drawImage(c, P, st, ref, x, y, w, h, initial) {
  c.R(x, y, w, h, st.panel);
  if (ref) {
    const s = Math.min(w / ref.width, h / ref.height);
    const iw = ref.width * s;
    const ih = ref.height * s;
    P.image(ref, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
  } else {
    const ch = String(initial || '').trim().charAt(0).toUpperCase() || 'L';
    c.TC(ch, x + w / 2, y + h / 2 + h * 0.12, st.title, Math.min(w, h) * 0.5, st.muted);
  }
}

function cover(c, P, st, mag, getImg) {
  return (async () => {
    c.R(0, 0, PW, PH, st.bg);
    c.R(0, 0, PW, 172, st.accent);
    if (st.accent2) c.R(0, 172, PW, 8, st.accent2);
    else { P.setStroke(...st.rule); P.line(0, 172, PW, 172, 1); }
    c.T('LIVE', M, 108, st.title, 60, st.bandInk);
    c.T('Programm', M + textWidth('LIVE ', st.title, 60) + 2, 108, st.title, 60, st.bandInk);
    c.T(ellipsize(mag.subtitle || '', st.body, 15, CW), M, 148, st.body, 15, st.bandInk);
    const hero = mag.cover && mag.cover.hero;
    if (hero) {
      const ref = await getImg(hero.imageId);
      drawImage(c, P, st, ref, M, 200, 230, 345, hero.title);
      const x = M + 230 + 18;
      const w = PW - M - x;
      let y = 214;
      c.T(String(hero.kindLabel || '').toUpperCase(), x, y, st.bold, 9, st.accent);
      y += 16;
      const when = [dayLabelOf(mag, hero), hero.time, hero.channelName].filter(Boolean).join(' · ');
      c.T(ellipsize(when, st.bold, 10, w), x, y, st.bold, 10, st.muted);
      y += 26;
      const tl = wrap(hero.title, st.title, 24, w).slice(0, 3);
      for (const l of tl) { c.T(l, x, y, st.title, 24, st.ink); y += 27; }
      if (hero.sub) { y = c.para(hero.sub, x, y + 2, w, st.body, 10, 13, 2, st.muted); }
      const meta = metaLine(hero);
      if (meta) { y += 4; c.T(ellipsize(meta, st.body, 9.5, w), x, y, st.body, 9.5, st.ink); y += 8; }
      if (hero.badges && hero.badges.length) { y += 12; chips(c, st, hero.badges, x, y); y += 6; }
      if (hero.overview) { y += 22; c.para(hero.overview, x, y, w, st.body, 10, 13.5, Math.max(3, Math.floor((545 - y) / 13.5)), st.ink); }
    } else {
      c.T('Das Programm der Woche', M, 260, st.title, 26, st.ink);
    }
    // Teaser-Leiste: Thementage
    const teasers = (mag.cover && mag.cover.teasers) || [];
    c.R(M, 566, CW, 2.5, st.accent);
    c.T('Thementage der Woche', M, 590, st.title, 14, st.ink);
    if (!teasers.length) c.T('Diese Woche keine Thementage.', M, 612, st.body, 9.5, st.muted);
    const cols = 4;
    const gap = 8;
    const bw = (CW - gap * (cols - 1)) / cols;
    const bh = 78;
    teasers.slice(0, 8).forEach((t, i) => {
      const x = M + (i % cols) * (bw + gap);
      const y = 604 + Math.floor(i / cols) * (bh + gap);
      c.R(x, y, bw, bh, st.panel);
      c.R(x, y, 3, bh, st.accent);
      c.T(t.weekday || '', x + 10, y + 18, st.bold, 12, st.accent);
      c.para(t.label || '', x + 10, y + 34, bw - 16, st.body, 8.5, 10.5, 4, st.ink);
    });
    P.setStroke(...st.rule);
    P.line(M, 818, PW - M, 818, 0.5);
    c.T('Das Programm ist für alle gleich · LENZ LIVE', M, 830, st.body, 7, st.muted);
    c.TR('Seite 1 von ' + mag.pages.length, PW - M, 830, st.bold, 7.5, st.muted);
  })();
}

function tipsPage(c, P, st, mag, page, getImg) {
  return (async () => {
    pageTitle(c, P, st, 'Tipps des Tages', page.weekday + ' ' + page.date);
    let y = TOP;
    if (page.theme) {
      c.T(ellipsize('Thementag: ' + page.theme, st.bold, 9, CW), M, y + 6, st.bold, 9, st.accent);
      y += 14;
    }
    const tips = page.tips || [];
    if (!tips.length) c.T('Für diesen Tag gibt es keine Programmtipps.', M, y + 20, st.body, 10, st.muted);
    const pitch = page.theme ? 134 : 138;
    const ih = pitch - 10;
    const iw = 86;
    for (let i = 0; i < tips.length; i++) {
      const t = tips[i];
      const by = y + i * pitch;
      const ref = await getImg(t.imageId);
      drawImage(c, P, st, ref, M, by, iw, ih, t.title);
      const x = M + iw + 14;
      const w = PW - M - x;
      let ty = by + 11;
      const head = [t.time, t.channelName, t.kindLabel].filter(Boolean).join(' · ');
      c.T(ellipsize(head, st.bold, 9, w), x, ty, st.bold, 9, st.accent);
      ty += 17;
      const tl = wrap(t.title, st.title, 14.5, w);
      const shown = tl.slice(0, 2);
      if (tl.length > 2) shown[1] = ellipsize(shown[1] + '…', st.title, 14.5, w);
      for (const l of shown) { c.T(l, x, ty, st.title, 14.5, st.ink); ty += 16.5; }
      if (t.sub) { c.T(ellipsize(t.sub, st.body, 9, w), x, ty - 2, st.body, 9, st.muted); ty += 11; }
      const meta = metaLine(t);
      if (meta) { c.T(ellipsize(meta, st.body, 8.5, w), x, ty - 2, st.body, 8.5, st.ink); ty += 11; }
      if (t.badges && t.badges.length) { chips(c, st, t.badges, x, ty + 3); ty += 14; }
      if (t.overview) {
        const room = Math.floor((by + ih - ty + 2) / 11);
        if (room >= 1) c.para(t.overview, x, ty, w, st.body, 8.5, 11, room, st.ink);
      }
      if (i < tips.length - 1) { P.setStroke(...st.rule); P.line(M, by + pitch - 5, PW - M, by + pitch - 5, 0.4); }
    }
  })();
}

/** Ein Senderblock: Kopf (Nummer + Name) und Zeilen (Zeit + Titel [Folgen] [Kürzel]); Überlauf → Zeilen kürzen, letzte „…“. */
function channelBlock(c, P, st, x, y, w, h, ch, size) {
  const headH = size + 7;
  c.R(x, y, w, headH, st.head);
  c.T(String(ch.no), x + 4, y + headH - 4, st.bold, size + 1.5, st.headInk);
  const nm = String(ch.name || '').replace(/^LIVE\s+/i, '');
  c.T(ellipsize(nm, st.bold, size + 1, w - 24), x + 20, y + headH - 4, st.bold, size + 1, st.headInk);
  const pitch = size + 1.8;
  let ry = y + headH;
  const rows = ch.rows || [];
  let extra = 0;
  if (ch.theme) extra = 1;
  const maxRows = Math.max(1, Math.floor((h - headH - 1) / pitch) - extra);
  const cut = rows.length > maxRows;
  const list = cut ? rows.slice(0, maxRows - 1) : rows;
  if (ch.theme) {
    c.T(ellipsize(ch.theme, st.bold, size, w - 6), x + 3, ry + size + 0.2, st.bold, size, st.accent);
    ry += pitch;
  }
  const tw = textWidth('00:00', st.bold, size) + 3;
  list.forEach((r, i) => {
    if (i % 2 === 1) c.R(x, ry, w, pitch, st.zebra);
    const base = ry + size + 0.3;
    const closed = r.kind === 'closedown' || r.kind === 'fill';
    c.T(r.time, x + 2, base, st.bold, size, closed ? st.muted : st.accent);
    const badge = (r.badges || []).filter((b) => BADGE_SHORT[b]).map((b) => BADGE_SHORT[b]).join(' ');
    const bw = badge ? textWidth(badge, st.bold, size - 0.5) + 2 : 0;
    if (badge) c.TR(badge, x + w - 2, base, st.bold, size - 0.5, st.accent);
    const tx = x + 2 + tw;
    const avail = w - 4 - tw - bw;
    const title = closed ? r.title : ellipsize(r.title, st.body, size, avail);
    c.T(closed ? ellipsize(title, st.body, size, avail) : title, tx, base, st.body, size, closed ? st.muted : st.ink);
    if (r.sub && !closed) {
      const used = textWidth(title, st.body, size) + 3;
      const rest = avail - used;
      if (rest > 18) c.T(ellipsize(r.sub, st.body, size - 0.5, rest), tx + used, base, st.body, size - 0.5, st.muted);
    }
    ry += pitch;
  });
  if (cut) c.T('…', x + 2 + tw, ry + size, st.bold, size, st.muted);
  P.setStroke(...st.rule);
  P.line(x, y + h, x + w, y + h, 0.3);
}

/** Größte Schriftgröße (min…max), bei der alle Senderblöcke ohne Kürzen passen; sonst min. */
function fitSize(channels, h, min, max) {
  for (let s = max; s > min; s -= 0.2) {
    const pitch = s + 1.8;
    if (channels.every((ch) => s + 7 + ((ch.rows || []).length + (ch.theme ? 1 : 0)) * pitch + 1 <= h)) return s;
  }
  return min;
}

function eveningPage(c, P, st, page) {
  pageTitle(c, P, st, 'Abendprogramm', page.weekday + ' ' + page.date + ' · ab 20:15');
  const cols = 3;
  const gap = 10;
  const bw = (CW - gap * (cols - 1)) / cols;
  const rows = Math.ceil((page.channels || []).length / cols) || 1;
  const bh = (BOT - TOP - gap * (rows - 1)) / rows;
  const size = fitSize(page.channels || [], bh, 6.8, 8.6);
  (page.channels || []).forEach((ch, i) => {
    channelBlock(c, P, st, M + (i % cols) * (bw + gap), TOP + Math.floor(i / cols) * (bh + gap), bw, bh, ch, size);
  });
}

function dayPage(c, P, st, page) {
  pageTitle(c, P, st, 'Tagesprogramm', page.weekday + ' ' + page.date + (page.part === 1 ? ' · Sender 1–9' : ' · Sender 10–18'));
  const cols = 3;
  const gap = 10;
  const bw = (CW - gap * (cols - 1)) / cols;
  const rows = Math.ceil((page.channels || []).length / cols) || 1;
  const bh = (BOT - TOP - gap * (rows - 1)) / rows;
  const size = fitSize(page.channels || [], bh, 6.6, 8.4);
  (page.channels || []).forEach((ch, i) => {
    channelBlock(c, P, st, M + (i % cols) * (bw + gap), TOP + Math.floor(i / cols) * (bh + gap), bw, bh, ch, size);
  });
}

function backPage(c, P, st, mag, opts) {
  pageTitle(c, P, st, 'Hinweise', 'LIVE Programm');
  const paras = [
    ['Programm für alle gleich', 'Das Programm wird aus der Mediathek berechnet und ist auf allen Geräten identisch: Wer um 20:15 einschaltet, sieht dieselbe Sendung an derselben Stelle.'],
    ['Jugendschutz', 'Titel ab 16 Jahren laufen frühestens ab 22 Uhr, Titel ab 18 Jahren frühestens ab 23 Uhr.'],
    ['Füllprogramm', 'Nachts und in Programmlücken läuft Füllprogramm mit kurzen Titeln. Das reguläre Programm beginnt jeden Sendetag um 5:00 Uhr.'],
    ['Premieren und Thementage', 'Auf LIVE Premiere laufen neu hinzugekommene Titel zum ersten Mal um 20:15 Uhr, auf dem Thementag-Sender wechselt das Motto täglich.'],
    ['Änderungen vorbehalten', 'Die Fernsehzeitung zeigt den Stand beim Erzeugen. Kommen Titel hinzu oder fallen weg, kann sich das Programm ändern.'],
  ];
  let y = TOP + 8;
  for (const [h, t] of paras) {
    c.T(h, M, y, st.title, 13, st.accent);
    y = c.para(t, M, y + 17, CW, st.body, 10.5, 14.5, 5, st.ink) + 14;
  }
  const range = String(mag.subtitle || '').replace(/^Die Fernsehwoche\s*·\s*/, '');
  c.R(M, y + 6, CW, 1, st.rule);
  c.T('Sendewoche ' + range + (opts && opts.created ? ' · erzeugt am ' + opts.created : ''), M, y + 26, st.bold, 9.5, st.ink);
  c.T('Als PDF erzeugt von LENZ LIVE.', M, y + 42, st.body, 9, st.muted);
}

/** renderMagazinePdf(magazine, { style, loadImage, onProgress, created? }) → Promise<Uint8Array> */
export async function renderMagazinePdf(magazine, opts = {}) {
  const st = STYLES[opts.style] || STYLES.flat;
  const pdf = createPdf({ title: magazine.title || 'LIVE Programm' });
  const cache = new Map();
  const getImg = async (id) => {
    if (!id || typeof opts.loadImage !== 'function') return null;
    if (cache.has(id)) return cache.get(id);
    let ref;
    try {
      const bytes = await opts.loadImage(id);
      ref = bytes ? pdf.addJpeg(bytes) : null;
    } catch {
      ref = null;
    }
    cache.set(id, ref);
    return ref;
  };
  const pages = magazine.pages || [];
  const total = pages.length;
  for (let i = 0; i < total; i++) {
    const pg = pages[i];
    const P = pdf.addPage(PW, PH);
    const c = makeCtx(P, st);
    if (pg.kind === 'cover') await cover(c, P, st, magazine, getImg);
    else {
      const label = { tips: 'Tipps des Tages', evening: 'Abendprogramm', day: 'Tagesprogramm', back: 'Hinweise' }[pg.kind] || '';
      frame(c, P, st, magazine, pg, label, total);
      if (pg.kind === 'tips') await tipsPage(c, P, st, magazine, pg, getImg);
      else if (pg.kind === 'evening') eveningPage(c, P, st, pg);
      else if (pg.kind === 'day') dayPage(c, P, st, pg);
      else if (pg.kind === 'back') backPage(c, P, st, magazine, opts);
    }
    if (typeof opts.onProgress === 'function') {
      try { opts.onProgress(i + 1, total); } catch { /* Fortschrittsanzeige darf das PDF nicht abbrechen */ }
    }
  }
  return pdf.toBytes();
}

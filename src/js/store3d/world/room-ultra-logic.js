// VIDEOTHEK LENZ · Ultra-Innenraum (1.19.0), reine Platzierung ohne three: Plakate, Tresen-Kleinkram, Regal-Preisschilder,
// Genre-Leisten, Fußmatte, Lampen, Staub. Alles Dekor: keine Kollider, nichts in Interaktionsboxen/Laufwegen.
import { levelY } from './layout.js';
import { rng } from '../util/geo.js';

/** Plakat-Zellen (Atlas 4 × 2): Fantasietitel, Tagline, Sterne (0..5), Farben. Keine realen Titel/Marken. */
export const POSTER_ART = [
  { title: 'NEONREGEN', tag: 'Die Nacht gehört niemandem.', stars: 4, c: ['#12062e', '#ff2d95'] },
  { title: 'DER GLÄSERNE TURM', tag: 'Ganz oben wird die Luft dünn.', stars: 5, c: ['#0b2a3d', '#52e0d0'] },
  { title: 'KAPITÄN KNALL', tag: 'Ein Held. Ein Schiff. Viel Pulver.', stars: 3, c: ['#4a1d0b', '#ffb627'] },
  { title: 'SIEBEN STUNDEN STILLE', tag: 'Man hört nur den Regen.', stars: 4, c: ['#1d2433', '#9fb4d8'] },
  { title: 'MONDFLÜSTERER', tag: 'Er weiß, was der Mond verschweigt.', stars: 5, c: ['#150f3a', '#a98bff'] },
  { title: 'TURBO OMA', tag: 'Gas geben ab 80.', stars: 3, c: ['#6a0f2f', '#ffd166'] },
  { title: 'DAS GROSSE PUDDING-KOMPLOTT', tag: 'Wackeln ist erst der Anfang.', stars: 4, c: ['#2b5d34', '#ffe27a'] },
  { title: 'WINTERSCHLAF', tag: 'Weck mich, wenn es vorbei ist.', stars: 4, c: ['#16324f', '#e6f1ff'] },
];

/**
 * Plakat-Plätze: Nordwand zwischen den vorhandenen Plakaten (versetzt um 1,2 m) und die Pfeiler der Eingangsfront
 * zwischen Schaufenster und Tür. Rückgabe: [{ x, y, z, ry, w, h, cell }] (ry = Drehung um y, Normale (sin ry, cos ry)).
 */
export function posterSpots(layout) {
  const { w: W, d: D } = layout;
  const out = [];
  const st = layout.zones && layout.zones.staff;
  let cell = 0;
  for (let x = 2.8; x < W - 1.2; x += 2.4) {
    if (st && Math.abs(x - st.x) < 1.4) continue;
    out.push({ x, y: 1.5, z: 0.035, ry: 0, w: 0.6, h: 0.9, cell: cell++ % POSTER_ART.length });
  }
  const door = layout.door;
  if (door) {
    const wins = (layout.facade && layout.facade.windows) || [];
    const left = wins.find((q) => q.x1 <= door.x0);
    const right = wins.find((q) => q.x0 >= door.x1);
    if (left) out.push({ x: (left.x1 + door.x0) / 2, y: 1.55, z: D - 0.035, ry: Math.PI, w: 0.5, h: 0.75, cell: cell++ % POSTER_ART.length });
    if (right) out.push({ x: (door.x1 + right.x0) / 2, y: 1.55, z: D - 0.035, ry: Math.PI, w: 0.5, h: 0.75, cell: cell % POSTER_ART.length });
  }
  return out;
}

/**
 * Plakattitel einpassen (reine Funktion, `measure(text, px)` → Breite): Schriftgröße von `max` bis `min` verkleinern, bis das breiteste
 * Wort in `maxW` passt; passt es bei `min` immer noch nicht, wird das Wort mit Bindestrich getrennt. Rückgabe { px, words }.
 */
export function fitTitle(title, maxW, measure, max = 30, min = 17) {
  const words = String(title).split(' ');
  const widest = (ws, px) => ws.reduce((m, w) => Math.max(m, measure(w, px)), 0);
  let px = max;
  while (px > min && widest(words, px) > maxW) px -= 1;
  if (widest(words, px) <= maxW) return { px, words };
  const out = [];
  for (const w of words) {
    let rest = w;
    while (rest.length > 3 && measure(rest, px) > maxW) {
      let n = rest.length - 1;
      while (n > 2 && measure(rest.slice(0, n) + '-', px) > maxW) n--;
      out.push(rest.slice(0, n) + '-');
      rest = rest.slice(n);
    }
    out.push(rest);
  }
  return { px, words: out };
}

const C = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

/**
 * Tresen-Kleinkram als Quader { x, y, z, w, h, d, color, rx? } (y = Mitte). Liegt nur auf der Tresenplatte (Oberfläche y 1,1),
 * z-Streifen nördlich von Richards Interaktionsbox (ab z = D − 2,95); Kassen-PC (x pc ± 0,22) und Drucker (W − 1,8 ± 0,18) bleiben frei.
 */
export function clutterBoxes(layout) {
  const { w: W, d: D } = layout;
  const out = [];
  const TOP = 1.1;
  const add = (x, z, w, h, d, color, extra = {}) => out.push({ x, y: TOP + h / 2 + (extra.lift || 0), z, w, h, d, color, ...extra });
  const zc = D - 3.2;
  // Kasse: Gehäuse, Schubfach, geneigte Tastenfläche, Display
  add(W - 2.55, zc, 0.36, 0.1, 0.28, C(0x3a3d46));
  out.push({ x: W - 2.55, y: TOP + 0.13, z: zc - 0.02, w: 0.3, h: 0.04, d: 0.2, color: C(0xd8d8dc), rx: -0.35 });
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    out.push({ x: W - 2.55 + (i - 1.5) * 0.06, y: TOP + 0.158 - j * 0.014, z: zc - 0.045 + j * 0.052, w: 0.045, h: 0.012, d: 0.04, color: C((i + j) % 3 === 0 ? 0x4fb15a : (i + j) % 3 === 1 ? 0xf2d34f : 0xe0e0e6), rx: -0.35 });
  }
  out.push({ x: W - 2.55, y: TOP + 0.26, z: zc - 0.1, w: 0.2, h: 0.1, d: 0.03, color: C(0x1c3a2a), rx: -0.2 });
  // Stiftebecher mit Stiften
  add(W - 3.0, zc - 0.1, 0.07, 0.1, 0.07, C(0xc4182b));
  for (let i = 0; i < 3; i++) out.push({ x: W - 3.0 + (i - 1) * 0.018, y: TOP + 0.14, z: zc - 0.1, w: 0.008, h: 0.1, d: 0.008, color: C([0x2447c4, 0x222222, 0xe0b020][i]), rx: (i - 1) * 0.12 });
  // Flyerstapel (zwei Stapel) und Kaffeebecher
  add(W - 4.3, zc, 0.2, 0.07, 0.14, C(0xf3efe2));
  add(W - 4.3, zc, 0.19, 0.012, 0.13, C(0xff4fa3), { lift: 0.07 });
  add(W - 1.2, zc + 0.05, 0.2, 0.05, 0.14, C(0xf3efe2));
  add(W - 4.0, zc - 0.08, 0.07, 0.1, 0.07, C(0xf7f7f2));
  add(W - 4.0, zc - 0.08, 0.072, 0.025, 0.072, C(0x2a6f86), { lift: 0.03 });
  add(W - 4.0, zc - 0.08, 0.06, 0.006, 0.06, C(0x3b2415), { lift: 0.094 });
  out.push({ x: W - 3.95, y: TOP + 0.05, z: zc - 0.08, w: 0.012, h: 0.05, d: 0.03, color: C(0xf7f7f2) });
  // Klingel
  add(W - 2.1, zc - 0.04, 0.09, 0.025, 0.09, C(0xc9a227));
  add(W - 2.1, zc - 0.04, 0.05, 0.03, 0.05, C(0xe9c84a), { lift: 0.025 });
  add(W - 2.1, zc - 0.04, 0.012, 0.014, 0.012, C(0x222222), { lift: 0.055 });
  // Rückgabe-Einwurf (Schlitzkasten) am Westende der Platte
  add(W - 4.42, zc - 0.12, 0.16, 0.12, 0.12, C(0x2a2d36));
  out.push({ x: W - 4.42, y: TOP + 0.09, z: zc - 0.12 + 0.061, w: 0.11, h: 0.012, d: 0.004, color: C(0x050505) });
  out.push({ x: W - 4.42, y: TOP + 0.03, z: zc - 0.12 + 0.061, w: 0.12, h: 0.03, d: 0.004, color: C(0xff4fa3) });
  // Fußmatte im Eingang (flach, vor der Tür)
  const dm = layout.door;
  if (dm) {
    const cx = (dm.x0 + dm.x1) / 2;
    out.push({ x: cx, y: 0.007, z: D - 0.55, w: 1.5, h: 0.014, d: 0.7, color: C(0x2b2d33), mat: true });
    for (const dz of [-0.2, 0, 0.2]) out.push({ x: cx, y: 0.0145, z: D - 0.55 + dz, w: 1.38, h: 0.003, d: 0.05, color: C(0x8b1e2e), mat: true });
  }
  return out;
}

/** Regal-Preisschilder und Genre-Leisten als Flächen { x, y, z, ry, w, h, color }. Direkt vor den Fachboden-Fronten (+4 mm). */
export function shelfTags(layout) {
  const out = [];
  const spec = layout.spec;
  const OFF = 0.004;
  const palette = [0xfff1a8, 0xffffff, 0xff7a7a, 0xa8e6ff];
  layout.faces.forEach((f, fi) => {
    if (!f.slots.some((s) => s != null)) return;
    const r = rng(fi * 131 + 7);
    const cx = Math.cos(f.yaw);
    const cz = -Math.sin(f.yaw);
    const base = (lx, y, w, h, color) => out.push({ x: f.x + cx * lx + f.nx * OFF, y, z: f.z + cz * lx + f.nz * OFF, ry: f.yaw, w, h, color });
    // Genre-Leiste am Sockel in der Abteilungsfarbe
    const dc = typeof f.color === 'string' ? parseInt(f.color.replace('#', ''), 16) : f.color;
    base(0, 0.05, 1.12, 0.045, Number.isFinite(dc) ? dc : 0x35e6ff);
    for (let lv = 0; lv < f.rows; lv++) {
      const top = levelY(spec, lv, f.low);
      for (const lx of [-0.4, 0.42]) base(lx + (r() - 0.5) * 0.08, top - 0.0145, 0.1, 0.024, palette[Math.floor(r() * palette.length)]);
    }
  });
  return out;
}

/** Sockelleisten { x, z, w, d } (Mittelpunkt, Maße am Boden): Nordwand ohne Personaltür und freie Seitenwand-Abschnitte. */
export function skirtingSpans(layout, wallTrimSpans) {
  const { w: W, d: D } = layout;
  const out = [];
  const st = layout.zones && layout.zones.staff;
  const spans = st ? [[0, st.x - 0.6], [st.x + 0.6, W]] : [[0, W]];
  for (const [a, b] of spans) if (b - a > 0.1) out.push({ x: (a + b) / 2, z: 0.03, w: b - a, d: 0.06 });
  if (typeof wallTrimSpans === 'function') {
    for (const [a, b] of wallTrimSpans(layout, 'w', D)) if (b - a > 0.1) out.push({ x: 0.03, z: (a + b) / 2, w: 0.06, d: b - a });
    for (const [a, b] of wallTrimSpans(layout, 'e', D)) if (b - a > 0.1) out.push({ x: W - 0.03, z: (a + b) / 2, w: 0.06, d: b - a });
  }
  return out;
}

/** Lampen: Halo-Quads je Deckenpaneel + Neonröhre über dem Tresen. */
export function lampSpecs(layout) {
  const { w: W, d: D, ceilH } = layout;
  const halos = layout.panels.map((p) => ({ x: p.x, y: ceilH - 0.06, z: p.z, w: p.w + 1.6, d: p.d + 1.4 }));
  const strips = [];
  for (const p of layout.panels) for (const s of [-1, 1]) strips.push({ x: p.x, y: ceilH - 0.05, z: p.z + s * (p.d / 2 + 0.09), w: p.w + 0.3, h: 0.012, d: 0.035 });
  const neon = { x0: W - 4.2, x1: W - 0.5, y: 2.78, z: D - 3.3 };
  return { halos, strips, neon };
}

/** Staubpartikel: ~n Punkte in Lichtkegeln unter Deckenpaneelen und vor den Schaufenstern. [{ x, y, z, ph, sp }] */
export function dustPoints(layout, n = 200) {
  const r = rng(1907);
  const { w: W, d: D, panels } = layout;
  const out = [];
  const zones = [];
  for (const p of panels) zones.push({ x: p.x, z: p.z, rx: 0.9, rz: 0.7 });
  const wins = (layout.facade && layout.facade.windows) || [];
  for (const wd of wins) zones.push({ x: (wd.x0 + wd.x1) / 2, z: D - 0.9, rx: (wd.x1 - wd.x0) / 2, rz: 0.7 });
  if (!zones.length) zones.push({ x: W / 2, z: D / 2, rx: 2, rz: 2 });
  for (let i = 0; i < n; i++) {
    const zn = zones[Math.floor(r() * zones.length)];
    out.push({ x: zn.x + (r() * 2 - 1) * zn.rx, y: 0.7 + r() * 2.1, z: zn.z + (r() * 2 - 1) * zn.rz, ph: r() * 6.283, sp: 0.15 + r() * 0.35 });
  }
  return out;
}

/** Bekannte Interaktionsboxen im Laden (Kasse/PC, Richard, Rückgabe-Wagen, Reservierung); nur zur Gegenprobe in Tests/Debug. */
export function knownInteractBoxes(layout) {
  const { w: W, d: D, pc, counter: cn } = layout;
  const pcz = (cn.z0 + cn.z1) / 2;
  const home = { x: W - 2.9, z: D - 2.35 };
  const zc = D - 4.3;
  return [
    { name: 'terminal', x0: pc.x - 0.32, x1: pc.x + 0.32, z0: pcz - 0.26, z1: pcz + 0.26, y0: 1.1, y1: 1.62 },
    { name: 'richard', x0: home.x - 0.5, x1: home.x + 0.5, z0: home.z - 0.6, z1: home.z + 0.4, y0: 0.2, y1: 2.0 },
    { name: 'returns', x0: W - 1.0 - 0.4, x1: W - 1.0 + 0.4, z0: zc - 0.27, z1: zc + 0.27, y0: 0.15, y1: 1.22 },
    { name: 'reserve', x0: W - 0.36, x1: W, z0: D - 2.6, z1: D - 0.6, y0: 0.3, y1: 2.4 },
  ];
}

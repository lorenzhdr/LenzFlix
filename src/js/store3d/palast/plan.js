// VIDEOTHEK LENZ · LENZ PALAST: Grundriss des Innenausbaus (rein: kein three, kein DOM, JSON-sicher, deterministisch).
// Eingabe: layout.city.palast (world/city.js). Ausgabe: Stufen und Ränge (Kollider mit Höhe), Sitze, Gang, Saal-Rechteck,
// Leinwand-Anker, Stationsanker im Foyer (für Personal und Interaktionen), Plakatplätze innen.
// Koordinaten: +z geht vom Eingang (Straße) nach hinten zur Leinwand. Blick nach +z = yaw PI (Vorwärts = (-sin yaw, -cos yaw)).

export const SEAT = Object.freeze({ pitch: 0.6, depth: 0.5, h: 0.95, eye: 1.15, aisleW: 1.6, wallGap: 0.9 });
const SCREEN_OPTS = Object.freeze({ radius: 16, bottom: 1.8, maxW: 10.5, maxH: 4.9, padW: 1.6, padH: 1.2 });
const STEP_DEPTH = 0.3;
const STEP_MAX = 0.28;
const MAX_RISE = 0.14;

const r3 = (v) => Math.round(v * 1000) / 1000;
const mid = (d) => (d.x0 + d.x1) / 2;

/** Reihenbuchstabe: vorderste Reihe = A. */
const rowLetter = (frontIndex) => String.fromCharCode(65 + frontIndex);

/** Plan des Palast-Innenausbaus. p = layout.city.palast. */
export function buildPlan(p) {
  const hall = p.hall;
  const foyer = p.foyer;
  const sb = p.seatBlock;
  const cx = p.screen.cx;
  const rows = sb.rows;
  const rise = Math.min(Number.isFinite(sb.rise) ? sb.rise : MAX_RISE, MAX_RISE);
  const top = rise * (rows - 1);
  const rowY = (i) => r3(top - rise * i); // Reihe 0 = hinten (Tür), höchste

  // --- Stufen vom Saaleingang (Boden 0) zur hintersten Reihe ---
  const steps = [];
  const nSteps = top > 0.001 ? Math.ceil(top / STEP_MAX) : 0;
  for (let k = 0; k < nSteps; k++) {
    const z0 = hall.z0 + k * STEP_DEPTH;
    const z1 = k === nSteps - 1 ? Math.max(sb.z0, z0 + STEP_DEPTH) : z0 + STEP_DEPTH;
    steps.push({ x0: hall.x0, z0: r3(z0), x1: hall.x1, z1: r3(z1), y: r3((top * (k + 1)) / nSteps) });
  }

  // --- Ränge: eine Fläche je Reihe, volle Saalbreite ---
  const platforms = [];
  for (let i = 0; i < rows; i++) {
    const y = rowY(i);
    if (y > 0.001) platforms.push({ row: i, x0: hall.x0, z0: r3(sb.z0 + i * sb.pitch), x1: hall.x1, z1: r3(sb.z0 + (i + 1) * sb.pitch), y });
  }

  // --- Gänge an den Saaltüren, Sitzabschnitte dazwischen ---
  const aisles = p.hallDoors.map((d) => mid(d));
  const half = SEAT.aisleW / 2;
  const edges = [hall.x0 + SEAT.wallGap, ...aisles.flatMap((a) => [a - half, a + half]), hall.x1 - SEAT.wallGap];
  const sections = [];
  for (let s = 0; s < edges.length; s += 2) {
    const a = edges[s];
    const b = edges[s + 1];
    const n = Math.floor((b - a) / SEAT.pitch);
    if (n >= 1) sections.push({ x0: r3(a), x1: r3(b), n });
  }
  const seats = [];
  const seatBlocks = [];
  for (let i = 0; i < rows; i++) {
    const y = rowY(i);
    const zc = r3(sb.z0 + (i + 0.5) * sb.pitch);
    const letter = rowLetter(rows - 1 - i);
    let num = 0;
    for (const s of sections) {
      const w = s.n * SEAT.pitch;
      const start = (s.x0 + s.x1) / 2 - w / 2;
      for (let j = 0; j < s.n; j++) {
        num++;
        seats.push({ id: `${letter}${num}`, row: i, x: r3(start + (j + 0.5) * SEAT.pitch), y: r3(y + SEAT.eye), z: zc, yaw: Math.PI, base: y });
      }
      seatBlocks.push({ row: i, x0: r3(start), z0: r3(zc - SEAT.depth / 2), x1: r3(start + w), z1: r3(zc + SEAT.depth / 2), y0: 0, y1: r3(y + SEAT.h) });
    }
  }

  const lastZ1 = sb.z0 + rows * sb.pitch;
  const colliders = [
    ...steps.map((s, k) => ({ id: `palastStep${k}`, kind: 'prop', x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1, y0: 0, y1: s.y })),
    ...platforms.map((q) => ({ id: `palastRow${q.row}`, kind: 'prop', x0: q.x0, z0: q.z0, x1: q.x1, z1: q.z1, y0: 0, y1: q.y })),
    ...seatBlocks.map((b, k) => ({ id: `palastSeats${k}`, kind: 'prop', x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, y0: b.y0, y1: b.y1 })),
  ];

  // --- Foyer-Stationen ---
  const fz0 = foyer.z0;
  const fz1 = foyer.z1;
  const stations = {
    ticket: { x: r3(cx + 2.7), z: r3(fz1 - 0.45), yaw: 0 }, // Kartenabreißer (Figur), blickt zum Foyer
    ticketDesk: { x0: r3(cx + 2.1), z0: r3(fz1 - 1.3), x1: r3(cx + 3.3), z1: r3(fz1 - 0.9), h: 1.05 },
    kasse: { x0: r3(cx - 7.8), z0: r3(fz0 + 2.4), x1: r3(cx - 4.6), z1: r3(fz0 + 3.1), h: 1.05, yaw: 0 },
    popcorn: { x0: r3(cx + 4.6), z0: r3(fz0 + 2.4), x1: r3(cx + 7.8), z1: r3(fz0 + 3.1), h: 1.05, yaw: 0 },
    popcornStaff: { x: r3(cx + 6.2), z: r3(fz0 + 3.75), yaw: 0 },
    board: { x: cx, y: 2.75, z: r3(fz1 - 0.02), w: 5.2, h: 1.7, yaw: 0 }, // an der Trennwand, Blick nach -z
    carpet: { x0: r3(cx - 1.7), z0: fz0, x1: r3(cx + 1.7), z1: fz1 },
  };
  const bz = (fz0 + fz1) / 2;
  const posters = [
    { x: foyer.x0 + 0.02, z: r3(bz - 1.4), y: 1.85, w: 1.0, h: 1.5, yaw: Math.PI / 2 },
    { x: foyer.x0 + 0.02, z: r3(bz + 1.4), y: 1.85, w: 1.0, h: 1.5, yaw: Math.PI / 2 },
    { x: foyer.x1 - 0.02, z: r3(bz - 1.4), y: 1.85, w: 1.0, h: 1.5, yaw: -Math.PI / 2 },
    { x: foyer.x1 - 0.02, z: r3(bz + 1.4), y: 1.85, w: 1.0, h: 1.5, yaw: -Math.PI / 2 },
  ];
  // Kordelständer: je drei Pfosten beidseits des Teppichs
  const posts = [];
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) posts.push({ x: r3(cx + sx * 2.0), z: r3(fz0 + 1.2 + k * 1.3) });
  const colliderExtra = [
    { id: 'palastKasse', kind: 'prop', ...rectOf(stations.kasse) },
    { id: 'palastPopcorn', kind: 'prop', ...rectOf(stations.popcorn) },
    { id: 'palastTicketDesk', kind: 'prop', ...rectOf(stations.ticketDesk) },
    ...posts.map((q, k) => ({ id: `palastPost${k}`, kind: 'prop', x0: r3(q.x - 0.07), z0: r3(q.z - 0.07), x1: r3(q.x + 0.07), z1: r3(q.z + 0.07) })),
  ];

  const aisle = { x: r3(cx), z: r3(lastZ1 + 1.0), yaw: Math.PI };
  return {
    cx, hall, foyer, rows, rise, top, steps, platforms, sections, aisles, seats, seatBlocks,
    colliders: [...colliders, ...colliderExtra],
    stations, posters, posts, aisle,
    bounds: { x0: hall.x0, z0: hall.z0, x1: hall.x1, z1: hall.z1 },
    screen: { x: cx, z: p.screen.z, yaw: Math.PI, opts: { ...SCREEN_OPTS }, top: SCREEN_OPTS.bottom + SCREEN_OPTS.maxH + SCREEN_OPTS.padH / 2 },
    curtain: { x: cx, z: r3(p.screen.z - 1.1), halfW: 6.4, y0: 0.2, y1: 7.15 },
  };
}

function rectOf(s) { return { x0: s.x0, z0: s.z0, x1: s.x1, z1: s.z1 }; }

/** Stationsanker allein (für Personal-Pakete, die den Plan nicht brauchen). */
export function stationsOf(p) { return buildPlan(p).stations; }

/** Liegt (x, z) im Rechteck b = { x0, z0, x1, z1 }? */
export function inRect(b, x, z) { return !!b && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1; }

/** Plakatplätze außen (von Paket A: layout.city.palast.posterSlots) → normalisierte Liste; fehlend/ungültig = []. */
export function outerPosterSlots(p) {
  const l = p && Array.isArray(p.posterSlots) ? p.posterSlots : [];
  return l.filter((s) => s && Number.isFinite(s.x) && Number.isFinite(s.z)).map((s) => ({
    x: s.x, y: Number.isFinite(s.y) ? s.y : 1.9, z: s.z, w: Number.isFinite(s.w) ? s.w : 0.9, h: Number.isFinite(s.h) ? s.h : 1.35, yaw: Number.isFinite(s.yaw) ? s.yaw : Math.PI,
  }));
}

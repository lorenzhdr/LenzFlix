// VIDEOTHEK LENZ · LENZ PALAST: Foyer (three). Kasse, Popcornecke, Kartenabreißer-Pult, Kordelständer, Teppich, Anzeigetafel,
// Schilder, Plakate (Cover-Atlas, ein Material). Figuren kommen von Paket E (Stationsanker in plan.stations).
import {
  Group, Mesh, MeshBasicMaterial, CanvasTexture, SRGBColorSpace, AdditiveBlending, DoubleSide, LinearFilter,
} from 'three';
import { box, quad, merge, disposeTree } from '../util/geo.js';
import { makeCanvas } from '../world/textures.js';
import { drawBoard, drawSigns, SIGN_CELLS } from './board.js';

const WOOD = [0.3, 0.15, 0.07];
const WOOD_D = [0.18, 0.09, 0.05];
const GOLD = [0.7, 0.45, 0.1];
const CARPET = [0.1, 0.008, 0.03];
const BOARD_W = 1024;
const BOARD_H = 328;

/**
 * Foyer bauen. plan = buildPlan(p). o = { atlas?: { texture, uv(i) } (Plakat-Atlas), posterCount }.
 * Rückgabe { root, setBoard({program, nowMin}), board: { x,y,z,w,h }, dispose() }.
 */
export function buildFoyer(plan, o = {}) {
  const root = new Group();
  root.name = 'palast-foyer';
  const st = plan.stations;
  const solids = [];
  const counter = (r, color = WOOD) => {
    const w = r.x1 - r.x0;
    const d = r.z1 - r.z0;
    const cx = (r.x0 + r.x1) / 2;
    const cz = (r.z0 + r.z1) / 2;
    solids.push(box({ w, h: r.h, d, x: cx, y: r.h / 2, z: cz, color }));
    solids.push(box({ w: w + 0.12, h: 0.06, d: d + 0.12, x: cx, y: r.h + 0.03, z: cz, color: [0.6, 0.5, 0.35] }));
  };
  counter(st.kasse);
  counter(st.popcorn, WOOD_D);
  counter(st.ticketDesk, WOOD_D);
  // Kassenglas, Klingel
  solids.push(box({ w: 0.12, h: 0.1, d: 0.12, x: st.kasse.x1 - 0.6, y: 1.16, z: (st.kasse.z0 + st.kasse.z1) / 2, color: GOLD }));
  // Teppich
  const cp = st.carpet;
  solids.push(box({ w: cp.x1 - cp.x0, h: 0.012, d: cp.z1 - cp.z0, x: (cp.x0 + cp.x1) / 2, y: 0.018, z: (cp.z0 + cp.z1) / 2, color: CARPET }));
  solids.push(box({ w: 0.12, h: 0.014, d: cp.z1 - cp.z0, x: cp.x0 + 0.1, y: 0.02, z: (cp.z0 + cp.z1) / 2, color: GOLD }));
  solids.push(box({ w: 0.12, h: 0.014, d: cp.z1 - cp.z0, x: cp.x1 - 0.1, y: 0.02, z: (cp.z0 + cp.z1) / 2, color: GOLD }));
  // Kordelständer: Pfosten + Seil zwischen aufeinanderfolgenden Pfosten je Seite
  const ps = plan.posts;
  for (const q of ps) {
    solids.push(box({ w: 0.14, h: 0.04, d: 0.14, x: q.x, y: 0.02, z: q.z, color: GOLD }));
    solids.push(box({ w: 0.04, h: 0.9, d: 0.04, x: q.x, y: 0.47, z: q.z, color: GOLD }));
    solids.push(box({ w: 0.09, h: 0.09, d: 0.09, x: q.x, y: 0.95, z: q.z, color: GOLD }));
  }
  for (let i = 0; i + 1 < ps.length; i++) {
    const a = ps[i];
    const b = ps[i + 1];
    if (Math.abs(a.x - b.x) > 0.01) continue;
    solids.push(box({ w: 0.04, h: 0.04, d: Math.abs(b.z - a.z) - 0.1, x: a.x, y: 0.86, z: (a.z + b.z) / 2, color: [0.5, 0.03, 0.06] }));
  }
  // Popcornmaschine auf dem Tresen
  const pc = st.popcorn;
  const pcx = (pc.x0 + pc.x1) / 2;
  const pcz = (pc.z0 + pc.z1) / 2;
  solids.push(box({ w: 0.9, h: 0.14, d: 0.6, x: pcx, y: pc.h + 0.13, z: pcz, color: [0.5, 0.04, 0.06] }));
  solids.push(box({ w: 0.9, h: 0.12, d: 0.6, x: pcx, y: pc.h + 1.0, z: pcz, color: [0.5, 0.04, 0.06] }));
  for (const sx of [-0.43, 0.43]) for (const sz of [-0.28, 0.28]) solids.push(box({ w: 0.04, h: 0.8, d: 0.04, x: pcx + sx, y: pc.h + 0.6, z: pcz + sz, color: GOLD }));
  const solidMesh = new Mesh(merge(solids), new MeshBasicMaterial({ vertexColors: true }));
  solidMesh.name = 'palast-foyer-solid';
  root.add(solidMesh);

  const glass = new Mesh(box({ w: 0.8, h: 0.78, d: 0.5, x: pcx, y: pc.h + 0.58, z: pcz, color: [1, 0.9, 0.55] }), new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false }));
  glass.name = 'palast-foyer-glass';
  root.add(glass);

  // Schilder (Atlas)
  const signCanvas = makeCanvas(1024, 256);
  drawSigns(signCanvas.getContext('2d'));
  const signTex = new CanvasTexture(signCanvas);
  signTex.colorSpace = SRGBColorSpace;
  signTex.generateMipmaps = false;
  signTex.minFilter = LinearFilter;
  const signMat = new MeshBasicMaterial({ map: signTex, toneMapped: false, side: DoubleSide });
  const f = plan.foyer;
  const fz1 = f.z1;
  const sq = (i, o2) => quad({ w: 2.0, h: 0.5, uv: SIGN_CELLS[i].uv, ...o2 });
  const signGeos = [
    sq(0, { x: (st.kasse.x0 + st.kasse.x1) / 2, y: 2.35, z: st.kasse.z0 - 0.02, ry: Math.PI }),
    sq(1, { x: plan.aisles[1], y: 2.85, z: fz1 - 0.03, ry: Math.PI }),
    sq(1, { x: plan.aisles[0], y: 2.85, z: fz1 - 0.03, ry: Math.PI }),
    sq(2, { x: pcx, y: 2.35, z: st.popcorn.z0 - 0.02, ry: Math.PI }),
    sq(3, { x: plan.cx, y: 3.45, z: f.z0 + 0.12, ry: Math.PI }),
  ];
  const signMesh = new Mesh(merge(signGeos), signMat);
  signMesh.name = 'palast-foyer-signs';
  root.add(signMesh);

  // Anzeigetafel
  const b = st.board;
  const boardCanvas = makeCanvas(BOARD_W, BOARD_H);
  const boardTex = new CanvasTexture(boardCanvas);
  boardTex.colorSpace = SRGBColorSpace;
  boardTex.generateMipmaps = false;
  boardTex.minFilter = LinearFilter;
  const boardMesh = new Mesh(quad({ w: b.w, h: b.h }), new MeshBasicMaterial({ map: boardTex, toneMapped: false }));
  boardMesh.position.set(b.x, b.y, b.z);
  boardMesh.rotation.y = Math.PI; // Blick nach -z (zum Eingang)
  boardMesh.name = 'palast-foyer-board';
  root.add(boardMesh);
  const frame = new Mesh(box({ w: b.w + 0.2, h: b.h + 0.2, d: 0.05, color: [0.08, 0.08, 0.12] }), new MeshBasicMaterial({ vertexColors: true }));
  frame.position.set(b.x, b.y, b.z + 0.03);
  root.add(frame);
  let lastKey = '';
  function setBoard(state) {
    const key = JSON.stringify([state.nowMin, state.program && state.program.dayKey, ((state.program && state.program.shows) || []).map((s) => s.itemId)]);
    if (key === lastKey) return false;
    lastKey = key;
    drawBoard(boardCanvas.getContext('2d'), BOARD_W, BOARD_H, state);
    boardTex.needsUpdate = true;
    return true;
  }
  setBoard({ program: null, nowMin: NaN });

  // Plakate innen (Atlas aus Paket-Hülle: Cover der Programmfilme)
  const slots = [];
  if (o.atlas && o.posterCount > 0) {
    const geos = plan.posters.map((q, i) => {
      const k = i % o.posterCount;
      slots.push({ index: k, x: q.x, y: q.y, z: q.z, w: q.w, h: q.h, yaw: q.yaw });
      return quad({ w: q.w, h: q.h, uv: o.atlas.uv(k), x: q.x, y: q.y, z: q.z, ry: q.yaw });
    });
    const frames = plan.posters.map((q) => box({ w: 0.02, h: q.h + 0.16, d: q.w + 0.16, x: q.x + (q.yaw > 0 ? -0.015 : 0.015), y: q.y, z: q.z, color: GOLD }));
    const posterMesh = new Mesh(merge(geos), new MeshBasicMaterial({ map: o.atlas.texture, toneMapped: false, side: DoubleSide }));
    posterMesh.name = 'palast-foyer-posters';
    root.add(posterMesh);
    const fm = new Mesh(merge(frames), new MeshBasicMaterial({ vertexColors: true }));
    fm.position.x = 0;
    root.add(fm);
  }

  // Glanz: Popcorn-Schein, Tafel-Streulicht, Teppichlichter
  const glowMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, opacity: 0.8 });
  const glow = new Mesh(merge([
    quad({ w: 1.6, h: 1.6, x: pcx, y: pc.h + 0.55, z: pcz - 0.35, color: [0.5, 0.3, 0.08] }),
  ]), glowMat);
  glow.name = 'palast-foyer-glow';
  glow.renderOrder = 6;
  root.add(glow);

  return {
    root, setBoard, board: { ...b }, posterSlots: slots,
    dispose() { signTex.dispose(); boardTex.dispose(); disposeTree(root); root.removeFromParent(); },
  };
}

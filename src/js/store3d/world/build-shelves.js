// VIDEOTHEK LENZ · Regale: alle Rahmen in EINEM Mesh (Holz, Rückwand, Leisten), Hüllen je Regalseite ("Face") als
// zusammengeführte Geometrie mit eigenem Atlas-Material. Ein Face = ein Draw-Call (max. 35 Hüllen normal 7 × 5, 24 groß 6 × 4).
import {
  Group, Mesh, MeshLambertMaterial, BoxGeometry, Float32BufferAttribute, Color, Vector3, Quaternion, Euler,
} from 'three';
import { box, merge, hex, hash, disposeTree } from '../util/geo.js';
import { levelY, shelfSpec, H_TALL, H_LOW } from './layout.js';
import { cellUV, slotCell, swatchUV, swatchFor } from '../covers/atlasmap.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Hüllenmaße der Normal-Spezifikation (Neigung/Dicken gelten für alle); Größen je Layout: `layout.spec.cover`. */
export const COVER = shelfSpec(false).cover;

const STYLE_TINT = {
  wood: [0.8, 0.62, 0.45],
  wall: [0.8, 0.62, 0.45],
  adult: [0.22, 0.2, 0.25],
  new: [0.95, 0.3, 0.3],
};
const KIDS_COLORS = ['#e63946', '#ffd23f', '#3ddc97', '#2a9df4'];

function frameGeometry(run, spec) {
  const L = run.segs * 1.2;
  const depth = run.depth;
  const h = run.h;
  const rows = run.rows || (run.low ? spec.rowsLow : spec.rowsTall);
  const parts = [];
  const segTint = (j) => (run.style === 'kids' ? hex(KIDS_COLORS[j % KIDS_COLORS.length]) : STYLE_TINT[run.style] || STYLE_TINT.wood);
  const dark = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
  const base = run.style === 'kids' ? [1, 1, 1] : segTint(0);
  const T = 0.9; // UV-Kachel in Metern

  // Rückwand, Sockel, Deckel
  const backZ = run.double ? 0 : -depth / 2 + 0.015;
  parts.push(box({ w: L, h: h - 0.14, d: 0.03, x: 0, y: 0.1 + (h - 0.14) / 2, z: backZ, color: dark(base, 0.62), tile: T }));
  parts.push(box({ w: L, h: 0.1, d: depth, x: 0, y: 0.05, z: 0, color: dark(base, 0.5), tile: T }));
  parts.push(box({ w: L + 0.02, h: 0.04, d: depth + 0.03, x: 0, y: h - 0.02, z: 0, color: dark(base, 0.85), tile: T, shade: [1, 1, 1.1, 0.6, 1, 1] }));
  // Pfosten an den Segmentgrenzen
  for (let j = 0; j <= run.segs; j++) {
    const x = (j - run.segs / 2) * 1.2;
    const tint = run.style === 'kids' ? segTint(Math.min(j, run.segs - 1)) : base;
    parts.push(box({ w: 0.04, h: h - 0.1, d: depth, x, y: 0.1 + (h - 0.1) / 2, z: 0, color: tint, tile: T }));
  }
  // Fachböden + farbige Abteilungsleisten je Segment und Seite
  const sides = run.double ? [1, -1] : [1];
  for (const s of sides) {
    const zFront = (s * depth) / 2;
    const zBack = run.double ? s * 0.015 : -depth / 2 + 0.03;
    const zc = (zFront + zBack) / 2;
    const bd = Math.abs(zFront - zBack);
    for (let lv = 0; lv < rows; lv++) {
      const top = levelY(spec, lv, run.low);
      for (let j = 0; j < run.segs; j++) {
        const x = run.segments[j].lx;
        const seg = run.segments[j];
        const tint = run.style === 'kids' ? segTint(j) : base;
        parts.push(box({ w: 1.16, h: 0.03, d: bd, x, y: top - 0.015, z: zc, color: tint, tile: T, shade: [1, 1, 1.05, 0.55, 1, 1] }));
        parts.push(box({ w: 1.16, h: 0.035, d: 0.02, x, y: top + 0.0175, z: zFront - s * 0.01, color: hex(seg.color), shade: [1, 1, 1.1, 0.8, 1.05, 0.9] }));
      }
    }
  }
  const g = merge(parts);
  // in Welt: Drehung um y, dann Verschiebung
  g.rotateY(run.yaw);
  g.translate(run.cx, 0, run.cz);
  return g;
}

function coverGeometry(item, idx, face, spec) {
  const rows = face.rows;
  const C = spec.cover;
  const media = (item && item.lfx && item.lfx.media) || 'dvd';
  const t = C.thick[media] || C.thick.dvd;
  const g = new BoxGeometry(media === 'box' ? C.boxW : C.w, media === 'box' ? C.boxH : C.h, t);
  const uv = g.attributes.uv;
  const { col, row } = slotCell(idx, spec);
  const [u0, v0, u1, v1] = cellUV(col, row, spec);
  const sw = swatchUV(swatchFor(media, hash(String((item && item.Id) || idx))));
  for (let i = 0; i < uv.count; i++) {
    if (i >= 16 && i < 20) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    else uv.setXY(i, sw[0], sw[1]);
  }
  const n = g.attributes.position.count;
  const cols = new Float32Array(n * 3).fill(1);
  g.setAttribute('color', new Float32BufferAttribute(cols, 3));
  const level = rows - 1 - row;
  const ch = media === 'box' ? C.boxH : C.h;
  const cw = media === 'box' ? C.boxW : C.w;
  g.translate(0, ch / 2, 0);
  g.rotateX(-C.tilt);
  g.translate((col - (spec.cols - 1) / 2) * C.pitch, levelY(spec, level, face.low) + 0.004, C.zBottom);
  return { g, media, t, ch, cw, level, col, row };
}

/** Face-Hilfen: Weltposition/-ausrichtung des Hüllen-Mittelpunkts. */
const _e = new Euler();
export function slotWorld(fv, info, outPos = new Vector3(), outQuat = new Quaternion()) {
  const f = fv.face;
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  // Face-lokal -> Welt (Drehung um y)
  const lx = info.local.x;
  const lz = info.local.z;
  outPos.set(f.x + c * lx + s * lz, info.local.y, f.z - s * lx + c * lz);
  _e.set(-COVER.tilt, f.yaw, 0, 'YXZ');
  outQuat.setFromEuler(_e);
  return { pos: outPos, quat: outQuat };
}

export function buildShelves(layout, catalogItems, blankTex, woodTex) {
  const group = new Group();
  group.name = 'shelves';
  const spec = layout.spec || shelfSpec(false);
  const frames = layout.runs.map((r) => frameGeometry(r, spec));
  const frameMesh = new Mesh(
    mergeGeometries(frames, false),
    new MeshLambertMaterial({ map: woodTex, vertexColors: true }),
  );
  frames.forEach((g) => g.dispose());
  frameMesh.castShadow = true;
  frameMesh.receiveShadow = true;
  group.add(frameMesh);

  const faceViews = [];
  const mats = [];
  for (const face of layout.faces) {
    const infos = [];
    const geoms = [];
    face.slots.forEach((id, idx) => {
      if (id == null) return;
      const item = catalogItems.get(id);
      const cg = coverGeometry(item || { Id: id }, idx, face, spec);
      geoms.push(cg.g);
      infos.push({
        idx, itemId: id, media: cg.media, thick: cg.t, vert: (infos.length) * 24, hidden: false,
        local: { x: (cg.col - (spec.cols - 1) / 2) * spec.cover.pitch, y: levelY(spec, cg.level, face.low) + 0.004 + (cg.ch / 2) * Math.cos(spec.cover.tilt), z: spec.cover.zBottom - (cg.ch / 2) * Math.sin(spec.cover.tilt) },
        half: { x: spec.cover.w / 2 + 0.005, y: cg.ch / 2 + 0.005, z: Math.max(0.03, cg.t / 2 + 0.015) },
      });
    });
    const fv = { face, infos, mesh: null, material: null, geometry: null, backup: null, byIdx: new Map(infos.map((i) => [i.idx, i])) };
    if (geoms.length) {
      const geometry = mergeGeometries(geoms, false);
      geoms.forEach((g) => g.dispose());
      const base = new Color(face.color).multiplyScalar(0.22);
      const material = new MeshLambertMaterial({
        map: blankTex, color: base, vertexColors: true,
      });
      const mesh = new Mesh(geometry, material);
      mesh.position.set(face.x, 0, face.z);
      mesh.rotation.y = face.yaw;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.userData.faceIndex = face.index;
      group.add(mesh);
      fv.mesh = mesh;
      fv.material = material;
      fv.geometry = geometry;
      fv.backup = new Float32Array(geometry.attributes.position.array);
      fv.flatColor = base.clone();
      mats.push(material);
    }
    faceViews.push(fv);
  }

  /** Hülle im Regal ein-/ausblenden (Vertices zusammenklappen). */
  function setHidden(fv, info, hidden) {
    if (!fv.geometry || info.hidden === hidden) return;
    const a = fv.geometry.attributes.position;
    const from = info.vert * 3;
    for (let i = 0; i < 72; i++) a.array[from + i] = hidden ? 0 : fv.backup[from + i];
    a.needsUpdate = true;
    info.hidden = hidden;
  }

  return {
    group, frameMesh, faceViews, setHidden,
    dispose() {
      disposeTree(group);
    },
  };
}

export { H_TALL, H_LOW };

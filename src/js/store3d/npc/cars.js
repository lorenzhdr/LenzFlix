// VIDEOTHEK LENZ · Auto-Modelle (three): prozedurale Autos (Kleinwagen, Limousine, Transporter, Kombi), je 1 Mesh (Karosserie, Fenster, Räder
// per Vertexfarbe) + 1 Lichter-Mesh bei fahrenden Autos. Länge entlang z, Front bei −z (wie die Figuren). Geometrie wird je Stil/Farbe gecacht.
import { Group, Mesh, MeshLambertMaterial, MeshBasicMaterial } from 'three';
import { box, quad, merge } from '../util/geo.js';

export const CAR_COLORS = [[0.82, 0.18, 0.18], [0.2, 0.42, 0.78], [0.95, 0.78, 0.18], [0.22, 0.6, 0.38], [0.92, 0.92, 0.9], [0.9, 0.45, 0.15], [0.45, 0.25, 0.6], [0.2, 0.22, 0.28]];
// len = Länge, bodyH = Höhe des Unterbaus, cabH/cabLen/cabZ = Kabine (Höhe, Länge, Versatz nach hinten)
const STYLES = [
  { name: 'hatch', len: 3.7, bodyH: 0.6, cabH: 0.56, cabLen: 2.1, cabZ: 0.35 },
  { name: 'sedan', len: 4.4, bodyH: 0.6, cabH: 0.5, cabLen: 2.1, cabZ: 0.1 },
  { name: 'van', len: 4.4, bodyH: 0.7, cabH: 0.95, cabLen: 3.4, cabZ: 0.4 },
  { name: 'wagon', len: 4.4, bodyH: 0.62, cabH: 0.55, cabLen: 3.0, cabZ: 0.5 },
];
export const STYLE_COUNT = STYLES.length;
const geos = new Map();
let mat = null;
let lightMat = null;

function bodyGeo(styleIdx, ci) {
  const key = `${styleIdx}:${ci}`;
  let g = geos.get(key);
  if (g) return g;
  const st = STYLES[styleIdx % STYLES.length];
  const c = CAR_COLORS[ci % CAR_COLORS.length];
  const glass = [0.16, 0.22, 0.3];
  const dk = [0.1, 0.1, 0.12];
  const w = 1.8;
  const parts = [
    box({ w, h: st.bodyH, d: st.len, x: 0, y: 0.25 + st.bodyH / 2, z: 0, color: c }),
    box({ w: w - 0.2, h: st.cabH, d: st.cabLen, x: 0, y: 0.25 + st.bodyH + st.cabH / 2, z: st.cabZ, color: c }),
    // Fensterband (leicht breiter als die Kabine)
    box({ w: w - 0.16, h: st.cabH * 0.55, d: st.cabLen - 0.5, x: 0, y: 0.25 + st.bodyH + st.cabH * 0.58, z: st.cabZ, color: glass }),
    box({ w: w - 0.5, h: st.cabH * 0.55, d: st.cabLen + 0.04, x: 0, y: 0.25 + st.bodyH + st.cabH * 0.58, z: st.cabZ, color: glass }),
    box({ w: w + 0.02, h: 0.16, d: 0.14, x: 0, y: 0.42, z: -st.len / 2, color: dk }),
    box({ w: w + 0.02, h: 0.16, d: 0.14, x: 0, y: 0.42, z: st.len / 2, color: dk }),
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) parts.push(box({ w: 0.22, h: 0.56, d: 0.56, x: sx * (w / 2 - 0.02), y: 0.28, z: sz * (st.len / 2 - 0.85), color: dk }));
  }
  g = merge(parts);
  geos.set(key, g);
  return g;
}

function lightsGeo(styleIdx) {
  const key = `L${styleIdx}`;
  let g = geos.get(key);
  if (g) return g;
  const st = STYLES[styleIdx % STYLES.length];
  const y = 0.62;
  const head = [1, 0.95, 0.7];
  const tail = [0.9, 0.08, 0.06];
  const list = [];
  for (const sx of [-1, 1]) {
    list.push(quad({ w: 0.34, h: 0.15, x: sx * 0.62, y, z: -st.len / 2 - 0.012, ry: Math.PI, color: head }));
    list.push(quad({ w: 0.3, h: 0.14, x: sx * 0.64, y, z: st.len / 2 + 0.012, color: tail }));
  }
  g = merge(list);
  geos.set(key, g);
  return g;
}

/** Auto-Mesh-Gruppe. moving = true fügt das Lichter-Mesh hinzu. Rückgabe { root, setLights(on), style, len }. */
export function createCarMesh(styleIdx, colorIdx, moving) {
  if (!mat) mat = new MeshLambertMaterial({ vertexColors: true });
  const root = new Group();
  root.name = 'npc-car';
  const body = new Mesh(bodyGeo(styleIdx, colorIdx), mat);
  root.add(body);
  let lights = null;
  if (moving) {
    if (!lightMat) lightMat = new MeshBasicMaterial({ vertexColors: true, color: 0x888888 });
    lights = new Mesh(lightsGeo(styleIdx), lightMat);
    root.add(lights);
  }
  const st = STYLES[styleIdx % STYLES.length];
  return { root, body, lights, len: st.len, style: st.name };
}

/** Scheinwerfer/Rücklichter hell (Nacht/Regen) oder gedämpft (Tag); gilt für alle Autos gemeinsam. */
export function setCarLightsOn(on) { if (lightMat) lightMat.color.setScalar(on ? 1 : 0.55); }

export function disposeCarCaches() {
  for (const g of geos.values()) g.dispose();
  geos.clear();
  if (mat) { mat.dispose(); mat = null; }
  if (lightMat) { lightMat.dispose(); lightMat = null; }
}

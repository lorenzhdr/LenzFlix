// VIDEOTHEK LENZ · Entdeckungen: Meshes der Fundstücke (Lüftungsbox + Goldene Kassette, Graffiti, lose Wandplatte). Alles prozedural.
// Importiert nur three + eigene Dateien. Texturen/Materialien/Geometrien trägt der Aufrufer per ctx.track (dispose automatisch).
import {
  Group, Mesh, MeshLambertMaterial, MeshBasicMaterial, PlaneGeometry, CanvasTexture, SRGBColorSpace, SpriteMaterial, Sprite, AdditiveBlending
} from 'three';
import { box, merge } from '../util/geo.js';
import { makeCanvas, FONT } from '../world/textures.js';

function canvasTex(w, h, draw) {
  const c = makeCanvas(w, h);
  draw(c.getContext('2d'), w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Lüftungsbox auf dem Dach. rect {x0,z0,x1,z1}, y0 Dachhöhe, h Höhe. → Mesh (Vertexfarben, Lambert). */
export function buildVent(rect, y0, h) {
  const w = rect.x1 - rect.x0;
  const d = rect.z1 - rect.z0;
  const cx = (rect.x0 + rect.x1) / 2;
  const cz = (rect.z0 + rect.z1) / 2;
  const parts = [box({ w, h, d, x: cx, y: y0 + h / 2, z: cz, color: [0.46, 0.5, 0.55] })];
  parts.push(box({ w: w + 0.1, h: 0.06, d: d + 0.1, x: cx, y: y0 + h + 0.03, z: cz, color: [0.34, 0.37, 0.42] }));
  for (let i = 0; i < 5; i++) parts.push(box({ w: w * 0.7, h: 0.035, d: 0.03, x: cx, y: y0 + 0.3 + i * 0.14, z: rect.z1 + 0.012, color: [0.18, 0.2, 0.23] }));
  parts.push(box({ w: 0.25, h: 0.2, d: 0.2, x: cx + w * 0.3, y: y0 + h + 0.16, z: cz, color: [0.3, 0.33, 0.37] }));
  return new Mesh(merge(parts), new MeshLambertMaterial({ vertexColors: true }));
}

/** Goldene Kassette (Gruppe, Ursprung = Mitte) samt Funkeln. update(t) dreht sie. */
export function buildGoldenTape() {
  const g = new Group();
  const body = new Mesh(merge([box({ w: 0.3, h: 0.19, d: 0.045, color: [1, 1, 1] })]), new MeshLambertMaterial({ color: 0xffc83a, emissive: 0x6a4300, vertexColors: true }));
  const label = new Mesh(merge([box({ w: 0.2, h: 0.08, d: 0.012, z: 0.026, color: [1, 1, 1] })]), new MeshBasicMaterial({ color: 0xfff2c0, vertexColors: true }));
  const reels = new Mesh(merge([
    box({ w: 0.045, h: 0.045, d: 0.012, x: -0.065, y: -0.04, z: 0.028, color: [1, 1, 1] }),
    box({ w: 0.045, h: 0.045, d: 0.012, x: 0.065, y: -0.04, z: 0.028, color: [1, 1, 1] }),
  ]), new MeshBasicMaterial({ color: 0x3a2a08, vertexColors: true }));
  g.add(body, label, reels);
  const glowTex = canvasTex(64, 64, (c, w, h) => {
    const gr = c.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,225,120,0.55)');
    gr.addColorStop(1, 'rgba(255,200,60,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, w, h);
  });
  const glow = new Sprite(new SpriteMaterial({ map: glowTex, blending: AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
  glow.scale.set(0.55, 0.55, 1);
  g.add(glow);
  g.userData.dispose = [glowTex, glow.material, body.geometry, label.geometry, reels.geometry, body.material, label.material, reels.material];
  g.userData.glow = glow;
  return g;
}

/** Graffiti-Fläche: „LENZ“-Tag mit Kassetten-Motiv. center {x,y,z}, Maße w/h, zeigt nach -z (Hofseite der Ladenwand). */
export function buildGraffiti(center, w, h, yaw = Math.PI) {
  const tex = canvasTex(1024, 512, (c, cw, ch) => {
    c.clearRect(0, 0, cw, ch);
    c.lineJoin = 'round';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    // Farbwolke
    const cloud = c.createRadialGradient(cw * 0.42, ch * 0.5, 20, cw * 0.42, ch * 0.5, cw * 0.46);
    cloud.addColorStop(0, 'rgba(255,60,140,0.22)');
    cloud.addColorStop(1, 'rgba(255,60,140,0)');
    c.fillStyle = cloud;
    c.fillRect(0, 0, cw, ch);
    // Tag
    c.font = `900 250px ${FONT}`;
    c.lineWidth = 26;
    c.strokeStyle = '#18102e';
    c.strokeText('LENZ', cw * 0.4, ch * 0.5);
    c.fillStyle = '#35e6ff';
    c.fillText('LENZ', cw * 0.4, ch * 0.5);
    c.lineWidth = 7;
    c.strokeStyle = '#ff3b8d';
    c.strokeText('LENZ', cw * 0.4 - 6, ch * 0.5 - 6);
    // Farbnasen
    c.fillStyle = '#35e6ff';
    for (const [x, len] of [[cw * 0.13, 80], [cw * 0.29, 130], [cw * 0.52, 60], [cw * 0.64, 100]]) {
      c.fillRect(x, ch * 0.66, 9, len);
      c.beginPath();
      c.arc(x + 4.5, ch * 0.66 + len, 9, 0, Math.PI * 2);
      c.fill();
    }
    // Kassette mit Augen
    c.save();
    c.translate(cw * 0.86, ch * 0.52);
    c.rotate(-0.12);
    c.fillStyle = '#18102e';
    c.fillRect(-100, -66, 200, 132);
    c.fillStyle = '#ffd23f';
    c.fillRect(-90, -56, 180, 112);
    c.fillStyle = '#fff6d6';
    c.fillRect(-64, -40, 128, 46);
    for (const sx of [-34, 34]) {
      c.fillStyle = '#18102e';
      c.beginPath();
      c.arc(sx, 40, 20, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(sx, 40, 11, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#18102e';
      c.beginPath();
      c.arc(sx + 3, 42, 5, 0, Math.PI * 2);
      c.fill();
    }
    c.font = `bold 30px ${FONT}`;
    c.fillStyle = '#c4182b';
    c.fillText('C-60', 0, -17);
    c.restore();
    // Sterne
    c.fillStyle = '#ffd23f';
    for (const [x, y, s] of [[cw * 0.08, ch * 0.2, 16], [cw * 0.7, ch * 0.14, 12], [cw * 0.95, ch * 0.16, 14]]) {
      c.fillRect(x - s / 2, y - 2, s, 4);
      c.fillRect(x - 2, y - s / 2, 4, s);
    }
    c.font = `bold 34px ${FONT}`;
    c.fillStyle = '#ffffff';
    c.fillText('be kind, rewind', cw * 0.42, ch * 0.9);
  });
  const mat = new MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const geo = new PlaneGeometry(w, h);
  const m = new Mesh(geo, mat);
  m.position.set(center.x, center.y, center.z);
  m.rotation.y = yaw; // Standard PI: Plane blickt +z → -z (Hofseite); 0 = nach +z
  m.renderOrder = 2;
  m.userData.dispose = [tex, mat, geo];
  return m;
}

/** Lose Wandplatte an der Nordwand (Innenseite, z = 0). Gruppe: plate (fällt ab), recess (Nische mit Kassetten). */
export function buildPanel(x, y) {
  const g = new Group();
  g.position.set(x, y, 0);
  const plateGeo = merge([
    box({ w: 0.9, h: 0.7, d: 0.03, color: [0.5, 0.42, 0.34] }),
    ...[[-0.4, 0.3], [0.4, 0.3], [-0.4, -0.3], [0.4, -0.3]].map(([sx, sy]) => box({ w: 0.04, h: 0.04, d: 0.02, x: sx, y: sy, z: 0.02, color: [0.2, 0.2, 0.22] })),
    box({ w: 0.16, h: 0.05, d: 0.02, x: 0, y: 0.18, z: 0.025, color: [0.72, 0.64, 0.5] }),
  ]);
  const plateMat = new MeshLambertMaterial({ vertexColors: true });
  const plate = new Mesh(plateGeo, plateMat);
  plate.position.set(0, 0, 0.02);
  plate.rotation.z = 0.045; // schief = auffällig
  const pivot = new Group(); // Drehpunkt unten
  pivot.position.set(0, -0.35, 0.03);
  plate.position.set(0, 0.35, -0.01);
  pivot.add(plate);
  const recessGeo = merge([
    box({ w: 0.86, h: 0.66, d: 0.02, z: 0.012, color: [0.05, 0.04, 0.06] }),
    ...[[-0.28, 0.0, [0.8, 0.2, 0.25]], [-0.28, 0.1, [0.25, 0.5, 0.85]], [0.0, 0.05, [0.9, 0.7, 0.2]], [0.0, 0.15, [0.3, 0.75, 0.45]], [0.28, -0.02, [0.7, 0.3, 0.8]], [0.28, 0.08, [0.9, 0.5, 0.2]]]
      .map(([sx, sy, col], i) => box({ w: 0.2, h: 0.09, d: 0.1, x: sx, y: sy - 0.2, z: 0.05, ry: (i % 3 - 1) * 0.12, color: col })),
  ]);
  const recessMat = new MeshLambertMaterial({ vertexColors: true });
  const recess = new Mesh(recessGeo, recessMat);
  recess.visible = false;
  g.add(recess, pivot);
  g.userData = { plate: pivot, recess, dispose: [plateGeo, plateMat, recessGeo, recessMat] };
  return g;
}

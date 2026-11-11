// VIDEOTHEK LENZ · M3: Schaufenster (Zonen 'window'/'window2', Eingangsfront, innen vor der Scheibe). Poster mit catalog.highlights (Backdrop,
// sonst Primary) leicht schwebend und pendelnd auf Podesten, Neonschild „TOP-TIPPS“. Interactable → Hülle über den Tresen.
// Draw-Calls: Podeste + Neonleisten + Schilder + je Poster 1 (höchstens 6); ein gemeinsamer Cover-Atlas.
import { Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, DoubleSide } from 'three';
import { box, quad, merge } from '../util/geo.js';
import { coverBoard, canvasTexture } from './m3-gfx.js';
import { backdropRef, spreadCenters, splitEven } from './m3-util.js';
import { FONT } from '../world/textures.js';
import { debugHook } from './m3-debug.js';

const PER_WINDOW = 3;
const PW = 1.25; // Leuchtkasten-Poster 16:9
const PH = 0.7;

function neonSign(g, w, hh) {
  g.fillStyle = '#0c1030';
  g.fillRect(0, 0, w, hh);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.round(hh * 0.62)}px ${FONT}`;
  g.lineJoin = 'round';
  for (const [blur, col, lw] of [[28, '#ff3d7f', 10], [14, '#ff7aa8', 6], [0, '#fff3f8', 2]]) {
    g.shadowColor = '#ff3d7f';
    g.shadowBlur = blur;
    g.strokeStyle = col;
    g.lineWidth = lw;
    g.strokeText('TOP-TIPPS', w / 2, hh / 2 + 4);
  }
  g.shadowBlur = 0;
  g.fillStyle = '#ffe3ee';
  g.fillText('TOP-TIPPS', w / 2, hh / 2 + 4);
  g.strokeStyle = '#35e6ff';
  g.lineWidth = 5;
  g.shadowColor = '#35e6ff';
  g.shadowBlur = 16;
  g.strokeRect(10, 10, w - 20, hh - 20);
}

export default {
  name: 'showcase',
  init(ctx) {
    const L = ctx.layout;
    const D = L.d;
    const wins = ['window', 'window2'].map((id) => L.zones[id]).filter((zz) => zz && zz.rect && zz.rect.x1 - zz.rect.x0 >= 1.4);
    const list = ((ctx.catalog && ctx.catalog.highlights) || []).filter((it) => it && it.Id);
    if (!wins.length || !list.length) return null;
    const minW = Math.min(...wins.map((zz) => zz.rect.x1 - zz.rect.x0));
    const groups = splitEven(list, wins.length, Math.max(1, Math.min(PER_WINDOW, Math.floor((minW - 0.2) / 1.45))));
    const flat = groups.flat();
    const group = new Group();
    group.name = 'm3-showcase';
    const removers = [];
    const rects = [];

    const entries = flat.map((it) => {
      const ref = backdropRef(it);
      return {
        url: ctx.deps.imageUrl(ref.id, { type: ref.type, maxWidth: 400, tag: ref.tag }), title: it.Name, caption: it.Name,
        fit: ref.type === 'Backdrop' ? 'cover' : 'contain', border: '#fff',
      };
    });
    const board = coverBoard(ctx, entries, { cols: 3, cw: 320, ch: 180, maxWidth: 400 });
    const posterMat = ctx.track(new MeshBasicMaterial({ map: board.texture, side: DoubleSide, toneMapped: false }));

    const podia = [];
    const neon = [];
    const signs = [];
    const signTex = canvasTexture(ctx, 512, 128, neonSign);
    const posters = [];
    const pz = D - 0.42;
    let idx = 0;
    wins.forEach((zz, wi) => {
      const g = groups[wi] || [];
      if (!g.length) return;
      const r = zz.rect;
      const xs = spreadCenters(g.length, r.x0 + 0.1, r.x1 - 0.1);
      signs.push(quad({ w: 1.8, h: 0.45, x: (r.x0 + r.x1) / 2, y: 2.72, z: D - 0.03, ry: Math.PI }));
      g.forEach((it, k) => {
        const x = xs[k];
        podia.push(box({ w: 0.84, h: 0.3, d: 0.5, x, y: 0.15, z: pz, color: [0.16, 0.19, 0.42] }));
        podia.push(box({ w: 0.9, h: 0.03, d: 0.56, x, y: 0.315, z: pz, color: [0.9, 0.85, 0.7] }));
        podia.push(box({ w: 0.05, h: 0.8, d: 0.05, x, y: 0.72, z: pz + 0.1, color: [0.6, 0.62, 0.7] }));
        neon.push(box({ w: 0.84, h: 0.025, d: 0.02, x, y: 0.26, z: pz - 0.255, color: [1, 0.24, 0.5] }));
        const baseY = 1.55; // Leuchtkasten auf Augenhöhe im Fenster
        // Leuchtkasten: dunkler Rahmen dahinter + Neon-Umrandung
        podia.push(box({ w: PW + 0.14, h: PH + 0.14, d: 0.06, x, y: baseY, z: pz + 0.12, color: [0.08, 0.09, 0.14] }));
        for (const [bw, bh, bx, by] of [[PW + 0.14, 0.025, 0, (PH + 0.14) / 2], [PW + 0.14, 0.025, 0, -(PH + 0.14) / 2], [0.025, PH + 0.14, (PW + 0.14) / 2, 0], [0.025, PH + 0.14, -(PW + 0.14) / 2, 0]]) {
          neon.push(box({ w: bw, h: bh, d: 0.02, x: x + bx, y: baseY + by, z: pz + 0.085, color: [0.2, 0.9, 1] }));
        }
        const m = new Mesh(quad({ w: PW, h: PH, uv: board.uv(idx) }), posterMat);
        m.position.set(x, baseY, pz);
        m.rotation.y = Math.PI;
        group.add(m);
        // Außenseite des Leuchtkastens (von der Straße/im Intro sichtbar): dasselbe Motiv, statisch auf der Rahmen-Rückseite.
        const outer = new Mesh(quad({ w: PW, h: PH, uv: board.uv(idx) }), posterMat);
        outer.position.set(x, baseY, pz + 0.155);
        group.add(outer);
        posters.push({ m, baseY, phase: idx * 1.7 });
        rects.push(ctx.addCollider({ x0: x - 0.62, z0: pz - 0.28, x1: x + 0.62, z1: pz + 0.28, kind: 'prop' }));
        removers.push(ctx.addInteractable({
          box: { min: { x: x - 0.65, y: 0.3, z: pz - 0.3 }, max: { x: x + 0.65, y: 1.95, z: pz + 0.3 } },
          label: it.Name,
          hint: 'Top-Tipp · E / Klick: Hülle holen',
          onUse: () => ctx.items.take(it.Id, { from: 'counter' }),
        }));
        idx++;
      });
    });
    if (podia.length) {
      group.add(new Mesh(merge(podia), new MeshLambertMaterial({ vertexColors: true })));
      group.add(new Mesh(merge(neon), new MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
    }
    if (signs.length) group.add(new Mesh(merge(signs), new MeshBasicMaterial({ map: signTex, toneMapped: false })));
    ctx.scene.add(group);
    ctx.track(group);

    const offDbg = debugHook(ctx, 'showcase', { posters: posters.map((p) => ({ x: p.m.position.x, z: p.m.position.z, id: flat[posters.indexOf(p)].Id })) });
    return {
      update(dt, t) {
        if (ctx.quality() === 'low') return;
        for (const p of posters) {
          p.m.rotation.y = Math.PI + Math.sin(t * 0.5 + p.phase) * 0.16;
          p.m.position.y = p.baseY + Math.sin(t * 1.2 + p.phase) * 0.012;
        }
      },
      onQuality(level) {
        if (level !== 'low') return;
        for (const p of posters) { p.m.rotation.y = Math.PI; p.m.position.y = p.baseY; }
      },
      dispose() {
        offDbg();
        removers.forEach((r) => r());
        rects.forEach((r) => ctx.removeCollider(r));
        group.removeFromParent();
      },
    };
  },
};

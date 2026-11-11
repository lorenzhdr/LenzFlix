// VIDEOTHEK LENZ · M3: Rückgabe-Wagen (Zone 'returns'). Weiterschauen-Titel liegen als schräg gelegte Hüllen mit Fortschrittsstreifen
// auf einem Rollwagen; Film → über den Tresen, Folge → kleine Karte „Weiterschauen“. 2 Draw-Calls (Gestell + Cover-Atlas) + Schild.
import { Group, Mesh, MeshBasicMaterial, MeshLambertMaterial } from 'three';
import { box, quad, merge, hex } from '../util/geo.js';
import { coverBoard, canvasTexture, h, button, openPanel, MONO } from './m3-gfx.js';
import { coverRef, progressOf, resumeLabel, isEpisode } from './m3-util.js';
import { FONT } from '../world/textures.js';
import { debugHook } from './m3-debug.js';

const PHI = 0.45; // Neigung der Ablage
const COLS = 4;
const MAX = 8;
const T = [0, Math.sin(PHI), Math.cos(PHI)]; // Richtung „nach hinten, bergauf“
const N = [0, Math.cos(PHI), -Math.sin(PHI)]; // Flächennormale (nach oben/Norden)

function signCanvas(g, w, hh) {
  g.fillStyle = '#c4182b';
  g.fillRect(0, 0, w, hh);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, 8);
  g.fillRect(0, hh - 8, w, 8);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.round(hh * 0.5)}px ${FONT}`;
  g.fillText('RÜCKGABE', w / 2, hh * 0.45);
  g.font = `bold ${Math.round(hh * 0.15)}px ${MONO}`;
  g.fillText('angefangene Titel · bitte weiterschauen', w / 2, hh * 0.82);
}

export default {
  name: 'returns',
  init(ctx) {
    const z = ctx.layout.zones.returns;
    if (!z) return null;
    const cx = z.x;
    const cz = z.z;
    const items = ((ctx.catalog && ctx.catalog.resume) || []).filter(Boolean).slice(0, MAX);
    const group = new Group();
    group.name = 'm3-returns';
    const removers = [];

    // --- Gestell ---
    const steel = [0.5, 0.55, 0.65];
    const dark = [0.12, 0.12, 0.16];
    const parts = [];
    parts.push(box({ w: 0.8, h: 0.04, d: 0.5, x: cx, y: 0.2, z: cz, color: steel }));
    for (const sx of [-0.38, 0.38]) {
      parts.push(box({ w: 0.03, h: 0.47, d: 0.03, x: cx + sx, y: 0.435, z: cz - 0.23, color: steel }));
      parts.push(box({ w: 0.03, h: 1.0, d: 0.03, x: cx + sx, y: 0.7, z: cz + 0.23, color: steel }));
      for (const sz of [-0.2, 0.2]) parts.push(box({ w: 0.07, h: 0.07, d: 0.07, x: cx + sx, y: 0.035, z: cz + sz, color: dark }));
    }
    parts.push(box({ w: 0.78, h: 0.03, d: 0.5, x: cx, y: 0.78, z: cz, rx: -PHI, color: hex('#2a4a9a') }));
    parts.push(box({ w: 0.78, h: 0.05, d: 0.03, x: cx, y: 0.78 - 0.25 * T[1] + 0.02, z: cz - 0.25 * T[2], rx: -PHI, color: hex('#ffd23f') }));
    parts.push(box({ w: 0.8, h: 0.24, d: 0.04, x: cx, y: 1.1, z: cz + 0.23, color: hex('#c4182b') }));
    group.add(new Mesh(merge(parts), new MeshLambertMaterial({ vertexColors: true })));
    group.add(new Mesh(
      quad({ w: 0.76, h: 0.2, x: cx, y: 1.1, z: cz + 0.23 - 0.0225, ry: Math.PI }),
      new MeshBasicMaterial({ map: canvasTexture(ctx, 512, 135, signCanvas) }),
    ));

    // --- Hüllen ---
    const pos = [];
    if (items.length) {
      const entries = items.map((it) => {
        const ref = coverRef(it);
        return {
          url: ctx.deps.imageUrl(ref.id, { maxWidth: 200, tag: ref.tag }), title: it.SeriesName || it.Name, progress: progressOf(it),
        };
      });
      const board = coverBoard(ctx, entries, { cols: COLS, cw: 128, ch: 192, maxWidth: 200 });
      const quads = [];
      items.forEach((it, i) => {
        const u = ((i % COLS) - (COLS - 1) / 2) * 0.19;
        const v = i < COLS ? 0.12 : -0.12;
        const p = { x: cx + u + N[0] * 0.02, y: 0.78 + v * T[1] + N[1] * 0.02, z: cz + v * T[2] + N[2] * 0.02 };
        pos.push(p);
        quads.push(quad({ w: 0.17, h: 0.23, x: p.x, y: p.y, z: p.z, rx: -(Math.PI / 2 - PHI), ry: Math.PI, uv: board.uv(i) }));
      });
      group.add(new Mesh(merge(quads), new MeshLambertMaterial({ map: board.texture })));
    }
    ctx.scene.add(group);
    ctx.track(group);

    const rect = ctx.addCollider({ x0: cx - 0.42, z0: cz - 0.3, x1: cx + 0.42, z1: cz + 0.3, kind: 'prop' });

    // --- Interaktion ---
    function episodeCard(it) {
      openPanel(ctx, {
        cls: 'lfx-store-ret', label: 'Weiterschauen',
        build(panel, close) {
          panel.append(h('div', 'lfx-store-ret-stamp', 'RÜCKGABE · Lieferschein'));
          panel.append(h('div', 'lfx-store-ret-title', resumeLabel(it)));
          const pr = progressOf(it);
          const bar = h('div', 'lfx-store-ret-bar');
          const fill = h('i');
          fill.style.width = `${Math.round(pr * 100)}%`;
          bar.appendChild(fill);
          panel.append(bar, h('div', 'lfx-store-ret-sub', pr > 0 ? `${Math.round(pr * 100)} % gesehen` : 'Noch nicht angefangen'));
          const row = h('div', 'lfx-store-ret-actions');
          row.append(button('Weiterschauen', 'lfx-store-act lfx-store-act--primary', () => { close(); ctx.deps.play(it, { resume: true }); }));
          if (it.SeriesId && ctx.catalog.items.get && ctx.catalog.items.get(it.SeriesId)) {
            row.append(button('Zur Serie', 'lfx-store-act', () => { close(); ctx.items.take(it.SeriesId, { from: 'counter' }); }));
          }
          row.append(button('Schließen', 'lfx-store-act', close));
          panel.append(row);
        },
      });
    }

    items.forEach((it, i) => {
      const p = pos[i];
      const ep = isEpisode(it);
      removers.push(ctx.addInteractable({
        box: { min: { x: p.x - 0.1, y: p.y - 0.12, z: p.z - 0.14 }, max: { x: p.x + 0.1, y: p.y + 0.12, z: p.z + 0.14 } },
        label: ep ? resumeLabel(it) : it.Name,
        hint: ep ? 'E / Klick: Weiterschauen' : 'E / Klick: Hülle nehmen',
        onUse: () => { if (ep) episodeCard(it); else ctx.items.take(it.Id, { from: 'counter' }); },
      }));
    });
    // Leerer Wagen: Gestell selbst ansprechbar (mit Hüllen würde die große Box die Hüllen-Boxen überdecken)
    if (!items.length) {
      removers.push(ctx.addInteractable({
        box: { min: { x: cx - 0.4, y: 0.15, z: cz - 0.27 }, max: { x: cx + 0.4, y: 1.22, z: cz + 0.27 } },
        label: 'Rückgabe-Wagen',
        hint: 'Gerade ist nichts angefangen',
        onUse: () => ctx.deps.toast('Hier liegt gerade nichts – fang einen Film an!'),
      }));
    }

    const offDbg = debugHook(ctx, 'returns', { pos: { x: cx, z: cz }, items: items.map((it) => it.Id), card: (i) => episodeCard(items[i]) });
    return {
      dispose() {
        offDbg();
        removers.forEach((r) => r());
        ctx.removeCollider(rect);
        group.removeFromParent();
      },
    };
  },
};

// VIDEOTHEK LENZ · M3: Reservierungsfach (Zone 'reserve', hinter dem Tresen an der Ostwand). Zettel „Reserviert für <Name>“, darin die
// Merkliste (catalog.favorites) als Hüllen. Der Spieler kann nicht hinter den Tresen: Interactable vom Kundenbereich aus → Karteikarten-Overlay.
// 3 Draw-Calls (Regal, Cover-Atlas, Zettel).
import { Group, Mesh, MeshBasicMaterial, MeshLambertMaterial } from 'three';
import { box, quad, merge, hex } from '../util/geo.js';
import { coverBoard, canvasTexture, h, button, openPanel, MONO } from './m3-gfx.js';
import { coverRef } from './m3-util.js';
import { FONT } from '../world/textures.js';
import { debugHook } from './m3-debug.js';

const COLS = 6;
const MAX = 18;
const HALF = 0.85;
const ROW_Y = [1.35, 0.9, 0.45]; // Fachböden, oberste Reihe zuerst

/** VR-Panel „Reservierungen“. act = { play(it), take(it), remove(it) }; leere Liste → Hinweistext. */
export function reserveSpec(favs, name, act, onClose) {
  const spec = { title: 'Reservierungen', lines: [`für ${name}`], anchor: 'front', width: 0.9 };
  if (onClose) spec.onClose = onClose;
  if (!favs.length) {
    spec.text = 'Hier liegt noch nichts für dich zurück. Markiere in der Hülle einen Titel mit „Merken“ – dann legen wir ihn dir hierher.';
    return spec;
  }
  spec.lines.push(`${favs.length} zurückgelegt`);
  spec.list = {
    visible: 5,
    rows: favs.map((it) => ({
      label: it.Name || 'Titel',
      sub: it.ProductionYear ? String(it.ProductionYear) : undefined,
      actions: [
        { label: 'Abspielen', primary: true, onSelect: () => act.play(it) },
        { label: 'Nehmen', onSelect: () => act.take(it) },
        { label: 'Entfernen', onSelect: () => act.remove(it) },
      ],
    })),
  };
  return spec;
}

export default {
  name: 'reserve',
  init(ctx) {
    const z = ctx.layout.zones.reserve;
    if (!z) return null;
    const W = ctx.layout.w;
    const zc = z.z;
    const name = (ctx.deps.user && ctx.deps.user.name) || 'dich';
    // Merkliste: Favoriten-Anfrage der Hülle UND alle Titel mit UserData.IsFavorite (robust, auch bei in der Sitzung gemerkten Titeln)
    const collectFavs = () => {
      const seen = new Map();
      for (const it of (ctx.catalog && ctx.catalog.favorites) || []) if (it && it.Id) seen.set(it.Id, it);
      const all = ctx.catalog && ctx.catalog.items;
      if (all && typeof all.values === 'function') for (const it of all.values()) if (it.UserData && it.UserData.IsFavorite) seen.set(it.Id, it);
      for (const [id, it] of [...seen]) if (it.UserData && it.UserData.IsFavorite === false) seen.delete(id);
      return [...seen.values()];
    };
    let favs = collectFavs();
    const shown = favs.slice(0, MAX);
    const group = new Group();
    group.name = 'm3-reserve';

    // --- Regal ---
    const wood = hex('#8a5a32');
    const woodDark = hex('#5e3b1f');
    const parts = [];
    parts.push(box({ w: 0.03, h: 1.95, d: HALF * 2, x: W - 0.02, y: 0.975, z: zc, color: woodDark }));
    for (const s of [-1, 1]) parts.push(box({ w: 0.3, h: 1.95, d: 0.035, x: W - 0.15, y: 0.975, z: zc + s * HALF, color: wood }));
    for (const y of [0.3, ...ROW_Y, 1.8]) parts.push(box({ w: 0.3, h: 0.03, d: HALF * 2, x: W - 0.15, y, z: zc, color: wood }));
    group.add(new Mesh(merge(parts), new MeshLambertMaterial({ vertexColors: true })));

    // --- Hüllen ---
    const pos = [];
    if (shown.length) {
      const entries = shown.map((it) => {
        const ref = coverRef(it);
        return { url: ctx.deps.imageUrl(ref.id, { maxWidth: 200, tag: ref.tag }), title: it.Name };
      });
      const board = coverBoard(ctx, entries, { cols: COLS, cw: 128, ch: 192, maxWidth: 200 });
      const quads = [];
      shown.forEach((it, i) => {
        const c = i % COLS;
        const r = Math.floor(i / COLS);
        const p = { x: W - 0.1, y: ROW_Y[r] + 0.015 + 0.115, z: zc + (c - (COLS - 1) / 2) * 0.26 };
        pos.push(p);
        quads.push(quad({ w: 0.17, h: 0.23, x: p.x, y: p.y, z: p.z, ry: -Math.PI / 2, uv: board.uv(i) }));
      });
      group.add(new Mesh(merge(quads), new MeshLambertMaterial({ map: board.texture })));
    }

    // --- Zettel ---
    const note = new Mesh(
      quad({ w: 0.8, h: 0.3, x: W - 0.035, y: 2.2, z: zc, ry: -Math.PI / 2, rx: 0, rz: 0.03 }),
      new MeshBasicMaterial({
        map: canvasTexture(ctx, 512, 192, (g, w, hh) => {
          g.fillStyle = '#f6efd6';
          g.fillRect(0, 0, w, hh);
          g.fillStyle = '#d33a3a';
          g.fillRect(0, 0, w, 14);
          g.fillStyle = 'rgba(40,60,160,0.25)';
          for (let y = 70; y < hh; y += 28) g.fillRect(18, y, w - 36, 2);
          g.textAlign = 'center';
          g.fillStyle = '#c4182b';
          g.font = `bold 30px ${MONO}`;
          g.fillText('RESERVIERT FÜR', w / 2, 56);
          g.fillStyle = '#1c2a6b';
          let fs = 58;
          g.font = `bold ${fs}px ${FONT}`;
          while (g.measureText(name).width > w - 60 && fs > 22) { fs -= 4; g.font = `bold ${fs}px ${FONT}`; }
          g.fillText(name, w / 2, 134 + (58 - fs) / 4);
        }),
      }),
    );
    group.add(note);
    ctx.scene.add(group);
    ctx.track(group);
    const rect = ctx.addCollider({ x0: W - 0.32, z0: zc - HALF, x1: W, z1: zc + HALF, kind: 'prop' });

    // --- Overlay: Karteikarten ---
    function openList() {
      favs = collectFavs();
      if (ctx.xr.presenting()) { openVrList(); return; }
      openPanel(ctx, {
        cls: 'lfx-store-res', label: 'Reservierungen',
        build(panel, close) {
          const head = h('div', 'lfx-store-res-head');
          head.append(h('div', 'lfx-store-res-stamp', 'RESERVIERT'), h('div', 'lfx-store-res-title', `für ${name}`));
          head.append(button('Schließen', 'lfx-store-act lfx-store-res-close', close));
          panel.append(head);
          if (!favs.length) {
            panel.append(h('div', 'lfx-store-res-empty', 'Hier liegt noch nichts für dich zurück.'));
            panel.append(h('div', 'lfx-store-res-sub', 'Markiere in der Hülle einen Titel mit „Merken“ – dann legen wir ihn dir hierher.'));
            return;
          }
          panel.append(h('div', 'lfx-store-res-sub', `${favs.length} zurückgelegt · antippen, um die Hülle über den Tresen zu bekommen`));
          const grid = h('div', 'lfx-store-res-grid');
          for (const it of favs) {
            const ref = coverRef(it);
            const card = h('button', 'lfx-store-res-card');
            card.type = 'button';
            const img = h('img');
            img.alt = '';
            img.loading = 'lazy';
            img.decoding = 'async';
            img.draggable = false;
            img.src = ctx.deps.imageUrl(ref.id, { maxWidth: 240, tag: ref.tag });
            card.append(img, h('span', 'lfx-store-res-name', it.Name), h('span', 'lfx-store-res-year', it.ProductionYear ? String(it.ProductionYear) : ''));
            card.addEventListener('click', (e) => { e.stopPropagation(); close(); ctx.items.take(it.Id, { from: 'counter' }); });
            grid.append(card);
          }
          panel.append(grid);
        },
      });
    }

    function openVrList() {
      let handle = null;
      const render = (close) => reserveSpec(favs, name, {
        play: (it) => { close(); ctx.deps.play(it, { resume: false }); },
        take: (it) => { close(); ctx.items.take(it.Id, { from: 'counter' }); },
        remove: (it) => {
          if (it.UserData) it.UserData.IsFavorite = false;
          favs = favs.filter((f) => f.Id !== it.Id);
          if (ctx.catalog && Array.isArray(ctx.catalog.favorites)) ctx.catalog.favorites = ctx.catalog.favorites.filter((f) => f.Id !== it.Id);
          if (typeof ctx.deps.setFavorite === 'function') { try { Promise.resolve(ctx.deps.setFavorite(it.Id, false)).catch(() => {}); } catch { /* egal */ } }
          if (handle && handle.vr && handle.vr.open) handle.vr.update(render(handle.close));
        },
      });
      handle = openPanel(ctx, { vr: (close) => render(close) });
    }

    const removeIa = ctx.addInteractable({
      box: { min: { x: W - 0.36, y: 0.3, z: zc - HALF }, max: { x: W, y: 2.4, z: zc + HALF } },
      label: 'Reservierungen ansehen',
      hint: favs.length ? `E / Klick: ${favs.length} zurückgelegt` : 'E / Klick: Merkliste ansehen',
      onUse: openList,
    });

    const offDbg = debugHook(ctx, 'reserve', { open: openList, pos: { x: W, z: zc }, count: favs.length });
    return {
      dispose() {
        offDbg();
        removeIa();
        ctx.removeCollider(rect);
        group.removeFromParent();
      },
    };
  },
};

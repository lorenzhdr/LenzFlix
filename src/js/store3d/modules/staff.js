// VIDEOTHEK LENZ · M3: Mitarbeiter-Tür (Zone 'staff', Nordwand). Rahmen, Warnlampe, Zahlenfeld, Zettel; Interactable „Personalraum“ →
// Pinnwand-Menü (Einstellungen, Design wechseln, Klassische Ansicht, Alle Bibliotheken, Abmelden mit Bestätigung). 4 Draw-Calls.
import { Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, AdditiveBlending } from 'three';
import { box, quad, merge } from '../util/geo.js';
import { canvasTexture, h, button, openPanel, MONO } from './m3-gfx.js';
import { FONT } from '../world/textures.js';
import { debugHook } from './m3-debug.js';

const ENTRIES = [
  { label: 'Einstellungen', hint: 'Server, Anzeige, Wiedergabe', fn: 'openSettings' },
  { label: 'Design wechseln', hint: 'LENZFLIX, LENZ+, LENZPRIME …', fn: 'openThemePicker' },
  { label: 'Klassische Ansicht', hint: 'Die normale Startseite', fn: 'classicView' },
  { label: 'Alle Bibliotheken', hint: 'Zur Bibliotheksübersicht', fn: 'openLibraries' },
];

export default {
  name: 'staff',
  init(ctx) {
    const z = ctx.layout.zones.staff;
    if (!z) return null;
    const sx = z.x;
    const group = new Group();
    group.name = 'm3-staff';

    // Rahmen + Zahlenfeld (Lambert), Lampe + LED (unbeleuchtet)
    const metal = [0.2, 0.21, 0.25];
    const frame = [];
    for (const s of [-1, 1]) frame.push(box({ w: 0.06, h: 2.16, d: 0.1, x: sx + s * 0.53, y: 1.08, z: 0.05, color: metal }));
    frame.push(box({ w: 1.12, h: 0.06, d: 0.1, x: sx, y: 2.13, z: 0.05, color: metal }));
    frame.push(box({ w: 0.1, h: 0.17, d: 0.03, x: sx + 0.42, y: 1.22, z: 0.09, color: [0.12, 0.12, 0.15] }));
    frame.push(box({ w: 0.5, h: 0.05, d: 0.04, x: sx, y: 0.03, z: 0.07, color: [0.85, 0.7, 0.1] }));
    group.add(new Mesh(merge(frame), new MeshLambertMaterial({ vertexColors: true })));
    const lamps = [
      box({ w: 0.12, h: 0.1, d: 0.06, x: sx, y: 2.27, z: 0.06, color: [1, 0.15, 0.12] }),
      box({ w: 0.02, h: 0.02, d: 0.01, x: sx + 0.42, y: 1.3, z: 0.11, color: [0.2, 1, 0.4] }),
    ];
    group.add(new Mesh(merge(lamps), new MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
    const glow = new Mesh(
      quad({ w: 0.55, h: 0.55, x: sx, y: 2.27, z: 0.1 }),
      new MeshBasicMaterial({
        map: canvasTexture(ctx, 64, 64, (g, w, hh) => {
          const gr = g.createRadialGradient(w / 2, hh / 2, 1, w / 2, hh / 2, w / 2);
          gr.addColorStop(0, 'rgba(255,70,50,0.9)');
          gr.addColorStop(1, 'rgba(255,40,30,0)');
          g.fillStyle = gr;
          g.fillRect(0, 0, w, hh);
        }),
        transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false,
      }),
    );
    glow.renderOrder = 6;
    group.add(glow);
    group.add(new Mesh(
      quad({ w: 0.3, h: 0.38, x: sx - 0.18, y: 1.45, z: 0.0775, rz: -0.05 }),
      new MeshBasicMaterial({
        map: canvasTexture(ctx, 192, 240, (g, w, hh) => {
          g.fillStyle = '#f6efd6';
          g.fillRect(0, 0, w, hh);
          g.fillStyle = '#c4182b';
          g.fillRect(0, 0, w, 16);
          g.textAlign = 'center';
          g.fillStyle = '#1c2a6b';
          g.font = `bold 30px ${FONT}`;
          g.fillText('BITTE', w / 2, 72);
          g.fillText('NICHT', w / 2, 108);
          g.fillText('STÖREN', w / 2, 144);
          g.font = `bold 17px ${MONO}`;
          g.fillStyle = '#333';
          g.fillText('Spätfilm läuft', w / 2, 188);
          g.fillText('— die Chefin', w / 2, 212);
        }),
      }),
    ));
    ctx.scene.add(group);
    ctx.track(group);
    const rect = ctx.addCollider({ x0: sx - 0.55, z0: 0, x1: sx + 0.55, z1: 0.12, kind: 'prop' });

    // --- Overlay: Pinnwand ---
    function openMenu() {
      openPanel(ctx, {
        cls: 'lfx-store-staff', label: 'Personalraum',
        build(panel, close) {
          const head = h('div', 'lfx-store-staff-head');
          head.append(h('div', 'lfx-store-staff-title', 'PERSONALRAUM'), h('div', 'lfx-store-staff-sub', 'Nur Personal – du darfst ausnahmsweise rein.'));
          const board = h('div', 'lfx-store-staff-board');
          const call = (fn) => () => { close(); if (typeof ctx.deps[fn] === 'function') ctx.deps[fn](); };
          ENTRIES.forEach((e, i) => {
            if (typeof ctx.deps[e.fn] !== 'function') return;
            const b = button('', `lfx-store-staff-note n${i % 4}`, call(e.fn));
            b.append(h('span', 'lfx-store-staff-pin'), h('span', 'lfx-store-staff-label', e.label), h('span', 'lfx-store-staff-hint', e.hint));
            board.append(b);
          });
          const confirm = h('div', 'lfx-store-staff-confirm');
          confirm.hidden = true;
          confirm.append(h('div', 'lfx-store-staff-q', 'Wirklich abmelden?'));
          const row = h('div', 'lfx-store-staff-row');
          row.append(
            button('Ja, abmelden', 'lfx-store-act lfx-store-act--primary', () => { close(); if (typeof ctx.deps.logout === 'function') ctx.deps.logout(); }),
            button('Zurück', 'lfx-store-act', () => { confirm.hidden = true; board.hidden = false; }),
          );
          confirm.append(row);
          if (typeof ctx.deps.logout === 'function') {
            const out = button('', 'lfx-store-staff-note n2 is-out', () => { board.hidden = true; confirm.hidden = false; });
            out.append(h('span', 'lfx-store-staff-pin'), h('span', 'lfx-store-staff-label', 'Abmelden'), h('span', 'lfx-store-staff-hint', 'Feierabend machen'));
            board.append(out);
          }
          panel.append(head, board, confirm, button('Zurück in den Laden', 'lfx-store-act lfx-store-staff-back', close));
        },
      });
    }

    const removeIa = ctx.addInteractable({
      box: { min: { x: sx - 0.55, y: 0, z: 0 }, max: { x: sx + 0.55, y: 2.3, z: 0.3 } },
      label: 'Personalraum',
      hint: 'E / Klick: Einstellungen & mehr',
      onUse: openMenu,
    });

    const offDbg = debugHook(ctx, 'staff', { open: openMenu, pos: { x: sx, z: 0 } });
    return {
      update(dt, t) { if (ctx.quality() !== 'low') glow.material.opacity = 0.55 + 0.35 * Math.sin(t * 3); },
      dispose() {
        offDbg();
        removeIa();
        ctx.removeCollider(rect);
        group.removeFromParent();
      },
    };
  },
};

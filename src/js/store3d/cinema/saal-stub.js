// VIDEOTHEK LENZ · 2D-Kino: Spike-Saal für Harness und Live-Test (window.__lfxStore.palastTest()). Bis das Palast-Gebäude (Welle 2)
// ein echtes `saal`-Handle liefert, baut dies eine Leinwand und einen Sitz vor den Spieler. Kein Produktiv-Pfad (nur über die Debug-API).
// Das `saal`-Format ist die dokumentierte Schnittstelle (PalastCinema.attachSaal), das Stub-Handle erfüllt sie vollständig.
import { Group, Mesh, BoxGeometry, MeshBasicMaterial } from 'three';
import { disposeTree } from '../util/geo.js';

export const STUB = Object.freeze({ distance: 7, seatEye: 1.15, screenOpts: Object.freeze({ radius: 10, bottom: 0.9, maxW: 6, maxH: 3.4 }) });

/** saal-Handle vor dem Spieler (pos = { x, z, yaw }). Leinwand-Anker ± STUB.distance entlang der Blickrichtung, +z zeigt zum Spieler. */
export function buildStubSaal(pos) {
  const yaw = Number(pos.yaw) || 0;
  const anchor = new Group();
  anchor.name = 'lfx-palast-stub';
  anchor.position.set(pos.x - Math.sin(yaw) * STUB.distance, 0, pos.z - Math.cos(yaw) * STUB.distance);
  anchor.rotation.y = yaw;
  // Sitzwürfel am Platz des Spielers (nur zur Orientierung)
  const seatMesh = new Mesh(new BoxGeometry(0.5, 0.45, 0.5), new MeshBasicMaterial({ color: 0xff3d7f }));
  seatMesh.position.set(pos.x, 0.225, pos.z);
  const root = new Group();
  root.name = 'lfx-palast-stub-root';
  root.add(anchor, seatMesh);
  const saal = {
    root,
    anchor,
    screenOpts: { ...STUB.screenOpts },
    seats: [{ id: 'stub', x: pos.x, y: STUB.seatEye, z: pos.z, yaw }],
    aisle: { x: pos.x, z: pos.z, yaw },
    bounds: { x0: pos.x - 3, z0: pos.z - 3, x1: pos.x + 3, z1: pos.z + 3 },
    log: [],
    curtain(open, instant) { saal.log.push(instant ? ['curtain', open, true] : ['curtain', open]); },
    light(k) { saal.log.push(['light', k]); },
    spill(c, k) { saal.log.push(['spill', k]); saal.lastSpill = { c, k }; },
    dispose() { disposeTree(root); root.removeFromParent(); },
  };
  return saal;
}

/**
 * Debug-API (window.__lfxStore.palastTest): Stub-Saal vor den Spieler stellen und anmelden.
 * o: { autostart (sitzen + ersten Titel starten), item (Titel statt des ersten im Katalog) }.
 * Rückgabe: { saal, sit(), play(item?), stand(), full(on), stop(), diag(), dispose() }.
 */
export function palastTest(app, o = {}) {
  // Echter Saal (modules/palast.js): Spieler in den Saal setzen, Ticket holen, auf Wunsch sitzen und starten
  const real = app.mods && app.mods.ctx && typeof app.mods.ctx.use === 'function' ? app.mods.ctx.use('palast') : null;
  if (real && typeof real.test === 'function') { const h = real.test(o); if (h) return h; }
  const c = app.cinema2d;
  if (!c || !app.player || !app.engine) return null;
  if (app.palastStub) app.palastStub.dispose();
  const p = app.player;
  const saal = buildStubSaal({ x: p.x, z: p.z, yaw: p.yaw });
  app.engine.scene.add(saal.root);
  const off = c.attachSaal(saal);
  const first = () => (o.item || (app.items && app.items.values ? app.items.values().next().value : null) || null);
  const h = {
    saal,
    sit: () => c.sit('stub'),
    play: (it) => c.play(it || first(), {}),
    stand: () => c.stand(),
    full: (on) => c.setFull(on !== false),
    stop: () => c.stopAndRelease(),
    diag: () => c.diag(),
    dispose() { off(); saal.dispose(); if (app.palastStub === h) app.palastStub = null; },
  };
  app.palastStub = h;
  if (o.autostart) { h.sit(); h.play(); }
  return h;
}

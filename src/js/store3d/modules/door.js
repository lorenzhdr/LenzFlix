// VIDEOTHEK LENZ · Modul `door`: Auto-Tür der Eingangsfront, Türglocke, schaltbarer Türspalt (Hausverbot) (VR sperrt nicht mehr).
// Besitzt die Türflügel-Materialien dauerhaft (Tönung nach Tageszeit). Der Türspalt ist nur im Kollider offen; `layout.doorBlock`
// wird bei Sperre per ctx.addCollider eingefügt (einmal Nav-Neuaufbau). Provider 'door':
//   override(v|null)       0..1 Öffnung erzwingen (Intro); null = Automatik
//   open()                 für kurze Zeit offen halten
//   lock(sec) / unlock()   Tür schließen und Spalt sperren (sec <= 0 oder fehlend: bis unlock); isLocked()
//   registerActor(fn) → remove   fn() → {x,z}|null: weitere Akteure, bei denen sich die Tür öffnet (NPC, Richard)
//   amount()               aktuelle Öffnung 0..1 (angezeigt)
//   onChange(fn) → off     fn(locked) bei Sperre/Entsperrung
// Zone `theft` (layout.zones) und zwei Pfosten (city.doorPosts) sind nur Daten für die spätere Diebstahlsicherung.
import { DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { getOutdoor } from './outdoor.js';
import { makeCanvas, toTexture, FONT } from '../world/textures.js';

const ease = (t) => t * t * (3 - 2 * t);
const MAX_ANGLE = 1.45;
export const OPEN_SPEED = 4;
export const CLOSE_SPEED = 1.8;

function closedCanvas() {
  const c = makeCanvas(256, 96);
  const x = c.getContext('2d');
  x.fillStyle = '#b3261e'; x.fillRect(0, 0, 256, 96);
  x.strokeStyle = '#fff'; x.lineWidth = 4; x.strokeRect(5, 5, 246, 86);
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; let px = 38;
  do { x.font = `bold ${px}px ${FONT}`; px -= 2; } while (x.measureText('GESCHLOSSEN').width > 228 && px > 12);
  x.fillText('GESCHLOSSEN', 128, 50);
  return c;
}

export default {
  name: 'door',
  init(ctx) {
    const L = ctx.layout;
    const D = L.d;
    const door = (L.facade && L.facade.door) || L.door;
    const out = getOutdoor(ctx);
    const left = ctx.scene.getObjectByName('lfx-door-left');
    const right = ctx.scene.getObjectByName('lfx-door-right');
    const leafMats = [left, right].filter(Boolean).map((g) => g.getObjectByName('lfx-door-frame')).filter(Boolean).map((o) => o.material);
    for (const mat of leafMats) out.tinted.push({ mat, base: [1, 1, 1] });
    out.setPalette(out.tod, out.rain, out.wx);

    let amount = 0; // Automatik: 0 zu .. 1 offen (angezeigt wird ease(amount))
    let forced = null; // override(v)
    let locked = false;
    let lockT = 0;
    let holdT = 0;
    let prevZ = null;
    const actors = [];
    const changes = [];
    const blockRect = L.doorBlock;
    let blockOn = false;

    function setBlock(on) {
      if (!blockRect || on === blockOn) return;
      blockOn = on;
      if (on) ctx.addCollider(blockRect); else ctx.removeCollider(blockRect);
    }

    // Schild „GESCHLOSSEN“ an der Scheibe (nur bei Sperre sichtbar)
    const sign = new Mesh(new PlaneGeometry(0.8, 0.3), new MeshBasicMaterial({ map: toTexture(closedCanvas(), { aniso: 2 }), side: DoubleSide }));
    sign.position.set((door.x0 + door.x1) / 2, 1.65, D + 0.09);
    sign.visible = false;
    ctx.scene.add(sign);
    ctx.track(sign);

    function applyAngle() {
      const a = (forced !== null ? forced : ease(amount)) * MAX_ANGLE;
      if (left) left.rotation.y = -a;
      if (right) right.rotation.y = a;
    }

    function near(p) {
      return p && p.x >= door.x0 - 0.6 && p.x <= door.x1 + 0.6 && p.z >= D - 0.9 && p.z <= D + 1.8;
    }

    function setLocked(on) {
      if (on === locked) return;
      locked = on;
      setBlock(locked);
      sign.visible = locked;
      for (const fn of changes.slice()) { try { fn(locked); } catch (err) { console.warn('[LenzFlix Store3D] door', err); } }
    }

    const api = {
      override(v) { forced = v === null || v === undefined ? null : Math.min(1, Math.max(0, v)); if (forced === null) amount = Math.min(1, Math.max(0, amount)); else amount = forced; applyAngle(); },
      open(sec = 1.5) { holdT = Math.max(holdT, sec); },
      lock(sec) { lockT = sec > 0 ? sec : Infinity; setLocked(true); },
      unlock() { lockT = 0; setLocked(false); },
      isLocked: () => locked,
      registerActor(fn) { actors.push(fn); return () => { const i = actors.indexOf(fn); if (i >= 0) actors.splice(i, 1); }; },
      amount: () => (forced !== null ? forced : ease(amount)),
      onChange(fn) { changes.push(fn); return () => { const i = changes.indexOf(fn); if (i >= 0) changes.splice(i, 1); }; },
    };
    ctx.provide('door', api);

    // VR (seit 1.15.0): Die Welt ist begehbar, der Türspalt bleibt offen, kein Zurück-Teleport (Sperre nur per lock()).
    applyAngle();

    return {
      update(dt) {
        const p = ctx.player.getPose();
        if (prevZ === null) prevZ = p.z;
        if (locked && lockT !== Infinity) { lockT -= dt; if (lockT <= 0) setLocked(false); }
        if (forced === null) {
          let want = near(p);
          if (!want) for (const fn of actors) { let a; try { a = fn(); } catch { continue; } if (near(a)) { want = true; break; } }
          if (holdT > 0) { holdT -= dt; want = true; }
          if (locked) want = false;
          const goal = want ? 1 : 0;
          if (amount < goal) amount = Math.min(goal, amount + OPEN_SPEED * dt);
          else if (amount > goal) amount = Math.max(goal, amount - CLOSE_SPEED * dt);
        }
        applyAngle();
        // Türglocke: von außen nach innen durch die Tür (nicht während des Intros)
        if (forced === null && prevZ > D + 0.4 && p.z <= D + 0.4 && p.x >= door.x0 && p.x <= door.x1) {
          const s = ctx.use('sound');
          if (s) s.play('doorbell');
        }
        prevZ = p.z;
      },
      dispose() {
        if (left) left.rotation.y = 0;
        if (right) right.rotation.y = 0;
        for (const mat of leafMats) { const i = out.tinted.findIndex((q) => q.mat === mat); if (i >= 0) out.tinted.splice(i, 1); mat.color.setRGB(1, 1, 1); }
        setBlock(false);
      },
    };
  },
};

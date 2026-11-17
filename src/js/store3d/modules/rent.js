// VIDEOTHEK LENZ · Welle 2: Ausleihen und Diebstahlsicherung. Provider 'rent' { isRented(id), rent(id) → bool, tryRent() → bool }.
// Ausleihen: Hülle tragen (ctx.items.carried()) und Richard/Kasse benutzen → Scan-Piep, Spruch, Merkung nur in der Sitzung
// (sessionStorage, nichts an Jellyfin). Diebstahlsicherung: nicht ausgeliehene Hülle durch die Tür nach draußen → Alarm,
// Pfosten blinken rot, Richard ruft hinterher. Keine Strafe (Nutzerentscheidung). Pro Hülle höchstens einmal je Minute.
import { Mesh, MeshBasicMaterial } from 'three';
import { box, merge } from '../util/geo.js';
import { createRentLedger, createTheftGuard, crossedGate } from './brawl-logic.js';

const BLINK_SEC = 3.2;
const ALARM_COOLDOWN = 60;

export default {
  name: 'rent',
  init(ctx) {
    const L = ctx.layout;
    const D = L.d;
    const door = (L.facade && L.facade.door) || L.door;
    const store = (() => { try { return window.sessionStorage; } catch { return null; } })();
    const ledger = createRentLedger(store);
    const guard = createTheftGuard(ALARM_COOLDOWN);
    const gate = { x0: door.x0 - 0.1, x1: door.x1 + 0.1, z: D - 0.7 };
    const richard = () => { const c = ctx.use('cashier'); return c && c.richard ? c.richard() : null; };
    const say = (cat, vars) => { const r = richard(); if (r) r.say(cat, vars || {}); };
    const sound = (n) => { const s = ctx.use('sound'); if (s) s.play(n); };

    // Warnlichter auf den beiden Pfosten (ein Mesh, ein Material)
    let lamp = null;
    let mat = null;
    const posts = (L.city && L.city.doorPosts) || [];
    if (posts.length) {
      mat = new MeshBasicMaterial({ color: 0x3a0a0a });
      lamp = new Mesh(merge(posts.map((q) => box({ w: 0.11, h: 0.09, d: 0.11, x: (q.x0 + q.x1) / 2, y: (q.y1 || 1.3) + 0.04, z: (q.z0 + q.z1) / 2 }))), mat);
      ctx.scene.add(lamp);
      ctx.track(lamp);
      ctx.track(mat);
    }
    let blink = 0;
    let prev = null;
    let T = 0;

    function rent(id) { return ledger.rent(id); }
    function tryRent() {
      const c = ctx.items.carried();
      if (!c) return false;
      const title = c.item && c.item.Name;
      if (ledger.isRented(c.id)) { say('rentAlready', { title }); return false; }
      ledger.rent(c.id);
      sound('beep2');
      say('rentOk', { title });
      if (ctx.xr && ctx.xr.toast) ctx.xr.toast(title ? `Ausgeliehen: ${title}` : 'Ausgeliehen', 2200);
      const d = ctx.use('discover');
      if (d && d.found) { try { d.found('richard-rent'); } catch { /* egal */ } }
      return true;
    }
    const off = ctx.provide('rent', { isRented: (id) => ledger.isRented(id), rent, tryRent });

    function alarm() {
      sound('alarm');
      blink = BLINK_SEC;
      const c = ctx.items.carried();
      say('theftShout', { title: c && c.item && c.item.Name });
    }

    if (ctx.opts.debug) window.__lfxRent = { ledger, guard, tryRent, alarm };

    return {
      update(dt, t) {
        T = t;
        const p = ctx.player.getPose();
        const cur = { x: p.x, z: p.z };
        const y = Number.isFinite(p.y) ? p.y : 0;
        if (prev && y < 1) {
          const c = ctx.items.carried();
          if (c && !ledger.isRented(c.id) && crossedGate(prev, cur, gate) && guard.shouldAlarm(c.id, T)) alarm();
        }
        prev = cur;
        if (mat) {
          if (blink > 0) {
            blink -= dt;
            mat.color.setHex(blink > 0 && Math.floor(T * 7) % 2 === 0 ? 0xff2a1a : 0x3a0a0a);
          } else if (mat.color.getHex() !== 0x3a0a0a) mat.color.setHex(0x3a0a0a);
        }
      },
      dispose() {
        off();
        if (lamp) ctx.scene.remove(lamp);
        if (window.__lfxRent) delete window.__lfxRent;
      },
    };
  },
};

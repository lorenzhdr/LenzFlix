// VIDEOTHEK LENZ · Modul `kiosk` (Welle 2, Paket E): Verkäuferin am Kiosk (Figur aus Provider 'npc'), Interaktion „Snack kaufen“ mit kleinem
// Overlay (4 erfundene Snacks, Witz-Texte, Preise in DM wie in modules/snack.js), Kauf = Spruch + Sound + Snack kurz in der Hand (Bissanimation)
// + Fund 'kiosk-snack'. In VR: Panel statt DOM-Overlay, kein Snack in der Hand. Anker: city.kiosk.vendor (Paket A) sonst Fallback (npc/spots.js).
// 1.18.0: spricht über die Sprecher-Regie (npc.speak, Stimme 'kiosk'); bei Provokation (Schlag) wirft sie Bonbons (setHandItem 'candy', Pose toss, Wurf-Pool
// des npc-Moduls via npc.throwProp, Treffer → fight.hitPlayer, Abklingzeit in npc/aggro-logic.js); Laserblick: Hände vor die Augen (onLaser). Keine Angriffe in VR.
import { Mesh, MeshLambertMaterial, Vector3 } from 'three';
import { box, merge } from '../util/geo.js';
import { sph } from './m4-geo.js';
import { vendorAnchor } from '../npc/spots.js';
import { pickLine } from '../npc/lines.js';
import { createAggro, provoke as aggroProvoke } from '../npc/aggro-logic.js';

const SNACKS = [
  { id: 'brezel', name: 'Mega-Brezel', price: '1,99', blurb: 'Warm, salzig und größer als dein Kopf.', after: 'Mampf! Die Brezel war eindeutig größer als dein Kopf.' },
  { id: 'lakritz', name: 'Lakritz-Schnecke', price: '0,99', blurb: 'Schwarz wie die Nacht, klebt wie ein Versprechen.', after: 'Schmatz! Deine Zunge ist jetzt offiziell schwarz.' },
  { id: 'keule', name: 'Kakao-Keule', price: '1,49', blurb: 'Am Stiel, mit Schokoguss. Kein Besteck nötig.', after: 'Knusper! Der Schokoguss hat sich ein Plätzchen auf deiner Nase gesucht.' },
  { id: 'eis', name: 'Zitronen-Eis-Dingens', price: '1,29', blurb: 'Was genau? Weiß keiner. Schmeckt nach Sommer.', after: 'Brrr, Sommer mit Hirnfrost! Aber lecker.' },
];

const COLORS = { brezel: [0.72, 0.45, 0.2], lakritz: [0.1, 0.1, 0.12], keule: [0.4, 0.22, 0.12], eis: [1, 0.9, 0.3] };

function snackGeometry(id) {
  const c = COLORS[id] || [1, 1, 1];
  if (id === 'brezel') {
    const parts = [];
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; parts.push(box({ w: 0.05, h: 0.035, d: 0.05, x: Math.cos(a) * 0.075, y: Math.sin(a) * 0.06, z: 0, color: c })); }
    parts.push(box({ w: 0.15, h: 0.03, d: 0.04, x: 0, y: -0.01, z: 0.002, color: c, rz: 0.5 }));
    parts.push(box({ w: 0.15, h: 0.03, d: 0.04, x: 0, y: -0.01, z: 0.002, color: c, rz: -0.5 }));
    return merge(parts);
  }
  if (id === 'lakritz') return merge([sph(0.07, 0, 0, 0, c, 1, 0.35, 1), sph(0.045, 0, 0.05, 0, [0.15, 0.15, 0.18], 1, 0.5, 1), sph(0.025, 0, 0.09, 0, [0.2, 0.2, 0.24], 1, 0.6, 1)]);
  if (id === 'keule') return merge([box({ w: 0.015, h: 0.14, d: 0.015, x: 0, y: -0.1, z: 0, color: [0.8, 0.7, 0.5] }), sph(0.055, 0, 0.0, 0, c, 1, 1.4, 1), sph(0.036, 0, 0.05, 0, [0.95, 0.9, 0.85], 1, 0.4, 1)]);
  return merge([box({ w: 0.015, h: 0.12, d: 0.015, x: 0, y: -0.09, z: 0, color: [0.8, 0.7, 0.5] }), sph(0.06, 0, 0, 0, c, 0.8, 1.3, 0.5), sph(0.02, 0, 0.0, 0.03, [1, 0.95, 0.5])]);
}

export default {
  name: 'kiosk',
  init(ctx) {
    const flags = (ctx.opts && ctx.opts.devFlags) || {};
    const city = ctx.layout.city;
    if (flags.npc === false || !city || !city.kiosk) return {};
    const rand = Math.random;
    const npc = () => ctx.use('npc');
    const found = (id) => { const d = ctx.use('discover'); if (d && d.found) { try { d.found(id); } catch { /* egal */ } } };
    const sound = (n) => { const s = ctx.use('sound'); if (s && s.play) s.play(n); };
    const toast = (t) => { if (ctx.xr.presenting()) ctx.xr.toast(t); else { try { ctx.deps.toast(t); } catch { /* egal */ } } };
    const anchor = vendorAnchor(city);
    let handle = null;
    let hand = null; // { mesh, t, id }
    let removeIa = () => {};
    let removeCol = null;
    let offPerson = () => {};
    let chat = 8 + rand() * 12;
    let lastLine = -1;
    let waveCool = 0;
    const aggro = createAggro('kiosk');
    let clockK = 0; // s aus dt
    const timers = [];
    const later = (sec, fn) => { timers.push({ t: clockK + sec, fn }); };
    /** Sprechen über die Sprecher-Regie (Stimme 'kiosk'); ohne npc-Provider als Blase der Figur. */
    function talk(text, ms) {
      const n = npc();
      if (n && typeof n.speak === 'function') n.speak(handle, text, { id: 'kiosk', voiceSeed: 'kiosk', ms });
      else if (handle) handle.say(text, ms);
    }
    /** Schlag auf die Kioskfrau: Bonbon-Wurf (mit Abklingzeit), nie in VR. */
    function provoked() {
      if (!handle || ctx.xr.presenting() || aggroProvoke(aggro, clockK) !== 'throw') return;
      const h = handle;
      try { h.setHandItem('candy'); h.setAnim('toss', { restart: true }); } catch { /* egal */ }
      later(0.4, () => {
        const n = npc();
        const p = ctx.player.getPose();
        if (n && typeof n.throwProp === 'function') n.throwProp('candy', { x: anchor.x, y: 1.3, z: anchor.z }, { x: p.x, y: (Number.isFinite(p.y) ? p.y : 0) + 1.2, z: p.z });
      });
      later(1.4, () => { try { h.setHandItem(null); } catch { /* egal */ } });
    }
    function blinded() {
      if (!handle) return;
      handle.setAnim('cover', { restart: true });
      const r = pickLine('blinded', rand, -1);
      if (r) talk(r.text, 3200);
      later(2, () => { if (handle && handle.anim.anim === 'cover') handle.setAnim('idle', { restart: true }); });
    }
    const mat = new MeshLambertMaterial({ vertexColors: true });
    const geos = new Map();
    const camPos = new Vector3();
    const camDir = new Vector3();
    const up = new Vector3(0, 1, 0);
    const right = new Vector3();

    function mountVendor() {
      const n = npc();
      if (!n || !n.figure) return false;
      handle = n.figure({ role: 'kiosk', pos: { x: anchor.x, z: anchor.z }, yaw: anchor.yaw });
      removeCol = ctx.addCollider({ x0: anchor.x - 0.28, z0: anchor.z - 0.28, x1: anchor.x + 0.28, z1: anchor.z + 0.28, y1: 1.8, kind: 'npc' });
      offPerson = n.registerPerson({
        kind: 'kiosk', handle,
        onHit: (dir) => { handle.hitReact(dir); const r = pickLine('kioskHit', rand, -1); if (r) talk(r.text, 3600); sound('oof'); provoked(); },
        onLaser: blinded,
      });
      const k = city.kiosk.counter;
      removeIa = ctx.addInteractable({
        box: { min: { x: k.x0 - 0.1, y: 0, z: k.z1 - 0.1 }, max: { x: Math.max(k.x1, anchor.x) + 0.5, y: 2.0, z: k.z1 + 0.8 } },
        label: 'Kiosk', hint: 'E / Klick: Snack kaufen',
        onUse: openMenu,
      });
      return true;
    }

    function buy(s) {
      if (ctx.overlay.isOpen()) ctx.overlay.close();
      if (handle) { handle.setAnim('wave', { restart: true }); const r = pickLine('kioskBuy', rand, -1); if (r) talk(`${s.name}! ${r.text}`, 4200); }
      sound('buy');
      found('kiosk-snack');
      if (ctx.xr.presenting()) { toast(s.after); return; }
      if (!geos.has(s.id)) geos.set(s.id, snackGeometry(s.id));
      if (hand) { if (hand.mesh.parent) hand.mesh.parent.remove(hand.mesh); }
      const mesh = new Mesh(geos.get(s.id), mat);
      ctx.scene.add(mesh);
      hand = { mesh, t: 0, id: s.id, after: s.after, bites: 0 };
    }

    function openMenu() {
      if (ctx.overlay.isOpen()) return;
      if (handle) { talk(pickLine('kiosk', rand, lastLine).text, 3000); }
      if (ctx.xr.presenting()) {
        const spec = {
          title: 'Kiosk', text: 'Was darf es sein?',
          buttons: [...SNACKS.map((s, i) => ({ label: `${s.name} · ${s.price} DM`, primary: i === 0, onSelect: () => buy(s) })), { label: 'Nö, danke', onSelect: () => {} }],
        };
        ctx.xr.panel.open(spec);
        return;
      }
      const el = document.createElement('div');
      el.className = 'lfx-store-tip lfx-store-dialog' + (ctx.isTouch ? ' is-touch' : '');
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', 'Kiosk');
      const card = document.createElement('div');
      card.className = 'lfx-store-tip-card';
      const h = document.createElement('div');
      h.className = 'lfx-store-tip-title';
      h.textContent = 'Kiosk – Snack kaufen';
      const p = document.createElement('div');
      p.className = 'lfx-store-tip-text';
      p.textContent = 'Frisch, knusprig und garantiert ohne Beipackzettel. Was darf es sein?';
      const row = document.createElement('div');
      row.className = 'lfx-store-tip-btns lfx-store-dialog-btns is-choices';
      SNACKS.forEach((s, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'lfx-store-tip-btn' + (i === 0 ? ' is-primary' : '');
        b.textContent = `${s.name} · ${s.price} DM`;
        b.title = s.blurb;
        b.addEventListener('click', () => buy(s));
        row.appendChild(b);
      });
      const no = document.createElement('button');
      no.type = 'button';
      no.className = 'lfx-store-tip-btn';
      no.textContent = 'Nö, danke';
      no.addEventListener('click', () => ctx.overlay.close());
      row.appendChild(no);
      const blurb = document.createElement('div');
      blurb.className = 'lfx-store-tip-text';
      blurb.textContent = SNACKS[0].blurb;
      row.addEventListener('mouseover', (e) => { const t = e.target && e.target.title; if (t) blurb.textContent = t; });
      card.append(h, p, row, blurb);
      el.appendChild(card);
      el.addEventListener('pointerdown', (e) => { if (e.target === el) ctx.overlay.close(); });
      ctx.overlay.open(el, {});
      if (!ctx.isTouch) { const f = row.querySelector('.is-primary'); if (f) f.focus({ preventScroll: true }); }
    }

    mountVendor();

    function endHand() { if (hand) { if (hand.mesh.parent) hand.mesh.parent.remove(hand.mesh); hand = null; } }

    return {
      update(dt) {
        dt = Math.min(dt, 0.1);
        clockK += dt;
        for (let i = timers.length - 1; i >= 0; i--) {
          if (clockK < timers[i].t) continue;
          const t = timers.splice(i, 1)[0];
          try { t.fn(); } catch { /* egal */ }
        }
        if (handle) {
          const p = ctx.player.getPose();
          const d = Math.hypot(p.x - anchor.x, p.z - anchor.z);
          if (d < 7) handle.lookAt(p.x, 1.6, p.z); else handle.lookAt(null);
          chat -= dt; waveCool -= dt;
          if (d < 5 && chat <= 0) { const r = pickLine('kiosk', rand, lastLine); if (r) { lastLine = r.index; talk(r.text, 3800); } chat = 30 + rand() * 25; }
          if (d < 4 && waveCool <= 0 && handle.anim.anim === 'idle') { handle.setAnim('wave'); waveCool = 25; }
        }
        if (hand) {
          hand.t += dt;
          ctx.camera.getWorldPosition(camPos);
          ctx.camera.getWorldDirection(camDir);
          right.crossVectors(camDir, up).normalize();
          const bob = Math.sin(hand.t * 6) * 0.01;
          hand.mesh.position.copy(camPos).addScaledVector(camDir, 0.5).addScaledVector(right, 0.2).addScaledVector(up, -0.16 + bob);
          hand.mesh.rotation.set(0.5, Math.atan2(-camDir.x, -camDir.z), 0.2);
          // Bissanimation: drei Bisse, dann weg
          const bites = Math.min(3, Math.floor(Math.max(0, hand.t - 0.9) / 0.55));
          if (bites > hand.bites) { hand.bites = bites; sound('munch'); }
          hand.mesh.scale.setScalar(Math.max(0.2, 1 - hand.bites * 0.27));
          if (hand.t > 0.9 + 3 * 0.55 + 0.25) { toast(hand.after); endHand(); }
        }
      },
      dispose() {
        timers.length = 0;
        endHand();
        removeIa();
        offPerson();
        if (removeCol) ctx.removeCollider(removeCol);
        if (handle) handle.dispose();
        for (const g of geos.values()) g.dispose();
        geos.clear();
        mat.dispose();
      },
    };
  },
};

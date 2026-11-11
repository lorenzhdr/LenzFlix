// VIDEOTHEK LENZ · M4 Kassen-Personal: stilisierte Low-Poly-Figur hinter dem Tresen (Zone „cashier“), Idle-Animation
// (Atmen, Kopf folgt dem Spieler < 6 m, Tresen wischen, Winken), Sprechblasen (DOM, projiziert) mit lockeren Sprüchen
// und „Mit dem Personal reden“ (Tipp aus catalog.highlights, Knopf „Zeig mal“). Sprüche: cashier-lines.js.
import { Group, Mesh, MeshLambertMaterial, MeshBasicMaterial, Vector3 } from 'three';
import { box, quad, merge } from '../util/geo.js';
import { sph } from './m4-geo.js';
import { makeCanvas, toTexture, FONT } from '../world/textures.js';
import { LINES, pickLine, categoryFor, greetingCategory, tipText } from './cashier-lines.js';
import { timeOfDay, isLate, createLimiter, clamp, prefersReducedMotion, adultIds } from './m4-util.js';

const SKIN = [0.93, 0.74, 0.6];
const VEST = [0.12, 0.45, 0.52];
const SHIRT = [0.95, 0.95, 0.97];
const NAVY = [0.14, 0.16, 0.3];
const HAIR = [0.24, 0.13, 0.1];
const BUBBLE_MS = 4500;

function nameTag() {
  const c = makeCanvas(128, 56);
  const x = c.getContext('2d');
  x.fillStyle = '#f7f3e4'; x.fillRect(0, 0, 128, 56);
  x.fillStyle = '#b3261e'; x.fillRect(0, 0, 128, 12);
  x.fillStyle = '#222'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `bold 30px ${FONT}`; x.fillText('Team', 64, 36);
  return c;
}

function buildFigure(ctx) {
  const root = new Group();
  const lam = () => new MeshLambertMaterial({ vertexColors: true });
  const body = [];
  for (const sx of [-1, 1]) {
    body.push(box({ w: 0.14, h: 0.8, d: 0.17, x: sx * 0.1, y: 0.4, z: 0, color: NAVY }));
    body.push(box({ w: 0.15, h: 0.07, d: 0.26, x: sx * 0.1, y: 0.035, z: -0.04, color: [0.1, 0.1, 0.12] }));
  }
  body.push(box({ w: 0.42, h: 0.58, d: 0.23, x: 0, y: 1.09, z: 0, color: SHIRT }));
  body.push(box({ w: 0.44, h: 0.5, d: 0.25, x: 0, y: 1.05, z: 0, color: VEST }));
  body.push(box({ w: 0.45, h: 0.045, d: 0.26, x: 0, y: 0.9, z: 0, color: [1, 0.24, 0.5] }));
  body.push(box({ w: 0.1, h: 0.07, d: 0.1, x: 0, y: 1.42, z: 0, color: SKIN }));
  const bodyMesh = new Mesh(merge(body), lam());
  const head = [
    sph(0.12, 0, 0.14, 0, SKIN, 1, 1.1, 1),
    sph(0.133, 0, 0.165, 0.016, HAIR, 1, 1, 1, 8, 5, 1.95),
    box({ w: 0.028, h: 0.034, d: 0.012, x: -0.045, y: 0.16, z: -0.113, color: [0.08, 0.08, 0.1] }),
    box({ w: 0.028, h: 0.034, d: 0.012, x: 0.045, y: 0.16, z: -0.113, color: [0.08, 0.08, 0.1] }),
    box({ w: 0.05, h: 0.012, d: 0.012, x: 0, y: 0.095, z: -0.113, color: [0.62, 0.25, 0.25] }),
    box({ w: 0.02, h: 0.03, d: 0.02, x: 0, y: 0.13, z: -0.122, color: [0.88, 0.68, 0.55] }),
  ];
  const headMesh = new Mesh(merge(head), lam());
  headMesh.position.set(0, 1.44, 0);
  const arm = () => {
    const m = new Mesh(merge([
      box({ w: 0.09, h: 0.3, d: 0.09, x: 0, y: -0.15, z: 0, color: SHIRT }),
      box({ w: 0.085, h: 0.26, d: 0.085, x: 0, y: -0.43, z: 0, color: SKIN }),
      sph(0.05, 0, -0.58, 0, SKIN),
    ]), lam());
    const g = new Group();
    g.rotation.order = 'YXZ';
    g.add(m);
    return g;
  };
  const armL = arm();
  const armR = arm();
  armL.position.set(-0.26, 1.36, 0);
  armR.position.set(0.26, 1.36, 0);
  const tag = new Mesh(quad({ w: 0.15, h: 0.065 }), new MeshBasicMaterial({ map: toTexture(nameTag(), { aniso: 2 }) }));
  tag.position.set(0.1, 1.22, -0.132);
  tag.rotation.y = Math.PI;
  root.add(bodyMesh, headMesh, armL, armR, tag);
  ctx.track(root);
  return { root, head: headMesh, armL, armR };
}

export default {
  name: 'cashier',
  init(ctx) {
    const z = ctx.layout.zones.cashier;
    const L = ctx.layout;
    if (!z) return {};
    const cx = L.w - 2.9;
    const cz = L.d - 2.35;
    const fig = buildFigure(ctx);
    fig.root.position.set(cx, 0, cz); // blickt nach Norden (−z) zu den Kunden
    ctx.scene.add(fig.root);
    ctx.addCollider({ x0: cx - 0.3, z0: cz - 0.3, x1: cx + 0.3, z1: cz + 0.3 });

    const reduced = prefersReducedMotion();
    const host = ctx.renderer.domElement.parentNode;
    const user = (ctx.deps.user && ctx.deps.user.name) || '';
    const rand = Math.random;
    const limiter = createLimiter(20000);
    const lastIdx = {};
    const deptOf = new Map();
    for (const d of (ctx.catalog.departments || [])) {
      for (const id of d.itemIds || []) { const cur = deptOf.get(id); if (!cur || cur.kind === 'new') deptOf.set(id, d); }
    }

    // --- Blase ---
    const bubble = document.createElement('div');
    bubble.className = 'lfx-store-bubble' + (ctx.isTouch ? ' is-touch' : '');
    bubble.hidden = true;
    bubble.setAttribute('role', 'status');
    const who = document.createElement('span');
    who.className = 'lfx-store-bubble-who';
    who.textContent = 'Kasse';
    const txt = document.createElement('span');
    txt.className = 'lfx-store-bubble-text';
    bubble.append(who, txt);
    if (host) host.appendChild(bubble);
    let bubbleLeft = 0;
    const v = new Vector3();

    let now = 0;
    const weather = () => ctx.use('weather');
    const hourNow = () => { const w = weather(); return w && Number.isFinite(w.hour) ? w.hour : undefined; };

    function speak(cat, vars, { force = false, maxDist = 16 } = {}) {
      if (ctx.overlay.isOpen() && !force) return false;
      const p = ctx.player.getPose();
      if (!force && Math.hypot(p.x - cx, p.z - cz) > maxDist) return false;
      if (!limiter.can(now, { force })) return false;
      const picked = pickLine(LINES[cat], rand, { name: user, ...vars }, lastIdx[cat]);
      if (!picked) return false;
      lastIdx[cat] = picked.index;
      txt.textContent = picked.text;
      bubble.hidden = false;
      bubbleLeft = (ctx.isTouch ? BUBBLE_MS + 500 : BUBBLE_MS) / 1000;
      limiter.mark(now);
      placeBubble();
      return true;
    }
    function placeBubble() {
      if (bubble.hidden || !host) return;
      v.set(cx, 1.95, cz).project(ctx.camera);
      const on = v.z < 1 && Math.abs(v.x) < 0.9 && v.y > -0.8 && v.y < 0.88;
      bubble.classList.toggle('is-edge', !on);
      if (on) {
        const w = host.clientWidth || window.innerWidth;
        const h = host.clientHeight || window.innerHeight;
        bubble.style.transform = `translate(${((v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%, -100%)`;
      } else {
        bubble.style.transform = '';
      }
    }

    // --- Animation ---
    let wipeT = -1; // 0..WIPE
    let nextWipe = 9 + rand() * 8;
    let waveT = -1;
    const WIPE = 2.8;
    const WAVE = 2.3;
    let headYaw = 0;
    let pendingGreet = -1;
    let lastWave = -Infinity;
    function wave() { if (reduced || now - lastWave < 25) return; lastWave = now; waveT = 0; }

    // --- Ereignisse ---
    const offs = [];
    offs.push(ctx.on('enter', () => { pendingGreet = 1.1; wave(); }));
    offs.push(ctx.on('take', (id) => {
      const it = ctx.catalog.items && ctx.catalog.items.get(id);
      const dept = deptOf.get(id);
      speak(categoryFor(it, dept), { title: it && it.Name, dept: dept && dept.label });
    }));
    offs.push(ctx.on('play', () => { speak('play', {}, { force: true }); }));
    let resumeSaid = false;
    offs.push(ctx.on('zone', (id) => {
      if (id !== 'register') return;
      wave();
      const r = ctx.catalog.resume && ctx.catalog.resume[0];
      if (r && !resumeSaid && speak('resume', { title: r.Name })) resumeSaid = true;
    }));

    // --- „Mit dem Personal reden“ ---
    function openTip() {
      const adult = adultIds(ctx.catalog);
      const list = (ctx.catalog.highlights || []).filter((i) => i && i.Id && !adult.has(i.Id));
      if (!list.length) { speak('idle', {}, { force: true }); return; }
      const it = list[Math.floor(rand() * list.length)];
      const dept = deptOf.get(it.Id);
      const el = document.createElement('div');
      el.className = 'lfx-store-tip' + (ctx.isTouch ? ' is-touch' : '');
      const card = document.createElement('div');
      card.className = 'lfx-store-tip-card';
      const h = document.createElement('div');
      h.className = 'lfx-store-tip-title';
      h.textContent = 'Team – Kasse';
      const p = document.createElement('div');
      p.className = 'lfx-store-tip-text';
      p.textContent = tipText(it.Name, dept ? dept.label : '');
      const row = document.createElement('div');
      row.className = 'lfx-store-tip-btns';
      const go = document.createElement('button');
      go.type = 'button'; go.className = 'lfx-store-tip-btn is-primary'; go.textContent = 'Zeig mal';
      const no = document.createElement('button');
      no.type = 'button'; no.className = 'lfx-store-tip-btn'; no.textContent = 'Später';
      row.append(go, no);
      card.append(h, p, row);
      el.appendChild(card);
      go.addEventListener('click', () => { ctx.overlay.close(); ctx.items.take(it.Id, { from: 'counter' }); });
      no.addEventListener('click', () => ctx.overlay.close());
      el.addEventListener('pointerdown', (e) => { if (e.target === el) ctx.overlay.close(); });
      ctx.overlay.open(el);
      bubble.hidden = true;
    }
    ctx.addInteractable({
      box: { min: { x: cx - 0.5, y: 0.2, z: cz - 0.6 }, max: { x: cx + 0.5, y: 2.0, z: cz + 0.4 } },
      label: 'Personal', hint: 'E / Klick: Mit dem Personal reden', onUse: openTip,
    });

    if (ctx.opts.debug) window.__lfxM4 = { ...window.__lfxM4, say: (cat, vars) => speak(cat, vars || {}, { force: true }), tip: openTip };

    let poll = 0;
    let lastX = 0;
    let lastZ = 0;
    let still = 0;
    return {
      update(dt, t) {
        now = t;
        const p = ctx.player.getPose();
        const dx = p.x - cx;
        const dz = p.z - cz;
        const dist = Math.hypot(dx, dz);
        // Kopf: zum Spieler (< 6 m), sonst sanftes Umherschauen
        const idleLook = Math.sin(t * 0.37) * 0.35;
        const target = dist < 6 ? clamp(Math.atan2(-dx, -dz), -1.1, 1.1) : idleLook;
        headYaw += (target - headYaw) * (1 - Math.exp(-5 * dt));
        fig.head.rotation.y = headYaw;
        fig.root.rotation.y = headYaw * 0.3;
        if (!reduced) {
          fig.head.position.y = 1.44 + Math.sin(t * 1.7) * 0.004;
          fig.root.scale.y = 1 + Math.sin(t * 1.7) * 0.005;
        }
        // Arme
        if (waveT >= 0) {
          waveT += dt;
          const u = waveT / WAVE;
          const env = u >= 1 ? 0 : Math.sin(Math.min(1, u * 1.15) * Math.PI) ** 0.4;
          fig.armR.rotation.z = env * (2.5 + Math.sin(waveT * 9) * 0.28);
          if (u >= 1) { waveT = -1; fig.armR.rotation.z = 0; }
        } else if (wipeT >= 0) {
          wipeT += dt;
          const u = wipeT / WIPE;
          const env = u >= 1 ? 0 : Math.sin(u * Math.PI) ** 0.5;
          fig.armR.rotation.x = env * 1.12;
          fig.armR.rotation.y = env * Math.sin(wipeT * 5.5) * 0.5;
          if (u >= 1) { wipeT = -1; fig.armR.rotation.x = 0; fig.armR.rotation.y = 0; }
        } else if (!reduced && t > nextWipe) { wipeT = 0; nextWipe = t + 14 + rand() * 12; }

        if (pendingGreet >= 0) {
          pendingGreet -= dt;
          if (pendingGreet < 0) {
            const h = hourNow();
            const tod = timeOfDay(h);
            speak(greetingCategory(tod, isLate(h)), {}, { force: true });
          }
        }
        if (bubbleLeft > 0) {
          bubbleLeft -= dt;
          if (bubbleLeft <= 0 || ctx.overlay.isOpen()) { bubble.hidden = true; bubbleLeft = 0; } else placeBubble();
        }
        // Lange herumstehen
        poll += dt;
        if (poll > 1) {
          poll = 0;
          if (Math.hypot(p.x - lastX, p.z - lastZ) > 0.3) { still = 0; lastX = p.x; lastZ = p.z; } else still++;
          if (still >= 45) {
            still = 0;
            const r = ctx.catalog.resume && ctx.catalog.resume[0];
            if (r && !resumeSaid) { if (speak('resume', { title: r.Name })) resumeSaid = true; } else speak('idle', {});
          }
        }
      },
      onSuspend() { bubble.hidden = true; bubbleLeft = 0; },
      dispose() {
        offs.forEach((o) => o());
        bubble.remove();
        if (window.__lfxM4) { delete window.__lfxM4.say; delete window.__lfxM4.tip; }
      },
    };
  },
};

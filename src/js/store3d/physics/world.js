// VIDEOTHEK LENZ · Physik-Kern (rein, ohne three, ohne DOM). Kugeln und Quader (Quader = Kreis am Boden + Höhe, ohne echte
// Rotationsdynamik: Gleiten, Rollen und Umkippen sind visuelle Näherungen), Schwerkraft, Kollision mit Höhen-Kollidern
// (eigene Prüfung, nicht resolveCircle3: dort ist STEP_H = 0,35 fest, kleine Körper würden Kanten hochploppen),
// Körper-Körper (Zylinder-Näherung inkl. Stapeln), Reibung, Schlafzustand, Festzeitschritt mit Akkumulator.
// Spieler = kinematischer Zylinder (setPlayer): Laufen schubst Objekte an.
// Mehrspieler (1.16.0): Ereignisse spawn/touch/hold/reset/remove (Netz-Teil net/phys.js hört mit), Flag b.netRemote = fremdgesteuert (wird nicht
// simuliert, sondern von applyRemote/Interpolation bewegt; kein Schlaf, keine Körperpaare, nicht in enforceMax). Ohne Hörer: Verhalten wie 1.15.
import { GRAV, VY_MIN } from '../nav/collide.js';
import { dimsOf } from './kinds.js';

export const DT = 1 / 60;
const MAX_STEPS = 6;
const MAX_SPEED = 16;
const SLEEP_V2 = 0.0225;
const SLEEP_T = 0.35;
const BOUNCE_MIN = 1.0;
const TIP_RATE = 5.2;
const TIP_V = 1.2;
const STEP = 0.2; // Kanten bis 0,2 m überrollen Körper (Bordstein), höhere sperren

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Kollider-Quelle abfragen: Array, Index (query) oder { index, dyn }. cb(q) je Kandidat (kein exakter Test). */
export function queryColliders(src, x0, z0, x1, z1, cb) {
  if (!src) return;
  if (Array.isArray(src)) { for (let i = 0; i < src.length; i++) cb(src[i]); return; }
  const index = typeof src.query === 'function' ? src : src.index;
  if (index) index.query(x0, z0, x1, z1, cb);
  if (src.dyn) for (const q of src.dyn) cb(q);
}

/** Orientierung als Quaternion { x, y, z, w } (rein): Gierwinkel * Kippen um horizontale Achse * Rollen (x, z). */
export function orientationOf(b) {
  const mul = (a, c) => ({
    x: a.w * c.x + a.x * c.w + a.y * c.z - a.z * c.y,
    y: a.w * c.y - a.x * c.z + a.y * c.w + a.z * c.x,
    z: a.w * c.z + a.x * c.y - a.y * c.x + a.z * c.w,
    w: a.w * c.w - a.x * c.x - a.y * c.y - a.z * c.z,
  });
  const axis = (ax, ay, az, ang) => { const s = Math.sin(ang / 2); return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(ang / 2) }; };
  let q = axis(0, 1, 0, b.yaw);
  if (b.tipA) q = b.tipLocal ? mul(q, axis(b.tipAx, 0, b.tipAz, b.tipA)) : mul(axis(b.tipAx, 0, b.tipAz, b.tipA), q);
  if (b.rollX) q = mul(q, axis(1, 0, 0, b.rollX));
  if (b.rollZ) q = mul(q, axis(0, 0, 1, b.rollZ));
  return q;
}

export function createWorld(opts = {}) {
  const gravity = opts.gravity === undefined ? GRAV : opts.gravity;
  let src = opts.src || null;
  let maxActive = opts.maxActive || 40;
  let nextId = 1;
  let acc = 0;
  let time = 0;
  const bodies = [];
  const byId = new Map();
  const listeners = [];
  const player = { on: false, x: 0, z: 0, y: 0, vx: 0, vz: 0, r: 0.28, h: 1.7 };
  const cand = [];

  const emit = (ev) => { for (const fn of listeners) { try { fn(ev); } catch { /* egal */ } } };

  function wake(b, depth = 0) {
    if (!b.sleeping) return;
    b.sleeping = false;
    b.still = 0;
    b.restT = 0;
    if (depth > 6) return;
    // Körper, die auf b stehen, fallen mit
    const top = b.pos.y + b.hy;
    for (const k of bodies) {
      if (!k.sleeping || k === b) continue;
      if (Math.abs(k.pos.y - k.hy - top) > 0.06) continue;
      if (Math.hypot(k.pos.x - b.pos.x, k.pos.z - b.pos.z) > k.r + b.r) continue;
      wake(k, depth + 1);
    }
  }

  function startTip(b, dx, dz) {
    if (!b.tippable || b.tipA > 0) return;
    const l = Math.hypot(dx, dz);
    if (l < 1e-6) return;
    b.tipAx = dz / l; b.tipAz = -dx / l;
    b.tipping = true;
    b.tipA = 0.001;
  }

  function makeBody(spec) {
    const d = dimsOf(spec);
    const b = {
      id: nextId++, kind: spec.kind || 'prop', shape: d.shape, r: d.r, hx: d.hx, hy: d.hy, hz: d.hz, hy0: d.hy, lieHy: d.lieHy,
      mass: d.mass, e: d.e, mu: d.mu, tippable: d.tippable,
      pos: { x: spec.pos ? spec.pos.x : 0, y: spec.pos ? spec.pos.y : 0, z: spec.pos ? spec.pos.z : 0 },
      vel: { x: spec.vel ? spec.vel.x : 0, y: spec.vel ? spec.vel.y : 0, z: spec.vel ? spec.vel.z : 0 },
      spin: Number.isFinite(spec.spin) ? spec.spin : 0, yaw: Number.isFinite(spec.yaw) ? spec.yaw : 0,
      rollX: 0, rollZ: 0, tipLocal: !!spec.tipLocal, tipA: 0, tipAx: 0, tipAz: 0, tipping: false,
      sleeping: false, still: 0, restT: 0, grounded: false, supported: false, held: false, removed: false, age: 0,
      owner: spec.owner || null, ttl: Number.isFinite(spec.ttl) ? spec.ttl : null, onHit: spec.onHit || null, mesh: spec.mesh || null,
      home: null, hitCd: 0, touchCd: 0, netRemote: !!spec.netRemote, tumble: Number.isFinite(spec.tumble) ? spec.tumble : 0, dirty: true, data: spec.data || null,
      impulse(v) { api.impulse(b, v); },
      remove() { api.remove(b); },
    };
    return b;
  }

  function contact(b, ev) {
    if (b.hitCd > 0) return;
    b.hitCd = 0.15;
    emit({ type: 'impact', body: b, ...ev });
    if (b.onHit) { try { b.onHit({ other: ev.other || null, collider: ev.collider || null, player: !!ev.player, speed: ev.speed }); } catch { /* egal */ } }
  }

  /** Berührung durch Spieler/Stoß melden (Mehrspieler: Besitz anfordern), je Körper höchstens alle 0,1 s. */
  function touch(b, by) {
    if (b.touchCd > 0) return;
    b.touchCd = 0.1;
    emit({ type: 'touch', body: b, by });
  }

  // --- Statik ---
  function collideStatic(b, prevBot, prevTop, h) {
    const r = b.r;
    const x = b.pos.x;
    const z = b.pos.z;
    let ground = 0;
    let ceil = Infinity;
    let groundQ = null;
    cand.length = 0;
    queryColliders(src, x - r, z - r, x + r, z + r, (q) => { cand.push(q); });
    const top = b.pos.y + b.hy;
    for (let i = 0; i < cand.length; i++) {
      const q = cand[i];
      const y0 = q.y0 === undefined ? 0 : q.y0;
      const y1 = q.y1 === undefined ? Infinity : q.y1;
      const nx = clamp(x, q.x0, q.x1);
      const nz = clamp(z, q.z0, q.z1);
      const dx = x - nx;
      const dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      // Standfläche: Mitte (fast) über dem Rechteck
      if (Number.isFinite(y1) && q.top !== false && y1 <= prevBot + STEP && d2 <= r * r * 0.25 && y1 > ground) { ground = y1; groundQ = q; }
      // Decke
      if (y0 >= prevTop - 0.04 && y0 < ceil && b.vel.y > 0 && top > y0) ceil = y0;
    }
    if (ceil < Infinity && b.vel.y > 0) {
      b.pos.y = ceil - b.hy;
      const vyc = b.vel.y;
      b.vel.y = -vyc * b.e * 0.5;
      contact(b, { surface: 'ceiling', speed: vyc });
    }
    const bot = b.pos.y - b.hy;
    b.grounded = false;
    if (bot <= ground + 0.0005 && b.vel.y <= 0) {
      const vy = b.vel.y;
      b.pos.y = ground + b.hy;
      if (vy < -BOUNCE_MIN) { b.vel.y = -vy * b.e; contact(b, { surface: 'ground', speed: -vy, collider: groundQ }); } else { b.vel.y = 0; }
      b.grounded = b.vel.y === 0;
    }
    // Horizontale Blocker (nach der vertikalen Auflösung)
    const bot2 = b.pos.y - b.hy;
    const top2 = b.pos.y + b.hy;
    let nxs = 0;
    let nzs = 0;
    for (let pass = 0; pass < 2; pass++) {
      let moved = false;
      for (let i = 0; i < cand.length; i++) {
        const q = cand[i];
        const y0 = q.y0 === undefined ? 0 : q.y0;
        const y1 = q.y1 === undefined ? Infinity : q.y1;
        if (!(y0 < top2 - 0.03 && y1 > bot2 + STEP)) continue;
        const px = b.pos.x;
        const pz = b.pos.z;
        const cx = clamp(px, q.x0, q.x1);
        const cz = clamp(pz, q.z0, q.z1);
        const dx = px - cx;
        const dz = pz - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        let ux; let uz;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          ux = dx / d; uz = dz / d;
          b.pos.x = cx + ux * r; b.pos.z = cz + uz * r;
        } else {
          const l = px - q.x0; const rr = q.x1 - px; const t = pz - q.z0; const bo = q.z1 - pz;
          const m = Math.min(l, rr, t, bo);
          if (m === l) { b.pos.x = q.x0 - r; ux = -1; uz = 0; } else if (m === rr) { b.pos.x = q.x1 + r; ux = 1; uz = 0; } else if (m === t) { b.pos.z = q.z0 - r; ux = 0; uz = -1; } else { b.pos.z = q.z1 + r; ux = 0; uz = 1; }
        }
        nxs += ux; nzs += uz;
        moved = true;
        const vn = b.vel.x * ux + b.vel.z * uz;
        if (vn < 0) {
          const k = 1 + b.e;
          b.vel.x -= k * vn * ux;
          b.vel.z -= k * vn * uz;
          if (-vn > 1.2) contact(b, { surface: 'wall', speed: -vn, collider: q });
        }
      }
      if (!moved) break;
    }
    if (h && (nxs || nzs)) b.spin *= 0.9;
  }

  function integrate(b, h) {
    const sp = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
    if (sp > MAX_SPEED) { const k = MAX_SPEED / sp; b.vel.x *= k; b.vel.y *= k; b.vel.z *= k; }
    const minDim = Math.max(0.06, Math.min(b.r, b.hy) * 0.9);
    const n = clamp(Math.ceil((Math.min(sp, MAX_SPEED) * h) / minDim), 1, 4);
    const hh = h / n;
    for (let s = 0; s < n; s++) {
      b.vel.y = Math.max(VY_MIN, b.vel.y - gravity * hh);
      const prevBot = b.pos.y - b.hy;
      const prevTop = b.pos.y + b.hy;
      b.pos.x += b.vel.x * hh;
      b.pos.y += b.vel.y * hh;
      b.pos.z += b.vel.z * hh;
      collideStatic(b, prevBot, prevTop, hh);
    }
    // Unter die Welt gefallen
    if (b.pos.y < -30) { b.vel.x = b.vel.y = b.vel.z = 0; if (b.home) api.reset(b); else api.remove(b); }
  }

  function visuals(b, h) {
    if (b.shape === 'sphere') {
      // Rollen: Winkelgeschwindigkeit = v / r
      b.rollX += (b.vel.z / b.r) * h;
      b.rollZ -= (b.vel.x / b.r) * h;
    } else {
      b.yaw += b.spin * h;
      if (b.grounded) b.spin *= Math.exp(-4 * h);
      if (b.tumble) { if (b.grounded) b.tumble = 0; else b.rollX += b.tumble * h; } // Purzeln im Flug (geworfene Hülle)
      if (b.grounded && b.rollX) b.rollX *= Math.exp(-14 * h);
    }
    if (b.tipping) {
      b.tipA = Math.min(Math.PI / 2, b.tipA + TIP_RATE * h);
      b.hy = b.hy0 + (b.lieHy - b.hy0) * (b.tipA / (Math.PI / 2));
      if (b.tipA >= Math.PI / 2) b.tipping = false;
    }
  }

  function bodyPairs() {
    const n = bodies.length;
    for (let i = 0; i < n; i++) {
      const a = bodies[i];
      if (a.held || a.sleeping || a.netRemote) continue;
      for (let j = 0; j < n; j++) {
        const c = bodies[j];
        if (i === j || c.held || c.netRemote) continue;
        if (!c.sleeping && c.id < a.id) continue; // beide wach: Paar nur einmal
        const dx = c.pos.x - a.pos.x;
        const dz = c.pos.z - a.pos.z;
        const rs = a.r + c.r;
        if (dx > rs || dx < -rs || dz > rs || dz < -rs) continue;
        const dist = Math.hypot(dx, dz);
        if (dist >= rs) continue;
        const dy = c.pos.y - a.pos.y;
        const vs = a.hy + c.hy - Math.abs(dy);
        if (vs <= 0) continue;
        const hp = rs - dist;
        if (vs < hp * 0.9 && Math.abs(dy) > 0.02) {
          // vertikal: der obere liegt auf
          const up = dy > 0 ? c : a;
          const lo = dy > 0 ? a : c;
          if (!up.sleeping) { up.pos.y += vs; if (up.vel.y < 0) { const vy = up.vel.y; up.vel.y = -vy > BOUNCE_MIN ? -vy * 0.2 : 0; if (-vy > 1.5) contact(up, { surface: 'body', speed: -vy, other: lo }); } up.supported = true; }
          else if (!lo.sleeping) { lo.pos.y -= vs * 0.5; }
          if (lo.sleeping && !up.sleeping) { /* Auflager schläft: bleibt */ }
          continue;
        }
        let nx; let nz;
        if (dist > 1e-6) { nx = dx / dist; nz = dz / dist; } else { nx = 1; nz = 0; }
        if (c.sleeping) wake(c);
        const ma = a.mass;
        const mc = c.mass;
        const inv = 1 / ma + 1 / mc;
        const vn = (c.vel.x - a.vel.x) * nx + (c.vel.z - a.vel.z) * nz;
        const sep = hp / inv;
        a.pos.x -= (nx * sep) / ma; a.pos.z -= (nz * sep) / ma;
        c.pos.x += (nx * sep) / mc; c.pos.z += (nz * sep) / mc;
        if (vn < 0) {
          const e = Math.min(a.e, c.e);
          const jimp = (-(1 + e) * vn) / inv;
          a.vel.x -= (jimp * nx) / ma; a.vel.z -= (jimp * nz) / ma;
          c.vel.x += (jimp * nx) / mc; c.vel.z += (jimp * nz) / mc;
          if (-vn > 1.0) {
            contact(a, { surface: 'body', speed: -vn, other: c });
            contact(c, { surface: 'body', speed: -vn, other: a });
            if (-vn > TIP_V) { startTip(c, nx, nz); startTip(a, -nx, -nz); }
            if (c.spin === 0 || Math.abs(c.spin) < 1) c.spin += (nx * 0.3 - nz * 0.3) * -vn * 2;
          }
        }
      }
    }
  }

  function playerPush() {
    if (!player.on) return;
    const pTop = player.y + player.h;
    for (const b of bodies) {
      if (b.held) continue;
      if (b.pos.y + b.hy < player.y + 0.05 || b.pos.y - b.hy > pTop) continue;
      const dx = b.pos.x - player.x;
      const dz = b.pos.z - player.z;
      const rs = b.r + player.r;
      if (dx > rs || dx < -rs || dz > rs || dz < -rs) continue;
      const dist = Math.hypot(dx, dz);
      if (dist >= rs) continue;
      let nx; let nz;
      if (dist > 1e-6) { nx = dx / dist; nz = dz / dist; } else { const sp = Math.hypot(player.vx, player.vz); nx = sp > 1e-3 ? player.vx / sp : 1; nz = sp > 1e-3 ? player.vz / sp : 0; }
      const along = player.vx * nx + player.vz * nz;
      const rel = b.vel.x * nx + b.vel.z * nz;
      if (along < 0.05 && rel >= along) { // Spieler läuft nicht hinein: nur herausschieben
        if (b.sleeping && !b.netRemote) { b.pos.x = player.x + nx * rs; b.pos.z = player.z + nz * rs; }
        continue;
      }
      if (b.netRemote) { touch(b, 'player'); if (b.netRemote) continue; } // Anspruch stellen; bleibt er fremd, bewegt ihn nur sein Besitzer
      wake(b);
      const k = 1 / (1 + b.mass * 0.25);
      const want = along * 1.1 + 0.4;
      if (rel < want) { b.vel.x += nx * (want - rel) * k; b.vel.z += nz * (want - rel) * k; }
      b.pos.x = player.x + nx * rs; b.pos.z = player.z + nz * rs;
      if (along > TIP_V) startTip(b, nx, nz);
      if (along > 2.5 && b.owner !== 'player') contact(b, { surface: 'player', speed: along, player: true });
      touch(b, 'player');
    }
  }

  function enforceMax() {
    let awake = 0;
    for (const b of bodies) if (!b.sleeping && !b.held && !b.netRemote) awake++;
    if (awake <= maxActive) return;
    const rest = bodies.filter((b) => !b.sleeping && !b.held && !b.netRemote && (b.grounded || b.supported)).sort((p, q) => (p.vel.x ** 2 + p.vel.z ** 2) - (q.vel.x ** 2 + q.vel.z ** 2));
    for (const b of rest) {
      if (awake <= maxActive) break;
      b.sleeping = true; b.vel.x = b.vel.y = b.vel.z = 0; b.spin = 0; awake--;
    }
  }

  function fixed(h) {
    time += h;
    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i];
      if (b.held) continue;
      if (b.hitCd > 0) b.hitCd -= h;
      if (b.touchCd > 0) b.touchCd -= h;
      b.age += h;
      if (b.ttl !== null) { b.ttl -= h; if (b.ttl <= 0) { api.remove(b); continue; } }
      if (b.netRemote) { // fremdgesteuert: nur Rollen der Kugel aus der übernommenen Geschwindigkeit
        if (!b.sleeping && b.shape === 'sphere') { b.rollX += (b.vel.z / b.r) * h; b.rollZ -= (b.vel.x / b.r) * h; b.dirty = true; }
        continue;
      }
      if (b.sleeping) { b.restT += h; continue; }
      b.supported = false;
      integrate(b, h);
      visuals(b, h);
      b.dirty = true;
    }
    bodyPairs();
    playerPush();
    for (const b of bodies) {
      if (b.sleeping || b.held || b.netRemote) continue;
      if (b.grounded || b.supported) {
        const f = Math.exp(-b.mu * h);
        b.vel.x *= f; b.vel.z *= f;
        if (b.vel.x * b.vel.x + b.vel.z * b.vel.z + b.vel.y * b.vel.y < SLEEP_V2 && !b.tipping) {
          b.still += h;
          if (b.still > SLEEP_T) { b.sleeping = true; b.restT = 0; b.vel.x = b.vel.y = b.vel.z = 0; b.spin = 0; b.dirty = true; }
        } else b.still = 0;
      } else b.still = 0;
    }
    enforceMax();
  }

  const api = {
    DT,
    bodies,
    get time() { return time; },
    get maxActive() { return maxActive; },
    setMaxActive(n) { maxActive = Math.max(1, n | 0); },
    setSource(s) { src = s; },
    on(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
    spawn(spec) {
      const b = makeBody(spec || {});
      if (spec && spec.sleeping) b.sleeping = true;
      bodies.push(b);
      byId.set(b.id, b);
      emit({ type: 'spawn', body: b });
      return b;
    },
    remove(b) {
      if (!b || b.removed) return;
      b.removed = true;
      const i = bodies.indexOf(b);
      if (i >= 0) bodies.splice(i, 1);
      byId.delete(b.id);
      emit({ type: 'remove', body: b });
    },
    get(id) { return byId.get(id) || null; },
    count() { return bodies.length; },
    awakeCount() { let n = 0; for (const b of bodies) if (!b.sleeping && !b.held && !b.netRemote) n++; return n; },
    wake(b) { wake(b); },
    /** Geschwindigkeitsänderung v = {x,y,z} (m/s); weckt Körper und Auflieger, kippt tippable bei starkem Stoß. */
    impulse(b, v) {
      if (!b || b.removed) return;
      emit({ type: 'touch', body: b, by: 'impulse' }); // vor der Wirkung: ein Anspruch kann den Körper erst lokal simulierbar machen
      wake(b);
      b.vel.x += v.x || 0; b.vel.y += v.y || 0; b.vel.z += v.z || 0;
      b.grounded = false;
      b.dirty = true;
      if (Math.hypot(v.x || 0, v.z || 0) > TIP_V) startTip(b, v.x || 0, v.z || 0);
    },
    /** Körper in Richtung (dx, dz) umkippen lassen (auch für sonst nicht tippable Arten, z. B. gelandete Hülle). */
    tip(b, dx, dz) { b.tippable = true; startTip(b, dx, dz); },
    /** Körper festhalten (aufgehoben): aus der Simulation nehmen / wieder freigeben. */
    setHeld(b, on) { b.held = !!on; if (on) { b.vel.x = b.vel.y = b.vel.z = 0; b.sleeping = false; } else { wake(b); b.still = 0; } b.dirty = true; emit({ type: 'hold', body: b, on: !!on }); },
    setHome(b, x, y, z, yaw = 0) { b.home = { x, y, z, yaw }; },
    /** Zurück an den Platz (schlafend, aufgerichtet). */
    reset(b) {
      if (!b.home) return false;
      b.pos.x = b.home.x; b.pos.y = b.home.y; b.pos.z = b.home.z; b.yaw = b.home.yaw || 0;
      b.vel.x = b.vel.y = b.vel.z = 0; b.spin = 0; b.rollX = b.rollZ = 0;
      b.tipA = 0; b.tipping = false; b.hy = b.hy0; b.sleeping = true; b.still = 0; b.restT = 0; b.dirty = true;
      emit({ type: 'reset', body: b });
      return true;
    },
    setPlayer(p) {
      if (!p) { player.on = false; return; }
      player.on = true; player.x = p.x; player.z = p.z; player.y = p.y || 0; player.vx = p.vx || 0; player.vz = p.vz || 0;
      if (p.r) player.r = p.r;
      if (p.h) player.h = p.h;
    },
    /** Zeit voranschreiten (Akkumulator, Festzeitschritt 1/60). Rückgabe: Zahl der Schritte. */
    step(dt) {
      acc += clamp(dt, 0, 0.1);
      let n = 0;
      while (acc >= DT && n < MAX_STEPS) { fixed(DT); acc -= DT; n++; }
      if (n === MAX_STEPS) acc = 0;
      return n;
    },
    bodiesNear(x, z, r) {
      const out = [];
      for (const b of bodies) if (!b.held && Math.hypot(b.pos.x - x, b.pos.z - z) <= r + b.r) out.push(b);
      return out;
    },
    /** Strahl/Kegel gegen Körper-Hüllkugeln: { body, dist } | null. coneDeg 0 = Strahl. */
    hitTest(origin, dir, range, coneDeg = 0) {
      const l = Math.hypot(dir.x, dir.y, dir.z) || 1;
      const dx = dir.x / l; const dy = dir.y / l; const dz = dir.z / l;
      const tan = Math.tan((coneDeg * Math.PI) / 180);
      let best = null;
      for (const b of bodies) {
        if (b.held) continue;
        const rb = Math.max(b.r, b.hy);
        const vx = b.pos.x - origin.x; const vy = b.pos.y - origin.y; const vz = b.pos.z - origin.z;
        const t = vx * dx + vy * dy + vz * dz;
        if (t < -rb || t > range + rb) continue;
        const perp2 = vx * vx + vy * vy + vz * vz - t * t;
        const lim = rb + Math.max(0, t) * tan;
        if (perp2 > lim * lim) continue;
        const dist = Math.max(0, t - rb);
        if (!best || dist < best.dist) best = { body: b, dist };
      }
      return best;
    },
    /** Kompakter Netzzustand (1.16.0): Liste von Einträgen { i, k, p, v, y, t, s }; nur wache bzw. veränderte, alle bei all = true. */
    snapshot(all = false) {
      const out = [];
      for (const b of bodies) {
        if (b.held || (!all && b.sleeping && !b.dirty)) continue;
        out.push(bodyNet(b));
      }
      return out;
    },
    /** Fremdzustand übernehmen (nur bekannte ids; Spawnen ist Sache der Gegenstelle). Rückgabe: Anzahl übernommener Einträge. */
    applyRemote(list) {
      let n = 0;
      for (const e of list || []) {
        const b = byId.get(e.i);
        if (!b) continue;
        b.pos.x = e.p[0]; b.pos.y = e.p[1]; b.pos.z = e.p[2];
        b.vel.x = e.v[0]; b.vel.y = e.v[1]; b.vel.z = e.v[2];
        b.yaw = e.y || 0;
        b.tipA = e.t || 0;
        b.tipping = false;
        if (b.tipA) { b.tipAx = e.ax || 0; b.tipAz = e.az || 0; b.hy = b.hy0 + (b.lieHy - b.hy0) * Math.min(1, b.tipA / (Math.PI / 2)); } else b.hy = b.hy0;
        b.sleeping = !!e.s;
        b.dirty = true;
        n++;
      }
      return n;
    },
    /** Fremdgesteuert (true) bzw. wieder lokal simuliert (false; die Simulation macht vom letzten Stand an weiter). */
    setRemote(b, on) {
      if (!b || b.removed || !!b.netRemote === !!on) return;
      b.netRemote = !!on;
      b.dirty = true;
      if (!on) { b.still = 0; b.restT = 0; if (!b.sleeping) b.grounded = false; }
    },
    dispose() { bodies.length = 0; byId.clear(); listeners.length = 0; },
  };
  return api;
}

const r2 = (v) => Math.round(v * 100) / 100;
/** Ein Körper als Netzeintrag (JSON-tauglich, auf cm/mm-Genauigkeit gerundet). */
function bodyNet(b) {
  const e = { i: b.id, k: b.kind, p: [r2(b.pos.x), r2(b.pos.y), r2(b.pos.z)], v: [r2(b.vel.x), r2(b.vel.y), r2(b.vel.z)], y: r2(b.yaw), t: r2(b.tipA), s: b.sleeping ? 1 : 0 };
  if (b.tipA) { e.ax = r2(b.tipAx); e.az = r2(b.tipAz); }
  return e;
}

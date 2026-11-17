// VIDEOTHEK LENZ · Mehrspieler-Harness: Bots. Verbinden sich über world.connect() mit dem echten Reducer (kein Ticket, keine Sockets),
// schicken hi und dann Posen im Netzrahmen (cm, kanonisch 12,5 × 18) mit ≤ 8 Hz, nur bei Änderung, kein Heartbeat (alle 25 s ein 'ping').
//   createBots(world, { n, seed }) → { list, stats() → { n, live, maxFps, totalFps, perBot[{ name, route, fps, sent, live }] }, tick(nowMs), dispose() }
// Routen: Straße, Laden, Tür (Laden ↔ Straße), Palast-Saal sitzend, Palast-Foyer (Eingang ↔ Foyer). Die Zuordnung r (0 Laden, 1 Palast, 2 draußen) folgt dem Netzrahmen.
import { build, F, NET_A, SUB } from '../../src/js/store3d/net/proto.js';

const TICK_MS = 125; // 8 Hz
const D = 1800; // Ladentiefe kanonisch (cm)
const SZ = 2870; // Palast-Vorderkante (cm)

const rOf = (x, z) => (z >= SZ && x >= -375 && x <= 1625 ? 1 : z > D ? 2 : 0);

/** Routen als Wegpunkte (x, z in cm) mit Tempo (cm/s); `loop` = Rundkurs, sonst Hin und zurück; `sit` = sitzend an Platz [Reihe, Anteil]. */
export const ROUTES = [
  { id: 'street', speed: 140, pause: [1500, 4000], pts: [[-900, 1950], [700, 1950], [2000, 1950], [2000, 2150], [700, 2150], [-900, 2150]], loop: true },
  { id: 'shop', speed: 120, pause: [1000, 3000], pts: [[220, 300], [1000, 300], [1000, 1500], [220, 1500]], loop: true },
  { id: 'door', speed: 130, pause: [2000, 5000], pts: [[625, 1500], [625, 2050]], loop: false },
  { id: 'hall', sit: [2, 500], pts: [[625, 3900]] },
  { id: 'foyer', speed: 120, pause: [1500, 3500], pts: [[625, 2650], [625, 3150]], loop: false },
];
const NAMES = ['Anna', 'Ben', 'Cleo', 'Dario', 'Emil', 'Fiona', 'Gustav', 'Hanna', 'Ilja', 'Jule', 'Kai', 'Lena', 'Milan', 'Nora', 'Otto'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const frame = (msgs) => JSON.stringify(msgs.filter(Boolean));
const cRad = (yaw) => Math.max(-314, Math.min(314, Math.round(yaw * 100)));

export function createBots(world, { n = 0, seed = 1 } = {}) {
  const rnd = mulberry32(seed * 7919 + 13);
  const t0 = world.now();
  const bots = [];
  let disposed = false;

  function spawn(i) {
    const route = ROUTES[i % ROUTES.length];
    const name = NAMES[i % NAMES.length] + (i >= NAMES.length ? ' ' + (Math.floor(i / NAMES.length) + 1) : '');
    const b = {
      i, name, route, wp: route.sit ? 0 : (i * 3) % route.pts.length, dir: 1,
      x: route.pts[0][0], z: route.pts[0][1], yaw: 0, a: NET_A.STAND,
      pauseUntil: 0, lastTick: 0, lastSent: null, lastPing: 0, sent: 0, win: [], conn: null, started: false,
    };
    const w = route.pts[b.wp];
    b.x = w[0];
    b.z = w[1];
    b.pauseUntil = t0 + Math.floor(rnd() * 1500);
    return b;
  }

  function connect(b) {
    const t = world.now();
    const claims = { k: botKey(b.i, seed), n: 'Bot ' + b.name, a: 0, e: t + 3600000, j: `bot${b.i}-${t}` };
    b.conn = world.connect(claims, { onMessage: () => {}, onClose: () => { b.conn = null; b.started = false; } });
    if (!b.conn) return;
    b.started = true;
    b.lastTick = t;
    b.lastPing = t;
    b.lastSent = null;
    send(b, [build.hi({ cap: ['pres'], f: F.NAME, cv: 'bot' })]);
  }

  function send(b, msgs) {
    if (!b.conn) return;
    const txt = frame(msgs);
    if (txt === '[]') return;
    b.conn.send(txt);
    b.sent++;
    b.win.push(world.now());
  }

  function pose(b) {
    const sit = b.route.sit;
    const r = sit ? 1 : rOf(b.x, b.z);
    const q = [Math.round(b.x), 0, Math.round(b.z), cRad(b.yaw), 0, b.a, r];
    const key = q.join(',');
    if (key === b.lastSent) return null;
    // Positionsschwelle wie der echte Client (> 2 cm), a/r/Yaw-Wechsel immer
    b.lastSent = key;
    return sit ? build.p(q, sit) : build.p(q);
  }

  function tickBot(b, t) {
    if (!b.conn || !b.started) return;
    if (t - b.lastTick < TICK_MS) return;
    const dt = Math.min(500, t - b.lastTick) / 1000;
    b.lastTick = t;
    if (t - b.lastPing >= 25000) {
      b.lastPing = t;
      b.conn.send('ping');
    }
    const route = b.route;
    if (route.sit) {
      b.a = NET_A.SIT;
      b.yaw = Math.PI; // zur Leinwand (Norden = -z ist yaw 0; Saal-Leinwand liegt hinten) – nur Optik
      const m = pose(b);
      if (m) send(b, [m]);
      return;
    }
    if (t < b.pauseUntil) {
      if (b.a !== NET_A.STAND) {
        b.a = NET_A.STAND;
        const m = pose(b);
        if (m) send(b, [m]);
      }
      return;
    }
    const target = route.pts[b.wp];
    const dx = target[0] - b.x;
    const dz = target[1] - b.z;
    const dist = Math.hypot(dx, dz);
    const stepLen = route.speed * dt;
    if (dist <= stepLen) {
      b.x = target[0];
      b.z = target[1];
      if (route.loop) b.wp = (b.wp + 1) % route.pts.length;
      else {
        if (b.wp + b.dir >= route.pts.length || b.wp + b.dir < 0) b.dir = -b.dir;
        b.wp += b.dir;
      }
      b.a = NET_A.STAND;
      b.pauseUntil = t + route.pause[0] + rnd() * (route.pause[1] - route.pause[0]);
    } else {
      b.x += (dx / dist) * stepLen;
      b.z += (dz / dist) * stepLen;
      b.yaw = Math.atan2(-dx, -dz);
      b.a = route.speed > 200 ? NET_A.RUN : NET_A.WALK;
    }
    const m = pose(b);
    if (m) send(b, [m]);
  }

  function fps(b, t) {
    while (b.win.length && t - b.win[0] > 1000) b.win.shift();
    return b.win.length;
  }

  const api = {
    list: bots,
    sub: SUB,
    tick(t) {
      if (disposed) return;
      for (const b of bots) {
        if (!b.started && !b.conn && t >= (b.nextTry || 0)) {
          b.nextTry = t + 5000;
          connect(b);
        }
        tickBot(b, t);
      }
    },
    stats() {
      const t = world.now();
      const perBot = bots.map((b) => ({ name: b.name, route: b.route.id, fps: fps(b, t), sent: b.sent, live: !!b.conn }));
      return { n: bots.length, live: perBot.filter((p) => p.live).length, maxFps: Math.max(0, ...perBot.map((p) => p.fps)), totalFps: perBot.reduce((s, p) => s + p.fps, 0), perBot };
    },
    dispose() {
      disposed = true;
      for (const b of bots) {
        if (b.conn) b.conn.close();
        b.conn = null;
      }
      bots.length = 0;
    },
  };
  for (let i = 0; i < n; i++) bots.push(spawn(i));
  return api;
}

function botKey(i, seed) {
  const h = (Math.imul((i + 1) * 2654435761 >>> 0, 40503) ^ (seed * 97)) >>> 0;
  return (h.toString(16).padStart(8, '0') + (Math.imul(h, 2246822519) >>> 0).toString(16).padStart(8, '0')).slice(0, 12);
}

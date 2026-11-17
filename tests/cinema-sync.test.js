import { describe, it, expect } from 'vitest';
import { createSync, expectedPos, rejoinPlan, SYNC } from '../src/js/store3d/cinema/sync.js';

// Fake-Uhr + Fake-Player: advance() läuft in 50-ms-Schritten, tick() alle 250 ms.
function rig(opt = {}) {
  const R = { now: 1_000_000, out: [], ev: [], calls: [], jumps: 0 };
  const P = { pos: 0, paused: false, ready: 4, seeking: false, rate: 1, until: 0, land: 0, stallUntil: 0, hidden: false, ended: false };
  const cfg = { lag: 0, res: 0, exactSeek: true, reportExact: true, reportRes: true, mode: 'direct', rateReset: false, hasRate: true, ...opt };
  R.P = P; R.cfg = cfg;
  const adapter = {
    setPaused(on) { R.calls.push(['pause', on]); P.paused = on; },
    seekTo(ms, o) {
      R.calls.push(['seek', ms, !!(o && o.exact)]);
      let land = ms + (cfg.landErr || 0);
      if (!(cfg.exactSeek && o && o.exact) && cfg.res > 0) land = Math.floor(ms / cfg.res) * cfg.res;
      // lagFirst: Latenz des ersten Sprungs (Player startet gerade), lagNext: aller folgenden (z. B. gepufferter Bereich)
      const lg = R.jumps++ === 0 && cfg.lagFirst != null ? cfg.lagFirst : cfg.lagNext != null ? cfg.lagNext : cfg.lag;
      P.land = land; P.seeking = true; P.ready = 0; P.until = R.now + lg;
    },
    state() { return { paused: P.paused, t: P.pos, ready: P.ready, seeking: P.seeking, rate: P.rate, hidden: P.hidden, ended: P.ended }; },
    mode: () => cfg.mode,
    exact: () => (cfg.reportExact ? cfg.exactSeek : true),
    res: () => (cfg.reportRes ? cfg.res : 0),
  };
  if (cfg.hasRate) adapter.setRate = (r) => { R.calls.push(['rate', r]); P.rate = r; if (cfg.rateReset) P.rate = 1; };
  else delete adapter.setRate;
  R.adapter = adapter;
  R.sync = createSync({ serverNow: () => R.now, adapter, send: (m) => { R.out.push(m); return true; }, emit: (e) => R.ev.push(e), host: !!opt.host, self: opt.self ?? 7, itemId: opt.itemId, cfg: opt.syncCfg });
  R.step = (dt) => {
    R.now += dt;
    if (P.seeking && R.now >= P.until) { P.seeking = false; P.ready = 4; P.pos = P.land; }
    if (R.now < P.stallUntil) P.ready = 2;
    else if (!P.seeking && P.ready < 3 && !(R.now < P.stallUntil)) P.ready = 4;
    if (!P.paused && P.ready >= 3 && !P.seeking) P.pos += dt * P.rate * (cfg.speed || 1);
  };
  R.advance = (ms, tick = true) => {
    for (let t = 0; t < ms; t += 50) {
      R.step(50);
      if (tick && (R.now % 250 === 0)) R.sync.tick();
    }
  };
  R.kx = (o) => R.sync.onKx({ sid: 's1', v: 1, st: 1, p: 0, at: R.now, m: [7, 8], lg: [], ...o });
  R.of = (t) => R.out.filter((m) => m.t === t);
  R.d = () => P.pos - expectedPos(R.sync.status().st === 1 ? { st: 1, p: R._p, at: R._at } : { st: 2, p: R._p }, R.now);
  // R.now so wählen, dass es ein Vielfaches von 250 ist
  R.now = Math.ceil(R.now / 250) * 250;
  return R;
}

// Mitschauer, der bei erw=60 s einsteigt und eingeschwungen ist
function joined(opt = {}) {
  const R = rig({ lag: 500, ...opt });
  R.kx({ v: 1, st: 1, p: 60000, at: R.now });
  R._p = 60000; R._at = R.now;
  R.sync.begin();
  R.advance(4000);
  return R;
}
const erw = (R) => 60000 + (R.now - R._at);

describe('expectedPos / rejoinPlan', () => {
  it('läuft ab at, steht bei Pause', () => {
    expect(expectedPos({ st: 1, p: 1000, at: 5000 }, 7500)).toBe(3500);
    expect(expectedPos({ st: 1, p: 1000, at: 5000, rate: 2 }, 7500)).toBe(6000);
    expect(expectedPos({ st: 2, p: 1000, at: 5000 }, 7500)).toBe(1000);
    expect(expectedPos({ st: 0, p: 1000, at: 5000 }, 7500)).toBe(1000);
    expect(expectedPos(null, 1)).toBe(0);
  });
  it('Wiederbeitritt', () => {
    expect(rejoinPlan({ kh: [['a', 1]], sid: 'a' })).toBe('kj');
    expect(rejoinPlan({ kh: [], sid: 'a', wasHost: true })).toBe('ks');
    expect(rejoinPlan({ kh: [], sid: 'a', alone: true })).toBe('ks');
    expect(rejoinPlan({ kh: [], sid: 'a' })).toBe('solo');
  });
});

describe('Mitschauen: erster Abgleich', () => {
  it('st=1: weiterspielen und exakt auf erw+Vorhalt springen, danach synchron', () => {
    const R = rig({ lag: 500 });
    R.kx({ st: 1, p: 60000, at: R.now });
    R.sync.begin();
    expect(R.calls[0]).toEqual(['pause', false]);
    expect(R.calls[1]).toEqual(['seek', 60000 + SYNC.LEAD_DIRECT_MS, true]);
    R._p = 60000; R._at = R.now;
    R.advance(6000);
    expect(R.sync.status().phase).toBe('synced');
    expect(Math.abs(R.P.pos - erw(R))).toBeLessThan(400);
    expect(R.ev.some((e) => e.type === 'synced')).toBe(true);
  });
  it('st=2: pausieren und auf p springen', () => {
    const R = rig({ lag: 100 });
    R.kx({ st: 2, p: 90000 });
    R.sync.begin();
    expect(R.calls).toContainEqual(['pause', true]);
    expect(R.calls).toContainEqual(['seek', 90000, true]);
    R.advance(4000);
    expect(R.P.paused).toBe(true);
    expect(R.sync.status().phase).toBe('synced');
  });
  it('kein kb 1 vor synced, auch bei Stocken', () => {
    const R = rig({ lag: 500 });
    R.kx({ st: 1, p: 60000, at: R.now });
    R.sync.begin();
    R.P.stallUntil = R.now + 30000;
    R.advance(10000);
    expect(R.of('kb')).toHaveLength(0);
    expect(R.sync.status().phase).toBe('joining');
  });
  it('Stocken direkt nach dem Einstieg: kein kb 1, danach holt der Mitschauer per Sprung auf', () => {
    const R = rig({ lag: 50 });
    R.kx({ st: 1, p: 60000, at: R.now });
    R._p = 60000; R._at = R.now;
    R.sync.begin();
    R.P.stallUntil = R.now + 14000;
    R.advance(1500);
    expect(R.sync.status().phase).toBe('joining');
    R.advance(8000);
    expect(R.of('kb').filter((m) => m.b === 1)).toHaveLength(0);
    R.advance(30000);
    expect(R.sync.status().phase).not.toBe('offset');
    expect(Math.abs(R.P.pos - erw(R))).toBeLessThan(500);
  });
  it('Stocken nach synced: kb 1, danach Aufholsprung trotz Sprung-Cooldown', () => {
    const R = joined({ lag: 50 });
    R.advance(6000);
    expect(R.sync.status().phase).toBe('synced');
    R.P.stallUntil = R.now + 14000;
    R.advance(20000);
    expect(R.of('kb').filter((m) => m.b === 1).length).toBeGreaterThanOrEqual(1);
    expect(Math.abs(R.P.pos - erw(R))).toBeLessThan(500);
  });
  it('Schonzeit lg endet nach 60 s auch ohne neues kx: danach kb 1 beim Stocken', () => {
    const R = rig({ lag: 50 });
    R.kx({ st: 1, p: 60000, at: R.now, lg: [7] });
    R._p = 60000; R._at = R.now;
    R.sync.begin();
    R.advance(30000);
    R.P.stallUntil = R.now + 5000;
    R.advance(5000);
    expect(R.of('kb').filter((m) => m.b === 1)).toHaveLength(0);
    R.advance(40000);
    R.P.stallUntil = R.now + 5000;
    R.advance(5000);
    expect(R.of('kb').filter((m) => m.b === 1)).toHaveLength(1);
  });
  it('Gastgeber-kx vor begin() wird gemerkt, begin() gleicht dann ab', () => {
    const R = rig({ lag: 0 });
    R.kx({ st: 2, p: 5000 });
    expect(R.calls).toHaveLength(0);
    R.sync.begin();
    expect(R.calls).toContainEqual(['seek', 5000, true]);
  });
});

describe('Drift-Korrektur', () => {
  it('klein (< Totband): nichts', () => {
    const R = joined();
    const n = R.calls.length;
    R.P.pos -= 150;
    R.advance(10000);
    expect(R.calls.length).toBe(n);
  });
  it('1 s hinten: Rate > 1, danach wieder 1, kein Sprung', () => {
    const R = joined();
    const seeks = R.sync.diag().seeks;
    R.P.pos -= 1000;
    R.advance(1000);
    const rates = R.calls.filter((c) => c[0] === 'rate');
    expect(rates.length).toBeGreaterThan(0);
    expect(rates[0][1]).toBeGreaterThan(1);
    R.advance(25000);
    expect(Math.abs(R.P.pos - erw(R))).toBeLessThan(300);
    expect(R.P.rate).toBe(1);
    expect(R.sync.diag().seeks).toBe(seeks);
  });
  it('Landefehler weitet nur das Sprungband: die Rate zieht trotzdem unter das feste Totband (live HLS: −0,98 s blieb stehen)', () => {
    const R = joined({ landErr: -900 }); // jeder Sprung landet 0,9 s zu früh (z. B. HLS)
    R.advance(4000); // Landemessung nach Einstieg und Nachsprung
    expect(R.sync.diag().land).toBeGreaterThan(500);
    const seeks = R.sync.diag().seeks;
    R.advance(25000);
    expect(Math.abs(R.P.pos - erw(R))).toBeLessThan(300);
    expect(R.sync.diag().seeks).toBe(seeks); // kein Sprungzyklus
    expect(R.P.rate).toBe(1);
  });
  it('vorn: Rate < 1', () => {
    const R = joined();
    R.P.pos += 1000;
    R.advance(1000);
    expect(R.calls.filter((c) => c[0] === 'rate').pop()[1]).toBeLessThan(1);
  });
  it('> 2 s: Sprung mit Vorhalt, nur einmal (Abklingzeit)', () => {
    const R = joined();
    const seeks = R.sync.diag().seeks;
    R.advance(3000); // Abklingzeit nach dem Einstiegssprung abwarten
    R.P.pos -= 5000;
    R.advance(5000);
    expect(R.sync.diag().seeks).toBe(seeks + 1);
    R.advance(10000);
    expect(R.sync.diag().seeks).toBe(seeks + 1);
    expect(Math.abs(R.P.pos - erw(R))).toBeLessThan(600);
  });
  it('Ratenprobe: setzt der Player die Rate zurück, wird sie abgeschaltet und per Sprung korrigiert', () => {
    const R = joined({ rateReset: true });
    R.advance(3000);
    R.P.pos -= 1000;
    R.advance(12000);
    expect(R.sync.diag().rateOk).toBe(false);
    expect(Math.abs(R.P.pos - erw(R))).toBeLessThan(600);
  });
  it('ohne setRate: Mikro-Sprung im Ratenband', () => {
    const R = joined({ hasRate: false });
    R.advance(3000);
    const seeks = R.sync.diag().seeks;
    R.P.pos -= 1000;
    R.advance(5000);
    expect(R.sync.diag().seeks).toBe(seeks + 1);
  });
  it('Modus other: kein Abgleich, Hinweis', () => {
    const R = rig({ lag: 0, mode: 'other' });
    R.kx({ st: 1, p: 60000, at: R.now });
    R._p = 60000; R._at = R.now;
    R.sync.begin();
    R.advance(2000);
    const n = R.calls.length;
    R.P.pos += 10000;
    R.advance(30000, true);
    expect(R.calls.length).toBe(n);
    expect(R.ev.some((e) => e.type === 'unsynced')).toBe(true);
  });
  it('Pausierte Sitzung: Position wird nachgezogen', () => {
    const R = rig({ lag: 100 });
    R.kx({ st: 2, p: 90000 });
    R.sync.begin();
    R.advance(4000);
    R.P.pos = 80000;
    R.advance(1000, false);
    R.advance(8000);
    expect(Math.abs(R.P.pos - 90000)).toBeLessThan(400);
  });
});

describe('Sprungdeckel und grobe Slider', () => {
  it('Slider-Raster 0,1 % von 2 h (7,2 s) ohne exakten Sprung: eingeschwungen, keine Sprungzyklen', () => {
    const R = rig({ lag: 300, exactSeek: false, res: 7200 });
    R.kx({ st: 1, p: 3_601_234, at: R.now });
    R._at = R.now; R._p = 3_601_234;
    R.sync.begin();
    R.advance(60000);
    expect(R.sync.diag().seeks).toBeLessThanOrEqual(1 + SYNC.SEEK_CAP);
    const seeks = R.sync.diag().seeks;
    R.advance(240000);
    expect(R.sync.diag().seeks).toBe(seeks);
    const e = R.sync.status();
    expect(e.phase).toBe('synced');
    const exp = 3_601_234 + (R.now - R._at);
    expect(Math.abs(R.P.pos - exp)).toBeLessThanOrEqual(7200);
  });
  it('Raster unbekannt (kein res): höchstens 3 Sync-Sprünge je 60 s, dann Versatz hinnehmen, nach zwei Anläufen allein weiter (kl)', () => {
    // Player läuft dauerhaft langsamer (Decoder am Limit) und kann die Rate nicht ändern: Sprünge helfen nur kurz
    const R = rig({ lag: 300, speed: 0.85, hasRate: false });
    R.kx({ st: 1, p: 3_601_234, at: R.now });
    R.sync.begin();
    R.advance(60000);
    expect(R.sync.diag().seeks).toBeLessThanOrEqual(1 + SYNC.SEEK_CAP);
    expect(R.ev.some((e) => e.type === 'offset')).toBe(true);
    expect(R.sync.status().phase).toBe('offset');
    R.advance(400000);
    expect(R.sync.status().phase).toBe('solo');
    expect(R.ev.some((e) => e.type === 'solo' && e.reason === 'sync')).toBe(true);
    expect(R.of('kl')).toHaveLength(1);
    expect(R.sync.diag().seeks).toBeLessThanOrEqual(1 + 2 * SYNC.SEEK_CAP);
  });
});

describe('Puffern', () => {
  function host() {
    const R = rig({ host: true });
    R.P.pos = 1000;
    R.sync.markPlaying();
    R.kx({ v: 1, st: 0, p: 1000, at: R.now, m: [7], lg: [] });
    R.kx({ v: 2, st: 1, p: 1000, at: R.now, m: [7], lg: [] });
    R._p = 1000; R._at = R.now;
    R.advance(1000);
    return R;
  }
  it('Gastgeber sendet nach kx st=0 (ohne w) sofort kb 0 und ignoriert das Warten', () => {
    const R = rig({ host: true });
    R.sync.markPlaying();
    R.kx({ v: 1, st: 0, p: 1000, m: [7] });
    expect(R.of('kb')).toEqual([{ t: 'kb', sid: 's1', b: 0 }]);
    expect(R.P.paused).toBe(false);
    R.kx({ v: 1, st: 0, p: 1000, m: [7] });
    expect(R.of('kb')).toHaveLength(1);
  });
  it('Mitglied wartet bei st=0 ohne w pausiert', () => {
    const R = rig();
    R.kx({ st: 0, p: 2000 });
    R.sync.begin();
    expect(R.P.paused).toBe(true);
  });
  it('Stocken: kb 1 nach 1 s, einmal; kb 0 nach Erholung', () => {
    const R = host();
    R.P.stallUntil = R.now + 4000;
    R.advance(900);
    expect(R.of('kb').filter((m) => m.b === 1)).toHaveLength(0);
    R.advance(1500);
    expect(R.of('kb').filter((m) => m.b === 1)).toHaveLength(1);
    R.advance(1000);
    expect(R.of('kb').filter((m) => m.b === 1)).toHaveLength(1);
    R.advance(2500);
    expect(R.of('kb').filter((m) => m.b === 0)).toHaveLength(2); // Start-kb + Erholung
    expect(R.of('kb').pop().b).toBe(0);
  });
  it('kein kb im Schonfenster nach eigenem Sprung, im verborgenen Tab und in lg', () => {
    const R = host();
    R.sync.suppress(8000);
    R.P.stallUntil = R.now + 4000;
    R.advance(5000);
    expect(R.of('kb').filter((m) => m.b === 1)).toHaveLength(0);
    const H = host();
    H.P.hidden = true; H.P.stallUntil = H.now + 4000; H.advance(5000);
    expect(H.of('kb').filter((m) => m.b === 1)).toHaveLength(0);
    const L = host();
    L.kx({ v: 3, st: 1, p: 1000, at: L._at, m: [7, 8], lg: [7] });
    L.P.stallUntil = L.now + 4000; L.advance(5000);
    expect(L.of('kb').filter((m) => m.b === 1)).toHaveLength(0);
  });
  it('kx st=0 mit w: alle pausieren und springen auf p; st=1 setzt fort (Nachzügler holt auf)', () => {
    const R = joined();
    R.advance(3000);
    R.kx({ v: 2, st: 0, p: 70000, at: R.now, w: R.now + 7000 });
    expect(R.P.paused).toBe(true);
    expect(R.calls).toContainEqual(['seek', 70000, true]);
    expect(R.ev.some((e) => e.type === 'wait')).toBe(true);
    expect(R.sync.status().waitMs).toBe(7000);
    R.advance(2000);
    expect(R.of('kc')).toHaveLength(0);
    expect(R.sync.status().waitMs).toBe(5000);
    R.kx({ v: 3, st: 1, p: 70000, at: R.now, lg: [7] });
    expect(R.P.paused).toBe(false);
    expect(R.ev.some((e) => e.type === 'resume')).toBe(true);
    R._p = 70000; R._at = R.now;
    R.advance(8000);
    expect(Math.abs(R.P.pos - (70000 + (R.now - R._at)))).toBeLessThan(400);
  });
});

describe('Absichtstabelle, CAS, Echo, Toggle', () => {
  it('eigene Pause: ein kc, Echo (kx v+1) bewirkt nichts mehr', () => {
    const R = joined();
    R.advance(3000);
    const v = R.sync.status().v;
    R.sync.pause();
    expect(R.of('kc')).toEqual([{ t: 'kc', sid: 's1', v, o: 2, p: Math.round(R.P.pos) }]);
    const n = R.calls.length;
    R.kx({ v: v + 1, st: 2, p: Math.round(R.P.pos) });
    expect(R.calls.length).toBe(n);
    expect(R.ev.some((e) => e.type === 'faster' || e.type === 'remote')).toBe(false);
    R.advance(6000);
    expect(R.of('kc')).toHaveLength(1);
  });
  it('fremde Pause: lokal pausiert, Toast, nie ein kc zurück', () => {
    const R = joined();
    R.advance(3000);
    R.kx({ v: 2, st: 2, p: 70000 });
    expect(R.P.paused).toBe(true);
    expect(R.ev).toContainEqual({ type: 'remote', kind: 'pause', p: 70000 });
    R.advance(8000);
    expect(R.of('kc')).toHaveLength(0);
  });
  it('fremdes Spulen: Sprung mit Vorhalt und Toast, kein kc', () => {
    const R = joined();
    R.advance(3000);
    R.kx({ v: 2, st: 1, p: 200000, at: R.now });
    expect(R.calls.filter((c) => c[0] === 'seek').pop()[1]).toBeGreaterThanOrEqual(200000);
    expect(R.ev.some((e) => e.type === 'remote' && e.kind === 'seek')).toBe(true);
    R.advance(10000);
    expect(R.of('kc')).toHaveLength(0);
  });
  it('Toggle-Falle: Entscheidung nach Sitzungszustand, nicht nach DOM; zweiter Toggle als Slot, CAS nach kx', () => {
    const R = joined();
    R.advance(3000);
    const v = R.sync.status().v;
    R.sync.toggle();
    R.sync.toggle();
    expect(R.calls.filter((c) => c[0] === 'pause').slice(-2)).toEqual([['pause', true], ['pause', false]]);
    expect(R.of('kc')).toHaveLength(1);
    expect(R.of('kc')[0].o).toBe(2);
    R.kx({ v: v + 1, st: 2, p: R.of('kc')[0].p });
    R.advance(600);
    expect(R.of('kc')).toHaveLength(2);
    expect(R.of('kc')[1]).toMatchObject({ v: v + 1, o: 1 });
  });
  it('Toggle bei lokal gehaltenem Player (Sitzung läuft): nur lokal fortsetzen, kein kc, danach synchron', () => {
    const R = joined();
    R.advance(3000);
    R.sync.suppress(10000); // lokaler Eingriff, nicht als Nutzerpause werten
    R.P.paused = true; // z. B. iOS-Sperre: lokal gehalten, Sitzung läuft
    R.advance(3000);
    const kc = R.of('kc').length;
    R.calls.length = 0;
    expect(R.sync.toggle()).toBe(true);
    expect(R.of('kc')).toHaveLength(kc);
    expect(R.calls).toContainEqual(['pause', false]);
    expect(R.P.paused).toBe(false);
    R.advance(8000);
    expect(R.of('kc')).toHaveLength(kc);
    expect(Math.abs(R.P.pos - erw(R))).toBeLessThan(500);
  });
  it('Toggle nach fremder Pause setzt fort, nicht noch einmal Pause', () => {
    const R = joined();
    R.advance(3000);
    R.kx({ v: 2, st: 2, p: 70000 });
    R.sync.toggle();
    expect(R.of('kc')[0]).toMatchObject({ o: 1, v: 2 });
    expect(R.P.paused).toBe(false);
  });
  it('er stale: Toast „war schneller“, folgendes kx setzt den Zustand', () => {
    const R = joined();
    R.advance(3000);
    R.sync.pause();
    R.sync.onError('stale');
    expect(R.ev.filter((e) => e.type === 'faster')).toHaveLength(1);
    R.kx({ v: 2, st: 1, p: 65000, at: R.now });
    expect(R.ev.filter((e) => e.type === 'faster')).toHaveLength(1);
    expect(R.P.paused).toBe(false);
  });
  it('kx mit höherem v, das den eigenen Befehl nicht spiegelt: „war schneller“', () => {
    const R = joined();
    R.advance(3000);
    R.sync.pause();
    R.kx({ v: 3, st: 1, p: 80000, at: R.now });
    expect(R.ev.some((e) => e.type === 'faster')).toBe(true);
    expect(R.P.paused).toBe(false);
  });
  it('ältere kx (v kleiner) werden verworfen', () => {
    const R = joined();
    R.kx({ v: 5, st: 1, p: 60000, at: R._at });
    const n = R.calls.length;
    R.kx({ v: 4, st: 2, p: 1000 });
    expect(R.calls.length).toBe(n);
    expect(R.sync.status().v).toBe(5);
  });
  it('Spulen sammelt 400 ms, ein kc mit dem letzten Ziel', () => {
    const R = joined();
    R.advance(3000);
    R.sync.seekBy(10000);
    R.sync.seekBy(10000);
    R.sync.seekBy(10000);
    expect(R.of('kc')).toHaveLength(0);
    const p0 = R.P.pos;
    R.advance(600);
    expect(R.of('kc')).toHaveLength(1);
    expect(R.of('kc')[0].o).toBe(3);
    expect(R.of('kc')[0].p).toBeGreaterThan(p0 + 25000);
  });
  it('kc höchstens 2/s', () => {
    const R = joined();
    R.advance(3000);
    R.sync.pause();
    R.kx({ v: 2, st: 2, p: Math.round(R.P.pos) });
    R.sync.play();
    expect(R.of('kc')).toHaveLength(1);
    R.advance(550);
    expect(R.of('kc')).toHaveLength(2);
  });
  it('Eingriff über die Jellyfin-OSD: Pause-Wechsel und Zeitsprung werden zu kc', () => {
    const R = joined();
    R.advance(6000);
    R.P.paused = true;
    R.advance(500);
    expect(R.of('kc')[0]).toMatchObject({ o: 2 });
    R.kx({ v: 2, st: 2, p: R.of('kc')[0].p });
    R.advance(3000);
    R.P.pos += 30000;
    R.advance(1500);
    expect(R.of('kc').pop()).toMatchObject({ o: 3 });
  });
  it('kein Eingriff im Schonfenster (nach eigenem Sprung) und nach Tick-Lücke (Hintergrund-Drossel)', () => {
    const R = joined();
    R.advance(3000);
    R.sync.suppress(5000);
    R.P.paused = true;
    R.P.pos += 30000;
    R.advance(1000);
    expect(R.of('kc')).toHaveLength(0);
    R.advance(5000);
    R.P.paused = false;
    // Lücke: 5 s ohne Tick, dann springt die Position
    R.now += 5000; R.P.pos += 5000;
    R.P.pos += 3000;
    R.sync.tick();
    expect(R.of('kc').filter((m) => m.o === 3)).toHaveLength(0);
  });
  it('Aufstehen: allein Pause per kc, mit anderen nichts', () => {
    const R = joined();
    R.kx({ v: 2, st: 1, p: 60000, at: R._at, m: [7] });
    expect(R.sync.stand()).toBe('pause');
    expect(R.of('kc')[0]).toMatchObject({ o: 2 });
    const G = joined();
    expect(G.sync.stand()).toBe('keep');
    expect(G.of('kc')).toHaveLength(0);
  });
  it('Ende lokal / verlassen: kein kc mehr, kl nur über leave()', () => {
    const R = joined();
    R.sync.localEnded();
    expect(R.sync.pause()).toBe(false);
    expect(R.of('kl')).toHaveLength(0);
    const L = joined();
    L.sync.leave();
    L.sync.leave();
    expect(L.of('kl')).toEqual([{ t: 'kl', sid: 's1' }]);
  });
  it('anderer Film in der Sitzung oder er off/cap: allein weiter', () => {
    const R = rig({ itemId: 'abc' });
    R.kx({ i: 'xyz' });
    expect(R.ev.some((e) => e.type === 'solo' && e.reason === 'item')).toBe(true);
    const S = joined();
    S.sync.onError('cap');
    expect(S.sync.status().phase).toBe('solo');
    expect(S.of('kl')).toHaveLength(0);
  });
  it('ohne gültiges kx tut nichts Schlimmes', () => {
    const R = rig();
    R.sync.tick();
    R.sync.onKx(null);
    expect(R.sync.pause()).toBe(false);
    expect(R.out).toHaveLength(0);
  });
});

describe('Einstieg ohne Seek-Verzögerung (hls, Vorhalt-Startwert 1,5 s)', () => {
  it('Beitritt bei st=1: nach 10 s Abweichung unter 0,5 s (einmaliger Korrektursprung)', () => {
    const R = rig({ lag: 0, mode: 'hls' });
    R.kx({ v: 1, st: 1, p: 60000, at: R.now });
    R._p = 60000; R._at = R.now;
    R.sync.begin();
    R.advance(10000);
    expect(Math.abs(R.P.pos - erw(R))).toBeLessThan(500);
    expect(R.of('kc')).toHaveLength(0);
    expect(R.calls.filter((c) => c[0] === 'seek').length).toBeLessThanOrEqual(2);
  });
});

describe('K-JOIN: Beitritt mit langsamem ersten Sprung', () => {
  it('erster Sprung 1500 ms, folgende 50 ms: binnen 10 s unter 0,5 s Abstand, Totband danach klein', () => {
    const R = rig({ lag: 0, lagFirst: 1500, lagNext: 50 });
    R.kx({ v: 1, st: 1, p: 60000, at: R.now });
    R._p = 60000; R._at = R.now;
    R.sync.begin();
    R.advance(10000);
    expect(Math.abs(R.P.pos - erw(R))).toBeLessThan(500);
    const land = R.sync.diag().land;
    expect(Math.max(300, 1.5 * (land || 0))).toBeLessThanOrEqual(600);
    // Vorsprung wurde durch lokales Anhalten abgebaut, kein kc
    expect(R.calls.some((c) => c[0] === 'pause' && c[1] === true)).toBe(true);
    expect(R.of('kc')).toHaveLength(0);
    R.advance(20000);
    expect(Math.abs(R.P.pos - erw(R))).toBeLessThan(500);
    expect(R.P.paused).toBe(false);
  });
  it('Anhalten im Drift-Teil: 1,5 s voraus nach Cooldown, kein Sprung, danach wieder gleichauf', () => {
    const R = joined({ lag: 50 });
    R.advance(8000);
    const seeks = R.sync.diag().seeks;
    R.P.pos += 1500;
    R.advance(5000);
    expect(R.sync.diag().seeks).toBe(seeks);
    expect(R.of('kc')).toHaveLength(0);
    expect(Math.abs(R.P.pos - erw(R))).toBeLessThan(400);
    expect(R.P.paused).toBe(false);
  });
  it('Nutzerpause während des Anhaltens bleibt Nutzerpause (ein kc)', () => {
    const R = joined({ lag: 50 });
    R.advance(8000);
    R.P.pos += 1500;
    R.advance(500);
    expect(R.P.paused).toBe(true);
    R.sync.pause();
    R.advance(5000);
    expect(R.P.paused).toBe(true);
    expect(R.of('kc')).toHaveLength(1);
  });
});

describe('Gastgeber hält nie lokal an', () => {
  it('Vorsprung des Gastgebers: keine lokale Pause (w4 share: A stand sonst bis 3 s still)', () => {
    const R = rig({ host: true, lag: 50 });
    R.P.pos = 1000;
    R.sync.markPlaying();
    R.kx({ v: 1, st: 1, p: 1000, at: R.now, m: [7], lg: [] });
    R.advance(8000);
    R.P.pos += 1500;
    R.calls.length = 0;
    R.advance(5000);
    expect(R.calls.filter((c) => c[0] === 'pause' && c[1] === true)).toHaveLength(0);
    expect(R.P.paused).toBe(false);
  });
});

describe('K-STUCK: Pause eines weit zurückhängenden Mitglieds', () => {
  it('Pausenposition ist die Gruppenposition, wenn lokal > 3 s abweichend', () => {
    const R = joined({ lag: 50 });
    R.advance(2000);
    R.P.pos -= 40000; // Video hing
    R.sync.pause();
    R.advance(600, false);
    const kc = R.of('kc')[0];
    expect(kc.o).toBe(2);
    expect(Math.abs(kc.p - erw(R))).toBeLessThan(1500);
  });
  it('Abweichung unter 3 s: lokale Position wie bisher', () => {
    const R = joined({ lag: 50 });
    R.advance(2000);
    const loc = R.P.pos - 1500;
    R.P.pos = loc;
    R.sync.pause();
    R.advance(600, false);
    expect(Math.abs(R.of('kc')[0].p - loc)).toBeLessThan(200);
  });
});

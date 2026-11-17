// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scene } from 'three';
import { createParty } from '../src/js/store3d/cinema/party.js';
import { PalastCinema } from '../src/js/store3d/cinema/palast.js';
import { buildStubSaal } from '../src/js/store3d/cinema/saal-stub.js';
import { wrapDeps } from '../src/js/store3d/xr/guard.js';
import { createBar } from '../src/js/store3d/cinema/bar2d.js';
import { createKeyGuard } from '../src/js/store3d/cinema/keyguard.js';

let clock;
const ITEM = { Id: 'a1b2c3', Name: 'Geheimer Titel', Type: 'Movie' };

function mkNet({ caps = ['kino', 'chat'], c = 1 } = {}) {
  const l = new Map();
  const n = {
    sent: [],
    send: vi.fn((m) => { n.sent.push(m); return true; }),
    on: (ev, fn) => { const s = l.get(ev) || new Set(); s.add(fn); l.set(ev, s); return () => s.delete(fn); },
    emit: (ev, ...a) => { for (const f of [...(l.get(ev) || [])]) f(...a); },
    has: (k) => caps.includes(k),
    serverNow: () => clock,
    me: () => ({ c, k: 'k' }),
    active: () => true,
    setKino: vi.fn(),
    say: vi.fn(() => true),
    kinds: (t) => n.sent.filter((m) => m.t === t),
  };
  return n;
}

function mkVideo(o = {}) {
  return { currentTime: 0, paused: false, readyState: 4, seeking: false, playbackRate: 1, duration: 7200, ended: false, buffered: { length: 1, end: () => 99999 }, ...o };
}

function mkBridge(v) {
  const b = {
    v,
    video: () => b.v,
    setPaused: vi.fn((on) => { b.v.paused = on; }),
    togglePause: vi.fn(() => { b.v.paused = !b.v.paused; }),
    seekTo: vi.fn((s) => { b.v.currentTime = s; }),
    seekBy: vi.fn(),
    mode: () => 'direct',
  };
  return b;
}

function mkParty({ film = true, caps, net: netOpt } = {}) {
  const net = netOpt === undefined ? mkNet({ caps }) : netOpt;
  const bridge = mkBridge(mkVideo());
  const toasts = [];
  const flags = { film, pending: false, blocked: 0 };
  const party = createParty({
    net: () => net, bridge: () => bridge, film: () => flags.film, chatOn: () => true,
    toast: (t) => toasts.push(t), onBlocked: () => { flags.blocked++; }, startPending: () => flags.pending,
  });
  return { party, net, bridge, toasts, flags };
}

const adv = (ms) => { for (let i = 0; i < ms; i += 250) { clock += 250; vi.advanceTimersByTime(250); } };
const kx = (o = {}) => ({ sid: 7, v: 1, st: 0, p: 0, at: clock, m: [1], lg: [], ...o });

beforeEach(() => { vi.useFakeTimers(); clock = 1_000_000; });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

describe('party: ohne Mehrspieler = 1.15', () => {
  it('ohne Provider: Durchreichen, keine Sitzung, Aufstehen pausiert', () => {
    const { party, bridge } = mkParty({ net: null });
    party.beginRun(ITEM);
    party.onPlaying(ITEM);
    expect(party.active).toBe(false);
    const w = party.wrap(bridge);
    w.togglePause();
    expect(bridge.togglePause).toHaveBeenCalledTimes(1);
    w.seekBy(30);
    expect(bridge.seekBy).toHaveBeenCalledWith(30);
    w.seekTo(12);
    expect(bridge.seekTo).toHaveBeenCalledWith(12);
    expect(party.stand()).toBe('pause');
    expect(party.play()).toBe(false);
    expect(party.text()).toBe('');
    expect(party.chatOn()).toBe(false);
    expect(party.offers()).toEqual([]);
    expect(party.join(3, ITEM)).toBe(false);
  });

  it('ohne Fähigkeit kino: kein ks', () => {
    const { party, net } = mkParty({ caps: ['chat'] });
    party.beginRun(ITEM);
    party.onPlaying(ITEM);
    expect(net.kinds('ks')).toHaveLength(0);
    expect(party.active).toBe(false);
  });

  it('ohne Film-Flag: kein ks (keine Item-ID auf der Leitung)', () => {
    const { party, net } = mkParty({ film: false });
    party.beginRun(ITEM);
    party.onPlaying(ITEM);
    adv(2000);
    expect(net.sent).toHaveLength(0);
  });

  it('Folge/Nicht-Film wird nicht angeboten', () => {
    const { party, net } = mkParty();
    party.beginRun({ Id: 'ep1', Type: 'Episode' });
    party.onPlaying({ Id: 'ep1', Type: 'Episode' });
    expect(net.kinds('ks')).toHaveLength(0);
  });
});

describe('party: Gastgeber', () => {
  it('ks beim ersten playing mit ID, Position, Dauer (nie Titel); kb 0 nach der ersten kx; Verbindung bleibt offen', () => {
    const { party, net, bridge } = mkParty();
    bridge.v.currentTime = 42;
    party.beginRun(ITEM);
    party.onPlaying(ITEM);
    const ks = net.kinds('ks');
    expect(ks).toHaveLength(1);
    expect(ks[0]).toEqual({ t: 'ks', i: 'a1b2c3', p: 42000, dur: 7200000 });
    expect(JSON.stringify(net.sent)).not.toContain('Geheimer');
    expect(net.setKino).toHaveBeenCalledWith(true);
    expect(party.active).toBe(true);
    expect(party.role).toBe('host');
    net.emit('msg:kx', kx({ st: 0 }));
    expect(net.kinds('kb')).toEqual([{ t: 'kb', sid: 7, b: 0 }]);
    expect(party.sid).toBe(7);
    party.onPlaying(ITEM); // idempotent
    expect(net.kinds('ks')).toHaveLength(1);
  });

  it('kx einer fremden Sitzung wird ignoriert (auch vor der eigenen sid)', () => {
    const { party, net } = mkParty();
    party.beginRun(ITEM);
    party.onPlaying(ITEM);
    net.emit('msg:kx', kx({ sid: 99, m: [5, 6] }));
    expect(party.sid).toBe(null);
    net.emit('msg:kx', kx({ sid: 7 }));
    net.emit('msg:kx', kx({ sid: 98, v: 5, st: 2, m: [1] }));
    expect(net.kinds('kc')).toHaveLength(0);
    expect(party.sid).toBe(7);
  });

  it('Pause über die umhüllte Bridge: absolutes kc, kein DOM-Umschalter; Seek wird gesammelt', () => {
    const { party, net, bridge } = mkParty();
    party.beginRun(ITEM);
    party.onPlaying(ITEM);
    net.emit('msg:kx', kx({ st: 1, p: 0, at: clock, v: 2 }));
    bridge.v.currentTime = 10;
    const w = party.wrap(bridge);
    w.togglePause();
    expect(bridge.togglePause).not.toHaveBeenCalled();
    expect(bridge.v.paused).toBe(true);
    const kc = net.kinds('kc');
    expect(kc).toHaveLength(1);
    expect(kc[0]).toMatchObject({ sid: 7, v: 2, o: 2 });
    // Echo (v+1, gleicher Zielzustand) wird nicht zurückgespiegelt
    net.emit('msg:kx', kx({ st: 2, p: 10000, v: 3 }));
    expect(net.kinds('kc')).toHaveLength(1);
    w.seekBy(30);
    adv(1000);
    expect(net.kinds('kc').some((m) => m.o === 3 && Math.abs(m.p - 40000) < 400)).toBe(true);
  });

  it('Aufstehen: mit anderen keep (nichts gesendet), allein pause + kc', () => {
    const { party, net } = mkParty();
    party.beginRun(ITEM);
    party.onPlaying(ITEM);
    net.emit('msg:kx', kx({ st: 1, v: 2, m: [1, 2] }));
    expect(party.stand()).toBe('keep');
    expect(net.kinds('kc')).toHaveLength(0);
    net.emit('msg:kx', kx({ st: 1, v: 2, m: [1] }));
    expect(party.stand()).toBe('pause');
    expect(net.kinds('kc')).toHaveLength(1);
    expect(net.kinds('kc')[0].o).toBe(2);
  });

  it('leave sendet kl einmalig und gibt die Verbindung frei', () => {
    const { party, net } = mkParty();
    party.beginRun(ITEM);
    party.onPlaying(ITEM);
    net.emit('msg:kx', kx({ st: 1, v: 2 }));
    party.leave();
    party.leave();
    expect(net.kinds('kl')).toEqual([{ t: 'kl', sid: 7 }]);
    expect(net.setKino).toHaveBeenLastCalledWith(false);
    expect(party.active).toBe(false);
    adv(1000);
    expect(net.kinds('kb').length + net.kinds('kc').length).toBe(0);
  });

  it('neuer Film ohne Mitschauen verlässt die alte Sitzung (kl) und legt später neu an', () => {
    const { party, net } = mkParty();
    party.beginRun(ITEM);
    party.onPlaying(ITEM);
    net.emit('msg:kx', kx({ st: 1, v: 2 }));
    party.beginRun({ Id: 'zz9', Type: 'Movie' });
    expect(net.kinds('kl')).toHaveLength(1);
    party.onPlaying({ Id: 'zz9', Type: 'Movie' });
    expect(net.kinds('ks').map((m) => m.i)).toEqual(['a1b2c3', 'zz9']);
  });

  it('mp verbindet erst später oder Film-Flag später an: poll holt ks nach', () => {
    const { party, net, flags } = mkParty({ film: false });
    party.beginRun(ITEM);
    party.onPlaying(ITEM);
    party.poll(5000, ITEM);
    expect(net.kinds('ks')).toHaveLength(0);
    flags.film = true;
    party.poll(5100, ITEM); // Rate 1 s
    expect(net.kinds('ks')).toHaveLength(0);
    party.poll(7000, ITEM);
    expect(net.kinds('ks')).toHaveLength(1);
    party.poll(9000, ITEM);
    expect(net.kinds('ks')).toHaveLength(1);
  });

  it('er deny auf kc: solo, Hinweis, Verbindung frei', () => {
    const { party, net, toasts } = mkParty();
    party.beginRun(ITEM);
    party.onPlaying(ITEM);
    net.emit('msg:kx', kx({ st: 1, v: 2 }));
    net.emit('msg:er', { c: 'deny', y: 'kc' });
    expect(party.active).toBe(false);
    expect(toasts.some((t) => /allein/.test(t))).toBe(true);
    expect(net.setKino).toHaveBeenLastCalledWith(false);
    expect(net.kinds('kl')).toHaveLength(0);
  });

  it('er cap auf ks: Film läuft lokal ohne Sitzung', () => {
    const { party, net, bridge } = mkParty();
    party.beginRun(ITEM);
    party.onPlaying(ITEM);
    net.emit('msg:er', { c: 'cap', y: 'ks' });
    expect(party.active).toBe(false);
    party.wrap(bridge).togglePause();
    expect(bridge.togglePause).toHaveBeenCalledTimes(1);
  });
});

describe('party: Mitschauen', () => {
  it('offers: aus kh und wl, ohne eigene Sitzung, mit Katalogkennung; Titel kommen nie vor', () => {
    const { party, net } = mkParty();
    party.listen();
    net.emit('msg:wl', { t: 'wl', kh: [[3, 9, 'zz9', 2, 1, [9, 4], 5000, clock], [4, 1, 'a1', 1, 1, [1], 0, clock]] });
    expect(party.offers()).toEqual([{ sid: 3, host: 9, itemId: 'zz9', n: 2, st: 1, m: [9, 4], p: 5000, at: clock }]);
    net.emit('msg:kh', { l: [] });
    expect(party.offers()).toEqual([]);
  });

  it('join: kj sofort, begin beim ersten playing: st=1 springt auf erwartete Position plus Vorhalt', () => {
    const { party, net, bridge } = mkParty();
    expect(party.join(7, ITEM)).toBe(true);
    expect(net.kinds('kj')).toEqual([{ t: 'kj', sid: 7 }]);
    expect(party.role).toBe('member');
    party.beginRun(ITEM); // join gilt, keine alte Sitzung beenden
    expect(net.kinds('kl')).toHaveLength(0);
    net.emit('msg:kx', kx({ st: 1, v: 4, p: 60000, at: clock - 2000, m: [9, 1] }));
    expect(bridge.seekTo).not.toHaveBeenCalled(); // erst beim Start
    bridge.v.currentTime = 0;
    party.onPlaying(ITEM);
    expect(bridge.seekTo).toHaveBeenCalledTimes(1);
    const [s, opts] = bridge.seekTo.mock.calls[0];
    expect(opts).toEqual({ exact: true });
    expect(s).toBeGreaterThan(62);
    expect(s).toBeLessThan(63.5);
    expect(net.kinds('ks')).toHaveLength(0);
    expect(net.kinds('kc')).toHaveLength(0); // kein Nutzer-Seek
  });

  it('join bei pausierter Sitzung: pausiert und springt auf p', () => {
    const { party, net, bridge } = mkParty();
    party.join(7, ITEM);
    party.beginRun(ITEM);
    net.emit('msg:kx', kx({ st: 2, v: 4, p: 30000, m: [9, 1] }));
    party.onPlaying(ITEM);
    expect(bridge.v.paused).toBe(true);
    expect(bridge.seekTo).toHaveBeenCalledWith(30, { exact: true });
  });

  it('Starten bei gesperrtem Autoplay: nur lokal, kein kc', () => {
    const { party, net, bridge, flags } = mkParty();
    party.join(7, ITEM);
    party.beginRun(ITEM);
    net.emit('msg:kx', kx({ st: 1, v: 4, p: 1000, m: [9, 1] }));
    flags.pending = true;
    bridge.v.paused = true;
    party.wrap(bridge).togglePause();
    expect(bridge.setPaused).toHaveBeenCalledWith(false);
    adv(1000);
    expect(net.kinds('kc')).toHaveLength(0);
    expect(net.kinds('kb')).toHaveLength(0);
  });

  it('abgelehntes play (Autoplay-Sperre): onBlocked, nie kc', async () => {
    const { party, net, bridge, flags } = mkParty();
    party.join(7, ITEM);
    party.beginRun(ITEM);
    net.emit('msg:kx', kx({ st: 1, v: 4, p: 1000, m: [9, 1] }));
    bridge.setPaused = vi.fn(() => Promise.reject(new Error('NotAllowed')));
    bridge.v.paused = true;
    party.onPlaying(ITEM);
    await Promise.resolve();
    await Promise.resolve();
    expect(flags.blocked).toBeGreaterThan(0);
    expect(net.kinds('kc')).toHaveLength(0);
  });

  it('Leistenzeile: Einstieg, Wartezustand, Gruppe', () => {
    const { party, net } = mkParty();
    party.join(7, ITEM);
    party.beginRun(ITEM);
    expect(party.text()).toBe('Du steigst ein …');
    net.emit('msg:kx', kx({ st: 0, v: 3, w: clock + 7000, p: 5000, m: [9, 1] }));
    party.onPlaying(ITEM);
    expect(party.text()).toMatch(/^Warte auf andere Zuschauer … [67] s$/);
  });

  it('Wiederverbinden (wl): Sitzung noch da -> kj; weg als Gastgeber -> neues ks; weg als Mitschauer -> allein', () => {
    const a = mkParty();
    a.party.beginRun(ITEM);
    a.party.onPlaying(ITEM);
    a.net.emit('msg:kx', kx({ st: 1, v: 2, m: [1, 2] }));
    a.net.emit('msg:wl', { t: 'wl', kh: [[7, 1, 'a1b2c3', 2, 1, [1, 2], 0, clock]] });
    expect(a.net.kinds('kj')).toEqual([{ t: 'kj', sid: 7 }]);
    a.net.emit('msg:wl', { t: 'wl', kh: [] });
    expect(a.net.kinds('ks')).toHaveLength(2);
    expect(a.party.role).toBe('host');
    const b = mkParty();
    b.party.join(7, ITEM);
    b.party.beginRun(ITEM);
    b.net.emit('msg:kx', kx({ st: 1, v: 2, m: [9, 1] }));
    b.net.emit('msg:wl', { t: 'wl', kh: [] });
    expect(b.party.active).toBe(false);
    expect(b.toasts.at(-1)).toMatch(/getrennt/);
    expect(b.net.kinds('ks')).toHaveLength(0);
  });
});

describe('bar2d: Chat-Zeile und Gruppentext', () => {
  const mk = (enabled = true) => {
    const say = vi.fn(() => true);
    const toast = vi.fn();
    const bar = createBar({ bridge: {}, getState: () => ({}), onStand() {}, onFull() {}, toast, chat: { enabled: () => enabled, say } });
    document.body.appendChild(bar.el);
    return { bar, say, toast };
  };
  it('openChat nur bei Chat an; Enter sendet und schließt; Esc schließt', () => {
    const off = mk(false);
    expect(off.bar.openChat()).toBe(false);
    const { bar, say } = mk(true);
    expect(bar.openChat()).toBe(true);
    const input = bar.el.querySelector('.lfx-palast-chatin');
    expect(input.parentNode.hidden).toBe(false);
    input.value = ' Hallo ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(say).toHaveBeenCalledWith('Hallo');
    expect(input.parentNode.hidden).toBe(true);
    bar.openChat();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(input.parentNode.hidden).toBe(true);
    expect(bar.openChat()).toBe(true);
    bar.dispose();
  });
  it('group-Text erscheint in der Meldezeile', () => {
    const { bar } = mk();
    bar.update({ phase: 'playing', group: 'Gemeinsam · 3 Zuschauer' });
    expect(bar.el.querySelector('.lfx-palast-msg').textContent).toBe('Gemeinsam · 3 Zuschauer');
    bar.dispose();
  });
});

describe('keyguard: Enter im Sessel', () => {
  const fire = (win, code) => { const e = new KeyboardEvent('keydown', { code, key: code, bubbles: true, cancelable: true }); win.dispatchEvent(e); return e; };
  it('verbraucht Enter nur, wenn der Chat-Handler true meldet', () => {
    let on = false;
    const g = createKeyGuard({ win: window, isActive: () => true, isSeated: () => true, handlers: { chat: () => on } });
    g.attach();
    expect(fire(window, 'Enter').defaultPrevented).toBe(false);
    on = true;
    expect(fire(window, 'Enter').defaultPrevented).toBe(true);
    g.detach();
  });
});

describe('PalastCinema + party', () => {
  function setup({ net, prefs = { film: true, chat: true } } = {}) {
    const dc = {
      v: mkVideo({ currentTime: 5 }),
      st: { route: 'video', phase: 'loading', time: 0, duration: 100, title: 'Testfilm', hasPrev: false, hasNext: false, upNext: null, error: null, volume: 1, muted: false, reloading: false },
      video() { return dc.v; },
      state() { return dc.st; },
      onVideo: vi.fn(() => vi.fn()),
      onChange: vi.fn(() => vi.fn()),
      subtitles: () => null,
      stop: vi.fn(async () => true),
      togglePause: vi.fn(() => { dc.v.paused = !dc.v.paused; dc.st.phase = dc.v.paused ? 'paused' : 'playing'; }),
      setPaused: vi.fn((on) => { dc.v.paused = on; dc.st.phase = on ? 'paused' : 'playing'; }),
      seekBy: vi.fn(), seekTo: vi.fn(), next: vi.fn(), prev: vi.fn(), setVolume: vi.fn(), toggleMute: vi.fn(),
      tracks: vi.fn(async () => []), selectTrack: vi.fn(async () => true), mode: () => 'direct',
    };
    const raw = { cinema: dc, toast: vi.fn(), play: vi.fn(() => Promise.resolve(true)), onCinema2d: vi.fn(), mp: { prefs: () => prefs } };
    let overlay = null;
    const ctx = {
      player: {
        getPose: () => ({ x: 5, z: 5, yaw: 0, pitch: 0 }), teleport: vi.fn(), freeze: vi.fn(),
        camera: { flyTo: vi.fn(() => Promise.resolve(true)), release: vi.fn() },
      },
      overlay: {
        open: vi.fn((el, o) => { overlay = { el, onClose: o.onClose }; document.body.appendChild(el); }),
        close: vi.fn(() => { const ov = overlay; overlay = null; if (ov) { ov.el.remove(); ov.onClose(); } }),
        isOpen: () => Boolean(overlay),
      },
      use: (n) => (n === 'net' ? net : { duck() {} }),
      provide: vi.fn(),
    };
    const app = { engine: { setRenderEnabled: vi.fn(), scene: new Scene() }, player: { x: 5, z: 5 }, mods: { ctx }, desktop: { attach: vi.fn(), detach: vi.fn() }, holdview: { close: vi.fn() }, xr: null, suspended: false };
    const cin = new PalastCinema(app);
    app.cinema2d = cin;
    app.deps = wrapDeps(raw, () => app.xr, () => app.cinema2d);
    const saal = buildStubSaal({ x: 5, z: 5, yaw: 0 });
    app.engine.scene.add(saal.root);
    cin.attachSaal(saal);
    return { cin, dc, raw, ctx };
  }
  const run = (c, from, ms) => {
    let now = from;
    for (; now < from + ms; now += 50) { c.dc.v.currentTime += c.dc.v.paused ? 0 : 0.05; c.cin.tick(0.05, now); }
    return now;
  };
  const playing = (c) => { c.dc.st.phase = 'playing'; c.cin.play(ITEM); return run(c, 0, 1500); };

  it('Gastgeber im Saal: ks nach dem Start, Aufstehen mit anderen pausiert nicht, Hinsetzen holt auf, leave sendet kl', () => {
    const net = mkNet();
    const c = setup({ net });
    const now = playing(c);
    expect(net.kinds('ks')).toHaveLength(1);
    expect(net.kinds('ks')[0].i).toBe('a1b2c3');
    net.emit('msg:kx', kx({ st: 1, v: 2, p: 5000, at: clock, m: [1, 2] }));
    c.cin.stand();
    expect(c.dc.togglePause).not.toHaveBeenCalled();
    expect(c.cin.sameFilm(ITEM)).toBe(true);
    c.cin.sit('stub');
    expect(c.cin.resumeAfterStand()).toBe(false);
    run(c, now, 200);
    expect(c.cin.diag().party.role).toBe('host');
    c.cin.leave('stop');
    expect(net.kinds('kl')).toEqual([{ t: 'kl', sid: 7 }]);
    c.cin.dispose();
  });

  it('Gastgeber allein: Aufstehen pausiert wie 1.15 (plus kc), Hinsetzen setzt für die Sitzung fort', () => {
    const net = mkNet();
    const c = setup({ net });
    const now = playing(c);
    net.emit('msg:kx', kx({ st: 1, v: 2, p: 5000, at: clock, m: [1] }));
    c.cin.stand();
    expect(c.dc.togglePause).toHaveBeenCalledTimes(1);
    expect(net.kinds('kc')[0]).toMatchObject({ sid: 7, o: 2 });
    run(c, now, 200);
    c.cin.sit('stub');
    expect(c.cin.resumeAfterStand()).toBe(true);
    expect(c.dc.v.paused).toBe(false);
    c.cin.dispose();
  });

  it('ohne Mehrspieler: wie bisher (kein ks, Pause per togglePause, Fortsetzen per togglePause)', () => {
    const c = setup({ net: null });
    playing(c);
    c.cin.stand();
    expect(c.dc.togglePause).toHaveBeenCalledTimes(1);
    c.dc.st.phase = 'paused';
    c.cin.sit('stub');
    expect(c.cin.resumeAfterStand()).toBe(true);
    expect(c.dc.togglePause).toHaveBeenCalledTimes(2);
    c.cin.dispose();
  });

  it('joinFilm: kj, play ohne resume, Mitschauer gleicht beim Start ab', async () => {
    const net = mkNet();
    const c = setup({ net });
    c.cin.sit('stub');
    c.dc.v.currentTime = 0;
    const ok = await c.cin.joinFilm(7, ITEM);
    expect(ok).toBe(true);
    expect(net.kinds('kj')).toEqual([{ t: 'kj', sid: 7 }]);
    expect(c.raw.play.mock.calls[0][1]).toMatchObject({ resume: false });
    net.emit('msg:kx', kx({ st: 1, v: 3, p: 100000, at: clock, m: [9, 1] }));
    c.dc.st.phase = 'playing';
    run(c, 0, 1500);
    expect(c.dc.seekTo).toHaveBeenCalled();
    expect(c.dc.seekTo.mock.calls[0][0]).toBeGreaterThan(99);
    expect(net.kinds('ks')).toHaveLength(0);
    c.cin.dispose();
  });

  it('Enter im Sessel öffnet die Chat-Zeile nur bei Chat an', () => {
    const net = mkNet();
    const c = setup({ net });
    playing(c);
    const e = new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(c.cin.bar.el.querySelector('.lfx-palast-chat').hidden).toBe(false);
    c.cin.dispose();
    const c2 = setup({ net: null });
    playing(c2);
    const e2 = new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', bubbles: true, cancelable: true });
    window.dispatchEvent(e2);
    expect(e2.defaultPrevented).toBe(false);
    c2.cin.dispose();
  });
});

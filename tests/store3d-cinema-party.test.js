// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Group, Scene, PerspectiveCamera } from 'three';
import { Cinema } from '../src/js/store3d/cinema/cinema.js';
import { createParty } from '../src/js/store3d/cinema/party.js';
import { controlsSpec } from '../src/js/store3d/cinema/controls.js';

// VR-Kino + gemeinsames Kino: Party aus app.cinema2d, Bedienelemente als kc, kl beim Verlassen.
let clock;
const ITEM = { Id: 'a1b2c3', Name: 'Geheimer Titel', Type: 'Movie' };

function mkNet() {
  const l = new Map();
  const n = {
    sent: [],
    send: vi.fn((m) => { n.sent.push(m); return true; }),
    on: (ev, fn) => { const s = l.get(ev) || new Set(); s.add(fn); l.set(ev, s); return () => s.delete(fn); },
    emit: (ev, ...a) => { for (const f of [...(l.get(ev) || [])]) f(...a); },
    has: (k) => k === 'kino', serverNow: () => clock, me: () => ({ c: 1, k: 'k' }), active: () => true, setKino: vi.fn(),
    kinds: (t) => n.sent.filter((m) => m.t === t),
  };
  return n;
}

function setup({ withParty = true } = {}) {
  const calls = { panels: [] };
  const video = { readyState: 4, currentTime: 0, paused: false, ended: false, videoWidth: 1920, videoHeight: 1080, duration: 7200, seeking: false, playbackRate: 1, buffered: { length: 1, end: () => 99999 } };
  const dc = {
    v: video,
    st: { route: 'video', phase: 'playing', time: 0, duration: 7200, title: 'Testfilm', hasPrev: false, hasNext: false, upNext: null, error: null, volume: 1, muted: false, reloading: false },
    video() { return dc.v; }, state() { return dc.st; }, onVideo() { return () => {}; }, onChange() { return () => {}; }, subtitles: () => null,
    stop: vi.fn(async () => true), togglePause: vi.fn(() => { video.paused = !video.paused; }), seekBy: vi.fn(), seekTo: vi.fn((s) => { video.currentTime = s; }),
    next: vi.fn(), prev: vi.fn(), setVolume: vi.fn(), upNext: vi.fn(), tracks: vi.fn(async () => []), selectTrack: vi.fn(async () => true),
  };
  const engine = { rig: new Group(), storeScene: new Scene(), camera: new PerspectiveCamera(), setScene: vi.fn(), setFoveation: vi.fn(), renderer: { xr: { getCamera: () => new PerspectiveCamera() } } };
  engine.storeScene.add(engine.rig);
  const net = mkNet();
  const app = {
    deps: { cinema: dc, mp: { prefs: () => ({ film: true }) } }, engine,
    player: { x: 0, z: 0, yaw: 0, pitch: 0, teleport: vi.fn() },
    mods: { hook: () => {}, ctx: { use: () => null } }, holdview: { close: vi.fn() }, opts: { vr: { seat: 'mid' } }, savePrefs: vi.fn(),
  };
  if (withParty) app.cinema2d = { party: createParty({ net: () => net, bridge: () => dc, film: () => true, chatOn: () => false, toast: () => {}, onBlocked: () => {}, startPending: () => false }) };
  const cin = new Cinema(app);
  app.xr = {
    presenting: false, fade: null, floor: true, toast: vi.fn(), closePanels: () => { for (const p of calls.panels) p.close(); },
    openPanel: (spec) => { const h = { open: true, spec, update(s) { h.spec = s; }, close() { if (!h.open) return; h.open = false; if (h.spec.onClose) h.spec.onClose(); } }; calls.panels.push(h); return h; },
    leaveCinema: (r, c) => cin.leave(r, c),
  };
  return { cin, app, dc, net, calls };
}

function run(c, from, ms, step = 50) {
  let now = from;
  for (; now < from + ms; now += step) { clock += step; c.dc.v.currentTime += step / 1000; c.cin.tick(step / 1000, now); vi.advanceTimersByTime(step); }
  return now;
}
const btn = (c, label) => c.calls.panels[c.calls.panels.length - 1].spec.buttons.find((b) => b.label === label);

beforeEach(() => { vi.useFakeTimers(); clock = 1_000_000; });
afterEach(() => { vi.useRealTimers(); });

describe('VR-Kino: gemeinsames Kino', () => {
  it('Gastgeber: ks beim ersten playing (nur ID); Pause aus dem Panel geht als kc, nicht als DOM-Umschalter', () => {
    const c = setup();
    c.cin.enter(ITEM);
    run(c, 0, 1500);
    expect(c.cin.diag().phase).toBe('playing');
    const ks = c.net.kinds('ks');
    expect(ks).toHaveLength(1);
    expect(ks[0].i).toBe('a1b2c3');
    expect(JSON.stringify(c.net.sent)).not.toContain('Geheimer');
    c.net.emit('msg:kx', { sid: 7, v: 2, st: 1, p: 0, at: clock, m: [1], lg: [] });
    c.cin.controls.show();
    btn(c, 'Pause').onSelect();
    expect(c.net.kinds('kc').some((m) => m.o === 2 && m.sid === 7)).toBe(true);
    c.cin.dispose();
  });

  it('Verlassen sendet kl einmalig', async () => {
    const c = setup();
    c.cin.enter(ITEM);
    run(c, 0, 1500);
    c.net.emit('msg:kx', { sid: 7, v: 2, st: 1, p: 0, at: clock, m: [1], lg: [] });
    await c.cin.leave('stop');
    await c.cin.leave('stop');
    expect(c.net.kinds('kl')).toEqual([{ t: 'kl', sid: 7 }]);
    c.cin.dispose();
  });

  it('Mitschauer: join vor enter bleibt bestehen (kein kl), Gruppenzeile im Panel', () => {
    const c = setup();
    expect(c.app.cinema2d.party.join(7, ITEM)).toBe(true);
    c.cin.enter(ITEM);
    run(c, 0, 1500);
    c.net.emit('msg:kx', { sid: 7, v: 2, st: 1, p: 0, at: clock, m: [1, 2], lg: [] });
    expect(c.net.kinds('kj')).toHaveLength(1);
    expect(c.net.kinds('kl')).toHaveLength(0);
    expect(c.net.kinds('ks')).toHaveLength(0);
    c.cin.controls.hide();
    c.cin.controls.show();
    const lines = c.calls.panels[c.calls.panels.length - 1].spec.lines;
    expect(lines).toHaveLength(2); // Gruppenzeile (Einsteigen/Versatz/Gemeinsam)
    c.cin.dispose();
  });

  it('ohne Party (kein cinema2d) unverändert: Bridge unverändert, keine Gruppenzeile', () => {
    const c = setup({ withParty: false });
    c.cin.enter(ITEM);
    run(c, 0, 1500);
    c.cin.controls.show();
    btn(c, 'Pause').onSelect();
    expect(c.dc.togglePause).toHaveBeenCalledTimes(1);
    expect(c.calls.panels[c.calls.panels.length - 1].spec.lines).toHaveLength(1);
    c.cin.dispose();
  });

  it('controlsSpec: group als zweite Zeile nur wenn gesetzt', () => {
    const h = { onTogglePause() {}, onSeekBy() {}, onSeekFrac() {}, onPrev() {}, onNext() {}, onTracks() {}, onVolume() {}, onSeat() {}, onBack() {}, onUpNext() {}, onClose() {}, seat: 'mid' };
    expect(controlsSpec({ duration: 10 }, h).lines).toHaveLength(1);
    expect(controlsSpec({ duration: 10, group: 'Gemeinsam · 2 Zuschauer' }, h).lines[1]).toBe('Gemeinsam · 2 Zuschauer');
  });
});

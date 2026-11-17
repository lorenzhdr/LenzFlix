// @vitest-environment jsdom
// VIDEOTHEK LENZ · Mehrspieler Chat (net/chat.js, net/chat-ui.js, Blasen in net/tags.js): Modell, Säubern, Stumm, Hörweite, Ring, UI in jsdom. Kein Netzwerk.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { createChat, createLimiter, clean, bubbleMs, inHearing, normMute, withMute, RING_MAX, HEAR_M, MUTE_MAX } from '../src/js/store3d/net/chat.js';
import { createBubbles } from '../src/js/store3d/net/tags.js';
import { createChatUi, createChatPart } from '../src/js/store3d/net/chat-ui.js';

const K1 = 'aaaaaaaaaaaa';
const K2 = 'bbbbbbbbbbbb';
const K3 = 'cccccccccccc';

afterEach(() => { document.body.innerHTML = ''; });

function mk(o = {}) {
  let t = 1000;
  const peers = o.peers || { 2: { k: K2, name: 'Berta' }, 3: { k: K3, name: 'Jemand' } };
  let mute = o.mute || [];
  let on = o.enabled !== false;
  const m = createChat({ now: () => t, lookup: (c) => peers[c] || null, me: () => ({ c: 1, k: K1 }), mute: () => mute, enabled: () => on });
  return { m, tick: (ms) => { t += ms; }, setMute: (l) => { mute = l; }, setOn: (v) => { on = v; } };
}

describe('Chat-Modell: Säubern, Ring, Stumm', () => {
  it('säubert NFC, Steuer- und Bidi-Zeichen, kürzt auf 200', () => {
    expect(clean('  He‮llo\u0000 \n  Welt​ ')).toBe('Hello Welt');
    expect(clean('é')).toBe('é');
    expect(Array.from(clean('x'.repeat(500))).length).toBe(200);
    expect(clean(42)).toBe('');
    expect(clean('‮​')).toBe('');
  });

  it('Ring hält höchstens 50 Einträge', () => {
    const t = mk();
    for (let i = 0; i < 70; i++) t.m.receive({ c: 2, x: `n${i}` });
    expect(t.m.size()).toBe(RING_MAX);
    expect(t.m.all()[0].text).toBe('n20');
    expect(t.m.visible(3).map((e) => e.text)).toEqual(['n67', 'n68', 'n69']);
  });

  it('Stumm pro k: nicht aufgenommen und aus der Anzeige gefiltert, eigenes nie', () => {
    const t = mk();
    t.m.receive({ c: 2, x: 'hallo' });
    t.m.receive({ c: 3, x: 'du auch' });
    expect(t.m.visible().length).toBe(2);
    t.setMute([K2]);
    expect(t.m.visible().map((e) => e.name)).toEqual(['Jemand']);
    expect(t.m.receive({ c: 2, x: 'noch eins' })).toBeNull();
    const own = t.m.receive({ c: 1, x: 'ich' });
    expect(own.mine).toBe(true);
    expect(own.name).toBe('Du');
    t.setMute([K1]);
    expect(t.m.visible().some((e) => e.mine)).toBe(true);
  });

  it('Chat aus, leer, ungültig: nichts aufgenommen', () => {
    const t = mk();
    expect(t.m.receive({ c: 2, x: '  ​ ' })).toBeNull();
    expect(t.m.receive({ c: 'x', x: 'a' })).toBeNull();
    expect(t.m.receive(null)).toBeNull();
    t.setOn(false);
    expect(t.m.receive({ c: 2, x: 'a' })).toBeNull();
    expect(t.m.size()).toBe(0);
  });

  it('unbekannte Verbindung heißt Jemand, HTML bleibt Text im Modell', () => {
    const t = mk();
    const e = t.m.receive({ c: 99, x: '<img src=x onerror=alert(1)>' });
    expect(e.name).toBe('Jemand');
    expect(e.text).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('Stummliste, Rate, Hörweite, Dauer', () => {
  it('normMute/withMute: gültige k, höchstens 50, eigenes k nie', () => {
    expect(normMute([K1, 'zz', K1, 5, K2])).toEqual([K1, K2]);
    expect(withMute([], K2, true, K1)).toEqual([K2]);
    expect(withMute([K2], K2, false, K1)).toEqual([]);
    expect(withMute([], K1, true, K1)).toEqual([]);
    expect(withMute([], 'kaputt', true, K1)).toEqual([]);
    let l = [];
    for (let i = 0; i < 60; i++) l = withMute(l, i.toString(16).padStart(12, '0'), true, K1);
    expect(l.length).toBe(MUTE_MAX);
    expect(l[l.length - 1]).toBe((59).toString(16).padStart(12, '0'));
  });

  it('Sende-Spiegel: 5 je 10 s, danach Wartezeit', () => {
    const l = createLimiter();
    for (let i = 0; i < 5; i++) expect(l.take(i * 100)).toBe(0);
    const w = l.take(600);
    expect(w).toBeGreaterThan(9000);
    expect(l.take(10001)).toBe(0);
  });

  it('Hörweite 16 m, nicht endlich = außer Reichweite', () => {
    expect(HEAR_M).toBe(16);
    expect(inHearing(10, 10)).toBe(true);
    expect(inHearing(12, 12)).toBe(false);
    expect(inHearing(NaN, 0)).toBe(false);
  });

  it('Blasendauer wächst mit der Länge, 3 bis 9 s', () => {
    expect(bubbleMs('hi')).toBeLessThan(3200);
    expect(bubbleMs('x'.repeat(200))).toBe(9000);
    expect(bubbleMs('')).toBe(3000);
  });
});

function mkCtx(o = {}) {
  const host = document.createElement('div');
  Object.defineProperty(host, 'clientWidth', { value: 800 });
  Object.defineProperty(host, 'clientHeight', { value: 600 });
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  document.body.appendChild(host);
  const camera = new PerspectiveCamera(60, 800 / 600, 0.1, 100);
  camera.position.set(0, 1.6, 0);
  camera.lookAt(0, 1.6, -10);
  camera.updateMatrixWorld(true);
  const st = { xr: false, overlay: null };
  const bubble3d = { show: vi.fn(), hide: vi.fn(), dispose: vi.fn(), visible: false };
  const ctx = {
    camera, renderer: { domElement: canvas }, isTouch: !!o.touch,
    xr: { presenting: () => st.xr, bubble: () => bubble3d, toast: vi.fn() },
    overlay: {
      open: vi.fn((el, op) => { st.overlay = { el, op }; host.appendChild(el); }),
      close: vi.fn(() => { const s = st.overlay; st.overlay = null; if (s) { s.el.remove(); s.op.onClose(); } }),
      isOpen: () => !!st.overlay,
    },
    input: { onAction: vi.fn((n, fn) => { st.action = fn; return () => { st.action = null; }; }) },
    provide: vi.fn((n, impl) => { st.provided = { ...(st.provided || {}), [n]: impl }; return () => {}; }),
  };
  return { ctx, host, st, bubble3d, camera };
}

const fig = (x, y, z, vis = true) => ({ disposed: false, root: { visible: vis }, headWorld: (v) => v.set(x, y, z) });

describe('Blasen über Fremdfiguren', () => {
  it('2D: Blase mit textContent, Hörweite, Ablauf, Pool', () => {
    const t = mkCtx();
    const b = createBubbles(t.ctx);
    expect(b.say(2, () => fig(0, 1.7, -5), '<b>hi</b>', 1000)).toBe(true);
    const el = t.host.querySelector('.lfx-mp-say');
    expect(el.textContent).toBe('<b>hi</b>');
    expect(el.querySelector('b')).toBeNull();
    expect(el.style.pointerEvents).toBe('none');
    expect(el.hidden).toBe(false);
    b.say(3, () => fig(0, 1.7, -40), 'weit', 1000); // 40 m: außer Hörweite
    expect(t.host.querySelectorAll('.lfx-mp-say')[1].hidden).toBe(true);
    b.update(0.6);
    b.update(0.6);
    expect(t.host.querySelectorAll('.lfx-mp-say').length).toBe(0);
    for (let c = 10; c < 30; c++) b.say(c, () => fig(0, 1.7, -5), 'x', 5000);
    expect(t.host.querySelectorAll('.lfx-mp-say').length).toBeLessThanOrEqual(6);
    b.dispose();
    expect(t.host.querySelectorAll('.lfx-mp-say').length).toBe(0);
  });

  it('nach Umhängen der Canvas landen neue und bestehende Blasen im neuen Host', () => {
    const t = mkCtx();
    const host2 = document.createElement('div');
    document.body.appendChild(host2);
    const b = createBubbles(t.ctx);
    b.say(2, () => fig(0, 1.7, -5), 'alt', 5000);
    expect(t.host.querySelectorAll('.lfx-mp-say').length).toBe(1);
    host2.appendChild(t.ctx.renderer.domElement);
    b.say(3, () => fig(0, 1.7, -5), 'neu', 5000);
    b.update(0.1);
    expect(host2.querySelectorAll('.lfx-mp-say').length).toBe(2);
    expect(t.host.querySelectorAll('.lfx-mp-say').length).toBe(0);
    b.dispose();
  });

  it('ohne Figur ruht die Blase, VR nutzt die 3D-Blase und kein DOM', () => {
    const t = mkCtx();
    const b = createBubbles(t.ctx);
    let f = null;
    b.say(2, () => f, 'hi', 5000);
    expect(t.host.querySelector('.lfx-mp-say').hidden).toBe(true);
    t.st.xr = true;
    f = fig(0, 1.7, -4);
    b.update(0.1);
    expect(t.host.querySelector('.lfx-mp-say').hidden).toBe(true);
    expect(t.bubble3d.show).toHaveBeenCalledWith('hi', expect.objectContaining({ z: -4 }));
    b.drop(2);
    expect(t.host.querySelectorAll('.lfx-mp-say').length).toBe(0);
    void Vector3;
  });
});

describe('Chat-Oberfläche', () => {
  const setup = (o = {}) => {
    const t = mkCtx(o);
    let on = true;
    let t0 = 0;
    const model = createChat({ now: () => t0, lookup: () => ({ k: K2, name: 'Berta' }), me: () => ({ c: 1, k: K1 }), enabled: () => on });
    const say = vi.fn(() => ({ ok: true }));
    const ui = createChatUi(t.ctx, { model, say, enabled: () => on, now: () => t0 });
    return { ...t, model, say, ui, setOn: (v) => { on = v; }, adv: (ms) => { t0 += ms; } };
  };

  it('Fenster: nur textContent, pointer-events none, blendet nach 10 s aus, Handy zeigt 3 Zeilen', () => {
    const s = setup({ touch: true });
    expect(s.host.querySelector('.lfx-mp-chatlog')).toBeNull(); // lazy
    for (let i = 0; i < 5; i++) s.model.receive({ c: 2, x: `<i>${i}</i>` });
    s.ui.push();
    s.ui.tick(1);
    const log = s.host.querySelector('.lfx-mp-chatlog');
    expect(log.querySelectorAll('.lfx-mp-chatline').length).toBe(3);
    expect(log.querySelector('i')).toBeNull();
    expect(log.style.pointerEvents).toBe('none');
    s.adv(10500);
    s.ui.tick(1);
    expect(log.hidden).toBe(true);
  });

  it('Eingabe: Enter sendet und schließt, leer schließt nur, Esc schließt, Tasten bleiben im Feld', () => {
    const s = setup();
    expect(s.ui.open()).toBe(true);
    const input = s.host.querySelector('.lfx-mp-chatinput');
    expect(input.maxLength).toBe(200);
    expect(s.ui.isOpen()).toBe(true);
    const down = new KeyboardEvent('keydown', { key: 'w', bubbles: true });
    const spy = vi.fn();
    document.addEventListener('keydown', spy);
    input.dispatchEvent(down);
    expect(spy).not.toHaveBeenCalled();
    input.value = ' Hallo ‮ Welt ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(s.say).toHaveBeenCalledWith('Hallo Welt');
    expect(s.ui.isOpen()).toBe(false);
    expect(s.ctx.overlay.close).toHaveBeenCalled();
    s.ui.open();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(s.say).toHaveBeenCalledTimes(1);
    expect(s.ui.isOpen()).toBe(false);
    s.ui.open();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(s.ui.isOpen()).toBe(false);
    document.removeEventListener('keydown', spy);
  });

  it('Rate: Eingabe bleibt offen, Hinweis erscheint; Chat aus oder VR öffnet nichts', () => {
    const s = setup();
    s.say.mockReturnValueOnce({ ok: false, why: 'rate' });
    s.ui.open();
    const input = s.host.querySelector('.lfx-mp-chatinput');
    input.value = 'x';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(s.ui.isOpen()).toBe(true);
    expect(s.host.querySelector('.lfx-mp-chatnote').textContent).toMatch(/schnell/);
    s.ui.close();
    s.setOn(false);
    expect(s.ui.open()).toBe(false);
    s.setOn(true);
    s.st.xr = true;
    expect(s.ui.open()).toBe(false);
  });

  it('offene Eingabe zeigt den ganzen Verlauf (scrollbar), dispose räumt das DOM', () => {
    const s = setup();
    for (let i = 0; i < 20; i++) s.model.receive({ c: 2, x: `m${i}` });
    s.ui.open();
    expect(s.host.querySelectorAll('.lfx-mp-chatline').length).toBe(20);
    expect(s.host.querySelector('.lfx-mp-chatlog').style.pointerEvents).toBe('auto');
    s.ui.dispose();
    expect(s.host.querySelector('.lfx-mp-chatlog')).toBeNull();
    expect(s.host.querySelector('.lfx-mp-chatin')).toBeNull();
  });
});

describe('Chat-Teil (createChatPart)', () => {
  function part(o = {}) {
    const t = mkCtx(o);
    const handlers = {};
    const sent = [];
    let prefs = { on: true, name: true, film: false, chat: true, mute: [], hint: true };
    const list = [{ c: 2, k: K2, n: 'Berta', f: 5, r: 0, devs: 1 }];
    const core = {
      ctx: t.ctx, send: (m) => { sent.push(m); return true; }, me: () => ({ c: 1, k: K1 }), cap: () => true, active: () => true,
      peers: { list: () => list, name: (c) => (c === 2 ? 'Berta' : 'Jemand'), get: (c) => (c === 2 ? { c, figure: fig(0, 1.7, -4) } : null) },
      prefs: () => prefs, toast: vi.fn(), on: (ty, fn) => { handlers[ty] = fn; return () => { delete handlers[ty]; }; },
      ...(o.setPref ? { setPref: (p) => { prefs = { ...prefs, ...p }; } } : {}),
    };
    const h = createChatPart(core);
    return { ...t, h, core, sent, handlers, setPrefs: (p) => { prefs = { ...prefs, ...p }; } };
  }

  it('empfängt m: Fenster und Blase; eigene Nachricht nur im Fenster', () => {
    const p = part();
    p.handlers.m({ t: 'm', c: 2, x: 'Hallo!', s: 1 });
    p.handlers.m({ t: 'm', c: 1, x: 'ich', s: 2 });
    p.h.tick(1);
    expect(p.host.querySelectorAll('.lfx-mp-chatline').length).toBe(2);
    expect(p.host.querySelectorAll('.lfx-mp-say').length).toBe(1);
    expect(p.host.querySelector('.lfx-mp-say').textContent).toBe('Hallo!');
  });

  it('say: sendet m, Rate 5 je 10 s lokal, kein Senden in VR oder ohne Chat-Schalter', () => {
    const p = part();
    for (let i = 0; i < 5; i++) expect(p.h.say(`n${i}`)).toBe(true);
    expect(p.h.say('zu viel')).toBe(false);
    expect(p.sent.length).toBe(5);
    expect(p.sent[0]).toEqual({ t: 'm', x: 'n0' });
    const q = part();
    q.st.xr = true;
    expect(q.h.say('vr')).toBe(false);
    q.st.xr = false;
    q.setPrefs({ chat: false });
    expect(q.h.say('aus')).toBe(false);
    expect(q.sent.length).toBe(0);
  });

  it('Aktion chat: öffnet nur bei Verbindung und Chat an; setMuted blendet aus', () => {
    const p = part({ setPref: true });
    expect(p.st.action()).toBe(true);
    p.h.close();
    p.handlers.m({ c: 2, x: 'laut' });
    p.h.tick(1);
    expect(p.host.querySelectorAll('.lfx-mp-chatline').length).toBe(1);
    expect(p.h.setMuted(K2, true)).toBe(true);
    expect(p.h.isMuted(K2)).toBe(true);
    expect(p.host.querySelectorAll('.lfx-mp-say').length).toBe(0);
    p.h.tick(1);
    expect(p.host.querySelectorAll('.lfx-mp-chatline').length).toBe(0);
    p.handlers.m({ c: 2, x: 'noch laut' });
    p.h.tick(1);
    expect(p.host.querySelectorAll('.lfx-mp-chatline').length).toBe(0);
    expect(p.host.querySelectorAll('.lfx-mp-say').length).toBe(0);
    expect(p.h.setMuted(K1, true)).toBe(false); // eigenes k nie
    p.setPrefs({ chat: false });
    expect(p.st.action()).toBe(false);
  });

  it('stop räumt Fenster und Blasen, Provider netchat vorhanden', () => {
    const p = part();
    p.handlers.m({ c: 2, x: 'x' });
    p.h.tick(1);
    p.h.stop();
    expect(p.host.querySelectorAll('.lfx-mp-say').length).toBe(0);
    expect(p.host.querySelector('.lfx-mp-chatlog').hidden).toBe(true);
    expect(typeof p.st.provided.netchat.open).toBe('function');
    p.h.dispose();
    expect(p.host.querySelector('.lfx-mp-chatlog')).toBeNull();
  });
});

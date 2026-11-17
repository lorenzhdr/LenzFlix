// @vitest-environment jsdom
// Mehrspieler (lfx-mp.1, Welle b): Emotes. Tabelle/Cooldown/Zustand (net/emotes.js), Rad und Teil (net/emote-ui.js),
// Emote-Zustand fremder Figuren (net/peers.js). Kein Netzwerk: Kontext, Figuren und Transport sind Fakes.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Scene, PerspectiveCamera, Object3D } from 'three';
import { EMOTES, COOLDOWN_MS, findEmote, createCooldown, startRemote, stepRemote, endedByPose } from '../src/js/store3d/net/emotes.js';
import { createEmoteUi, createEmotes } from '../src/js/store3d/net/emote-ui.js';
import { createPeers } from '../src/js/store3d/net/peers.js';
import { createFrame } from '../src/js/store3d/net/frame.js';
import { PART_FACTORIES } from '../src/js/store3d/net/parts.js';
import { ANIMS, timedDuration } from '../src/js/store3d/npc/anim.js';
import { EMOTE, EMOTE_ANIM, normalizeOut } from '../src/js/store3d/net/proto.js';

describe('emotes (rein)', () => {
  it('8 Emotes, Codes 1..8 wie im Vertrag, jede Animation existiert in ANIMS', () => {
    expect(EMOTES.map((e) => e.code)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(EMOTES.map((e) => e.anim)).toEqual(['wave', 'cheer', 'point', 'sit', 'dance', 'clap', 'thumbs', 'bow']);
    for (const e of EMOTES) {
      expect(ANIMS).toContain(e.anim);
      expect(e.anim).toBe(EMOTE_ANIM[e.code]);
      expect(e.label).toBeTruthy();
      expect(e.verb.startsWith('Du ')).toBe(true);
    }
    expect(EMOTES.map((e) => e.key)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    expect(EMOTE.DANCE).toBe(5);
  });

  it('findEmote: Code, id, Beschriftung, ungültig → null', () => {
    expect(findEmote(5).anim).toBe('dance');
    expect(findEmote('7').id).toBe('thumbs');
    expect(findEmote('Klatschen').code).toBe(6);
    expect(findEmote(' bow ').code).toBe(8);
    expect(findEmote(0)).toBeNull();
    expect(findEmote(9)).toBeNull();
    expect(findEmote('nix')).toBeNull();
    expect(findEmote(null)).toBeNull();
  });

  it('Cooldown: 1,5 s zwischen zwei Emotes', () => {
    let t = 1000;
    const cd = createCooldown({ now: () => t });
    expect(cd.ready()).toBe(true);
    cd.mark();
    expect(cd.ready()).toBe(false);
    t += COOLDOWN_MS - 1;
    expect(cd.ready()).toBe(false);
    expect(cd.left()).toBe(1);
    t += 1;
    expect(cd.ready()).toBe(true);
  });

  it('Zustand bei Fremden: Dauer aus anim.js, Hinsetzen ohne Dauer, Ende durch Pose nach dem Empfang', () => {
    const w = startRemote(1, 1000);
    expect(w.name).toBe('wave');
    expect(w.dur).toBe(timedDuration('wave'));
    expect(startRemote(5, 0).dur).toBe(4);
    expect(startRemote(4, 0).dur).toBe(Infinity);
    expect(startRemote(0, 0)).toBeNull();
    expect(stepRemote(w, 2)).toBe(true);
    expect(stepRemote(w, 1)).toBe(false);
    const st = startRemote(2, 1000);
    expect(endedByPose(st, [{ t: 900, a: 1 }])).toBe(false); // vor dem Empfang
    expect(endedByPose(st, [{ t: 1000, a: 1 }])).toBe(false); // gleichzeitig zählt nicht
    expect(endedByPose(st, [{ t: 1100, a: 0 }, { t: 1200, a: 7 }])).toBe(false);
    for (const a of [1, 2, 3, 4, 6, 8]) expect(endedByPose(st, [{ t: 1100, a }])).toBe(true);
  });

  it('Nachricht e geht durch normalizeOut (1..8), sonst verworfen', () => {
    expect(normalizeOut({ t: 'e', e: 5 })).toEqual({ t: 'e', e: 5 });
    expect(normalizeOut({ t: 'e', e: NaN })).toBeNull();
  });
});

// ------------------------------------------------------------------ Rad und Teil
function fakeCtx(o = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const st = { xr: false, overlay: null, actions: new Map() };
  const ctx = {
    isTouch: !!o.touch,
    xr: { presenting: () => st.xr, toast: vi.fn() },
    overlay: {
      open: vi.fn((el, op) => { if (st.overlay) ctx.overlay.close(); host.appendChild(el); st.overlay = { el, onClose: op.onClose }; }),
      close: vi.fn(() => { const s = st.overlay; if (!s) return; st.overlay = null; if (s.el.parentNode) s.el.parentNode.removeChild(s.el); if (s.onClose) s.onClose(); }),
      isOpen: () => !!st.overlay,
    },
    input: { onAction: vi.fn((n, fn) => { st.actions.set(n, fn); return () => st.actions.delete(n); }) },
  };
  return { ctx, st, host };
}
const key = (el, code) => { const e = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }); el.dispatchEvent(e); return e; };

describe('Emote-Rad', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('baut 8 Knöpfe mit textContent, Fokus auf dem ersten, Ziffernhinweise nur am Desktop', () => {
    const { ctx, host } = fakeCtx();
    const onPick = vi.fn(() => true);
    const ui = createEmoteUi({ ctx, onPick });
    expect(ui.open()).toBe(true);
    const bs = host.querySelectorAll('.lfx-mp-emote');
    expect(bs.length).toBe(8);
    expect(bs[0].textContent).toContain('Winken');
    expect(host.querySelectorAll('.lfx-mp-emote-key').length).toBe(8);
    expect(document.activeElement).toBe(bs[0]);
    expect(host.querySelector('.lfx-mp-emotes img, .lfx-mp-emotes script')).toBeNull();
    ui.close();
    const t = fakeCtx({ touch: true });
    const ui2 = createEmoteUi({ ctx: t.ctx, onPick });
    ui2.open();
    expect(t.host.querySelectorAll('.lfx-mp-emote-key').length).toBe(0);
  });

  it('Klick wählt und schließt; Ziffer 5 wählt Tanzen; Pfeile bewegen den Fokus; T schließt', () => {
    const { ctx, host } = fakeCtx();
    const picked = [];
    const ui = createEmoteUi({ ctx, onPick: (e) => { picked.push(e.id); return true; } });
    ui.open();
    host.querySelectorAll('.lfx-mp-emote')[2].click();
    expect(picked).toEqual(['point']);
    expect(ui.isOpen()).toBe(false);
    expect(host.querySelector('.lfx-mp-emotes')).toBeNull();
    ui.open();
    const bs = host.querySelectorAll('.lfx-mp-emote');
    key(bs[0], 'ArrowRight');
    expect(document.activeElement).toBe(bs[1]);
    key(bs[1], 'ArrowLeft');
    key(bs[0], 'ArrowLeft');
    expect(document.activeElement).toBe(bs[7]);
    key(bs[7], 'Digit5');
    expect(picked).toEqual(['point', 'dance']);
    ui.open();
    const e = key(host.querySelector('.lfx-mp-emote'), 'KeyT');
    expect(e.defaultPrevented).toBe(true);
    expect(ui.isOpen()).toBe(false);
  });

  it('Klick auf den Hintergrund und Schließen-Knopf schließen ohne Auswahl; in VR öffnet nichts', () => {
    const { ctx, st, host } = fakeCtx();
    const onPick = vi.fn(() => true);
    const ui = createEmoteUi({ ctx, onPick });
    ui.open();
    host.querySelector('.lfx-mp-emotes').click();
    expect(ui.isOpen()).toBe(false);
    ui.open();
    host.querySelector('.lfx-mp-emotes-hub').click();
    expect(ui.isOpen()).toBe(false);
    expect(onPick).not.toHaveBeenCalled();
    st.xr = true;
    expect(ui.open()).toBe(false);
  });

  it('wird das Overlay von außen geschlossen (Esc), räumt das Rad auf', () => {
    const { ctx } = fakeCtx();
    const ui = createEmoteUi({ ctx, onPick: () => true });
    ui.open();
    ctx.overlay.close();
    expect(ui.isOpen()).toBe(false);
    ui.close(); // doppelt ok
  });
});

describe('Teil emotes', () => {
  afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks(); });
  function setup(o = {}) {
    const f = fakeCtx(o);
    const sent = [];
    const state = { live: true, caps: new Set(['emote']), on: true, ok: true };
    const core = {
      ctx: f.ctx, active: () => state.live, cap: (n) => state.caps.has(n), prefs: () => ({ on: state.on }),
      send: vi.fn((m) => { if (!state.ok) return false; sent.push(m); return true; }), toast: vi.fn(),
    };
    const part = createEmotes(core);
    return { ...f, core, state, sent, part };
  }

  it('ist als Teil emotes in der Registry eingetragen', () => {
    expect(PART_FACTORIES.emotes).toBe(createEmotes);
  });

  it('Aktion emote öffnet das Rad nur bei aktivem Mehrspieler mit cap emote; sonst nicht verbraucht', () => {
    const e = setup();
    const act = e.st.actions.get('emote');
    expect(act()).toBe(true);
    expect(e.part.isOpen()).toBe(true);
    e.part.stop();
    e.state.caps.clear();
    expect(act()).toBe(false);
    e.state.caps.add('emote');
    e.state.live = false;
    expect(act()).toBe(false);
    e.state.live = true;
    e.state.on = false;
    expect(act()).toBe(false);
    e.state.on = true;
    e.st.xr = true;
    expect(act()).toBe(false);
  });

  it('Auswahl sendet e mit Code und zeigt kurzen Hinweis', () => {
    const e = setup();
    e.st.actions.get('emote')();
    e.host.querySelectorAll('.lfx-mp-emote')[0].click();
    expect(e.sent).toEqual([{ t: 'e', e: 1 }]);
    expect(e.ctx.xr.toast).toHaveBeenCalledWith('Du winkst', expect.any(Number));
    expect(e.part.isOpen()).toBe(false);
  });

  it('Cooldown: zweites Emote binnen 1,5 s wird nicht gesendet, danach wieder', () => {
    let t = 5000;
    vi.spyOn(Date, 'now').mockImplementation(() => t);
    const e = setup();
    expect(e.part.emote('dance')).toBe(true);
    expect(e.part.emote('clap')).toBe(false);
    expect(e.sent).toEqual([{ t: 'e', e: 5 }]);
    t += COOLDOWN_MS;
    expect(e.part.emote(6)).toBe(true);
    expect(e.sent.length).toBe(2);
  });

  it('emote(x): ungültig, nicht verbunden oder Sendefehler → false, kein Cooldown bei Sendefehler', () => {
    const e = setup();
    expect(e.part.emote('tanzt?')).toBe(false);
    e.state.ok = false;
    expect(e.part.emote(1)).toBe(false);
    e.state.ok = true;
    expect(e.part.emote(1)).toBe(true);
    e.state.live = false;
    expect(e.part.emote(2)).toBe(false);
  });

  it('stop() schließt das Rad, dispose() entfernt die Aktion', () => {
    const e = setup();
    e.part.open();
    expect(e.part.isOpen()).toBe(true);
    e.part.stop();
    expect(e.part.isOpen()).toBe(false);
    e.part.dispose();
    expect(e.st.actions.has('emote')).toBe(false);
    expect(e.part.open()).toBe(false);
  });
});

// ------------------------------------------------------------------ Fremdfiguren
function fakeFigure(o) {
  const root = new Object3D();
  root.visible = true;
  if (o.parent) o.parent.add(root);
  const f = {
    root, look: o.look, bones: { armR: new Object3D() }, disposed: false, setAnim: vi.fn(), setName: vi.fn(),
    headWorld: (out) => out.set(root.position.x, root.position.y + 1.9, root.position.z),
    dispose: vi.fn(() => { f.disposed = true; if (root.parent) root.parent.remove(root); }),
  };
  return f;
}

describe('Emote bei Fremdfiguren (peers)', () => {
  let env = null;
  afterEach(() => { if (env) { env.peers.dispose(); env.dom.remove(); } env = null; });
  const frame = createFrame({ w: 12.5, d: 18 });

  function setup() {
    const dom = document.createElement('div');
    const canvas = document.createElement('canvas');
    dom.appendChild(canvas);
    document.body.appendChild(dom);
    const figs = [];
    const state = { now: 10000 };
    const providers = {
      npc: { figure: vi.fn((fo) => { const f = fakeFigure(fo); figs.push(f); return f; }), reserve: vi.fn() },
      areas: { at: () => 'street' },
      city: { visible: () => ({ street: true }) },
    };
    const ctx = {
      scene: new Scene(), camera: new PerspectiveCamera(70, 1.5, 0.05, 90), renderer: { domElement: canvas },
      isPhone: false, isTouch: false, quality: () => 'high', xr: { presenting: () => false },
      catalog: { items: new Map() }, deps: { imageUrl: (id) => `/img/${id}` }, loadTexture: vi.fn(), use: (n) => providers[n],
    };
    ctx.camera.position.set(0, 1.6, 0);
    const peers = createPeers({ ctx, frame, serverNow: () => state.now, me: () => ({ c: 1, k: 'aaaaaaaaaaaa' }) });
    env = { dom, state, figs, peers };
    peers.welcome({ c: 1, s: state.now, peers: [{ c: 2, k: '000000000002', n: 'P2', f: 1, q: [300, 0, 400, 0, 0, 0, 0] }] });
    return env;
  }
  const run = (e, ms, step = 50) => { for (let t = 0; t < ms; t += step) { e.state.now += step; e.peers.tick(step / 1000); } };
  const names = (f) => f.setAnim.mock.calls.map((c) => c[0]);

  it('Emote e{c,e} im Frame b spielt die Animation auf der Figur (restart, dann idle)', () => {
    const e = setup();
    run(e, 200);
    e.peers.ev({ t: 'b', s: e.state.now, p: [], ev: [{ t: 'e', c: 2, e: 5 }] });
    run(e, 100);
    const f = e.figs[0];
    const call = f.setAnim.mock.calls.find((c) => c[0] === 'dance');
    expect(call).toBeTruthy();
    expect(call[1]).toMatchObject({ restart: true, then: 'idle' });
    // läuft weiter: kein erneuter Start, keine Gehanimation darüber
    run(e, 500);
    expect(names(f).filter((n) => n === 'dance').length).toBe(1);
    expect(names(f).slice(names(f).indexOf('dance') + 1)).toEqual([]);
  });

  it('endet nach der Dauer und fällt auf die normale Animation zurück', () => {
    const e = setup();
    run(e, 200);
    e.peers.ev({ t: 'b', s: e.state.now, p: [], ev: [{ t: 'e', c: 2, e: 6 }] }); // klatschen 2,4 s
    run(e, 2800);
    const n = names(e.figs[0]);
    expect(n).toContain('clap');
    expect(n[n.length - 1]).toBe('idle');
  });

  it('eine spätere Gehpose beendet das Emote', () => {
    const e = setup();
    run(e, 200);
    e.peers.ev({ t: 'b', s: e.state.now, p: [[2, 300, 0, 400, 0, 0, 0, 0, 0]], ev: [{ t: 'e', c: 2, e: 1 }] });
    run(e, 400);
    expect(names(e.figs[0]).at(-1)).toBe('wave');
    e.peers.ev({ t: 'b', s: e.state.now + 100, p: [[2, 330, 0, 400, 0, 0, 1, 0, 0]], ev: [] });
    run(e, 800);
    expect(names(e.figs[0]).at(-1)).toBe('walk');
  });

  it('Hinsetzen läuft ohne Dauer bis zur Bewegung; ungültige Codes und fremde c werden ignoriert', () => {
    const e = setup();
    run(e, 200);
    e.peers.ev({ t: 'b', s: e.state.now, p: [], ev: [{ t: 'e', c: 2, e: 4 }, { t: 'e', c: 99, e: 1 }, { t: 'e', c: 2, e: 77 }] });
    run(e, 8000);
    expect(names(e.figs[0]).at(-1)).toBe('sit');
    e.peers.ev({ t: 'b', s: e.state.now + 100, p: [[2, 330, 0, 400, 0, 0, 1, 0, 0]], ev: [] });
    run(e, 800);
    expect(names(e.figs[0]).at(-1)).toBe('walk');
  });

  it('das eigene Emote (c = ich) zeigt sich nicht', () => {
    const e = setup();
    run(e, 200);
    e.peers.ev({ t: 'b', s: e.state.now, p: [], ev: [{ t: 'e', c: 1, e: 1 }] });
    run(e, 200);
    expect(names(e.figs[0])).not.toContain('wave');
  });

  it('Figur, die erst nach dem Emote entsteht, zeigt es trotzdem', () => {
    const e = setup();
    e.peers.ev({ t: 'b', s: e.state.now, p: [], ev: [{ t: 'e', c: 2, e: 7 }] });
    run(e, 300);
    expect(names(e.figs[0])).toContain('thumbs');
  });
});

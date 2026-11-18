// @vitest-environment jsdom
// Modul avatar (1.17.0): Gate „Mitgliedsantrag“, Provider-API, Editor-Sitzungen. Studio/WebGL, Profil, Ausweis und ctx sind Fakes.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const studioMock = vi.hoisted(() => {
  const made = [];
  const create = () => {
    const s = {
      scene: { add: vi.fn() },
      figure: vi.fn(),
      setLook: vi.fn(),
      rotate: vi.fn(),
      setYaw: vi.fn(),
      update: vi.fn(),
      cameraPose: vi.fn(() => ({ pos: [0, 1, -3], look: [0, 1, 0] })),
      portrait: vi.fn(() => ({ fake: 'canvas' })),
      dispose: vi.fn(),
    };
    made.push(s);
    return s;
  };
  return { made, create };
});
vi.mock('../src/js/store3d/char/studio.js', () => ({ createStudio: studioMock.create }));

import avatar from '../src/js/store3d/modules/avatar.js';
import { defaultCode, equal, F, LEN, outfitHash, toRender } from '../src/js/store3d/char/look2.js';
import { UNLOCKS } from '../src/js/store3d/char/unlocks.js';

const click = (n) => n.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const btn = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent === text);

function makeProfile({ state = 'ok', slots = [null, null, null], act = 0 } = {}) {
  const data = { v: 1, fig: { act, slots }, seen: { t: 0 } };
  const subs = new Set();
  let st = state;
  const p = {
    get: () => data,
    update: vi.fn((fn) => fn(data)),
    state: () => st,
    onRemote(fn) { subs.add(fn); return () => subs.delete(fn); },
    remote(mut) { mut(data); for (const fn of [...subs]) fn(data); },
    setState(s) { st = s; },
    data,
  };
  return p;
}

function makeCtx({ profile, xr = false, discover = [] } = {}) {
  const providers = {};
  const handlers = {};
  const rig = { name: 'rig' };
  const storeScene = { add: vi.fn(), name: 'store' };
  const host = document.createElement('div');
  document.body.append(host);
  let cur = null;
  const log = [];
  const ctx = {
    deps: { profile, user: { name: 'Lenz' } },
    camera: { parent: rig, fov: 60, aspect: 1.7 },
    scene: storeScene,
    renderer: { fake: true },
    log,
    xrOn: xr,
    stage: { setScene: vi.fn((s) => log.push(`scene:${s ? 'studio' : 'store'}`)), isStore: () => true },
    player: { camera: { flyTo: vi.fn(() => Promise.resolve(true)), release: vi.fn() } },
    overlay: {
      open: vi.fn((el, o) => {
        if (cur) { const c = cur; cur = null; c.el.remove(); if (c.o.onClose) c.o.onClose(); }
        cur = { el, o };
        host.append(el);
        log.push('overlay:open');
      }),
      close: vi.fn(() => {
        const c = cur;
        if (!c) return;
        cur = null;
        c.el.remove();
        log.push('overlay:close');
        if (c.o.onClose) c.o.onClose();
      }),
      isOpen: () => !!cur,
    },
    xr: { presenting: () => ctx.xrOn, toast: vi.fn() },
    on(ev, fn) { (handlers[ev] = handlers[ev] || new Set()).add(fn); return () => handlers[ev].delete(fn); },
    emit(ev, ...a) { for (const fn of [...(handlers[ev] || [])]) fn(...a); },
    use: (n) => providers[n],
    provide(n, impl) { providers[n] = impl; return () => { delete providers[n]; }; },
    providers,
    host,
    rig,
    storeScene,
    curOverlay: () => cur,
  };
  providers.discover = { list: () => UNLOCKS.map((u) => ({ id: u.discover, found: discover.includes(u.discover) })) };
  providers.sound = { play: vi.fn((n) => log.push(`sfx:${n}`)) };
  return ctx;
}

const tick = async (ms = 0) => { await vi.advanceTimersByTimeAsync(ms); };

let ctx;
let handle;
beforeEach(() => {
  vi.useFakeTimers();
  studioMock.made.length = 0;
  document.body.innerHTML = '';
});
afterEach(() => {
  try { if (handle) handle.dispose(); } catch { /* egal */ }
  handle = null;
  vi.useRealTimers();
});

const boot = (opts) => {
  ctx = makeCtx(opts);
  handle = avatar.init(ctx);
  return ctx.providers.avatar;
};

const slotOf = (code, extra = {}) => ({ l: code, t: 1, ...extra });

describe('avatar: needsGate und Provider-Daten', () => {
  it('needsGate je Profilzustand', () => {
    expect(boot({ profile: makeProfile() }).needsGate()).toBe(true);
    handle.dispose();
    expect(boot({ profile: makeProfile({ slots: [slotOf(defaultCode()), null, null] }) }).needsGate()).toBe(false);
    handle.dispose();
    expect(boot({ profile: makeProfile({ state: 'local', slots: [slotOf(defaultCode(), { prov: true }), null, null] }) }).needsGate()).toBe(false); // prov zählt
    handle.dispose();
    expect(boot({ profile: makeProfile({ slots: [slotOf([1, 2, 3]), null, null] }) }).needsGate()).toBe(true); // ungültiger Slot
    handle.dispose();
    const none = boot({ profile: undefined });
    expect(none.needsGate()).toBe(false);
    expect(none.code()).toBeNull();
    expect(none.look()).toBeNull();
  });

  it('code/look/slots/active/hash', () => {
    const a = defaultCode();
    const b = defaultCode(); b[F.hairStyle] = 6;
    const av = boot({ profile: makeProfile({ slots: [slotOf(a), slotOf(b), null], act: 1 }) });
    expect(av.active()).toBe(1);
    expect(equal(av.code(), b)).toBe(true);
    expect(av.look().v).toBe(2);
    expect(av.look().hairStyle).toBe('sidepart');
    expect(av.slots().map((s) => !!s)).toEqual([true, true, false]);
    expect(av.hash()).toBe(outfitHash(b));
  });

  it('ohne Figur: Stubwerte', () => {
    const av = boot({ profile: makeProfile() });
    expect(av.code()).toBeNull();
    expect(av.look()).toBeNull();
    expect(av.hash()).toBe('');
    expect(av.changedFor('richard')).toBe(false);
    expect(av.active()).toBe(0);
  });

  it('setSlot wechselt und meldet onChange', () => {
    const a = defaultCode();
    const b = defaultCode(); b[F.skin] = 9;
    const p = makeProfile({ slots: [slotOf(a), slotOf(b), null] });
    const av = boot({ profile: p });
    const fn = vi.fn();
    av.onChange(fn);
    av.setSlot(2); // leer
    av.setSlot(0); // schon aktiv
    expect(fn).not.toHaveBeenCalled();
    av.setSlot(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0].v).toBe(2);
    expect(equal(fn.mock.calls[0][1], b)).toBe(true);
    expect(p.data.fig.act).toBe(1);
    expect(av.lastChange()).toBeGreaterThan(0);
  });

  it('changedFor / markSeen über profile.seen', () => {
    const p = makeProfile({ slots: [slotOf(defaultCode()), null, null] });
    const av = boot({ profile: p });
    expect(av.changedFor('richard')).toBe(true);
    av.markSeen('richard');
    expect(av.changedFor('richard')).toBe(false);
    expect(av.changedFor('gabi')).toBe(true);
    expect(av.changedFor('unbekannt')).toBe(false);
    av.setCode(Object.assign(defaultCode(), { [F.topColor]: 5 }));
    expect(av.changedFor('richard')).toBe(true);
  });

  it('changeKind: hair bei nur Haarfeldern, outfit sonst, null ohne Änderung oder ohne Vorgeschichte', () => {
    const p = makeProfile({ slots: [slotOf(defaultCode()), null, null] });
    const av = boot({ profile: p });
    expect(av.changeKind('richard')).toBeNull(); // nie gesehen: Vorgeschichte unbekannt
    av.markSeen('richard');
    expect(av.changeKind('richard')).toBeNull(); // nichts geändert
    expect(p.data.seen.richardR).toEqual(expect.any(String));
    av.setCode(Object.assign(defaultCode(), { [F.hairColor]: 7 }));
    expect(av.changeKind('richard')).toBe('hair');
    av.setCode(Object.assign(defaultCode(), { [F.hairColor]: 7, [F.topColor]: 5 }));
    expect(av.changeKind('richard')).toBe('outfit');
    expect(av.changeKind('unbekannt')).toBeNull();
  });

  it('setCode commit:false = nur Vorschau, kein onChange, kein Schreiben', () => {
    const p = makeProfile({ slots: [slotOf(defaultCode()), null, null] });
    const av = boot({ profile: p });
    const ch = vi.fn();
    const pv = vi.fn();
    av.onChange(ch);
    av.onPreview(pv);
    const c = defaultCode(); c[F.hairStyle] = 9;
    av.setCode(c, { commit: false });
    expect(pv).toHaveBeenCalledTimes(1);
    expect(ch).not.toHaveBeenCalled();
    expect(p.update).not.toHaveBeenCalled();
    av.setCode(c);
    expect(ch).toHaveBeenCalledTimes(1);
    expect(av.code()[F.hairStyle]).toBe(9);
    av.setCode(c); // gleicher Code: kein weiteres onChange
    expect(ch).toHaveBeenCalledTimes(1);
  });

  it('randomize und setColor übernehmen; Freischaltungen fließen ein', () => {
    const p = makeProfile({ slots: [slotOf(defaultCode()), null, null] });
    const av = boot({ profile: p });
    const ch = vi.fn();
    av.onChange(ch);
    av.setColor('top', 3);
    expect(av.code()[F.topColor]).toBe(3);
    av.setColor('hair', 99); // ungültig
    av.setColor('nix', 1);
    expect(ch).toHaveBeenCalledTimes(1);
    av.setColor('sole', 4);
    expect(av.code()[F.sole]).toBe(4);
    av.randomize({ commit: false });
    expect(ch).toHaveBeenCalledTimes(2);
    av.randomize();
    expect(av.code().length).toBe(LEN);
  });

  it('portrait über das Studio, gecacht dort', async () => {
    const av = boot({ profile: makeProfile({ slots: [slotOf(defaultCode()), null, null] }) });
    const cv = await av.portrait(defaultCode());
    expect(cv).toEqual({ fake: 'canvas' });
    expect(studioMock.made.length).toBe(1);
    expect(studioMock.made[0].portrait.mock.calls[0][0]).toBe(ctx.renderer);
    await av.portrait(defaultCode());
    expect(studioMock.made.length).toBe(1); // eine Studio-Instanz
  });
});

describe('avatar: Gate', () => {
  it('Ablauf: Formular, Esc wirkungslos, Fertig → Slot 0, ensure vor showCard, Rückkehr', async () => {
    const p = makeProfile({ state: 'ok' });
    const av = boot({ profile: p });
    const order = [];
    let release;
    ctx.providers.member = {
      ensure: vi.fn(() => { order.push('ensure'); }),
      cardData: vi.fn(() => ({ name: 'Lenz', no: '000001', code: av.code() })),
      showCard: vi.fn((data, o) => { order.push(`show:${o.mode}`); ctx.log.push('card'); return new Promise((r) => { release = () => { order.push('shown'); r(); }; }); }),
    };
    const ch = vi.fn();
    av.onChange(ch);
    let resolved = false;
    const gp = av.gate().then(() => { resolved = true; });
    await tick();
    let el = ctx.curOverlay().el;
    expect(el.classList.contains('lfx-store-char--gate')).toBe(true);
    expect(ctx.overlay.open.mock.calls[0][1]).toMatchObject({ modal: true }); // Esc-fest (Runtime überspringt Esc)
    expect(el.querySelector('.lfx-store-char__input').value).toBe('Lenz');
    expect(el.querySelector('.lfx-store-char__input').readOnly).toBe(true);
    expect(ctx.stage.setScene).toHaveBeenCalledWith(studioMock.made[0].scene);
    expect(studioMock.made[0].scene.add).toHaveBeenCalledWith(ctx.rig); // Kamera-Rig in die Studio-Szene
    expect(ctx.player.camera.flyTo).toHaveBeenCalled();
    expect(av.gate()).toBe(gp ? av.gate() : null); // zweiter Aufruf teilt dieselbe Sitzung (kein zweites Formular)
    expect(ctx.overlay.open).toHaveBeenCalledTimes(1);

    // Erzwungenes Schließen von außen (Esc selbst fängt die Runtime per modal ab): Sitzung endet, die Gate-Schleife öffnet ein neues Formular
    ctx.overlay.close();
    await tick();
    expect(ctx.overlay.open).toHaveBeenCalledTimes(2);
    el = ctx.curOverlay().el;
    expect(el.classList.contains('lfx-store-char--gate')).toBe(true);
    expect(resolved).toBe(false);
    expect(p.update).not.toHaveBeenCalled();
    expect(av.needsGate()).toBe(true);

    // Fertig
    click(btn(el, 'Fertig'));
    await tick(100);
    expect(el.querySelector('.lfx-store-char__stamp').classList.contains('is-stamped')).toBe(true);
    expect(ctx.log).toContain('sfx:stamp');
    await tick(400);
    expect(el.querySelector('.lfx-store-char-flash')).not.toBeNull(); // Blitz läuft
    expect(ctx.log).toContain('sfx:flash');
    await tick(200);
    expect(order).toEqual(['ensure', 'show:gate']);
    expect(resolved).toBe(false); // wartet auf den Ausweis
    expect(p.data.fig.slots[0]).toMatchObject({ t: expect.any(Number) });
    expect(p.data.fig.slots[0].prov).toBeUndefined(); // Konto ok
    expect(p.data.fig.act).toBe(0);
    expect(av.needsGate()).toBe(false);
    expect(av.code()).not.toBeNull();
    expect(ch).toHaveBeenCalledTimes(1);
    expect(ctx.log.filter((l) => l.startsWith('scene:')).pop()).toBe('scene:studio'); // Studio bis nach dem Ausweis
    release();
    await tick();
    await gp;
    expect(resolved).toBe(true);
    expect(ctx.log.filter((l) => l.startsWith('scene:')).pop()).toBe('scene:store');
    expect(ctx.storeScene.add).toHaveBeenCalledWith(ctx.rig); // Rig zurück
    expect(ctx.player.camera.release).toHaveBeenCalled();
    expect(ctx.overlay.isOpen()).toBe(false);
  });

  it('prov, wenn das Konto nicht erreicht ist', async () => {
    const p = makeProfile({ state: 'local' });
    const av = boot({ profile: p });
    const gp = av.gate();
    await tick();
    click(btn(ctx.curOverlay().el, 'Fertig'));
    await tick(1000);
    await gp;
    expect(p.data.fig.slots[0].prov).toBe(true);
    expect(av.needsGate()).toBe(false); // danach läuft das Intro
    expect(av.look()).not.toBeNull();
  });

  it('ohne member-Provider läuft das Gate trotzdem durch', async () => {
    const av = boot({ profile: makeProfile({ state: 'unknown' }) });
    const gp = av.gate();
    await tick();
    click(btn(ctx.curOverlay().el, 'Fertig'));
    await tick(1000);
    await gp;
    expect(av.code()).not.toBeNull();
  });

  it('Konto-Look kommt später: er gewinnt, Toast, onChange; offenes Gate erübrigt sich', async () => {
    const p = makeProfile({ state: 'unknown' });
    const av = boot({ profile: p });
    const ch = vi.fn();
    av.onChange(ch);
    let resolved = false;
    const gp = av.gate().then(() => { resolved = true; });
    await tick();
    expect(ctx.overlay.isOpen()).toBe(true);
    const acc = defaultCode(); acc[F.hairStyle] = 11;
    p.remote((d) => { d.fig.slots[0] = { l: acc, t: 5 }; });
    await tick();
    await gp;
    expect(resolved).toBe(true);
    expect(ctx.overlay.isOpen()).toBe(false);
    expect(ctx.xr.toast).toHaveBeenCalledWith('Deine Figur vom Konto ist geladen.', expect.any(Number));
    expect(ch).toHaveBeenCalledTimes(1);
    expect(equal(av.code(), acc)).toBe(true);
  });

  it('prov-Look nach dem Gate: Konto-Look ohne prov gewinnt mit Toast', async () => {
    const mine = defaultCode();
    const p = makeProfile({ state: 'local', slots: [slotOf(mine, { prov: true }), null, null] });
    const av = boot({ profile: p });
    const ch = vi.fn();
    av.onChange(ch);
    const acc = defaultCode(); acc[F.skin] = 7;
    p.setState('ok');
    p.remote((d) => { d.fig.slots[0] = { l: acc, t: 9 }; });
    expect(equal(av.code(), acc)).toBe(true);
    expect(ctx.xr.toast).toHaveBeenCalledTimes(1);
    expect(ch).toHaveBeenCalledTimes(1);
    // spätere Änderung eines anderen Geräts (kein prov): onChange, kein zweiter Toast
    const acc2 = acc.slice(); acc2[F.skin] = 8;
    p.remote((d) => { d.fig.slots[0] = { l: acc2, t: 10 }; });
    expect(ch).toHaveBeenCalledTimes(2);
    expect(ctx.xr.toast).toHaveBeenCalledTimes(1);
  });

  it('Unverändertes Konto-Update meldet nichts', () => {
    const p = makeProfile({ slots: [slotOf(defaultCode()), null, null] });
    const av = boot({ profile: p });
    const ch = vi.fn();
    av.onChange(ch);
    p.remote((d) => { d.seen.t = 5; });
    expect(ch).not.toHaveBeenCalled();
  });

  it('XR: wartet, bis die Sitzung endet', async () => {
    const av = boot({ profile: makeProfile(), xr: true });
    let resolved = false;
    const gp = av.gate().then(() => { resolved = true; });
    await tick(50);
    expect(ctx.overlay.open).not.toHaveBeenCalled();
    expect(resolved).toBe(false);
    ctx.xrOn = false;
    ctx.emit('xr', false);
    await tick();
    expect(ctx.overlay.open).toHaveBeenCalledTimes(1);
    click(btn(ctx.curOverlay().el, 'Fertig'));
    await tick(1000);
    await gp;
    expect(resolved).toBe(true);
  });

  it('XR startet bei offenem Gate: Formular schließt, nach VR-Ende erneut', async () => {
    const av = boot({ profile: makeProfile() });
    const gp = av.gate();
    await tick();
    expect(ctx.overlay.isOpen()).toBe(true);
    ctx.xrOn = true;
    ctx.emit('xr', true);
    await tick();
    expect(ctx.overlay.isOpen()).toBe(false);
    ctx.xrOn = false;
    ctx.emit('xr', false);
    await tick();
    expect(ctx.overlay.isOpen()).toBe(true);
    handle.dispose();
    await gp;
  });

  it('reduced-motion: sanfter Blitz', async () => {
    window.matchMedia = vi.fn(() => ({ matches: true }));
    try {
      const av = boot({ profile: makeProfile() });
      const gp = av.gate();
      await tick();
      click(btn(ctx.curOverlay().el, 'Fertig'));
      await tick(200);
      const f = ctx.curOverlay().el.querySelector('.lfx-store-char-flash');
      expect(f && f.classList.contains('is-soft')).toBe(true);
      await tick(1000);
      await gp;
    } finally { delete window.matchMedia; }
  });

  it('dispose beendet ein offenes Gate und stellt die Bühne zurück', async () => {
    const av = boot({ profile: makeProfile() });
    const gp = av.gate();
    await tick();
    handle.dispose();
    await gp;
    expect(ctx.log.filter((l) => l.startsWith('scene:')).pop()).toBe('scene:store');
    expect(studioMock.made[0].dispose).toHaveBeenCalled();
    handle = null;
  });
});

describe('avatar: Editor-Sitzungen', () => {
  const withFigure = (over = {}) => makeProfile({ slots: [slotOf(defaultCode()), null, null], ...over });

  it('Übernehmen schreibt, meldet onChange einmal und liefert true', async () => {
    const p = withFigure();
    const av = boot({ profile: p });
    const ch = vi.fn();
    av.onChange(ch);
    const pr = av.openEditor('pause', 'hair');
    await tick();
    const el = ctx.curOverlay().el;
    expect(el.classList.contains('lfx-store-char--pause')).toBe(true);
    expect(el.querySelector('.lfx-store-char__tab.is-on').dataset.tab).toBe('hair');
    click(el.querySelector('.lfx-store-char__opt[data-value="8"]'));
    await tick(100);
    expect(studioMock.made[0].setLook).toHaveBeenCalled(); // Vorschau im Studio
    expect(ch).not.toHaveBeenCalled(); // nie während der Vorschau
    expect(p.update).not.toHaveBeenCalled();
    click(btn(el, 'Übernehmen'));
    expect(await pr).toBe(true);
    expect(ch).toHaveBeenCalledTimes(1);
    expect(av.code()[F.hairStyle]).toBe(8);
    expect(ctx.overlay.isOpen()).toBe(false);
    expect(ctx.log.filter((l) => l.startsWith('scene:')).pop()).toBe('scene:store');
  });

  it('Übernehmen ohne Änderung: true, aber kein onChange', async () => {
    const p = withFigure();
    const av = boot({ profile: p });
    const ch = vi.fn();
    av.onChange(ch);
    const pr = av.openEditor('pause');
    await tick();
    click(btn(ctx.curOverlay().el, 'Übernehmen'));
    expect(await pr).toBe(true);
    expect(ch).not.toHaveBeenCalled();
    expect(p.update).toHaveBeenCalledTimes(1);
  });

  it('Abbrechen / Esc: false, nichts geschrieben, kein onChange', async () => {
    const p = withFigure();
    const av = boot({ profile: p });
    const ch = vi.fn();
    av.onChange(ch);
    let pr = av.openEditor('pause', 'hair');
    await tick();
    click(ctx.curOverlay().el.querySelector('.lfx-store-char__opt[data-value="8"]'));
    click(btn(ctx.curOverlay().el, 'Abbrechen'));
    expect(await pr).toBe(false);
    pr = av.openEditor('chair', 'face');
    await tick();
    ctx.overlay.close(); // Esc der Bühne
    expect(await pr).toBe(false);
    expect(ch).not.toHaveBeenCalled();
    expect(p.update).not.toHaveBeenCalled();
    expect(av.code()[F.hairStyle]).toBe(0);
    expect(ctx.overlay.isOpen()).toBe(false);
  });

  it('zweiter Aufruf teilt die laufende Sitzung; ohne Figur false', async () => {
    const av = boot({ profile: withFigure() });
    const a = av.openEditor('pause');
    const b = av.openEditor('booth');
    await tick();
    expect(ctx.overlay.open).toHaveBeenCalledTimes(1);
    click(btn(ctx.curOverlay().el, 'Abbrechen'));
    expect(await a).toBe(false);
    expect(await b).toBe(false);
    handle.dispose();
    const av2 = boot({ profile: makeProfile() });
    expect(await av2.openEditor('pause')).toBe(false);
  });

  it('Vorschau gedrosselt (≤ 30 Hz)', async () => {
    const av = boot({ profile: withFigure() });
    const pr = av.openEditor('pause', 'hair');
    await tick();
    const el = ctx.curOverlay().el;
    const st = studioMock.made[0];
    for (let i = 0; i < 6; i++) click(el.querySelector(`.lfx-store-char__opt[data-value="${i + 1}"]`));
    expect(st.setLook.mock.calls.length).toBeLessThanOrEqual(1);
    await tick(40);
    expect(st.setLook.mock.calls.length).toBeLessThanOrEqual(2);
    expect(st.setLook.mock.calls.at(-1)[0].hairStyle).toBe('sidepart'); // letzter Wert, Index 6
    click(btn(el, 'Abbrechen'));
    await pr;
  });

  it('live: kein Studio, Vorschau über onPreview, null am Ende', async () => {
    const p = withFigure();
    const av = boot({ profile: p });
    const pv = vi.fn();
    const ch = vi.fn();
    av.onPreview(pv);
    av.onChange(ch);
    const pr = av.openEditor('chair', 'hair', { live: true });
    await tick();
    expect(ctx.stage.setScene).not.toHaveBeenCalled();
    expect(ctx.player.camera.flyTo).not.toHaveBeenCalled();
    expect(studioMock.made.length).toBe(0);
    const el = ctx.curOverlay().el;
    expect(el.classList.contains('is-live')).toBe(true);
    click(el.querySelector('.lfx-store-char__opt[data-value="4"]'));
    await tick(40);
    expect(pv).toHaveBeenCalled();
    expect(pv.mock.calls.at(-1)[0].hairStyle).toBe('bob');
    expect(ch).not.toHaveBeenCalled();
    click(btn(el, 'Abbrechen'));
    expect(await pr).toBe(false);
    expect(pv.mock.calls.at(-1)[0]).toBeNull();
    expect(ctx.stage.setScene).not.toHaveBeenCalled();
  });

  it('Reiterwechsel fährt die Kamera auf den Fokus', async () => {
    const av = boot({ profile: withFigure() });
    const pr = av.openEditor('pause');
    await tick();
    const n = ctx.player.camera.flyTo.mock.calls.length;
    click(ctx.curOverlay().el.querySelector('[data-tab="shoes"]'));
    expect(ctx.player.camera.flyTo.mock.calls.length).toBe(n + 1);
    expect(studioMock.made[0].cameraPose).toHaveBeenLastCalledWith('shoes', expect.objectContaining({ aspect: 1.7, fov: 60 }));
    click(btn(ctx.curOverlay().el, 'Abbrechen'));
    await pr;
  });

  it('in VR: Editor öffnet nicht, xrchar übernimmt', async () => {
    const av = boot({ profile: withFigure(), xr: true });
    ctx.providers.xrchar = { open: vi.fn(() => true) };
    expect(await av.openEditor('chair')).toBe(false);
    expect(ctx.providers.xrchar.open).toHaveBeenCalledTimes(1);
    expect(ctx.overlay.open).not.toHaveBeenCalled();
  });

  it('Freischaltungen aus discover sind im Editor wählbar', async () => {
    const u = UNLOCKS.find((x) => x.slot === 'hat');
    const av = boot({ profile: withFigure(), discover: [u.discover] });
    const pr = av.openEditor('pause', 'extras');
    await tick();
    const grp = [...ctx.curOverlay().el.querySelectorAll('fieldset')].find((f) => f.textContent.startsWith('Kopfbedeckung'));
    const b = grp.querySelector(`.lfx-store-char__opt[data-value="${u.code}"]`);
    expect(b.getAttribute('aria-disabled')).toBe('false');
    click(b);
    click(btn(ctx.curOverlay().el, 'Übernehmen'));
    expect(await pr).toBe(true);
    expect(av.look().hat.id).toBe(toRender(av.code()).hat.id);
    expect(av.code()[F.hat]).toBe(u.code);
  });

  it('Plätze: Neuer Platz wird mit Übernehmen gespeichert und aktiv', async () => {
    const p = withFigure({ state: 'local' });
    const av = boot({ profile: p });
    const pr = av.openEditor('pause', 'slots');
    await tick();
    click(ctx.curOverlay().el.querySelectorAll('.lfx-store-char__slot')[1].querySelector('button'));
    click(btn(ctx.curOverlay().el, 'Übernehmen'));
    expect(await pr).toBe(true);
    expect(av.active()).toBe(1);
    expect(av.slots()[1]).not.toBeNull();
    expect(p.data.fig.slots[1].prov).toBe(true);
    expect(p.data.fig.slots[0].prov).toBeUndefined(); // Platz 0 blieb unberührt
  });
});

describe('avatar: Gate bleibt sichtbar (Befund Sichtprüfung 1.17.0)', () => {
  it('abgelöstes Formular wird vom Wächter erneut eingehängt', async () => {
    const av = boot({ profile: makeProfile() });
    const gp = av.gate();
    await tick();
    const el = ctx.curOverlay().el;
    const opens = ctx.overlay.open.mock.calls.length;
    el.remove(); // Element weg, ohne dass onClose lief
    expect(el.isConnected).toBe(false);
    handle.update(0.016);
    expect(ctx.overlay.open.mock.calls.length).toBe(opens + 1);
    expect(ctx.overlay.open.mock.calls.at(-1)[0]).toBe(el);
    expect(ctx.overlay.open.mock.calls.at(-1)[1]).toMatchObject({ modal: true });
    expect(el.isConnected).toBe(true);
    handle.update(0.016);
    expect(ctx.overlay.open.mock.calls.length).toBe(opens + 1); // intakt: kein weiteres Öffnen
    handle.dispose();
    await gp;
  });

  it('fremdes Overlay verdrängt das Gate: neues Formular steht sofort wieder, Esc-fest', async () => {
    const av = boot({ profile: makeProfile() });
    const gp = av.gate();
    await tick();
    const first = ctx.curOverlay().el;
    ctx.overlay.close(); // wie overlayOpen eines anderen Moduls: onClose des Gates läuft
    await tick();
    const second = ctx.curOverlay().el;
    expect(second).not.toBe(first);
    expect(second.isConnected).toBe(true);
    expect(second.classList.contains('lfx-store-char--gate')).toBe(true);
    expect(ctx.overlay.open.mock.calls.at(-1)[1]).toMatchObject({ modal: true });
    handle.dispose();
    await gp;
  });

  it('Wächter bleibt außerhalb des Gates und ohne Sitzung still', async () => {
    const av = boot({ profile: makeProfile({ slots: [{ l: defaultCode(), t: 1 }, null, null] }) });
    handle.update(0.016);
    expect(ctx.overlay.open).not.toHaveBeenCalled();
    const pr = av.openEditor('pause');
    await tick();
    const n = ctx.overlay.open.mock.calls.length;
    ctx.curOverlay().el.remove();
    handle.update(0.016); // Editor (kein Pflicht-Gate): nicht erzwingen
    expect(ctx.overlay.open.mock.calls.length).toBe(n);
    handle.dispose();
    await pr;
  });

  it('Kamerapose bekommt Seitenverhältnis, Winkel und die gemessene Vorschaufläche', async () => {
    const av = boot({ profile: makeProfile() });
    const gp = av.gate();
    await tick();
    const el = ctx.curOverlay().el;
    const prev = el.querySelector('.lfx-store-char__preview');
    const R = (l, t, r, b) => ({ left: l, top: t, right: r, bottom: b, width: r - l, height: b - t });
    ctx.host.getBoundingClientRect = () => R(0, 0, 1000, 500);
    prev.getBoundingClientRect = () => R(400, 0, 1000, 500);
    window.dispatchEvent(new Event('resize'));
    const call = studioMock.made[0].cameraPose.mock.calls.at(-1);
    expect(call[0]).toBe('body');
    expect(call[1]).toMatchObject({ aspect: 1.7, fov: 60, free: { x0: 0.4, x1: 1, y0: 0, y1: 1 } });
    handle.dispose();
    await gp;
  });
});

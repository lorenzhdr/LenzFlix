// @vitest-environment jsdom
// 1.18.0 Welle 5 (Coder E): Waffenrad, Energie-HUD, Blend-Schleier und neue Töne. Kein Netzwerk, Fakes für Overlay und AudioContext.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createWeaponWheel, WEAPONS, cycleWeapon, weaponIndex } from '../src/js/store3d/ui/weaponwheel.js';
import { createEnergyHud, energyColor, REGEN_HIDE_MS } from '../src/js/store3d/ui/energy.js';
import { createBlindVeil, VEIL_MS, VEIL_REDUCED_MS, VEIL_GAP_MS } from '../src/js/store3d/ui/blindveil.js';
import sound from '../src/js/store3d/modules/sound.js';

beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = ''; });
afterEach(() => { vi.useRealTimers(); });

const key = (code, extra = {}) => document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...extra }));

describe('Waffenrad', () => {
  it('4 Segmente in fester Reihenfolge, Hilfsfunktionen', () => {
    expect(WEAPONS.map((w) => w.id)).toEqual(['hand', 'belt', 'whip', 'laser']);
    expect(cycleWeapon('laser', 1)).toBe('hand');
    expect(cycleWeapon('hand', -1)).toBe('laser');
    expect(weaponIndex('whip')).toBe(2);
  });

  it('öffnet im eigenen Host, markiert die aktuelle Waffe, Klick wählt und schließt', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const picks = [];
    const w = createWeaponWheel(host, { onPick: (id) => { picks.push(id); } });
    expect(w.open('whip')).toBe(true);
    expect(w.open('whip')).toBe(false);
    expect(w.isOpen()).toBe(true);
    expect(host.querySelectorAll('.lfx-store-fight-wslot')).toHaveLength(4);
    expect(host.querySelector('.lfx-store-fight-wslot.is-sel').dataset.weapon).toBe('whip');
    host.querySelector('[data-weapon="laser"]').click();
    expect(picks).toEqual(['laser']);
    expect(w.isOpen()).toBe(false);
    expect(host.querySelector('.lfx-store-fight-wheel')).toBeNull();
    w.dispose();
  });

  it('Tasten: Ziffern 1–4, Pfeile + Enter, R/Esc schließen; nach dem Schließen keine Reaktion', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const picks = [];
    const w = createWeaponWheel(host, { onPick: (id) => { picks.push(id); } });
    w.open('hand');
    key('Digit3');
    expect(picks).toEqual(['whip']);
    expect(w.isOpen()).toBe(false);
    w.open('hand');
    key('ArrowRight');
    expect(w.focused()).toBe('belt');
    key('ArrowLeft'); key('ArrowLeft');
    expect(w.focused()).toBe('laser');
    key('Enter');
    expect(picks).toEqual(['whip', 'laser']);
    w.open('hand');
    key('KeyR');
    expect(w.isOpen()).toBe(false);
    w.open('hand');
    key('Escape');
    expect(w.isOpen()).toBe(false);
    key('Digit1');
    expect(picks).toHaveLength(2);
    w.open('belt');
    expect(w.commit()).toBe('belt');
    expect(picks.at(-1)).toBe('belt');
    w.dispose();
  });

  it('über ctx.overlay: öffnet dort, schließt das Overlay mit, VR lehnt ab', () => {
    const host = document.createElement('div');
    let st = null;
    const ctx = {
      overlay: {
        open: (el, o) => { st = { el, o }; host.appendChild(el); },
        close: () => { if (st) { st.el.remove(); const cb = st.o.onClose; st = null; cb && cb(); } },
        isOpen: () => !!st,
      },
      xr: { presenting: () => false },
    };
    const w = createWeaponWheel(null, { ctx });
    expect(w.open('hand')).toBe(true);
    expect(st).not.toBeNull();
    w.close();
    expect(st).toBeNull();
    expect(w.isOpen()).toBe(false);
    ctx.xr.presenting = () => true;
    expect(w.open('hand')).toBe(false);
    w.dispose();
  });

  it('ohne Host und Overlay kein Öffnen; Stub-Aufruf ohne Argumente ist sicher', () => {
    const w = createWeaponWheel();
    expect(w.open('hand')).toBe(false);
    w.dispose();
  });
});

describe('Energie-HUD', () => {
  it('Farbe läuft von grün nach rot', () => {
    expect(energyColor(100)).toContain('hsl(120');
    expect(energyColor(0)).toContain('hsl(0');
  });

  it('unsichtbar bis Schaden, nach voller Regeneration ausgeblendet', () => {
    const host = document.createElement('div');
    const h = createEnergyHud(host, { touch: false });
    expect(h.isVisible()).toBe(false);
    expect(h.el.hidden).toBe(true);
    h.set(70);
    expect(h.isVisible()).toBe(true);
    expect(h.el.hidden).toBe(false);
    expect(h.el.querySelector('.lfx-store-fight-energy-fill').style.width).toBe('70%');
    h.set(100);
    expect(h.isVisible()).toBe(true);
    vi.advanceTimersByTime(REGEN_HIDE_MS + 10);
    expect(h.isVisible()).toBe(false);
    // erneuter Schaden während des Ausblendens bricht es ab
    h.set(60); h.set(100); h.set(90);
    vi.advanceTimersByTime(REGEN_HIDE_MS + 10);
    expect(h.isVisible()).toBe(true);
    h.dispose();
    expect(host.children).toHaveLength(0);
  });

  it('Treffer: Sterne und Wackeln; bei reduzierter Bewegung kein Wackeln', () => {
    const host = document.createElement('div');
    const shake = vi.fn();
    let calm = false;
    const h = createEnergyHud(host, { onShake: shake, reduced: () => calm });
    h.hit(0.8);
    expect(shake).toHaveBeenCalledTimes(1);
    expect(host.querySelectorAll('.lfx-store-fight-star').length).toBeGreaterThan(2);
    vi.advanceTimersByTime(1000);
    expect(host.querySelectorAll('.lfx-store-fight-star')).toHaveLength(0);
    calm = true;
    h.hit(0.8);
    expect(shake).toHaveBeenCalledTimes(1);
    expect(host.querySelectorAll('.lfx-store-fight-star.is-calm').length).toBeGreaterThan(0);
    h.dispose();
  });

  it('K.O.-Blende: onBlack bei Schwarz, onDone am Ende, keine Doppelstarts; Schutz 10 s', () => {
    const host = document.createElement('div');
    const h = createEnergyHud(host, { reduced: () => false });
    const order = [];
    expect(h.knockout({ hold: 1000, onBlack: () => order.push('black'), onDone: () => order.push('done') })).toBe(true);
    expect(h.knockout({})).toBe(false);
    const ko = host.querySelector('.lfx-store-fight-ko');
    expect(ko.hidden).toBe(false);
    vi.advanceTimersByTime(750);
    expect(order).toEqual(['black']);
    vi.advanceTimersByTime(3000);
    expect(order).toEqual(['black', 'done']);
    expect(ko.hidden).toBe(true);
    h.shield();
    const sh = host.querySelector('.lfx-store-fight-shield');
    expect(sh.hidden).toBe(false);
    vi.advanceTimersByTime(9900);
    expect(sh.hidden).toBe(false);
    vi.advanceTimersByTime(200);
    expect(sh.hidden).toBe(true);
    h.dispose();
  });
});

describe('Blend-Schleier', () => {
  it('2,5 s, danach weg; Dauer als CSS-Variable', () => {
    const host = document.createElement('div');
    const v = createBlindVeil(host, { reduced: () => false });
    expect(v.start()).toBe(true);
    expect(v.active()).toBe(true);
    expect(v.el.style.getPropertyValue('--lfx-fight-veil-ms')).toBe(VEIL_MS + 'ms');
    vi.advanceTimersByTime(VEIL_MS - 10);
    expect(v.active()).toBe(true);
    vi.advanceTimersByTime(20);
    expect(v.active()).toBe(false);
    expect(v.el.hidden).toBe(true);
    v.dispose();
  });

  it('Drosselung: höchstens einmal je 4 s', () => {
    let t = 10000;
    const v = createBlindVeil(document.createElement('div'), { now: () => t, reduced: () => false });
    expect(v.start()).toBe(true);
    t += VEIL_GAP_MS - 1;
    expect(v.start()).toBe(false);
    t += 1;
    expect(v.start()).toBe(true);
    v.dispose();
    expect(v.start()).toBe(false);
  });

  it('reduzierte Bewegung: 1,5 s, Klasse is-calm', () => {
    const v = createBlindVeil(document.createElement('div'), { reduced: () => true });
    v.start();
    expect(v.el.classList.contains('is-calm')).toBe(true);
    expect(v.el.style.getPropertyValue('--lfx-fight-veil-ms')).toBe(VEIL_REDUCED_MS + 'ms');
    vi.advanceTimersByTime(VEIL_REDUCED_MS + 10);
    expect(v.active()).toBe(false);
    v.dispose();
  });
});

describe('Töne (Raufen)', () => {
  const NAMES = ['slap', 'belt', 'whip', 'laser', 'ouch', 'candy', 'pop', 'ko'];
  function setup() {
    let oscs = 0;
    const node = () => new Proxy(function fake() {}, {
      get: (t, k) => {
        if (k === 'then') return undefined;
        if (['gain', 'frequency', 'detune', 'delayTime', 'Q'].includes(k)) return node();
        return () => node();
      },
      set: () => true,
    });
    class FakeAC {
      constructor() { this.state = 'running'; this.currentTime = 1; this.sampleRate = 4; this.destination = node(); }
      createOscillator() { oscs++; return node(); }
      createGain() { return node(); }
      createBiquadFilter() { return node(); }
      createDelay() { return node(); }
      createBufferSource() { return node(); }
      createBuffer() { return { getChannelData: () => new Float32Array(8) }; }
      suspend() { return Promise.resolve(); }
      resume() { return Promise.resolve(); }
      close() {}
    }
    window.AudioContext = FakeAC;
    const handlers = {};
    const provided = {};
    const ctx = {
      opts: {}, use: () => null, soundOn: () => true, layout: { adultRoom: null, kidsRoom: null }, player: { getPose: () => ({ x: 0, z: 0 }) },
      on: (n, fn) => { handlers[n] = fn; return () => {}; }, provide: (n, o) => { provided[n] = o; }, deps: {},
    };
    const mod = sound.init(ctx);
    handlers.enter();
    return { mod, provided, count: () => oscs };
  }

  it('alle neuen Namen spielen ohne Fehler und erzeugen Klang', () => {
    const { mod, provided, count } = setup();
    for (const n of NAMES) {
      const before = count();
      expect(() => provided.sound.play(n)).not.toThrow();
      expect(count()).toBeGreaterThan(before - 1);
    }
    expect(count()).toBeGreaterThan(0);
    mod.dispose();
  });

  it('Laser-Schleife startet und stoppt ohne Fehler', () => {
    const { mod, provided, count } = setup();
    const before = count();
    provided.sound.laser(true);
    provided.sound.laser(true);
    expect(count()).toBe(before + 2); // nur ein Start
    provided.sound.laser(false);
    vi.advanceTimersByTime(400);
    expect(() => mod.dispose()).not.toThrow();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createKeyGuard, passesGuard } from '../src/js/store3d/cinema/keyguard.js';

let state;
let handlers;
let guard;
let seen;
const onDoc = (e) => seen.push(`${e.type}:${e.code}`);

function key(type, code, init = {}, target = document.body) {
  const e = new KeyboardEvent(type, { code, key: init.key || code, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
}

beforeEach(() => {
  seen = [];
  state = { active: true, seated: true };
  handlers = { pause: vi.fn(), seekBy: vi.fn(), volume: vi.fn(), mute: vi.fn(), full: vi.fn() };
  guard = createKeyGuard({ win: window, isActive: () => state.active, isSeated: () => state.seated, handlers });
  guard.attach();
  for (const t of ['keydown', 'keyup', 'keypress']) document.addEventListener(t, onDoc);
});
afterEach(() => {
  guard.detach();
  for (const t of ['keydown', 'keyup', 'keypress']) document.removeEventListener(t, onDoc);
  document.body.innerHTML = '';
});

describe('keyguard', () => {
  it('aktiv: Jellyfins Kürzel erreichen document nicht (Leertaste, F, K, M, J, L, Pfeile, Ziffern, Home, End, < >, G, H)', () => {
    const keys = ['Space', 'KeyF', 'KeyK', 'KeyM', 'KeyJ', 'KeyL', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Digit5', 'Numpad3', 'Home', 'End', 'Comma', 'Period', 'IntlBackslash', 'KeyG', 'KeyH', 'PageUp', 'PageDown', 'Enter', 'Escape'];
    for (const c of keys) { key('keydown', c); key('keyup', c); key('keypress', c); }
    expect(seen).toEqual([]);
  });

  it('Strg/Alt/Meta, F5/F12, Tab und Eingabefelder passieren', () => {
    key('keydown', 'KeyF', { ctrlKey: true });
    key('keydown', 'KeyF', { altKey: true });
    key('keydown', 'KeyF', { metaKey: true });
    key('keydown', 'F5', { key: 'F5' });
    key('keydown', 'F12', { key: 'F12' });
    key('keydown', 'Tab', { key: 'Tab' });
    const input = document.createElement('input');
    document.body.appendChild(input);
    key('keydown', 'Space', {}, input);
    expect(seen).toEqual(['keydown:KeyF', 'keydown:KeyF', 'keydown:KeyF', 'keydown:F5', 'keydown:F12', 'keydown:Tab', 'keydown:Space']);
    expect(handlers.pause).not.toHaveBeenCalled();
    expect(passesGuard({ key: 'f', code: 'KeyF' })).toBe(false); // KeyF ist kein F-Funktionstaste
  });

  it('sitzend: Leertaste/K = Pause, J/L = -10/+30, Pfeile hoch/runter = Lautstärke, M = Stumm, F = Vollbild', () => {
    expect(key('keydown', 'Space').defaultPrevented).toBe(true);
    key('keydown', 'KeyK');
    expect(handlers.pause).toHaveBeenCalledTimes(2);
    key('keydown', 'KeyJ');
    key('keydown', 'ArrowLeft');
    expect(handlers.seekBy.mock.calls).toEqual([[-10], [-10]]);
    key('keydown', 'KeyL');
    key('keydown', 'ArrowRight');
    expect(handlers.seekBy.mock.calls.slice(2)).toEqual([[30], [30]]);
    key('keydown', 'ArrowUp');
    key('keydown', 'ArrowDown');
    expect(handlers.volume.mock.calls).toEqual([[1], [-1]]);
    key('keydown', 'KeyM');
    expect(handlers.mute).toHaveBeenCalledTimes(1);
    key('keydown', 'KeyF');
    expect(handlers.full).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([]);
  });

  it('Wiederholungen (gehaltene Taste) schalten nicht mehrfach, nur die Lautstärke wiederholt', () => {
    key('keydown', 'Space', { repeat: true });
    key('keydown', 'KeyM', { repeat: true });
    key('keydown', 'ArrowUp', { repeat: true });
    expect(handlers.pause).not.toHaveBeenCalled();
    expect(handlers.mute).not.toHaveBeenCalled();
    expect(handlers.volume).toHaveBeenCalledTimes(1);
  });

  it('Esc wird nicht belegt (läuft über desktop.js), aber von Jellyfin ferngehalten', () => {
    const e = key('keydown', 'Escape');
    expect(e.defaultPrevented).toBe(false);
    expect(Object.values(handlers).every((f) => f.mock.calls.length === 0)).toBe(true);
    expect(seen).toEqual([]);
  });

  it('stehend (aktiv, nicht sitzend): blockt, belegt nichts', () => {
    state.seated = false;
    const e = key('keydown', 'Space');
    key('keydown', 'KeyF');
    expect(e.defaultPrevented).toBe(false);
    expect(seen).toEqual([]);
    expect(Object.values(handlers).every((f) => f.mock.calls.length === 0)).toBe(true);
  });

  it('Vollbild/inaktiv: Wächter aus, Tasten passieren', () => {
    state.active = false;
    key('keydown', 'Space');
    key('keydown', 'KeyF');
    expect(seen).toEqual(['keydown:Space', 'keydown:KeyF']);
    expect(handlers.pause).not.toHaveBeenCalled();
  });

  it('detach stellt den Zustand her; attach ist idempotent', () => {
    guard.attach();
    guard.attach();
    expect(guard.attached).toBe(true);
    guard.detach();
    expect(guard.attached).toBe(false);
    key('keydown', 'Space');
    expect(seen).toEqual(['keydown:Space']);
    expect(handlers.pause).not.toHaveBeenCalled();
  });

  it('Space-keyup auf fokussiertem Knopf wird entschärft (Firefox)', () => {
    const b = document.createElement('button');
    document.body.appendChild(b);
    const e = key('keyup', 'Space', {}, b);
    expect(e.defaultPrevented).toBe(true);
    expect(seen).toEqual([]);
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createKeys, keyName } from '../src/js/live/ui/keys.js';
import { createRemote, REMOTE_KEYS } from '../src/js/live/ui/remote.js';
import { createFullscreen } from '../src/js/live/ui/fullscreen.js';
import { buildTv, normStyle } from '../src/js/live/ui/tv.js';

afterEach(() => { document.body.innerHTML = ''; });

function press(target, key, init = {}) {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
}

describe('Tastatur', () => {
  it('Tastenzuordnung laut Vertrag', () => {
    const map = {
      ArrowUp: 'ch+', ArrowDown: 'ch-', ArrowLeft: 'left', ArrowRight: 'right', 5: '5', '+': 'vol+', '-': 'vol-',
      m: 'mute', M: 'mute', g: 'epg', z: 'guide', Z: 'guide', i: 'info', t: 'txt', f: 'fullscreen', Escape: 'esc', Backspace: 'back', Enter: 'ok', F1: 'red', F4: 'blue',
    };
    for (const [k, v] of Object.entries(map)) expect(keyName({ key: k }), k).toBe(v);
    expect(keyName({ key: 'ArrowUp' }, true)).toBe('up');
    expect(keyName({ key: 'ArrowDown' }, true)).toBe('down');
    expect(keyName({ key: 'x' })).toBeNull();
  });

  it('meldet Tasten nur solange aktiv, verbraucht sie und verschluckt die Leertaste', () => {
    const onKey = vi.fn();
    let active = true;
    const keys = createKeys({ onKey, isActive: () => active });
    keys.attach();
    const e = press(document.body, 'g');
    expect(onKey).toHaveBeenCalledWith('epg');
    expect(e.defaultPrevented).toBe(true);
    onKey.mockClear();
    const sp = press(document.body, ' ');
    expect(sp.defaultPrevented).toBe(true);
    expect(onKey).not.toHaveBeenCalled();
    active = false;
    press(document.body, 'g');
    expect(onKey).not.toHaveBeenCalled();
    active = true;
    keys.detach();
    press(document.body, 'g');
    expect(onKey).not.toHaveBeenCalled();
    keys.destroy();
  });

  it('ignoriert Eingabefelder, Theme-Picker, Popover und Modifikatoren', () => {
    const onKey = vi.fn();
    const keys = createKeys({ onKey, isActive: () => true });
    keys.attach();
    const input = document.createElement('input');
    const area = document.createElement('textarea');
    document.body.append(input, area);
    press(input, 'm');
    press(area, 'm');
    expect(onKey).not.toHaveBeenCalled();
    press(document.body, 'm', { ctrlKey: true });
    expect(onKey).not.toHaveBeenCalled();
    const tp = document.createElement('div');
    tp.className = 'lfx-tp';
    document.body.append(tp);
    press(document.body, 'm');
    expect(onKey).not.toHaveBeenCalled();
    tp.remove();
    const pop = document.createElement('div');
    pop.className = 'lfx-popover is-open';
    document.body.append(pop);
    press(document.body, 'm');
    expect(onKey).not.toHaveBeenCalled();
    pop.remove();
    press(document.body, 'm');
    expect(onKey).toHaveBeenCalledWith('mute');
    keys.destroy();
  });

  it('Enter auf fokussierter Fernbedienungs-Taste löst keinen zweiten OK aus', () => {
    const onKey = vi.fn();
    const keys = createKeys({ onKey, isActive: () => true });
    keys.attach();
    const r = createRemote({ onKey: () => {} });
    document.body.append(r.el);
    press(r.el.querySelector('button'), 'Enter');
    expect(onKey).not.toHaveBeenCalled();
    keys.destroy();
  });
});

describe('Fernbedienung', () => {
  it('alle Tasten sind <button type="button"> mit aria-label und data-key', () => {
    const onKey = vi.fn();
    const r = createRemote({ onKey });
    document.body.append(r.el);
    expect(r.el.getAttribute('role')).toBe('group');
    expect(r.el.getAttribute('aria-label')).toBe('Fernbedienung');
    const need = ['power', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'ch+', 'ch-', 'vol+', 'vol-', 'mute', 'epg', 'info', 'ok', 'up', 'down', 'left', 'right', 'back', 'menu', 'txt', 'red', 'green', 'yellow', 'blue', 'audio', 'subs', 'restart', 'fullscreen'];
    for (const k of need) {
      const b = r.el.querySelector(`button[data-key="${k}"]`);
      expect(b, k).toBeTruthy();
      expect(b.getAttribute('type')).toBe('button');
      expect(b.getAttribute('aria-label')).toBeTruthy();
    }
    expect(REMOTE_KEYS.length).toBe(r.el.querySelectorAll('button').length);
    r.el.querySelector('button[data-key="ch+"]').click();
    expect(onKey).toHaveBeenCalledWith('ch+');
    r.destroy();
    expect(document.querySelector('.lfx-live-remote')).toBeNull();
  });
});

describe('Vollbild und Gerüst', () => {
  it('Fallback ohne Fullscreen-API setzt .is-fullscreen und stellt zurück', () => {
    const t = document.createElement('div');
    document.body.append(t);
    const onChange = vi.fn();
    const fs = createFullscreen({ target: t, onChange });
    fs.toggle();
    expect(t.classList.contains('is-fullscreen')).toBe(true);
    expect(fs.isOn()).toBe(true);
    fs.toggle();
    expect(t.classList.contains('is-fullscreen')).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
    fs.destroy();
  });

  it('nutzt requestFullscreen am Host-Element', () => {
    const t = document.createElement('div');
    t.requestFullscreen = vi.fn(() => Promise.resolve());
    document.body.append(t);
    const fs = createFullscreen({ target: t });
    fs.enter();
    expect(t.requestFullscreen).toHaveBeenCalledTimes(1);
    fs.destroy();
  });

  it('Gerüst: ein <video> ohne controls, fake-Canvas nur im Fake-Modus', () => {
    const a = buildTv({ style: 'silver' });
    expect(a.video.hasAttribute('controls')).toBe(false);
    expect(a.video.getAttribute('x-webkit-airplay')).toBe('deny');
    expect(a.fake).toBeNull();
    expect(a.app.classList.contains('lfx-live--style-silver')).toBe(true);
    expect(buildTv({ style: 'x', fakePlayer: true }).fake).toBeTruthy();
    expect(normStyle('unbekannt')).toBe('flat');
    expect(normStyle(undefined)).toBe('flat');
    expect(buildTv({}).app.classList.contains('lfx-live--style-flat')).toBe(true);
  });
});

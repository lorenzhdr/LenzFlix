// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/theme.js', () => ({ isTheme: vi.fn(() => false), getTheme: () => 'flix' }));

import { isTheme } from '../src/js/core/theme.js';
import osdc from '../src/js/features/osdcenter.js';
import { features } from '../src/js/features/index.js';
import { removeAllMounts } from '../src/js/core/dom.js';
import { parseHash } from '../src/js/core/router.js';

const root = () => document.getElementById('lfx-osdc');
const b = (k) => root().querySelector(`.lfx-osdc__btn--${k}`);
const tick = () => new Promise((r) => setTimeout(r, 40));
const pageHtml = (cls = '') => `<div id="videoOsdPage" class="${cls}"><div class="upNextContainer hide"></div>`
  + '<div class="videoOsdBottom"><button class="btnRewind"></button><button class="btnPause"></button><button class="btnFastForward"></button></div></div>';
const route = parseHash('#/video');

describe('osdcenter', () => {
  beforeEach(() => {
    document.body.innerHTML = '<video class="htmlvideoplayer"></video>' + pageHtml();
    document.documentElement.className = 'lfx-js';
    isTheme.mockImplementation(() => false);
  });
  afterEach(() => {
    osdc.unmount();
    document.documentElement.className = '';
  });

  it('ist registriert', () => {
    expect(features.map((f) => f.name)).toContain('osdcenter');
  });

  it('match: nur mit aktiver Seite (oder Route /video); nicht TV, nicht live', () => {
    expect(osdc.match(parseHash('#/home'))).toBe(true);
    document.body.innerHTML = '';
    expect(osdc.match(parseHash('#/home'))).toBe(false);
    expect(osdc.match(route)).toBe(true);
    document.body.innerHTML = pageHtml('hide');
    expect(osdc.match(parseHash('#/home'))).toBe(false);
    document.body.innerHTML = pageHtml();
    document.documentElement.className = 'lfx-js layout-tv';
    expect(osdc.match(route)).toBe(false);
    document.documentElement.className = 'lfx-js';
    isTheme.mockImplementation((id) => id === 'live');
    expect(osdc.match(route)).toBe(false);
  });

  it('mount legt Container mit drei Knöpfen und Beschriftung an', () => {
    osdc.mount(route);
    expect(b('back').getAttribute('aria-label')).toBe('10 Sekunden zurück');
    expect(b('play').getAttribute('aria-label')).toBe('Abspielen');
    expect(b('fwd').getAttribute('aria-label')).toBe('30 Sekunden vor');
    expect(b('back').type).toBe('button');
    expect(b('back').querySelector('svg')).not.toBeNull();
  });

  it('Proxy-Klicks treffen die aktive Seite, nicht die alte versteckte', () => {
    document.body.insertAdjacentHTML('afterbegin', pageHtml('hide'));
    const hits = [];
    for (const p of document.querySelectorAll('[id="videoOsdPage"]')) {
      const tag = p.classList.contains('hide') ? 'old' : 'new';
      for (const s of ['btnRewind', 'btnPause', 'btnFastForward']) p.querySelector(`.${s}`).addEventListener('click', () => hits.push(`${tag}:${s}`));
    }
    osdc.mount(route);
    b('back').click();
    b('play').click();
    b('fwd').click();
    expect(hits).toEqual(['new:btnRewind', 'new:btnPause', 'new:btnFastForward']);
  });

  it('stoppt Ereignisse: Seite/document bekommen keinen Klick', () => {
    osdc.mount(route);
    const spy = (e) => { if (e.target.closest('#lfx-osdc')) calls(); };
    const calls = vi.fn();
    document.addEventListener('click', spy);
    document.addEventListener('pointerdown', spy);
    document.addEventListener('touchstart', spy);
    b('fwd').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    b('fwd').dispatchEvent(new Event('touchstart', { bubbles: true }));
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    b('fwd').dispatchEvent(ev);
    document.removeEventListener('click', spy);
    document.removeEventListener('pointerdown', spy);
    document.removeEventListener('touchstart', spy);
    expect(calls).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(true);
  });

  it('Sichtbarkeit folgt videoOsdBottom-hidden/hide, Dialog und Up-Next', async () => {
    osdc.mount(route);
    expect(root().classList.contains('is-visible')).toBe(true);
    const bar = document.querySelector('.videoOsdBottom');
    bar.classList.add('videoOsdBottom-hidden', 'hide');
    await tick();
    expect(root().classList.contains('is-visible')).toBe(false);
    expect(root().getAttribute('aria-hidden')).toBe('true');
    bar.classList.remove('videoOsdBottom-hidden', 'hide');
    await tick();
    expect(root().classList.contains('is-visible')).toBe(true);
    document.body.insertAdjacentHTML('beforeend', '<div class="dialogContainer"><div class="dialog opened"></div></div>');
    await tick();
    expect(root().classList.contains('is-visible')).toBe(false);
    document.querySelector('.dialogContainer').remove();
    await tick();
    expect(root().classList.contains('is-visible')).toBe(true);
    document.querySelector('.upNextContainer').classList.remove('hide');
    await tick();
    expect(root().classList.contains('is-visible')).toBe(false);
  });

  it('Symbol wechselt bei play/pause-Events und optimistisch beim Klick', () => {
    osdc.mount(route);
    const v = document.querySelector('video');
    expect(b('play').getAttribute('aria-label')).toBe('Abspielen');
    v.dispatchEvent(new Event('play'));
    Object.defineProperty(v, 'paused', { value: false, configurable: true });
    v.dispatchEvent(new Event('play'));
    expect(b('play').getAttribute('aria-label')).toBe('Pause');
    b('play').click(); // optimistisch
    expect(b('play').getAttribute('aria-label')).toBe('Abspielen');
    Object.defineProperty(v, 'paused', { value: true, configurable: true });
    v.dispatchEvent(new Event('pause'));
    expect(b('play').getAttribute('aria-label')).toBe('Abspielen');
  });

  it('Seitenknopf aus, wenn Proxy .hide trägt', () => {
    document.querySelector('.btnRewind').classList.add('hide');
    osdc.mount(route);
    expect(b('back').classList.contains('is-off')).toBe(true);
    expect(b('fwd').classList.contains('is-off')).toBe(false);
  });

  it('unmount und destroy räumen auf, Video-Listener entfernt', () => {
    osdc.mount(route);
    const v = document.querySelector('video');
    const rm = vi.spyOn(v, 'removeEventListener');
    osdc.unmount();
    expect(root()).toBeNull();
    expect(rm).toHaveBeenCalledWith('play', expect.any(Function));
    osdc.mount(route);
    removeAllMounts();
    expect(root()).toBeNull();
  });
});

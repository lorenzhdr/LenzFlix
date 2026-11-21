// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const themeMock = vi.hoisted(() => ({ store: false }));
vi.mock('../src/js/core/theme.js', () => ({ isTheme: vi.fn((id) => id === 'store' && themeMock.store), getTheme: () => 'flix' }));

import feature from '../src/js/features/autonext.js';
import { features } from '../src/js/features/index.js';
import {
  startAutoNext, stopAutoNext, getAutoNextEnabled, loadAutoNextEnabled, setAutoNextEnabled,
} from '../src/js/autonext/autonext.js';

const UP = () => '<h2 class="upNextDialog-nextVideoText">x</h2><div class="flex upNextDialog-buttons"><button class="btnStartNow upNextDialog-button">Jetzt starten</button><button class="btnHide upNextDialog-button">Verbergen</button></div>';
const page = () => document.querySelector('[id="videoOsdPage"]:not(.hide)');
const up = () => page().querySelector('.upNextContainer');
const startBtn = () => page().querySelector('.btnStartNow');
const fills = () => document.querySelectorAll('.lfx-autonext__fill');
const running = () => startBtn().classList.contains('is-running');
const show = () => { up().innerHTML = UP(); up().classList.remove('hide', 'upNextDialog-hidden'); };
const adv = (ms) => vi.advanceTimersByTime(ms);
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const emit = (on) => window.dispatchEvent(new CustomEvent('lfx:autonext', { detail: { on } }));

describe('autonext', () => {
  let video;
  let vpaused = false;
  let click;
  beforeEach(() => {
    vi.useFakeTimers();
    themeMock.store = false;
    localStorage.clear();
    delete window.ApiClient;
    document.documentElement.className = 'lfx-js';
    document.body.innerHTML = '<video class="htmlvideoplayer"></video><div id="videoOsdPage" class="libraryPage"><div class="upNextContainer hide"></div></div>';
    video = document.querySelector('video');
    vpaused = false; // jsdom: paused ist sonst immer true
    Object.defineProperty(video, 'paused', { configurable: true, get: () => vpaused });
    click = vi.fn();
    startAutoNext();
  });
  afterEach(() => {
    stopAutoNext();
    if (window.__lfxAutoNext) window.__lfxAutoNext.destroy();
    vi.useRealTimers();
    document.documentElement.className = '';
  });
  const showAndHook = () => {
    show();
    adv(400);
    startBtn().addEventListener('click', click);
  };

  it('Feature registriert; match: nicht store', () => {
    expect(features.map((f) => f.name)).toContain('autonext');
    expect(feature.match()).toBe(true);
    themeMock.store = true;
    expect(feature.match()).toBe(false);
  });

  it('Füllung genau einmal als erstes Kind von .btnStartNow, kein dritter Knopf, Text bleibt', () => {
    show();
    adv(2000);
    expect(fills().length).toBe(1);
    const b = startBtn();
    expect(b.firstChild).toBe(fills()[0]);
    expect(fills()[0].getAttribute('aria-hidden')).toBe('true');
    expect(b.classList.contains('lfx-autonext-host')).toBe(true);
    expect(b.textContent).toBe('Jetzt starten');
    expect(page().querySelectorAll('.upNextDialog-buttons button').length).toBe(2);
  });

  it('neu eingefügt nach innerHTML-Neuschreiben; Fokus bleibt', () => {
    show();
    adv(400);
    const s = startBtn();
    s.focus();
    adv(400);
    expect(document.activeElement).toBe(s);
    show();
    adv(400);
    expect(fills().length).toBe(1);
    expect(startBtn().textContent).toBe('Jetzt starten');
  });

  it('nach 5 s genau ein Klick, is-running während des Laufs', () => {
    showAndHook();
    expect(running()).toBe(true);
    adv(2000);
    expect(startBtn().textContent).toBe('Jetzt starten');
    adv(3600);
    expect(click).toHaveBeenCalledTimes(1);
    adv(10000);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('kein Klick bei Verbergen, pause, Rücksprung, emptied, Seitenwechsel', () => {
    const cases = [
      () => up().classList.add('hide'),
      () => up().classList.add('upNextDialog-hidden'), // Ausblend-Transition vor .hide
      () => video.dispatchEvent(new Event('pause')),
      () => { video.currentTime = 0; video.dispatchEvent(new Event('seeking')); },
      () => video.dispatchEvent(new Event('emptied')),
      () => page().classList.add('hide'),
    ];
    for (const c of cases) {
      video.currentTime = 100;
      document.getElementById('videoOsdPage').classList.remove('hide');
      show();
      adv(400);
      const cl = vi.fn();
      startBtn().addEventListener('click', cl);
      adv(1000);
      c();
      adv(8000);
      expect(cl).not.toHaveBeenCalled();
      expect(document.querySelector('.btnStartNow.is-running')).toBeNull();
      document.getElementById('videoOsdPage').classList.remove('hide');
      up().classList.add('hide');
      adv(400);
    }
  });

  it('Overlay erscheint bei pausiertem Video: Lauf wartet bis zur Wiedergabe', () => {
    vpaused = true;
    showAndHook();
    adv(8000);
    expect(click).not.toHaveBeenCalled();
    expect(running()).toBe(false);
    vpaused = false;
    adv(400);
    expect(running()).toBe(true);
    adv(4400);
    expect(click).not.toHaveBeenCalled();
    adv(1000); // nächster Tick nach der Deadline
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('Rücksprung wird auch im Tick erkannt', () => {
    video.currentTime = 100;
    showAndHook();
    video.currentTime = 10;
    adv(8000);
    expect(click).not.toHaveBeenCalled();
    expect(running()).toBe(false);
  });

  it('Aus: kein Span, keine Klasse, kein Klick', () => {
    stopAutoNext();
    localStorage.setItem('lfx.autonext.anon', '0');
    startAutoNext();
    showAndHook();
    adv(8000);
    expect(click).not.toHaveBeenCalled();
    expect(fills().length).toBe(0);
    expect(startBtn().className).toBe('btnStartNow upNextDialog-button');
    expect(startBtn().innerHTML).toBe('Jetzt starten');
  });

  it('Ereignis lfx:autonext: Aus bricht laufenden Lauf ab und entfernt Füllung; An startet neu', () => {
    showAndHook();
    adv(1000);
    expect(running()).toBe(true);
    emit(false);
    expect(running()).toBe(false);
    expect(fills().length).toBe(0);
    expect(startBtn().classList.contains('lfx-autonext-host')).toBe(false);
    adv(8000);
    expect(click).not.toHaveBeenCalled();
    emit(true);
    expect(running()).toBe(true);
    expect(fills().length).toBe(1);
    adv(5400);
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('Store-Ausschluss: Klasse und #lfx-store-park', () => {
    document.documentElement.classList.add('lfx-theme-store');
    show();
    adv(8000);
    expect(fills().length).toBe(0);
    document.documentElement.classList.remove('lfx-theme-store');
    const park = document.createElement('div');
    park.id = 'lfx-store-park';
    document.body.appendChild(park);
    adv(1000);
    expect(fills().length).toBe(0);
  });

  it('Store-Prüfung unmittelbar vor dem Klick', () => {
    showAndHook();
    adv(4500);
    const park = document.createElement('div');
    park.id = 'lfx-store-park';
    document.body.appendChild(park);
    adv(2000);
    expect(click).not.toHaveBeenCalled();
  });

  it('Besitzer-Marker: zweiter Start No-op; destroy räumt Spans/Klassen ab', () => {
    expect(window.__lfxAutoNext).toBeTruthy();
    expect(startAutoNext()).toBe(false);
    show();
    adv(400);
    expect(fills().length).toBe(1);
    window.__lfxAutoNext.destroy();
    expect(window.__lfxAutoNext).toBeUndefined();
    expect(fills().length).toBe(0);
    expect(startBtn().className).toBe('btnStartNow upNextDialog-button');
    emit(false); // Listener entfernt: kein Fehler
    expect(startAutoNext()).toBe(true);
  });

  it('fremder Besitzer: stopAutoNext räumt nichts', () => {
    stopAutoNext();
    const other = { version: 'x', destroy: vi.fn() };
    window.__lfxAutoNext = other;
    expect(startAutoNext()).toBe(false);
    stopAutoNext();
    expect(other.destroy).not.toHaveBeenCalled();
    delete window.__lfxAutoNext;
    startAutoNext();
  });

  describe('Speicherung', () => {
    const mkApi = (cp) => ({
      getCurrentUserId: () => 'u1',
      getDisplayPreferences: vi.fn(() => Promise.resolve({ Id: 'lenzflix-player', CustomPrefs: { ...cp } })),
      updateDisplayPreferences: vi.fn(() => Promise.resolve()),
    });
    it('Instanz lädt Serverwert 0: kein Lauf; schreibt selbst nie', async () => {
      window.ApiClient = mkApi({ autoNext: '0', other: 'x' });
      adv(400);
      await flush();
      showAndHook();
      adv(8000);
      expect(click).not.toHaveBeenCalled();
      expect(fills().length).toBe(0);
      expect(window.ApiClient.getDisplayPreferences).toHaveBeenCalledWith('lenzflix-player', 'u1', 'lenzflix');
      expect(window.ApiClient.updateDisplayPreferences).not.toHaveBeenCalled();
      expect(localStorage.getItem('lfx.autonext.u1')).toBe('0');
    });
    it('fehlend = An; ApiClient erst später verfügbar, kein Spam', async () => {
      show();
      adv(800);
      expect(running()).toBe(true);
      window.ApiClient = mkApi({});
      adv(400);
      await flush();
      expect(window.ApiClient.getDisplayPreferences).toHaveBeenCalledTimes(1);
      adv(2000);
      await flush();
      expect(window.ApiClient.getDisplayPreferences).toHaveBeenCalledTimes(1);
    });
    it('Ereignis hat Vorrang vor laufendem GET', async () => {
      const res = [];
      window.ApiClient = mkApi({});
      window.ApiClient.getDisplayPreferences = vi.fn(() => new Promise((r) => { res.push(r); }));
      show();
      adv(400);
      setAutoNextEnabled(false); // Ereignis nach Start des GET
      res[0]({ CustomPrefs: { autoNext: '1' } });
      await flush();
      res[1]({ CustomPrefs: {} });
      await flush();
      expect(fills().length).toBe(0);
      expect(localStorage.getItem('lfx.autonext.u1')).toBe('0');
    });
    it('setAutoNextEnabled: Spiegel, Ereignis, GET → POST behält andere CustomPrefs', async () => {
      window.ApiClient = mkApi({ other: 'x' });
      const ev = vi.fn();
      window.addEventListener('lfx:autonext', ev);
      const p = setAutoNextEnabled(false);
      expect(ev).toHaveBeenCalledTimes(1);
      expect(ev.mock.calls[0][0].detail).toEqual({ on: false });
      expect(localStorage.getItem('lfx.autonext.u1')).toBe('0');
      expect(getAutoNextEnabled()).toBe(false);
      await p;
      window.removeEventListener('lfx:autonext', ev);
      const u = window.ApiClient.updateDisplayPreferences;
      expect(u).toHaveBeenCalledTimes(1);
      const [id, body, uid, client] = u.mock.calls[0];
      expect([id, uid, client]).toEqual(['lenzflix-player', 'u1', 'lenzflix']);
      expect(body.CustomPrefs).toEqual({ other: 'x', autoNext: '0' });
      expect(body.Id).toBe('lenzflix-player');
    });
    it('setAutoNextEnabled: Fehler crasht nicht; ohne ApiClient nur Spiegel + Ereignis', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      window.ApiClient = mkApi({});
      window.ApiClient.getDisplayPreferences = vi.fn(() => Promise.reject(new Error('x')));
      await expect(setAutoNextEnabled(true)).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
      delete window.ApiClient;
      await expect(setAutoNextEnabled(false)).resolves.toBeUndefined();
      expect(localStorage.getItem('lfx.autonext.anon')).toBe('0');
    });
    it('getAutoNextEnabled: fehlend = An', () => {
      expect(getAutoNextEnabled()).toBe(true);
    });
    it('loadAutoNextEnabled: Server, fehlend = An, Fehler und ohne Client → Spiegel', async () => {
      window.ApiClient = mkApi({ autoNext: '0' });
      await expect(loadAutoNextEnabled()).resolves.toBe(false);
      expect(localStorage.getItem('lfx.autonext.u1')).toBe('0');
      window.ApiClient = mkApi({});
      await expect(loadAutoNextEnabled()).resolves.toBe(true);
      expect(localStorage.getItem('lfx.autonext.u1')).toBe('1');
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      localStorage.setItem('lfx.autonext.u1', '0');
      window.ApiClient.getDisplayPreferences = vi.fn(() => Promise.reject(new Error('x')));
      await expect(loadAutoNextEnabled()).resolves.toBe(false);
      warn.mockRestore();
      delete window.ApiClient;
      localStorage.setItem('lfx.autonext.anon', '0');
      await expect(loadAutoNextEnabled()).resolves.toBe(false);
    });
  });
});

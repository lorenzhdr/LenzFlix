// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';

const CSS = ':root { --lfx-css: 1; }';
function addCss() {
  const st = document.createElement('style');
  st.id = 'test-css';
  st.textContent = CSS;
  document.head.append(st);
  return st;
}

afterEach(() => {
  if (window.LenzFlix) window.LenzFlix.destroy();
  vi.resetModules();
  document.body.innerHTML = '';
  delete window.ApiClient;
  document.getElementById('test-css')?.remove();
  document.getElementById('lfx-theme-prehide')?.remove();
  document.querySelectorAll('link.lfx-theme-css').forEach((l) => l.remove());
  document.documentElement.className = '';
  localStorage.clear();
});

describe('main', () => {
  it('setzt window.LenzFlix, Guard gegen Doppel-Init, destroy räumt auf', async () => {
    window.ApiClient = { serverAddress: () => 'http://x', getCurrentUserId: () => 'u', accessToken: () => 't', serverId: () => 's' };
    addCss();
    window.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ Items: [{ Id: 'm', Name: 'F', CollectionType: 'movies' }] }) }));
    document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
    window.location.hash = '#/home';
    await import('../src/js/main.js');
    expect(window.LenzFlix.version).toBeTruthy();
    const first = window.LenzFlix;
    expect(document.documentElement.classList.contains('lfx-js')).toBe(true);
    expect(document.getElementById('lfx-nav')).not.toBeNull();
    expect(document.getElementById('lfx-ambient')).not.toBeNull();
    vi.resetModules();
    await import('../src/js/main.js');
    expect(window.LenzFlix).toBe(first);
    window.LenzFlix.destroy();
    expect(window.LenzFlix).toBeUndefined();
    expect(document.getElementById('lfx-nav')).toBeNull();
    expect(document.getElementById('lfx-ambient')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-js')).toBe(false);
    expect(document.documentElement.classList.contains('lfx-nav-on')).toBe(false);
  }, 15000); // erster Test lädt main.js kalt (~4 s allein), unter Volllast sonst Timeout

  it('startet nicht ohne LenzFlix-CSS, stoppt bei CSS-Abschaltung und startet bei Rückkehr neu', async () => {
    vi.useFakeTimers();
    try {
      window.ApiClient = { serverAddress: () => 'http://x', getCurrentUserId: () => 'u', accessToken: () => 't', serverId: () => 's' };
      window.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ Items: [] }) }));
      document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
      window.location.hash = '#/home';
      await import('../src/js/main.js');
      const html = document.documentElement;
      expect(html.classList.contains('lfx-js')).toBe(false); // kein CSS → keine Features
      expect(document.getElementById('lfx-favicon')).toBeNull();
      const st = addCss();
      vi.advanceTimersByTime(1100);
      expect(html.classList.contains('lfx-js')).toBe(true);
      expect(document.getElementById('lfx-favicon')).not.toBeNull();
      st.remove(); // Nutzer deaktiviert das CSS
      vi.advanceTimersByTime(1100);
      expect(html.classList.contains('lfx-js')).toBe(false);
      expect(document.getElementById('lfx-nav')).toBeNull();
      expect(document.getElementById('lfx-favicon')).toBeNull();
      addCss();
      vi.advanceTimersByTime(1100);
      expect(html.classList.contains('lfx-js')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('startet das Design (Klasse lfx-theme-flix), räumt bei destroy alles auf', async () => {
    window.ApiClient = { serverAddress: () => 'http://x', getCurrentUserId: () => 'u', accessToken: () => 't', serverId: () => 's' };
    addCss();
    window.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ Items: [] }) }));
    document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
    window.location.hash = '#/home';
    await import('../src/js/main.js');
    const cl = document.documentElement.classList;
    expect(cl.contains('lfx-theme-flix')).toBe(true);
    expect(Object.keys(window.LenzFlix).sort()).toEqual(['destroy', 'version']);
    window.LenzFlix.destroy();
    expect([...cl].some((c) => c.startsWith('lfx-theme-'))).toBe(false);
  });

  describe('Frühstart / schnelles Polling', () => {
    const prehide = () => document.getElementById('lfx-theme-prehide');
    const setup = () => {
      window.ApiClient = { serverAddress: () => 'http://x', getCurrentUserId: () => 'u', accessToken: () => 't', serverId: () => 's' };
      window.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ Items: [] }) }));
      document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
      window.location.hash = '#/home';
    };

    it('plus: Prehide sofort beim Start, CSS nach 300 ms erkannt (schnelles Polling)', async () => {
      vi.useFakeTimers();
      try {
        setup();
        localStorage.setItem('lfx.theme.last', 'plus');
        await import('../src/js/main.js');
        const cl = document.documentElement.classList;
        expect(prehide()).not.toBeNull();
        expect(cl.contains('lfx-theme-loading')).toBe(true);
        expect(document.querySelector('link.lfx-theme-css')).not.toBeNull(); // vorgeladen
        await vi.advanceTimersByTimeAsync(250);
        expect(cl.contains('lfx-js')).toBe(false);
        addCss();
        await vi.advanceTimersByTimeAsync(100);
        expect(cl.contains('lfx-js')).toBe(true); // nicht erst nach 1 s
      } finally {
        vi.useRealTimers();
      }
    });

    it('retro: Prehide sofort beim Start, Design-CSS vorgeladen', async () => {
      vi.useFakeTimers();
      try {
        setup();
        localStorage.setItem('lfx.theme.last', 'retro');
        await import('../src/js/main.js');
        expect(prehide()).not.toBeNull();
        expect(document.documentElement.classList.contains('lfx-theme-loading')).toBe(true);
        expect(document.querySelector('link.lfx-theme-css')).not.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('CSS nie aktiv: nach 1,5 s sichtbar, ohne lfx-Klassen, Prehide und Design-Link', async () => {
      vi.useFakeTimers();
      try {
        setup();
        localStorage.setItem('lfx.theme.last', 'prime');
        await import('../src/js/main.js');
        expect(prehide()).not.toBeNull();
        await vi.advanceTimersByTimeAsync(1400);
        expect(prehide()).not.toBeNull();
        await vi.advanceTimersByTimeAsync(150);
        expect(prehide()).toBeNull();
        expect([...document.documentElement.classList].filter((c) => c.startsWith('lfx-'))).toEqual([]);
        expect(document.querySelector('link.lfx-theme-css')).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('flix: kein Prehide, kein Design-Link', async () => {
      vi.useFakeTimers();
      try {
        setup();
        await import('../src/js/main.js');
        expect(prehide()).toBeNull();
        expect(document.querySelector('link.lfx-theme-css')).toBeNull();
        expect(document.documentElement.classList.contains('lfx-theme-loading')).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('destroy entfernt Prehide', async () => {
      setup();
      localStorage.setItem('lfx.theme.last', 'plus');
      await import('../src/js/main.js');
      expect(prehide()).not.toBeNull();
      window.LenzFlix.destroy();
      expect(prehide()).toBeNull();
      expect(document.querySelector('link.lfx-theme-css')).toBeNull();
    });
  });
});

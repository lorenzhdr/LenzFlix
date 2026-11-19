// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/theme.js', () => ({
  brandName: (id) => ({ flix: 'LENZFLIX', plus: 'LENZ+', prime: 'LENZPRIME', retro: 'LENZ//84', store: 'VIDEOTHEK LENZ' })[id] || 'LENZFLIX',
}));
vi.mock('../src/js/core/favicon.js', () => ({
  touchFor: (t) => `https://x.test/assets/logo/touch-${t}.png`,
}));

const rt = vi.hoisted(() => ({ reevaluate: vi.fn() }));
vi.mock('../src/js/core/router.js', () => rt);

import { applyWebApp, stopWebApp, isStandalone, buildManifest } from '../src/js/core/webapp.js';

const SRC = {
  name: 'Jellyfin',
  short_name: 'Jellyfin',
  start_url: 'index.html#/home',
  display: 'standalone',
  icons: [{ src: 'favicons/touchicon72.png', sizes: '72x72', type: 'image/png' }],
};
const flush = () => new Promise((r) => setTimeout(r, 0));
let blobs;
let revoked;

function mockMq(matches) {
  window.matchMedia = vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
}

beforeEach(() => {
  document.head.innerHTML = '<link rel="manifest" href="manifest.json">';
  document.documentElement.className = '';
  delete window.__lfxStandalone;
  mockMq(false);
  blobs = [];
  revoked = [];
  let n = 0;
  URL.createObjectURL = vi.fn((b) => { blobs.push(b); return `blob:lfx/${++n}`; });
  URL.revokeObjectURL = vi.fn((u) => revoked.push(u));
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => SRC }));
  Object.defineProperty(navigator, 'standalone', { value: false, configurable: true });
});
afterEach(() => {
  stopWebApp();
  delete navigator.standalone;
  delete window.__lfxStandalone;
});

describe('webapp: id', () => {
  it('ein vorhandenes id des Original-Manifests bleibt, sonst start_url', () => {
    expect(buildManifest({ ...SRC, id: 'jf-app' }, 'https://srv.test/web/manifest.json', 'flix').id).toBe('https://srv.test/web/jf-app');
    expect(buildManifest(SRC, 'https://srv.test/web/manifest.json', 'flix').id).toBe('https://srv.test/web/index.html#/home');
  });
});

describe('webapp: Standalone-Klasse', () => {
  it('display-mode standalone setzt html.lfx-standalone', () => {
    mockMq(true);
    applyWebApp('flix');
    expect(document.documentElement.classList.contains('lfx-standalone')).toBe(true);
  });
  it('navigator.standalone === true reicht', () => {
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    expect(isStandalone()).toBe(true);
  });
  it('ohne Standalone keine Klasse; Debug-Override schlägt alles', () => {
    applyWebApp('flix');
    expect(document.documentElement.classList.contains('lfx-standalone')).toBe(false);
    window.__lfxStandalone = true;
    applyWebApp('flix');
    expect(document.documentElement.classList.contains('lfx-standalone')).toBe(true);
    mockMq(true);
    window.__lfxStandalone = false;
    applyWebApp('flix');
    expect(document.documentElement.classList.contains('lfx-standalone')).toBe(false);
  });
  it('stopWebApp entfernt die Klasse', () => {
    window.__lfxStandalone = true;
    applyWebApp('flix');
    stopWebApp();
    expect(document.documentElement.classList.contains('lfx-standalone')).toBe(false);
  });
});

describe('webapp: Manifest-Override', () => {
  it('buildManifest: Name, absolute URLs, id, Touch-Icon vorn', () => {
    const m = buildManifest(SRC, 'https://srv.test/web/manifest.json', 'plus');
    expect(m.name).toBe('LENZ+');
    expect(m.short_name).toBe('LENZ+');
    expect(m.start_url).toBe('https://srv.test/web/index.html#/home');
    expect(m.id).toBe('https://srv.test/web/index.html#/home');
    expect(m.scope).toBe('https://srv.test/web/');
    expect(m.icons[0]).toEqual({ src: 'https://x.test/assets/logo/touch-plus.png', sizes: '180x180', type: 'image/png', purpose: 'any' });
    expect(m.icons[1].src).toBe('https://srv.test/web/favicons/touchicon72.png');
  });

  it('setzt Blob-URL, merkt das Original, widerruft beim Designwechsel und stellt bei destroy her', async () => {
    applyWebApp('flix');
    await flush();
    const link = document.head.querySelector('link[rel="manifest"]');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(link.getAttribute('href')).toBe('blob:lfx/1');
    expect(JSON.parse(await blobs[0].text()).name).toBe('LENZFLIX');
    applyWebApp('flix'); // idempotent
    await flush();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    applyWebApp('retro');
    await flush();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1); // Original gecacht
    expect(link.getAttribute('href')).toBe('blob:lfx/2');
    expect(revoked).toEqual(['blob:lfx/1']);
    expect(JSON.parse(await blobs[1].text()).name).toBe('LENZ//84');
    stopWebApp();
    expect(link.getAttribute('href')).toBe('manifest.json');
    expect(revoked).toContain('blob:lfx/2');
  });

  it('ersetzter <link rel=manifest> wird auch bei gleichem Design neu überschrieben', async () => {
    applyWebApp('flix');
    await flush();
    document.head.innerHTML = '<link rel="manifest" href="manifest2.json">';
    applyWebApp('flix');
    await flush();
    expect(document.head.querySelector('link[rel="manifest"]').getAttribute('href')).toMatch(/^blob:lfx\//);
  });

  it('Wechsel von Standalone löst reevaluate() aus (nur bei echter Änderung)', () => {
    rt.reevaluate.mockClear();
    window.__lfxStandalone = true;
    applyWebApp('flix');
    expect(rt.reevaluate).toHaveBeenCalledTimes(1);
    applyWebApp('flix');
    expect(rt.reevaluate).toHaveBeenCalledTimes(1);
    window.__lfxStandalone = false;
    applyWebApp('flix');
    expect(rt.reevaluate).toHaveBeenCalledTimes(2);
  });

  it('ohne navigator.standalone (Android/Desktop) unberührt', async () => {
    delete navigator.standalone;
    applyWebApp('flix');
    await flush();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(document.head.querySelector('link[rel="manifest"]').getAttribute('href')).toBe('manifest.json');
  });

  it('Fetch-Fehler: Original bleibt, Rückoff 2/5/15/60 s, danach aufgeben', async () => {
    const t0 = 1_000_000;
    let now = t0;
    const dn = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      globalThis.fetch = vi.fn(async () => { throw new Error('offline'); });
      // schnelle Abgleiche (100-ms-Takt beim Start) verbrauchen nur einen Versuch
      for (let i = 0; i < 8; i++) { applyWebApp('flix'); await flush(); now += 100; }
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      let failAt = t0; // Zeitpunkt des letzten Fehlversuchs (der erste lief bei t0)
      for (const wait of [2000, 5000, 15000, 60000]) {
        const before = globalThis.fetch.mock.calls.length;
        now = failAt + wait - 1; applyWebApp('flix'); await flush();
        expect(globalThis.fetch.mock.calls.length).toBe(before); // noch in der Wartezeit
        now = failAt + wait; applyWebApp('flix'); await flush();
        expect(globalThis.fetch.mock.calls.length).toBe(before + 1);
        failAt = now;
      }
      expect(globalThis.fetch).toHaveBeenCalledTimes(5);
      now += 600000; applyWebApp('flix'); await flush();
      expect(globalThis.fetch).toHaveBeenCalledTimes(5); // aufgegeben
      expect(document.head.querySelector('link[rel="manifest"]').getAttribute('href')).toBe('manifest.json');
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      applyWebApp('retro'); await flush(); // Designwechsel: neuer Versuch
      expect(globalThis.fetch).toHaveBeenCalledTimes(6);
    } finally { dn.mockRestore(); }
  });

  it('Fehler, dann Erfolg nach Ablauf der Wartezeit setzt das Manifest', async () => {
    let now = 5_000_000;
    const dn = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      let n = 0;
      globalThis.fetch = vi.fn(async () => {
        if (n++ === 0) throw new Error('503');
        return { ok: true, status: 200, json: async () => SRC };
      });
      applyWebApp('plus'); await flush();
      applyWebApp('plus'); await flush(); // noch in der Wartezeit
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      now += 2100; applyWebApp('plus'); await flush();
      expect(document.head.querySelector('link[rel="manifest"]').getAttribute('href')).toMatch(/^blob:/);
    } finally { dn.mockRestore(); }
  });

  it('HTTP-Fehler lässt das Original stehen', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    applyWebApp('plus');
    await flush();
    expect(document.head.querySelector('link[rel="manifest"]').getAttribute('href')).toBe('manifest.json');
  });

  it('ohne Manifest-Link nichts zu tun', async () => {
    document.head.innerHTML = '';
    applyWebApp('flix');
    await flush();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('buildManifest: data:-Touch-Icon', () => {
  it('data:-URI wird nicht ins Manifest übernommen, Original-Icons bleiben', async () => {
    vi.resetModules();
    vi.doMock('../src/js/core/favicon.js', () => ({ touchFor: () => 'data:image/png;base64,AAAA' }));
    const mod = await import('../src/js/core/webapp.js');
    const m = mod.buildManifest(SRC, 'https://srv.test/web/manifest.json', 'flix');
    expect(m.icons).toEqual([{ src: 'https://srv.test/web/favicons/touchicon72.png', sizes: '72x72', type: 'image/png' }]);
    vi.doUnmock('../src/js/core/favicon.js');
  });
});

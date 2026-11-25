// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ statsUrl: null, user: null, qc: true, qcCalls: 0 }));

vi.mock('../src/js/core/api.js', () => ({
  getUser: vi.fn(async () => h.user),
  getUserId: () => 'u1',
  getJson: vi.fn(async (path) => {
    if (path !== '/QuickConnect/Enabled') throw new Error('unerwartet');
    h.qcCalls++;
    if (h.qc instanceof Error) throw h.qc;
    return h.qc;
  }),
  buildUrl: (path, params) => {
    const q = new URLSearchParams(params || {}).toString();
    return `http://srv${path}${q ? `?${q}` : ''}`;
  },
}));
vi.mock('../src/js/core/stats.js', () => ({
  getStatsUrl: vi.fn(() => h.statsUrl),
  statsHref: vi.fn((t) => (h.statsUrl ? `${h.statsUrl}?theme=${t}` : null)),
}));
vi.mock('../src/js/core/themepicker.js', () => ({ openThemePicker: vi.fn() }));

import { profileEntries, logout, getUserChip, quickConnectEnabled } from '../src/js/shared/profile.js';
import { openThemePicker } from '../src/js/core/themepicker.js';
import { clearCache } from '../src/js/core/cache.js';

beforeEach(() => {
  vi.clearAllMocks();
  clearCache();
  vi.useRealTimers();
  h.qc = true;
  h.qcCalls = 0;
  h.statsUrl = 'https://stats.example/me';
  h.user = { Id: 'u1', Name: 'Anna', PrimaryImageTag: 'abc', Policy: { IsAdministrator: false } };
  delete window.Dashboard;
  window.location.hash = '#/home';
});

const keys = (e) => e.map((x) => x.key);
const noBadSeps = (e) => {
  expect(e[0].separator).toBeFalsy();
  expect(e[e.length - 1].separator).toBeFalsy();
  e.forEach((x, i) => { if (x.separator) expect(e[i - 1].separator).toBeFalsy(); });
};

describe('profileEntries', () => {
  it('Reihenfolge mit Statistik, Admin und Quick Connect', async () => {
    h.user.Policy.IsAdministrator = true;
    const e = await profileEntries({ theme: 'plus' });
    expect(keys(e)).toEqual([
      'stats', 'design', 'datasaver', 'sep', 'profile', 'settings', 'sep', 'dashboard', 'metadata', 'sep', 'quickconnect', 'logout',
    ]);
    const lab = (k) => e.find((x) => x.key === k).label;
    expect(['stats', 'design', 'datasaver', 'profile', 'settings', 'dashboard', 'metadata', 'quickconnect', 'logout'].map(lab)).toEqual([
      'Meine Statistik', 'Design-Einstellungen', 'Datensparmodus', 'Profil', 'Einstellungen', 'Übersicht', 'Metadaten-Manager', 'Quick Connect', 'Abmelden',
    ]);
    expect(e[0]).toMatchObject({ href: 'https://stats.example/me?theme=plus', className: 'is-stats' });
    expect(e[2]).toMatchObject({ switch: true, checked: false });
    expect(e.filter((x) => x.separator).every((x) => x.key === 'sep')).toBe(true);
    expect(e.find((x) => x.key === 'profile').href).toBe('#/userprofile?userId=u1');
    expect(e.find((x) => x.key === 'settings').href).toBe('#/mypreferencesmenu');
    expect(e.find((x) => x.key === 'dashboard').href).toBe('#/dashboard');
    expect(e.find((x) => x.key === 'metadata').href).toBe('#/metadata');
    expect(e.find((x) => x.key === 'quickconnect').href).toBe('#/quickconnect');
    noBadSeps(e);
  });

  it('keine Admin-Gruppe ohne Admin-Policy, keine doppelten Trenner', async () => {
    const e = await profileEntries();
    expect(keys(e)).toEqual(['stats', 'design', 'datasaver', 'sep', 'profile', 'settings', 'sep', 'quickconnect', 'logout']);
    noBadSeps(e);
  });

  it('getUser-Fehler: weiter ohne Admin, Profil über getUserId', async () => {
    const { getUser } = await import('../src/js/core/api.js');
    getUser.mockRejectedValueOnce(new Error('x'));
    const e = await profileEntries({ theme: 'flix' });
    expect(keys(e)).not.toContain('dashboard');
    expect(e.find((x) => x.key === 'profile').href).toBe('#/userprofile?userId=u1');
  });

  it('Profil-href kodiert die userId', async () => {
    h.user.Id = 'a b/c';
    const e = await profileEntries();
    expect(e.find((x) => x.key === 'profile').href).toBe('#/userprofile?userId=a%20b%2Fc');
  });

  it('Quick Connect: aus / Fehler / nicht-true → kein Eintrag, kein Trenner am Ende', async () => {
    for (const v of [false, 'true', null, new Error('503')]) {
      clearCache();
      h.qc = v;
      const e = await profileEntries({ theme: 'plus' });
      expect(keys(e)).not.toContain('quickconnect');
      expect(keys(e)).toEqual(['stats', 'design', 'datasaver', 'sep', 'profile', 'settings', 'sep', 'logout']);
      noBadSeps(e);
    }
  });

  it('Quick Connect: Erfolg 10 min gemerkt, Fehler nur 30 s', async () => {
    vi.useFakeTimers();
    expect(await quickConnectEnabled()).toBe(true);
    await quickConnectEnabled();
    expect(h.qcCalls).toBe(1);
    vi.advanceTimersByTime(9 * 60_000);
    await quickConnectEnabled();
    expect(h.qcCalls).toBe(1);
    vi.advanceTimersByTime(2 * 60_000);
    await quickConnectEnabled();
    expect(h.qcCalls).toBe(2);

    clearCache();
    h.qcCalls = 0;
    h.qc = new Error('x');
    expect(await quickConnectEnabled()).toBe(false);
    await quickConnectEnabled();
    expect(h.qcCalls).toBe(1);
    vi.advanceTimersByTime(31_000);
    h.qc = true;
    expect(await quickConnectEnabled()).toBe(true);
    expect(h.qcCalls).toBe(2);
  });

  it('Trenner-Regeln bei store ohne Sparmodus, ohne Stats, ohne Admin, ohne QC', async () => {
    h.statsUrl = null;
    h.qc = false;
    const e = await profileEntries({ theme: 'store' });
    expect(keys(e)).toEqual(['design', 'sep', 'profile', 'settings', 'sep', 'logout']);
    noBadSeps(e);
  });

  it('Datensparmodus bei flix/plus/prime/retro (kein Eintrag bei store)', async () => {
    for (const theme of ['flix', 'plus', 'prime', 'retro']) {
      expect((await profileEntries({ theme })).map((x) => x.key)).toContain('datasaver');
    }
    for (const theme of ['store']) {
      expect((await profileEntries({ theme })).map((x) => x.key)).not.toContain('datasaver');
    }
  });

  it('ohne statsUrl kein Stats-Eintrag', async () => {
    h.statsUrl = null;
    const e = await profileEntries({ theme: 'flix' });
    expect(e.map((x) => x.key)).not.toContain('stats');
  });

  it('Design-Eintrag öffnet den Picker mit returnFocus', async () => {
    const btn = document.createElement('button');
    const e = await profileEntries({ returnFocus: btn });
    e.find((x) => x.key === 'design').onClick();
    expect(openThemePicker).toHaveBeenCalledWith({ returnFocus: btn });
  });

  it('Abmelden ruft logout (Dashboard.logout)', async () => {
    window.Dashboard = { logout: vi.fn() };
    const e = await profileEntries();
    e.find((x) => x.key === 'logout').onClick();
    expect(window.Dashboard.logout).toHaveBeenCalledTimes(1);
  });
});

describe('logout', () => {
  it('Fallback ohne Dashboard.logout: Einstellungen-Seite', () => {
    logout();
    expect(window.location.hash).toBe('#/mypreferencesmenu');
  });
});

describe('getUserChip', () => {
  it('Name und Bild-URL ohne api_key', async () => {
    const c = await getUserChip();
    expect(c.name).toBe('Anna');
    expect(c.imageUrl).toContain('/Users/u1/Images/Primary');
    expect(c.imageUrl).toContain('tag=abc');
    expect(c.imageUrl).toContain('maxWidth=96');
    expect(c.imageUrl).not.toContain('api_key');
  });

  it('ohne Bild-Tag oder Benutzer: imageUrl null', async () => {
    h.user = { Id: 'u1', Name: 'Anna' };
    expect((await getUserChip()).imageUrl).toBeNull();
    h.user = null;
    expect(await getUserChip()).toEqual({ name: '', imageUrl: null });
  });

  it('fragt erneut, solange Jellyfin den Benutzer beim Start noch nicht kennt', async () => {
    const { getUser } = await import('../src/js/core/api.js');
    const user = h.user;
    h.user = null;
    setTimeout(() => { h.user = user; }, 15);
    const c = await getUserChip({ retries: 10, delay: 10 });
    expect(c.name).toBe('Anna');
    expect(c.imageUrl).toContain('tag=abc');
    expect(getUser.mock.calls.length).toBeGreaterThan(1);
  });

  it('bricht das Nachfragen ab, wenn isAlive() false wird', async () => {
    h.user = null;
    const { getUser } = await import('../src/js/core/api.js');
    const c = await getUserChip({ retries: 50, delay: 5, isAlive: () => getUser.mock.calls.length < 2 });
    expect(c).toEqual({ name: '', imageUrl: null });
    expect(getUser.mock.calls.length).toBe(2);
  });
});

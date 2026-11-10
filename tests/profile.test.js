// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ statsUrl: null, user: null }));

vi.mock('../src/js/core/api.js', () => ({
  getUser: vi.fn(async () => h.user),
  getUserId: () => 'u1',
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

import { profileEntries, logout, getUserChip } from '../src/js/shared/profile.js';
import { openThemePicker } from '../src/js/core/themepicker.js';

beforeEach(() => {
  vi.clearAllMocks();
  h.statsUrl = 'https://stats.example/me';
  h.user = { Id: 'u1', Name: 'Anna', PrimaryImageTag: 'abc', Policy: { IsAdministrator: false } };
  delete window.Dashboard;
  window.location.hash = '#/home';
});

describe('profileEntries', () => {
  it('Reihenfolge mit Statistik und Admin', async () => {
    h.user.Policy.IsAdministrator = true;
    const e = await profileEntries({ theme: 'plus' });
    expect(e.map((x) => x.key)).toEqual(['stats', 'design', 'settings', 'dashboard', 'logout']);
    expect(e.map((x) => x.label)).toEqual(['Meine Statistik', 'Design Einstellungen', 'Einstellungen', 'Dashboard', 'Abmelden']);
    expect(e[1].badge).toBe('Beta');
    expect(e[0]).toMatchObject({ href: 'https://stats.example/me?theme=plus', className: 'is-stats' });
    expect(e[2].href).toBe('#/mypreferencesmenu');
    expect(e[3].href).toBe('#/dashboard');
  });

  it('kein Dashboard ohne Admin-Policy', async () => {
    const e = await profileEntries();
    expect(e.map((x) => x.key)).toEqual(['stats', 'design', 'settings', 'logout']);
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

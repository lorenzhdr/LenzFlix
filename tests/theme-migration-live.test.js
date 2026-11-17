// @vitest-environment jsdom
// Migration 1.15.0: LENZ LIVE ist entfernt. Gespeichertes 'live' (lokal oder auf dem Server) wird durch das früher gemerkte Design
// (lfx.theme.prev.<uid|last> bzw. CustomPrefs.prevTheme) ersetzt, sonst durch LENZFLIX; die prev-Reste werden gelöscht.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const html = document.documentElement;
let pending;
let current = null;

function setUser(uid) {
  localStorage.setItem('jellyfin_credentials', JSON.stringify({ Servers: [{ Id: 's', UserId: uid, AccessToken: 'tok', ManualAddress: 'http://srv' }] }));
}

async function load() {
  vi.resetModules();
  pending = {};
  vi.doMock('../src/js/core/themecss.js', () => ({
    ensureThemeCss: vi.fn((id) => new Promise((resolve) => { (pending[id] = pending[id] || []).push({ resolve }); })),
    removeThemeCss: vi.fn(),
  }));
  vi.doMock('../src/js/core/toast.js', () => ({ toast: vi.fn() }));
  current = await import('../src/js/core/theme.js');
  return current;
}
const settle = (id, ok = true) => pending[id].shift().resolve(ok);
const flush = () => new Promise((r) => setTimeout(r, 0));

function serverClient(customPrefs) {
  return {
    getDisplayPreferences: vi.fn(async () => ({ Id: 'lenzflix', CustomPrefs: customPrefs })),
    updateDisplayPreferences: vi.fn(async () => null),
  };
}

beforeEach(() => {
  localStorage.clear();
  html.className = '';
  window.location.hash = '#/home';
  delete window.ApiClient;
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 Desktop');
});
afterEach(() => {
  try { current?.destroyTheme(); } catch { /* egal */ }
  current = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.doUnmock('../src/js/core/themecss.js');
  vi.doUnmock('../src/js/core/toast.js');
});

describe('live ist kein Design mehr', () => {
  it('THEMES, normalizeTheme und der Rest der API kennen live nicht', async () => {
    const t = await load();
    expect(t.THEMES).not.toContain('live');
    expect(t.THEME_META.live).toBeUndefined();
    expect(t.normalizeTheme('live')).toBe('flix');
    expect(t.getPreviousTheme).toBeUndefined();
  });

  it('Hash lfxtheme=live wird ignoriert', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'retro');
    window.location.hash = '#/home?lfxtheme=live';
    const t = await load();
    t.startTheme();
    expect(t.getChosenTheme()).toBe('retro');
  });
});

describe('lokale Migration', () => {
  it('Benutzer-Schlüssel live + prev plus -> plus, prev gelöscht', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'live');
    localStorage.setItem('lfx.theme.last', 'live');
    localStorage.setItem('lfx.theme.prev.u1', 'plus');
    localStorage.setItem('lfx.theme.prev.last', 'plus');
    const t = await load();
    expect(t.getChosenTheme()).toBe('plus');
    expect(localStorage.getItem('lfx.theme.u1')).toBe('plus');
    expect(localStorage.getItem('lfx.theme.last')).toBe('plus');
    expect(localStorage.getItem('lfx.theme.prev.u1')).toBeNull();
    expect(localStorage.getItem('lfx.theme.prev.last')).toBeNull();
  });

  it('ohne oder mit ungültigem prev -> flix', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'live');
    localStorage.setItem('lfx.theme.prev.u1', 'live');
    const t = await load();
    expect(t.getChosenTheme()).toBe('flix');
    expect(localStorage.getItem('lfx.theme.u1')).toBe('flix');
    expect(localStorage.getItem('lfx.theme.prev.u1')).toBeNull();
    localStorage.setItem('lfx.theme.u1', 'live');
    localStorage.setItem('lfx.theme.prev.u1', 'unbekannt');
    expect(t.getChosenTheme()).toBe('flix');
  });

  it('nur lfx.theme.last (kein Benutzer) live + prev.last retro -> retro', async () => {
    localStorage.setItem('lfx.theme.last', 'live');
    localStorage.setItem('lfx.theme.prev.last', 'retro');
    const t = await load();
    expect(t.getChosenTheme()).toBe('retro');
    expect(localStorage.getItem('lfx.theme.last')).toBe('retro');
    expect(localStorage.getItem('lfx.theme.prev.last')).toBeNull();
  });

  it('andere Designs bleiben unberührt (prev-Schlüssel ebenso)', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'prime');
    localStorage.setItem('lfx.theme.prev.u1', 'plus');
    const t = await load();
    expect(t.getChosenTheme()).toBe('prime');
    expect(localStorage.getItem('lfx.theme.prev.u1')).toBe('plus');
  });
});

describe('Server-Migration', () => {
  it('theme live + prevTheme prime -> prime, Upload ohne prevTheme', async () => {
    setUser('u1');
    const client = serverClient({ other: '1', theme: 'live', prevTheme: 'prime' });
    window.ApiClient = client;
    const t = await load();
    t.startTheme();
    t.syncThemeUser();
    await flush();
    settle('prime');
    await flush();
    expect(t.getTheme()).toBe('prime');
    expect(localStorage.getItem('lfx.theme.u1')).toBe('prime');
    expect(client.updateDisplayPreferences).toHaveBeenCalledTimes(1);
    expect(client.updateDisplayPreferences.mock.calls[0][1].CustomPrefs).toEqual({ other: '1', theme: 'prime' });
  });

  it('theme live ohne prevTheme -> lokale Wahl bleibt, Server wird korrigiert', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'plus');
    const client = serverClient({ theme: 'live' });
    window.ApiClient = client;
    const t = await load();
    t.startTheme();
    settle('plus');
    t.syncThemeUser();
    await flush();
    expect(t.getChosenTheme()).toBe('plus');
    expect(client.updateDisplayPreferences).toHaveBeenCalledTimes(1);
    expect(client.updateDisplayPreferences.mock.calls[0][1].CustomPrefs).toEqual({ theme: 'plus' });
  });

  it('theme live, nichts lokal -> flix und Upload', async () => {
    setUser('u1');
    const client = serverClient({ theme: 'live', prevTheme: 'live' });
    window.ApiClient = client;
    const t = await load();
    t.startTheme();
    t.syncThemeUser();
    await flush();
    expect(t.getTheme()).toBe('flix');
    expect(client.updateDisplayPreferences.mock.calls[0][1].CustomPrefs).toEqual({ theme: 'flix' });
  });

  it('jeder spätere Upload entfernt ein übrig gebliebenes prevTheme', async () => {
    vi.useFakeTimers();
    setUser('u1');
    const client = serverClient({ other: '1', theme: 'plus', prevTheme: 'retro' });
    window.ApiClient = client;
    const t = await load();
    t.startTheme();
    const p = t.setTheme('prime', { source: 'user' });
    settle('prime');
    await p;
    await vi.advanceTimersByTimeAsync(500);
    expect(client.updateDisplayPreferences.mock.calls[0][1].CustomPrefs).toEqual({ other: '1', theme: 'prime' });
  });
});

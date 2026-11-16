// @vitest-environment jsdom
// Design-Kern und themeroute: Benutzerwechsel, Reveal-Fenster, Zurückwechseln beim Laden, Frist, Hash-Wahl vor Login, Neuversuch nach Fehlstart.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const html = document.documentElement;
let pending;
let removeMock;
let current = null;

function setUser(uid) {
  if (uid) {
    localStorage.setItem('jellyfin_credentials', JSON.stringify({ Servers: [{ Id: 's', UserId: uid, AccessToken: 'tok', ManualAddress: 'http://srv' }] }));
  } else {
    localStorage.removeItem('jellyfin_credentials');
  }
}

async function load() {
  vi.resetModules();
  pending = {};
  removeMock = vi.fn();
  vi.doMock('../src/js/core/themecss.js', () => ({
    ensureThemeCss: vi.fn((id) => new Promise((resolve) => { (pending[id] = pending[id] || []).push({ resolve }); })),
    removeThemeCss: removeMock,
  }));
  vi.doMock('../src/js/core/toast.js', () => ({ toast: vi.fn() }));
  current = await import('../src/js/core/theme.js');
  return current;
}
const settle = (id, ok = true) => pending[id].shift().resolve(ok);
const flush = () => new Promise((r) => setTimeout(r, 0));
const prefs = (theme) => ({ Id: 'lenzflix', CustomPrefs: theme ? { theme } : {} });
const mockApi = () => vi.doMock('../src/js/core/api.js', async (orig) => ({ ...(await orig()), getViews: vi.fn(async () => ({ Items: [] })), getAuth: () => ({ serverId: 's' }) }));

beforeEach(() => {
  localStorage.clear();
  html.className = '';
  document.getElementById('lfx-theme-prehide')?.remove();
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
  vi.doUnmock('../src/js/core/api.js');
});

describe('Benutzerwechsel erbt nicht lfx.theme.last des Vorgängers', () => {
  it('u1 (live) -> u2 ohne Schlüssel, Server leer: flix, kein Upload', async () => {
    vi.useFakeTimers();
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'live');
    localStorage.setItem('lfx.theme.last', 'live');
    window.ApiClient = { getDisplayPreferences: vi.fn(async () => prefs(null)), updateDisplayPreferences: vi.fn(async () => null) };
    const t = await load();
    t.startTheme();
    settle('live');
    await vi.advanceTimersByTimeAsync(0);
    expect(t.getTheme()).toBe('live');
    setUser('u2');
    t.syncThemeUser();
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.getChosenTheme()).toBe('flix');
    expect(t.getTheme()).toBe('flix');
    expect(window.ApiClient.updateDisplayPreferences).not.toHaveBeenCalled();
    expect(localStorage.getItem('lfx.theme.u2')).toBeNull();
  });

  it('Abmeldung dazwischen (u1 -> null -> u2) erbt ebenfalls nicht', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'prime');
    localStorage.setItem('lfx.theme.last', 'prime');
    const t = await load();
    t.startTheme();
    settle('prime');
    await flush();
    setUser(null);
    t.syncThemeUser();
    setUser('u2');
    t.syncThemeUser();
    expect(t.getChosenTheme()).toBe('flix');
  });
});

describe('kein Umleiten der Design-Routen im Reveal-Fenster', () => {
  it('Reveal (pending): themeroute matcht nicht; nach Commit auf plus bleibt die Route', async () => {
    vi.useFakeTimers();
    window.location.hash = '#/home?lfx=title&id=X';
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'plus');
    mockApi();
    const t = await load();
    const router = await import('../src/js/core/router.js');
    const themeroute = (await import('../src/js/features/themeroute.js')).default;
    t.startTheme();
    await vi.advanceTimersByTimeAsync(1500);
    expect(t.getTheme()).toBe('flix');
    expect(t.getThemeState()).toBe('pending');
    expect(t.isThemePending()).toBe(true);
    expect(themeroute.match(router.parseHash('#/home?lfx=title&id=X'))).toBe(false);
    expect(themeroute.match(router.parseHash('#/home?lfx=hub&lib=X'))).toBe(false);
    expect(themeroute.match(router.parseHash('#/home?lfx=series'))).toBe(false);
    settle('plus');
    await vi.advanceTimersByTimeAsync(0);
    expect(t.getTheme()).toBe('plus');
    expect(t.isThemePending()).toBe(false);
    expect(themeroute.match(router.parseHash('#/home?lfx=title&id=X'))).toBe(false); // plus: Design-Route gehört dem Design
  });

  it('nach gescheitertem Erststart (failed, flix) wird wieder umgeleitet', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'plus');
    mockApi();
    const t = await load();
    const router = await import('../src/js/core/router.js');
    const themeroute = (await import('../src/js/features/themeroute.js')).default;
    t.startTheme();
    settle('plus', false);
    await flush();
    expect(t.getThemeState()).toBe('failed');
    expect(themeroute.match(router.parseHash('#/home?lfx=title&id=X'))).toBe(true);
  });

  it('Reveal, dann failed: Route wird neu bewertet (reevaluate-Aufruf)', async () => {
    vi.useFakeTimers();
    window.location.hash = '#/home?lfx=title&id=X';
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'plus');
    mockApi();
    const reevaluate = vi.fn();
    vi.doMock('../src/js/core/router.js', async (orig) => ({ ...(await orig()), reevaluate }));
    try {
      const t = await load();
      t.startTheme();
      await vi.advanceTimersByTimeAsync(1500);
      expect(t.getTheme()).toBe('flix');
      expect(t.getThemeState()).toBe('pending');
      const before = reevaluate.mock.calls.length;
      settle('plus', false);
      await vi.advanceTimersByTimeAsync(0);
      expect(t.getThemeState()).toBe('failed');
      expect(reevaluate.mock.calls.length).toBeGreaterThan(before);
    } finally {
      vi.doUnmock('../src/js/core/router.js');
    }
  });

  it('Reveal, dann Server-Wert flix: Route wird neu bewertet (state active)', async () => {
    vi.useFakeTimers();
    window.location.hash = '#/home?lfx=title&id=X';
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'plus');
    mockApi();
    const reevaluate = vi.fn();
    vi.doMock('../src/js/core/router.js', async (orig) => ({ ...(await orig()), reevaluate }));
    try {
      const t = await load();
      t.startTheme();
      await vi.advanceTimersByTimeAsync(1500);
      expect(t.getThemeState()).toBe('pending');
      const before = reevaluate.mock.calls.length;
      await t.setTheme('flix', { source: 'server' });
      expect(t.getThemeState()).toBe('active');
      expect(reevaluate.mock.calls.length).toBeGreaterThan(before);
    } finally {
      vi.doUnmock('../src/js/core/router.js');
    }
  });
});

describe('Zurückwechseln während des Ladens', () => {
  it('Link des überholten Ziels wird entfernt (nur das wirksame Design bleibt)', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'plus');
    const t = await load();
    t.startTheme();
    settle('plus');
    await flush();
    expect(t.getTheme()).toBe('plus');
    removeMock.mockClear();
    const p = t.setTheme('prime');
    expect(pending.prime).toHaveLength(1);
    await t.setTheme('plus');
    expect(removeMock).toHaveBeenLastCalledWith('plus');
    settle('prime');
    await p;
    expect(t.getTheme()).toBe('plus');
  });
});

describe('Frist von 1,5 s wird bei zweitem Ziel nicht neu gestartet', () => {
  it('Server-Wert nach 1,2 s: LENZFLIX erscheint trotzdem nach 1,5 s', async () => {
    vi.useFakeTimers();
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'prime');
    const t = await load();
    t.startTheme();
    await vi.advanceTimersByTimeAsync(1200);
    expect(t.getTheme()).toBe(null);
    t.setTheme('plus', { source: 'server' });
    await vi.advanceTimersByTimeAsync(400);
    expect(t.getTheme()).toBe('flix');
    expect(t.getThemeState()).toBe('pending');
  });
});

describe('Hash-Wahl ohne Benutzer überlebt den Login', () => {
  it('lfxtheme=plus vor Login: nach Login Wahl des Benutzers, Server-Wert überstimmt sie nicht', async () => {
    vi.useFakeTimers();
    localStorage.setItem('lfx.theme.u1', 'prime');
    window.location.hash = '#/home?lfxtheme=plus';
    window.ApiClient = { getDisplayPreferences: vi.fn(async () => prefs('prime')), updateDisplayPreferences: vi.fn(async () => null) };
    const t = await load();
    t.startTheme();
    settle('plus');
    await vi.advanceTimersByTimeAsync(0);
    expect(t.getTheme()).toBe('plus');
    setUser('u1');
    t.syncThemeUser();
    expect(t.getChosenTheme()).toBe('plus');
    expect(localStorage.getItem('lfx.theme.u1')).toBe('plus');
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.getChosenTheme()).toBe('plus');
    expect(t.getTheme()).toBe('plus');
    expect(window.ApiClient.updateDisplayPreferences).toHaveBeenCalledTimes(1);
    expect(window.ApiClient.updateDisplayPreferences.mock.calls[0][1].CustomPrefs.theme).toBe('plus');
  });

  it('lfxtheme=live vor Login: Vorgänger-Design (prevTheme) geht auf den Benutzer über', async () => {
    localStorage.setItem('lfx.theme.last', 'retro');
    window.location.hash = '#/home?lfxtheme=live';
    const t = await load();
    t.startTheme();
    settle('live');
    await flush();
    setUser('u1');
    t.syncThemeUser();
    expect(t.getPreviousTheme()).toBe('retro');
  });
});

describe('gescheiterter Erststart lässt sich erneut versuchen', () => {
  it('failed -> setTheme(gleiches Design) lädt neu und wendet an', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'prime');
    const t = await load();
    t.startTheme();
    settle('prime', false);
    await flush();
    expect(t.getThemeState()).toBe('failed');
    expect(t.getChosenTheme()).toBe('prime');
    const p = t.setTheme('prime');
    expect(pending.prime).toHaveLength(1);
    settle('prime');
    await p;
    expect(t.getTheme()).toBe('prime');
    expect(t.getThemeState()).toBe('active');
  });
});

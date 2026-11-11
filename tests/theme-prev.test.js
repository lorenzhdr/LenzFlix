// @vitest-environment jsdom
// prevTheme: Beim Wechsel zu LENZ LIVE wird das bisherige Design gemerkt (lokal + CustomPrefs.prevTheme).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const html = document.documentElement;
let pending;
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

/** Wechselt auf id und löst das Design-CSS auf. */
async function switchTo(t, id) {
  const p = t.setTheme(id, { source: 'user' });
  if (pending[id] && pending[id].length) settle(id);
  await p;
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

describe('getPreviousTheme', () => {
  it('Fallback flix ohne Eintrag', async () => {
    setUser('u1');
    const t = await load();
    expect(t.getPreviousTheme()).toBe('flix');
  });

  it('liefert nie live und nur gültige ids', async () => {
    setUser('u1');
    const t = await load();
    localStorage.setItem('lfx.theme.prev.u1', 'live');
    expect(t.getPreviousTheme()).toBe('flix');
    localStorage.setItem('lfx.theme.prev.u1', 'unbekannt');
    expect(t.getPreviousTheme()).toBe('flix');
    localStorage.setItem('lfx.theme.prev.u1', 'retro');
    expect(t.getPreviousTheme()).toBe('retro');
  });
});

describe('Wechsel zu live', () => {
  it('speichert das bisherige Design lokal', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'plus');
    const t = await load();
    t.startTheme();
    settle('plus');
    await flush();
    await switchTo(t, 'live');
    expect(t.getTheme()).toBe('live');
    expect(localStorage.getItem('lfx.theme.prev.u1')).toBe('plus');
    expect(t.getPreviousTheme()).toBe('plus');
  });

  it('Wechsel von flix (kein CSS) speichert flix', async () => {
    setUser('u1');
    const t = await load();
    t.startTheme();
    await switchTo(t, 'live');
    expect(t.getPreviousTheme()).toBe('flix');
    expect(localStorage.getItem('lfx.theme.prev.u1')).toBe('flix');
  });

  it('Wechsel zwischen anderen Designs ändert prevTheme nicht', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.prev.u1', 'retro');
    const t = await load();
    t.startTheme();
    await switchTo(t, 'plus');
    await switchTo(t, 'prime');
    expect(localStorage.getItem('lfx.theme.prev.u1')).toBe('retro');
  });

  it('Rückkehr von live ändert prevTheme nicht, live überschreibt nie mit live', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'prime');
    const t = await load();
    t.startTheme();
    settle('prime');
    await flush();
    await switchTo(t, 'live');
    expect(t.getPreviousTheme()).toBe('prime');
    await switchTo(t, 'live'); // schon live: nichts
    expect(t.getPreviousTheme()).toBe('prime');
    await switchTo(t, 'plus');
    expect(t.getTheme()).toBe('plus');
    expect(t.getPreviousTheme()).toBe('prime');
  });

  it('gescheiterter Wechsel (Design-CSS lädt nicht) speichert nichts', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'plus');
    const t = await load();
    t.startTheme();
    settle('plus');
    await flush();
    const p = t.setTheme('live', { source: 'user' });
    settle('live', false);
    await p;
    expect(t.getTheme()).toBe('plus');
    expect(localStorage.getItem('lfx.theme.prev.u1')).toBeNull();
  });

  it('Server-Wahl (source server) schreibt prevTheme nicht', async () => {
    setUser('u1');
    const t = await load();
    t.startTheme();
    const p = t.setTheme('live', { source: 'server' });
    settle('live');
    await p;
    expect(localStorage.getItem('lfx.theme.prev.u1')).toBeNull();
  });

  it('Hash lfxtheme=live beim Start speichert die bisherige Wahl', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'retro');
    window.location.hash = '#/home?lfxtheme=live';
    const t = await load();
    t.startTheme();
    expect(t.getChosenTheme()).toBe('live');
    expect(t.getPreviousTheme()).toBe('retro');
  });
});

describe('Server', () => {
  it('Upload enthält theme und prevTheme im selben Objekt (Rest bleibt)', async () => {
    vi.useFakeTimers();
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'plus');
    const client = {
      getDisplayPreferences: vi.fn(async () => ({ Id: 'lenzflix', CustomPrefs: { other: '1' } })),
      updateDisplayPreferences: vi.fn(async () => null),
    };
    window.ApiClient = client;
    const t = await load();
    t.startTheme();
    settle('plus');
    await vi.advanceTimersByTimeAsync(0);
    const p = t.setTheme('live', { source: 'user' });
    settle('live');
    await p;
    await vi.advanceTimersByTimeAsync(500);
    expect(client.updateDisplayPreferences).toHaveBeenCalledTimes(1);
    expect(client.updateDisplayPreferences.mock.calls[0][1].CustomPrefs).toEqual({ other: '1', theme: 'live', prevTheme: 'plus' });
  });

  it('Upload ohne gespeichertes prevTheme lässt das Feld weg', async () => {
    vi.useFakeTimers();
    setUser('u1');
    const client = {
      getDisplayPreferences: vi.fn(async () => ({ CustomPrefs: {} })),
      updateDisplayPreferences: vi.fn(async () => null),
    };
    window.ApiClient = client;
    const t = await load();
    t.startTheme();
    const p = t.setTheme('prime', { source: 'user' });
    settle('prime');
    await p;
    await vi.advanceTimersByTimeAsync(500);
    expect(client.updateDisplayPreferences.mock.calls[0][1].CustomPrefs).toEqual({ theme: 'prime' });
  });

  it('loadRemoteTheme übernimmt CustomPrefs.prevTheme lokal', async () => {
    setUser('u1');
    window.ApiClient = {
      getDisplayPreferences: vi.fn(async () => ({ CustomPrefs: { theme: 'live', prevTheme: 'prime' } })),
      updateDisplayPreferences: vi.fn(async () => null),
    };
    const t = await load();
    t.startTheme();
    t.syncThemeUser();
    await flush();
    settle('live');
    await flush();
    expect(t.getTheme()).toBe('live');
    expect(t.getPreviousTheme()).toBe('prime');
    expect(localStorage.getItem('lfx.theme.prev.u1')).toBe('prime');
  });

  it('ungültiges oder live-prevTheme vom Server wird ignoriert', async () => {
    setUser('u1');
    window.ApiClient = {
      getDisplayPreferences: vi.fn(async () => ({ CustomPrefs: { theme: 'flix', prevTheme: 'live' } })),
      updateDisplayPreferences: vi.fn(async () => null),
    };
    const t = await load();
    t.startTheme();
    t.syncThemeUser();
    await flush();
    expect(localStorage.getItem('lfx.theme.prev.u1')).toBeNull();
    expect(t.getPreviousTheme()).toBe('flix');
  });
});

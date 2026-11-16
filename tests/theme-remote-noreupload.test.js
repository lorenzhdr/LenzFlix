// @vitest-environment jsdom
// Server-Abgleich: kein zweiter Upload, wenn der Server schon die Nutzerwahl hat (Boot mit ?lfxtheme).
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

describe('loadRemoteTheme nach Nutzerwahl', () => {
  it('Server liefert schon die Wahl, Upload läuft: kein zweiter Upload', async () => {
    vi.useFakeTimers();
    setUser('u1');
    let releaseRemote;
    let releasePost;
    let gets = 0;
    const client = {
      getDisplayPreferences: vi.fn(() => {
        gets++;
        const prefs = { Id: 'lenzflix', CustomPrefs: { theme: 'prime' } };
        return gets === 1 ? new Promise((r) => { releaseRemote = () => r(prefs); }) : Promise.resolve(prefs);
      }),
      updateDisplayPreferences: vi.fn(() => new Promise((r) => { releasePost = () => r(null); })),
    };
    window.ApiClient = client;
    const t = await load();
    t.startTheme();
    t.syncThemeUser(); // startet loadRemoteTheme (GET hängt)
    await vi.advanceTimersByTimeAsync(0);
    const p = t.setTheme('prime');
    settle('prime');
    await p;
    await vi.advanceTimersByTimeAsync(500); // Upload läuft (POST hängt)
    expect(client.updateDisplayPreferences).toHaveBeenCalledTimes(1);
    releaseRemote(); // Server-Antwort mit gleichem Design
    await vi.advanceTimersByTimeAsync(0);
    releasePost();
    await vi.advanceTimersByTimeAsync(2000);
    expect(client.updateDisplayPreferences).toHaveBeenCalledTimes(1);
  });
});

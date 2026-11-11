// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const html = document.documentElement;
let pending; // id -> [{ resolve }] (steuerbares Design-CSS)
let toastMock;
let removeMock;

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
  toastMock = vi.fn();
  removeMock = vi.fn();
  vi.doMock('../src/js/core/themecss.js', () => ({
    ensureThemeCss: vi.fn((id) => new Promise((resolve) => { (pending[id] = pending[id] || []).push({ resolve }); })),
    removeThemeCss: removeMock,
  }));
  vi.doMock('../src/js/core/toast.js', () => ({ toast: toastMock }));
  current = await import('../src/js/core/theme.js');
  return current;
}
// Zuletzt geladene Modul-Instanz: wird nach jedem Test zerstört, damit kein (echter) Upload-/Reveal-Timer
// eines früheren Tests in einen späteren hineinfeuert (sonst flackernde Tests unter Last).
let current = null;
const settle = (id, ok = true) => pending[id].shift().resolve(ok);
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  html.className = '';
  document.getElementById('lfx-theme-prehide')?.remove();
  window.location.hash = '#/home';
  delete window.ApiClient;
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 Desktop');
});
afterEach(() => {
  try {
    current?.destroyTheme();
  } catch {
    /* egal */
  }
  current = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.doUnmock('../src/js/core/themecss.js');
  vi.doUnmock('../src/js/core/toast.js');
  delete window.fetch;
});

describe('Metadaten', () => {
  it('THEMES, THEME_META, normalizeTheme, brandName', async () => {
    const t = await load();
    expect(t.THEMES).toEqual(['flix', 'plus', 'prime', 'retro', 'store']);
    expect(t.THEME_META.plus.name).toBe('LENZ+');
    expect(t.normalizeTheme('prime')).toBe('prime');
    expect(t.normalizeTheme('x')).toBe('flix');
    expect(t.normalizeTheme(undefined)).toBe('flix');
    expect(t.normalizeTheme('retro')).toBe('retro');
    expect(t.brandName('retro')).toBe('LENZ//84');
    expect(t.normalizeTheme('store')).toBe('store');
    expect(t.brandName('store')).toBe('VIDEOTHEK LENZ');
    expect(t.THEME_META.store.palette).toHaveLength(4);
    expect(t.brandName('prime')).toBe('LENZPRIME');
    expect(t.brandName()).toBe('LENZFLIX');
  });
});

describe('Wahl-Vorrang', () => {
  it('Standard flix: sofort aktiv, Klasse lfx-theme-flix, kein CSS', async () => {
    setUser('u1');
    const t = await load();
    t.startTheme();
    expect(t.getTheme()).toBe('flix');
    expect(t.getThemeState()).toBe('active');
    expect(t.isTheme('flix')).toBe(true);
    expect(html.classList.contains('lfx-theme-flix')).toBe(true);
    expect(pending.plus).toBeUndefined();
  });

  it('localStorage last wird ohne Benutzer genutzt, Benutzer-Key schlägt last', async () => {
    localStorage.setItem('lfx.theme.last', 'plus');
    localStorage.setItem('lfx.theme.u1', 'prime');
    let t = await load();
    expect(t.getChosenTheme()).toBe('plus'); // Login-Seite
    setUser('u1');
    t = await load();
    expect(t.getChosenTheme()).toBe('prime');
    setUser('u2');
    t = await load();
    expect(t.getChosenTheme()).toBe('plus'); // kein Key für u2 -> last
  });

  it('Hash lfxtheme schlägt alles, wird gespeichert und aus dem Hash entfernt', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'prime');
    window.location.hash = '#/home?foo=1&lfxtheme=plus';
    const t = await load();
    t.startTheme();
    expect(t.getChosenTheme()).toBe('plus');
    expect(window.location.hash).toBe('#/home?foo=1');
    expect(localStorage.getItem('lfx.theme.u1')).toBe('plus');
    expect(localStorage.getItem('lfx.theme.last')).toBe('plus');
  });

  it('Hash lfxtheme mit unbekanntem Wert wird ignoriert und entfernt', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'prime');
    window.location.hash = '#/home?lfxtheme=zzz';
    const t = await load();
    t.startTheme();
    expect(t.getChosenTheme()).toBe('prime');
    expect(window.location.hash).toBe('#/home');
  });
});

describe('Zustände pending/active/failed', () => {
  it('erster Start mit plus: pending + lfx-theme-loading, nach load aktiv + Event', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'plus');
    const t = await load();
    const events = [];
    t.onThemeChange((e) => events.push(e));
    t.startTheme();
    expect(t.getTheme()).toBeNull();
    expect(t.getThemeState()).toBe('pending');
    expect(html.classList.contains('lfx-theme-loading')).toBe(true);
    expect(html.classList.contains('lfx-theme-plus')).toBe(false);
    settle('plus');
    await flush();
    expect(t.getTheme()).toBe('plus');
    expect(t.getThemeState()).toBe('active');
    expect(html.classList.contains('lfx-theme-loading')).toBe(false);
    expect(html.classList.contains('lfx-theme-plus')).toBe(true);
    expect(removeMock).toHaveBeenLastCalledWith('plus');
    expect(events).toEqual([{ theme: 'plus', previous: null }]);
    expect(document.getElementById('lfx-favicon')).not.toBeNull();
  });

  it('Fehler/Timeout: state failed, wirksam flix, Toast', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'prime');
    const t = await load();
    t.startTheme();
    settle('prime', false);
    await flush();
    expect(t.getThemeState()).toBe('failed');
    expect(t.getTheme()).toBe('flix');
    expect(t.getChosenTheme()).toBe('prime');
    expect(html.classList.contains('lfx-theme-flix')).toBe(true);
    expect(html.classList.contains('lfx-theme-loading')).toBe(false);
    expect(toastMock).toHaveBeenCalledWith('Design konnte nicht geladen werden');
  });

  it('langsames Design-CSS: nach 1,5 s LENZFLIX einblenden, Link bleibt, später Wechsel aufs Design', async () => {
    vi.useFakeTimers();
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'plus');
    const t = await load();
    const events = [];
    t.onThemeChange((e) => events.push(e));
    t.startTheme();
    await vi.advanceTimersByTimeAsync(1499);
    expect(html.classList.contains('lfx-theme-loading')).toBe(true);
    expect(t.getTheme()).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(html.classList.contains('lfx-theme-loading')).toBe(false);
    expect(html.classList.contains('lfx-theme-flix')).toBe(true);
    expect(t.getTheme()).toBe('flix');
    expect(t.getThemeState()).toBe('pending');
    expect(removeMock).not.toHaveBeenCalled(); // laufender Design-Link bleibt
    settle('plus');
    await vi.advanceTimersByTimeAsync(0);
    expect(t.getTheme()).toBe('plus');
    expect(t.getThemeState()).toBe('active');
    expect(html.classList.contains('lfx-theme-plus')).toBe(true);
    expect(events).toEqual([{ theme: 'flix', previous: null }, { theme: 'plus', previous: 'flix' }]);
  });

  it('langsames Design-CSS, das scheitert: failed, Wahl bleibt erhalten', async () => {
    vi.useFakeTimers();
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'prime');
    const t = await load();
    t.startTheme();
    await vi.advanceTimersByTimeAsync(1500);
    expect(t.getTheme()).toBe('flix');
    settle('prime', false);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.getThemeState()).toBe('failed');
    expect(t.getChosenTheme()).toBe('prime');
    expect(toastMock).toHaveBeenCalledWith('Design konnte nicht geladen werden');
  });
});

describe('TV-Zwang', () => {
  it('layout-tv: immer flix, kein CSS', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'plus');
    html.classList.add('layout-tv');
    const t = await load();
    t.startTheme();
    expect(t.getTheme()).toBe('flix');
    expect(pending.plus).toBeUndefined();
    expect(t.getChosenTheme()).toBe('plus'); // Wahl bleibt erhalten
  });

  it('TV-User-Agent: immer flix', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Web0S; Linux/SmartTV) Chrome/53');
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'prime');
    const t = await load();
    t.startTheme();
    expect(t.getTheme()).toBe('flix');
    expect(pending.prime).toBeUndefined();
  });

  it('erscheint layout-tv später: Design-Klassen und Link weg, Event feuert', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'plus');
    const t = await load();
    const events = [];
    t.onThemeChange((e) => events.push(e));
    t.startTheme();
    settle('plus');
    await flush();
    html.classList.add('layout-tv');
    t.applyThemeClass();
    expect(t.getTheme()).toBe('flix');
    expect(html.classList.contains('lfx-theme-plus')).toBe(false);
    expect(html.classList.contains('lfx-theme-flix')).toBe(true);
    expect(removeMock).toHaveBeenLastCalledWith(null);
    expect(events[events.length - 1]).toEqual({ theme: 'flix', previous: 'plus' });
  });
});

describe('Nutzerwechsel (setTheme)', () => {
  it('altes Design bleibt bis onload, dann Tausch + Speichern lokal sofort, Server entprellt', async () => {
    vi.useFakeTimers();
    setUser('u1');
    const client = {
      getDisplayPreferences: vi.fn(async () => ({ Id: 'lenzflix', CustomPrefs: { other: '1' } })),
      updateDisplayPreferences: vi.fn(async () => null),
    };
    window.ApiClient = client;
    const t = await load();
    t.startTheme();
    const events = [];
    t.onThemeChange((e) => events.push(e));
    const p = t.setTheme('prime');
    expect(t.getTheme()).toBe('flix'); // noch nicht getauscht
    expect(html.classList.contains('lfx-theme-flix')).toBe(true);
    expect(localStorage.getItem('lfx.theme.u1')).toBeNull();
    settle('prime');
    await p;
    expect(t.getTheme()).toBe('prime');
    expect(html.classList.contains('lfx-theme-prime')).toBe(true);
    expect(html.classList.contains('lfx-theme-flix')).toBe(false);
    expect(events).toEqual([{ theme: 'prime', previous: 'flix' }]);
    expect(localStorage.getItem('lfx.theme.u1')).toBe('prime');
    expect(localStorage.getItem('lfx.theme.last')).toBe('prime');
    expect(client.updateDisplayPreferences).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(399);
    expect(client.updateDisplayPreferences).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(client.getDisplayPreferences).toHaveBeenCalledWith('lenzflix', 'u1', 'lenzflix');
    expect(client.updateDisplayPreferences).toHaveBeenCalledTimes(1);
    const [id, body, uid, app] = client.updateDisplayPreferences.mock.calls[0];
    expect([id, uid, app]).toEqual(['lenzflix', 'u1', 'lenzflix']);
    expect(body.CustomPrefs).toEqual({ other: '1', theme: 'prime' }); // ganzes Objekt
  });

  it('Entprellung: schnelle Wechsel -> ein Upload mit dem letzten Wert', async () => {
    vi.useFakeTimers();
    setUser('u1');
    const client = {
      getDisplayPreferences: vi.fn(async () => ({ CustomPrefs: {} })),
      updateDisplayPreferences: vi.fn(async () => null),
    };
    window.ApiClient = client;
    const t = await load();
    t.startTheme();
    let p = t.setTheme('plus');
    settle('plus');
    await p;
    p = t.setTheme('flix'); // flix ist sofort wirksam
    await p;
    await vi.advanceTimersByTimeAsync(500);
    expect(client.updateDisplayPreferences).toHaveBeenCalledTimes(1);
    expect(client.updateDisplayPreferences.mock.calls[0][1].CustomPrefs.theme).toBe('flix');
  });

  it('Ladefehler beim Wechsel: bisheriges Design bleibt, Toast, nichts gespeichert', async () => {
    setUser('u1');
    const t = await load();
    t.startTheme();
    const p = t.setTheme('plus');
    settle('plus', false);
    await p;
    expect(t.getTheme()).toBe('flix');
    expect(t.getChosenTheme()).toBe('flix');
    expect(toastMock).toHaveBeenCalledWith('Design konnte nicht geladen werden');
    expect(localStorage.getItem('lfx.theme.u1')).toBeNull();
  });

  it('onThemeChange: unsubscribe', async () => {
    const t = await load();
    t.startTheme();
    const fn = vi.fn();
    const off = t.onThemeChange(fn);
    off();
    const p = t.setTheme('plus');
    settle('plus');
    await p;
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('Server-Abgleich', () => {
  const prefs = (theme) => ({ Id: 'lenzflix', CustomPrefs: theme ? { theme } : {} });

  it('abweichender Server-Wert gewinnt (ohne erneutes Hochladen)', async () => {
    vi.useFakeTimers();
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'flix');
    window.ApiClient = {
      getDisplayPreferences: vi.fn(async () => prefs('prime')),
      updateDisplayPreferences: vi.fn(async () => null),
    };
    const t = await load();
    t.startTheme();
    t.syncThemeUser();
    t.syncThemeUser(); // nur einmal pro Benutzer
    await vi.advanceTimersByTimeAsync(0);
    expect(window.ApiClient.getDisplayPreferences).toHaveBeenCalledTimes(1);
    settle('prime');
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.getTheme()).toBe('prime');
    expect(localStorage.getItem('lfx.theme.u1')).toBe('prime');
    expect(window.ApiClient.updateDisplayPreferences).not.toHaveBeenCalled();
  });

  it('Server leer, lokal gesetzt: hochladen', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'flix');
    window.ApiClient = {
      getDisplayPreferences: vi.fn(async () => prefs(null)),
      updateDisplayPreferences: vi.fn(async () => null),
    };
    const t = await load();
    t.startTheme();
    t.syncThemeUser();
    await flush();
    await flush();
    expect(window.ApiClient.updateDisplayPreferences).toHaveBeenCalledTimes(1);
    expect(window.ApiClient.updateDisplayPreferences.mock.calls[0][1].CustomPrefs.theme).toBe('flix');
  });

  it('Server leer, nichts lokal: kein Upload', async () => {
    setUser('u1');
    window.ApiClient = {
      getDisplayPreferences: vi.fn(async () => prefs(null)),
      updateDisplayPreferences: vi.fn(async () => null),
    };
    const t = await load();
    t.startTheme();
    t.syncThemeUser();
    await flush();
    await flush();
    expect(window.ApiClient.updateDisplayPreferences).not.toHaveBeenCalled();
  });

  it('ohne ApiClient-Methoden: fetch mit Auth-Header (GET, dann POST des ganzen Objekts)', async () => {
    vi.useFakeTimers();
    setUser('u1');
    window.fetch = vi.fn(async (url, opts = {}) => ({
      ok: true,
      status: 200,
      json: async () => ({ Id: 'lenzflix', CustomPrefs: { a: '1' } }),
      method: opts.method,
    }));
    const t = await load();
    t.startTheme();
    const p = t.setTheme('plus');
    settle('plus');
    await p;
    await vi.advanceTimersByTimeAsync(500);
    const calls = window.fetch.mock.calls;
    expect(calls[0][0]).toBe('http://srv/DisplayPreferences/lenzflix?userId=u1&client=lenzflix');
    expect(calls[0][1].headers.Authorization).toContain('Token=');
    expect(calls[1][1].method).toBe('POST');
    expect(JSON.parse(calls[1][1].body).CustomPrefs).toEqual({ a: '1', theme: 'plus' });
  });

  it('Serverfehler: nur console.warn, lokal bleibt gültig, kein Token im Log', async () => {
    vi.useFakeTimers();
    setUser('u1');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    window.ApiClient = {
      getDisplayPreferences: vi.fn(async () => { throw new Error('HTTP 500'); }),
      updateDisplayPreferences: vi.fn(),
    };
    const t = await load();
    t.startTheme();
    const p = t.setTheme('plus');
    settle('plus');
    await p;
    await vi.advanceTimersByTimeAsync(500);
    expect(warn).toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('tok');
    expect(localStorage.getItem('lfx.theme.u1')).toBe('plus');
    expect(t.getTheme()).toBe('plus');
  });
});

describe('Benutzerwechsel', () => {
  it('syncThemeUser erkennt neuen Benutzer und nimmt dessen lokale Wahl', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'flix');
    localStorage.setItem('lfx.theme.u2', 'prime');
    const t = await load();
    t.startTheme();
    expect(t.getTheme()).toBe('flix');
    setUser('u2');
    t.syncThemeUser();
    expect(t.getChosenTheme()).toBe('prime');
    settle('prime');
    await flush();
    expect(t.getTheme()).toBe('prime');
  });

  it('Hash-Wahl nach dem Start (hashchange) wird als Nutzerwahl übernommen', async () => {
    setUser('u1');
    const t = await load();
    t.startTheme();
    window.location.hash = '#/home?lfxtheme=plus';
    t.syncThemeUser();
    expect(window.location.hash).toBe('#/home');
    settle('plus');
    await flush();
    expect(t.getTheme()).toBe('plus');
  });
});

describe('Frühstart (earlyTheme)', () => {
  const prehide = () => document.getElementById('lfx-theme-prehide');

  it('plus: Prehide-Style + Klasse + Vorladen; Style steht in head', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'plus');
    const t = await load();
    t.earlyTheme();
    expect(prehide()).not.toBeNull();
    expect(prehide().parentNode).toBe(document.head);
    expect(prehide().textContent).toContain('opacity:0!important');
    expect(html.classList.contains('lfx-theme-loading')).toBe(true);
    expect(pending.plus).toHaveLength(1);
    t.earlyTheme(); // idempotent
    expect(document.querySelectorAll('#lfx-theme-prehide')).toHaveLength(1);
    expect(pending.plus).toHaveLength(1);
  });

  it('Hash lfxtheme wird gelesen, aber nicht verbraucht', async () => {
    setUser('u1');
    window.location.hash = '#/home?lfxtheme=prime';
    const t = await load();
    t.earlyTheme();
    expect(pending.prime).toHaveLength(1);
    expect(window.location.hash).toBe('#/home?lfxtheme=prime');
  });

  it('flix, keine Wahl, TV-Klasse, TV-UA: kein Prehide, kein Vorladen', async () => {
    setUser('u1');
    let t = await load();
    t.earlyTheme();
    expect(prehide()).toBeNull();
    expect(html.classList.contains('lfx-theme-loading')).toBe(false);
    localStorage.setItem('lfx.theme.u1', 'plus');
    html.classList.add('layout-tv');
    t = await load();
    t.earlyTheme();
    expect(prehide()).toBeNull();
    expect(pending.plus).toBeUndefined();
    html.classList.remove('layout-tv');
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Web0S; SmartTV)');
    t = await load();
    t.earlyTheme();
    expect(prehide()).toBeNull();
    expect(pending.plus).toBeUndefined();
  });

  it('Commit entfernt Prehide', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'plus');
    const t = await load();
    t.earlyTheme();
    t.startTheme();
    expect(prehide()).not.toBeNull();
    for (const w of pending.plus.splice(0)) w.resolve(true);
    await flush();
    expect(t.getTheme()).toBe('plus');
    expect(prehide()).toBeNull();
    expect(html.classList.contains('lfx-theme-loading')).toBe(false);
  });

  it('Fehler entfernt Prehide', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'prime');
    const t = await load();
    t.earlyTheme();
    t.startTheme();
    for (const w of pending.prime.splice(0)) w.resolve(false);
    await flush();
    expect(t.getThemeState()).toBe('failed');
    expect(prehide()).toBeNull();
  });

  it('Reveal nach 1,5 s ab Frühstart (nicht ab startTheme) entfernt Prehide', async () => {
    vi.useFakeTimers();
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'plus');
    const t = await load();
    t.earlyTheme();
    await vi.advanceTimersByTimeAsync(1000);
    t.startTheme();
    await vi.advanceTimersByTimeAsync(499);
    expect(prehide()).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(prehide()).toBeNull();
    expect(t.getTheme()).toBe('flix');
    expect(html.classList.contains('lfx-theme-loading')).toBe(false);
  });

  it('startTheme nie aufgerufen: nach 1,5 s sichtbar und Design-CSS entfernt', async () => {
    vi.useFakeTimers();
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'plus');
    const t = await load();
    t.earlyTheme();
    t.stopTheme(); // sync() ruft das ohne CSS ständig: darf das Fenster nicht vorzeitig beenden
    expect(prehide()).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1499);
    expect(prehide()).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(prehide()).toBeNull();
    expect(html.classList.contains('lfx-theme-loading')).toBe(false);
    expect(removeMock).toHaveBeenLastCalledWith(null);
  });

  it('stopTheme nach startTheme und destroyTheme entfernen Prehide', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'plus');
    let t = await load();
    t.earlyTheme();
    t.startTheme();
    t.stopTheme();
    expect(prehide()).toBeNull();
    t = await load();
    t.earlyTheme();
    t.destroyTheme();
    expect(prehide()).toBeNull();
    expect(html.classList.contains('lfx-theme-loading')).toBe(false);
  });

  it('startTheme löst auf flix auf (Hash): Prehide + Vorlade-Link weg', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'plus');
    const t = await load();
    t.earlyTheme();
    window.location.hash = '#/home?lfxtheme=flix';
    t.startTheme();
    expect(t.getTheme()).toBe('flix');
    expect(prehide()).toBeNull();
  });
});

describe('Aufräumen', () => {
  it('stopTheme entfernt Klassen, Links und Timer; destroyTheme entfernt Listener', async () => {
    vi.useFakeTimers();
    setUser('u1');
    window.ApiClient = {
      getDisplayPreferences: vi.fn(async () => ({ CustomPrefs: {} })),
      updateDisplayPreferences: vi.fn(async () => null),
    };
    localStorage.setItem('lfx.theme.u1', 'plus');
    const t = await load();
    const fn = vi.fn();
    t.onThemeChange(fn);
    t.startTheme();
    settle('plus');
    await vi.advanceTimersByTimeAsync(0);
    const p = t.setTheme('prime');
    settle('prime');
    await p; // Upload geplant
    t.stopTheme();
    expect([...html.classList].filter((c) => c.startsWith('lfx-theme-'))).toEqual([]);
    expect(removeMock).toHaveBeenLastCalledWith(null);
    expect(t.getTheme()).toBeNull();
    await vi.advanceTimersByTimeAsync(1000);
    expect(window.ApiClient.updateDisplayPreferences).not.toHaveBeenCalled();
    // Neustart funktioniert
    t.startTheme();
    settle('prime');
    await vi.advanceTimersByTimeAsync(0);
    expect(t.getTheme()).toBe('prime');
    const calls = fn.mock.calls.length;
    t.destroyTheme();
    expect(html.classList.contains('lfx-theme-prime')).toBe(false);
    t.startTheme();
    settle('prime');
    await vi.advanceTimersByTimeAsync(0);
    expect(fn.mock.calls.length).toBe(calls); // Listener wurden entfernt
  });

  it('stopTheme während pending: spätes onload ändert nichts mehr', async () => {
    setUser('u1');
    localStorage.setItem('lfx.theme.u1', 'plus');
    const t = await load();
    t.startTheme();
    t.stopTheme();
    expect(html.classList.contains('lfx-theme-loading')).toBe(false);
    settle('plus');
    await flush();
    expect(t.getTheme()).toBeNull();
    expect(html.classList.contains('lfx-theme-plus')).toBe(false);
  });
});

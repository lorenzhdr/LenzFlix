// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mock = vi.hoisted(() => ({ theme: 'plus', listeners: new Set(), libs: [] }));
vi.mock('../src/js/core/theme.js', async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    getTheme: () => mock.theme,
    onThemeChange: (fn) => { mock.listeners.add(fn); return () => mock.listeners.delete(fn); },
  };
});
vi.mock('../src/js/core/api.js', () => ({ isReady: () => true }));
vi.mock('../src/js/shared/libraries.js', () => ({ getLibraries: () => Promise.resolve(mock.libs) }));

const { startDocTitle, stopDocTitle, jellyfinTitle } = await import('../src/js/core/doctitle.js');

const html = document.documentElement;
const flush = () => new Promise((r) => setTimeout(r, 0));
async function go(hash) {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  await flush();
}
/** Jellyfin schreibt den Titel. */
async function jf(t) {
  document.title = t;
  await flush();
}
function setTheme(t) {
  mock.theme = t;
  for (const fn of [...mock.listeners]) fn({ theme: t });
}
async function openModal(text, cls = '') {
  document.body.innerHTML = `<h2 id="lfx-modal-title" class="${cls}">${text}</h2>`;
  html.classList.add('lfx-modal-open');
  await flush();
}

beforeEach(() => {
  document.head.innerHTML = '<title>LENZFLIX</title>';
  document.body.innerHTML = '';
  html.className = '';
  mock.theme = 'plus';
  mock.libs = [];
  window.location.hash = '#/home';
});
afterEach(() => {
  stopDocTitle();
  vi.useRealTimers();
});

describe('doctitle', () => {
  it('Startseite: nur der Designname (Servername ist Jellyfins Titel)', () => {
    document.title = 'MeinServer';
    startDocTitle();
    expect(document.title).toBe('LENZ+');
  });

  it('Unterseite: Seitenname · Design', async () => {
    document.title = 'MeinServer';
    startDocTitle();
    await go('#/home?lfx=new');
    expect(document.title).toBe('Neu & beliebt · LENZ+');
  });

  it('Player: Rohtitel · Design, nach Routenwechsel ist der Rohtitel veraltet', async () => {
    document.title = 'MeinServer';
    startDocTitle();
    await go('#/video');
    expect(document.title).toBe('LENZ+'); // Jellyfin hat noch nicht geschrieben
    await jf('S1:E3 - Folge');
    expect(document.title).toBe('S1:E3 - Folge · LENZ+');
    expect(jellyfinTitle()).toBe('S1:E3 - Folge');
    await go('#/home?lfx=new');
    expect(document.title).toBe('Neu & beliebt · LENZ+');
    expect(jellyfinTitle()).toBe('');
  });

  it('Player-Seite im DOM zählt wie /video', async () => {
    startDocTitle();
    await go('#/home');
    document.body.innerHTML = '<div id="videoOsdPage"></div>';
    await jf('Film (2020)');
    expect(document.title).toBe('Film (2020) · LENZ+');
  });

  it('Info-Fenster: Titel aus #lfx-modal-title, beim Schließen zurück', async () => {
    startDocTitle();
    await go('#/home');
    await openModal('Mein Film');
    expect(document.title).toBe('Mein Film · LENZ+');
    html.classList.remove('lfx-modal-open');
    await flush();
    expect(document.title).toBe('LENZ+');
  });

  it('Info-Fenster im Fehlerzustand: Titeltext wird ignoriert', async () => {
    startDocTitle();
    await go('#/home?lfx=new');
    await openModal('Titel konnte nicht geladen werden', 'lfx-modal__error-title');
    expect(document.title).toBe('Neu & beliebt · LENZ+');
  });

  it.each(['plus', 'flix'])('Servername gleich Designname (%s): kein „X · X“, nie Servername als Seitenname', async (theme) => {
    mock.theme = theme;
    document.title = 'LENZFLIX';
    startDocTitle();
    const brand = theme === 'plus' ? 'LENZ+' : 'LENZFLIX';
    expect(document.title).toBe(brand);
    await go('#/home?lfx=title&id=a');
    await jf('LENZFLIX'); // Jellyfin schreibt den Servernamen
    expect(document.title).toBe(brand);
    await go('#/details?id=a');
    await jf('LENZFLIX');
    expect(document.title).toBe(brand);
    document.body.innerHTML = '<div class="page"><div class="nameContainer"><h1>Ein Titel</h1></div></div>';
    await go('#/details?id=b');
    await jf('LENZFLIX');
    expect(document.title).toBe(`Ein Titel · ${brand}`);
  });

  it('Name gleich Designname ergibt nur den Designnamen', async () => {
    startDocTitle();
    await go('#/home');
    await openModal('LENZ+');
    expect(document.title).toBe('LENZ+');
  });

  it('Nativer Rohtitel (unbekannte Seite) wird übernommen', async () => {
    startDocTitle();
    await go('#/home');
    await go('#/configurationpage?name=x');
    await jf('Dashboard');
    expect(document.title).toBe('Dashboard · LENZ+');
  });

  it('Designwechsel schreibt neu', async () => {
    startDocTitle();
    await go('#/home?lfx=new');
    setTheme('prime');
    expect(document.title).toBe('Neu & beliebt · LENZPRIME');
    setTheme('retro');
    expect(document.title).toBe('Neu & beliebt · LENZ//84');
  });

  it('pending (kein Design): Jellyfins Titel bleibt stehen, danach wird geschrieben', () => {
    mock.theme = null;
    document.title = 'MeinServer';
    startDocTitle();
    expect(document.title).toBe('MeinServer');
    setTheme('flix');
    expect(document.title).toBe('LENZFLIX');
  });

  it('TV-Layout: immer LENZFLIX', async () => {
    html.classList.add('layout-tv');
    startDocTitle();
    await go('#/home?lfx=new');
    expect(document.title).toBe('Neu & beliebt · LENZFLIX');
  });

  it('Bibliotheksnamen kommen aus getLibraries', async () => {
    mock.libs = [{ id: 'L1', name: 'Dokus' }];
    startDocTitle();
    await go('#/home?lfx=browse&lib=L1');
    await flush();
    expect(document.title).toBe('Dokus · LENZ+');
  });

  it('Nachlauf: nachgeladener DOM-Titel erscheint ohne neuen Auslöser', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    startDocTitle();
    window.location.hash = '#/details?id=a';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(document.title).toBe('LENZ+');
    document.body.innerHTML = '<div class="page"><div class="nameContainer"><h1>Später da</h1></div></div>';
    await vi.advanceTimersByTimeAsync(400);
    expect(document.title).toBe('Später da · LENZ+');
  });

  it('keine Schleife: nach dem Schreiben kommen keine weiteren Schreibvorgänge', async () => {
    startDocTitle();
    await go('#/home');
    let writes = 0;
    const spy = new MutationObserver((recs) => { writes += recs.length; });
    spy.observe(document.querySelector('title'), { childList: true, characterData: true, subtree: true });
    await go('#/home?lfx=new');
    await flush();
    const n = writes;
    expect(n).toBeLessThanOrEqual(1);
    await flush();
    await flush();
    expect(writes).toBe(n);
    spy.disconnect();
  });

  it('ersetztes <title>-Element wird weiter beobachtet', async () => {
    startDocTitle();
    await go('#/details?id=a');
    document.head.innerHTML = '<title>Neuer Titel</title>';
    await flush();
    expect(document.title).toBe('Neuer Titel · LENZ+');
  });

  it('stopDocTitle stellt den Rohtitel wieder her und löst alles', async () => {
    document.title = 'MeinServer';
    startDocTitle();
    await go('#/home?lfx=new');
    stopDocTitle();
    expect(document.title).toBe('MeinServer');
    await jf('Anderes');
    await go('#/home?lfx=search');
    expect(document.title).toBe('Anderes');
  });

  it('jellyfinTitle ohne laufendes doctitle: document.title', () => {
    document.title = 'Irgendwas';
    expect(jellyfinTitle()).toBe('Irgendwas');
  });

  it('startDocTitle ist idempotent', async () => {
    document.title = 'MeinServer';
    startDocTitle();
    startDocTitle();
    await go('#/home?lfx=new');
    stopDocTitle();
    expect(document.title).toBe('MeinServer');
  });
});

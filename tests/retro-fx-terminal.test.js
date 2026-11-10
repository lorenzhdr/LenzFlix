// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ isReady: () => true, getUserId: () => 'u1' }));

import { parseCommand, complete, execute, formatTime, formatDate, progressBar, hexLine, ALIASES } from '../src/js/features/retro/fx/terminal-commands.js';
import { createTerminal } from '../src/js/features/retro/fx/terminal.js';

function makeCtx(over = {}) {
  const lines = [];
  const ctx = {
    lines,
    print: vi.fn((t) => { lines.push(t); return vi.fn(); }),
    error: vi.fn((t) => lines.push(`ERR:${t}`)),
    clear: vi.fn(),
    close: vi.fn(),
    go: vi.fn(),
    sleep: vi.fn(async () => true),
    userName: vi.fn(async () => 'Lena'),
    libraries: vi.fn(async () => [{ name: 'Filme' }, { name: 'Serien' }]),
    searchTitles: vi.fn(async () => [{ id: 'm1', name: 'Neon Läufer', year: 1984 }]),
    randomTitle: vi.fn(async () => ({ id: 'r1', name: 'Zufallsfilm' })),
    setTheme: vi.fn(async () => {}),
    themeName: (id) => id.toUpperCase(),
    themes: ['flix', 'plus', 'prime', 'retro'],
    currentTheme: () => 'retro',
    getPref: vi.fn(() => false),
    setPref: vi.fn(),
    unlockSound: vi.fn(),
    regen: vi.fn(),
    overdrive: vi.fn(),
    reboot: vi.fn(),
    now: () => new Date(2026, 10, 10, 9, 5, 3),
    searchHref: (q) => `#/search?q=${q}`,
    titleHref: (id) => `#/title/${id}`,
    ...over,
  };
  return ctx;
}

describe('parseCommand', () => {
  it('Befehl, Argumente, Aliase, Groß-/Kleinschreibung', () => {
    expect(parseCommand('  SUCHE  neon runner ')).toMatchObject({ cmd: 'suche', args: 'neon runner', argv: ['neon', 'runner'] });
    expect(parseCommand('search x').cmd).toBe('suche');
    expect(parseCommand('DIR').cmd).toBe('ls');
    expect(parseCommand('cls').cmd).toBe('clear');
    expect(parseCommand('help').cmd).toBe('hilfe');
    expect(parseCommand('play x').cmd).toBe('spiele');
    expect(parseCommand('random').cmd).toBe('zufall');
    expect(parseCommand('date').cmd).toBe('datum');
    expect(parseCommand('42').cmd).toBe('42');
    expect(parseCommand('').cmd).toBeNull();
    expect(parseCommand('xyzzy').cmd).toBeNull();
    expect(parseCommand('constructor').cmd).toBeNull(); // Prototype-Schlüssel sind keine Befehle
    expect(Object.keys(ALIASES)).toContain('sudo');
  });

  it('Tab-Vervollständigung (ohne versteckte Befehle)', () => {
    expect(complete('hi')).toEqual(['hilfe']);
    expect(complete('s')).toEqual(expect.arrayContaining(['suche', 'sound', 'spiele']));
    expect(complete('su')).toEqual(['suche']);
    expect(complete('sud')).toEqual([]);
    expect(complete('')).toEqual([]);
  });
});

describe('Formatierer', () => {
  it('Zeit, Datum, Balken, Hex', () => {
    expect(formatTime(new Date(2026, 10, 10, 9, 5, 3))).toBe('09:05:03');
    expect(formatDate(new Date(2026, 10, 10))).toBe('DIENSTAG, 10.11.2026');
    expect(progressBar(50, 10)).toBe('[#####.....]  50%');
    expect(hexLine(() => 0.5)).toMatch(/^0x[0-9A-F]{4} {2}([0-9A-F]{2} ){7}[0-9A-F]{2}$/);
  });
});

describe('execute', () => {
  it('hilfe listet Befehle, versteckte nicht', async () => {
    const c = makeCtx();
    await execute('hilfe', c);
    const all = c.lines.join('\n');
    expect(all).toContain('SUCHE');
    expect(all).toContain('OVERDRIVE');
    expect(all).not.toContain('SUDO');
  });

  it('whoami/hallo/datum/uhr/ls', async () => {
    const c = makeCtx();
    await execute('whoami', c);
    await execute('hallo', c);
    await execute('datum', c);
    await execute('uhr', c);
    await execute('dir', c);
    expect(c.lines).toEqual(expect.arrayContaining(['LENA', 'DIENSTAG, 10.11.2026', '09:05:03', '  <DIR>  FILME']));
    expect(c.lines.some((l) => l.startsWith('HALLO, LENA'))).toBe(true);
  });

  it('suche navigiert, spiele lädt Kassette (nie direkt abspielen), zufall', async () => {
    const c = makeCtx();
    await execute('suche neon', c);
    expect(c.go).toHaveBeenCalledWith('#/search?q=neon');
    await execute('play neon', c);
    expect(c.lines).toContain('LADE KASSETTE ...');
    expect(c.go).toHaveBeenLastCalledWith('#/title/m1');
    await execute('zufall', c);
    expect(c.go).toHaveBeenLastCalledWith('#/title/r1');
    const none = makeCtx({ searchTitles: vi.fn(async () => []) });
    await execute('spiele nix', none);
    expect(none.error).toHaveBeenCalled();
    const noArg = makeCtx();
    await execute('suche', noArg);
    expect(noArg.error).toHaveBeenCalled();
    expect(noArg.go).not.toHaveBeenCalled();
  });

  it('design: Hinweis, setTheme, ungültig, aktuelles', async () => {
    const c = makeCtx();
    await execute('design prime', c);
    expect(c.lines.some((l) => l.includes('WECHSLE ZU PRIME'))).toBe(true);
    expect(c.close).toHaveBeenCalled();
    expect(c.setTheme).toHaveBeenCalledWith('prime');
    await execute('design retro', c);
    expect(c.setTheme).toHaveBeenCalledTimes(1);
    await execute('design xyz', c);
    expect(c.error).toHaveBeenCalled();
  });

  it('sound/crt an|aus', async () => {
    const c = makeCtx();
    await execute('sound an', c);
    expect(c.setPref).toHaveBeenCalledWith('sound', true);
    expect(c.unlockSound).toHaveBeenCalled();
    await execute('crt aus', c);
    expect(c.setPref).toHaveBeenCalledWith('crt', false);
    c.setPref.mockClear();
    await execute('crt', c);
    expect(c.setPref).not.toHaveBeenCalled();
  });

  it('regen, overdrive, reboot, clear, exit, lenz', async () => {
    const c = makeCtx();
    await execute('regen', c);
    expect(c.regen).toHaveBeenCalled();
    await execute('overdrive', c);
    expect(c.overdrive).toHaveBeenCalled();
    await execute('reboot', c);
    expect(c.reboot).toHaveBeenCalled();
    await execute('cls', c);
    expect(c.clear).toHaveBeenCalled();
    c.close.mockClear();
    await execute('exit', c);
    expect(c.close).toHaveBeenCalledTimes(1);
    c.lines.length = 0;
    await execute('lenz', c);
    expect(c.lines.length).toBeGreaterThan(4);
  });

  it('hack endet mit ZUGRIFF GEWÄHRT; Abbruch beim Schließen', async () => {
    const c = makeCtx();
    await execute('hack', c);
    expect(c.lines.some((l) => l.includes('ZUGRIFF GEWÄHRT'))).toBe(true);
    const c2 = makeCtx({ sleep: vi.fn(async () => false) });
    await execute('hack', c2);
    expect(c2.lines.some((l) => l.includes('ZUGRIFF GEWÄHRT'))).toBe(false);
  });

  it('versteckte Befehle und unbekannt (Fehler-Effekt)', async () => {
    const c = makeCtx();
    await execute('sudo rm -rf /', c);
    expect(c.error).toHaveBeenCalledWith('NETTER VERSUCH.');
    await execute('42', c);
    await execute('quatsch', c);
    expect(c.error).toHaveBeenLastCalledWith("BEFEHL NICHT GEFUNDEN: quatsch. TIPPE 'HILFE'.");
  });
});

describe('Terminal-Fenster', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    document.documentElement.className = '';
  });
  afterEach(() => vi.useRealTimers());

  const deps = () => {
    const c = makeCtx();
    const base = { ...c };
    for (const k of ['print', 'error', 'clear', 'close', 'go', 'sleep', 'lines']) delete base[k];
    return base;
  };

  it('Ausgabe nur per textContent (kein HTML), Verlauf, Tab, Fokus zurück', async () => {
    const btn = document.createElement('button');
    document.body.append(btn);
    btn.focus();
    const t = createTerminal(deps());
    t.open();
    await vi.advanceTimersByTimeAsync(30);
    const input = document.querySelector('.lfx-retro-term__input');
    expect(document.activeElement).toBe(input);
    expect(document.querySelector('.lfx-retro-term').getAttribute('aria-modal')).toBe('true');

    await t.run('suche <img src=x onerror=alert(1)>');
    expect(document.querySelector('.lfx-retro-term__out img')).toBeNull();
    expect(document.querySelector('.lfx-retro-term__out').textContent).toContain('<img src=x');

    // Tab vervollständigt eindeutig
    input.value = 'hi';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(input.value).toBe('hilfe ');

    // Verlauf mit Pfeiltasten
    await t.run('uhr');
    input.value = '';
    const up = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
    input.dispatchEvent(up);
    expect(input.value).toBe('uhr');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(input.value).toBe('suche <img src=x onerror=alert(1)>');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(input.value).toBe('uhr');

    // Esc schließt, Fokus kehrt zurück
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(400);
    expect(document.getElementById('lfx-retro-terminal')).toBeNull();
    expect(document.activeElement).toBe(btn);
    expect(document.documentElement.classList.contains('lfx-retro-term-open')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('exit schließt; destroy entfernt sofort; Enter führt Befehl aus', async () => {
    const t = createTerminal(deps());
    t.open();
    await vi.advanceTimersByTimeAsync(30);
    const input = document.querySelector('.lfx-retro-term__input');
    input.value = 'exit';
    document.querySelector('.lfx-retro-term__form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.advanceTimersByTimeAsync(400);
    expect(document.getElementById('lfx-retro-terminal')).toBeNull();
    t.open();
    t.destroy();
    expect(document.getElementById('lfx-retro-terminal')).toBeNull();
    expect(t.isOpen()).toBe(false);
  });

  it('Fokus-Falle: Tab im leeren Feld wechselt zum Schließen-Knopf und zurück', async () => {
    const t = createTerminal(deps());
    t.open();
    await vi.advanceTimersByTimeAsync(30);
    const input = document.querySelector('.lfx-retro-term__input');
    const closeBtn = document.querySelector('.lfx-retro-term__close');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(closeBtn);
    closeBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(input);
    t.destroy();
  });
});

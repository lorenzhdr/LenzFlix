// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execute } from '../src/js/features/retro/fx/terminal-commands.js';
import { createTerminal } from '../src/js/features/retro/fx/terminal.js';

function ctxOf(over = {}) {
  const lines = [];
  return {
    lines,
    print: vi.fn((t) => { lines.push(t); return vi.fn(); }),
    error: vi.fn(),
    close: vi.fn(),
    go: vi.fn(),
    sleep: vi.fn(async () => true),
    searchTitles: vi.fn(async () => [{ id: 'm1', name: 'Neon', year: 1984 }]),
    randomTitle: vi.fn(async () => ({ id: 'r1', name: 'Zufall' })),
    setTheme: vi.fn(async () => {}),
    themeName: (id) => id.toUpperCase(),
    themes: ['flix', 'plus', 'prime', 'retro'],
    currentTheme: () => 'retro',
    regen: vi.fn(),
    reboot: vi.fn(),
    searchHref: (q) => `#/search?q=${q}`,
    titleHref: (id) => `#/title/${id}`,
    ...over,
  };
}

describe('Terminal-Befehle: Abbruch nach sleep/await', () => {
  it('regen, reboot, design tun nach abgebrochenem sleep nichts', async () => {
    const c = ctxOf({ sleep: vi.fn(async () => false) });
    await execute('regen', c);
    await execute('reboot', c);
    await execute('design plus', c);
    expect(c.regen).not.toHaveBeenCalled();
    expect(c.reboot).not.toHaveBeenCalled();
    expect(c.setTheme).not.toHaveBeenCalled();
  });

  it('spiele und zufall navigieren nicht, wenn das Terminal inzwischen zu ist', async () => {
    const c = ctxOf({ isOpen: () => false });
    await execute('spiele neon', c);
    await execute('zufall', c);
    expect(c.go).not.toHaveBeenCalled();
  });
});

describe('Terminal-Fenster: Neuöffnen und alte Befehle', () => {
  beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = ''; document.documentElement.className = ''; });
  afterEach(() => vi.useRealTimers());

  it('Neuöffnen in der 260-ms-Schließanimation hinterlässt genau ein Terminal', async () => {
    const t = createTerminal(ctxOf());
    t.open();
    await vi.advanceTimersByTimeAsync(30);
    t.close();
    await vi.advanceTimersByTimeAsync(100);
    t.open();
    await vi.advanceTimersByTimeAsync(400);
    expect(document.querySelectorAll('#lfx-retro-terminal').length).toBe(1);
    t.destroy();
  });

  it('Ausgabe eines alten Befehls landet nicht im neu geöffneten Terminal', async () => {
    let release;
    const t = createTerminal(ctxOf({ searchTitles: () => new Promise((r) => { release = r; }) }));
    t.open();
    await vi.advanceTimersByTimeAsync(30);
    const p = t.run('spiele neon');
    t.close();
    await vi.advanceTimersByTimeAsync(400);
    t.open();
    await vi.advanceTimersByTimeAsync(30);
    release([{ id: 'm1', name: 'Neon' }]);
    await p;
    const txt = document.querySelector('.lfx-retro-term__out').textContent;
    expect(txt).not.toContain('GEFUNDEN');
    t.destroy();
  });
});

describe('Terminal: LENZ-Logo und Tastatur-Hinweise', () => {
  it('Logo zeigt zwei Schrägstriche statt Z8', async () => {
    const c = ctxOf();
    await execute('lenz', c);
    expect(c.lines.join('\n')).toContain('/_/');
  });

  it('Tastatur-Hinweise tragen eine Hinweis-Klasse (nur bei pointer:fine sichtbar)', async () => {
    const c = ctxOf();
    await execute('hilfe', c);
    expect(c.print).toHaveBeenCalledWith(expect.stringContaining('TAB ='), 'hint');
    document.body.innerHTML = '';
    const t = createTerminal(ctxOf());
    t.open();
    expect(document.querySelector('.lfx-retro-term__title .lfx-retro-term__hint')).not.toBeNull();
    t.destroy();
  });

  it('Text SPIELEREI', async () => {
    const c = ctxOf({ sleep: vi.fn(async () => true) });
    await execute('hack', c);
    expect(c.lines.join('\n')).toContain('SPIELEREI');
  });
});

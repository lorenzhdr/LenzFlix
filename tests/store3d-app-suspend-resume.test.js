// @vitest-environment jsdom
// StoreApp: Vormerkungen, pauseParts und resume während des Boots.
import { describe, it, expect, vi } from 'vitest';
import { StoreApp } from '../src/js/store3d/store.js';

const proto = StoreApp.prototype;
const fakeApp = (o = {}) => Object.assign(Object.create(proto), {
  suspended: false, disposed: false, mode: 'play', ready: true, host: document.body,
  syncUi: vi.fn(), fs: null, hud: { showPrompt: vi.fn() }, notifyState: vi.fn(),
  engine: { stop: vi.fn(), start: vi.fn(), resize: vi.fn() },
  desktop: { attach: vi.fn(), detach: vi.fn() }, touchCtl: { attach: vi.fn(), detach: vi.fn() },
  covers: { pause: vi.fn(), resume: vi.fn() }, mods: { hook: vi.fn() },
}, o);

describe('Vormerkungen überleben Moduswechsel nicht', () => {
  it('setMode weg von play löscht pendingTake/pendingUse', () => {
    const a = fakeApp({ pendingTake: { id: 'x', at: 1 }, pendingUse: { ia: {}, at: 1 } });
    a.setMode('paused');
    expect(a.pendingTake).toBeNull();
    expect(a.pendingUse).toBeNull();
  });
  it('suspend löscht sie ebenfalls', () => {
    const a = fakeApp({ pendingTake: { id: 'x', at: 1 }, pendingUse: { ia: {}, at: 1 } });
    a.suspend();
    expect(a.pendingTake).toBeNull();
    expect(a.pendingUse).toBeNull();
  });
});

describe('Aufräumfolge auch aus boot() nutzbar', () => {
  it('pauseParts hält Engine, Steuerung, Cover und Module an', () => {
    const a = fakeApp();
    expect(typeof a.pauseParts).toBe('function');
    a.pauseParts();
    expect(a.engine.stop).toHaveBeenCalled();
    expect(a.desktop.detach).toHaveBeenCalled();
    expect(a.touchCtl.detach).toHaveBeenCalled();
    expect(a.covers.pause).toHaveBeenCalled();
    expect(a.mods.hook).toHaveBeenCalledWith('onSuspend');
  });
});

describe('resume während des Boots', () => {
  it('startet weder Schleife noch Steuerung, solange der Modus boot ist', () => {
    const a = fakeApp({ mode: 'boot', ready: false, player: {}, suspended: true });
    a.resume();
    expect(a.suspended).toBe(false);
    expect(a.engine.start).not.toHaveBeenCalled();
    expect(a.desktop.attach).not.toHaveBeenCalled();
    expect(a.touchCtl.attach).not.toHaveBeenCalled();
  });
  it('gibt aber Cover, Module und Vollbild-Hilfe wieder frei', () => {
    const fs = { suspend: vi.fn(), resume: vi.fn() };
    const a = fakeApp({ mode: 'boot', ready: false, player: {}, suspended: true, fs });
    a.resume();
    expect(a.covers.resume).toHaveBeenCalled();
    expect(a.mods.hook).toHaveBeenCalledWith('onResume');
    expect(fs.resume).toHaveBeenCalled();
    expect(a.engine.start).not.toHaveBeenCalled();
  });
});


describe('Suche während des Boots', () => {
  it('wird zurückgestellt statt „Kassen-PC kommt bald“ zu zeigen', () => {
    const a = fakeApp({ mode: 'boot', mods: undefined, opts: {}, openTerminal: vi.fn() });
    a.openTerminalOrQueue('abc');
    expect(a.openTerminal).not.toHaveBeenCalled();
    expect(a.opts.openTerminal).toBe(true);
    expect(a.opts.query).toBe('abc');
  });
  it('öffnet im Spielmodus direkt', () => {
    const a = fakeApp({ opts: {}, openTerminal: vi.fn() });
    a.openTerminalOrQueue('x');
    expect(a.openTerminal).toHaveBeenCalledWith('x');
  });
});

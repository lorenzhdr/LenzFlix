// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { Scene, PerspectiveCamera } from 'three';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import cashier from '../src/js/store3d/modules/cashier.js';
import terminal, { buildTermSpec, termStatus } from '../src/js/store3d/modules/terminal.js';
import { dialogPicks, dialogStart, dialogAnswer } from '../src/js/store3d/modules/cashier-lines.js';
import { describeResult } from '../src/js/store3d/modules/m3-util.js';

const line = (cat) => `[${cat}]`;
const mk = (id, genres = [], extra = {}) => ({ Id: id, Name: `Titel ${id}`, Genres: genres, Type: 'Movie', ...extra });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('Dialogmodell', () => {
  const items = new Map([
    ['c1', mk('c1', ['Comedy'])], ['h1', mk('h1', ['Horror'])], ['x1', mk('x1', ['Comedy', 'Horror'])],
  ]);
  const catalog = {
    items,
    departments: [{ id: 'adult', kind: 'adult', label: 'Ab 18', itemIds: ['x1'] }],
    highlights: [], resume: [],
  };

  it('Knöpfe nur bei Kandidaten, Ab-18 nie', () => {
    const picks = dialogPicks(catalog, new Map([['x1', catalog.departments[0]]]));
    expect(picks.comedy.map((i) => i.Id)).toEqual(['c1']);
    expect(picks.horror.map((i) => i.Id)).toEqual(['h1']);
    const m = dialogStart(picks, line);
    expect(m.choices).toBe(true);
    expect(m.buttons.map((b) => b.id)).toEqual(['a:comedy', 'a:horror', 'bye']);
    expect(m.text).toBe('[dialogHello]');
  });

  it('ohne Kandidaten nur Tschüss', () => {
    const m = dialogStart(dialogPicks({ items: new Map(), departments: [] }, new Map()), line);
    expect(m.choices).toBe(false);
    expect(m.buttons).toEqual([{ id: 'bye', label: 'Tschüss', primary: true }]);
    expect(m.text).toBe('[noTip]');
  });

  it('Antwort liefert Titel und Folgeknöpfe, nicht zweimal derselbe', () => {
    const picks = { comedy: [mk('a'), mk('b')], horror: [], kids: [], new: [], random: [], resume: [] };
    const m = dialogAnswer(picks, 'comedy', { rand: () => 0, lastId: 'a', line, deptOf: new Map() });
    expect(m.item.Id).toBe('b');
    expect(m.buttons.map((b) => b.label)).toEqual(['Zeig mal', 'Was anderes', 'Tschüss']);
    expect(dialogAnswer(picks, 'horror', { line })).toBeNull();
  });
});

describe('Terminal-Spec', () => {
  const env = { has: () => true, locate: () => 'Gang 1 · Regal 2 · Horror' };
  const d1 = describeResult({ Id: 'm1', Name: 'Nachtzug', Type: 'Movie', ProductionYear: 1999 }, env);
  const d2 = describeResult({ Id: 'e1', Name: 'Pilot', Type: 'Episode', SeriesId: 's1', SeriesName: 'Serie X', ParentIndexNumber: 1, IndexNumber: 2 }, env);

  it('Statuszeilen', () => {
    expect(termStatus(true, 0)).toBe('Suche läuft …');
    expect(termStatus(false, 3)).toBe('3 Treffer');
    expect(termStatus(false, 1)).toBe('1 Treffer');
    expect(termStatus(false, 0)).toBe('Nichts gefunden');
  });

  it('Ergebnisse werden Zeilen mit Aktionen', () => {
    const act = vi.fn();
    const onInput = vi.fn();
    const spec = buildTermSpec({ query: 'nacht', status: '2 Treffer', descs: [d1, d2], mediaOf: (d) => (d === d1 ? 'vhs' : 'box'), handlers: { act, onInput } });
    expect(spec.title).toBe('Kassen-PC · Suche');
    expect(spec.lines).toEqual(['2 Treffer']);
    expect(spec.input.value).toBe('nacht');
    expect(spec.input.placeholder).toBe('Titel suchen …');
    spec.input.onInput('x');
    expect(onInput).toHaveBeenCalledWith('x');
    const [r1, r2] = spec.list.rows;
    expect(r1.label).toBe('Nachtzug');
    expect(r1.sub).toBe('1999 · Gang 1 · Regal 2 · Horror · Film');
    expect(r1.tag).toBe('VHS');
    expect(r1.actions.map((a) => a.label)).toEqual(['Hinführen', 'Über den Tresen']);
    expect(r1.actions[0].primary).toBe(true);
    expect(r2.tag).toBe('Box');
    expect(r2.actions.map((a) => a.label)).toEqual(['Hinführen', 'Abspielen', 'Serie über den Tresen']);
    r2.actions[2].onSelect();
    expect(act).toHaveBeenCalledWith(d2, 'series');
  });
});

describe('XR-Weiche Richard und Kassen-PC', () => {
  let host;
  let app;
  let xr;
  let bubble;
  let panels;

  function build(presenting) {
    const items = new Map([['c1', mk('c1', ['Comedy'], { lfx: { media: 'vhs' } })]]);
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: ['c1'] }]);
    bubble = { show: vi.fn(), hide: vi.fn(), dispose: vi.fn() };
    panels = [];
    xr = {
      presenting,
      jumpTo: vi.fn(() => Promise.resolve(true)),
      toast: vi.fn(),
      bubble: vi.fn(() => bubble),
      openPanel: vi.fn((spec) => {
        const h = {
          open: true,
          mesh: {},
          spec,
          update: vi.fn((s) => { h.spec = { ...h.spec, ...s }; }),
          hit: () => null,
          hover: () => null,
          scroll() {},
          activate: () => false,
          close() { if (!h.open) return; h.open = false; if (spec.onClose) spec.onClose(); },
        };
        panels.push(h);
        return h;
      }),
    };
    const dom = document.createElement('div');
    app = {
      layout,
      deps: {
        catalog: { items, departments: [], highlights: [], resume: [] },
        toast: vi.fn(),
        user: { name: 'Max' },
        search: vi.fn(() => Promise.resolve([{ Id: 'c1', Name: 'Nachtzug', Type: 'Movie', ProductionYear: 1999 }])),
        play: vi.fn(),
      },
      opts: { debug: true },
      phone: false,
      touch: false,
      sound: false,
      mode: 'play',
      engine: { scene: new Scene(), camera: new PerspectiveCamera(), renderer: { domElement: document.createElement('canvas') }, preset: { level: 'mid' } },
      player: {
        x: layout.spawn.x, z: layout.spawn.z, yaw: 0, pitch: 0, state: { x: layout.spawn.x, z: layout.spawn.z, yaw: 0, pitch: 0 }, cancelPath() {}, teleport: vi.fn(), turnTo: null, moved: 0,
      },
      setMode(m) { app.mode = m; },
      holdview: { isOpen: false },
      findSlot: () => null,
      take: vi.fn(),
      host: dom,
      xr,
    };
    dom.appendChild(app.engine.renderer.domElement);
    host = new ModuleHost(app);
    return host;
  }

  const realGetContext = HTMLCanvasElement.prototype.getContext;
  beforeEach(() => {
    MODULES.length = 0;
    MODULES.push(cashier, terminal);
    // jsdom hat kein 2D-Canvas: Attrappe, die jeden Aufruf schluckt
    HTMLCanvasElement.prototype.getContext = function getContext() {
      const store = {};
      return new Proxy(store, {
        get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : () => ({ addColorStop() {} }))),
        set: (t, k, v) => { t[k] = v; return true; },
      });
    };
  });
  afterEach(() => {
    if (host) host.hook('dispose');
    HTMLCanvasElement.prototype.getContext = realGetContext;
    MODULES.length = 0;
    delete window.__lfxM4;
  });

  it('Richard hat unlockVoice', async () => {
    build(false);
    await host.init();
    const c = host.ctx.use('cashier');
    expect(typeof c.unlockVoice).toBe('function');
    expect(() => c.unlockVoice()).not.toThrow();
  });

  it('2D: DOM-Blase und DOM-Dialog, keine 3D-Blase', async () => {
    build(false);
    await host.init();
    window.__lfxM4.say('greetDay');
    expect(xr.bubble).not.toHaveBeenCalled();
    expect(app.host.querySelector('.lfx-store-bubble').hidden).toBe(false);
    window.__lfxM4.tip();
    expect(xr.openPanel).not.toHaveBeenCalled();
    expect(app.host.querySelector('.lfx-store-dialog')).not.toBeNull();
  });

  it('VR: 3D-Blase über dem Kopf statt DOM-Blase', async () => {
    build(true);
    await host.init();
    window.__lfxM4.say('greetDay');
    expect(bubble.show).toHaveBeenCalledTimes(1);
    const [text, pos] = bubble.show.mock.calls[0];
    expect(typeof text).toBe('string');
    expect(pos.y).toBeCloseTo(2.3, 5);
    expect(app.host.querySelector('.lfx-store-bubble').hidden).toBe(true);
    host.hook('onSuspend');
    expect(bubble.hide).toHaveBeenCalled();
  });

  it('Wechsel per Event xr schaltet die Blase um', async () => {
    build(false);
    await host.init();
    window.__lfxM4.say('greetDay');
    const dom = app.host.querySelector('.lfx-store-bubble');
    expect(dom.hidden).toBe(false);
    xr.presenting = true;
    host.emit('xr', true);
    expect(dom.hidden).toBe(true);
    expect(bubble.show).toHaveBeenCalled();
    xr.presenting = false;
    host.emit('xr', false);
    expect(bubble.hide).toHaveBeenCalled();
    expect(dom.hidden).toBe(false);
  });

  it('VR: Dialog als Panel, Antwort aktualisiert, Zeig mal holt den Titel', async () => {
    build(true);
    await host.init();
    window.__lfxM4.tip();
    expect(xr.openPanel).toHaveBeenCalledTimes(1);
    expect(app.host.querySelector('.lfx-store-dialog')).toBeNull();
    const spec = xr.openPanel.mock.calls[0][0];
    expect(spec.title).toBe('Richard');
    expect(spec.buttons.map((b) => b.label)).toEqual(['Was Lustiges?', 'Tschüss']);
    const handle = panels[0];
    spec.buttons[0].onSelect();
    expect(handle.update).toHaveBeenCalled();
    expect(handle.spec.buttons.map((b) => b.label)).toEqual(['Zeig mal', 'Was anderes', 'Tschüss']);
    handle.spec.buttons[0].onSelect();
    expect(app.take).toHaveBeenCalledWith('c1', { fromCounter: true });
    expect(handle.open).toBe(false);
    expect(host.ctx.overlay.isOpen()).toBe(false);
  });

  it('VR: Kassen-PC öffnet Panel mit Treffern, Aktion Über den Tresen', async () => {
    build(true);
    await host.init();
    host.ctx.use('terminal').open('nacht');
    expect(xr.jumpTo).toHaveBeenCalledTimes(1);
    expect(app.host.querySelector('.lfx-store-term')).toBeNull();
    await tick();
    await tick();
    expect(xr.openPanel).toHaveBeenCalledTimes(1);
    const handle = panels[0];
    expect(xr.openPanel.mock.calls[0][0].title).toBe('Kassen-PC · Suche');
    expect(app.deps.search).toHaveBeenCalled();
    const spec = handle.spec;
    expect(spec.lines).toEqual(['1 Treffer']);
    expect(spec.list.rows[0].label).toBe('Nachtzug');
    expect(spec.list.rows[0].tag).toBe('VHS');
    spec.list.rows[0].actions.find((a) => a.label === 'Über den Tresen').onSelect();
    expect(app.take).toHaveBeenCalledWith('c1', { fromCounter: true });
    expect(handle.open).toBe(false);
  });

  it('VR: am PC (höchstens 2,5 m) kein Sprung', async () => {
    build(true);
    await host.init();
    const pc = app.layout.pc || { x: app.layout.w - 3.5, z: (app.layout.counter.z0 + app.layout.counter.z1) / 2 };
    app.player.state.x = pc.x;
    app.player.state.z = pc.z - 1;
    host.ctx.use('terminal').open('');
    await tick();
    expect(xr.jumpTo).not.toHaveBeenCalled();
    expect(xr.openPanel).toHaveBeenCalledTimes(1);
  });
});

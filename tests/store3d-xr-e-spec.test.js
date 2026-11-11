// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { couchSpec } from '../src/js/store3d/modules/couch-util.js';
import { returnsSpec, remainingText } from '../src/js/store3d/modules/returns.js';
import { reserveSpec } from '../src/js/store3d/modules/reserve.js';
import { openPanel } from '../src/js/store3d/modules/m3-gfx.js';

const noop = () => {};

describe('Couch-Knopfleiste (VR-Spec)', () => {
  const act = { stand: noop, next: noop, sound: noop, down: noop, up: noop, watch: noop };
  it('Diashow: nur Aufstehen, Nächster, Ansehen; Anker low', () => {
    const s = couchSpec({ title: 'Heat', playing: false, muted: false }, act, noop);
    expect(s.anchor).toBe('low');
    expect(s.buttons.map((b) => b.label)).toEqual(['Aufstehen', 'Nächster', 'Diesen Film ansehen']);
    expect(s.buttons[2].primary).toBe(true);
    expect(typeof s.onClose).toBe('function');
  });
  it('Trailer: Ton/Leiser/Lauter, Ton-Beschriftung folgt dem Stumm-Zustand', () => {
    const on = couchSpec({ title: 'X', playing: true, muted: false }, act);
    expect(on.buttons.map((b) => b.label)).toEqual(['Aufstehen', 'Nächster', 'Ton aus', 'Leiser', 'Lauter', 'Diesen Film ansehen']);
    const off = couchSpec({ title: 'X', playing: true, muted: true }, act);
    expect(off.buttons[2].label).toBe('Ton an');
  });
  it('Aktualisierungs-Spec enthält keinen onClose-Schlüssel', () => {
    expect('onClose' in couchSpec({ title: 'X' }, act)).toBe(false);
  });
});

describe('Rückgabe-Wagen (VR-Spec)', () => {
  const film = { Id: 'f1', Name: 'Film Eins', Type: 'Movie', RunTimeTicks: 100 * 6e8, UserData: { PlayedPercentage: 66 } };
  const ep = { Id: 'e1', Name: 'Pilot', Type: 'Episode', SeriesId: 's1', SeriesName: 'Serie A', ParentIndexNumber: 1, IndexNumber: 3, lfx: { progress: 0.5 } };
  const act = (calls = []) => ({ play: (it) => calls.push(['play', it.Id]), take: (id) => calls.push(['take', id]), canTake: (id) => id === 's1' });

  it('Fortschrittstext: Restminuten, sonst Prozent, sonst leer', () => {
    expect(remainingText(film)).toBe('Noch 34 Min.');
    expect(remainingText(ep)).toBe('50 % gesehen');
    expect(remainingText({ Id: 'x' })).toBe('');
  });
  it('leere Liste: Hinweistext ohne Liste', () => {
    const s = returnsSpec([], act());
    expect(s.list).toBeUndefined();
    expect(s.text).toMatch(/nichts/);
  });
  it('Film- und Serien-Zeilen mit Aktionen', () => {
    const calls = [];
    const s = returnsSpec([film, ep], act(calls));
    const [r0, r1] = s.list.rows;
    expect(r0.label).toBe('Film Eins');
    expect(r0.sub).toBe('Noch 34 Min.');
    expect(r0.actions.map((a) => a.label)).toEqual(['Weiterschauen', 'Nehmen']);
    expect(r1.label).toBe('Serie A');
    expect(r1.sub).toContain('S1E3');
    r0.actions[0].onSelect(); r0.actions[1].onSelect(); r1.actions[1].onSelect();
    expect(calls).toEqual([['play', 'f1'], ['take', 'f1'], ['take', 's1']]);
  });
  it('Serie ohne Katalogeintrag: kein „Zur Serie“', () => {
    const s = returnsSpec([ep], { ...act(), canTake: () => false });
    expect(s.list.rows[0].actions.map((a) => a.label)).toEqual(['Weiterschauen']);
  });
});

describe('Reservierungen (VR-Spec)', () => {
  it('leer: Hinweistext', () => {
    const s = reserveSpec([], 'Lena', {});
    expect(s.list).toBeUndefined();
    expect(s.text).toMatch(/zurück/);
    expect(s.lines[0]).toBe('für Lena');
  });
  it('Zeilen mit Abspielen, Nehmen, Entfernen', () => {
    const calls = [];
    const a = { play: (it) => calls.push(['play', it.Id]), take: (it) => calls.push(['take', it.Id]), remove: (it) => calls.push(['rm', it.Id]) };
    const s = reserveSpec([{ Id: 'a', Name: 'Alpha', ProductionYear: 1999 }], 'Lena', a);
    const row = s.list.rows[0];
    expect(row.label).toBe('Alpha');
    expect(row.sub).toBe('1999');
    expect(row.actions.map((x) => x.label)).toEqual(['Abspielen', 'Nehmen', 'Entfernen']);
    row.actions.forEach((x) => x.onSelect());
    expect(calls).toEqual([['play', 'a'], ['take', 'a'], ['rm', 'a']]);
  });
});

describe('m3-gfx openPanel: XR-Weiche', () => {
  const mk = (presenting) => {
    const opened = [];
    let overlay = false;
    let onCloseCb = null;
    const ctx = {
      isTouch: true,
      xr: { presenting: () => presenting, panel: { open: vi.fn((spec) => { opened.push(spec); overlay = true; onCloseCb = spec.onClose; return { open: true, update: vi.fn(), close: noop }; }) } },
      overlay: { open: vi.fn(() => { overlay = true; }), isOpen: () => overlay, close: vi.fn(() => { overlay = false; if (onCloseCb) onCloseCb(); }) },
    };
    return { ctx, opened };
  };
  it('presenting + vr: VR-Panel statt DOM, close schließt über das Overlay, onClose wird gerufen', () => {
    const { ctx, opened } = mk(true);
    const build = vi.fn();
    const onClose = vi.fn();
    const r = openPanel(ctx, { vr: (close) => ({ title: 'T', buttons: [{ label: 'Zu', onSelect: close }] }), build, onClose });
    expect(build).not.toHaveBeenCalled();
    expect(ctx.overlay.open).not.toHaveBeenCalled();
    expect(opened).toHaveLength(1);
    expect(r.root).toBeNull();
    opened[0].buttons[0].onSelect();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('nicht presenting: DOM-Pfad unverändert (build + overlay.open), vr bleibt unbenutzt', () => {
    const { ctx } = mk(false);
    const build = vi.fn();
    const vr = vi.fn();
    const r = openPanel(ctx, { cls: 'x', label: 'L', build, vr });
    expect(vr).not.toHaveBeenCalled();
    expect(build).toHaveBeenCalledTimes(1);
    expect(ctx.overlay.open).toHaveBeenCalledTimes(1);
    expect(ctx.xr.panel.open).not.toHaveBeenCalled();
    expect(r.root).toBeInstanceOf(HTMLElement);
  });
  it('presenting ohne vr: DOM-Pfad (Laufzeit meldet „noch nicht verfügbar“)', () => {
    const { ctx } = mk(true);
    const build = vi.fn();
    openPanel(ctx, { build });
    expect(build).toHaveBeenCalledTimes(1);
    expect(ctx.overlay.open).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBar, IDLE_MS } from '../src/js/store3d/cinema/bar2d.js';

let bridge;
let st;
let bar;
let toast;
const btn = (label) => [...bar.el.querySelectorAll('button')].find((b) => b.textContent === label);
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  st = { title: 'Testfilm', time: 10, duration: 100, phase: 'playing', hasPrev: false, hasNext: false, volume: 0.55, muted: false };
  bridge = {
    togglePause: vi.fn(), seekBy: vi.fn(), seekTo: vi.fn(), prev: vi.fn(), next: vi.fn(), setVolume: vi.fn(), toggleMute: vi.fn(),
    tracks: vi.fn(async () => [{ id: '1', label: 'Deutsch', selected: true }, { id: '2', label: 'Englisch', selected: false }]),
    selectTrack: vi.fn(async () => true),
  };
  toast = vi.fn();
  bar = createBar({ bridge, getState: () => st, onStand: vi.fn(), onFull: vi.fn(), toast });
  document.body.appendChild(bar.el);
});
afterEach(() => { bar.dispose(); vi.useRealTimers(); document.body.innerHTML = ''; });

describe('bar2d', () => {
  it('update schreibt nur bei Änderung', () => {
    expect(bar.update(st)).toBe(true);
    expect(bar.update({ ...st })).toBe(false);
    expect(bar.update({ ...st, time: 10.4 })).toBe(false); // gleiche volle Sekunde
    expect(bar.update({ ...st, time: 11 })).toBe(true);
    expect(bar.renders).toBe(2);
    expect(bar.el.querySelector('.lfx-palast-title').textContent).toBe('Testfilm');
    expect(bar.el.querySelector('.lfx-palast-vol').textContent).toBe('55 %');
  });

  it('Folge-Knöpfe nur bei hasPrev/hasNext', () => {
    bar.update(st);
    expect(btn('◀ Folge').hidden).toBe(true);
    expect(btn('Folge ▶').hidden).toBe(true);
    bar.update({ ...st, hasPrev: true, hasNext: true });
    expect(btn('◀ Folge').hidden).toBe(false);
    btn('Folge ▶').click();
    expect(bridge.next).toHaveBeenCalled();
  });

  it('Ende: „Film zu Ende“; pausierter Start: „Starten“ ruft togglePause synchron', () => {
    bar.update({ ...st, phase: 'ended', ended: true });
    expect(bar.el.querySelector('.lfx-palast-msg').textContent).toBe('Film zu Ende');
    bar.update({ ...st, phase: 'paused', startPending: true });
    expect(btn('Starten')).toBeTruthy();
    btn('Starten').click();
    expect(bridge.togglePause).toHaveBeenCalledTimes(1);
  });

  it('Knöpfe: Pause, −10 s, +30 s, Vollbild, Aufstehen', () => {
    const onFull = vi.fn();
    const onStand = vi.fn();
    bar.dispose();
    bar = createBar({ bridge, getState: () => st, onStand, onFull, toast });
    document.body.appendChild(bar.el);
    bar.update(st);
    btn('Pause').click();
    btn('−10 s').click();
    btn('+30 s').click();
    btn('Vollbild').click();
    btn('Aufstehen').click();
    expect(bridge.togglePause).toHaveBeenCalled();
    expect(bridge.seekBy.mock.calls).toEqual([[-10], [30]]);
    expect(onFull).toHaveBeenCalled();
    expect(onStand).toHaveBeenCalled();
  });

  it('Lautstärke über stepVolume', () => {
    bar.update(st);
    btn('Lauter').click();
    expect(bridge.setVolume).toHaveBeenLastCalledWith(0.6);
    btn('Leiser').click();
    expect(bridge.setVolume).toHaveBeenLastCalledWith(0.5);
    st = { ...st, volume: 1 };
    btn('Lauter').click();
    expect(toast).toHaveBeenCalledWith('Schon volle Lautstärke');
    btn('Stumm').click();
    expect(bridge.toggleMute).toHaveBeenCalled();
  });

  it('Ton-Popover: Laden, Liste, „Wechsel läuft“, Wahl über selectTrack', async () => {
    bar.update(st);
    let release;
    bridge.selectTrack = vi.fn(() => new Promise((r) => { release = r; }));
    btn('Ton').click();
    const pop = bar.el.querySelector('.lfx-palast-pop');
    expect(pop.hidden).toBe(false);
    expect(pop.textContent).toContain('Lade …');
    await flush();
    const rows = [...pop.querySelectorAll('.lfx-palast-pop-row')];
    expect(rows.map((r) => r.textContent)).toEqual(['Deutsch', 'Englisch']);
    expect(rows[0].classList.contains('is-on')).toBe(true);
    rows[1].click();
    expect(bridge.selectTrack).toHaveBeenCalledWith('audio', '2');
    expect(pop.textContent).toContain('Wechsel läuft');
    release(true);
    await flush();
    expect(pop.hidden).toBe(true);
  });

  it('Untertitel-Auswahl: false → Hinweis; erneutes Tippen auf „Untertitel“ schließt', async () => {
    bar.update(st);
    bridge.selectTrack = vi.fn(async () => false);
    btn('Untertitel').click();
    await flush();
    bar.el.querySelectorAll('.lfx-palast-pop-row')[0].click();
    await flush();
    expect(bridge.selectTrack).toHaveBeenCalledWith('subtitle', '1');
    expect(toast).toHaveBeenCalledWith('Auswahl nicht möglich');
    btn('Untertitel').click();
    await flush();
    btn('Untertitel').click();
    expect(bar.el.querySelector('.lfx-palast-pop').hidden).toBe(true);
  });

  it('Auto-Ausblenden nach 4 s beim Spielen, Rückkehr bei Bewegung; Pause bleibt sichtbar', () => {
    bar.update(st);
    expect(bar.idle).toBe(false);
    vi.advanceTimersByTime(IDLE_MS - 1);
    expect(bar.idle).toBe(false);
    vi.advanceTimersByTime(2);
    expect(bar.idle).toBe(true);
    window.dispatchEvent(new Event('mousemove'));
    expect(bar.idle).toBe(false);
    vi.advanceTimersByTime(IDLE_MS + 10);
    expect(bar.idle).toBe(true);
    bar.update({ ...st, phase: 'paused' });
    expect(bar.idle).toBe(false);
    vi.advanceTimersByTime(IDLE_MS * 3);
    expect(bar.idle).toBe(false);
  });

  it('der Tipp, der die ausgeblendete Leiste weckt, löst keinen Knopf aus', () => {
    bar.update(st);
    vi.advanceTimersByTime(IDLE_MS + 10);
    expect(bar.idle).toBe(true);
    window.dispatchEvent(new Event('pointerdown'));
    btn('Pause').click();
    expect(bridge.togglePause).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('pointerdown'));
    btn('Pause').click();
    expect(bridge.togglePause).toHaveBeenCalledTimes(1);
  });

  it('Knöpfe nehmen keinen Fokus (mousedown prevented, tabindex -1)', () => {
    bar.update(st);
    const b = btn('Pause');
    expect(b.tabIndex).toBe(-1);
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    b.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('dispose entfernt Element und Listener', () => {
    const rem = vi.spyOn(window, 'removeEventListener');
    bar.dispose();
    expect(bar.el.isConnected).toBe(false);
    expect(rem).toHaveBeenCalled();
    expect(bar.update(st)).toBe(false);
  });
});

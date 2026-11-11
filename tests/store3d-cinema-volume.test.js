// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createControls } from '../src/js/store3d/cinema/controls.js';

function make(state) {
  const st = { title: 'F', phase: 'playing', time: 0, duration: 100, volume: 0.5, muted: false, ...state };
  const cinema = { setVolume: vi.fn((f) => { st.volume = f; }), toggleMute: vi.fn() };
  const toast = vi.fn();
  let spec = null;
  const ctl = createControls({
    openPanel: (s) => { spec = s; return { open: true, update(n) { spec = n; }, close() {} }; },
    cinema, getState: () => st, getSeat: () => 'mid', onSeat() {}, onBack() {}, toast,
  });
  ctl.show();
  const press = (label) => spec.buttons.find((b) => b.label === label).onSelect();
  return { st, cinema, toast, press, spec: () => spec };
}

describe('Kino-Lautstärke (Panel)', () => {
  it('Schritte auf ganze 10 % vom Pegel, ohne Drift', () => {
    const c = make({ volume: 0.5 });
    c.press('Lauter');
    expect(c.cinema.setVolume).toHaveBeenLastCalledWith(0.6);
    c.press('Leiser');
    expect(c.cinema.setVolume).toHaveBeenLastCalledWith(0.5);
    c.st.volume = 0.73;
    c.press('Leiser');
    expect(c.cinema.setVolume).toHaveBeenLastCalledWith(0.7);
    c.st.volume = 0.73;
    c.press('Lauter');
    expect(c.cinema.setVolume).toHaveBeenLastCalledWith(0.8);
  });

  it('bei 100 % Hinweis statt Änderung, Panel zeigt „(max.)“', () => {
    const c = make({ volume: 1 });
    expect(c.spec().lines[0]).toBe('Lautstärke 100 % (max.)');
    c.press('Lauter');
    expect(c.toast).toHaveBeenCalledWith('Schon volle Lautstärke');
    expect(c.cinema.setVolume).not.toHaveBeenCalled();
  });

  it('bei 0 % „Schon ganz leise“; bei 100 % und stumm hebt Lauter die Stummschaltung auf', () => {
    const c = make({ volume: 0 });
    c.press('Leiser');
    expect(c.toast).toHaveBeenCalledWith('Schon ganz leise');
    const m = make({ volume: 1, muted: true });
    m.press('Lauter');
    expect(m.cinema.toggleMute).toHaveBeenCalled();
  });
});

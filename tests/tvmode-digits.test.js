import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDigits } from '../src/js/live/tvmode/digits.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function make(over = {}) {
  const onCommit = vi.fn();
  const onPreview = vi.fn();
  const onInvalid = vi.fn();
  const d = createDigits({ onCommit, onPreview, onInvalid, now: () => Date.now(), ...over });
  return { d, onCommit, onPreview, onInvalid };
}

describe('Ziffern-Eingabe', () => {
  it('2–9 schalten sofort', () => {
    const { d, onCommit } = make();
    d.push(7);
    expect(onCommit).toHaveBeenCalledWith(7);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('1 wartet und schaltet nach dem Timeout auf Sender 1', () => {
    const { d, onCommit, onPreview } = make();
    d.push(1);
    expect(onPreview).toHaveBeenLastCalledWith('1_');
    expect(onCommit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1499);
    expect(onCommit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(onCommit).toHaveBeenCalledWith(1);
    expect(onPreview).toHaveBeenLastCalledWith(null);
  });

  it('zweistellig 10–18 gültig, 19 ungültig', () => {
    for (const [second, no] of [[0, 10], [1, 11], [8, 18]]) {
      const { d, onCommit } = make();
      d.push(1); d.push(second);
      expect(onCommit).toHaveBeenCalledWith(no);
    }
    const { d, onCommit, onInvalid, onPreview } = make();
    d.push(1); d.push(9);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onInvalid).toHaveBeenCalledWith('Dieser Sender existiert nicht');
    expect(onPreview).toHaveBeenLastCalledWith(null);
    expect(d.pending()).toBe('');
  });

  it('0 allein verfällt, 0 + Ziffer ist einstellig, 00 ungültig', () => {
    let m = make();
    m.d.push(0);
    expect(m.onPreview).toHaveBeenLastCalledWith('0_');
    vi.advanceTimersByTime(2000);
    expect(m.onCommit).not.toHaveBeenCalled();
    expect(m.onPreview).toHaveBeenLastCalledWith(null);

    m = make();
    m.d.push(0); m.d.push(5);
    expect(m.onCommit).toHaveBeenCalledWith(5);

    m = make();
    m.d.push(0); m.d.push(0);
    expect(m.onCommit).not.toHaveBeenCalled();
    expect(m.onInvalid).toHaveBeenCalled();
  });

  it('eigenes Timeout, clear und dispose räumen den Timer ab', () => {
    const { d, onCommit, onPreview } = make({ timeoutMs: 300 });
    d.push(1);
    vi.advanceTimersByTime(301);
    expect(onCommit).toHaveBeenCalledWith(1);
    d.push(1);
    d.clear();
    expect(onPreview).toHaveBeenLastCalledWith(null);
    expect(vi.getTimerCount()).toBe(0);
    d.push(1);
    d.dispose();
    expect(vi.getTimerCount()).toBe(0);
    d.push(3);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('abgelaufene Eingabe zählt auch bei gedrosseltem Timer nicht als zweite Ziffer', () => {
    let t = 1000;
    const onCommit = vi.fn();
    const d = createDigits({ onCommit, now: () => t, timeoutMs: 1500 });
    d.push(1);
    t += 5000; // Timer feuert nicht (Hintergrund-Tab), Uhr läuft weiter
    d.push(3);
    expect(onCommit).toHaveBeenNthCalledWith(1, 1);
    expect(onCommit).toHaveBeenNthCalledWith(2, 3);
  });

  it('ignoriert Nicht-Ziffern', () => {
    const { d, onCommit } = make();
    d.push('x');
    d.push(12);
    expect(onCommit).not.toHaveBeenCalled();
  });
});

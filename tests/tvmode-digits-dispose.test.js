// @vitest-environment jsdom
// TV-Ziffernwahl: dispose räumt eine offene Vorschau ab.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDigits } from '../src/js/tv/tvmode/digits.js';

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => vi.useRealTimers());

describe('tvmode digits', () => {
  it('Ziffern-dispose räumt eine offene Vorschau ab', () => {
    vi.useFakeTimers();
    const onPreview = vi.fn();
    const d = createDigits({ onCommit: vi.fn(), onPreview, onInvalid: vi.fn(), now: () => Date.now() });
    d.push('1');
    expect(onPreview).toHaveBeenLastCalledWith('1_');
    d.dispose();
    expect(onPreview).toHaveBeenLastCalledWith(null);
    expect(d.pending()).toBe('');
  });
});


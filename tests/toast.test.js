// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { toast, clearToast } from '../src/js/core/toast.js';

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
});
afterEach(() => {
  clearToast();
  vi.useRealTimers();
});

describe('toast', () => {
  it('zeigt eine Meldung; die Live-Region existiert vor dem Text (A004)', () => {
    toast('Hallo');
    const root = document.getElementById('lfx-toast');
    expect(root.className).toContain('lfx-toast');
    expect(root.querySelector('.lfx-toast__msg').textContent).toBe('Hallo');
    const live = document.getElementById('lfx-toast-live');
    expect(live.getAttribute('role')).toBe('status');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe(''); // erst leer eingehängt, damit Screenreader die Region kennen
    vi.advanceTimersByTime(150);
    expect(live.textContent).toBe('Hallo');
  });

  it('clearToast entfernt auch die Live-Region', () => {
    toast('Hallo');
    clearToast();
    expect(document.getElementById('lfx-toast-live')).toBeNull();
    vi.advanceTimersByTime(150);
    expect(document.getElementById('lfx-toast-live')).toBeNull();
  });

  it('neue Meldung ersetzt die alte und startet den Timer neu', () => {
    toast('Eins');
    vi.advanceTimersByTime(2500);
    toast('Zwei');
    expect(document.querySelectorAll('.lfx-toast__msg')).toHaveLength(1);
    expect(document.querySelector('.lfx-toast__msg').textContent).toBe('Zwei');
    vi.advanceTimersByTime(2500);
    expect(document.getElementById('lfx-toast')).not.toBeNull();
    expect(document.getElementById('lfx-toast').classList.contains('is-leaving')).toBe(false);
  });

  it('verschwindet automatisch (is-leaving, dann Mount entfernt)', () => {
    toast('Weg', { duration: 1000 });
    vi.advanceTimersByTime(1000);
    expect(document.getElementById('lfx-toast').classList.contains('is-leaving')).toBe(true);
    vi.advanceTimersByTime(200);
    expect(document.getElementById('lfx-toast')).toBeNull();
  });

  it('clearToast entfernt sofort', () => {
    toast('x');
    clearToast();
    expect(document.getElementById('lfx-toast')).toBeNull();
  });
});

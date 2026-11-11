// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDetails } from '../src/js/live/tvmode/details.js';
import { createThumb, resetThumbCache, THUMB_TYPES } from '../src/js/live/tvmode/thumb.js';


describe('tvmode details.js', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('entprellt und lädt nur die letzte Id (eine Anfrage je Zappen)', async () => {
    const itemDetails = vi.fn(async (ids) => new Map(ids.map((id) => [id, { overview: `Text ${id}` }])));
    const d = createDetails({ deps: { itemDetails } });
    const seen = [];
    d.on((id, text) => seen.push([id, text]));
    d.request('a');
    vi.advanceTimersByTime(200);
    d.request('b');
    vi.advanceTimersByTime(399);
    expect(itemDetails).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    await vi.runAllTimersAsync();
    expect(itemDetails).toHaveBeenCalledTimes(1);
    expect(itemDetails).toHaveBeenCalledWith(['b']);
    expect(d.get('b')).toBe('Text b');
    expect(d.get('a')).toBeUndefined();
    expect(seen).toEqual([['b', 'Text b']]);
    expect(d.map().get('b')).toBe('Text b');
  });

  it('cacht auch leere Antworten und Fehler (kein Wiederholen)', async () => {
    const itemDetails = vi.fn(async () => { throw new Error('netz'); });
    const d = createDetails({ deps: { itemDetails } });
    d.request('x');
    await vi.runAllTimersAsync();
    expect(d.get('x')).toBe('');
    d.request('x');
    await vi.runAllTimersAsync();
    expect(itemDetails).toHaveBeenCalledTimes(1);
  });

  it('tut ohne deps.itemDetails nichts und nach dispose keine Anfragen', async () => {
    const none = createDetails({ deps: {} });
    none.request('a');
    await vi.runAllTimersAsync();
    expect(none.get('a')).toBeUndefined();

    const itemDetails = vi.fn(async () => new Map());
    const d = createDetails({ deps: { itemDetails } });
    d.request('a');
    d.dispose();
    await vi.runAllTimersAsync();
    expect(itemDetails).not.toHaveBeenCalled();
  });
});

describe('tvmode thumb.js', () => {
  beforeEach(() => resetThumbCache());

  const deps = { imageUrl: (id, o) => `/Items/${id}/Images/${o.type}?maxWidth=${o.maxWidth}` };

  it('versucht Thumb → Backdrop → Primary und fällt auf den Platzhalter zurück', () => {
    const t = createThumb({ doc: document, deps });
    const img = t.el.querySelector('img');
    t.set('m1', 3);
    expect(img.getAttribute('src')).toContain('/Images/Thumb');
    expect(img.getAttribute('src')).not.toMatch(/api_key|ApiKey/i);
    img.dispatchEvent(new Event('error'));
    expect(img.getAttribute('src')).toContain('/Images/Backdrop');
    img.dispatchEvent(new Event('error'));
    expect(img.getAttribute('src')).toContain('/Images/Primary');
    img.dispatchEvent(new Event('error'));
    expect(t.el.classList.contains('lfx-tvm__thumb--ph')).toBe(true);
    expect(t.el.textContent).toBe('3');
    expect(img.hidden).toBe(true);
    expect(THUMB_TYPES).toEqual(['Thumb', 'Backdrop', 'Primary']);
  });

  it('merkt sich den funktionierenden Typ je Id', () => {
    const a = createThumb({ doc: document, deps });
    const imgA = a.el.querySelector('img');
    a.set('s1', 1);
    imgA.dispatchEvent(new Event('error'));
    imgA.dispatchEvent(new Event('load'));
    const b = createThumb({ doc: document, deps });
    b.set('s1', 2);
    expect(b.el.querySelector('img').getAttribute('src')).toContain('/Images/Backdrop');
  });

  it('ohne Id sofort Platzhalter; destroy entfernt das Element', () => {
    const t = createThumb({ doc: document, deps });
    document.body.append(t.el);
    t.set(null, 7);
    expect(t.el.classList.contains('lfx-tvm__thumb--ph')).toBe(true);
    t.destroy();
    expect(t.el.isConnected).toBe(false);
  });
});

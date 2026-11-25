// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from '../src/js/serverstats/app.js';

const ok = (data) => ({ ok: true, status: 200, data });
const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
const key = (el, k) =>
  el.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: k,
      bubbles: true,
      cancelable: true,
    }),
  );

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('serverstats app', () => {
  it('Reiter laut deps.tabs, Rollen und Startreiter', async () => {
    const get = vi.fn(() => Promise.resolve(ok({ n: 0, rows: [] })));
    const app = create({
      get,
      img: () => null,
      openItem() {},
      tabs: ['server', 'now', 'bogus'],
      maxM: 0,
    });
    document.body.append(app.el);
    const tabs = [...app.el.querySelectorAll('[role=tab]')];
    expect(app.el.querySelector('[role=tablist]')).not.toBeNull();
    expect(tabs.map((t) => t.textContent)).toEqual(['Jetzt', 'Server']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
    expect(app.el.querySelector('[role=status]')).not.toBeNull();
    await flush();
    expect(get.mock.calls.map((c) => c[0])).toEqual(['/srv/now']);
    app.dispose();
  });

  it('Pfeiltasten, Home und End wechseln Reiter', async () => {
    const get = vi.fn(() => Promise.resolve(ok({})));
    const app = create({
      get,
      img: () => null,
      openItem() {},
      tabs: ['now', 'month', 'server'],
      maxM: 1,
    });
    document.body.append(app.el);
    const bar = app.el.querySelector('[role=tablist]');
    const sel = () =>
      [...app.el.querySelectorAll('[role=tab]')].findIndex((t) => t.getAttribute('aria-selected') === 'true');
    key(bar, 'ArrowRight');
    expect(sel()).toBe(1);
    key(bar, 'End');
    expect(sel()).toBe(2);
    key(bar, 'ArrowRight');
    expect(sel()).toBe(0);
    key(bar, 'ArrowLeft');
    expect(sel()).toBe(2);
    key(bar, 'Home');
    expect(sel()).toBe(0);
    const panels = [...app.el.querySelectorAll('[role=tabpanel]')];
    expect(panels.filter((p) => !p.hidden)).toHaveLength(1);
    await flush();
    app.dispose();
  });

  it('dispose entfernt den visibilitychange-Listener und ist idempotent', async () => {
    const spy = vi.spyOn(document, 'removeEventListener');
    const get = vi.fn(() => Promise.resolve(ok({ n: 0, rows: [] })));
    const app = create({
      get,
      img: () => null,
      openItem() {},
      tabs: ['now'],
      maxM: 0,
    });
    await flush();
    app.dispose();
    app.dispose();
    expect(spy.mock.calls.filter((c) => c[0] === 'visibilitychange')).toHaveLength(1);
    document.dispatchEvent(new Event('visibilitychange'));
    await flush(30000);
    expect(get).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('wirft nie bei kaputten Antworten', async () => {
    const get = vi.fn(() =>
      Promise.resolve(
        ok({
          n: 'x',
          rows: [null, 5, { hidden: 1 }, { title: 7, img: {} }],
        }),
      ),
    );
    const app = create({
      get,
      img: () => null,
      openItem() {},
      tabs: ['now'],
    });
    document.body.append(app.el);
    await flush();
    expect(app.el.querySelectorAll('.lfx-srv-row').length).toBe(2);
    app.dispose();
    const bad = create({
      get: () => {
        throw new Error('x');
      },
      tabs: 'nope',
    });
    await flush();
    bad.dispose();
  });
});

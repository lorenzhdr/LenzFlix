// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { create } from '../src/js/serverstats/app.js';

let hidden = false;
const ok = (data) => ({ ok: true, status: 200, data });
const row = (o) => ({
  id: 'a',
  t: 'movie',
  title: 'Filmtitel',
  pos: 2530,
  dur: 7080,
  paused: 0,
  tc: 0,
  mbps: 8.1,
  dev: 'tv',
  ...o,
});

function mk(get, extra) {
  const deps = {
    get,
    img: vi.fn((id, tag, w) => `/i/${id}/${tag}/${w}`),
    openItem: vi.fn(),
    tabs: ['now', 'month', 'server'],
    maxM: 3,
    ...extra,
  };
  const app = create(deps);
  document.body.append(app.el);
  return { app, deps };
}
const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  });
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('serverstats Reiter Jetzt', () => {
  it('pollt alle 10 s nach Abschluss und stoppt bei dispose', async () => {
    const get = vi.fn(() => Promise.resolve(ok({ n: 0, rows: [] })));
    const { app } = mk(get);
    await flush();
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][0]).toBe('/srv/now');
    await flush(9900);
    expect(get).toHaveBeenCalledTimes(1);
    await flush(200);
    expect(get).toHaveBeenCalledTimes(2);
    app.dispose();
    app.dispose();
    await flush(60000);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('zeigt Zeilen, Du-Abzeichen, Kopfzeile und öffnet per Klick', async () => {
    const get = vi.fn(() =>
      Promise.resolve(
        ok({
          n: 2,
          mbps: 12.3,
          rows: [
            row({
              me: 1,
              t: 'episode',
              title: 'Serie',
              s: 2,
              e: 5,
              ep: 'Folgentitel',
              img: { id: 'a', tag: 't' },
              paused: 1,
            }),
            {
              hidden: 1,
              p: 0.5,
              paused: 0,
              tc: 1,
              mbps: null,
              dev: 'other',
            },
          ],
        }),
      ),
    );
    const { app, deps } = mk(get);
    await flush();
    const el = app.el;
    expect(el.querySelector('.lfx-srv-now__head').textContent).toBe('2 laufen gerade · 12,3 Mbit/s');
    const btns = el.querySelectorAll('button.lfx-srv-row');
    expect(btns).toHaveLength(1);
    expect(btns[0].querySelector('.lfx-srv-badge').textContent).toBe('Du');
    expect(btns[0].textContent).toContain('S2 · F5 · Folgentitel');
    expect(btns[0].textContent).toContain('0:42:10 / 1:58:00');
    expect(btns[0].querySelector('.lfx-srv-pause').getAttribute('aria-label')).toBe('Pausiert');
    expect(btns[0].querySelector('img').getAttribute('src')).toBe('/i/a/t/96');
    expect(btns[0].getAttribute('aria-label')).toContain('Serie');
    btns[0].click();
    expect(deps.openItem).toHaveBeenCalledWith('a');
    const hid = el.querySelector('.lfx-srv-row.is-hidden');
    expect(hid.tagName).toBe('DIV');
    expect(hid.textContent).toContain('Verborgener Titel');
    expect(hid.textContent).toContain('Umwandlung');
    expect(hid.querySelector('img')).toBeNull();
    expect(hid.textContent).not.toMatch(/\d:\d\d/);
    app.dispose();
  });

  it('leer: „Gerade läuft nichts.“; Zählung läuft lokal weiter', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(ok({ n: 0, rows: [] }))
      .mockResolvedValue(ok({ n: 1, rows: [row({ pos: 100, dur: 3700 })] }));
    const { app } = mk(get);
    await flush();
    expect(app.el.querySelector('.lfx-srv-now__head').textContent).toBe('Gerade läuft nichts.');
    await flush(10000);
    const time = () => app.el.querySelector('.lfx-srv-row__time').textContent;
    expect(time()).toBe('0:01:40 / 1:01:40');
    await flush(3000);
    expect(time()).toBe('0:01:43 / 1:01:40');
    app.dispose();
    await flush(3000);
    expect(time()).toBe('0:01:43 / 1:01:40');
  });

  it('stoppt bei document.hidden, ruft sofort beim Sichtbarwerden', async () => {
    const get = vi.fn(() => Promise.resolve(ok({ n: 0, rows: [] })));
    const { app } = mk(get);
    await flush();
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await flush(60000);
    expect(get).toHaveBeenCalledTimes(1);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(get).toHaveBeenCalledTimes(2);
    app.dispose();
  });

  it('bricht einen laufenden Abruf bei Reiterwechsel ab', async () => {
    let signal;
    const get = vi.fn((p, o) => {
      if (p === '/srv/now') {
        signal = o.signal;
        return new Promise(() => {});
      }
      return Promise.resolve(ok({}));
    });
    const { app } = mk(get);
    await flush();
    expect(signal.aborted).toBe(false);
    app.el.querySelectorAll('[role=tab]')[1].click();
    expect(signal.aborted).toBe(true);
    app.dispose();
  });

  it('down: Hinweis, alte Zeilen bleiben, Backoff; danach wieder normal', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(ok({ n: 1, rows: [row()] }))
      .mockResolvedValueOnce(ok({ down: 1 }))
      .mockResolvedValue(ok({ n: 1, rows: [row()] }));
    const { app } = mk(get);
    await flush();
    await flush(10000);
    const note = () => app.el.querySelector('.lfx-srv-note:not([hidden])');
    expect(note().textContent).toContain('Neustart');
    expect(app.el.querySelectorAll('.lfx-srv-row')).toHaveLength(1);
    expect(app.el.querySelector('.lfx-srv-error')).toBeNull();
    await flush(10000);
    expect(get).toHaveBeenCalledTimes(2);
    await flush(10500);
    expect(get).toHaveBeenCalledTimes(3);
    expect(note()).toBeNull();
    app.dispose();
  });

  it('Fehler erst beim zweiten Fehlschlag, Backoff, Erneut versuchen', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(ok({ n: 1, rows: [row()] }))
      .mockResolvedValue({ ok: false, status: 502 });
    const { app } = mk(get);
    await flush();
    await flush(10000);
    expect(get).toHaveBeenCalledTimes(2);
    expect(app.el.querySelector('.lfx-srv-error')).toBeNull();
    expect(app.el.querySelectorAll('.lfx-srv-row')).toHaveLength(1);
    await flush(20000);
    expect(get).toHaveBeenCalledTimes(3);
    expect(app.el.querySelector('.lfx-srv-error').textContent).toContain('Statistik gerade nicht abrufbar.');
    await flush(40000);
    expect(get).toHaveBeenCalledTimes(4);
    get.mockResolvedValue(ok({ n: 0, rows: [] }));
    app.el.querySelector('.lfx-srv-error button').click();
    await flush();
    expect(get).toHaveBeenCalledTimes(5);
    expect(app.el.querySelector('.lfx-srv-error')).toBeNull();
    app.dispose();
  });

  it('429 wartet 30 s ohne Fehlerzustand', async () => {
    const get = vi.fn().mockResolvedValue({ ok: false, status: 429 });
    const { app } = mk(get);
    await flush();
    await flush(29000);
    expect(get).toHaveBeenCalledTimes(1);
    await flush(1500);
    expect(get).toHaveBeenCalledTimes(2);
    expect(app.el.querySelector('.lfx-srv-error')).toBeNull();
    app.dispose();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const auth = vi.hoisted(() => ({ cur: { token: 'TOK', userId: 'u1' } }));
vi.mock('../src/js/core/api.js', () => ({ getAuth: () => auth.cur, getUserId: () => auth.cur.userId }));

import { createTicket } from '../src/js/features/store/mp.js';

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => { if (body === undefined) throw new SyntaxError('x'); return body; } });

beforeEach(() => {
  auth.cur = { token: 'TOK', userId: 'u1' };
  window.LenzFlixConfig = { chartsUrl: 'https://charts.example.test/' };
});
afterEach(() => {
  delete window.LenzFlixConfig;
  vi.unstubAllGlobals();
});

describe('mp.ticket()', () => {
  it('ohne Charts-URL: nourl, kein fetch', async () => {
    delete window.LenzFlixConfig;
    const f = vi.fn(); vi.stubGlobal('fetch', f);
    expect(await createTicket('u1')()).toEqual({ ok: false, why: 'nourl' });
    expect(f).not.toHaveBeenCalled();
  });
  it('Erfolg: Header, credentials omit, absolute wss-URL, Token nie in der URL', async () => {
    const f = vi.fn(async () => reply(200, { v: 1, tk: 'a.b', exp: 5, url: '/mp', pv: [1], s: 9 }));
    vi.stubGlobal('fetch', f);
    const r = await createTicket('u1')();
    expect(r).toEqual({ ok: true, tk: 'a.b', url: 'wss://charts.example.test/mp', exp: 5, pv: [1], s: 9 });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://charts.example.test/mp/ticket');
    expect(init.headers).toEqual({ 'X-Emby-Token': 'TOK' });
    expect(init.credentials).toBe('omit');
    expect(url).not.toContain('TOK');
  });
  it.each([[404, 'gone'], [503, 'off'], [401, 'auth'], [429, 'rate'], [502, 'net'], [403, 'bad']])('Status %i -> %s', async (st, why) => {
    vi.stubGlobal('fetch', vi.fn(async () => reply(st, {})));
    expect(await createTicket('u1')()).toEqual({ ok: false, why });
  });
  it('bad: fehlendes tk, falsche url, kaputtes JSON', async () => {
    for (const body of [{ url: '/mp' }, { tk: 'x', url: '/other' }, undefined]) {
      vi.stubGlobal('fetch', vi.fn(async () => reply(200, body)));
      expect(await createTicket('u1')()).toEqual({ ok: false, why: 'bad' });
    }
  });
  it('blocked bei TypeError, net bei Abbruch, user ohne Token/anderer Nutzer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await createTicket('u1')()).toEqual({ ok: false, why: 'blocked' });
    vi.stubGlobal('fetch', vi.fn(async () => { const e = new Error('a'); e.name = 'AbortError'; throw e; }));
    expect(await createTicket('u1')()).toEqual({ ok: false, why: 'net' });
    auth.cur = { token: null, userId: 'u1' };
    expect(await createTicket('u1')()).toEqual({ ok: false, why: 'user' });
    auth.cur = { token: 'T', userId: 'u2' };
    expect(await createTicket('u1')()).toEqual({ ok: false, why: 'user' });
  });
  it('legt laufende Aufrufe zusammen', async () => {
    const f = vi.fn(async () => reply(200, { tk: 't', url: '/mp' }));
    vi.stubGlobal('fetch', f);
    const t = createTicket('u1');
    const [a, b] = await Promise.all([t(), t()]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    await t();
    expect(f).toHaveBeenCalledTimes(2);
  });
});

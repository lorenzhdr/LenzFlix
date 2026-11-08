import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkToken, parseCustomQuery, resolveSeries, runCustomQuery } from '../src/jellyfin.js';

const env = { JELLYFIN_URL: 'https://jf.example/', JELLYFIN_API_KEY: 'KEY' };
afterEach(() => vi.restoreAllMocks());

describe('parseCustomQuery', () => {
  it('parst colums/results und wandelt Strings in Zahlen', () => {
    const rows = parseCustomQuery({
      colums: ['ItemId', 'ItemType', 'UserId', 'plays', 'secs'],
      results: [['abc', 'Movie', 'u1', '3', '1800']],
      message: '',
    });
    expect(rows).toEqual([{ itemId: 'abc', itemType: 'Movie', userId: 'u1', plays: 3, secs: 1800 }]);
  });

  it('liefert [] bei leeren/kaputten Antworten', () => {
    expect(parseCustomQuery({ colums: [], results: [] })).toEqual([]);
    expect(parseCustomQuery({ message: 'error' })).toEqual([]);
    expect(parseCustomQuery(null)).toEqual([]);
  });

  it('unparsbare Zahlen werden 0', () => {
    const [r] = parseCustomQuery({ colums: ['ItemId', 'ItemType', 'UserId', 'plays', 'secs'], results: [['a', 'Movie', 'u', 'x', null]] });
    expect(r.plays).toBe(0);
    expect(r.secs).toBe(0);
  });
});

describe('Jellyfin-Aufrufe', () => {
  it('runCustomQuery sendet Auth-Header und Body', async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ colums: ['ItemId', 'ItemType', 'UserId'], results: [['a', 'Movie', 'u']] })));
    vi.stubGlobal('fetch', f);
    const rows = await runCustomQuery(env, 'SELECT 1');
    expect(rows).toHaveLength(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://jf.example/user_usage_stats/submit_custom_query');
    expect(init.headers.Authorization).toBe('MediaBrowser Token="KEY"');
    expect(JSON.parse(init.body)).toEqual({ CustomQueryString: 'SELECT 1', ReplaceUserId: false });
  });

  it('resolveSeries teilt in 100er-Blöcke und ignoriert Items ohne SeriesId', async () => {
    const f = vi.fn().mockImplementation(async (url) => {
      const u = new URL(url);
      if (u.pathname.endsWith('/Users')) {
        return new Response(JSON.stringify([
          { Id: 'USER-1', Policy: { IsAdministrator: false } },
          { Id: 'ADMIN-1', Policy: { IsAdministrator: true, IsDisabled: false } },
        ]));
      }
      expect(u.searchParams.get('userId')).toBe('admin1');
      const ids = u.searchParams.get('Ids').split(',');
      return new Response(JSON.stringify({ Items: ids.map((id, i) => (i === 0 ? { Id: id } : { Id: id, SeriesId: 'S-1' })) }));
    });
    vi.stubGlobal('fetch', f);
    const ids = Array.from({ length: 250 }, (_, i) => `e${i}`);
    const map = await resolveSeries(env, ids);
    expect(f).toHaveBeenCalledTimes(4); // 1× /Users + 3× /Items
    expect(map.get('e1')).toBe('s1');
    expect(map.has('e0')).toBe(false);
    expect(map.has('e100')).toBe(false);
  });

  it('checkToken: 200 true, 401 false, 500 wirft', async () => {
    const respond = (s) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: s })));
    respond(200);
    expect(await checkToken(env, 't')).toBe(true);
    respond(401);
    expect(await checkToken(env, 't')).toBe(false);
    respond(500);
    await expect(checkToken(env, 't')).rejects.toThrow();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeCharts } from '../src/index.js';

const env = { JELLYFIN_URL: 'https://jf.example', JELLYFIN_API_KEY: 'KEY' };
afterEach(() => vi.restoreAllMocks());

describe('computeCharts: Episoden-Obergrenze', () => {
  it('löst bei sehr vielen Episoden nur eine begrenzte Zahl auf (Subrequest-Budget)', async () => {
    const N = 6000;
    const results = [];
    for (let i = 0; i < N; i++) results.push([`ep${String(i).padStart(6, '0')}`, 'Episode', 'u1', '1', String(300 + i)]);
    const f = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('submit_custom_query')) {
        return new Response(JSON.stringify({ colums: ['ItemId', 'ItemType', 'UserId', 'plays', 'secs'], results }));
      }
      if (u.endsWith('/Users')) return new Response('[]');
      return new Response(JSON.stringify({ Items: [] }));
    });
    vi.stubGlobal('fetch', f);
    await computeCharts(env);
    // 1 Query + 1 /Users + ceil(2000/100) Items-Blöcke = 22, weit unter 50
    expect(f.mock.calls.length).toBeLessThanOrEqual(30);
    const itemCalls = f.mock.calls.filter(([u]) => String(u).includes('/Items?Ids='));
    const ids = new Set(itemCalls.flatMap(([u]) => new URL(String(u)).searchParams.get('Ids').split(',')));
    expect(ids.size).toBeLessThanOrEqual(2000);
    // die stärksten Episoden (meiste Sekunden) bleiben erhalten
    expect(ids.has(`ep${String(N - 1).padStart(6, '0')}`)).toBe(true);
  });
});

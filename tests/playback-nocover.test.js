// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/js/core/startcover.js', () => ({ show: vi.fn(), hide: vi.fn(), allowRoute: vi.fn() }));

import { play } from '../src/js/core/playback.js';
import { show, hide, allowRoute } from '../src/js/core/startcover.js';

const item = { Id: 'i1', Type: 'Movie', MediaType: 'Video', IsFolder: false };

beforeEach(() => {
  vi.clearAllMocks();
  window.ApiClient = { serverId: () => 'srv', getCurrentUserId: () => 'u', accessToken: () => 't', serverAddress: () => 'http://x' };
  document.body.innerHTML = '<div class="itemsContainer"><div class="card"></div></div>';
});

describe('playback · noCover', () => {
  it('Default: Ladebild wird gezeigt', async () => {
    expect(await play(item)).toBe(true);
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith({ item });
  });

  it('noCover: kein Ladebild, die Wiedergabe startet trotzdem (Proxy-Klick und lfx:play)', async () => {
    const container = document.querySelector('.itemsContainer');
    const click = vi.fn();
    container.addEventListener('click', click);
    const ev = vi.fn();
    window.addEventListener('lfx:play', ev);
    expect(await play(item, { noCover: true })).toBe(true);
    window.removeEventListener('lfx:play', ev);
    expect(show).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
    expect(ev).toHaveBeenCalledTimes(1);
  });

  it('noCover im Detailseiten-Rückfall: keine Cover-Route freigegeben', async () => {
    document.body.innerHTML = '';
    const p = play(item, { noCover: true, timeoutMs: 100 });
    expect(await p).toBe(false);
    expect(show).not.toHaveBeenCalled();
    expect(allowRoute).not.toHaveBeenCalled();
    expect(hide).toHaveBeenCalled(); // harmlos: räumt nur ein vorhandenes Ladebild weg
  });

  it('Default im Rückfall gibt die Cover-Route frei', async () => {
    document.body.innerHTML = '';
    await play(item, { timeoutMs: 100 });
    expect(allowRoute).toHaveBeenCalledWith('/details');
  });
});

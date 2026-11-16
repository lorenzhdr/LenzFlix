// @vitest-environment jsdom
// playViaDetails klickt nur auf der angesteuerten Detailseite.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clearCache } from '../src/js/core/cache.js';
import { play } from '../src/js/core/playback.js';
import { destroy as destroyCover } from '../src/js/core/startcover.js';

function client(extra = {}) {
  window.ApiClient = {
    serverId: () => 'srv', getCurrentUserId: () => 'u1', accessToken: () => 'tok', serverAddress: () => 'http://x', ...extra,
  };
}

beforeEach(() => { clearCache(); client(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('playViaDetails klickt nur auf der angesteuerten Detailseite', () => {
  beforeEach(() => { document.documentElement.className = 'lfx-js'; document.body.innerHTML = ''; destroyCover(); });
  it('Navigation zu anderem Titel -> kein Klick, false', async () => {
    const click = vi.fn();
    const pr = play({ Id: 'i1', Type: 'Movie', MediaType: 'Video' }, { timeoutMs: 600 });
    window.location.hash = '#/details?id=other&serverId=srv';
    document.body.innerHTML = '<div class="itemDetailPage"><div class="mainDetailButtons"><button class="btnPlay"></button></div></div>';
    document.querySelector('.btnPlay').addEventListener('click', click);
    expect(await pr).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });
  it('richtige Detailseite -> Klick', async () => {
    const click = vi.fn();
    document.body.innerHTML = '<div class="itemDetailPage"><div class="mainDetailButtons"><button class="btnPlay"></button></div></div>';
    document.querySelector('.btnPlay').addEventListener('click', click);
    expect(await play({ Id: 'i2', Type: 'Movie', MediaType: 'Video' }, { timeoutMs: 600 })).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
  });
});


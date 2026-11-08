// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { play, buildProxy } from '../src/js/core/playback.js';

beforeEach(() => {
  window.ApiClient = { serverId: () => 'srv', getCurrentUserId: () => 'u', accessToken: () => 't', serverAddress: () => 'http://x' };
  document.body.innerHTML = '';
});

const item = { Id: 'i1', Type: 'Movie', MediaType: 'Video', IsFolder: false, UserData: { PlaybackPositionTicks: 500 } };

describe('playback', () => {
  it('buildProxy: data-Attribute', () => {
    const el = buildProxy(item, true);
    expect(el.dataset).toMatchObject({ action: 'resume', id: 'i1', serverid: 'srv', type: 'Movie', mediatype: 'Video', isfolder: 'false', positionticks: '500' });
  });

  it('Proxy-Klick: erzeugt Element im itemsContainer, klickt, entfernt', async () => {
    document.body.innerHTML = '<div class="itemsContainer"><div class="card"></div></div>';
    const container = document.querySelector('.itemsContainer');
    let seen = null;
    container.addEventListener('click', (e) => {
      const t = e.target.closest('.itemAction');
      seen = t && { ...t.dataset, inContainer: container.contains(t) };
    });
    expect(await play(item, { resume: false })).toBe(true);
    expect(seen).toMatchObject({ action: 'play', id: 'i1', inContainer: true });
    expect(container.querySelector('.itemAction')).toBeNull();
  });

  it('ignoriert Container ohne Karten', async () => {
    document.body.innerHTML = '<div class="itemsContainer" id="empty"></div><div class="itemsContainer" id="full"><div class="card"></div></div>';
    const spy = vi.fn();
    document.getElementById('full').addEventListener('click', spy);
    await play(item);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('Fallback: Detailseite öffnen und Play-Button klicken', async () => {
    const p = play(item, { timeoutMs: 2000 });
    expect(window.location.hash).toBe('#/details?id=i1&serverId=srv');
    document.body.innerHTML = '<div class="itemDetailPage"><div class="mainDetailButtons"><button class="btnPlay"></button></div></div>';
    const clicked = new Promise((r) => document.querySelector('.btnPlay').addEventListener('click', r));
    await clicked;
    expect(await p).toBe(true);
  });
});

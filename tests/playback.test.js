// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { play, buildProxy } from '../src/js/core/playback.js';
import { destroy as destroyCover } from '../src/js/core/startcover.js';

beforeEach(() => {
  window.ApiClient = { serverId: () => 'srv', getCurrentUserId: () => 'u', accessToken: () => 't', serverAddress: () => 'http://x' };
  document.documentElement.className = 'lfx-js';
  document.body.innerHTML = '';
  destroyCover();
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

  it('lfx:play: synchron am Anfang, vor dem Proxy-Klick', async () => {
    document.body.innerHTML = '<div class="itemsContainer"><div class="card"></div></div>';
    const order = [];
    const onPlay = (e) => order.push(['play', e.detail.id]);
    window.addEventListener('lfx:play', onPlay);
    document.querySelector('.itemsContainer').addEventListener('click', () => order.push(['click']));
    const p = play(item);
    expect(order).toEqual([['play', 'i1'], ['click']]); // schon vor dem Auflösen des Promise
    await p;
    window.removeEventListener('lfx:play', onPlay);
  });

  it('lfx:play: nicht ohne Item/Id', async () => {
    const spy = vi.fn();
    window.addEventListener('lfx:play', spy);
    expect(await play(null)).toBe(false);
    expect(await play({})).toBe(false);
    window.removeEventListener('lfx:play', spy);
    expect(spy).not.toHaveBeenCalled();
  });

  it('Ladebild: sofort vor dem Proxy-Klick', async () => {
    document.body.innerHTML = '<div class="itemsContainer"><div class="card"></div></div>';
    let atClick = null;
    document.querySelector('.itemsContainer').addEventListener('click', () => { atClick = Boolean(document.getElementById('lfx-startcover')); });
    await play({ ...item, Name: 'Titel' });
    expect(atClick).toBe(true);
    expect(document.querySelector('.lfx-startcover__title').textContent).toBe('Titel');
  });

  it('Ladebild: Fallback-Pfad hält es über der Detailseite', async () => {
    window.location.hash = '#/home';
    const p = play(item, { timeoutMs: 2000 });
    expect(document.getElementById('lfx-startcover')).not.toBeNull();
    const clicked = new Promise((r) => { setTimeout(() => {
      document.body.insertAdjacentHTML('beforeend', '<div class="itemDetailPage"><div class="mainDetailButtons"><button class="btnPlay"></button></div></div>');
      document.querySelector('.btnPlay').addEventListener('click', r);
    }, 20); });
    await clicked;
    expect(await p).toBe(true);
    expect(document.getElementById('lfx-startcover').classList.contains('is-leaving')).toBe(false);
  });

  it('Ladebild: Fallback ohne Erfolg (Timeout) entfernt es', async () => {
    window.location.hash = '#/home';
    expect(await play(item, { timeoutMs: 10 })).toBe(false);
    expect(document.getElementById('lfx-startcover').classList.contains('is-leaving')).toBe(true);
  });
});

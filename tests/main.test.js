// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  if (window.LenzFlix) window.LenzFlix.destroy();
  vi.resetModules();
  document.body.innerHTML = '';
  delete window.ApiClient;
});

describe('main', () => {
  it('setzt window.LenzFlix, Guard gegen Doppel-Init, destroy räumt auf', async () => {
    window.ApiClient = { serverAddress: () => 'http://x', getCurrentUserId: () => 'u', accessToken: () => 't', serverId: () => 's' };
    window.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ Items: [{ Id: 'm', Name: 'F', CollectionType: 'movies' }] }) }));
    document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
    window.location.hash = '#/home';
    await import('../src/js/main.js');
    expect(window.LenzFlix.version).toBeTruthy();
    const first = window.LenzFlix;
    expect(document.documentElement.classList.contains('lfx-js')).toBe(true);
    expect(document.getElementById('lfx-nav')).not.toBeNull();
    expect(document.getElementById('lfx-ambient')).not.toBeNull();
    vi.resetModules();
    await import('../src/js/main.js');
    expect(window.LenzFlix).toBe(first);
    window.LenzFlix.destroy();
    expect(window.LenzFlix).toBeUndefined();
    expect(document.getElementById('lfx-nav')).toBeNull();
    expect(document.getElementById('lfx-ambient')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-js')).toBe(false);
    expect(document.documentElement.classList.contains('lfx-nav-on')).toBe(false);
  });
});

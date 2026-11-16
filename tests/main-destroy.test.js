// @vitest-environment jsdom
// main: destroy() schließt Picker und Toast; CSS aus räumt den Datensparmodus ab.
import { describe, it, expect, vi, afterEach } from 'vitest';

function addCss() {
  const st = document.createElement('style');
  st.id = 'test-css';
  st.textContent = ':root { --lfx-css: 1; }';
  document.head.append(st);
  return st;
}
function setup() {
  window.ApiClient = { serverAddress: () => 'http://x', getCurrentUserId: () => 'u', accessToken: () => 't', serverId: () => 's' };
  window.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ Items: [] }) }));
  document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
  window.location.hash = '#/home';
}

afterEach(() => {
  if (window.LenzFlix) window.LenzFlix.destroy();
  vi.useRealTimers();
  vi.resetModules();
  document.body.innerHTML = '';
  delete window.ApiClient;
  document.getElementById('test-css')?.remove();
  document.getElementById('lfx-theme-prehide')?.remove();
  document.querySelectorAll('link.lfx-theme-css').forEach((l) => l.remove());
  document.documentElement.className = '';
  localStorage.clear();
});

describe('main: Aufräumen', () => {
  it('destroy() schließt den offenen Design-Picker und den Toast', async () => {
    setup();
    addCss();
    await import('../src/js/main.js');
    const { openThemePicker } = await import('../src/js/core/themepicker.js');
    const { toast } = await import('../src/js/core/toast.js');
    openThemePicker();
    toast('Hallo');
    expect(document.getElementById('lfx-themepicker')).not.toBeNull();
    expect(document.documentElement.classList.contains('lfx-themepicker-open')).toBe(true);
    window.LenzFlix.destroy();
    expect(document.getElementById('lfx-themepicker')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-themepicker-open')).toBe(false);
    expect(document.getElementById('lfx-toast')).toBeNull();
    expect(document.getElementById('lfx-toast-live')).toBeNull();
  }, 15000);

  it('CSS aus (stopFeatures) nimmt Datensparmodus-Klasse und Bild-Skala zurück', async () => {
    vi.useFakeTimers();
    setup();
    const st = addCss();
    await import('../src/js/main.js');
    const { setDataSaver } = await import('../src/js/core/datasaver.js');
    const api = await import('../src/js/core/api.js');
    const widthOf = () => /maxWidth=(\d+)/.exec(api.imageUrlFor('i1', { maxWidth: 600, tag: 't' }))[1];
    vi.advanceTimersByTime(1100);
    const html = document.documentElement;
    setDataSaver(true);
    expect(html.classList.contains('lfx-datasaver')).toBe(true);
    expect(widthOf()).toBe('400');
    st.remove();
    vi.advanceTimersByTime(1100);
    expect(html.classList.contains('lfx-js')).toBe(false);
    expect(html.classList.contains('lfx-datasaver')).toBe(false);
    expect(widthOf()).toBe('600');
    addCss(); // CSS kommt zurück: syncDataSaver baut neu auf
    vi.advanceTimersByTime(1100);
    expect(html.classList.contains('lfx-datasaver')).toBe(true);
  }, 15000);
});

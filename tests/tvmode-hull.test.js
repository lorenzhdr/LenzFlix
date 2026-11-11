// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let theme = 'flix';
let modern = true;
let tv = false;
const themeListeners = new Set();

vi.mock('../src/js/core/api.js', () => ({
  isReady: () => true,
  getUserId: () => 'u1',
  getItem: vi.fn(async (id) => ({ Id: id, Type: 'Movie', MediaType: 'Video' })),
}));
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => modern, isTv: () => tv, isMobile: () => false }));
vi.mock('../src/js/core/theme.js', () => ({
  isTheme: (id) => theme === id,
  getTheme: () => theme,
  onThemeChange: (fn) => { themeListeners.add(fn); return () => themeListeners.delete(fn); },
}));
vi.mock('../src/js/core/popover.js', () => ({ isPopoverOpen: () => false }));
vi.mock('../src/js/core/toast.js', () => ({ toast: vi.fn() }));
vi.mock('../src/js/core/themejs.js', () => ({ ensureThemeJs: vi.fn(async () => true), removeThemeJs: vi.fn() }));
vi.mock('../src/js/core/addoncss.js', () => ({ ensureAddonCss: vi.fn(async () => true), removeAddonCss: vi.fn() }));
vi.mock('../src/js/core/playback.js', () => ({ play: vi.fn(async () => true) }));
vi.mock('../src/js/features/modal.js', () => ({ openModal: vi.fn() }));
vi.mock('../src/js/features/live/data.js', () => ({ loadCatalog: vi.fn(async () => ({ items: [] })) }));
vi.mock('../src/js/features/live/deps.js', () => ({
  buildApiDeps: (raw, user) => ({ catalog: raw, user, request: vi.fn(), streamUrl: vi.fn(), imageUrl: vi.fn() }),
  loadUser: vi.fn(async () => ({ id: 'u1' })),
  fatalText: (e) => (e && e.message) || '',
}));

import feature, { destroyTvMode } from '../src/js/features/tvmode/page.js';
import { parseHash } from '../src/js/core/router.js';
import { ensureThemeJs } from '../src/js/core/themejs.js';
import { ensureAddonCss, removeAddonCss } from '../src/js/core/addoncss.js';
import { play } from '../src/js/core/playback.js';
import { openModal } from '../src/js/features/modal.js';
import { toast } from '../src/js/core/toast.js';
import { loadCatalog } from '../src/js/features/live/data.js';

const route = (h) => parseHash(h);
const flush = async () => { for (let i = 0; i < 8; i += 1) await new Promise((r) => setTimeout(r, 0)); };

let instance;
let created; // { host, deps, opts }
let suspendResult;

function makeEngine() {
  instance = {
    start: vi.fn(),
    stop: vi.fn(),
    suspend: vi.fn(() => suspendResult),
    resume: vi.fn(),
    isOn: vi.fn(() => true),
    isPip: vi.fn(() => false),
    dispose: vi.fn(),
  };
  window.LenzFlixTvMode = {
    version: 1,
    create: vi.fn((host, deps, opts) => {
      created = { host, deps, opts };
      return instance;
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  theme = 'flix';
  modern = true;
  tv = false;
  suspendResult = false;
  document.body.innerHTML = '<div id="indexPage"><div id="homeTab"><div class="sections"></div></div></div>';
  document.documentElement.className = '';
  window.location.hash = '#/home?lfx=tv';
  makeEngine();
});
afterEach(() => {
  feature.unmount();
  destroyTvMode();
  delete window.LenzFlixTvMode;
  delete window.__lfxTvmDebug;
  localStorage.clear();
});

async function mountReady() {
  feature.mount(route('#/home?lfx=tv'));
  await flush();
  created.deps.onReady();
}

describe('tvmode match', () => {
  const m = () => feature.match(route('#/home?lfx=tv'));
  it('flix/plus/prime ja', () => {
    for (const t of ['flix', 'plus', 'prime']) { theme = t; expect(m()).toBe(true); }
  });
  it('retro/store/live nein', () => {
    for (const t of ['retro', 'store', 'live']) { theme = t; expect(m()).toBe(false); }
  });
  it('layout-tv / nicht modern nein, andere Routen nein', () => {
    tv = true; expect(m()).toBe(false);
    tv = false; modern = false; expect(m()).toBe(false);
    modern = true;
    expect(feature.match(route('#/home'))).toBe(false);
    expect(feature.match(route('#/home?lfx=new'))).toBe(false);
  });
});

describe('tvmode mount', () => {
  it('hängt #lfx-tvm vorn in #homeTab, setzt Klasse und zeigt die Ladeanzeige', async () => {
    feature.mount();
    const root = document.querySelector('#homeTab > #lfx-tvm.lfx-tvm');
    expect(root).toBe(document.getElementById('homeTab').firstChild);
    expect(document.documentElement.classList.contains('lfx-tvm-on')).toBe(true);
    expect(root.classList.contains('is-loading')).toBe(true);
    expect(root.querySelector('.lfx-tvm__boot-text').textContent).toBe('TV wird vorbereitet …');
    await flush();
    expect(ensureAddonCss).toHaveBeenCalledWith('lenztvmode');
    expect(ensureThemeJs).toHaveBeenCalledWith('tvmode');
    expect(loadCatalog).toHaveBeenCalled();
  });

  it('übernimmt Fortschritt aus onProgress und startet nach onReady', async () => {
    feature.mount();
    await flush();
    created.deps.onProgress(0.5, 'Plane Sender …');
    const root = document.getElementById('lfx-tvm');
    expect(root.querySelector('.lfx-tvm__boot-text').textContent).toBe('Plane Sender …');
    expect(instance.start).not.toHaveBeenCalled();
    created.deps.onReady();
    expect(root.classList.contains('is-loading')).toBe(false);
    expect(root.querySelector('.lfx-tvm__boot')).toBe(null);
    expect(instance.start).toHaveBeenCalledTimes(1);
  });

  it('onReady schon während create() startet danach', async () => {
    window.LenzFlixTvMode.create = vi.fn((host, deps) => { deps.onReady(); return instance; });
    feature.mount();
    await flush();
    expect(instance.start).toHaveBeenCalledTimes(1);
  });

  it('übergibt deps und opts laut Vertrag', async () => {
    window.__lfxTvmDebug = true;
    localStorage.setItem('lfx.tvm.lastChannel.u1', '5');
    feature.mount();
    await flush();
    expect(created.host.id).toBe('lfx-tvm');
    for (const k of ['request', 'streamUrl', 'imageUrl', 'savePrefs', 'openDetails', 'playFromStart', 'keysBlocked', 'toast', 'onProgress', 'onReady', 'onFatal', 'onStopped', 'onPip']) {
      expect(typeof created.deps[k]).toBe('function');
    }
    expect(created.deps.catalog).toBeDefined();
    expect(created.deps.user).toBeDefined();
    expect(created.opts).toMatchObject({ video: null, lastChannel: 5, volume: 0.8, muted: false, phone: false, touch: false, debug: true });
  });

  it('savePrefs schreibt lfx.tvm.*', async () => {
    feature.mount();
    await flush();
    created.deps.savePrefs({ volume: 0.4, lastChannel: 3 });
    expect(localStorage.getItem('lfx.tvm.volume.u1')).toBe('0.4');
    expect(localStorage.getItem('lfx.tvm.lastChannel.u1')).toBe('3');
  });

  it('Fehlerkarte mit „Erneut versuchen“', async () => {
    loadCatalog.mockRejectedValueOnce(new Error('kaputt'));
    feature.mount();
    await flush();
    const root = document.getElementById('lfx-tvm');
    expect(root.querySelector('.lfx-tvm__fallback-text').textContent).toContain('kaputt');
    expect(window.LenzFlixTvMode.create).not.toHaveBeenCalled();
    root.querySelector('.lfx-tvm__fallback-btn.is-primary').click();
    await flush();
    expect(root.querySelector('.lfx-tvm__fallback')).toBe(null);
    expect(window.LenzFlixTvMode.create).toHaveBeenCalledTimes(1);
  });

  it('onFatal zeigt die Fehlerkarte und verwirft die Instanz', async () => {
    feature.mount();
    await flush();
    created.deps.onFatal(new Error('boom'));
    expect(instance.dispose).toHaveBeenCalled();
    expect(document.querySelector('.lfx-tvm__fallback')).not.toBe(null);
  });
});

describe('tvmode Lebenszyklus', () => {
  it('unmount ohne PiP: suspend, dispose, Aufräumen', async () => {
    await mountReady();
    feature.unmount();
    expect(instance.suspend).toHaveBeenCalled();
    expect(instance.dispose).toHaveBeenCalledTimes(1);
    expect(document.getElementById('lfx-tvm')).toBe(null);
    expect(document.documentElement.classList.contains('lfx-tvm-on')).toBe(false);
  });

  it('unmount mit PiP behält die Instanz, mount dockt per resume an', async () => {
    suspendResult = true;
    await mountReady();
    feature.unmount();
    expect(instance.dispose).not.toHaveBeenCalled();
    feature.mount();
    expect(instance.resume).toHaveBeenCalledWith(document.getElementById('lfx-tvm'));
    expect(window.LenzFlixTvMode.create).toHaveBeenCalledTimes(1);
    expect(document.getElementById('lfx-tvm').classList.contains('is-loading')).toBe(false);
  });

  it('ensure() zweimal vor onReady: Ladebildschirm bleibt bis onReady, danach genau ein start', async () => {
    feature.mount();
    await flush();
    document.getElementById('indexPage').innerHTML = '<div id="homeTab"><div class="sections"></div></div>'; // #homeTab ersetzt
    feature.update();
    const root = document.getElementById('lfx-tvm');
    expect(instance.resume).toHaveBeenCalledWith(root);
    expect(root.querySelector('.lfx-tvm__boot')).not.toBe(null);
    expect(instance.start).not.toHaveBeenCalled();
    created.deps.onReady();
    expect(root.querySelector('.lfx-tvm__boot')).toBe(null);
    expect(root.classList.contains('is-loading')).toBe(false);
    expect(instance.start).toHaveBeenCalledTimes(1);
  });

  it('behaltene Instanz wird bei Stopp im Hintergrund vergessen', async () => {
    suspendResult = true;
    await mountReady();
    const deps = created.deps;
    feature.unmount();
    deps.onStopped({ reason: 'pip-end' });
    expect(instance.dispose).toHaveBeenCalledTimes(1);
    feature.mount();
    await flush();
    expect(window.LenzFlixTvMode.create).toHaveBeenCalledTimes(2);
  });

  it('Design-Wechsel: dispose und removeAddonCss', async () => {
    await mountReady();
    theme = 'retro';
    for (const fn of [...themeListeners]) fn({ theme });
    expect(instance.dispose).toHaveBeenCalledTimes(1);
    expect(removeAddonCss).toHaveBeenCalledWith('lenztvmode');
  });

  it('destroyTvMode: dispose, removeAddonCss, Klasse und DOM weg', async () => {
    await mountReady();
    destroyTvMode();
    expect(instance.dispose).toHaveBeenCalledTimes(1);
    expect(removeAddonCss).toHaveBeenCalledWith('lenztvmode');
    expect(document.getElementById('lfx-tvm')).toBe(null);
    expect(document.documentElement.classList.contains('lfx-tvm-on')).toBe(false);
    expect(themeListeners.size).toBe(0);
  });
});

describe('tvmode Details (flix-Modal)', () => {
  const setModal = async (open) => {
    document.documentElement.classList.toggle('lfx-modal-open', open);
    await flush();
  };

  it('openDetails: flix → openModal, plus → Titelseite', async () => {
    await mountReady();
    created.deps.openDetails('abc');
    expect(openModal).toHaveBeenCalledWith('abc');
    theme = 'plus';
    created.deps.openDetails('abc');
    expect(window.location.hash).toBe('#/home?lfx=title&id=abc');
  });

  it('Modal auf → stop, zu ohne lfx:play → start', async () => {
    await mountReady();
    instance.start.mockClear();
    await setModal(true);
    expect(instance.stop).toHaveBeenCalledWith('modal');
    await setModal(false);
    expect(instance.start).toHaveBeenCalledTimes(1);
  });

  it('Modal zu mit lfx:play → kein start', async () => {
    await mountReady();
    instance.start.mockClear();
    await setModal(true);
    window.dispatchEvent(new CustomEvent('lfx:play', { detail: { id: 'x' } }));
    await setModal(false);
    expect(instance.start).not.toHaveBeenCalled();
  });

  it('Modal zu, Player offen bzw. Route nicht mehr tv → kein start', async () => {
    await mountReady();
    instance.start.mockClear();
    await setModal(true);
    document.body.insertAdjacentHTML('beforeend', '<div id="videoOsdPage"></div>');
    await setModal(false);
    expect(instance.start).not.toHaveBeenCalled();
    document.getElementById('videoOsdPage').remove();
    await setModal(true);
    window.location.hash = '#/home';
    await setModal(false);
    expect(instance.start).not.toHaveBeenCalled();
  });

  it('war TV vor dem Modal aus, bleibt es aus', async () => {
    await mountReady();
    instance.start.mockClear();
    instance.isOn.mockReturnValue(false);
    await setModal(true);
    await setModal(false);
    expect(instance.start).not.toHaveBeenCalled();
  });

  it('keysBlocked bei offenem Modal', async () => {
    await mountReady();
    expect(created.deps.keysBlocked()).toBe(false);
    document.documentElement.classList.add('lfx-modal-open');
    expect(created.deps.keysBlocked()).toBe(true);
  });
});

describe('tvmode playFromStart', () => {
  it('ruft play(item, { resume: false }) und nie /Sessions/Playing', async () => {
    await mountReady();
    await created.deps.playFromStart('m1');
    expect(play).toHaveBeenCalledWith(expect.objectContaining({ Id: 'm1', Type: 'Movie' }), { resume: false });
    for (const call of created.deps.request.mock.calls) expect(String(call[1])).not.toMatch(/Sessions\/Playing/);
  });
});

describe('tvmode playFromStart Fehler', () => {
  it('play false: Toast und Instanz wieder einschalten', async () => {
    await mountReady();
    instance.isOn.mockReturnValue(false);
    instance.start.mockClear();
    play.mockResolvedValueOnce(false);
    expect(await created.deps.playFromStart('m1')).toBe(false);
    expect(toast).toHaveBeenCalledWith('Wiedergabe konnte nicht gestartet werden');
    expect(instance.start).toHaveBeenCalledTimes(1);
  });

  it('play wirft: Toast und start; nach unmount kein start', async () => {
    await mountReady();
    instance.isOn.mockReturnValue(false);
    instance.start.mockClear();
    play.mockRejectedValueOnce(new Error('x'));
    await created.deps.playFromStart('m1');
    expect(toast).toHaveBeenCalled();
    expect(instance.start).toHaveBeenCalledTimes(1);
    const p = created.deps.playFromStart('m2');
    play.mockRejectedValueOnce(new Error('y'));
    feature.unmount();
    instance.start.mockClear();
    await p;
    expect(instance.start).not.toHaveBeenCalled();
  });
});

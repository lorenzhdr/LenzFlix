// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const pop = { open: false, onClosed: null };
const openPopover = vi.fn((anchor, opts) => {
  pop.open = true;
  pop.onClosed = opts.onClosed;
  const el = document.createElement('div');
  el.id = 'lfx-popover';
  document.body.appendChild(el);
  return { el, close: () => closePopover() };
});
const closePopover = vi.fn(() => {
  if (!pop.open) return;
  pop.open = false;
  document.getElementById('lfx-popover')?.remove();
  if (pop.onClosed) pop.onClosed();
});
const sheet = { open: false };
const openProfileSheet = vi.fn(() => {
  sheet.open = true;
  return { close: () => {} };
});
const closeProfileSheet = vi.fn(() => {
  sheet.open = false;
});
const layout = { narrow: false };

vi.mock('../src/js/core/popover.js', () => ({
  openPopover: (...a) => openPopover(...a),
  closePopover: (...a) => closePopover(...a),
  isPopoverOpen: () => pop.open,
}));
vi.mock('../src/js/shared/profilesheet.js', () => ({
  openProfileSheet: (...a) => openProfileSheet(...a),
  closeProfileSheet: (...a) => closeProfileSheet(...a),
  isProfileSheetOpen: () => sheet.open,
}));
vi.mock('../src/js/shared/profile.js', () => ({
  profileEntries: vi.fn(async () => [{ key: 'stats', label: 'Meine Statistik' }, { key: 'sep', separator: true }]),
  getUserChip: vi.fn(async () => ({ name: 'Lenz', imageUrl: 'x.png' })),
  quickConnectEnabled: vi.fn(async () => false),
}));
vi.mock('../src/js/core/api.js', () => ({ isReady: () => true }));
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => true, isTv: () => false, isNarrow: () => layout.narrow }));
vi.mock('../src/js/core/theme.js', () => ({ isTheme: (id) => id === 'flix' }));
vi.mock('../src/js/features/nav.js', () => ({ EXCLUDED: /^\/(login|video)/ }));

const { default: feature } = await import('../src/js/features/profilemenu.js');
const { profileEntries } = await import('../src/js/shared/profile.js');

let parent;
let btn;
let syncBtn;
let parentSpy;
let canHover = true;

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};
const click = (el, detail = 1) => {
  const e = new MouseEvent('click', { bubbles: true, cancelable: true, detail });
  el.dispatchEvent(e);
  return e;
};
const ptr = (type, el, { pointerType = 'mouse', related = null } = {}) => {
  const e = new Event(type, { bubbles: true });
  e.pointerType = pointerType;
  Object.defineProperty(e, 'relatedTarget', { value: related });
  el.dispatchEvent(e);
};

beforeEach(() => {
  vi.useFakeTimers();
  pop.open = false;
  pop.onClosed = null;
  sheet.open = false;
  layout.narrow = false;
  canHover = true;
  vi.clearAllMocks();
  window.matchMedia = vi.fn(() => ({ matches: canHover }));
  document.body.innerHTML = `<header class="MuiAppBar-root"><div class="MuiToolbar-root"><div id="p">
    <button id="sync" aria-controls="app-sync-play-menu" aria-haspopup="true"></button>
    <button id="cast" aria-controls="app-remote-play-menu" aria-haspopup="true"></button>
    <button id="user" aria-controls="app-user-menu" aria-haspopup="true"><span class="MuiAvatar-root"><img></span></button>
  </div></div></header>`;
  parent = document.getElementById('p');
  btn = document.getElementById('user');
  syncBtn = document.getElementById('sync');
  parentSpy = vi.fn();
  parent.addEventListener('click', parentSpy);
  feature.mount({ path: '/home', hash: '#/home' });
});

afterEach(() => {
  feature.unmount();
  vi.useRealTimers();
  document.documentElement.className = '';
});

describe('profilemenu', () => {
  it('match: nur flix, modern, nicht ausgeschlossen', () => {
    expect(feature.match({ path: '/home' })).toBe(true);
    expect(feature.match({ path: '/video' })).toBe(false);
  });

  it('fängt Klick ab und öffnet das Popover mit Kopf + Einträgen', async () => {
    const before = btn.outerHTML;
    const e = click(btn);
    expect(e.defaultPrevented).toBe(true);
    expect(parentSpy).not.toHaveBeenCalled();
    await flush();
    expect(openPopover).toHaveBeenCalledTimes(1);
    const [anchor, opts] = openPopover.mock.calls[0];
    expect(anchor).toBe(btn);
    expect(opts.expand).toBe(false);
    expect(opts.className).toBe('lfx-flix-profile');
    expect(opts.items[0]).toEqual({ head: true, label: 'Lenz', imageUrl: 'x.png' });
    expect(opts.items.map((i) => i.key)).toEqual([undefined, 'stats', 'sep']);
    expect(btn.outerHTML).toBe(before);
    expect(btn.hasAttribute('aria-expanded')).toBe(false);
  });

  it('Avatar-Rückfall ohne aria-controls wird auch abgefangen', async () => {
    btn.removeAttribute('aria-controls');
    click(btn.querySelector('.MuiAvatar-root'));
    await flush();
    expect(parentSpy).not.toHaveBeenCalled();
    expect(openPopover).toHaveBeenCalledTimes(1);
  });

  it('Sync-Play-/Cast-Knopf werden nicht abgefangen', async () => {
    const e = click(syncBtn);
    click(document.getElementById('cast'));
    await flush();
    expect(e.defaultPrevented).toBe(false);
    expect(parentSpy).toHaveBeenCalledTimes(2);
    expect(openPopover).not.toHaveBeenCalled();
  });

  it('Tastatur-Klick (detail 0) fokussiert, Mausklick nicht', async () => {
    click(btn, 0);
    await flush();
    expect(openPopover.mock.calls[0][1].focus).toBe(true);
    closePopover();
    click(btn, 1);
    await flush();
    expect(openPopover.mock.calls[1][1].focus).toBe(false);
  });

  it('html-Klasse folgt dem Öffnen/Schließen (onClosed)', async () => {
    click(btn);
    await flush();
    expect(document.documentElement.classList.contains('lfx-flix-profile-open')).toBe(true);
    closePopover();
    expect(document.documentElement.classList.contains('lfx-flix-profile-open')).toBe(false);
  });

  it('zweiter Klick schaltet um', async () => {
    click(btn);
    await flush();
    click(btn);
    expect(closePopover).toHaveBeenCalled();
    expect(pop.open).toBe(false);
  });

  it('Hover öffnet nur mit Maus und feinem Zeiger', async () => {
    ptr('pointerover', btn, { pointerType: 'touch' });
    await flush();
    expect(openPopover).not.toHaveBeenCalled();
    canHover = false;
    ptr('pointerover', btn);
    await flush();
    expect(openPopover).not.toHaveBeenCalled();
    canHover = true;
    ptr('pointerover', btn);
    await flush();
    expect(openPopover).toHaveBeenCalledTimes(1);
    expect(openPopover.mock.calls[0][1].focus).toBe(false);
  });

  it('Wegfahren schließt nach 200 ms, Betreten des Popovers bricht ab', async () => {
    ptr('pointerover', btn);
    await flush();
    ptr('pointerout', btn, { related: document.body });
    vi.advanceTimersByTime(199);
    expect(pop.open).toBe(true);
    vi.advanceTimersByTime(2);
    expect(pop.open).toBe(false);

    ptr('pointerover', btn);
    await flush();
    ptr('pointerout', btn, { related: document.body });
    const popEl = document.getElementById('lfx-popover');
    ptr('pointerover', popEl);
    vi.advanceTimersByTime(500);
    expect(pop.open).toBe(true);
    ptr('pointerout', popEl, { related: btn });
    vi.advanceTimersByTime(500);
    expect(pop.open).toBe(true);
    ptr('pointerout', popEl, { related: document.body });
    vi.advanceTimersByTime(250);
    expect(pop.open).toBe(false);
  });

  it('Klick direkt nach Hover-Öffnen lässt das Menü offen, später schließt er', async () => {
    ptr('pointerover', btn);
    await flush();
    vi.advanceTimersByTime(300);
    click(btn);
    expect(pop.open).toBe(true);
    vi.advanceTimersByTime(600);
    click(btn);
    expect(pop.open).toBe(false);
  });

  it('schmal: Bottom-Sheet mit flix-Präfix, erneuter Klick schließt', async () => {
    layout.narrow = true;
    click(btn);
    await flush();
    expect(openPopover).not.toHaveBeenCalled();
    const opts = openProfileSheet.mock.calls[0][0];
    expect(opts.prefix).toBe('lfx-flix-psheet');
    expect(opts.id).toBe('lfx-flix-profilesheet');
    expect(opts.openClass).toBe('lfx-flix-profilesheet-open');
    expect(opts.returnFocus).toBe(btn);
    const data = await opts.load();
    expect(data.chip.name).toBe('Lenz');
    expect(data.sections[0].items).toHaveLength(2);
    click(btn);
    expect(closeProfileSheet).toHaveBeenCalled();
  });

  it('update mit neuer Route schließt, unmount räumt auf', async () => {
    click(btn);
    await flush();
    feature.update({ path: '/home', hash: '#/home' });
    expect(pop.open).toBe(true);
    feature.update({ path: '/list', hash: '#/list' });
    expect(pop.open).toBe(false);

    click(btn);
    await flush();
    feature.unmount();
    expect(pop.open).toBe(false);
    expect(document.documentElement.classList.contains('lfx-flix-profile-open')).toBe(false);
    const e = click(btn);
    expect(e.defaultPrevented).toBe(false);
    feature.mount({ path: '/home', hash: '#/home' });
  });

  it('Knopf während des Ladens ersetzt: nichts öffnet, der nächste Klick öffnet wieder', async () => {
    let release;
    profileEntries.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    click(btn);
    await flush();
    const fresh = btn.cloneNode(true);
    btn.replaceWith(fresh);
    release([]);
    await flush();
    expect(openPopover).not.toHaveBeenCalled();
    click(fresh);
    await flush();
    expect(openPopover).toHaveBeenCalledTimes(1);
    expect(openPopover.mock.calls[0][0]).toBe(fresh);
  });

  it('Klick bestätigt laufendes Hover-Öffnen: keine Schonfrist, Wegfahren bricht nicht ab', async () => {
    let release;
    profileEntries.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    ptr('pointerover', btn);
    await flush();
    click(btn); // bestätigt, solange noch geladen wird
    ptr('pointerout', btn, { related: document.body });
    release([]);
    await flush();
    expect(pop.open).toBe(true);
    vi.advanceTimersByTime(100);
    click(btn); // innerhalb von 800 ms, aber nicht per Hover geöffnet → schließt
    expect(pop.open).toBe(false);
  });

  it('Wegfahren während reinem Hover-Laden verwirft das Öffnen', async () => {
    let release;
    profileEntries.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    ptr('pointerover', btn);
    await flush();
    ptr('pointerout', btn, { related: document.body });
    release([]);
    await flush();
    expect(openPopover).not.toHaveBeenCalled();
  });

  it('veraltete asynchrone Antwort öffnet nichts', async () => {
    let release;
    profileEntries.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    click(btn);
    await flush();
    feature.unmount();
    release([]);
    await flush();
    expect(openPopover).not.toHaveBeenCalled();
    feature.mount({ path: '/home', hash: '#/home' });
  });
});

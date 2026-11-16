// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ isReady: () => true, getUserId: () => 'u1' }));
vi.mock('../src/js/core/theme.js', () => ({
  isTheme: vi.fn((id) => id === 'plus'),
  getTheme: () => 'plus',
  brandName: () => 'LENZ+',
}));
vi.mock('../src/js/shared/libraries.js', () => ({ getLibraries: vi.fn(async () => []) }));
vi.mock('../src/js/shared/profile.js', () => ({
  profileEntries: vi.fn(async () => [{ key: 'logout', label: 'Abmelden', onClick: vi.fn() }]),
  getUserChip: vi.fn(async () => ({ name: 'Lorenz', imageUrl: null })),
}));

import header from '../src/js/features/plus/header.js';
import { parseHash } from '../src/js/core/router.js';
import { closePopover } from '../src/js/core/popover.js';

describe('plus-header: angeheftetes Profilmenü', () => {
  beforeEach(() => { document.body.innerHTML = '<header class="MuiAppBar-root"></header>'; });
  afterEach(() => { header.unmount(); closePopover(); vi.useRealTimers(); document.documentElement.className = ''; });

  it('nach Klick + Escape schließt ein neu per Hover geöffnetes Menü beim Verlassen', async () => {
    header.mount(parseHash('#/home'));
    await new Promise((r) => setTimeout(r, 0));
    const chip = document.querySelector('.lfx-plus-header__chip');
    chip.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.getElementById('lfx-popover')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.getElementById('lfx-popover')).toBeNull();
    vi.useFakeTimers();
    chip.dispatchEvent(new MouseEvent('mouseenter'));
    await vi.advanceTimersByTimeAsync(200);
    expect(document.getElementById('lfx-popover')).not.toBeNull();
    chip.dispatchEvent(new MouseEvent('mouseleave'));
    await vi.advanceTimersByTimeAsync(400);
    expect(document.getElementById('lfx-popover')).toBeNull();
  });
});

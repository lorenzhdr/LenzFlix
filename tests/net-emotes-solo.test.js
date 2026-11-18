// @vitest-environment jsdom
// 1.18.0: Emote-Rad ohne Mehrspieler (createLocalEmotes). Das Rad schliesst zuerst (Modus 'overlay' -> 'play'), dann spielt die Wahl;
// vorher war usable() im Overlay falsch, das Emote verpuffte.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createLocalEmotes } from '../src/js/store3d/net/emote-ui.js';

function fakeCtx() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const st = { mode: 'play', overlay: null, actions: new Map() };
  const sv = { playAnim: vi.fn() };
  const ctx = {
    isTouch: false,
    playing: () => st.mode === 'play',
    xr: { presenting: () => false, toast: vi.fn() },
    use: (n) => (n === 'selfview' ? sv : null),
    overlay: {
      open: vi.fn((el, op) => { host.appendChild(el); st.overlay = { el, onClose: op.onClose }; st.mode = 'overlay'; }),
      close: vi.fn(() => { const s = st.overlay; if (!s) return; st.overlay = null; s.el.remove(); if (s.onClose) s.onClose(); st.mode = 'play'; }),
      isOpen: () => !!st.overlay,
    },
    input: { onAction: vi.fn((n, fn) => { st.actions.set(n, fn); return () => st.actions.delete(n); }) },
  };
  return { ctx, st, sv };
}

describe('Emote-Rad solo', () => {
  afterEach(() => { document.body.innerHTML = ''; });
  it('T oeffnet, Tanzen waehlen: Rad zu, selfview.playAnim(dance) und Ereignis player-emote', () => {
    const { ctx, st, sv } = fakeCtx();
    const le = createLocalEmotes(ctx);
    const heard = [];
    le.onPlayerEmote((e) => heard.push(e));
    expect(st.actions.get('emote')()).toBe(true);
    expect(st.mode).toBe('overlay');
    document.querySelector('[data-emote="dance"]').click();
    expect(st.overlay).toBeNull();
    expect(sv.playAnim).toHaveBeenCalledWith('dance');
    expect(heard).toHaveLength(1);
    expect(heard[0]).toMatchObject({ name: 'dance', anim: 'dance' });
    le.dispose();
  });
  it('Ziffer 5 im offenen Rad wirkt ebenfalls', () => {
    const { ctx, st, sv } = fakeCtx();
    const le = createLocalEmotes(ctx);
    le.open();
    document.querySelector('.lfx-mp-emotes').dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit5', bubbles: true, cancelable: true }));
    expect(st.overlay).toBeNull();
    expect(sv.playAnim).toHaveBeenCalledWith('dance');
    le.dispose();
  });
});

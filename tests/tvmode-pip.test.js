// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPip, BG_ID } from '../src/js/live/tvmode/pip.js';

let video;
let slot;
let pipEl;

function setup() {
  video = document.createElement('video');
  slot = document.createElement('div');
  document.body.append(slot);
  slot.append(video);
  const onChange = vi.fn();
  Object.defineProperty(document, 'pictureInPictureElement', { configurable: true, get: () => pipEl });
  const pip = createPip({ doc: document, video, getSlot: () => slot, onChange });
  return { pip, onChange };
}

beforeEach(() => { pipEl = null; document.body.innerHTML = ''; });
afterEach(() => { delete document.pictureInPictureElement; delete document.exitPictureInPicture; });

describe('pip: Chrome-Pfad', () => {
  it('supported nur mit requestPictureInPicture und ohne disablePictureInPicture', () => {
    const { pip } = setup();
    expect(pip.supported()).toBe(false);
    video.requestPictureInPicture = vi.fn();
    expect(pip.supported()).toBe(true);
    video.disablePictureInPicture = true;
    expect(pip.supported()).toBe(false);
  });

  it('Eintritt hängt sofort in #lfx-tvm-bg, Austritt zurück in den Slot', async () => {
    const { pip, onChange } = setup();
    video.requestPictureInPicture = vi.fn(async () => { pipEl = video; video.dispatchEvent(new Event('enterpictureinpicture')); });
    document.exitPictureInPicture = vi.fn(async () => { pipEl = null; video.dispatchEvent(new Event('leavepictureinpicture')); });
    expect(await pip.toggle()).toBe(true);
    const bg = document.getElementById(BG_ID);
    expect(bg.contains(video)).toBe(true);
    expect(bg.style.width).toBe('1px');
    expect(bg.style.opacity).toBe('0');
    expect(bg.style.display).not.toBe('none');
    expect(onChange).toHaveBeenLastCalledWith(true, { restored: false });
    await pip.toggle();
    expect(slot.contains(video)).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith(false, { restored: true });
    expect(pip.active()).toBe(false);
  });

  it('Austritt ohne verbundenen Slot: restored false, Video bleibt im Halter', () => {
    const { pip, onChange } = setup();
    video.requestPictureInPicture = vi.fn();
    pipEl = video;
    video.dispatchEvent(new Event('enterpictureinpicture'));
    slot.remove();
    pipEl = null;
    video.dispatchEvent(new Event('leavepictureinpicture'));
    expect(onChange).toHaveBeenLastCalledWith(false, { restored: false });
    expect(document.getElementById(BG_ID).contains(video)).toBe(true);
    pip.dispose();
  });

  it('enter schluckt Fehler und gibt false zurück', async () => {
    const { pip } = setup();
    video.requestPictureInPicture = vi.fn(async () => { throw new Error('nein'); });
    expect(await pip.enter()).toBe(false);
  });

  it('dispose entfernt den Halter und die Listener', () => {
    const { pip, onChange } = setup();
    video.requestPictureInPicture = vi.fn();
    pipEl = video;
    video.dispatchEvent(new Event('enterpictureinpicture'));
    expect(document.getElementById(BG_ID)).not.toBeNull();
    document.exitPictureInPicture = vi.fn(async () => {});
    pip.dispose();
    expect(document.getElementById(BG_ID)).toBeNull();
    expect(document.exitPictureInPicture).toHaveBeenCalled();
    onChange.mockClear();
    video.dispatchEvent(new Event('leavepictureinpicture'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('hold hängt nur bei aktivem PiP um', () => {
    const { pip } = setup();
    video.requestPictureInPicture = vi.fn();
    pip.hold();
    expect(document.getElementById(BG_ID)).toBeNull();
    pipEl = video;
    pip.hold();
    expect(document.getElementById(BG_ID).contains(video)).toBe(true);
  });
});

describe('pip: Safari-Pfad', () => {
  it('webkitSetPresentationMode und webkitpresentationmodechanged', async () => {
    const { pip, onChange } = setup();
    video.webkitPresentationMode = 'inline';
    video.webkitSupportsPresentationMode = vi.fn(() => true);
    video.webkitSetPresentationMode = vi.fn((m) => { video.webkitPresentationMode = m; video.dispatchEvent(new Event('webkitpresentationmodechanged')); });
    expect(pip.supported()).toBe(true);
    await pip.enter();
    expect(video.webkitSetPresentationMode).toHaveBeenCalledWith('picture-in-picture');
    expect(document.getElementById(BG_ID).contains(video)).toBe(true);
    expect(pip.active()).toBe(true);
    await pip.exit();
    expect(video.webkitSetPresentationMode).toHaveBeenLastCalledWith('inline');
    expect(slot.contains(video)).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('Vollbild-Moduswechsel löst kein onChange aus', () => {
    const { onChange } = setup();
    video.webkitPresentationMode = 'fullscreen';
    video.dispatchEvent(new Event('webkitpresentationmodechanged'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('nicht unterstützt, wenn webkitSupportsPresentationMode false liefert', () => {
    const { pip } = setup();
    video.webkitSetPresentationMode = vi.fn();
    video.webkitSupportsPresentationMode = () => false;
    expect(pip.supported()).toBe(false);
  });
});

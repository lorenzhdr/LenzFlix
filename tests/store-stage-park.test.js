// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { parkStage, unparkStage } from '../src/js/features/store/stage-park.js';

afterEach(() => { unparkStage(); document.body.innerHTML = ''; });

describe('stage-park', () => {
  it('parkStage(stage) (VR): 1x1 px, unsichtbar, ohne Klicks, hinter allem', () => {
    const stage = document.createElement('div');
    parkStage(stage);
    const box = document.getElementById('lfx-store-park');
    expect(box.contains(stage)).toBe(true);
    const s = box.getAttribute('style');
    expect(s).toContain('width:1px');
    expect(s).toContain('opacity:0');
    expect(s).toContain('pointer-events:none');
    expect(s).toContain('z-index:-1');
    expect(s).toContain('overflow:hidden');
  });

  it('parkStage(stage, { visible: true }) clippt nicht und bildet keinen Stapelkontext', () => {
    const stage = document.createElement('div');
    parkStage(stage, { visible: true });
    const box = document.getElementById('lfx-store-park');
    expect(box.contains(stage)).toBe(true);
    const s = box.getAttribute('style');
    expect(s).not.toContain('opacity');
    expect(s).not.toContain('z-index');
    expect(s).not.toContain('pointer-events');
    expect(s).not.toContain('overflow:hidden');
    expect(s).not.toContain('position');
    expect(s).not.toContain('width:1px');
  });

  it('unparkStage gibt die Bühne zurück und entfernt den Container; zweimal parken ersetzt', () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    parkStage(a);
    parkStage(b, { visible: true });
    expect(document.querySelectorAll('#lfx-store-park')).toHaveLength(1);
    expect(unparkStage()).toBe(b);
    expect(document.getElementById('lfx-store-park')).toBeNull();
    expect(unparkStage()).toBeNull();
  });
});

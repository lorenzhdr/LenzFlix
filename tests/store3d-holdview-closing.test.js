// @vitest-environment jsdom
// Hülle in der Hand: Während des Ausblendens (.is-closing) nehmen die Knöpfe keine Klicks mehr an.
import { describe, it, expect, vi } from 'vitest';
import { Group } from 'three';
import { HoldView } from '../src/js/store3d/ui/holdview.js';

const ctxStub = new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : () => ({ width: 10, addColorStop() {} })),
  set: (t, k, v) => { t[k] = v; return true; },
});
HTMLCanvasElement.prototype.getContext = () => ctxStub;

describe('Hüllen-Panel beim Ausblenden', () => {
  it('Klick auf Abspielen während .is-closing ruft play nicht auf', () => {
    document.body.innerHTML = '';
    const item = { Id: 'm', Name: 'Film', Type: 'Movie', RunTimeTicks: 6e10 };
    const play = vi.fn(async () => {});
    const camera = new Group();
    camera.aspect = 1.6;
    const deps = { imageUrl: () => '', getItem: async () => null, toast() {}, setFavorite: async () => {}, setPlayed: async () => {}, play, getSeasons: async () => [], getEpisodes: async () => [] };
    const hv = new HoldView({ host: document.body, camera, deps, items: new Map([[item.Id, item]]), shelves: { setHidden() {}, faceViews: [] }, notify() {}, onClosed() {} });
    hv.open(item.Id, null, true);
    hv.dom.root.classList.add('is-closing');
    hv.dom.btns.play.click();
    expect(play).not.toHaveBeenCalled();
    hv.dom.root.classList.remove('is-closing');
    hv.dom.btns.play.click();
    expect(play).toHaveBeenCalledTimes(1);
    hv.dispose(true);
  });
});

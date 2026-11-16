// @vitest-environment jsdom
// VIDEOTHEK LENZ (Audit 1.14.0, Welle 3): Hüllen-Panel (A123/A124/A127/A129/A130/L044), leerer Katalog (B060), Anisotropie (B064).
import { describe, it, expect } from 'vitest';
import { Group } from 'three';
import { HoldView } from '../src/js/store3d/ui/holdview.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import { buildShelves } from '../src/js/store3d/world/build-shelves.js';
import { makeTextures } from '../src/js/store3d/world/textures.js';

const draws = [];
const ctxStub = new Proxy({}, {
  get: (t, k) => (k === 'fillText' ? (s) => { draws.push(String(s)); } : k in t ? t[k] : () => ({ width: 10, addColorStop() {} })),
  set: (t, k, v) => { t[k] = v; return true; },
});
HTMLCanvasElement.prototype.getContext = () => ctxStub;

function mk(item, deps = {}) {
  const camera = new Group();
  camera.aspect = 1.6;
  const d = { imageUrl: () => '', getItem: async () => null, toast() {}, setFavorite: async () => {}, setPlayed: async () => {}, play: async () => {}, getSeasons: async () => [], getEpisodes: async () => [], ...deps };
  const hv = new HoldView({ host: document.body, camera, deps: d, items: new Map([[item.Id, item]]), shelves: { setHidden() {}, faceViews: [] }, notify() {}, onClosed() {} });
  hv.open(item.Id, null, true);
  return hv;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('Hüllen-Panel', () => {
  it('A123: 1 Staffel im Singular', () => {
    draws.length = 0;
    mk({ Id: 's', Name: 'Serie', Type: 'Series', ChildCount: 1 }).dispose(true);
    expect(draws.some((l) => /\b1 Staffel$/.test(l))).toBe(true);
    draws.length = 0;
    mk({ Id: 's', Name: 'Serie', Type: 'Series', ChildCount: 3 }).dispose(true);
    expect(draws.some((l) => l.includes('3 Staffeln'))).toBe(true);
  });

  it('A130: Dialogrolle, Fokus auf erstem Knopf, Fokus zurück', () => {
    document.body.innerHTML = '<button id="prev">x</button>';
    document.getElementById('prev').focus();
    const hv = mk({ Id: 'm', Name: 'Film', Type: 'Movie', RunTimeTicks: 6e10 });
    const panel = document.querySelector('.lfx-store-hold-panel');
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-label')).toBe('Film');
    expect(document.activeElement.textContent).toBe('Abspielen');
    hv.dispose(true);
    expect(document.activeElement.id).toBe('prev');
  });

  it('L044/A124: Merken/Gesehen mit aria-pressed', async () => {
    document.body.innerHTML = '';
    const hv = mk({ Id: 'm', Name: 'Film', Type: 'Movie', RunTimeTicks: 6e10 });
    const fav = hv.dom.btns.fav;
    expect(fav.getAttribute('aria-pressed')).toBe('false');
    fav.click();
    await tick();
    expect(fav.getAttribute('aria-pressed')).toBe('true');
    expect(hv.dom.btns.seen.getAttribute('aria-pressed')).toBe('false');
    hv.dispose(true);
  });

  it('A124/A127/A129: Staffel-Tabs mit aria-pressed, späte Antwort überschreibt nicht', async () => {
    document.body.innerHTML = '';
    const pending = {};
    const deps = {
      getSeasons: async () => [{ Id: 'a', Name: 'S1' }, { Id: 'b', Name: 'S2' }],
      getEpisodes: (id, sid) => new Promise((res) => { pending[sid] = res; }),
    };
    const hv = mk({ Id: 'sr', Name: 'Serie', Type: 'Series', ChildCount: 2 }, deps);
    await tick();
    const tabs = [...document.querySelectorAll('.lfx-store-tab')];
    expect(tabs.length).toBe(2);
    // Staffel 1 ist vorgewählt (Anfrage offen), dann schnell Staffel 2
    tabs[1].click();
    expect(tabs[1].getAttribute('aria-pressed')).toBe('true');
    expect(tabs[0].getAttribute('aria-pressed')).toBe('false');
    pending.b([{ Id: 'e2', Name: 'Zwei', IndexNumber: 1, ParentIndexNumber: 2, Type: 'Episode' }]);
    await tick();
    pending.a([{ Id: 'e1', Name: 'Eins', IndexNumber: 1, ParentIndexNumber: 1, Type: 'Episode' }]);
    await tick();
    const names = [...document.querySelectorAll('.lfx-store-ep-name')].map((n) => n.textContent).join('|');
    expect(names).toContain('Zwei');
    expect(names).not.toContain('Eins');
    hv.dispose(true);
  });
});

describe('Welt', () => {
  it('B060: buildShelves mit leerem Katalog wirft nicht', () => {
    const layout = buildLayout([]);
    let shelves;
    expect(() => { shelves = buildShelves(layout, new Map(), null, null); }).not.toThrow();
    expect(shelves.frameMesh).toBeTruthy();
  });

  it('B064: setAnisotropy markiert geänderte Texturen zum Neu-Hochladen', () => {
    const t = makeTextures({ anisotropy: 4 });
    const v0 = t.carpet.version;
    t.setAnisotropy(4);
    expect(t.carpet.version).toBe(v0);
    t.setAnisotropy(8);
    expect(t.carpet.anisotropy).toBe(8);
    expect(t.carpet.version).toBeGreaterThan(v0);
    t.dispose();
  });
});

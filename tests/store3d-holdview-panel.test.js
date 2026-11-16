// @vitest-environment jsdom
// Hüllen-Panel: Staffel-Singular, Dialogrolle, aria-pressed, Staffel-Tabs.
import { describe, it, expect } from 'vitest';
import { Group } from 'three';
import { HoldView } from '../src/js/store3d/ui/holdview.js';

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
  it('1 Staffel im Singular', () => {
    draws.length = 0;
    mk({ Id: 's', Name: 'Serie', Type: 'Series', ChildCount: 1 }).dispose(true);
    expect(draws.some((l) => /\b1 Staffel$/.test(l))).toBe(true);
    draws.length = 0;
    mk({ Id: 's', Name: 'Serie', Type: 'Series', ChildCount: 3 }).dispose(true);
    expect(draws.some((l) => l.includes('3 Staffeln'))).toBe(true);
  });

  it('Dialogrolle, Fokus auf dem Panel (nicht auf „Abspielen“), Fokus zurück', () => {
    document.body.innerHTML = '<button id="prev">x</button>';
    document.getElementById('prev').focus();
    const hv = mk({ Id: 'm', Name: 'Film', Type: 'Movie', RunTimeTicks: 6e10 });
    const panel = document.querySelector('.lfx-store-hold-panel');
    expect(panel.getAttribute('role')).toBe('dialog');
    expect(panel.getAttribute('aria-label')).toBe('Film');
    expect(document.activeElement).toBe(panel);
    hv.dispose(true);
    expect(document.activeElement.id).toBe('prev');
  });

  it('Merken/Gesehen mit aria-pressed', async () => {
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

  it('Staffel-Tabs mit aria-pressed, späte Antwort überschreibt nicht', async () => {
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


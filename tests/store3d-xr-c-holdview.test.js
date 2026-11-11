// @vitest-environment jsdom
// Paket M2-C: HoldView in VR (reine Spec-/Seriendaten-Funktionen, Ankerwahl, Panel-Wechsel).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Object3D, Group } from 'three';

vi.mock('../src/js/store3d/world/textures.js', () => {
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
  return { FONT: 'x', makeCanvas: (w, h) => ({ width: w, height: h, getContext: () => ctx }) };
});
vi.mock('../src/js/store3d/covers/loader.js', () => ({ loadBitmap: async () => null, closeBitmap() {} }));

const { HoldView, buildVrSpec, seriesModel, episodeRow, nextEpisode, firstOpenSeason, itemFlags, metaLine } = await import('../src/js/store3d/ui/holdview.js');


const act = (log = []) => ({
  play: (i, r) => log.push(['play', i.Id, r]),
  toggle: (k) => log.push(['toggle', k]),
  flip: () => log.push(['flip']),
  back: () => log.push(['back']),
  season: (i) => log.push(['season', i]),
  episode: (e, r) => log.push(['episode', e.Id, r]),
});

describe('buildVrSpec', () => {
  const film = { Id: 'f1', Name: 'Film', Type: 'Movie', ProductionYear: 1999, OfficialRating: 'FSK-12', RunTimeTicks: 5400 * 10000000, CommunityRating: 7.46, Overview: 'Ein Text.' };

  it('Film ohne Fortschritt: Abspielen, kein Weiterschauen, Meta und Text', () => {
    const s = buildVrSpec(film, { series: null }, act());
    expect(s.title).toBe('Film');
    expect(s.lines).toEqual(['1999 · FSK 12 · 1 Std. 30 Min. · ★ 7,5']);
    expect(s.text).toBe('Ein Text.');
    expect(s.buttons.map((b) => b.label)).toEqual(['Abspielen', 'Merken', 'Gesehen', 'Umdrehen', 'Zurückstellen']);
    expect(s.buttons[0].primary).toBe(true);
    expect(s.tabs).toBeUndefined();
    expect(s.list).toBeUndefined();
  });

  it('Film mit Fortschritt: Weiterschauen vorhanden und ruft resume=true', () => {
    const log = [];
    const it2 = { ...film, UserData: { PlaybackPositionTicks: 100 } };
    const s = buildVrSpec(it2, { series: null }, act(log));
    expect(s.buttons.map((b) => b.label)).toEqual(['Abspielen', 'Weiterschauen', 'Merken', 'Gesehen', 'Umdrehen', 'Zurückstellen']);
    s.buttons[1].onSelect();
    s.buttons[0].onSelect();
    expect(log).toEqual([['play', 'f1', true], ['play', 'f1', false]]);
  });

  it('lfx.progress zählt als Fortschritt', () => {
    expect(itemFlags({ ...film, lfx: { progress: 0.4 } }).resumable).toBe(true);
  });

  it('Merken/Gesehen zeigen den on-Zustand', () => {
    const s = buildVrSpec({ ...film, UserData: { IsFavorite: true, Played: true } }, { series: null }, act());
    const fav = s.buttons.find((b) => b.label === 'Gemerkt ✓');
    const seen = s.buttons.find((b) => b.label === 'Gesehen ✓');
    expect(fav.on).toBe(true);
    expect(seen.on).toBe(true);
    const off = buildVrSpec(film, { series: null }, act());
    expect(off.buttons.find((b) => b.label === 'Merken').on).toBe(false);
  });

  it('Overview wird gekürzt', () => {
    const s = buildVrSpec({ ...film, Overview: 'wort '.repeat(200) }, { series: null }, act());
    expect(s.text.length).toBeLessThan(240);
    expect(s.text.endsWith('…')).toBe(true);
  });

  it('Serie: kein Abspielen, Tabs und Folgenliste', () => {
    const log = [];
    const series = { Id: 's1', Name: 'Serie', Type: 'Series' };
    const seasons = [{ Id: 'a', Name: 'Staffel 1' }, { Id: 'b' }];
    const eps = [
      { Id: 'e1', Name: 'Pilot', IndexNumber: 1, RunTimeTicks: 25 * 600000000, UserData: { Played: true } },
      { Id: 'e2', Name: 'Zwei', IndexNumber: 2, UserData: { PlaybackPositionTicks: 5 } },
    ];
    const s = buildVrSpec(series, { series: { seasons, sel: 1, eps, status: 'ready' } }, act(log));
    expect(s.buttons.map((b) => b.label)).toEqual(['Merken', 'Gesehen', 'Umdrehen', 'Zurückstellen']);
    expect(s.tabs.map((t) => [t.label, t.on])).toEqual([['Staffel 1', false], ['Staffel 2', true]]);
    expect(s.list.rows[0]).toMatchObject({ label: '1. Pilot', sub: '25 Min. · gesehen' });
    expect(s.list.rows[1]).toMatchObject({ label: '2. Zwei', sub: 'weiter' });
    s.list.rows[1].onSelect();
    s.tabs[0].onSelect();
    expect(log).toEqual([['episode', 'e2', true], ['season', 0]]);
  });

  it('Serie beim Laden: Platzhalterzeile', () => {
    const s = buildVrSpec({ Id: 's', Name: 'S', Type: 'Series' }, { series: { seasons: [{ Id: 'a' }], sel: 0, eps: [], status: 'loading' } }, act());
    expect(s.list.rows).toEqual([{ label: 'Lade Folgen …' }]);
  });
});

describe('seriesModel', () => {
  it('Tabs, Zeilen, nächste Folge, erste offene Staffel', () => {
    const seasons = [{ Id: 'a', Name: 'A', UserData: { Played: true } }, { Id: 'b' }];
    const eps = [{ Id: '1', Name: 'x', UserData: { Played: true } }, { Id: '2', Name: 'y', IndexNumber: 2 }];
    const m = seriesModel(seasons, eps, 0);
    expect(m.tabs).toEqual([{ id: 'a', label: 'A', on: true }, { id: 'b', label: 'Staffel 2', on: false }]);
    expect(m.rows.map((r) => r.name)).toEqual(['x', '2. y']);
    expect(m.rows[0].tag).toBe('✓');
    expect(m.next.Id).toBe('2');
    expect(m.firstOpen).toBe(1);
  });

  it('Randfälle', () => {
    expect(seriesModel(null, null).rows).toEqual([]);
    expect(nextEpisode([])).toBe(null);
    expect(nextEpisode([{ Id: 'a', UserData: { Played: true } }]).Id).toBe('a');
    expect(firstOpenSeason([{ UserData: { Played: true } }])).toBe(0);
    expect(episodeRow({ Name: '', UserData: { PlaybackPositionTicks: 9 } })).toMatchObject({ name: 'Folge', tag: '▶ weiter', resume: true });
    expect(metaLine({})).toBe('');
  });
});

describe('HoldView Ankerwahl und Panel', () => {
  let camera;
  let panels;

  const mk = () => {
    const host = document.createElement('div');
    const items = new Map([['m1', { Id: 'm1', Name: 'Film', Type: 'Movie', lfx: { media: 'dvd' } }]]);
    const closed = vi.fn();
    const hv = new HoldView({
      host, camera, items, layout: null, covers: null, shelves: { setHidden() {}, faceViews: [] },
      deps: { imageUrl: () => '', getItem: async () => null, toast() {}, play: async () => {}, getSeasons: async () => [], getEpisodes: async () => [] },
      notify() {}, onClosed: closed,
      openPanel: (spec) => { const h = { spec, mesh: new Object3D(), update: vi.fn((s) => { h.spec = s; }), close: vi.fn() }; panels.push(h); return h; },
    });
    return { hv, host, closed };
  };
  beforeEach(() => { camera = new Group(); camera.aspect = 1.6; panels = []; });

  it('2D: Kamera ist Anker, DOM-Panel, depthTest aus', () => {
    const { hv, host } = mk();
    hv.open('m1', null, true);
    expect(hv.anchor).toBe(camera);
    expect(camera.children).toContain(hv.group);
    expect(host.querySelector('.lfx-store-hold')).toBeTruthy();
    expect(panels.length).toBe(0);
    expect(hv.mesh.material[4].depthTest).toBe(false);
    expect(hv.mesh.renderOrder).toBe(999);
    hv.dispose(true);
  });

  it('XR: Grip-Anker, VR-Panel an Hüllen-Gruppe, depthTest an, Position in der Hand', () => {
    const { hv, host } = mk();
    const grip = new Object3D();
    hv.open('m1', null, true, { xr: true, anchor: grip, hand: 'right' });
    expect(hv.anchor).toBe(grip);
    expect(grip.children).toContain(hv.group);
    expect(host.querySelector('.lfx-store-hold')).toBeNull();
    expect(panels.length).toBe(1);
    const a = panels[0].spec.anchor;
    expect(a.head).toBe(true);
    expect(a.offset.x).toBeLessThan(0);
    expect(a.offset.z).toBeCloseTo(0.65);
    expect(a.follow).toBe(true);
    expect(panels[0].spec.width).toBeCloseTo(0.55);
    expect(hv.mesh.material[4].depthTest).toBe(true);
    hv.update(0.016);
    expect(hv.group.position.z).toBeCloseTo(-0.09);
    expect(hv.group.position.y).toBeCloseTo(0.03);
    expect(hv.group.scale.x).toBeCloseTo(1.2);
    hv.dispose(true);
    expect(panels[0].close).toHaveBeenCalled();
  });

  it('linke Hand: Panel-Versatz zur rechten Seite', () => {
    const { hv } = mk();
    hv.open('m1', null, true, { xr: true, anchor: new Object3D(), hand: 'left' });
    expect(panels[0].spec.anchor.offset.x).toBeGreaterThan(0);
    hv.dispose(true);
  });

  it('Panel onClose = Zurückstellen (schließt)', () => {
    const { hv, closed } = mk();
    hv.open('m1', null, true, { xr: true, anchor: new Object3D() });
    panels[0].spec.onClose();
    expect(hv.state).toBe('idle');
    expect(closed).toHaveBeenCalled();
    expect(panels[0].close).toHaveBeenCalled();
  });

  it('reanchor: 2D -> XR -> 2D wechselt Panel-Art und Anker ohne Flug', () => {
    const { hv, host } = mk();
    hv.open('m1', null, true);
    const grip = new Object3D();
    hv.reanchor(grip, { xr: true, hand: 'right' });
    expect(grip.children).toContain(hv.group);
    expect(camera.children).not.toContain(hv.group);
    expect(host.querySelector('.lfx-store-hold')).toBeNull();
    expect(panels.length).toBe(1);
    expect(hv.mesh.material[4].depthTest).toBe(true);
    hv.reanchor(camera, { xr: false });
    expect(camera.children).toContain(hv.group);
    expect(host.querySelector('.lfx-store-hold')).toBeTruthy();
    expect(panels[0].close).toHaveBeenCalled();
    expect(hv.mesh.material[4].depthTest).toBe(false);
    expect(hv.mesh.renderOrder).toBe(999);
    expect(hv.state).toBe('held');
    hv.dispose(true);
  });

  it('XR ohne Grip-Objekt (Kamera als Anker): 2D-Ziel, VR-Panel', () => {
    const { hv } = mk();
    hv.open('m1', null, true, { xr: true, anchor: null });
    expect(hv.anchor).toBe(camera);
    expect(hv.gripMode()).toBe(false);
    hv.dispose(true);
  });

  it('setVisible blendet Gruppe und Panel aus', () => {
    const { hv } = mk();
    hv.open('m1', null, true, { xr: true, anchor: new Object3D() });
    hv.setVisible(false);
    expect(hv.group.visible).toBe(false);
    expect(panels[0].mesh.visible).toBe(false);
    hv.setVisible(true);
    expect(hv.group.visible).toBe(true);
    hv.dispose(true);
  });

  it('grab: kürzerer Flug', () => {
    const { hv } = mk();
    hv.open('m1', null, false, { xr: true, anchor: new Object3D(), grab: true });
    expect(hv.dur).toBeLessThan(0.4);
    hv.dispose(true);
  });
});



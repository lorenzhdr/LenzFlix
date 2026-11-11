// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCinemaBridge } from '../src/js/features/store/cinema-bridge.js';

let video;
let vs; // Video-Eigenschaften
let bridge;
let clicks;
let sel; // gewählte Spuren
let sheetState; // 'push' = Sheet legt History-Eintrag an
let backSpy;

const btn = (cls, parent) => {
  const b = document.createElement('button');
  b.className = cls;
  b.addEventListener('click', () => clicks.push(cls));
  parent.appendChild(b);
  return b;
};

function openSheet(kind) {
  const list = kind === 'audio'
    ? [['1', 'Deutsch'], ['2', 'Englisch']]
    : [['-1', 'Aus'], ['3', 'Deutsch'], ['secondarysubtitle', 'Zweiter']];
  const box = document.createElement('div');
  box.className = 'dialogContainer';
  const dlg = document.createElement('div');
  dlg.className = 'dialog actionSheet opened';
  for (const [id, label] of list) {
    const it = document.createElement('button');
    it.className = 'actionSheetMenuItem';
    it.setAttribute('data-id', id);
    it.innerHTML = `<span class="actionsheetMenuItemIcon" style="visibility:${sel[kind] === id ? 'visible' : 'hidden'}"></span><span class="actionSheetItemText">${label}</span>`;
    it.addEventListener('click', () => {
      box.remove();
      clicks.push(`${kind}:${id}`);
      sel[kind] = id;
      if (kind === 'audio') {
        vs.readyState = 0;
        sel.subtitle = '-1'; // Jellyfin schaltet die Untertitel ab
        setTimeout(() => { vs.readyState = 4; }, 3000);
      }
    });
    dlg.appendChild(it);
  }
  box.appendChild(dlg);
  document.body.appendChild(box);
  if (sheetState === 'push') window.history.replaceState({ usr: { dialogs: ['dlg1'] } }, '');
}

function setup() {
  document.body.innerHTML = '';
  document.title = 'Testfilm (2020)';
  window.location.hash = '#/video';
  window.history.replaceState({}, '');
  clicks = [];
  sel = { audio: '1', subtitle: '3' };
  sheetState = 'push';
  vs = { readyState: 4, currentTime: 12, duration: 6000, paused: false, ended: false };
  video = document.createElement('video');
  video.className = 'htmlvideoplayer';
  for (const k of Object.keys(vs)) Object.defineProperty(video, k, { get: () => vs[k], set: (v) => { vs[k] = v; }, configurable: true });
  document.body.appendChild(video);
  const osd = document.createElement('div');
  osd.id = 'videoOsdPage';
  document.body.appendChild(osd);
  for (const c of ['btnPause', 'btnRewind', 'btnFastForward', 'btnPreviousTrack', 'btnNextTrack', 'buttonMute', 'btnStartNow', 'btnHide']) btn(c, osd);
  osd.querySelector('.btnPreviousTrack').classList.add('hide');
  const a = btn('btnAudio', osd);
  a.addEventListener('click', () => openSheet('audio'));
  const s = btn('btnSubtitles', osd);
  s.addEventListener('click', () => openSheet('subtitle'));
  for (const [c, v] of [['osdPositionSlider', '0'], ['osdVolumeSlider', '100']]) {
    const i = document.createElement('input');
    i.className = c;
    i.value = v;
    osd.appendChild(i);
  }
  const header = document.createElement('div');
  header.className = 'skinHeader';
  header.innerHTML = '<button class="headerBackButton"></button>';
  header.querySelector('button').addEventListener('click', () => {
    clicks.push('stop');
    video.remove();
    window.location.hash = '#/home';
  });
  document.body.appendChild(header);
  backSpy = vi.spyOn(window.history, 'back').mockImplementation(() => {
    clicks.push('back');
    document.querySelector('.dialogContainer')?.remove();
    window.history.replaceState({}, '');
  });
}

const tickMs = (ms) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
  setup();
  bridge = createCinemaBridge({ pollMs: 250 });
});
afterEach(() => {
  bridge.dispose();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Zustand und Ereignisse', () => {
  it('Phasen, Route, Titel, Lautstärke, Vor/Zurück', () => {
    let s = bridge.state();
    expect(s).toMatchObject({ route: 'video', phase: 'playing', time: 12, duration: 6000, title: 'Testfilm (2020)', hasPrev: false, hasNext: true, upNext: null, error: null, reloading: false });
    vs.paused = true;
    expect(bridge.state().phase).toBe('paused');
    vs.ended = true;
    expect(bridge.state().phase).toBe('ended');
    vs.ended = false;
    window.location.hash = '#/home?lfx=title&id=a';
    s = bridge.state();
    expect(s.route).toBe('home');
    window.location.hash = '#/details?id=1';
    expect(bridge.state().route).toBe('other');
  });

  it('loading ohne Video und bei readyState<2 am Anfang; reloading nach dem Spielen ist kein Fehler', () => {
    video.remove();
    expect(bridge.state().phase).toBe('loading');
    document.body.appendChild(video);
    vs.readyState = 1;
    expect(bridge.state().phase).toBe('loading');
    vs.readyState = 4;
    expect(bridge.state().phase).toBe('playing');
    vs.readyState = 0;
    document.body.insertAdjacentHTML('beforeend', '<div class="dialogContainer"><div class="dialog opened">Fehler</div></div>');
    const s = bridge.state();
    expect(s).toMatchObject({ phase: 'loading', reloading: true, error: null });
  });

  it('error: Dialog mit Text während loading', () => {
    video.remove();
    document.body.insertAdjacentHTML('beforeend', '<div class="dialogContainer"><div class="dialog opened"> Wiedergabefehler \n x </div></div>');
    expect(bridge.state()).toMatchObject({ phase: 'error', error: 'Wiedergabefehler x' });
  });

  it('actionSheet zählt nicht als Fehler; Up-Next mit Sekunden', () => {
    video.remove();
    document.body.insertAdjacentHTML('beforeend', '<div class="dialogContainer"><div class="dialog actionSheet">Ton</div></div>');
    expect(bridge.state().phase).toBe('loading');
    document.body.insertAdjacentHTML('beforeend', '<div class="upNextContainer hide">Nächste Folge beginnt in 9 Sekunden</div>');
    expect(bridge.state().upNext).toBeNull();
    document.querySelector('.upNextContainer').classList.remove('hide');
    expect(bridge.state().upNext).toEqual({ text: 'Nächste Folge beginnt in 9 Sekunden', seconds: 9 });
  });

  it('onVideo und onChange feuern per Polling; deaktivieren stoppt', async () => {
    const onVideo = vi.fn();
    const onChange = vi.fn();
    bridge.onVideo(onVideo);
    const off = bridge.onChange(onChange);
    bridge.activate(true);
    expect(onVideo).toHaveBeenLastCalledWith(video);
    expect(onChange).toHaveBeenCalledTimes(1);
    await tickMs(1000);
    expect(onChange).toHaveBeenCalledTimes(1);
    vs.paused = true;
    await tickMs(250);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1][0].phase).toBe('paused');
    video.remove();
    await tickMs(250);
    expect(onVideo).toHaveBeenLastCalledWith(null);
    off();
    window.location.hash = '#/home';
    await tickMs(250);
    expect(onChange).toHaveBeenCalledTimes(3);
    bridge.activate(false);
    document.body.appendChild(video);
    await tickMs(1000);
    expect(onVideo).toHaveBeenCalledTimes(2);
  });

  it('Zeile 7: Route verlässt #/video Richtung other -> #/home; Richtung home bleibt', async () => {
    bridge.activate(true);
    await tickMs(250);
    window.location.hash = '#/details?id=1';
    await tickMs(250);
    expect(window.location.hash).toBe('#/home');
    // ohne Aktivierung nichts
    bridge.activate(false);
    window.location.hash = '#/video';
    await tickMs(250);
    window.location.hash = '#/details?id=2';
    await tickMs(500);
    expect(window.location.hash).toBe('#/details?id=2');
    // nur wenn vorher auf #/video
    bridge.activate(true);
    window.location.hash = '#/queue';
    await tickMs(500);
    expect(window.location.hash).toBe('#/queue');
  });
});

describe('Proxy', () => {
  it('Klicks auf die OSD-Knöpfe', () => {
    bridge.togglePause();
    bridge.seekBy(-10);
    bridge.seekBy(30);
    bridge.next();
    bridge.prev();
    bridge.toggleMute();
    bridge.upNext('start');
    bridge.upNext('hide');
    expect(clicks).toEqual(['btnPause', 'btnRewind', 'btnFastForward', 'btnNextTrack', 'btnPreviousTrack', 'buttonMute', 'btnStartNow', 'btnHide']);
  });

  it('seekTo setzt den Slider in Prozent und feuert change; seekBy sonst relativ', () => {
    const slider = document.querySelector('input.osdPositionSlider');
    const onChange = vi.fn();
    slider.addEventListener('change', onChange);
    bridge.seekTo(1500);
    expect(Number(slider.value)).toBeCloseTo(25);
    expect(onChange).toHaveBeenCalledTimes(1);
    bridge.seekBy(60); // 12 + 60 = 72 s
    expect(Number(slider.value)).toBeCloseTo(1.2);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('setVolume: Slider mit input und change; Fallback video.volume', () => {
    const slider = document.querySelector('input.osdVolumeSlider');
    const ev = [];
    slider.addEventListener('input', () => ev.push('input'));
    slider.addEventListener('change', () => ev.push('change'));
    bridge.setVolume(0.4);
    expect(slider.value).toBe('40');
    expect(ev).toEqual(['input', 'change']);
    slider.remove();
    vs.volume = 1;
    video.volume = 1;
    bridge.setVolume(0.5);
    expect(video.volume).toBeCloseTo(0.125, 10);
  });

  it('Lautstärke kubisch: Pegel = Kubikwurzel, Lauter/Leiser driften nicht, Stumm wird aufgehoben', () => {
    const slider = document.querySelector('input.osdVolumeSlider');
    video.volume = 1;
    video.muted = false;
    slider.addEventListener('input', () => { video.volume = (Number(slider.value) / 100) ** 3; });
    bridge.setVolume(0.5);
    expect(video.volume).toBeCloseTo(0.125, 10);
    expect(bridge.state().volume).toBe(0.5);
    // Leiser 100 -> 90 zeigt 0,9 (nicht 0,73 linear)
    bridge.setVolume(0.9);
    expect(bridge.state().volume).toBe(0.9);
    // Schrittfolge 50 -> 60 -> 50 -> 60 ohne Drift
    bridge.setVolume(0.5);
    for (let i = 0; i < 3; i++) {
      const before = video.volume;
      bridge.setVolume(0.6);
      expect(Number(slider.value)).toBe(60);
      expect(video.volume).toBeGreaterThan(before);
      expect(video.volume).toBeCloseTo(0.216, 10);
      bridge.setVolume(0.5);
      expect(Number(slider.value)).toBe(50);
      expect(video.volume).toBeCloseTo(0.125, 10);
    }
    // Stumm + lauter -> Stumm-Knopf wird geklickt; leiser nicht
    video.muted = true;
    clicks.length = 0;
    bridge.setVolume(0.4);
    expect(clicks).toEqual([]);
    bridge.setVolume(0.7);
    expect(clicks).toEqual(['buttonMute']);
  });
});

describe('Spuren', () => {
  it('tracks: Einträge ohne secondarysubtitle, Auswahl über Symbol, Sheet wird per history.back geschlossen', async () => {
    const p = bridge.tracks('subtitle');
    await tickMs(500);
    expect(await p).toEqual([
      { id: '-1', label: 'Aus', selected: false },
      { id: '3', label: 'Deutsch', selected: true },
    ]);
    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.actionSheet')).toBeNull();
  });

  it('tracks: ohne Dialog-History-Eintrag kein history.back (Player nicht verlassen)', async () => {
    sheetState = 'none';
    const p = bridge.tracks('audio');
    await tickMs(3000);
    const list = await p;
    expect(list.map((t) => t.id)).toEqual(['1', '2']);
    expect(backSpy).not.toHaveBeenCalled();
  });

  it('selectTrack(subtitle) klickt den Eintrag', async () => {
    const p = bridge.selectTrack('subtitle', '-1');
    await tickMs(500);
    expect(await p).toBe(true);
    expect(clicks).toContain('subtitle:-1');
  });

  it('selectTrack(audio): wartet auf readyState>=2 und setzt die vorherigen Untertitel erneut', async () => {
    const p = bridge.selectTrack('audio', '2');
    let done = false;
    p.then(() => { done = true; });
    await tickMs(2000);
    expect(clicks).toContain('audio:2');
    expect(vs.readyState).toBe(0);
    expect(done).toBe(false);
    expect(sel.subtitle).toBe('-1');
    await tickMs(3000);
    expect(await p).toBe(true);
    expect(clicks.at(-1)).toBe('subtitle:3');
    expect(sel.subtitle).toBe('3');
    expect(vs.readyState).toBe(4);
  });

  it('selectTrack mit unbekannter Id: false und Sheet geschlossen', async () => {
    const p = bridge.selectTrack('subtitle', '99');
    await tickMs(500);
    expect(await p).toBe(false);
    expect(document.querySelector('.actionSheet')).toBeNull();
  });
});

describe('Untertitel', () => {
  it('Textspur (showing): Cues verbunden, LRM entfernt', () => {
    const track = { mode: 'showing', activeCues: [{ text: '‎Hallo' }, { text: 'Welt' }] };
    Object.defineProperty(video, 'textTracks', { value: [{ mode: 'disabled', activeCues: [] }, track], configurable: true });
    expect(bridge.subtitles()).toEqual({ kind: 'text', text: 'Hallo\nWelt' });
  });

  it('Canvas (ASS) nur mit Größe und im DOM', () => {
    expect(bridge.subtitles()).toBeNull();
    const c = document.createElement('canvas');
    c.className = 'libassjs-canvas';
    document.body.appendChild(c);
    c.width = 0;
    expect(bridge.subtitles()).toBeNull();
    c.width = 640;
    c.height = 360;
    expect(bridge.subtitles()).toEqual({ kind: 'canvas', canvas: c });
  });

  it('Custom-Element-Untertitel als dritte Quelle', () => {
    document.body.insertAdjacentHTML('beforeend', '<div class="videoSubtitles"><div class="videoSubtitlesInner"> Zeile </div></div>');
    expect(bridge.subtitles()).toEqual({ kind: 'text', text: 'Zeile' });
  });
});

describe('stop', () => {
  it('klickt Zurück und liefert true, sobald #/video verlassen ist', async () => {
    const p = bridge.stop();
    await tickMs(500);
    expect(await p).toBe(true);
    expect(clicks).toContain('stop');
    expect(window.location.hash).toBe('#/home');
  });

  it('landet die Route woanders, wird #/home gesetzt', async () => {
    document.querySelector('.headerBackButton').replaceWith(Object.assign(document.createElement('button'), { className: 'headerBackButton', onclick: () => { window.location.hash = '#/details?id=1'; } }));
    const p = bridge.stop();
    await tickMs(500);
    expect(await p).toBe(true);
    expect(window.location.hash).toBe('#/home');
  });

  it('ohne Player (Route nicht video, kein <video>): kein Klick, sofort true, Route #/home', async () => {
    video.remove();
    window.location.hash = '#/details?id=1';
    const p = bridge.stop();
    expect(await p).toBe(true);
    expect(clicks).toEqual([]);
    expect(window.location.hash).toBe('#/home');
    // schon auf #/home: nichts zu tun
    expect(await bridge.stop()).toBe(true);
    expect(clicks).toEqual([]);
    expect(window.location.hash).toBe('#/home');
  });

  it('bleibt die Route #/video: false nach 5 s', async () => {
    document.querySelector('.headerBackButton').replaceWith(Object.assign(document.createElement('button'), { className: 'headerBackButton' }));
    const p = bridge.stop();
    await tickMs(5500);
    expect(await p).toBe(false);
  });
});

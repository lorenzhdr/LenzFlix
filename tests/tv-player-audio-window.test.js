// @vitest-environment jsdom
// Live-Player: Tonspurwahl im Ladefenster (R19) und Rückwahl während der Auflösung (R21).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createPlayer } from '../src/js/tv/player/index.js';
import { makeVideo, makeDeps, ms, info, flush, fire, hlsUrl } from './tv-player-helpers.js';

afterEach(() => { vi.restoreAllMocks(); });

const streams = [
  { Index: 0, Type: 'Video', Codec: 'h264' },
  { Index: 1, Type: 'Audio', Codec: 'aac', Language: 'eng', IsDefault: true, DisplayTitle: 'English - AAC' },
  { Index: 2, Type: 'Audio', Codec: 'ac3', Language: 'ger', DisplayTitle: 'Deutsch - AC3' },
];

describe('Tonspurwahl im Ladefenster', () => {
  it('scheitert die Auflösung vor "playing", kommt ein error statt hängendem Laden', async () => {
    const video = makeVideo();
    const deps = makeDeps({ respond: (m, p, o) => (o && o.body && o.body.AudioStreamIndex === 2 ? info(ms({ direct: false, streams })) : info(ms({ streams }))) });
    const player = createPlayer({ video, deps });
    const errors = [];
    player.on('error', (e) => errors.push(e));
    const p0 = player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    fire(video, 'loadedmetadata'); // Start läuft, 'playing' fehlt noch
    const res = await player.setAudio(2);
    await flush();
    expect(res.ok).toBe(false);
    expect(errors.length).toBe(1);
    expect((await p0).reason).toBe('aborted');
  });
});

describe('Rückwahl der alten Spur während der Auflösung', () => {
  it('bricht die laufende Umschaltung ab, das Bild läuft mit der alten Spur weiter', async () => {
    const video = makeVideo();
    let release;
    const gate = new Promise((r) => { release = r; });
    const deps = makeDeps({ respond: (m, p, o) => (o && o.body && o.body.AudioStreamIndex === 2 ? gate.then(() => info(ms({ direct: false, streams }))) : info(ms({ streams }))) });
    const player = createPlayer({ video, deps });
    const p0 = player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    fire(video, 'loadedmetadata');
    fire(video, 'playing');
    await p0;
    const pB = player.setAudio(2);
    await flush();
    expect(player.tracks().audioIndex).toBe(2); // angeforderte Spur wird gemeldet
    const back = await player.setAudio(1);
    expect(back.ok).toBe(true);
    release();
    await pB;
    await flush();
    expect(player.tracks().audioIndex).toBe(1);
    expect(video.hasAttribute('src')).toBe(true);
  });

  it('dritte Spur während der Umschaltung wird gestartet (zweimal wechseln ergibt C)', async () => {
    const video = makeVideo();
    const st = [...streams, { Index: 3, Type: 'Audio', Codec: 'aac', Language: 'fra', DisplayTitle: 'Français - AAC' }];
    let release;
    const gate = new Promise((r) => { release = r; });
    const asked = [];
    const deps = makeDeps({ respond: (m, p, o) => {
      const a = o && o.body && o.body.AudioStreamIndex;
      if (a != null) asked.push(a);
      return a === 2 ? gate.then(() => info(ms({ direct: false, streams: st }))) : a === 3 ? info(ms({ direct: false, streams: st, transcodingUrl: hlsUrl() })) : info(ms({ streams: st }));
    } });
    const player = createPlayer({ video, deps });
    const p0 = player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    fire(video, 'loadedmetadata');
    fire(video, 'playing');
    await p0;
    const pB = player.setAudio(2);
    await flush();
    const pC = player.setAudio(3);
    await flush();
    fire(video, 'loadedmetadata');
    fire(video, 'playing');
    const c = await pC;
    release();
    await pB;
    await flush();
    expect(asked).toContain(3);
    expect(c.ok).toBe(true);
    expect(player.tracks().audioIndex).toBe(3);
  });
});

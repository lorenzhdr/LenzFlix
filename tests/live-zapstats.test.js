// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createZapStats, sec, detailLine } from '../src/js/live/ui/zapstats.js';

let host;
beforeEach(() => { document.body.innerHTML = '<div id="h"></div>'; host = document.getElementById('h'); });

describe('Messanzeige', () => {
  it('sec(): Dezimalkomma', () => {
    expect(sec(1840)).toBe('1,8');
    expect(sec(0)).toBe('0,0');
  });

  it('rendert Zeile 1 mit Phasen, Cache-Hinweis, Taste und Durchschnitt', () => {
    const z = createZapStats(host);
    const el = host.querySelector('.lfx-zapstats');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(el.style.pointerEvents).toBe('none');
    z.update({ channel: 4, keyMs: 2100, timing: { totalMs: 1800, infoMs: 300, loadMs: 1100, startMs: 200, chain: 'T', cached: false, mode: 'hls' } });
    expect(el.children[0].textContent).toBe('Sender 4 · 1,8 s · T · Info 0,3 · Laden 1,1 · Start 0,2 · ab Taste 2,1 s · Ø 1,8 s (1)');
    z.update({ channel: 5, timing: { totalMs: 1200, infoMs: 0, loadMs: 900, startMs: 300, chain: 'D', cached: true, mode: 'direct' } });
    expect(el.children[0].textContent).toBe('Sender 5 · 1,2 s · D · Info 0,0 Cache · Laden 0,9 · Start 0,3 · Ø 1,5 s (2)');
  });

  it('Durchschnitt über die letzten 10 erfolgreichen; Fehler zählen nicht, zeigen Code + Kette', () => {
    const z = createZapStats(host);
    for (let i = 0; i < 12; i++) z.update({ channel: 1, timing: { totalMs: i < 2 ? 9000 : 1000, infoMs: 0, loadMs: 0, startMs: 0, chain: 'D', cached: false } });
    const l1 = host.querySelector('.lfx-zapstats').children[0];
    expect(l1.textContent).toContain('Ø 1,0 s (10)');
    z.update({ channel: 2, ok: false, code: 'M3·D>T', reason: 'video', timing: { totalMs: 5000, chain: 'D>T' } });
    expect(l1.textContent).toMatch(/^Sender 2 · FEHLER · M3·D>T D>T/);
    expect(l1.textContent).not.toContain('Ø');
  });

  it('Zeile 2: Ton-Diagnose direkt vom <video>', () => {
    const v = document.createElement('video');
    const z = createZapStats(host, { getVideo: () => v });
    z.updateAudio({ mode: 'mute-only', level: 0 });
    const l2 = host.querySelector('.lfx-zapstats').children[1];
    expect(l2.textContent).toBe('Ton: mute-only · muted nein · vol 1,00 · Regler 0');
    v.muted = true;
    v.volume = 0.25;
    z.updateAudio({ mode: 'native', level: 25 });
    expect(l2.textContent).toBe('Ton: native · muted ja · vol 0,25 · Regler 25');
  });

  it('destroy() entfernt das DOM, danach keine Wirkung', () => {
    const z = createZapStats(host);
    z.destroy();
    expect(host.querySelector('.lfx-zapstats')).toBeNull();
    z.update({ channel: 1 });
    z.updateAudio({ mode: 'native', level: 1 });
    expect(host.querySelector('.lfx-zapstats')).toBeNull();
  });
});

describe('Messanzeige Zeile 3', () => {
  const t = {
    totalMs: 1800, infoMs: 300, loadMs: 1100, startMs: 200, chain: 'F', cached: false, mode: 'hls',
    variant: 1, forced: false, jumped: false, devS: 0.3, seekingMs: 0, seekedMs: 300, canplayMs: 500,
    bufSeeked: [0, 2], bufPlaying: [0, 12], waitCount: 2, waitMs: 1800, src: { container: 'mkv', v: 'hevc', a: 'eac3', reasons: ['Container'] },
  };
  it('zeigt Quelle, Grund, Variante, Sprung, Puffer und Warten', () => {
    expect(detailLine(t)).toBe('Quelle mkv·hevc·eac3 · Grund Container · V1 · Sprung nein · Abw +0,3 · Seek 0,0/0,3 · canplay 0,5 · Puffer +0,0…+2,0 → +0,0…+12,0 · Warten 2× 1,8 s');
    expect(detailLine({ ...t, forced: true, variant: 0, jumped: true, waitCount: 0, bufSeeked: null })).toContain('V0 HLS erzwungen · Sprung ja');
  });
  it('rendert als dritte Zeile; ohne Zusatzfelder leer; nie URL/Token', () => {
    const z = createZapStats(host);
    const el = host.querySelector('.lfx-zapstats');
    z.update({ channel: 4, timing: t });
    expect(el.children[2].textContent).toMatch(/^Quelle mkv·hevc·eac3/);
    expect(el.children[2].textContent).not.toMatch(/http|ApiKey|token/i);
    z.update({ channel: 5, timing: { totalMs: 1000, infoMs: 0, loadMs: 0, startMs: 0, chain: 'D', cached: false } });
    expect(el.children[2].textContent).toBe('');
  });
});

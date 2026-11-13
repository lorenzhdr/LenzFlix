// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createZapStats, sec, detailLine, warmLine } from '../src/js/live/ui/zapstats.js';

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
    expect(l1.textContent).toMatch(/^Sender 2 · FEHLER · M3·D>T · 5,0 s$/); // Kette nur einmal
    z.update({ channel: 3, ok: false, code: 'V-SUB', reason: 'video', timing: { totalMs: 1000, chain: 'T', hint: 'Bildformat h264 HDR' } });
    expect(l1.textContent).toBe('Sender 3 · FEHLER · V-SUB T · Bildformat h264 HDR · 1,0 s');
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
    forced: false, jumped: false, devS: 0.3, seekingMs: 0, seekedMs: 300, canplayMs: 500,
    bufSeeked: [0, 2], bufPlaying: [0, 12], waitCount: 2, waitMs: 1800, src: { container: 'mkv', v: 'hevc', a: 'eac3', reasons: ['Container'] },
  };
  it('zeigt Quelle, Grund, Sprung, Puffer und Warten', () => {
    expect(detailLine(t)).toBe('Quelle mkv·hevc·eac3 · Grund Container · Sprung nein · Abw +0,3 · Seek 0,0/0,3 · canplay 0,5 · Puffer +0,0…+2,0 → +0,0…+12,0 · Warten 2× 1,8 s');
    expect(detailLine({ ...t, forced: true, jumped: true, waitCount: 0, bufSeeked: null })).toContain('HLS erzwungen · Sprung ja');
  });
  it('hängt Dateiinfos an die Quelle', () => {
    const x = { ...t, src: { ...t.src, v: 'h264', fmt: 'High 10 L5.1 10 Bit 3840×1600' } };
    expect(detailLine(x)).toContain('Quelle mkv·h264·eac3 · High 10 L5.1 10 Bit 3840×1600 · Grund Container');
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

describe('Messanzeige Zeile 4 (Vorwärmen)', () => {
  it('ohne timing.warm leer', () => {
    expect(warmLine({ totalMs: 1 })).toBe('');
    expect(warmLine(null)).toBe('');
  });
  it('aus / an ungenutzt / an genutzt, deutsches Zahlenformat', () => {
    expect(warmLine({ warm: { on: false }, res: null })).toBe('Vorwärmen aus · Res –');
    expect(warmLine({ warm: { on: true, used: false }, res: { n: 2, firstSegMs: null } })).toBe('Vorwärmen an · genutzt nein · Grund – · Res 2/–');
    const t = { warm: { on: true, used: true, ageMs: 12400, playlistMs: 300, initMs: 200, segFirstByteMs: 4800 }, res: { n: 3, firstSegMs: 5100 } };
    expect(warmLine(t)).toBe('Vorwärmen an · genutzt ja · Alter 12 s · Liste 0,3 · Init 0,2 · Seg 1. Byte 4,8 · Res 3/5,1 s');
  });
  it('neue Gründe in Zeile 4', () => {
    for (const g of ['kette', 'alt', 'verdrängt', 'fehler', 'keiner']) {
      expect(warmLine({ warm: { on: true, used: false, skip: g }, res: null })).toContain(`Grund ${g}`);
    }
  });
  it('teilweise genutzt und Zähler Vw fertig/gestartet', () => {
    const t = { warm: { on: true, used: true, partial: true, started: 3, done: 2, ageMs: 4000, playlistMs: 300, initMs: null, segFirstByteMs: null }, res: null };
    expect(warmLine(t)).toBe('Vorwärmen an · genutzt teilweise · Alter 4 s · Liste 0,3 · Init – · Seg 1. Byte – · Vw 2/3 · Res –');
    expect(warmLine({ warm: { on: true, used: false, started: 1, done: 0, skip: 'pending' }, res: null })).toBe('Vorwärmen an · genutzt nein · Vw 0/1 · Grund pending · Res –');
  });
  it('wird als vierte Zeile gerendert', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const z = createZapStats(host);
    z.update({ channel: 3, timing: { totalMs: 1000, chain: 'F', warm: { on: false }, res: null } });
    expect(host.querySelector('.lfx-zapstats').children[3].textContent).toBe('Vorwärmen aus · Res –');
    host.remove();
  });
});

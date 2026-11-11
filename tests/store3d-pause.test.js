// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createPause, voiceNote } from '../src/js/store3d/ui/pause.js';

function make(over = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let sound = true;
  let info = { diag: 'ok', voiceName: 'Markus', lang: 'de-DE', onlineDe: 0 };
  const noop = () => {};
  const p = createPause(host, {
    onResume: noop, onSearch: noop, onClassic: noop, onQuality: noop, onSound: (on) => { sound = on; }, onFps: noop, onBigCovers: noop, onTheme: noop, onMenu: noop,
    getQuality: () => 'auto', getSound: () => sound, getFps: () => false, getBigCovers: () => false,
    getVoiceInfo: () => info,
    ...over,
  });
  return { host, p, setInfo: (i) => { info = i; }, setSound: (on) => { sound = on; } };
}
const note = (host) => host.querySelector('.lfx-store-pause-note');

describe('Pause-Menue: Stimmen-Diagnosezeile', () => {
  it('zeigt bei Ton an den Zustand, aktualisiert bei refresh/show', () => {
    const { host, p, setInfo } = make();
    expect(note(host).hidden).toBe(false);
    expect(note(host).textContent).toBe('Stimme: Markus (de-DE)');
    setInfo({ diag: 'locked', voiceName: 'Markus', lang: 'de-DE' });
    p.show();
    expect(note(host).textContent).toBe('Stimme: wartet auf ersten Tipp');
    p.destroy();
  });
  it('ist bei Ton aus oder ohne Info versteckt', () => {
    const { host, p, setSound } = make();
    setSound(false);
    p.refresh();
    expect(note(host).hidden).toBe(true);
    const m = make({ getVoiceInfo: undefined });
    expect(note(m.host).hidden).toBe(true);
    p.destroy();
    m.p.destroy();
  });
  it('Texte je Zustand', () => {
    expect(voiceNote({ diag: 'notStarted', voiceName: 'Markus' })).toBe('Stimme: Markus – Gerät hat nicht gesprochen (Stummschalter?)');
    expect(voiceNote({ diag: 'noLocalDe' })).toContain('keine deutsche Gerätestimme');
    expect(voiceNote({ diag: 'novoices' })).toBe('Stimme: keine Stimmen gefunden');
    expect(voiceNote({ diag: 'unsupported' })).toBe('Stimme: vom Browser nicht unterstützt');
    expect(voiceNote({ diag: 'error:synthesis-failed' })).toBe('Stimme: Fehler (synthesis-failed)');
    expect(voiceNote(null)).toBe('');
  });
});

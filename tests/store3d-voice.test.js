// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pickVoice, createVoice } from '../src/js/store3d/modules/voice.js';

const V = (name, lang = 'de-DE', localService = true) => ({ name, lang, localService });

describe('pickVoice', () => {
  it('nutzt nur lokale deutsche Stimmen', () => {
    expect(pickVoice([V('Markus', 'de-DE', false), V('Martin', 'en-US'), V('Hans', 'fr-FR')])).toBeNull();
    expect(pickVoice([])).toBeNull();
    expect(pickVoice(null)).toBeNull();
  });
  it('bevorzugt männliche Namen (pitch 1.0) in Listenreihenfolge', () => {
    const r = pickVoice([V('Anna'), V('Stefan'), V('Markus')]);
    expect(r.voice.name).toBe('Markus');
    expect(r.pitch).toBe(1.0);
  });
  it('akzeptiert de_DE und Großschreibung, de-DE zuerst', () => {
    const r = pickVoice([V('MARTIN Premium', 'de-AT'), V('martin', 'de_DE')]);
    expect(r.voice.lang).toBe('de_DE');
    expect(pickVoice([V('Hans', 'DE-de')]).voice.name).toBe('Hans');
  });
  it('Novelty-Stimmen kommen unter den männlichen zuletzt', () => {
    expect(pickVoice([V('Eddy Markus'), V('Jonas')]).voice.name).toBe('Jonas');
    expect(pickVoice([V('Grandpa Martin')]).voice.name).toBe('Grandpa Martin');
  });
  it('Fallback: irgendeine lokale deutsche Stimme mit pitch 0.8', () => {
    const r = pickVoice([V('Anna', 'de-AT'), V('Petra', 'de-DE')]);
    expect(r.voice.name).toBe('Petra');
    expect(r.pitch).toBe(0.8);
  });
});

function mockSynth(voices) {
  const synth = {
    spoken: [],
    cancel: vi.fn(),
    speak: vi.fn((u) => synth.spoken.push(u)),
    getVoices: () => voices,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  return synth;
}
class Utt {
  constructor(text) { this.text = text; }
}

describe('createVoice', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('ist ohne synth/Utterance ein No-op', async () => {
    const v = createVoice({ soundOn: () => true, synth: null, Utterance: null });
    await expect(v.say('Hallo')).resolves.toBeUndefined();
    expect(v.speaking).toBe(false);
    v.cancel(); v.unlock(); v.dispose();
  });
  it('ist ohne Stimme ein No-op', async () => {
    const synth = mockSynth([V('Hans', 'en-US')]);
    const v = createVoice({ soundOn: () => true, synth, Utterance: Utt });
    await expect(v.say('Hallo')).resolves.toBeUndefined();
    expect(synth.speak).not.toHaveBeenCalled();
    v.dispose();
  });
  it('say bricht ab und spricht einen Tick später', async () => {
    const synth = mockSynth([V('Markus')]);
    const v = createVoice({ soundOn: () => true, synth, Utterance: Utt });
    const p = v.say('Hallo Welt', { volume: 0.5 });
    expect(synth.cancel).toHaveBeenCalled();
    expect(synth.speak).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(synth.speak).toHaveBeenCalledTimes(1);
    const u = synth.spoken[0];
    expect(u.text).toBe('Hallo Welt');
    expect(u.lang).toBe('de-DE');
    expect(u.volume).toBe(0.5);
    expect(u.pitch).toBe(1.0);
    expect(u.rate).toBe(1.0);
    expect(v.speaking).toBe(true);
    u.onend();
    await p;
    expect(v.speaking).toBe(false);
    v.dispose();
  });
  it('Sicherheitstimeout setzt speaking zurück', async () => {
    const synth = mockSynth([V('Markus')]);
    const v = createVoice({ soundOn: () => true, synth, Utterance: Utt });
    const p = v.say('abc');
    vi.advanceTimersByTime(1);
    expect(v.speaking).toBe(true);
    vi.advanceTimersByTime(3 * 90 + 1500 + 5);
    await p;
    expect(v.speaking).toBe(false);
    v.dispose();
  });
  it('cancel beendet die Rede und löst das Versprechen auf', async () => {
    const synth = mockSynth([V('Markus')]);
    const v = createVoice({ soundOn: () => true, synth, Utterance: Utt });
    const p = v.say('abc');
    vi.advanceTimersByTime(1);
    v.cancel();
    await p;
    expect(v.speaking).toBe(false);
    v.dispose();
  });
  it('lädt Stimmen nach (voiceschanged-Listener, Abfragen im 500-ms-Takt)', async () => {
    const voices = [];
    const synth = mockSynth(voices);
    const v = createVoice({ soundOn: () => true, synth, Utterance: Utt });
    expect(synth.addEventListener).toHaveBeenCalledWith('voiceschanged', expect.any(Function));
    voices.push(V('Markus'));
    vi.advanceTimersByTime(500);
    const p = v.say('x');
    vi.advanceTimersByTime(1);
    expect(synth.speak).toHaveBeenCalled();
    synth.spoken[0].onend();
    await p;
    v.dispose();
    expect(synth.removeEventListener).toHaveBeenCalled();
  });
  it('unlock spricht bei der ersten Geste einmal leer und entfernt die Listener', () => {
    const synth = mockSynth([V('Markus')]);
    const v = createVoice({ soundOn: () => true, synth, Utterance: Utt });
    v.unlock();
    document.dispatchEvent(new Event('pointerdown'));
    document.dispatchEvent(new Event('keydown'));
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(synth.spoken[0].text).toBe(' ');
    expect(synth.spoken[0].volume).toBe(0);
    v.dispose();
  });
  it('unlock verbraucht sich nicht bei ausgeschaltetem Ton', () => {
    let on = false;
    const synth = mockSynth([V('Markus')]);
    const v = createVoice({ soundOn: () => on, synth, Utterance: Utt });
    v.unlock();
    document.dispatchEvent(new Event('click'));
    expect(synth.speak).not.toHaveBeenCalled();
    on = true;
    document.dispatchEvent(new Event('click'));
    expect(synth.speak).toHaveBeenCalledTimes(1);
    v.dispose();
  });
  it('onUnlock: wartende Zeile startet erst nach der Freischalt-Äußerung', () => {
    const synth = mockSynth([V('Markus')]);
    const v = createVoice({ soundOn: () => true, synth, Utterance: Utt });
    v.unlock();
    const fn = vi.fn(() => { expect(synth.spoken.map((u) => u.text)).toEqual([' ']); v.say('Hallo'); });
    v.onUnlock(fn);
    expect(v.unlocked).toBe(false);
    document.dispatchEvent(new Event('click'));
    expect(v.unlocked).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(synth.spoken.map((u) => u.text)).toEqual([' ', 'Hallo']);
    document.dispatchEvent(new Event('click'));
    expect(fn).toHaveBeenCalledTimes(1);
    v.dispose();
  });
  it('dispose entfernt die Gesten-Listener', () => {
    const synth = mockSynth([V('Markus')]);
    const v = createVoice({ soundOn: () => true, synth, Utterance: Utt });
    v.unlock();
    v.dispose();
    document.dispatchEvent(new Event('pointerdown'));
    expect(synth.speak).not.toHaveBeenCalled();
  });
});

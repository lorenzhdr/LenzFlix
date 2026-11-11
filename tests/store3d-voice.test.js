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
  it('say im Leerlauf spricht synchron ohne cancel', async () => {
    const synth = mockSynth([V('Markus')]);
    const v = createVoice({ soundOn: () => true, synth, Utterance: Utt });
    const p = v.say('Hallo Welt', { volume: 0.5 });
    expect(synth.cancel).not.toHaveBeenCalled();
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
  it('say waehrend einer Rede bricht ab und spricht einen Tick spaeter', async () => {
    const synth = mockSynth([V('Markus')]);
    const v = createVoice({ soundOn: () => true, synth, Utterance: Utt });
    v.say('Eins');
    const p2 = v.say('Zwei');
    expect(synth.cancel).toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(synth.speak).toHaveBeenCalledTimes(2);
    expect(synth.spoken[1].text).toBe('Zwei');
    synth.spoken[1].onend();
    await p2;
    v.dispose();
  });
  it('Sicherheitstimeout setzt speaking zurueck', async () => {
    const synth = mockSynth([V('Markus')]);
    const v = createVoice({ soundOn: () => true, synth, Utterance: Utt });
    const p = v.say('abc');
    expect(v.speaking).toBe(true);
    vi.advanceTimersByTime(3 * 90 + 1500 + 5);
    await p;
    expect(v.speaking).toBe(false);
    v.dispose();
  });
  it('cancel beendet die Rede und loest das Versprechen auf', async () => {
    const synth = mockSynth([V('Markus')]);
    const v = createVoice({ soundOn: () => true, synth, Utterance: Utt });
    const p = v.say('abc');
    v.cancel();
    await p;
    expect(v.speaking).toBe(false);
    v.dispose();
  });
  it('laedt Stimmen nach (voiceschanged-Listener, Abfragen im 500-ms-Takt)', async () => {
    const voices = [];
    const synth = mockSynth(voices);
    const v = createVoice({ soundOn: () => true, synth, Utterance: Utt });
    expect(synth.addEventListener).toHaveBeenCalledWith('voiceschanged', expect.any(Function));
    voices.push(V('Markus'));
    vi.advanceTimersByTime(500);
    const p = v.say('x');
    expect(synth.speak).toHaveBeenCalled();
    synth.spoken[0].onend();
    await p;
    v.dispose();
    expect(synth.removeEventListener).toHaveBeenCalled();
  });
  it('pointerdown und Escape schalten nicht frei', () => {
    const synth = mockSynth([V('Markus')]);
    const v = createVoice({ soundOn: () => true, synth, Utterance: Utt });
    v.unlock();
    document.dispatchEvent(new Event('pointerdown'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
    expect(synth.speak).not.toHaveBeenCalled();
    expect(v.unlocked).toBe(false);
    v.dispose();
  });
  it('unlock: Geste spricht NBSP leise; unlocked erst nach onstart', () => {
    const synth = mockSynth([V('Markus')]);
    const v = createVoice({ soundOn: () => true, synth, Utterance: Utt });
    v.unlock();
    document.dispatchEvent(new Event('touchend'));
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(synth.spoken[0].text).toBe(' ');
    expect(synth.spoken[0].volume).toBe(0.01);
    expect(v.unlocked).toBe(false);
    expect(v.diag).toBe('locked');
    synth.spoken[0].onstart();
    expect(v.unlocked).toBe(true);
    expect(v.diag).toBe('ok');
    document.dispatchEvent(new Event('click'));
    expect(synth.speak).toHaveBeenCalledTimes(1);
    v.dispose();
  });
  it('ohne onstart: kein Doppelversuch innerhalb 2 s, danach neuer Versuch (notStarted)', () => {
    const synth = mockSynth([V('Markus')]);
    const v = createVoice({ soundOn: () => true, synth, Utterance: Utt });
    v.unlock();
    document.dispatchEvent(new Event('click'));
    document.dispatchEvent(new Event('click'));
    expect(synth.speak).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2100);
    expect(v.diag).toBe('notStarted');
    document.dispatchEvent(new Event('click'));
    expect(synth.speak).toHaveBeenCalledTimes(2);
    synth.spoken[1].onstart();
    expect(v.unlocked).toBe(true);
    expect(v.diag).toBe('ok');
    v.dispose();
  });
  it('ohne Stimme bleibt die Freischaltung offen', () => {
    const voices = [];
    const synth = mockSynth(voices);
    const v = createVoice({ soundOn: () => true, synth, Utterance: Utt });
    v.unlock();
    document.dispatchEvent(new Event('click'));
    expect(synth.speak).not.toHaveBeenCalled();
    expect(v.unlocked).toBe(false);
    voices.push(V('Markus'));
    document.dispatchEvent(new Event('click'));
    expect(synth.speak).toHaveBeenCalledTimes(1);
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
  it('wartende Zeile wird synchron in der Geste als Freischaltung gesprochen', () => {
    const synth = mockSynth([V('Markus')]);
    const v = createVoice({ soundOn: () => true, synth, Utterance: Utt });
    v.unlock();
    const onBegin = vi.fn();
    const onEnd = vi.fn();
    v.setPending('Hallo', { volume: 0.7, onBegin, onEnd });
    document.dispatchEvent(new Event('touchend'));
    expect(synth.cancel).not.toHaveBeenCalled();
    expect(synth.spoken.map((u) => u.text)).toEqual(['Hallo']);
    expect(synth.spoken[0].volume).toBe(0.7);
    expect(onBegin).toHaveBeenCalledTimes(1);
    expect(v.unlocked).toBe(false);
    synth.spoken[0].onstart();
    expect(v.unlocked).toBe(true);
    synth.spoken[0].onend();
    expect(onEnd).toHaveBeenCalledTimes(1);
    v.dispose();
  });
  it('veraltete oder abgebrochene wartende Zeile wird nicht gesprochen', () => {
    const synth = mockSynth([V('Markus')]);
    const v = createVoice({ soundOn: () => true, synth, Utterance: Utt });
    v.unlock();
    v.setPending('Alt');
    vi.advanceTimersByTime(16000);
    document.dispatchEvent(new Event('click'));
    expect(synth.spoken.map((u) => u.text)).toEqual([' ']);
    v.dispose();
    const synth2 = mockSynth([V('Markus')]);
    const v2 = createVoice({ soundOn: () => true, synth: synth2, Utterance: Utt });
    v2.unlock();
    v2.setPending('x');
    v2.cancel();
    document.dispatchEvent(new Event('click'));
    expect(synth2.spoken.map((u) => u.text)).toEqual([' ']);
    v2.dispose();
  });
  it('diag trennt die Zustaende', () => {
    const none = createVoice({ synth: null, Utterance: null });
    expect(none.diag).toBe('unsupported');
    const empty = createVoice({ synth: mockSynth([]), Utterance: Utt });
    expect(empty.diag).toBe('novoices');
    empty.dispose();
    const online = createVoice({ synth: mockSynth([V('Markus', 'de-DE', false), V('Anna', 'de-AT', false)]), Utterance: Utt });
    expect(online.diag).toBe('noLocalDe');
    expect(online.onlineDe).toBe(2);
    online.dispose();
    const synth = mockSynth([V('Markus')]);
    const v = createVoice({ soundOn: () => true, synth, Utterance: Utt });
    expect(v.diag).toBe('locked');
    expect(v.voiceName).toBe('Markus');
    expect(v.lang).toBe('de-DE');
    v.say('x');
    synth.spoken[0].onerror({ error: 'synthesis-failed' });
    expect(v.diag).toBe('error:synthesis-failed');
    v.say('y');
    synth.spoken[1].onerror({ error: 'canceled' });
    synth.spoken[1].onstart();
    expect(v.diag).toBe('ok');
    v.dispose();
  });
  it('notStarted: speak ohne onstart innerhalb des Timeouts', () => {
    const synth = mockSynth([V('Markus')]);
    const v = createVoice({ soundOn: () => true, synth, Utterance: Utt });
    v.say('x');
    vi.advanceTimersByTime(2100);
    expect(v.diag).toBe('notStarted');
    v.dispose();
  });
  it('dispose entfernt die Gesten-Listener', () => {
    const synth = mockSynth([V('Markus')]);
    const v = createVoice({ soundOn: () => true, synth, Utterance: Utt });
    v.unlock();
    v.dispose();
    document.dispatchEvent(new Event('click'));
    expect(synth.speak).not.toHaveBeenCalled();
  });
});

describe('pickVoice online', () => {
  const voices = [
    V('Microsoft Stefan - German (Germany)'),
    V('Google Deutsch', 'de-DE', false),
    V('Microsoft Katja Online (Natural) - German (Germany)', 'de-DE', false),
    V('Microsoft Conrad Online (Natural) - German (Germany)', 'de-DE', false),
    V('Microsoft Guy Online (Natural) - English (United States)', 'en-US', false),
  ];
  it('ohne Freigabe nur lokale Stimmen', () => {
    const r = pickVoice(voices);
    expect(r.voice.name).toContain('Stefan');
    expect(r.online).toBeFalsy();
  });
  it('mit Freigabe: männliche Natural-Stimme zuerst, pitch 1.0, online markiert', () => {
    const r = pickVoice(voices, { online: true });
    expect(r.voice.name).toContain('Conrad');
    expect(r.pitch).toBe(1.0);
    expect(r.online).toBe(true);
  });
  it('mit Freigabe: Natural vor sonstigen Online-Stimmen, ohne Online-Stimme lokal', () => {
    expect(pickVoice(voices.filter((v) => !/Conrad/.test(v.name)), { online: true }).voice.name).toContain('Katja');
    expect(pickVoice([V('Google Deutsch', 'de-DE', false), V('Microsoft Stefan')], { online: true }).voice.name).toBe('Google Deutsch');
    const local = pickVoice([V('Microsoft Stefan')], { online: true });
    expect(local.voice.name).toContain('Stefan');
    expect(local.online).toBeFalsy();
  });
  it('createVoice: reselect wechselt zwischen Gerät und Online', () => {
    let on = false;
    const synth = { cancel() {}, speak() {}, getVoices: () => voices, addEventListener() {}, removeEventListener() {} };
    const v = createVoice({ soundOn: () => true, online: () => on, synth, Utterance: class { constructor(t) { this.text = t; } } });
    expect(v.voiceName).toContain('Stefan');
    expect(v.online).toBe(false);
    on = true;
    v.reselect();
    expect(v.voiceName).toContain('Conrad');
    expect(v.online).toBe(true);
    v.dispose();
  });
});

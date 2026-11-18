// @vitest-environment jsdom
// VIDEOTHEK LENZ · Sprecher-Regie (voice.js createDirector): Vorrang, Distanz, nächste Person, Warteschlange, Ton aus.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createVoice, createDirector, pickVoiceSeeded, RICHARD_PRIO } from '../src/js/store3d/modules/voice.js';

const V = (name, lang = 'de-DE', localService = true) => ({ name, lang, localService });
class Utt { constructor(text) { this.text = text; } }
function mockSynth(voices) {
  const synth = { spoken: [], cancel: vi.fn(), speak: vi.fn((u) => synth.spoken.push(u)), getVoices: () => voices, addEventListener: vi.fn(), removeEventListener: vi.fn() };
  return synth;
}

function setup({ sound = true, at = { x: 0, y: 0, z: 0 } } = {}) {
  const synth = mockSynth([V('Markus'), V('Anna'), V('Hans')]);
  const voice = createVoice({ soundOn: () => true, synth, Utterance: Utt });
  voice.unlockNow(); // Freischaltung: Leerlauf-Äußerung, onstart bestätigt
  const unlockUtt = synth.spoken[0];
  if (unlockUtt && unlockUtt.onstart) unlockUtt.onstart();
  synth.spoken.length = 0;
  synth.speak.mockClear();
  const st = { sound, at, t: 0 };
  const dir = createDirector({ voice, soundOn: () => st.sound, listener: () => st.at, now: () => st.t });
  return { synth, voice, dir, st };
}
const at = (x, z = 0) => () => ({ x, y: 0, z });
const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

describe('pickVoiceSeeded', () => {
  it('wählt stabil je Seed aus den lokalen deutschen Stimmen', () => {
    const vs = [V('Markus'), V('Anna'), V('Hans'), V('Joe', 'en-US'), V('Online', 'de-DE', false)];
    const a = pickVoiceSeeded(vs, 5);
    expect(a.voice.name).toBe(pickVoiceSeeded(vs, 5).voice.name);
    expect(['Anna', 'Hans', 'Markus']).toContain(a.voice.name);
    expect(new Set([0, 1, 2].map((s) => pickVoiceSeeded(vs, s).voice.name)).size).toBe(3);
    expect(pickVoiceSeeded([V('Joe', 'en-US')], 1)).toBeNull();
    expect(pickVoiceSeeded(vs, 1, { online: true }).voice).toBeTruthy();
  });
});

describe('Sprecher-Regie', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('Person in der Nähe spricht mit eigener Stimme, pitch und rate; Ergebnis spoken', async () => {
    const { synth, dir } = setup();
    const sp = dir.speaker({ id: 'p1', voiceSeed: 1, pitch: 1.3, rate: 1.2, prio: 20, pos: at(4) });
    const p = sp.say('Hallo du', { volume: 1 });
    expect(synth.speak).toHaveBeenCalledTimes(1);
    const u = synth.spoken[0];
    expect(u.pitch).toBeCloseTo(1.3);
    expect(u.rate).toBeCloseTo(1.2);
    expect(u.volume).toBeLessThan(1); // Abstand 4 m
    u.onend();
    await expect(p).resolves.toBe('spoken');
  });
  it('weiter als 10 m: bubble, nichts gesprochen', async () => {
    const { synth, dir } = setup();
    const sp = dir.speaker({ id: 'far', voiceSeed: 2, prio: 20, pos: at(11) });
    await expect(sp.say('weit weg')).resolves.toBe('bubble');
    expect(synth.speak).not.toHaveBeenCalled();
  });
  it('Ton aus: muted', async () => {
    const { synth, dir } = setup({ sound: false });
    const sp = dir.speaker({ id: 'p', voiceSeed: 1, prio: 20, pos: at(2) });
    await expect(sp.say('still')).resolves.toBe('muted');
    const r = dir.speaker({ id: 'richard', prio: RICHARD_PRIO, pos: at(2) });
    await expect(r.say('auch still')).resolves.toBe('muted');
    expect(synth.speak).not.toHaveBeenCalled();
  });
  it('nur die nächste Person spricht, die andere bekommt eine Blase', async () => {
    const { synth, dir } = setup();
    const near = dir.speaker({ id: 'near', voiceSeed: 1, prio: 20, pos: at(3) });
    const far = dir.speaker({ id: 'far', voiceSeed: 2, prio: 20, pos: at(7) });
    const n = near.say('ich bin nah');
    const f = far.say('ich bin weiter weg');
    await expect(f).resolves.toBe('bubble');
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(synth.spoken[0].text).toBe('ich bin nah');
    synth.spoken[0].onend();
    await expect(n).resolves.toBe('spoken');
  });
  it('Richard unterbricht eine Person; die Person bekommt bubble', async () => {
    const { synth, dir } = setup();
    const person = dir.speaker({ id: 'p', voiceSeed: 1, prio: 20, pos: at(2) });
    const richard = dir.speaker({ id: 'richard', prio: RICHARD_PRIO, pos: at(5) });
    const a = person.say('Gerede');
    expect(synth.speak).toHaveBeenCalledTimes(1);
    const b = richard.say('Ausweis, bitte.', { volume: 0.8 });
    expect(synth.cancel).toHaveBeenCalled(); // voice.say: Chrome-sicheres cancel mit Tick Abstand
    await expect(a).resolves.toBe('bubble');
    vi.advanceTimersByTime(1);
    expect(synth.spoken[1].text).toBe('Ausweis, bitte.');
    expect(synth.spoken[1].volume).toBeCloseTo(0.8);
    synth.spoken[1].onend();
    await expect(b).resolves.toBe('spoken');
  });
  it('während Richard spricht, bekommen Personen bubble', async () => {
    const { synth, dir } = setup();
    const richard = dir.speaker({ id: 'richard', prio: RICHARD_PRIO, pos: at(1) });
    const person = dir.speaker({ id: 'p', voiceSeed: 1, prio: 20, pos: at(2) });
    const r = richard.say('Moin');
    await expect(person.say('dazwischen')).resolves.toBe('bubble');
    synth.spoken[0].onend();
    await expect(r).resolves.toBe('spoken');
  });
  it('Richard ohne Distanzregel (der Aufrufer prüft selbst)', async () => {
    const { synth, dir } = setup();
    const r = dir.speaker({ id: 'richard', prio: RICHARD_PRIO, pos: at(30) });
    const p = r.say('weit');
    expect(synth.speak).toHaveBeenCalledTimes(1);
    synth.spoken[0].onend();
    await expect(p).resolves.toBe('spoken');
  });
  it('höchstens eine wartende Zeile; sie läuft nach dem Ende und ersetzt nie hart', async () => {
    const { synth, dir } = setup();
    const a = dir.speaker({ id: 'a', voiceSeed: 1, prio: 20, pos: at(2) });
    const b = dir.speaker({ id: 'b', voiceSeed: 2, prio: 20, pos: at(2) });
    const c = dir.speaker({ id: 'c', voiceSeed: 3, prio: 20, pos: at(2) });
    const pa = a.say('eins');
    const pb = b.say('zwei');
    const pc = c.say('drei');
    await expect(pc).resolves.toBe('bubble'); // Warteschlange belegt
    expect(synth.cancel).not.toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledTimes(1);
    synth.spoken[0].onend();
    await expect(pa).resolves.toBe('spoken');
    await flush();
    expect(synth.speak).toHaveBeenCalledTimes(2);
    expect(synth.spoken[1].text).toBe('zwei');
    synth.spoken[1].onend();
    await expect(pb).resolves.toBe('spoken');
  });
  it('wartende Zeile verfällt zu bubble, wenn der Sprecher inzwischen zu weit weg ist', async () => {
    const { synth, dir, st } = setup();
    let x = 2;
    const a = dir.speaker({ id: 'a', voiceSeed: 1, prio: 20, pos: at(2) });
    const b = dir.speaker({ id: 'b', voiceSeed: 2, prio: 20, pos: () => ({ x, y: 0, z: 0 }) });
    const pa = a.say('eins');
    const pb = b.say('zwei');
    x = 15;
    synth.spoken[0].onend();
    await pa;
    await flush();
    await expect(pb).resolves.toBe('bubble');
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(st.t).toBe(0);
  });
  it('cancel nimmt eine wartende Zeile zurück und stoppt die eigene laufende', async () => {
    const { synth, dir } = setup();
    const a = dir.speaker({ id: 'a', voiceSeed: 1, prio: 20, pos: at(2) });
    const b = dir.speaker({ id: 'b', voiceSeed: 2, prio: 20, pos: at(2) });
    const pa = a.say('eins');
    const pb = b.say('zwei');
    b.cancel();
    await expect(pb).resolves.toBe('bubble');
    a.cancel();
    expect(synth.cancel).toHaveBeenCalled();
    await expect(pa).resolves.toBe('bubble');
  });
  it('ohne Freischaltung (iOS) bekommen Personen eine Blase', async () => {
    const synth = mockSynth([V('Markus')]);
    const voice = createVoice({ soundOn: () => true, synth, Utterance: Utt });
    const dir = createDirector({ voice, soundOn: () => true, listener: () => ({ x: 0, y: 0, z: 0 }) });
    await expect(dir.speaker({ id: 'p', voiceSeed: 1, prio: 20, pos: at(1) }).say('hi')).resolves.toBe('bubble');
    expect(synth.speak).not.toHaveBeenCalled();
  });
  it('dispose beendet alles; danach muted', async () => {
    const { synth, dir } = setup();
    const a = dir.speaker({ id: 'a', voiceSeed: 1, prio: 20, pos: at(2) });
    const pa = a.say('eins');
    dir.dispose();
    await expect(pa).resolves.toBe('bubble');
    await expect(a.say('noch')).resolves.toBe('muted');
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });
});

describe('Sprecher-Regie 1.18.0: Passanten ohne eigene Werte', () => {
  it('Seed färbt pitch/rate deterministisch (voiceFor), explizite Werte gewinnen', async () => {
    const { voiceFor: vf } = await import('../src/js/store3d/modules/voice.js');
    const { synth, dir } = setup();
    const sp = dir.speaker({ id: 'p9', voiceSeed: 4, prio: 20, pos: at(3) });
    sp.say('Hallo');
    await flush();
    const u = synth.spoken[0];
    const f = vf(4, 3);
    expect(u.rate).toBeCloseTo(f.rate);
    expect(u.pitch).toBeGreaterThanOrEqual(0.5);
  });
  it('Richard hat Vorrang, ferne Person (>10 m) bekommt bubble', async () => {
    const { dir } = setup();
    const far = dir.speaker({ id: 'far', voiceSeed: 2, prio: 20, pos: at(12) });
    expect(await far.say('Weit weg')).toBe('bubble');
    const rich = dir.speaker({ id: 'richard', voiceSeed: 'r', prio: RICHARD_PRIO, pos: at(2) });
    rich.say('Hallo');
    const near = dir.speaker({ id: 'near', voiceSeed: 3, prio: 20, pos: at(4) });
    expect(await near.say('Ich auch')).toBe('bubble');
  });
});

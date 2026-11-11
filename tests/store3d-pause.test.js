// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createPause, voiceNote, shortVoiceName } from '../src/js/store3d/ui/pause.js';

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
    expect(voiceNote({ diag: 'ok', voiceName: 'Conrad', lang: 'de-DE', online: true })).toContain('online: Sätze, Name und Titel');
    expect(voiceNote({ diag: 'ok', voiceName: 'Stefan', lang: 'de-DE' }, true)).toContain('keine Online-Stimme verfügbar');
  });
});

const LIST = [
  { name: 'Markus', lang: 'de-DE', online: false, male: true },
  { name: 'Microsoft Conrad Online (Natural) - German (Germany)', lang: 'de-DE', online: true, male: true },
  { name: 'Anna', lang: 'de-DE', online: false, male: false },
];
function makeVoice(over = {}) {
  let prefs = { name: '', online: false, pitch: 'tief' };
  const calls = [];
  const m = make({
    onVoice: (p) => { calls.push(p); prefs = { ...prefs, ...p }; },
    getVoicePrefs: () => prefs,
    getVoiceList: () => LIST,
    ...over,
  });
  return { ...m, calls };
}
const btn = (host, re) => Array.from(host.querySelectorAll('button')).find((b) => re.test(b.textContent));

describe('Pause-Menue: Stimmenauswahl', () => {
  it('Knopftext: Automatisch bzw. Kurzname, nur bei Ton an', () => {
    const { host, p, setSound } = makeVoice();
    expect(btn(host, /^Stimme:/).textContent).toBe('Stimme: Automatisch');
    expect(btn(host, /^Stimme:/).hidden).toBe(false);
    setSound(false);
    p.refresh();
    expect(btn(host, /^Stimme:/).hidden).toBe(true);
    p.destroy();
    const n = makeVoice({ getVoicePrefs: () => ({ name: LIST[1].name, online: false, pitch: 'tief' }) });
    expect(btn(n.host, /^Stimme:/).textContent).toBe('Stimme: Conrad');
    n.p.destroy();
  });
  it('shortVoiceName', () => {
    expect(shortVoiceName('Microsoft Conrad Online (Natural) - German (Germany)')).toBe('Conrad');
    expect(shortVoiceName('Google Deutsch')).toBe('Deutsch');
    expect(shortVoiceName('Anna')).toBe('Anna');
  });
  it('Panel öffnet, listet Einträge, schließt per Fertig, closePick, Klick daneben und hide', () => {
    const { host, p } = makeVoice();
    const pick = host.querySelector('.lfx-store-voicepick');
    expect(pick.hidden).toBe(true);
    btn(host, /^Stimme:/).click();
    expect(pick.hidden).toBe(false);
    expect(p.pickOpen).toBe(true);
    const items = Array.from(pick.querySelectorAll('.lfx-store-voiceitem')).map((b) => b.textContent);
    expect(items).toEqual(['Automatisch (Gerätestimme)', 'Automatisch (Online bevorzugt)', 'Markus', 'Conrad · online', 'Anna']);
    expect(pick.querySelector('[aria-pressed="true"]').textContent).toBe('Automatisch (Gerätestimme)');
    btn(host, /^Fertig$/).click();
    expect(pick.hidden).toBe(true);
    btn(host, /^Stimme:/).click();
    p.closePick();
    expect(p.pickOpen).toBe(false);
    btn(host, /^Stimme:/).click();
    pick.click();
    expect(pick.hidden).toBe(true);
    btn(host, /^Stimme:/).click();
    p.hide();
    expect(pick.hidden).toBe(true);
    p.destroy();
  });
  it('Auswahl ruft onVoice und markiert den Eintrag', () => {
    const { host, p, calls } = makeVoice();
    btn(host, /^Stimme:/).click();
    btn(host, /^Conrad/).click();
    expect(calls).toEqual([{ name: LIST[1].name }]);
    expect(btn(host, /^Conrad/).getAttribute('aria-pressed')).toBe('true');
    expect(btn(host, /^Markus/).getAttribute('aria-pressed')).toBe('false');
    expect(btn(host, /^Stimme:/).textContent).toBe('Stimme: Conrad');
    btn(host, /^Automatisch \(Online/).click();
    expect(calls[1]).toEqual({ name: '', online: true });
    expect(btn(host, /^Automatisch \(Online/).getAttribute('aria-pressed')).toBe('true');
    expect(btn(host, /^Stimme:/).textContent).toBe('Stimme: Automatisch');
    p.destroy();
  });
  it('Tonlage zykliert Tief -> Sehr tief -> Normal', () => {
    const { host, p, calls } = makeVoice();
    btn(host, /^Stimme:/).click();
    expect(btn(host, /^Tonlage/).textContent).toBe('Tonlage: Tief');
    btn(host, /^Tonlage/).click();
    expect(btn(host, /^Tonlage/).textContent).toBe('Tonlage: Sehr tief');
    btn(host, /^Tonlage/).click();
    expect(btn(host, /^Tonlage/).textContent).toBe('Tonlage: Normal');
    expect(calls).toEqual([{ pitch: 'sehrtief' }, { pitch: 'normal' }]);
    p.destroy();
  });
  it('Hinweise: online, Tipp ohne männliche Stimme, keine Stimmen', () => {
    const online = makeVoice({ getVoicePrefs: () => ({ name: LIST[1].name, online: false, pitch: 'tief' }) });
    btn(online.host, /^Stimme:/).click();
    const nt = online.host.querySelector('.lfx-store-voicepick-note');
    expect(nt.textContent).toContain('Online: Sätze, Name und Filmtitel');
    expect(nt.textContent).not.toContain('Tipp:');
    online.p.destroy();
    const none = makeVoice({ getVoiceList: () => [LIST[2]] });
    btn(none.host, /^Stimme:/).click();
    const tip = none.host.querySelector('.lfx-store-voicepick-note').textContent;
    expect(tip).toContain('Tipp: Männliche Online-Stimmen');
    expect(tip).not.toMatch(/Edge/);
    none.p.destroy();
    const empty = makeVoice({ getVoiceList: () => [] });
    btn(empty.host, /^Stimme:/).click();
    expect(empty.host.querySelector('.lfx-store-voicelist').textContent).toContain('Keine deutschen Stimmen gefunden');
    empty.p.destroy();
  });
});

describe('Pause-Menue: Steuerung (Touch)', () => {
  const btn = (host) => [...host.querySelectorAll('.lfx-store-act')].find((b) => b.textContent.startsWith('Steuerung'));
  it('ist ohne onTouchControl (Desktop) versteckt', () => {
    const { host, p } = make({ onTouchControl: null });
    expect(btn(host).hidden).toBe(true);
    p.destroy();
  });
  it('zeigt die Wahl und schaltet Joystick ↔ Touch', () => {
    let scheme = 'joystick';
    const { host, p } = make({ onTouchControl: (s) => { scheme = s; }, getTouchControl: () => scheme });
    const b = btn(host);
    expect(b.hidden).toBe(false);
    expect(b.textContent).toBe('Steuerung: Joystick');
    b.click();
    expect(scheme).toBe('touch');
    expect(b.textContent).toBe('Steuerung: Touch');
    b.click();
    expect(scheme).toBe('joystick');
    p.destroy();
  });
});

describe('Pause-Menue: VR-Modus', () => {
  const vrBtn = (host) => [...host.querySelectorAll('button')].find((b) => b.textContent === 'VR-Modus');
  it('Eintrag steht direkt nach „Weiter“ und ist nur bei getVr() sichtbar', () => {
    let on = false;
    const m = make({ onVr: () => {}, getVr: () => on });
    const b = vrBtn(m.host);
    expect(b.hidden).toBe(true);
    expect(b.previousElementSibling.textContent).toBe('Weiter');
    on = true;
    m.p.show();
    expect(b.hidden).toBe(false);
    m.p.destroy();
  });
  it('Klick ruft onVr synchron; ohne getVr bleibt der Eintrag versteckt', () => {
    const onVr = vi.fn();
    const m = make({ onVr, getVr: () => true });
    vrBtn(m.host).click();
    expect(onVr).toHaveBeenCalledTimes(1);
    m.p.destroy();
    const n = make();
    expect(vrBtn(n.host).hidden).toBe(true);
    n.p.destroy();
  });
});

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

describe('Pause-Menue: Touch-Steuerung', () => {
  const entryOf = (host) => [...host.querySelectorAll('.lfx-store-pause-panel > button')].find((b) => b.textContent === 'Touch-Steuerung …');
  it('Eintrag nur mit Touch-Callbacks', () => {
    const { host, p } = make();
    expect(entryOf(host).hidden).toBe(true);
    p.destroy();
  });
  it('Untermenue schaltet Werte', () => {
    const tune = { holdInvertY: false, holdInvertX: false, lookFlipY: false, lookFlipX: false, touchSens: 'normal', touchRegrip: 'short' };
    let scheme = 'joystick';
    const { host, p } = make({
      onTouchControl: (s) => { scheme = s; }, getTouchControl: () => scheme,
      onTouchTune: (t) => Object.assign(tune, t), getTouchTune: () => tune,
    });
    const entry = entryOf(host);
    expect(entry.hidden).toBe(false);
    expect(p.pickOpen).toBe(false);
    entry.click();
    expect(p.pickOpen).toBe(true);
    const btn = (t) => [...host.querySelectorAll('.lfx-store-touchpick button')].find((b) => b.textContent.startsWith(t));
    expect(btn('Cover kippen').textContent).toBe('Cover kippen: Normal');
    btn('Cover kippen').click();
    expect(tune.holdInvertY).toBe(true);
    expect(btn('Cover kippen').textContent).toBe('Cover kippen: Umgekehrt');
    btn('Cover drehen').click();
    btn('Umschauen hoch/runter').click();
    btn('Umschauen links/rechts').click();
    expect(tune).toMatchObject({ holdInvertX: true, lookFlipY: true, lookFlipX: true });
    btn('Empfindlichkeit').click();
    expect(tune.touchSens).toBe('high');
    btn('Empfindlichkeit').click();
    expect(tune.touchSens).toBe('low');
    expect(btn('Empfindlichkeit').textContent).toBe('Empfindlichkeit: Niedrig');
    expect(btn('Umschauen hoch/runter').textContent).toBe('Umschauen hoch/runter: Umgekehrt');
    expect(btn('Umgreifen').hidden).toBe(true); // Joystick: kein Umgreifen
    btn('Steuerung').click();
    expect(scheme).toBe('touch');
    expect(btn('Umgreifen').hidden).toBe(false);
    expect(btn('Umgreifen').textContent).toBe('Umgreifen: Kurz');
    btn('Umgreifen').click();
    expect(tune.touchRegrip).toBe('long');
    expect(btn('Umgreifen').textContent).toBe('Umgreifen: Lang');
    btn('Umgreifen').click();
    expect(tune.touchRegrip).toBe('off');
    expect(btn('Umgreifen').textContent).toBe('Umgreifen: Aus');
    btn('Umgreifen').click();
    expect(tune.touchRegrip).toBe('short');
    expect(btn('Steuerung').textContent).toBe('Steuerung: Touch');
    btn('Zurück').click();
    expect(p.pickOpen).toBe(false);
    p.destroy();
  });
});

describe('Pause-Menue: Fokus', () => {
  const tab = (host, shiftKey = false) => { const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }); host.querySelector('.lfx-store-pause').dispatchEvent(e); return e; };
  it('aria-modal an allen Panels', () => {
    const { host, p } = make();
    expect(host.querySelector('.lfx-store-pause-panel').getAttribute('aria-modal')).toBe('true');
    expect(host.querySelector('.lfx-store-voicepick-panel').getAttribute('aria-modal')).toBe('true');
    p.destroy();
  });
  it('Tab kreist im Panel statt es zu verlassen', () => {
    const { host, p } = make();
    p.show();
    const btns = [...host.querySelectorAll('.lfx-store-pause-panel > button')].filter((b) => !b.hidden && !b.disabled);
    btns[btns.length - 1].focus();
    const e = tab(host);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(btns[0]);
    const e2 = tab(host, true);
    expect(e2.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(btns[btns.length - 1]);
    p.destroy();
  });
  it('Unterpanel sperrt das Pause-Panel (inert) und fängt Tab', () => {
    const tune = {};
    const { host, p } = make({ onTouchControl() {}, getTouchControl: () => 'touch', onTouchTune() {}, getTouchTune: () => tune });
    p.show();
    const panel = host.querySelector('.lfx-store-pause-panel');
    expect(panel.hasAttribute('inert')).toBe(false);
    [...panel.querySelectorAll('button')].find((b) => b.textContent === 'Touch-Steuerung …').click();
    expect(panel.hasAttribute('inert')).toBe(true);
    const inner = [...host.querySelectorAll('.lfx-store-touchpick button')].filter((b) => !b.hidden);
    inner[inner.length - 1].focus();
    tab(host);
    expect(document.activeElement).toBe(inner[0]);
    p.closePick();
    expect(panel.hasAttribute('inert')).toBe(false);
    p.destroy();
  });
});

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
  it('bei Ton aus unsichtbar, aber Platz reserviert; ohne Info versteckt', () => {
    const { host, p, setSound } = make();
    setSound(false);
    p.refresh();
    expect(note(host).hidden).toBe(false);
    expect(note(host).style.visibility).toBe('hidden');
    setSound(true);
    p.refresh();
    expect(note(host).style.visibility).toBe('');
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
    expect(btn(host, /^Stimme:/).hidden).toBe(false); // bleibt im Layout, nur gesperrt
    expect(btn(host, /^Stimme:/).disabled).toBe(true);
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

describe('Pause-Menue: Mehrspieler', () => {
  const entryOf = (host) => [...host.querySelectorAll('.lfx-store-pause-panel > button')].find((b) => b.textContent === 'Mehrspieler …');
  it('ohne getMp kein Eintrag', () => {
    const { host, p } = make();
    expect(entryOf(host).hidden).toBe(true);
    p.destroy();
  });
  it('Eintrag öffnet die Unterebene, rendert den Inhalt und schließt per Zurück/closePick', () => {
    const render = vi.fn((el) => { el.textContent = 'Inhalt'; });
    const { host, p } = make({ getMp: () => ({ label: 'Mehrspieler …' }), renderMp: render });
    p.show();
    const entry = entryOf(host);
    expect(entry.hidden).toBe(false);
    expect(p.pickOpen).toBe(false);
    entry.click();
    expect(p.pickOpen).toBe(true);
    expect(host.querySelector('.lfx-store-mppick').hidden).toBe(false);
    expect(host.querySelector('.lfx-store-mpbody').textContent).toBe('Inhalt');
    expect(host.querySelector('.lfx-store-pause-panel').hasAttribute('inert')).toBe(true);
    const n = render.mock.calls.length;
    p.refresh();
    expect(render.mock.calls.length).toBeGreaterThan(n);
    host.querySelector('.lfx-store-mppick .lfx-store-act--primary').click();
    expect(p.pickOpen).toBe(false);
    expect(host.querySelector('.lfx-store-pause-panel').hasAttribute('inert')).toBe(false);
    entry.click();
    p.closePick();
    expect(p.pickOpen).toBe(false);
    p.destroy();
  });
  it('fällt getMp während offener Ebene auf null, schließt sie', () => {
    let on = true;
    const { host, p } = make({ getMp: () => (on ? { label: 'Mehrspieler …' } : null), renderMp: () => {} });
    p.show();
    entryOf(host).click();
    expect(p.pickOpen).toBe(true);
    on = false;
    p.refresh();
    expect(p.pickOpen).toBe(false);
    expect(entryOf(host).hidden).toBe(true);
    p.destroy();
  });
});

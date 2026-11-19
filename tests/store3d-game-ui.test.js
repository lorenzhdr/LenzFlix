// @vitest-environment jsdom
// VIDEOTHEK LENZ: Pause-Menü (Dreier-Zyklus Steuerung, Tastenhilfe), HUD-Texte je Schema, Hände (Schwung, Tragen).
import { describe, it, expect, vi } from 'vitest';
import { PerspectiveCamera } from 'three';
import { createPause } from '../src/js/store3d/ui/pause.js';
import { createHud, promptTexts, DESKTOP_HELP } from '../src/js/store3d/ui/hud.js';
import { createHands, SWING_DUR } from '../src/js/store3d/ui/hands.js';

const base = () => ({
  onResume() {}, onSearch() {}, onClassic() {}, onQuality() {}, onSound() {}, onFps() {}, onBigCovers() {}, onTheme() {}, onMenu() {},
  getQuality: () => 'auto', getSound: () => true, getFps: () => false, getBigCovers: () => true,
});

describe('Pause-Menü', () => {
  const btnOf = (host, t) => [...host.querySelectorAll('.lfx-store-touchpick button')].find((b) => b.textContent.startsWith(t));
  it('Steuerung: Dreier-Zyklus Spiel -> Joystick -> Touch -> Spiel', () => {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    document.body.appendChild(host);
    let scheme = 'game';
    const seq = [];
    const p = createPause(host, { ...base(), onTouchControl: (s) => { scheme = s; seq.push(s); }, getTouchControl: () => scheme });
    [...host.querySelectorAll('.lfx-store-pause-panel > button')].find((b) => b.textContent === 'Touch-Steuerung …').click();
    expect(btnOf(host, 'Steuerung').textContent).toBe('Steuerung: Spiel');
    btnOf(host, 'Steuerung').click();
    expect(btnOf(host, 'Steuerung').textContent).toBe('Steuerung: Joystick');
    btnOf(host, 'Steuerung').click();
    expect(btnOf(host, 'Steuerung').textContent).toBe('Steuerung: Touch');
    expect(btnOf(host, 'Umgreifen').hidden).toBe(false); // nur bei Touch
    btnOf(host, 'Steuerung').click();
    expect(seq).toEqual(['joystick', 'touch', 'game']);
    expect(btnOf(host, 'Umgreifen').hidden).toBe(true);
    p.destroy();
  });
  it('Tastenhilfe (Desktop) mit neuen Tasten', () => {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    document.body.appendChild(host);
    const p = createPause(host, { ...base(), help: DESKTOP_HELP });
    const help = host.querySelector('.lfx-store-pause-help');
    expect(help.textContent).toMatch(/Leertaste\sspringen/);
    expect(help.textContent).toMatch(/F\sschlagen/);
    expect(help.textContent).toMatch(/G\swerfen/);
    p.destroy();
    document.body.innerHTML = '';
    const host2 = document.createElement('div');
    document.body.appendChild(host2);
    createPause(host2, base());
    expect(host2.querySelector('.lfx-store-pause-help')).toBe(null);
  });
});

describe('HUD-Texte', () => {
  it('Desktop-Hilfe nennt Springen, Schlagen, Werfen', () => {
    expect(DESKTOP_HELP).toMatch(/Leertaste\sspringen/);
    expect(DESKTOP_HELP).toMatch(/F\sschlagen/);
    expect(DESKTOP_HELP).toMatch(/G\swerfen/);
    document.body.innerHTML = '';
    const host = document.createElement('div');
    document.body.appendChild(host);
    createHud(host, { touch: false });
    expect(host.querySelector('.lfx-store-prompt-sub').textContent).toBe(DESKTOP_HELP);
  });
  it('Touch: Texte je Schema, das Schema wird bei jedem Anzeigen neu gelesen', () => {
    expect(promptTexts('game')[0]).toBe('Links laufen · rechts umsehen');
    expect(promptTexts('game')[1]).toMatch(/Tippen zum Nehmen/);
    expect(promptTexts('touch')[0]).toBe('Gedrückt halten zum Laufen');
    document.body.innerHTML = '';
    const host = document.createElement('div');
    document.body.appendChild(host);
    let scheme = 'game';
    const hud = createHud(host, { touch: true, getTouchScheme: () => scheme });
    expect(host.querySelector('.lfx-store-prompt-title').textContent).toBe('Links laufen · rechts umsehen');
    scheme = 'touch';
    hud.showPrompt(true, false);
    expect(host.querySelector('.lfx-store-prompt-title').textContent).toBe('Gedrückt halten zum Laufen');
    expect(host.querySelector('.lfx-store-prompt-sub').textContent).toBe('Wischen zum Umsehen · Tippen zum Nehmen');
  });
});

describe('Hände', () => {
  it('Schlag-Schwung: Faust nur während des Schwungs sichtbar', () => {
    const cam = new PerspectiveCamera();
    const h = createHands(cam);
    const fist = h.group.children[0];
    expect(fist.visible).toBe(false);
    h.swing();
    expect(h.swinging).toBe(true);
    h.update(SWING_DUR / 2);
    expect(fist.visible).toBe(true);
    h.update(SWING_DUR);
    expect(fist.visible).toBe(false);
    expect(h.swinging).toBe(false);
    h.dispose();
    expect(cam.children.length).toBe(0);
  });
  it('Tragen: Modell setzen/entfernen, Wurf-Animation, Sichtbarkeit', () => {
    const cam = new PerspectiveCamera();
    const h = createHands(cam);
    const carryGroup = h.group.children[1];
    expect(carryGroup.visible).toBe(false);
    h.setCarried({ media: 'box' });
    expect(h.carrying).toBe(true);
    expect(carryGroup.visible).toBe(true);
    expect(carryGroup.children.length).toBe(1);
    const z0 = carryGroup.position.z;
    h.throwAnim();
    h.update(0.17);
    expect(carryGroup.position.z).toBeLessThan(z0);
    h.update(0.5);
    expect(carryGroup.position.z).toBeCloseTo(z0, 9);
    h.setVisible(false);
    expect(h.group.visible).toBe(false);
    h.setCarried({ media: 'vhs' }); // ersetzt
    expect(carryGroup.children.length).toBe(1);
    h.setCarried(null);
    expect(h.carrying).toBe(false);
    expect(carryGroup.children.length).toBe(0);
    h.dispose();
    vi.restoreAllMocks();
  });
});

describe('Pause-Menü: Diagnosezeile im Touch-Panel', () => {
  const open = (host) => [...host.querySelectorAll('.lfx-store-pause-panel > button')].find((b) => b.textContent === 'Touch-Steuerung …').click();
  it('zeigt die Zeile aus getInputInfo, aktualisiert sie jede Sekunde und blendet sie ohne Text aus', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    const host = document.createElement('div');
    document.body.appendChild(host);
    let info = 'Eingabe: 0 Finger · keine Abbrüche';
    const p = createPause(host, { ...base(), onTouchControl() {}, getTouchControl: () => 'game', getInputInfo: () => info });
    const note = () => host.querySelector('.lfx-store-pause-diag');
    expect(note().hidden).toBe(true);
    open(host);
    expect(note().hidden).toBe(false);
    expect(note().textContent).toBe('Eingabe: 0 Finger · keine Abbrüche');
    expect(note().classList.contains('lfx-store-pause-note')).toBe(true);
    info = 'Eingabe: 1 Finger (Stick) · keine Abbrüche';
    vi.advanceTimersByTime(1000);
    expect(note().textContent).toBe('Eingabe: 1 Finger (Stick) · keine Abbrüche');
    info = null;
    vi.advanceTimersByTime(1000);
    expect(note().hidden).toBe(true);
    p.closePick();
    info = 'neu';
    vi.advanceTimersByTime(3000);
    expect(note().textContent).toBe(''); // Timer läuft nur bei offenem Panel
    p.destroy();
    vi.useRealTimers();
  });
  it('ohne getInputInfo bleibt die Zeile ausgeblendet', () => {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    document.body.appendChild(host);
    const p = createPause(host, { ...base(), onTouchControl() {}, getTouchControl: () => 'touch' });
    open(host);
    expect(host.querySelector('.lfx-store-pause-diag').hidden).toBe(true);
    p.destroy();
  });
});

describe('HUD Menüknopf (Mehrfinger)', () => {
  it('touchend mit weiterem liegenden Finger öffnet das Menü einmal, folgendes click wird geschluckt', () => {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onMenu = vi.fn();
    createHud(host, { touch: true, onMenu, getTouchScheme: () => 'game' });
    const btn = host.querySelector('.lfx-store-menubtn');
    const te = new Event('touchend', { bubbles: true, cancelable: true });
    Object.defineProperty(te, 'touches', { value: [{ identifier: 1 }] });
    btn.dispatchEvent(te);
    expect(onMenu).toHaveBeenCalledTimes(1);
    btn.click();
    expect(onMenu).toHaveBeenCalledTimes(1);
  });
  it('einzelner Tipp (kein weiterer Finger) läuft wie bisher über click', () => {
    document.body.innerHTML = '';
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onMenu = vi.fn();
    createHud(host, { touch: true, onMenu, getTouchScheme: () => 'game' });
    const btn = host.querySelector('.lfx-store-menubtn');
    const te = new Event('touchend', { bubbles: true, cancelable: true });
    Object.defineProperty(te, 'touches', { value: [] });
    btn.dispatchEvent(te);
    expect(onMenu).not.toHaveBeenCalled();
    btn.click();
    expect(onMenu).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { chartInfoButton, syncChartInfo } from '../src/js/shared/chartinfo.js';
import { closeChooser, isChooserOpen } from '../src/js/core/sheet.js';

const RULES = { halfLifeDays: 7, minSecondsMovie: 800, minSecondsEpisode: 300 };
const chart = (kind, over = {}) => ({ kind, rules: { ...RULES, ...(over.rules || {}) }, windowDays: over.windowDays ?? 30 });

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.className = '';
  window.matchMedia = vi.fn(() => ({ matches: false }));
});
afterEach(() => closeChooser());

function openFor(c) {
  const btn = chartInfoButton(c);
  document.body.append(btn);
  btn.focus();
  btn.click();
  return btn;
}
const sheetText = () => document.querySelector('.lfx-chartinfo-sheet').textContent;

describe('chartInfoButton', () => {
  it('null ohne chart oder rules', () => {
    expect(chartInfoButton(null)).toBeNull();
    expect(chartInfoButton({ kind: 'series' })).toBeNull();
    expect(chartInfoButton({ kind: 'series', rules: null })).toBeNull();
  });

  it('Attribute, Klassen und Icon; keine Karten-Klasse', () => {
    const btn = chartInfoButton(chart('series'), { className: 'extra' });
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.type).toBe('button');
    expect(btn.className).toBe('lfx-chartinfo-btn extra');
    expect(btn.getAttribute('aria-label')).toBe('So entsteht die Liste');
    expect(btn.getAttribute('aria-haspopup')).toBe('dialog');
    expect(btn.title).toBe('So entsteht die Liste');
    expect(btn.querySelector('svg')).not.toBeNull();
    expect(btn.classList.contains('lfx-card')).toBe(false);
    expect(btn.hasAttribute('data-lfx-id')).toBe(false);
  });

  it('Klick öffnet das Sheet mit Titel und Schließen-Knopf', () => {
    openFor(chart('series'));
    expect(isChooserOpen()).toBe(true);
    const sheet = document.querySelector('.lfx-chartinfo-sheet');
    expect(sheet.querySelector('.lfx-sheet__title').textContent).toBe('So entsteht die Liste');
    const close = sheet.querySelector('.lfx-chartinfo__close');
    expect(close.getAttribute('aria-label')).toBe('Schließen');
    expect(document.activeElement).toBe(close);
  });

  it('Serien: Treppe, Minuten, Fenster, Balken', () => {
    openFor(chart('series'));
    const t = sheetText();
    expect(t).toContain('in den letzten 30 Tagen');
    expect(t).toContain('ab 5\u00a0Min.');
    expect(t).toContain('Viel schauen zählt mehr, aber abnehmend');
    const steps = [...document.querySelectorAll('.lfx-chartinfo__step')];
    expect(steps.length).toBe(4);
    expect(steps.map((s) => s.querySelectorAll('.lfx-chartinfo__dot').length)).toEqual([1, 2, 3, 4]);
    expect(steps[0].textContent).toContain('1 Folge');
    expect(steps[0].textContent).toContain('1 Punkt');
    expect(steps[3].textContent).toContain('15 Folgen');
    expect(steps[3].textContent).toContain('4 Punkte');
    expect(document.querySelector('.lfx-chartinfo__dots').getAttribute('aria-hidden')).toBe('true');
    const bars = [...document.querySelectorAll('.lfx-chartinfo__bar')];
    expect(bars.map((b) => b.querySelector('.lfx-chartinfo__fill').style.width)).toEqual(['100%', '50%', '25%']);
    expect(bars.map((b) => b.querySelector('.lfx-chartinfo__bar-l').textContent)).toEqual(['heute', 'vor 7 Tagen', 'vor 14 Tagen']);
    expect(bars.map((b) => b.querySelector('.lfx-chartinfo__bar-v').textContent)).toEqual(['1', '½', '¼']);
    expect(t).toContain('Das gilt pro Person, die Punkte aller Personen werden addiert.');
    expect(t).toContain('Eine Folge von vor 7 Tagen zählt nur noch halb so viel.');
  });

  it('Filme: Minuten, höchstens 1 Punkt, Balken, kein Treppenteil', () => {
    openFor(chart('movies'));
    const t = sheetText();
    expect(t).toContain('ab 13\u00a0Min.');
    expect(t).not.toContain('Min..');
    expect(t).toContain('höchstens 1 Punkt');
    expect(t).toContain('Wer den Film vor 7 Tagen gesehen hat, zählt nur noch halb.');
    expect(document.querySelectorAll('.lfx-chartinfo__step').length).toBe(0);
    expect(document.querySelectorAll('.lfx-chartinfo__bar').length).toBe(3);
    // Worker ohne ageUnit (1.21.0): kein Hinweis auf Tage/Gleichstand
    expect(t).not.toContain('selben Tag');
    expect(t).not.toContain('Bei Gleichstand');
  });

  it('Filme mit ageUnit day: gleicher Tag zählt gleich, Gleichstand nach gesehenem Anteil', () => {
    openFor(chart('movies', { rules: { ageUnit: 'day' } }));
    const t = sheetText();
    expect(t).toContain('Abrufe vom selben Tag zählen gleich. Wer den Film vor 7 Tagen gesehen hat, zählt nur noch halb.');
    expect(t).toContain('Bei Gleichstand');
    expect(t).toContain('Zweimal ganz geschaut liegt vor zweimal halb geschaut');
    closeChooser();
    openFor(chart('series', { rules: { ageUnit: 'day' } }));
    expect(sheetText()).not.toContain('Bei Gleichstand');
  });

  it('andere rules-Werte fließen ein; Plural und Minuten-Auslassung', () => {
    openFor(chart('series', { rules: { halfLifeDays: 3, minSecondsEpisode: 30 }, windowDays: 14 }));
    const t = sheetText();
    expect(t).toContain('vor 3 Tagen');
    expect(t).toContain('vor 6 Tagen');
    expect(t).toContain('in den letzten 14 Tagen');
    expect(t).not.toContain('Eine Folge zählt ab');
    closeChooser();
    openFor(chart('movies', { rules: { halfLifeDays: 1 } }));
    expect(sheetText()).toContain('vor 1 Tag ');
    expect(sheetText()).toContain('vor 2 Tagen');
  });

  it('Schließen-Knopf schließt und gibt den Fokus zurück', () => {
    const btn = openFor(chart('series'));
    document.querySelector('.lfx-chartinfo__close').click();
    expect(isChooserOpen()).toBe(false);
    expect(document.activeElement).toBe(btn);
  });

  it('Esc schließt und gibt den Fokus zurück', () => {
    const btn = openFor(chart('movies'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(isChooserOpen()).toBe(false);
    expect(document.activeElement).toBe(btn);
  });

  it('Tab bleibt im Sheet (Fokusfalle)', () => {
    openFor(chart('series'));
    const close = document.querySelector('.lfx-chartinfo__close');
    const ev = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
  });
});

describe('syncChartInfo', () => {
  const head = () => {
    const el = document.createElement('div');
    el.innerHTML = '<h2 class="lfx-row__title">Titel</h2><div class="lfx-row__pages"></div>';
    document.body.append(el);
    return el;
  };

  it('fügt den Knopf direkt hinter dem Titel ein und ersetzt statt zu verdoppeln', () => {
    const el = head();
    const first = syncChartInfo(el, chart('series'));
    expect(el.children[1]).toBe(first);
    expect(el.children[2].className).toBe('lfx-row__pages');
    const second = syncChartInfo(el, chart('movies'));
    expect(el.querySelectorAll('.lfx-chartinfo-btn').length).toBe(1);
    expect(el.children[1]).toBe(second);
    expect(second).not.toBe(first);
  });

  it('entfernt den Knopf ohne chart oder rules', () => {
    const el = head();
    syncChartInfo(el, chart('series'));
    expect(syncChartInfo(el, null)).toBeNull();
    expect(el.querySelector('.lfx-chartinfo-btn')).toBeNull();
    syncChartInfo(el, chart('series'));
    syncChartInfo(el, { kind: 'series', rules: null });
    expect(el.querySelector('.lfx-chartinfo-btn')).toBeNull();
  });

  it('before: vor dem angegebenen Knoten; className wird durchgereicht', () => {
    const el = head();
    const pages = el.querySelector('.lfx-row__pages');
    const btn = syncChartInfo(el, chart('series'), { before: pages, className: 'x' });
    expect(btn.nextElementSibling).toBe(pages);
    expect(btn.classList.contains('x')).toBe(true);
  });

  it('ohne Kopf: null', () => {
    expect(syncChartInfo(null, chart('series'))).toBeNull();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEpg } from '../src/js/live/ui/epg.js';
import { makeCtx, flush, NOW, H, dayOf } from './live-overlay-stub.js';

let ctx;
let epg;
const rows = () => [...epg.el.querySelectorAll('.lfx-live-epg__row[data-no]')];
const focusEl = () => epg.el.querySelector('.lfx-live-epg__ev.is-focus');

beforeEach(async () => {
  document.body.innerHTML = '';
  ctx = makeCtx();
  epg = createEpg(ctx);
  document.body.append(epg.el);
  epg.open();
  await flush();
});

describe('EPG', () => {
  it('rendert 18 Zeilen mit Nummer und Name', () => {
    expect(rows()).toHaveLength(18);
    expect(rows()[0].textContent).toContain('Sender1');
    expect(epg.isOpen()).toBe(true);
    expect(epg.el.hidden).toBe(false);
  });

  it('zeigt heute plus 6 Tage in der Tagesleiste und markiert heute', () => {
    const days = [...epg.el.querySelectorAll('.lfx-live-epg__day')];
    expect(days).toHaveLength(7);
    expect(days[0].textContent).toBe('Mi 11.11.');
    expect(days[0].classList.contains('is-active')).toBe(true);
  });

  it('markiert die laufende Sendung je Sender und den aktuellen Sender', () => {
    for (const r of rows()) expect(r.querySelectorAll('.is-now')).toHaveLength(1);
    expect(epg.el.querySelectorAll('.lfx-live-epg__row.is-current')).toHaveLength(1);
    expect(epg.el.querySelector('.lfx-live-epg__row.is-current').dataset.no).toBe('1');
    expect(rows()[0].querySelector('.is-now').textContent).toContain('Titel');
  });

  it('rendert filler nicht als Block; fill mit Füllprogramm-Hinweis', () => {
    expect(epg.el.querySelectorAll('.is-filler')).toHaveLength(0);
    expect(rows()[0].querySelectorAll('.lfx-live-epg__ev')).toHaveLength(4);
    const fill = rows()[0].querySelector('.is-fill');
    expect(fill.textContent).toContain('Füllprogramm');
  });

  it('zeigt Sendeschluss und Thema als Zeilen-Untertitel', () => {
    expect(rows()[17].textContent).toContain('Sendeschluss');
    expect(rows()[16].querySelector('.lfx-live-epg__theme').textContent).toBe('Filmreihe Test');
  });

  it('zeigt Badges und Folgentitel', () => {
    const txt = rows()[0].textContent;
    expect(txt).toContain('Premiere');
    expect(txt).toContain('Neue Folge');
    expect(txt).toContain('Wdh.');
    expect(txt).toContain('ab 16');
    expect(txt).toContain('Serie – S1 E2 Titel');
  });

  it('Blockbreite ist proportional zur Dauer', () => {
    const evs = rows()[0].querySelectorAll('.lfx-live-epg__ev');
    expect(evs[0].style.width).toContain('* 90'); // 1,5 h
    expect(evs[3].style.width).toContain('* 540'); // 9 h
  });

  it('Tageswechsel per Farbtaste, rot nicht vor heute', async () => {
    expect(epg.onKey('red')).toBe(true);
    expect(epg.el.querySelector('.lfx-live-epg__day.is-active').textContent).toBe('Mi 11.11.');
    expect(epg.onKey('green')).toBe(true);
    await flush();
    expect(epg.el.querySelector('.lfx-live-epg__day.is-active').textContent).toBe('Do 12.11.');
    expect(rows()).toHaveLength(18);
    expect(epg.el.querySelectorAll('.is-now')).toHaveLength(0);
    for (let i = 0; i < 10; i++) epg.onKey('green');
    expect(epg.el.querySelector('.lfx-live-epg__day.is-active').textContent).toBe('Di 17.11.');
    epg.onKey('yellow');
    expect(epg.el.querySelector('.lfx-live-epg__day.is-active').textContent).toBe('Mi 11.11.');
    expect(epg.el.querySelectorAll('.is-now').length).toBe(18);
  });

  it('Tag per Klick', () => {
    epg.el.querySelectorAll('.lfx-live-epg__day')[2].click();
    expect(epg.el.querySelector('.lfx-live-epg__day.is-active').textContent).toBe('Fr 13.11.');
  });

  it('Pfeiltasten bewegen den Fokus', () => {
    const s0 = focusEl().dataset.start;
    expect(focusEl().dataset.no).toBe('1');
    epg.onKey('left');
    expect(focusEl().dataset.start).not.toBe(s0);
    epg.onKey('right');
    expect(focusEl().dataset.start).toBe(s0);
    epg.onKey('down');
    expect(focusEl().dataset.no).toBe('2');
    expect(focusEl().dataset.start).toBe(s0);
    epg.onKey('up');
    epg.onKey('up');
    expect(focusEl().dataset.no).toBe('1');
  });

  it('Detailbereich: Umschalten und Von vorne ansehen', () => {
    expect(epg.onKey('ok')).toBe(true);
    const d = epg.el.querySelector('.lfx-live-epg__detail');
    expect(d.hidden).toBe(false);
    expect(d.textContent).toContain('Serie – S1 E2 Titel');
    expect(d.textContent).toContain('läuft gerade');
    expect(d.textContent).toContain('In LENZFLIX ansehen');
    d.querySelector('[data-act="library"]').click();
    expect(ctx.leaveToLibrary).toHaveBeenCalledWith('e1', { type: 'episode', seriesId: 's1' });
    d.querySelector('[data-act="tune"]').click();
    expect(ctx.tune).toHaveBeenCalledWith(1);
    expect(ctx.closeOverlay).toHaveBeenCalled();
  });

  it('künftige Sendung: beginnt in X min, Umschalten schaltet trotzdem', () => {
    epg.close();
    ctx.now = () => NOW - 10 * H; // 10:15, nächste Sendung 20:00
    epg.open();
    epg.onKey('right');
    epg.onKey('blue'); // Details
    const d = epg.el.querySelector('.lfx-live-epg__detail');
    expect(d.textContent).toMatch(/beginnt in/);
    epg.onKey('ok'); // erster Knopf = Umschalten
    expect(ctx.tune).toHaveBeenCalledWith(1);
  });

  it('back: Detail schließen (true), sonst false', () => {
    expect(epg.onKey('back')).toBe(false);
    epg.onKey('ok');
    expect(epg.onKey('back')).toBe(true);
    expect(epg.el.querySelector('.lfx-live-epg__detail').hidden).toBe(true);
    expect(epg.onKey('back')).toBe(false);
    expect(epg.onKey('3')).toBe(false);
  });

  it('close/isOpen und Klick auf Sendung öffnet Details', () => {
    focusEl().click();
    expect(epg.el.querySelector('.lfx-live-epg__detail').hidden).toBe(false);
    epg.close();
    expect(epg.isOpen()).toBe(false);
    expect(epg.onKey('ok')).toBe(false);
  });

  it('scrollt beim Öffnen horizontal Richtung „jetzt“', () => {
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 150, height: 10, top: 0, left: 0, right: 150, bottom: 10 });
    const store = new WeakMap();
    Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
    Object.defineProperty(Element.prototype, 'scrollLeft', {
      configurable: true,
      get() {
        return store.get(this) || 0;
      },
      set(v) {
        store.set(this, v);
      },
    });
    try {
      epg.close();
      epg.open();
      // 20:15 = 915 min nach Sendetagsbeginn 05:00 → 915 * 5 px/min, Linie bei 22 % der sichtbaren Zeitleiste (1000 - 150 px)
      expect(epg.el.querySelector('.lfx-live-epg__scroller').scrollLeft).toBeCloseTo(915 * 5 - 850 * 0.22, -1);
    } finally {
      rect.mockRestore();
      delete Element.prototype.scrollLeft;
      delete Element.prototype.clientWidth;
    }
  });

  it('tick verschiebt die Jetzt-Linie', () => {
    const line = epg.el.querySelector('.lfx-live-epg__nowline');
    const before = line.style.left;
    ctx.now = () => NOW + 10 * 60000;
    epg.tick(ctx.now());
    expect(line.style.left).not.toBe(before);
    expect(dayOf(NOW)).toBeGreaterThan(0);
  });
});

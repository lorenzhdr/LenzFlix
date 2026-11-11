// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createEpg } from '../src/js/live/ui/epg.js';
import { makeCtx, makeScheduler, flush, NOW, H, DAY, dayOf, bounds } from './live-overlay-stub.js';

const CSS = readFileSync(resolve(import.meta.dirname, '../src/css/themes/live/epg.css'), 'utf8');
const MINUTE = 60000;

let ctx;
let epg;
let restore = [];
const q = (sel) => epg.el.querySelector(sel);
const qa = (sel) => [...epg.el.querySelectorAll(sel)];
const scroller = () => q('.lfx-live-epg__scroller');
const row1 = () => q('.lfx-live-epg__row[data-no="1"]');
const filledSecs = (row) => [...row.querySelectorAll('.lfx-live-epg__daysec')].filter((s) => s.children.length);
const activeDay = () => q('.lfx-live-epg__day.is-active').textContent;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Gemockte Maße: 5 px/Minute (Tick 150 px / 30 min), Senderspalte 150 px, Sichtbereich 1000 px. */
function mockLayout() {
  const store = new WeakMap();
  const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: 150, height: 10, top: 0, left: 0, right: 150, bottom: 10 });
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
  restore.push(() => {
    rect.mockRestore();
    delete Element.prototype.scrollLeft;
    delete Element.prototype.clientWidth;
  });
}

async function openEpg(over, opts) {
  document.body.innerHTML = '';
  ctx = makeCtx(over);
  epg = createEpg(ctx);
  document.body.append(epg.el);
  if (opts && opts.layout) mockLayout();
  epg.open();
  await flush();
}

beforeEach(() => {
  restore = [];
  vi.stubGlobal('requestAnimationFrame', (cb) => {
    cb();
    return 1;
  });
});
afterEach(() => {
  epg.close();
  restore.forEach((f) => f());
  vi.unstubAllGlobals();
});

describe('EPG: mitlaufender Text bei knapp sichtbaren Blöcken', () => {
  it('setzt --lfx-live-epg-vis für links überstehende Blöcke und entfernt sie wieder', async () => {
    await openEpg({}, { layout: true });
    await wait(200);
    scroller().dispatchEvent(new Event('scroll'));
    await flush();
    const evs = qa('.lfx-live-epg__ev');
    expect(evs.length).toBeGreaterThan(2);
    const [a, b] = evs;
    // Senderspalte 150 px (Mock) → sichtbarer Rand bei 150; a ragt links hinein (Rest 50 px), b liegt rechts davon
    const setRect = (n, r) => Object.defineProperty(n, 'getBoundingClientRect', { configurable: true, value: () => r });
    setRect(a, { left: 20, right: 200, width: 180, top: 0, bottom: 10 });
    setRect(b, { left: 300, right: 500, width: 200, top: 0, bottom: 10 });
    scroller().dispatchEvent(new Event('scroll'));
    await flush();
    const vis = parseFloat(a.style.getPropertyValue('--lfx-live-epg-vis'));
    expect(vis).toBeGreaterThan(30);
    expect(vis).toBeLessThan(50);
    expect(b.style.getPropertyValue('--lfx-live-epg-vis')).toBe('');
    setRect(a, { left: 160, right: 400, width: 240, top: 0, bottom: 10 });
    scroller().dispatchEvent(new Event('scroll'));
    await flush();
    expect(a.style.getPropertyValue('--lfx-live-epg-vis')).toBe('');
  });
});

describe('EPG: Zeitachse und lazy Tage', () => {
  it('Gesamtbreite aus den echten Tagesgrenzen (25-h-Tag bei Zeitumstellung)', async () => {
    const t0 = Date.UTC(2026, 9, 22, 20, 15); // Do 22.10.2026
    const D0 = dayOf(t0);
    const start = (D) => D * DAY + 5 * H + (D > D0 + 1 ? H : 0); // Tag D0+1 dauert 25 h
    const dayBounds = (D) => ({ start: start(D), end: start(D + 1) });
    const planDay = (no, D) => [{ start: dayBounds(D).start, end: dayBounds(D).end, type: 'program', itemId: 'm1' }];
    await openEpg({ now: () => t0, dayBounds, scheduler: makeScheduler({ planDay }) });
    const total = (dayBounds(D0 + 6).end - dayBounds(D0).start) / MINUTE;
    expect(total).toBe(7 * 1440 + 60);
    expect(q('.lfx-live-epg__inner').style.getPropertyValue('--lfx-live-epg-total')).toBe(String(total));
    const secs = [...row1().querySelectorAll('.lfx-live-epg__daysec')];
    expect(secs).toHaveLength(7);
    expect(secs[1].style.width).toContain('* 1500');
    expect(secs[2].style.left).toContain('* 2940');
    // 25 h = 50 Ticks, Tagesmarker an jeder Tagesgrenze
    const ticks = qa('.lfx-live-epg__ruler .lfx-live-epg__tick');
    expect(ticks).toHaveLength(6 * 48 + 50);
    expect(qa('.lfx-live-epg__daymark')).toHaveLength(7);
    expect(qa('.lfx-live-epg__daymark')[1].textContent).toBe('Fr 23.10.');
  });

  it('höchstens drei Tagesabschnitte mit Inhalt; Fenster folgt dem Sichtbereich', async () => {
    await openEpg(null, { layout: true });
    const D0 = dayOf(NOW);
    expect(filledSecs(row1()).map((s) => s.dataset.day)).toEqual([String(D0), String(D0 + 1)]);
    await wait(200);
    scroller().scrollLeft = 3 * 1440 * 5 + 100; // Tag 4 unter der Mitte
    scroller().dispatchEvent(new Event('scroll'));
    expect(filledSecs(row1()).map((s) => s.dataset.day)).toEqual([2, 3, 4].map((i) => String(D0 + i)));
    for (let i = 0; i < 10; i++) epg.onKey('green');
    expect(filledSecs(row1()).length).toBeLessThanOrEqual(3);
  });

  it('prepare wird je gerendertem Tag aufgerufen', async () => {
    await openEpg();
    const D0 = dayOf(NOW);
    expect(ctx.scheduler.prepare).toHaveBeenCalledWith([D0]);
    expect(ctx.scheduler.prepare).toHaveBeenCalledWith([D0 + 1]);
    expect(ctx.scheduler.prepare).not.toHaveBeenCalledWith([D0 + 3]);
  });
});

describe('EPG: Tagesauswahl und Scrollposition', () => {
  it('aktiver Tag und Senderspalte folgen scrollLeft', async () => {
    await openEpg(null, { layout: true });
    await wait(200);
    expect(activeDay()).toBe('Mi 11.11.');
    // Mitte des Sichtbereichs = (scrollLeft + 425) / 5 Minuten
    scroller().scrollLeft = (2 * 1440 + 100) * 5 - 425;
    scroller().dispatchEvent(new Event('scroll'));
    expect(activeDay()).toBe('Fr 13.11.');
    expect(q('.lfx-live-epg__corner').textContent).toBe('Fr 13.11.');
    scroller().scrollLeft = 10;
    scroller().dispatchEvent(new Event('scroll'));
    expect(activeDay()).toBe('Mi 11.11.');
  });

  it('Tagesklick scrollt zu 05:00, heute zu jetzt', async () => {
    await openEpg(null, { layout: true });
    qa('.lfx-live-epg__day')[2].click();
    expect(scroller().scrollLeft).toBe(2 * 1440 * 5);
    expect(activeDay()).toBe('Fr 13.11.');
    qa('.lfx-live-epg__day')[0].click();
    expect(scroller().scrollLeft).toBeCloseTo(915 * 5 - 850 * 0.22, -1);
    expect(activeDay()).toBe('Mi 11.11.');
  });

  it('Tageswechsel per Rot/Grün/Gelb scrollt', async () => {
    await openEpg(null, { layout: true });
    epg.onKey('green');
    expect(scroller().scrollLeft).toBe(1440 * 5);
    epg.onKey('green');
    expect(scroller().scrollLeft).toBe(2 * 1440 * 5);
    epg.onKey('red');
    expect(scroller().scrollLeft).toBe(1440 * 5);
    epg.onKey('yellow');
    expect(scroller().scrollLeft).toBeCloseTo(915 * 5 - 850 * 0.22, -1);
  });

  it('Senderspalte zeigt Namen und Thema des aktiven Tages', async () => {
    const D0 = dayOf(NOW);
    const planDay = (no, D) => {
      const b = bounds(D);
      return [{ start: b.start, end: b.end, type: 'program', itemId: 'm1', ...(no === 3 && D === D0 + 1 ? { theme: 'Tag zwei' } : {}) }];
    };
    const names = { [D0]: 'Alpha', [D0 + 1]: 'Beta' };
    const channels = (D) => [3, 4].map((no) => ({ no, name: 'LIVE ' + (names[D] || 'X') + no, kind: 'special' }));
    await openEpg({ scheduler: makeScheduler({ planDay, channels }), channels: () => channels(D0) });
    const head = () => q('.lfx-live-epg__row[data-no="3"] .lfx-live-epg__chan');
    expect(head().querySelector('.lfx-live-epg__theme')).toBeNull();
    expect(head().textContent).toContain('Alpha3');
    epg.onKey('green');
    expect(head().querySelector('.lfx-live-epg__theme').textContent).toBe('Tag zwei');
    expect(head().textContent).toContain('Beta3');
    epg.onKey('red');
    expect(head().querySelector('.lfx-live-epg__theme')).toBeNull();
  });
});

describe('EPG: Eingabe', () => {
  it('Pfeilknöpfe verschieben um zwei Stunden, Jetzt springt zurück', async () => {
    await openEpg(null, { layout: true });
    const btn = (a) => q(`.lfx-live-epg__navbtn[data-act="${a}"]`);
    expect(btn('back').type).toBe('button');
    expect(btn('fwd').getAttribute('aria-label')).toBeTruthy();
    const x0 = scroller().scrollLeft;
    btn('fwd').click();
    expect(scroller().scrollLeft).toBe(x0 + 120 * 5);
    btn('back').click();
    btn('back').click();
    expect(scroller().scrollLeft).toBe(x0 - 120 * 5);
    qa('.lfx-live-epg__day')[3].click();
    btn('now').click();
    expect(scroller().scrollLeft).toBeCloseTo(915 * 5 - 850 * 0.22, -1);
    expect(activeDay()).toBe('Mi 11.11.');
  });

  const ptr = (type, x, y, extra) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(e, { clientX: x, clientY: y, pointerType: 'mouse', pointerId: 1, button: 0 }, extra || {});
    return e;
  };

  it('Maus-Ziehen verschiebt und unterdrückt den folgenden Klick', async () => {
    await openEpg(null, { layout: true });
    const s = scroller();
    const ev = row1().querySelector('.lfx-live-epg__ev');
    s.scrollLeft = 1000;
    ev.dispatchEvent(ptr('pointerdown', 500, 100));
    s.dispatchEvent(ptr('pointermove', 497, 100)); // unter der Schwelle
    expect(s.scrollLeft).toBe(1000);
    s.dispatchEvent(ptr('pointermove', 400, 100));
    expect(s.scrollLeft).toBe(1100);
    expect(s.classList.contains('is-dragging')).toBe(true);
    s.dispatchEvent(ptr('pointerup', 400, 100));
    expect(s.classList.contains('is-dragging')).toBe(false);
    ev.click();
    expect(q('.lfx-live-epg__detail').hidden).toBe(true);
    ev.click(); // der nächste Klick wirkt wieder
    expect(q('.lfx-live-epg__detail').hidden).toBe(false);
  });

  it('Touch-Zeiger lösen kein Ziehen aus', async () => {
    await openEpg(null, { layout: true });
    const s = scroller();
    s.scrollLeft = 500;
    s.dispatchEvent(ptr('pointerdown', 500, 100, { pointerType: 'touch' }));
    s.dispatchEvent(ptr('pointermove', 300, 100, { pointerType: 'touch' }));
    expect(s.scrollLeft).toBe(500);
    s.dispatchEvent(ptr('pointerup', 300, 100, { pointerType: 'touch' }));
    row1().querySelector('.lfx-live-epg__ev').click();
    expect(q('.lfx-live-epg__detail').hidden).toBe(false);
  });

  it('Mausrad über der Zeitleiste scrollt horizontal, sonst nativ', async () => {
    await openEpg(null, { layout: true });
    const s = scroller();
    s.scrollLeft = 200;
    const wheel = (target, o) => {
      const e = new Event('wheel', { bubbles: true, cancelable: true });
      Object.assign(e, { deltaX: 0, deltaY: 0, deltaMode: 0, shiftKey: false }, o);
      target.dispatchEvent(e);
      return e;
    };
    const tick = q('.lfx-live-epg__ruler .lfx-live-epg__tick');
    const e1 = wheel(tick, { deltaY: 120 });
    expect(e1.defaultPrevented).toBe(true);
    expect(s.scrollLeft).toBe(320);
    const e2 = wheel(row1().querySelector('.lfx-live-epg__ev'), { deltaY: 120 });
    expect(e2.defaultPrevented).toBe(false);
    expect(s.scrollLeft).toBe(320);
    expect(wheel(tick, { deltaY: 120, shiftKey: true }).defaultPrevented).toBe(false);
    expect(wheel(tick, { deltaX: 90, deltaY: 10 }).defaultPrevented).toBe(false);
  });

  it('links/rechts läuft über Tagesgrenzen, die Enden bleiben stehen', async () => {
    await openEpg();
    const D0 = dayOf(NOW);
    const foc = () => q('.lfx-live-epg__ev.is-focus');
    // Fokus: laufende Sendung 15–24 h = letzter Eintrag des Tages
    expect(foc().dataset.start).toBe(String(bounds(D0).start + 15 * H));
    epg.onKey('right');
    expect(foc().dataset.start).toBe(String(bounds(D0 + 1).start));
    expect(foc().closest('.lfx-live-epg__daysec').dataset.day).toBe(String(D0 + 1));
    epg.onKey('left');
    expect(foc().dataset.start).toBe(String(bounds(D0).start + 15 * H));
    for (let i = 0; i < 40; i++) epg.onKey('right');
    expect(foc().dataset.start).toBe(String(bounds(D0 + 6).start + 15 * H));
    expect(filledSecs(row1()).length).toBeLessThanOrEqual(3);
    for (let i = 0; i < 60; i++) epg.onKey('left');
    expect(foc().dataset.start).toBe(String(bounds(D0).start));
  });
});

describe('EPG: mitlaufender Text (CSS sticky)', () => {
  it('Blöcke tragen eine Textbox mit Titel, Zeit, Badges und Hinweis', async () => {
    await openEpg();
    const ev = row1().querySelector('.lfx-live-epg__ev');
    const text = ev.querySelector(':scope > .lfx-live-epg__ev-text');
    expect(text).not.toBeNull();
    expect(text.querySelector('.lfx-live-epg__ev-title')).not.toBeNull();
    expect(text.querySelector('.lfx-live-epg__time')).not.toBeNull();
    expect(row1().querySelector('.is-fill .lfx-live-epg__ev-text .lfx-live-epg__hint')).not.toBeNull();
  });

  it('CSS: Textbox sticky neben der Senderspalte, Block ohne Scroll-Container', () => {
    const rule = (sel) => {
      const m = CSS.match(new RegExp(sel.replace(/[.]/g, '\\.') + '\\s*\\{([^}]*)\\}'));
      return m ? m[1] : '';
    };
    const text = rule('.lfx-live-epg__ev-text');
    expect(text).toMatch(/position:\s*sticky/);
    expect(text).toMatch(/left:\s*calc\(var\(--lfx-live-epg-chan\)/);
    expect(text).toMatch(/width:\s*fit-content/);
    expect(text).toMatch(/max-width:\s*min\(100%, var\(--lfx-live-epg-vis, 100%\)\)/);
    expect(rule('.lfx-live-epg__ev')).toMatch(/overflow:\s*clip/);
    const sc = rule('.lfx-live-epg__scroller');
    expect(sc).toMatch(/touch-action:\s*pan-x pan-y/);
    expect(sc).toMatch(/overscroll-behavior:\s*contain/);
    expect(sc).toMatch(/cursor:\s*grab/);
  });
});

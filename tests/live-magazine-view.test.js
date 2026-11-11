// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMagazine, pairSpreads } from '../src/js/live/magazine/view.js';
import { createMagazineProp, PROP_MIN_PX } from '../src/js/live/magazine/prop.js';

const WD = ['Mi', 'Do', 'Fr', 'Sa', 'So', 'Mo', 'Di'];
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

function tip(i) {
  return { imageId: 'img' + i, itemId: 'it' + i, title: 'Film ' + i, sub: '', year: 2001, genres: ['Drama'], runMin: 90, channelNo: 1, channelName: 'LIVE Eins', time: '20:15', start: 1, badges: ['Premiere', 'ab 16'], age: 16, overview: 'Eine Geschichte.', kindLabel: 'Film' };
}
function channel(no) {
  return { no, name: 'LIVE Sender' + no, theme: null, rows: [{ time: '20:15', start: 1, title: 'Sendung ' + no, sub: 'S1 E3–E7', badges: ['ab 18'], kind: 'program' }, { time: '23:00', start: 2, title: 'Füllprogramm', sub: '', badges: [], kind: 'fill' }] };
}
function stubMagazine() {
  const days = WD.map((weekday, k) => ({ D: 100 + k, weekday, date: 11 + k + '.11.' }));
  const pages = [{ kind: 'cover', no: 1 }];
  days.forEach((d) => {
    const base = { D: d.D, weekday: d.weekday, date: d.date };
    pages.push({ kind: 'tips', no: pages.length + 1, ...base, tips: [tip(1), tip(2)], theme: null });
    pages.push({ kind: 'evening', no: pages.length + 1, ...base, channels: Array.from({ length: 18 }, (_, i) => channel(i + 1)) });
    pages.push({ kind: 'day', no: pages.length + 1, part: 1, ...base, channels: Array.from({ length: 9 }, (_, i) => channel(i + 1)) });
    pages.push({ kind: 'day', no: pages.length + 1, part: 2, ...base, channels: Array.from({ length: 9 }, (_, i) => channel(i + 10)) });
  });
  pages.push({ kind: 'back', no: pages.length + 1 });
  return { title: 'LIVE Programm', subtitle: 'Die Fernsehwoche', fileName: 'x.pdf', days, cover: { hero: tip(0), teasers: [{ D: 101, weekday: 'Do', label: 'Krimi-Tag' }] }, pages };
}

let ctx;
let mag;
let style;
const pagesIn = () => [...mag.el.querySelectorAll('.lfx-live-mag__page')];
const nos = () => pagesIn().map((p) => Number(p.dataset.no));
const info = () => mag.el.querySelector('.lfx-live-mag__pageinfo').textContent;

async function setup(over = {}) {
  style = 'flat';
  ctx = {
    style: () => style,
    imageUrl: vi.fn((id, o) => '/img/' + id + '?w=' + o.maxWidth),
    buildMagazine: vi.fn(() => Promise.resolve(stubMagazine())),
    downloadPdf: vi.fn(() => Promise.resolve({ url: 'blob:x', fileName: 'LIVE-Programm.pdf' })),
    toast: vi.fn(),
    closeOverlay: vi.fn(),
    mode: 'double',
    animate: false,
    ...over
  };
  document.body.innerHTML = '';
  mag = createMagazine(ctx);
  document.body.append(mag.el);
}

beforeEach(() => setup());
afterEach(() => vi.useRealTimers());

describe('Fernsehzeitung', () => {
  it('zeigt erst den Ladezustand, dann die Seiten; data-style folgt ctx.style()', async () => {
    style = 'silver';
    mag.open();
    expect(mag.isOpen()).toBe(true);
    expect(mag.el.hidden).toBe(false);
    expect(mag.el.dataset.style).toBe('silver');
    expect(mag.el.textContent).toContain('Heft wird gedruckt');
    expect(mag.el.getAttribute('role')).toBe('dialog');
    expect(mag.el.getAttribute('aria-label')).toBe('Fernsehzeitung');
    await flush();
    expect(mag.el.querySelector('.lfx-live-mag__status').hidden).toBe(true);
    expect(pagesIn().length).toBeGreaterThan(0);
    mag.close();
    style = 'crt80';
    mag.open();
    expect(mag.el.dataset.style).toBe('crt80');
  });

  it('meldet einen Fehler beim Drucken', async () => {
    ctx.buildMagazine.mockImplementation(() => Promise.reject(new Error('x')));
    mag.open();
    await flush();
    expect(mag.el.querySelector('.lfx-live-mag__status').textContent).toContain('nicht gedruckt');
    expect(pagesIn()).toHaveLength(0);
  });

  it('paart Doppelseiten: Cover allein, dann Paare, Rückseite allein', () => {
    const m = stubMagazine();
    const s = pairSpreads(m.pages, 'double');
    expect(s[0]).toEqual([null, 0]);
    expect(s[1]).toEqual([1, 2]);
    expect(s[2]).toEqual([3, 4]);
    expect(s[s.length - 1]).toEqual([29, null]);
    expect(s).toHaveLength(16);
    expect(m.pages[1].kind).toBe('tips');
    expect(m.pages[2].kind).toBe('evening');
    expect(m.pages[3].kind).toBe('day');
    expect(m.pages[4].part).toBe(2);
    expect(pairSpreads(m.pages, 'single')).toHaveLength(30);
  });

  it('rendert im Doppelseitenmodus nur die aktuelle Doppelseite und blättert', async () => {
    mag.open();
    await flush();
    expect(nos()).toEqual([1]);
    expect(info()).toBe('Seite 1 von 30');
    expect(mag.onKey('right')).toBe(true);
    expect(nos()).toEqual([2, 3]);
    expect(info()).toBe('Seite 2–3 von 30');
    expect(mag.onKey('right')).toBe(true);
    expect(nos()).toEqual([4, 5]);
    expect(mag.onKey('left')).toBe(true);
    expect(nos()).toEqual([2, 3]);
    expect(pagesIn().length).toBeLessThan(5);
    expect(mag.el.querySelector('.lfx-live-mag__book').classList.contains('is-double')).toBe(true);
  });

  it('Rückseite steht allein links; am Anfang/Ende bleibt es stehen', async () => {
    mag.open();
    await flush();
    mag.onKey('left');
    expect(nos()).toEqual([1]);
    for (let i = 0; i < 40; i++) mag.onKey('right');
    expect(nos()).toEqual([30]);
    expect(info()).toBe('Seite 30 von 30');
    expect(mag.el.querySelector('.is-left .lfx-live-mag__page').dataset.kind).toBe('back');
  });

  it('Einzelseitenmodus zeigt eine Seite', async () => {
    await setup({ mode: 'single' });
    mag.open();
    await flush();
    expect(nos()).toEqual([1]);
    mag.onKey('right');
    expect(nos()).toEqual([2]);
    expect(pagesIn()).toHaveLength(1);
    expect(mag.el.querySelector('.lfx-live-mag__book').classList.contains('is-single')).toBe(true);
  });

  it('rot/grün springen zur Tipps-Seite des Vortags/nächsten Tages; back gibt false', async () => {
    mag.open();
    await flush();
    mag.onKey('green');
    expect(nos()).toEqual([2, 3]);
    mag.onKey('green');
    expect(nos()).toEqual([6, 7]);
    expect(pagesIn()[0].dataset.kind).toBe('tips');
    mag.onKey('red');
    expect(nos()).toEqual([2, 3]);
    expect(mag.onKey('back')).toBe(false);
    const dayBtns = mag.el.querySelectorAll('.lfx-live-mag__day');
    expect(dayBtns).toHaveLength(7);
    dayBtns[3].click();
    expect(nos()).toEqual([14, 15]);
    expect(dayBtns[3].classList.contains('is-active')).toBe(true);
  });

  it('Rand-Klick blättert', async () => {
    mag.open();
    await flush();
    mag.el.querySelector('.lfx-live-mag__edge.is-next').click();
    expect(nos()).toEqual([2, 3]);
    mag.el.querySelector('.lfx-live-mag__edge.is-prev').click();
    expect(nos()).toEqual([1]);
  });

  it('Wischen blättert (Schwelle 40 px)', async () => {
    mag.open();
    await flush();
    const book = mag.el.querySelector('.lfx-live-mag__book');
    const ev = (t, x, y = 100) => book.dispatchEvent(new MouseEvent(t, { clientX: x, clientY: y, bubbles: true }));
    ev('pointerdown', 300);
    ev('pointerup', 280);
    expect(nos()).toEqual([1]);
    ev('pointerdown', 300);
    ev('pointerup', 200);
    expect(nos()).toEqual([2, 3]);
    ev('pointerdown', 100);
    ev('pointerup', 220);
    expect(nos()).toEqual([1]);
  });

  it('Animation: Blatt entsteht, Eingaben werden gepuffert, danach steht die Ziel-Doppelseite', async () => {
    vi.useFakeTimers();
    await setup({ animate: true, flipMs: 100 });
    mag.open();
    await vi.advanceTimersByTimeAsync(0);
    mag.onKey('right');
    expect(mag.el.querySelector('.lfx-live-mag__leaf')).not.toBeNull();
    mag.onKey('right'); // gepuffert
    await vi.advanceTimersByTimeAsync(140);
    // zweites Blättern läuft jetzt
    await vi.advanceTimersByTimeAsync(140);
    expect(mag.el.querySelector('.lfx-live-mag__leaf')).toBeNull();
    expect(nos()).toEqual([4, 5]);
  });

  it('PDF: Knopf ruft downloadPdf, zeigt Fortschritt, dann Link mit download', async () => {
    let report;
    let resolve;
    ctx.downloadPdf.mockImplementation((m, cb) => {
      report = cb;
      return new Promise((r) => (resolve = r));
    });
    mag.open();
    await flush();
    const btn = mag.el.querySelector('.lfx-live-mag__pdfbtn');
    btn.click();
    btn.click(); // nicht doppelt
    expect(ctx.downloadPdf).toHaveBeenCalledTimes(1);
    report(12, 30);
    expect(btn.textContent).toBe('PDF wird erstellt … 12/30');
    resolve({ url: 'blob:abc', fileName: 'LIVE-Programm_x.pdf' });
    await flush();
    const a = mag.el.querySelector('a.lfx-live-mag__pdf');
    expect(a.hidden).toBe(false);
    expect(a.getAttribute('download')).toBe('LIVE-Programm_x.pdf');
    expect(a.getAttribute('href')).toBe('blob:abc');
    expect(btn.hidden).toBe(true);
  });

  it('PDF-Fehler stellt den Knopf wieder her', async () => {
    ctx.downloadPdf.mockImplementation(() => Promise.reject(new Error('x')));
    mag.open();
    await flush();
    const btn = mag.el.querySelector('.lfx-live-mag__pdfbtn');
    btn.click();
    await flush();
    expect(btn.disabled).toBe(false);
    expect(ctx.toast).toHaveBeenCalled();
  });

  it('autoPdf startet die Erzeugung nach dem Laden', async () => {
    mag.open({ autoPdf: true });
    expect(ctx.downloadPdf).not.toHaveBeenCalled();
    await flush();
    expect(ctx.downloadPdf).toHaveBeenCalledTimes(1);
    expect(ctx.downloadPdf.mock.calls[0][0].pages).toHaveLength(30);
    await flush();
    expect(mag.el.querySelector('a.lfx-live-mag__pdf').hidden).toBe(false);
  });

  it('Bild-URLs kommen aus ctx.imageUrl; Fehler zeigt Platzhalter; Bilder lazy', async () => {
    mag.open();
    await flush();
    const im = mag.el.querySelector('.lfx-live-mag__page[data-kind="cover"] img');
    expect(im.getAttribute('src')).toBe('/img/img0?w=600');
    expect(im.loading).toBe('lazy');
    expect(im.getAttribute('alt')).toBe('');
    im.dispatchEvent(new Event('error'));
    expect(mag.el.querySelector('.lfx-live-mag__page[data-kind="cover"] .lfx-live-mag__img').classList.contains('is-failed')).toBe(true);
    mag.onKey('right');
    expect(mag.el.querySelector('.lfx-live-mag__tip img').getAttribute('src')).toBe('/img/img1?w=300');
  });

  it('Kopfleiste: Fokus per up/down, ok aktiviert, Schließen ruft closeOverlay', async () => {
    mag.open();
    await flush();
    expect(mag.onKey('up')).toBe(true);
    expect(document.activeElement.classList.contains('lfx-live-mag__close')).toBe(true);
    expect(mag.onKey('ok')).toBe(true);
    expect(ctx.closeOverlay).toHaveBeenCalled();
    expect(mag.isOpen()).toBe(false);
    expect(mag.onKey('right')).toBe(false);
  });

  it('Inhalte aller Seitentypen', async () => {
    mag.open();
    await flush();
    expect(mag.el.querySelector('.lfx-live-mag__mh-title').textContent).toBe('LIVE Programm');
    expect(mag.el.textContent).toContain('Krimi-Tag');
    mag.onKey('right');
    expect(mag.el.querySelectorAll('.lfx-live-mag__tip')).toHaveLength(2);
    expect(mag.el.querySelectorAll('.is-evening .lfx-live-mag__cell')).toHaveLength(18);
    mag.onKey('right');
    expect(mag.el.querySelectorAll('.is-day .lfx-live-mag__cell')).toHaveLength(18);
  });
});

describe('Heft-Objekt', () => {
  it('Klick ruft onOpen, setCover setzt Bild, setStyle setzt data-style, destroy räumt auf', () => {
    const onOpen = vi.fn();
    const imageUrl = vi.fn((id, o) => '/i/' + id + '/' + o.maxWidth);
    const prop = createMagazineProp({ onOpen, imageUrl });
    document.body.append(prop.el);
    expect(prop.el.tagName).toBe('BUTTON');
    expect(prop.el.type).toBe('button');
    expect(prop.el.getAttribute('aria-label')).toBe('Fernsehzeitung öffnen');
    prop.el.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
    prop.setCover({ imageId: 'abc' });
    expect(prop.el.querySelector('img').getAttribute('src')).toBe('/i/abc/200');
    prop.setCover(null);
    expect(prop.el.querySelector('img')).toBeNull();
    prop.setStyle('crt80');
    expect(prop.el.dataset.style).toBe('crt80');
    prop.destroy();
    expect(document.body.contains(prop.el)).toBe(false);
    prop.el.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('Platzwächter meldet, ob der Slot hoch genug ist', () => {
    const slot = document.createElement('div');
    let hgt = 200;
    Object.defineProperty(slot, 'clientHeight', { get: () => hgt });
    const onFit = vi.fn();
    const prop = createMagazineProp({ onOpen() {}, imageUrl: () => '', onFit });
    slot.append(prop.el);
    document.body.append(slot);
    expect(PROP_MIN_PX).toBe(110);
    expect(prop.measure()).toBe(true);
    hgt = 90;
    expect(prop.measure()).toBe(false);
    expect(prop.fits()).toBe(false);
    expect(onFit).toHaveBeenLastCalledWith(false);
    prop.destroy();
  });
});

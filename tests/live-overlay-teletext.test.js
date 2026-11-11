// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { createTeletext } from '../src/js/live/ui/teletext.js';
import { makeCtx, makeScheduler, makePlan, flush, NOW, H, bounds } from './live-overlay-stub.js';

let ctx;
let ttx;
const text = () => ttx.el.textContent;
const header = () => ttx.el.querySelector('.lfx-live-ttx__row').textContent;
const type = (s) => s.split('').forEach((d) => ttx.onKey(d));
const page = () => ttx.el.querySelector('.lfx-live-ttx__screen').dataset.page;
const sub = () => ttx.el.querySelector('.lfx-live-ttx__screen').dataset.sub;

beforeEach(async () => {
  document.body.innerHTML = '';
  ctx = makeCtx();
  ttx = createTeletext(ctx);
  document.body.append(ttx.el);
  ttx.open();
  await flush();
});

describe('Videotext', () => {
  it('Startseite 100 mit Kopfzeile und Senderliste', () => {
    expect(header()).toContain('P100  LIVE-TEXT  Mi 11.11.  20:15:07');
    expect(text()).toContain('301 Sender1');
    expect(text()).toContain('318 Sender18');
    expect(ttx.el.querySelectorAll('.lfx-live-ttx__row.is-dbl').length).toBe(1);
  });

  it('open(arg) startet auf der Wunschseite', () => {
    ttx.close();
    ttx.open(300);
    expect(page()).toBe('300');
    ttx.close();
    expect(ttx.isOpen()).toBe(false);
  });

  it('Ziffern: Eingabe sichtbar, nach drei Ziffern Seitenwechsel', () => {
    expect(ttx.onKey('3')).toBe(true);
    expect(header()).toContain('P3--');
    ttx.onKey('0');
    expect(header()).toContain('P30-');
    ttx.onKey('4');
    expect(page()).toBe('304');
    expect(header()).toContain('P304');
    expect(text()).toContain('04:'.slice(0, 0) + '05:00');
  });

  it('Seite 300 hat Unterseiten, links/rechts wechselt', () => {
    type('300');
    expect(sub()).toBe('0');
    expect(text()).toContain('JETZT & DANACH');
    expect(text()).toContain('1/2');
    expect(text()).toContain('Sender1');
    expect(text()).not.toContain('Sender18');
    expect(text()).toContain('Danach');
    ttx.onKey('right');
    expect(sub()).toBe('1');
    expect(text()).toContain('Sender18');
    expect(text()).toContain('Sendeschluss');
    ttx.onKey('right');
    expect(sub()).toBe('0');
    ttx.onKey('left');
    expect(sub()).toBe('1');
  });

  it('Seiten 301–318 zeigen das Tagesprogramm ohne Füller', () => {
    for (let n = 301; n <= 318; n++) {
      type(String(n));
      expect(page()).toBe(String(n));
      expect(text()).toContain('Sender' + (n - 300));
    }
    type('302');
    expect(text()).toContain('Mi 11.11.');
    expect(text()).toContain('05:00');
    expect(text()).not.toContain('06:30'); // filler
    expect(text()).toContain('07:00');
    expect(text()).toContain('Serie – S1 E2 Titel');
  });

  it('Unterseiten bei langen Tagesprogrammen', () => {
    const many = (no, D) => {
      if (no !== 2) return makePlan(no, D);
      const s = bounds(D).start;
      return Array.from({ length: 40 }, (_, i) => ({ start: s + i * 0.5 * H, end: s + (i + 1) * 0.5 * H, type: 'program', itemId: 'm1' }));
    };
    ctx = makeCtx({ scheduler: makeScheduler({ planDay: many }) });
    ctx.now = () => NOW - 12 * H; // 08:15: Sendung 6 -> Unterseite 0
    ttx = createTeletext(ctx);
    document.body.append(ttx.el);
    ttx.open(302);
    expect(text()).toContain('1/3');
    ttx.onKey('right');
    expect(sub()).toBe('1');
    expect(text()).toContain('2/3');
  });

  it('unbekannte Seite', () => {
    type('999');
    expect(text()).toContain('SEITE NICHT VORHANDEN');
    type('250');
    expect(text()).toContain('SEITE NICHT VORHANDEN');
  });

  it('ch± blättert nur durch vorhandene Seiten', () => {
    const seq = ['300', '301', '302'];
    seq.forEach((p) => {
      ttx.onKey('ch+');
      expect(page()).toBe(p);
    });
    ttx.onKey('ch-');
    ttx.onKey('ch-');
    ttx.onKey('ch-');
    expect(page()).toBe('100');
    ttx.onKey('ch-');
    expect(page()).toBe('318');
    ttx.onKey('ch+');
    expect(page()).toBe('100');
    type('999');
    expect(text()).toContain('SEITE NICHT VORHANDEN');
    ttx.onKey('ch+');
    expect(page()).toBe('100');
  });

  it('Farbtasten: rot 100, grün 300, gelb Senderseite, blau nächste', () => {
    ttx.onKey('green');
    expect(page()).toBe('300');
    ttx.onKey('yellow');
    expect(page()).toBe('301');
    ttx.onKey('blue');
    expect(page()).toBe('302');
    ttx.onKey('red');
    expect(page()).toBe('100');
    const foot = ttx.el.querySelector('.lfx-live-ttx__foot');
    expect(foot.textContent).toContain('Übersicht');
    foot.querySelector('.b-green').click();
    expect(page()).toBe('300');
  });

  it('ok auf Zeile schaltet um und schließt', () => {
    type('300');
    ttx.onKey('down');
    ttx.onKey('ok');
    expect(ctx.tune).toHaveBeenCalledWith(2);
    expect(ctx.closeOverlay).toHaveBeenCalled();
  });

  it('ok auf Seite 100 öffnet die Senderseite; Klick schaltet um', () => {
    ttx.onKey('down');
    ttx.onKey('down');
    ttx.onKey('ok');
    expect(page()).toBe('302'); // Cursor: 300, 301, 302
    type('304');
    ttx.el.querySelector('.lfx-live-ttx__seg.is-act').click();
    expect(ctx.tune).toHaveBeenCalledWith(4);
  });

  it('back: Eingabe verwerfen (true), sonst false', () => {
    ttx.onKey('3');
    expect(ttx.onKey('back')).toBe(true);
    expect(header()).toContain('P100');
    expect(ttx.onKey('back')).toBe(false);
    expect(ttx.onKey('txt')).toBe(false);
  });

  it('tick aktualisiert die Uhr', () => {
    ttx.tick(NOW + 5000);
    expect(header()).toContain('20:15:12');
  });
});

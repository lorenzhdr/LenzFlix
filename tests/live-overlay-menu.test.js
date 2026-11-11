// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMenu } from '../src/js/live/ui/menu.js';
import { buildChannelLine } from '../src/js/live/ui/overlay-util.js';
import { makeCtx, flush } from './live-overlay-stub.js';

let ctx;
let menu;
const labels = () => [...menu.el.querySelectorAll('.lfx-live-menu__item')].map((b) => b.querySelector('.lfx-live-menu__label').textContent);
const item = (label) => [...menu.el.querySelectorAll('.lfx-live-menu__item')].find((b) => b.querySelector('.lfx-live-menu__label').textContent === label);
const mk = (over) => {
  ctx = makeCtx(over);
  menu = createMenu(ctx);
  document.body.innerHTML = '';
  document.body.append(menu.el);
  menu.open();
};

beforeEach(() => mk());

describe('Menü', () => {
  it('Nicht-Admin: keine Admin-Einträge', () => {
    expect(labels()).toEqual(['TV-Stil', 'Senderliste', 'Mediathek (LENZFLIX)', 'Design wechseln', 'Abmelden']);
    expect(menu.el.querySelector('[role="menu"]')).toBeTruthy();
  });

  it('Admin: Senderbelegung und Dashboard', () => {
    mk({ isAdmin: true });
    expect(labels()).toEqual(['TV-Stil', 'Senderliste', 'Senderbelegung', 'Mediathek (LENZFLIX)', 'Design wechseln', 'Dashboard', 'Abmelden']);
    item('Dashboard').click();
    expect(ctx.openDashboard).toHaveBeenCalled();
    expect(ctx.closeOverlay).toHaveBeenCalled();
  });

  it('Mediathek und Design wechseln', () => {
    item('Mediathek (LENZFLIX)').click();
    expect(ctx.leaveToLibrary).toHaveBeenCalledWith(null);
    item('Design wechseln').click();
    expect(ctx.openThemePicker).toHaveBeenCalled();
  });

  it('Stilwahl ruft setStyle und zeigt sofort die Markierung', () => {
    item('TV-Stil').click();
    expect(labels()).toEqual(['Röhre 80er', 'Silber', 'Flach', 'Schlicht']);
    expect(item('Röhre 80er').getAttribute('aria-checked')).toBe('true');
    item('Silber').click();
    expect(ctx.setStyle).toHaveBeenCalledWith('silver');
    expect(item('Silber').getAttribute('aria-checked')).toBe('true');
    expect(item('Röhre 80er').getAttribute('aria-checked')).toBe('false');
  });

  it('Senderliste: 18 Sender, ok schaltet um', () => {
    item('Senderliste').click();
    expect(labels()).toHaveLength(18);
    item('7  Sender7').click();
    expect(ctx.tune).toHaveBeenCalledWith(7);
    expect(ctx.closeOverlay).toHaveBeenCalled();
  });

  it('Abmelden mit Rückfrage', () => {
    item('Abmelden').click();
    expect(menu.el.textContent).toContain('Wirklich abmelden?');
    expect(ctx.logout).not.toHaveBeenCalled();
    expect(menu.onKey('back')).toBe(true); // zurück ins Hauptmenü
    expect(labels()).toContain('Abmelden');
    item('Abmelden').click();
    // Fokus liegt vorsichtshalber auf „Zurück“
    expect(menu.el.querySelector('.is-focus').textContent).toContain('Zurück');
    item('OK').click();
    expect(ctx.logout).toHaveBeenCalled();
  });

  it('Tasten: up/down/ok/back, back im Hauptmenü ist nicht verbraucht', () => {
    expect(menu.onKey('down')).toBe(true);
    expect(menu.onKey('ok')).toBe(true); // Senderliste
    expect(labels()).toHaveLength(18);
    expect(menu.onKey('back')).toBe(true);
    expect(labels()[0]).toBe('TV-Stil');
    expect(menu.onKey('back')).toBe(false);
    expect(menu.onKey('7')).toBe(false);
    menu.close();
    expect(menu.isOpen()).toBe(false);
    expect(menu.onKey('ok')).toBe(false);
  });

  it('Senderbelegung: exakte Zeile mit Umlauten, Genre-Filter, Doppelte-Hinweis', async () => {
    mk({ isAdmin: true });
    item('Senderbelegung').click();
    expect(menu.el.textContent).toContain('Alles automatisch – keine Zeile nötig');
    expect(labels().filter((l) => l.startsWith('Platz'))).toHaveLength(12);
    item('Platz 5').click();
    expect(labels()).toContain('Automatisch');
    expect(labels()).not.toContain('Sci-Fi; Fantasy');
    item('Action').click();
    item('Platz 6').click();
    item('Komödie').click();
    expect(menu.el.querySelector('.lfx-live-menu__line').textContent).toBe(':root{--lfx-live-channels:"5=Action;6=Komödie"}');
    expect(menu.el.textContent).toContain('Branding → Benutzerdefiniertes CSS unterhalb der @import-Zeile');
    item('Platz 16').click();
    item('Action').click();
    expect(menu.el.querySelector('.lfx-live-menu__warn').textContent).toContain('mehrfach belegt');
    item('Platz 5').click();
    item('Automatisch').click();
    expect(menu.el.querySelector('.lfx-live-menu__line').textContent).toBe(':root{--lfx-live-channels:"6=Komödie;16=Action"}');
  });

  it('Vorbelegung aus channelConfig', () => {
    mk({ isAdmin: true, channelConfig: { 5: 'Action', 7: 'Märchen', 3: 'Kino', 9: 'a;b' } });
    item('Senderbelegung').click();
    expect(menu.el.querySelector('.lfx-live-menu__line').textContent).toBe(':root{--lfx-live-channels:"5=Action;7=Märchen"}');
  });

  it('Zeile kopieren nutzt die Zwischenablage', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    mk({ isAdmin: true, channelConfig: { 5: 'Action' } });
    item('Senderbelegung').click();
    item('Zeile kopieren').click();
    await flush();
    expect(writeText).toHaveBeenCalledWith(':root{--lfx-live-channels:"5=Action"}');
    expect(ctx.toast).toHaveBeenCalledWith('Zeile kopiert.');
  });

  it('Kopieren ohne Zwischenablage: markieren und Hinweis', () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    mk({ isAdmin: true, channelConfig: { 5: 'Action' } });
    item('Senderbelegung').click();
    item('Zeile kopieren').click();
    expect(ctx.toast).toHaveBeenCalledWith(expect.stringContaining('markiert'));
  });

  it('buildChannelLine', () => {
    expect(buildChannelLine({})).toBe('');
    expect(buildChannelLine({ 16: 'Krimi', 5: 'Fantasy & Co' })).toBe(':root{--lfx-live-channels:"5=Fantasy & Co;16=Krimi"}');
  });
});

// @vitest-environment jsdom
// VIDEOTHEK LENZ · Mehrspieler-Panel (net/panel.js): Schalter, Spielerliste, Stumm, Kick nur für Admins mit Bestätigung.
import { describe, it, expect, vi } from 'vitest';
import { createPanel, areaLabel } from '../src/js/store3d/net/panel.js';

function make(over = {}) {
  const st = { prefs: { on: true, name: true, chat: true, film: false }, muted: new Set(), kicked: [], rows: [
    { k: 'aaa', name: 'Anna', area: 'shop', devs: 1, admin: false },
    { k: 'bbb', name: 'Jemand', area: 'palastHall', devs: 2, admin: false },
    { k: 'ccc', name: 'Chef', area: 'street', devs: 1, admin: true },
  ], kick: false };
  Object.assign(st, over);
  const api = {
    prefs: () => st.prefs,
    set: vi.fn((p) => Object.assign(st.prefs, p)),
    status: () => 'Verbunden',
    players: () => st.rows,
    isMuted: (k) => st.muted.has(k),
    setMute: vi.fn((k, on) => { if (on) st.muted.add(k); else st.muted.delete(k); return on; }),
    canKick: () => st.kick,
    kick: vi.fn((k) => { st.kicked.push(k); return true; }),
  };
  const panel = createPanel(api);
  const el = document.createElement('div');
  document.body.appendChild(el);
  panel.render(el);
  return { st, api, panel, el };
}
const txt = (el, sel) => [...el.querySelectorAll(sel)].map((x) => x.textContent);

describe('Panel: Liste', () => {
  it('zeigt Name, Ort und Geräte je Person', () => {
    const { el } = make();
    expect(txt(el, '.lfx-mp-pname')).toEqual(['Anna', 'Jemand', 'Chef']);
    expect(txt(el, '.lfx-mp-pmeta')).toEqual(['Laden', 'Palast-Saal · 2 Geräte', 'Straße · Admin']);
  });
  it('Leerzustand und unbekannter Ort', () => {
    const { el } = make({ rows: [] });
    expect(el.querySelector('.lfx-mp-empty').textContent).toContain('niemand');
    expect(areaLabel('')).toBe('Unterwegs');
    expect(areaLabel('palastFoyer')).toBe('Palast-Foyer');
  });
  it('Mehrspieler aus: Liste verborgen', () => {
    const { el } = make({ prefs: { on: false, name: true, chat: true, film: false } });
    expect(el.querySelector('.lfx-mp-list').hidden).toBe(true);
  });
  it('Namen kommen nur per textContent (kein HTML)', () => {
    const { el } = make({ rows: [{ k: 'x', name: '<img src=x onerror=1>', area: 'shop', devs: 1, admin: false }] });
    expect(el.querySelector('.lfx-mp-player img')).toBeNull();
    expect(el.querySelector('.lfx-mp-pname').textContent).toBe('<img src=x onerror=1>');
  });
});

describe('Panel: Stumm', () => {
  it('schaltet pro Person um und beschriftet Laut/Stumm', () => {
    const { el, api, st } = make();
    const b = el.querySelector('.lfx-mp-mute');
    expect(b.textContent).toBe('Stumm');
    b.click();
    expect(api.setMute).toHaveBeenCalledWith('aaa', true);
    expect(st.muted.has('aaa')).toBe(true);
    const b2 = el.querySelector('.lfx-mp-mute');
    expect(b2.textContent).toBe('Laut');
    expect(b2.getAttribute('aria-pressed')).toBe('true');
    b2.click();
    expect(st.muted.has('aaa')).toBe(false);
  });
});

describe('Panel: Kick', () => {
  it('ohne Admin kein Knopf', () => {
    const { el } = make();
    expect(el.querySelector('.lfx-mp-kick')).toBeNull();
  });
  it('Admin: Knopf nur bei Nicht-Admins, erst nach Bestätigung kicken', () => {
    const { el, api, st } = make({ kick: true });
    const kicks = el.querySelectorAll('.lfx-mp-kick');
    expect(kicks.length).toBe(2); // Anna, Jemand – nicht Chef
    kicks[0].click();
    expect(api.kick).not.toHaveBeenCalled();
    const ok = el.querySelector('.lfx-mp-kick.is-confirm');
    expect(ok.textContent).toBe('Wirklich entfernen');
    ok.click();
    expect(api.kick).toHaveBeenCalledWith('aaa');
    expect(st.kicked).toEqual(['aaa']);
    expect(el.querySelector('.lfx-mp-kick.is-confirm')).toBeNull();
  });
  it('Abbrechen verwirft die Bestätigung', () => {
    const { el, api } = make({ kick: true });
    el.querySelector('.lfx-mp-kick').click();
    el.querySelector('.lfx-mp-kickno').click();
    expect(api.kick).not.toHaveBeenCalled();
    expect(el.querySelector('.lfx-mp-kick.is-confirm')).toBeNull();
  });
  it('Neuaufruf ohne Änderung baut die Liste nicht neu (Fokus bleibt)', () => {
    const { el, panel } = make({ kick: true });
    const first = el.querySelector('.lfx-mp-player');
    panel.render(el);
    expect(el.querySelector('.lfx-mp-player')).toBe(first);
  });
  it('Ziel verschwindet während der Bestätigung: Bestätigung fällt weg', () => {
    const { el, panel, st } = make({ kick: true });
    el.querySelector('.lfx-mp-kick').click();
    st.rows = st.rows.filter((r) => r.k !== 'aaa');
    panel.render(el);
    expect(el.querySelector('.lfx-mp-kick.is-confirm')).toBeNull();
  });
});

describe('Panel: Film-Spalte', () => {
  function withFilm(filmTitle) {
    const base = make();
    const api = {
      prefs: () => ({ on: true, name: true, chat: true, film: false }), set() {}, status: () => '', isMuted: () => false, setMute: () => false,
      canKick: () => false, kick: () => false, players: () => base.st.rows, filmTitle,
    };
    const el = document.createElement('div');
    createPanel(api).render(el);
    return el;
  }
  it('zeigt den Titel nur, wenn filmTitle ihn liefert', () => {
    const el = withFilm((r) => (r.k === 'bbb' ? 'Alien' : ''));
    expect(txt(el, '.lfx-mp-pmeta')).toEqual(['Laden', 'Palast-Saal · 2 Geräte · Film: Alien', 'Straße · Admin']);
  });
  it('ohne filmTitle oder bei Nicht-Text kein Film', () => {
    expect(txt(withFilm(undefined), '.lfx-mp-pmeta').join('|')).not.toContain('Film');
    expect(txt(withFilm(() => 42), '.lfx-mp-pmeta').join('|')).not.toContain('Film');
    expect(txt(withFilm(() => { throw new Error('x'); }), '.lfx-mp-pmeta').join('|')).not.toContain('Film');
  });
});

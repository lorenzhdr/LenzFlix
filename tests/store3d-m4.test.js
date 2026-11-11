import { describe, it, expect } from 'vitest';
import {
  timeOfDay, hourOf, isLate, rainDecision, seeded, skyPalette, createLimiter, RAIN_CHANCE, adultIds,
} from '../src/js/store3d/modules/m4-util.js';
import {
  LINES, fillTemplate, pickLine, categoryFor, greetingCategory, tipText, dialogPicks,
} from '../src/js/store3d/modules/cashier-lines.js';

describe('M4 Tageszeit', () => {
  it('teilt Stunden in Tag/Dämmerung/Nacht', () => {
    expect(timeOfDay(12)).toBe('day');
    expect(timeOfDay(8)).toBe('day');
    expect(timeOfDay(17.9)).toBe('day');
    expect(timeOfDay(18)).toBe('dusk');
    expect(timeOfDay(20.5)).toBe('dusk');
    expect(timeOfDay(7)).toBe('dusk');
    expect(timeOfDay(21)).toBe('night');
    expect(timeOfDay(2)).toBe('night');
    expect(timeOfDay(5.9)).toBe('night');
  });
  it('liest Uhrzeit aus Date und normiert Zahlen', () => {
    expect(hourOf(new Date(2026, 0, 1, 22, 30))).toBe(22.5);
    expect(hourOf(25)).toBe(1);
    expect(timeOfDay(new Date(2026, 0, 1, 9, 0))).toBe('day');
  });
  it('erkennt „spät nachts“', () => {
    expect(isLate(23.5)).toBe(true);
    expect(isLate(3)).toBe(true);
    expect(isLate(12)).toBe(false);
    expect(isLate(5)).toBe(false);
  });
  it('liefert Paletten für Tageszeit und Regen', () => {
    const d = skyPalette('day', false);
    const n = skyPalette('night', false);
    const r = skyPalette('day', true);
    expect(d.sky).toHaveLength(3);
    expect(n.cool).toBeGreaterThan(d.cool);
    expect(n.hemi).toBeLessThan(d.hemi);
    expect(r.rain).toBe(true);
    expect(r.stars).toBe(0);
    expect(skyPalette('unbekannt').sky).toEqual(d.sky);
  });
});

describe('M4 Regen', () => {
  it('ist mit Seed deterministisch', () => {
    for (const seed of [1, 42, 999, 123456]) {
      expect(rainDecision(seed, 'day')).toBe(rainDecision(seed, 'day'));
    }
    expect(seeded(7)()).toBe(seeded(7)());
  });
  it('Überschreibung gewinnt', () => {
    expect(rainDecision(1, 'day', true)).toBe(true);
    expect(rainDecision(1, 'night', false)).toBe(false);
  });
  it('trifft ungefähr die Wahrscheinlichkeit (nachts öfter)', () => {
    const rate = (tod) => { let n = 0; for (let s = 1; s <= 4000; s++) if (rainDecision(s * 2654435761 >>> 0, tod)) n++; return n / 4000; };
    expect(Math.abs(rate('day') - RAIN_CHANCE.day)).toBeLessThan(0.05);
    expect(rate('night')).toBeGreaterThan(rate('day'));
  });
});

describe('M4 Kassierer-Sprüche', () => {
  it('ersetzt Platzhalter und fällt auf Standards zurück', () => {
    expect(fillTemplate('Hallo {name}, {title} bei {dept}', { name: 'Lena', title: 'Zeitsprung', dept: 'Action' })).toBe('Hallo Lena, Zeitsprung bei Action');
    expect(fillTemplate('Hi {name}', { name: '' })).toBe('Hi Stammkunde');
    expect(fillTemplate('{title}', {})).toBe('der Film');
    expect(fillTemplate('{name}', { name: 'x'.repeat(100) }).length).toBe(40);
  });
  it('alle Zeilen enthalten nur bekannte Platzhalter', () => {
    for (const list of Object.values(LINES)) {
      for (const l of list) expect(l.replace(/\{(name|title|dept)\}/g, '')).not.toMatch(/[{}]/);
    }
  });
  it('alle Zeilen sind sauber: keine Auslassungspunkte, keine Emojis, Duzen', () => {
    for (const list of Object.values(LINES)) {
      for (const l of list) {
        expect(l).not.toMatch(/…|\.\.\./);
        expect(l).not.toMatch(/\p{Extended_Pictographic}/u);
        expect(l).not.toMatch(/\b(Sie|Ihnen|Ihr)\b/);
      }
    }
  });
  it('neue Kategorien sind vorhanden und nicht leer', () => {
    const keys = ['intro', 'rain', 'put', 'couchSit', 'couchStand', 'adultLong', 'kidsEnter', 'dialogHello', 'dialogBye', 'tipComedy', 'tipHorror', 'tipKids', 'tipNew', 'tipRandom', 'tipResume', 'noTip'];
    for (const k of keys) expect(Array.isArray(LINES[k]) && LINES[k].length >= 2, k).toBe(true);
    for (const k of ['tipComedy', 'tipHorror', 'tipKids', 'tipNew', 'tipRandom']) {
      for (const l of LINES[k]) expect(l).toContain('{title}');
    }
  });
  it('wählt Zeilen, ohne die letzte zu wiederholen', () => {
    const list = ['a', 'b', 'c'];
    let last = -1;
    const rnd = seeded(5);
    for (let i = 0; i < 40; i++) {
      const p = pickLine(list, rnd, {}, last);
      expect(p.index).not.toBe(last);
      last = p.index;
    }
    expect(pickLine([], rnd, {})).toBeNull();
    expect(pickLine(['nur eine'], () => 0.9, {}, 0).text).toBe('nur eine');
  });
  it('ordnet Titel Kategorien zu', () => {
    expect(categoryFor({ Genres: ['Horror'] }, null)).toBe('horror');
    expect(categoryFor({ Genres: ['Komödie'] }, null)).toBe('comedy');
    expect(categoryFor({ Genres: ['Drama'] }, { kind: 'kids' })).toBe('kids');
    expect(categoryFor({ Genres: ['Drama'] }, { kind: 'adult' })).toBe('adult');
    expect(categoryFor({ Type: 'Series', Genres: [] }, null)).toBe('series');
    expect(categoryFor({ Genres: [], lfx: { media: 'vhs' } }, null)).toBe('vhs');
    expect(categoryFor({ Genres: ['Drama'] }, null)).toBe('generic');
    expect(categoryFor(null, null)).toBe('generic');
  });
  it('Begrüßung nach Tageszeit, spät nachts hat Vorrang', () => {
    expect(greetingCategory('day', false)).toBe('greetDay');
    expect(greetingCategory('dusk', false)).toBe('greetDusk');
    expect(greetingCategory('night', false)).toBe('greetNight');
    expect(greetingCategory('night', true)).toBe('late');
  });
  it('Tipp-Text nennt Titel und Abteilung', () => {
    expect(tipText('Zeitsprung', 'Action')).toBe('Mein Tipp: Zeitsprung – steht bei Action.');
    expect(tipText('X', '')).toContain('Neuheiten');
  });
});

describe('M4 Dialog-Kandidaten', () => {
  const mk = (id, Genres = []) => ({ Id: id, Name: id, Genres });
  const items = new Map([
    ['c1', mk('c1', ['Komödie'])], ['c2', mk('c2', ['Comedy'])], ['ca', mk('ca', ['Komödie'])],
    ['h1', mk('h1', ['Horror'])], ['k1', mk('k1')], ['n1', mk('n1')], ['x', mk('x')],
  ]);
  const catalog = {
    items,
    departments: [
      { kind: 'adult', itemIds: ['ca'] },
      { kind: 'kids', itemIds: ['k1', 'k1'] },
      { kind: 'new', itemIds: ['n1', 'ca'] },
      { kind: 'genre', itemIds: ['x'] },
    ],
    highlights: [items.get('x'), items.get('ca'), items.get('x')],
    resume: [items.get('c1')],
  };
  it('sortiert nach Kategorie, ohne Ab-18 und Dubletten', () => {
    const p = dialogPicks(catalog, new Map());
    expect(p.comedy.map((i) => i.Id)).toEqual(['c1', 'c2']);
    expect(p.horror.map((i) => i.Id)).toEqual(['h1']);
    expect(p.kids.map((i) => i.Id)).toEqual(['k1']);
    expect(p.new.map((i) => i.Id)).toEqual(['n1']);
    expect(p.random.map((i) => i.Id)).toEqual(['x']);
    expect(p.resume.map((i) => i.Id)).toEqual(['c1']);
    for (const list of Object.values(p)) expect(list.some((i) => i.Id === 'ca')).toBe(false);
  });
  it('liefert bei leerem Katalog leere Listen', () => {
    const p = dialogPicks(null, null);
    expect(Object.values(p).every((l) => l.length === 0)).toBe(true);
  });
});

describe('M4 Rate-Limit', () => {
  it('lässt Sprüche frühestens nach 20 s zu, force umgeht', () => {
    const l = createLimiter(20000);
    expect(l.can(0)).toBe(true);
    l.mark(1000);
    expect(l.can(5000)).toBe(false);
    expect(l.can(20999)).toBe(false);
    expect(l.can(21000)).toBe(true);
    expect(l.can(2000, { force: true })).toBe(true);
    l.reset();
    expect(l.can(0)).toBe(true);
  });
});

describe('M4 Ab-18-Filter', () => {
  it('sammelt nur Titel der Ab-18-Abteilung', () => {
    const cat = { departments: [{ kind: 'genre', itemIds: ['a'] }, { kind: 'adult', itemIds: ['b', 'c'] }] };
    expect([...adultIds(cat)]).toEqual(['b', 'c']);
    expect(adultIds(null).size).toBe(0);
  });
});

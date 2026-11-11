// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildCatalog, departmentColor, isAdult, isKids, mediaOf, isNewItem } from '../src/js/features/store/departments.js';

const NOW = Date.parse('2026-11-10T12:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();
let n = 0;
const mk = (o = {}) => ({ Id: `i${++n}`, Name: `Titel ${n}`, Type: 'Movie', ProductionYear: 2010, OfficialRating: 'FSK-12', Genres: ['Action'], DateCreated: daysAgo(400), ...o });
const many = (k, o) => Array.from({ length: k }, () => mk(o));
const dept = (cat, id) => cat.departments.find((d) => d.id === id);

describe('Regeln', () => {
  it('media: Serie box, vor 2000 vhs, sonst dvd', () => {
    expect(mediaOf(mk({ Type: 'Series', ProductionYear: 1990 }))).toBe('box');
    expect(mediaOf(mk({ ProductionYear: 1999 }))).toBe('vhs');
    expect(mediaOf(mk({ ProductionYear: 2000 }))).toBe('dvd');
    expect(mediaOf(mk({ ProductionYear: undefined }))).toBe('dvd');
  });

  it('isNew: jünger als 14 Tage', () => {
    expect(isNewItem(mk({ DateCreated: daysAgo(13) }), NOW)).toBe(true);
    expect(isNewItem(mk({ DateCreated: daysAgo(15) }), NOW)).toBe(false);
    expect(isNewItem(mk({ DateCreated: undefined }), NOW)).toBe(false);
  });

  it('adult: FSK-18 und Co (Groß/Klein egal), FSK-16 nicht', () => {
    for (const r of ['FSK-18', '18', 'DE-18', 'NC-17', 'X', 'R18', 'r18+', 'AO']) expect(isAdult({ OfficialRating: r })).toBe(true);
    for (const r of ['FSK-16', 'R', 'TV-MA', '', undefined]) expect(isAdult({ OfficialRating: r })).toBe(false);
  });

  it('kids: Kinder-Genre und Freigabe 0/6/leer, nie bei adult', () => {
    expect(isKids({ Genres: ['Animation'], OfficialRating: 'FSK-6' })).toBe(true);
    expect(isKids({ Genres: ['Familie'], OfficialRating: '' })).toBe(true);
    expect(isKids({ Genres: ['kinder'], OfficialRating: undefined })).toBe(true);
    expect(isKids({ Genres: ['Animation'], OfficialRating: 'FSK-12' })).toBe(false);
    expect(isKids({ Genres: ['Action'], OfficialRating: 'FSK-6' })).toBe(false);
    expect(isKids({ Genres: ['Animation'], OfficialRating: 'FSK-18' })).toBe(false);
  });

  it('adult erscheint nur im Ab-18-Raum (auch nicht in Neuheiten), kids gemischt', () => {
    const adult = mk({ OfficialRating: 'FSK-18', DateCreated: daysAgo(1), Genres: ['Kids'] });
    const kidM = mk({ Genres: ['Animation'], OfficialRating: 'FSK-0' });
    const kidS = mk({ Type: 'Series', Genres: ['Familie'], OfficialRating: 'FSK-6' });
    const cat = buildCatalog({ items: [adult, kidM, kidS], now: NOW });
    expect(dept(cat, 'adult')).toMatchObject({ kind: 'adult', label: 'Ab 18', itemIds: [adult.Id] });
    expect(dept(cat, 'new')).toBeUndefined();
    expect(dept(cat, 'kids').itemIds.sort()).toEqual([kidM.Id, kidS.Id].sort());
    expect(cat.departments.filter((d) => d.itemIds.includes(adult.Id))).toHaveLength(1);
  });

  it('Genre-Schwelle: Filme < 8 -> Querbeet, >= 8 -> genre-<Genre>; ohne Genre -> misc', () => {
    const items = [...many(8, { Genres: ['Action'] }), ...many(7, { Genres: ['Drama'] }), mk({ Genres: [] })];
    const cat = buildCatalog({ items, now: NOW });
    expect(dept(cat, 'genre-Action')).toMatchObject({ kind: 'genre', label: 'Action' });
    expect(dept(cat, 'genre-Action').itemIds).toHaveLength(8);
    expect(dept(cat, 'genre-Drama')).toBeUndefined();
    expect(dept(cat, 'misc')).toMatchObject({ kind: 'misc', label: 'Querbeet' });
    expect(dept(cat, 'misc').itemIds).toHaveLength(8);
  });

  it('Serien-Schwelle: < 6 -> series-misc, >= 6 -> series-<Genre>', () => {
    const items = [...many(6, { Type: 'Series', Genres: ['Drama'] }), ...many(5, { Type: 'Series', Genres: ['Comedy'] })];
    const cat = buildCatalog({ items, now: NOW });
    expect(dept(cat, 'series-Drama')).toMatchObject({ kind: 'series', label: 'Serien · Drama' });
    expect(dept(cat, 'series-Comedy')).toBeUndefined();
    expect(dept(cat, 'series-misc')).toMatchObject({ kind: 'series', label: 'Serien · Mehr' });
    expect(dept(cat, 'series-misc').itemIds).toHaveLength(5);
  });

  it('Neuheiten: bis 24 neueste, zusätzlich in ihrer Abteilung', () => {
    const fresh = Array.from({ length: 30 }, (_, i) => mk({ DateCreated: daysAgo(1 + i * 0.1) }));
    const old = many(8, {});
    const cat = buildCatalog({ items: [...fresh, ...old], now: NOW });
    const neu = dept(cat, 'new');
    expect(neu.kind).toBe('new');
    expect(neu.label).toBe('Neuheiten');
    expect(neu.itemIds).toHaveLength(24);
    const newest = new Set([...fresh].sort((a, b) => Date.parse(b.DateCreated) - Date.parse(a.DateCreated)).slice(0, 24).map((i) => i.Id));
    expect(neu.itemIds.every((id) => newest.has(id))).toBe(true);
    expect(dept(cat, 'genre-Action').itemIds).toHaveLength(38);
  });

  it('Sortierung alphabetisch nach SortName || Name', () => {
    const a = mk({ Name: 'Zebra', SortName: 'alpha' });
    const b = mk({ Name: 'Mango' });
    const c = mk({ Name: 'Anton' });
    const cat = buildCatalog({ items: [a, b, c], now: NOW });
    expect(dept(cat, 'misc').itemIds).toEqual([a.Id, c.Id, b.Id]);
  });

  it('lfx-Felder, Items-Map nur Filme/Serien, Fortschritt/gesehen', () => {
    const m = mk({ ProductionYear: 1985, UserData: { Played: true, PlayedPercentage: 40 } });
    const ep = mk({ Type: 'Episode' });
    const cat = buildCatalog({ items: [m, ep], now: NOW });
    expect(cat.items.has(ep.Id)).toBe(false);
    expect(cat.items.get(m.Id).lfx).toEqual({ media: 'vhs', isNew: false, progress: 0.4, watched: true });
    expect(m.lfx).toBeUndefined(); // Eingabe bleibt unverändert
  });

  it('Farben: deterministisch, #rrggbb, Sonderfarben fest', () => {
    expect(departmentColor('genre-Action', 'genre')).toBe(departmentColor('genre-Action', 'genre'));
    expect(departmentColor('genre-Action', 'genre')).toMatch(/^#[0-9a-f]{6}$/);
    expect(departmentColor('adult', 'adult')).not.toBe(departmentColor('kids', 'kids'));
    const cat = buildCatalog({ items: many(9, {}), now: NOW });
    expect(dept(cat, 'genre-Action').color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('Highlights: max. 8, neu oder >= 7.5, nur mit Backdrop, ohne adult', () => {
    const bd = ['t'];
    const good = Array.from({ length: 10 }, (_, i) => mk({ CommunityRating: 8 + i / 20, BackdropImageTags: bd }));
    const noBd = mk({ CommunityRating: 9, BackdropImageTags: [] });
    const low = mk({ CommunityRating: 6, BackdropImageTags: bd });
    const newOne = mk({ CommunityRating: 5, DateCreated: daysAgo(2), BackdropImageTags: bd });
    const adult = mk({ CommunityRating: 9, OfficialRating: 'FSK-18', BackdropImageTags: bd });
    const cat = buildCatalog({ items: [...good, noBd, low, newOne, adult], now: NOW });
    expect(cat.highlights).toHaveLength(8);
    expect(cat.highlights[0].Id).toBe(newOne.Id);
    const ids = cat.highlights.map((i) => i.Id);
    for (const x of [noBd, low, adult]) expect(ids).not.toContain(x.Id);
  });

  it('resume/favorites verweisen auf Katalog-Items', () => {
    const m = mk();
    const cat = buildCatalog({ items: [m], resume: [{ Id: m.Id }], favorites: [m], now: NOW });
    expect(cat.resume[0]).toBe(cat.items.get(m.Id));
    expect(cat.favorites).toHaveLength(1);
  });
});

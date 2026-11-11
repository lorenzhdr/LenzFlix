import { describe, it, expect } from 'vitest';
import { rankResults, titleRank } from '../src/js/store3d/modules/search-rank.js';
import { buildCatalog } from '../src/js/features/store/departments.js';

const mk = (Name, i) => ({ Id: `i${i}`, Name });

describe('Suchergebnis-Ranking', () => {
  it('exakter Titel > beginnt mit > Wortanfang > enthält', () => {
    expect(titleRank('Breaking', 'breaking')).toBe(0);
    expect(titleRank('Breaking Bad', 'breaking')).toBe(1);
    expect(titleRank('Der Breaking Fall', 'breaking')).toBe(2);
    expect(titleRank('Unbreakable', 'break')).toBe(3);
    expect(titleRank('Deadpool', 'breaking')).toBe(4);
  });

  it('Breaking Bad kommt vor Deadpool und Gregs Tagebuch', () => {
    const res = [mk('Deadpool', 1), mk('Gregs Tagebuch', 2), mk('Breaking Bad', 3), mk('El Camino: Ein Breaking-Bad-Film', 4)];
    const out = rankResults(res, 'breaking');
    expect(out[0].Name).toBe('Breaking Bad');
    expect(out.map((x) => x.Name).slice(-2)).toEqual(['Deadpool', 'Gregs Tagebuch']);
  });

  it('blendet den Rest aus, wenn >= 5 Titeltreffer existieren', () => {
    const res = [...Array.from({ length: 5 }, (_, i) => mk(`Star ${i}`, i)), mk('Nebenbei', 9)];
    expect(rankResults(res, 'star')).toHaveLength(5);
    expect(rankResults(res.slice(0, 3).concat(mk('Nebenbei', 9)), 'star')).toHaveLength(4);
  });
});

describe('Katalog: Favoriten', () => {
  it('nimmt Titel mit UserData.IsFavorite auch ohne Favoriten-Abfrage auf', () => {
    const items = [
      { Id: 'a', Name: 'A', Type: 'Movie', Genres: ['Drama'], UserData: { IsFavorite: true } },
      { Id: 'b', Name: 'B', Type: 'Series', Genres: ['Drama'], UserData: {} },
    ];
    const cat = buildCatalog({ items, favorites: [] });
    expect(cat.favorites.map((x) => x.Id)).toEqual(['a']);
  });
});

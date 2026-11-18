// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { pageName, defaultDom } from '../src/js/shared/pagetitle.js';
import { parseHash } from '../src/js/core/router.js';

const libs = [{ id: 'L1', name: 'Filme-Bibliothek' }, { id: 'L2', name: 'Serien-Bibliothek' }];
const name = (hash, dom = () => '') => pageName(parseHash(hash), libs, dom);

describe('pageName', () => {
  it('Startseite leer, Meine Liste (tab=1)', () => {
    expect(name('#/home')).toBe('');
    expect(name('#/home?tab=1')).toBe('Meine Liste');
  });
  it('LenzFlix-Seiten', () => {
    expect(name('#/home?lfx=new')).toBe('Neu & beliebt');
    expect(name('#/home?lfx=tv')).toBe('TV');
    expect(name('#/home?lfx=search&q=x')).toBe('Suche');
    expect(name('#/home?lfx=mylist')).toBe('Meine Liste');
    expect(name('#/home?lfx=series')).toBe('Serien');
    expect(name('#/home?lfx=movies&view=grid')).toBe('Filme');
  });
  it('Bibliotheksseiten mit Genre aus dem Seitenkopf, Platzhalter ignoriert', () => {
    const dom = (sel) => (sel === '.lfx-lib__title .lfx-lib__current' ? 'Action' : '');
    expect(name('#/home?lfx=series&genre=g1', dom)).toBe('Action · Serien');
    expect(name('#/home?lfx=series&genre=g1', () => '…')).toBe('Serien');
    expect(name('#/home?lfx=series&genre=g1')).toBe('Serien');
  });
  it('hub und browse', () => {
    expect(name('#/home?lfx=hub&lib=L1')).toBe('Filme-Bibliothek');
    expect(name('#/home?lfx=hub&lib=XX')).toBe('');
    expect(name('#/home?lfx=browse&lib=L2')).toBe('Serien-Bibliothek');
    expect(name('#/home?lfx=browse&lib=XX')).toBe('Bibliothek');
  });
  it('Titelseite aus dem DOM', () => {
    expect(name('#/home?lfx=title&id=a', (s) => (s === '.lfx-pt__title' ? 'Mein Titel' : ''))).toBe('Mein Titel');
    expect(name('#/home?lfx=title&id=a', (s, a) => (s === '.lfx-pt__logo' && a === 'alt' ? 'Logo-Titel' : ''))).toBe('Logo-Titel');
    // LENZ+ (Logo oder Text) und LENZ//84 (Kassetten-Rückseite)
    expect(name('#/home?lfx=title&id=a', (s, a) => (s === '.lfx-plus-title__logo' && a === 'alt' ? 'Plus-Logo' : ''))).toBe('Plus-Logo');
    expect(name('#/home?lfx=title&id=a', (s) => (s === '.lfx-plus-title__name' ? 'Plus-Text' : ''))).toBe('Plus-Text');
    expect(name('#/home?lfx=title&id=a', (s, a) => (s === '.lfx-rt__logo' && a === 'alt' ? 'Retro-Logo' : ''))).toBe('Retro-Logo');
    expect(name('#/home?lfx=title&id=a', (s) => (s === '.lfx-rt__brand' ? 'Retro-Text' : ''))).toBe('Retro-Text');
  });
  it('native Seiten', () => {
    expect(name('#/mypreferencesdisplay')).toBe('Anzeige');
    expect(name('#/search')).toBe('Suche');
    expect(name('#/usermenu')).toBe('Einstellungen');
    expect(name('#/movies?topParentId=L1')).toBe('Filme-Bibliothek');
    expect(name('#/movies')).toBe('Filme');
    expect(name('#/tv')).toBe('Serien');
    expect(name('#/list?parentId=L2')).toBe('Serien-Bibliothek');
    expect(name('#/details?id=a', (s) => (s === '.page:not(.hide) .nameContainer h1' ? 'Detail-Titel' : ''))).toBe('Detail-Titel');
    expect(name('#/item?id=a')).toBe('');
    expect(name('#/dashboard')).toBe('');
  });
  it('robust gegen fehlende Eingaben', () => {
    expect(pageName(null, libs)).toBe('');
    expect(pageName(parseHash('#/movies?topParentId=L1'), undefined)).toBe('Filme');
  });
  it('defaultDom liest aus dem Dokument', () => {
    document.body.innerHTML = '<h1 class="a"> Text </h1><img class="b" alt="Alt">';
    expect(defaultDom('.a')).toBe('Text');
    expect(defaultDom('.b', 'alt')).toBe('Alt');
    expect(defaultDom('.nix')).toBe('');
    expect(defaultDom('[[')).toBe('');
  });
});

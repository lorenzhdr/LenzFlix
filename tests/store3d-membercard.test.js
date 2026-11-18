// @vitest-environment jsdom
// VIDEOTHEK LENZ · Mitgliedsausweis-Karte: Stufen, Stempelraster aus TOTAL, Modi, Schließen, Gold-Glitzer und reduced-motion.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { cwd } from 'node:process';
import { buildCard } from '../src/js/store3d/ui/membercard.js';
import { CATALOG, TOTAL } from '../src/js/store3d/discover/catalog.js';
import { stampsMask } from '../src/js/store3d/char/card.js';

const data = (o = {}) => ({ name: 'Max', no: '004711', since: 20400, rent: 7, cine: 3, stamps: stampsMask(['roof', 'zebra']), total: TOTAL, tier: 'bronze', code: null, ...o });

describe('membercard', () => {
  it('zeigt Titel, Nummer, Name, Datum, Zähler und Stempel n/TOTAL', () => {
    const ui = buildCard(data(), { mode: 'self' });
    const t = ui.el.textContent;
    expect(t).toContain('VIDEOTHEK LENZ');
    expect(t).toContain('Mitgliedsausweis');
    expect(t).toContain('004711');
    expect(t).toContain('Max');
    expect(t).toMatch(/\d{2}\.\d{2}\.\d{4}/);
    expect(t).toContain(`Entdeckungen 2/${TOTAL}`);
    expect(ui.el.querySelectorAll('.lfx-store-card-stamp')).toHaveLength(TOTAL);
    expect(ui.el.querySelectorAll('.lfx-store-card-stamp.is-on')).toHaveLength(2);
  });
  it('Stempelanzahl folgt total (nie fest 15), Raster bis 31', () => {
    expect(buildCard(data({ total: 20 }), {}).el.querySelectorAll('.lfx-store-card-stamp')).toHaveLength(20);
    expect(buildCard(data({ total: 31 }), {}).el.querySelectorAll('.lfx-store-card-stamp')).toHaveLength(31);
    expect(buildCard(data({ total: 99 }), {}).el.querySelectorAll('.lfx-store-card-stamp')).toHaveLength(31);
  });
  it('Stufen färben die Karte (Klasse + data-tier)', () => {
    for (const tier of ['bronze', 'silver', 'gold']) {
      const c = buildCard(data({ tier }), {}).el.querySelector('.lfx-store-card');
      expect(c.classList.contains(`is-${tier}`)).toBe(true);
      expect(c.dataset.tier).toBe(tier);
    }
    expect(buildCard(data({ tier: 'xx' }), {}).el.querySelector('.is-bronze')).toBeTruthy();
  });
  it('Gold: Glitzer nur ohne reduced-motion; CSS schaltet die Animation bei reduce ab', () => {
    expect(buildCard(data({ tier: 'gold' }), {}).el.querySelector('.is-glitter')).toBeTruthy();
    expect(buildCard(data({ tier: 'gold' }), { reduced: true }).el.querySelector('.is-glitter')).toBeNull();
    expect(buildCard(data({ tier: 'silver' }), {}).el.querySelector('.is-glitter')).toBeNull();
    const css = fs.readFileSync(path.resolve(cwd(), 'src/css/themes/store/card.css'), 'utf8');
    const m = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/);
    expect(m).toBeTruthy();
    expect(m[1]).toMatch(/is-glitter::after[^}]*animation:\s*none/);
    expect(css).toMatch(/animation:\s*lfx-store-card-glint/);
  });
  it('ohne Namen steht ein Strich; peer-Titel nennt den Namen', () => {
    expect(buildCard(data({ name: null }), {}).el.textContent).toContain('—');
    const peer = buildCard(data({ name: 'Eva' }), { mode: 'peer' });
    expect(peer.el.textContent).toContain('Ausweis von Eva');
  });
  it('Schließen per Knopf und Esc; gate: Knopf „Weiter“, Esc zählt nicht', () => {
    const onClose = vi.fn();
    const ui = buildCard(data(), { mode: 'self', onClose });
    document.body.appendChild(ui.el);
    ui.el.querySelector('.lfx-store-card-btn').click();
    expect(onClose).toHaveBeenCalledTimes(1);
    ui.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalledTimes(2);
    const g = vi.fn();
    const gate = buildCard(data(), { mode: 'gate', onClose: g });
    document.body.appendChild(gate.el);
    expect(gate.el.querySelector('.lfx-store-card-btn').textContent).toBe('Weiter');
    gate.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(g).not.toHaveBeenCalled();
    gate.el.querySelector('.lfx-store-card-btn').click();
    expect(g).toHaveBeenCalledTimes(1);
    ui.destroy();
    gate.destroy();
  });
  it('rent: klein, ohne Stempel und ohne Knopf', () => {
    const ui = buildCard(data(), { mode: 'rent' });
    expect(ui.el.classList.contains('is-rent')).toBe(true);
    expect(ui.el.querySelector('.lfx-store-card-stamp')).toBeNull();
    expect(ui.el.querySelector('button')).toBeNull();
  });
  it('Porträt: Platzhalter bis geladen, danach Canvas', async () => {
    const c = document.createElement('canvas');
    let res;
    const ui = buildCard(data(), { portrait: new Promise((r) => { res = r; }) });
    expect(ui.el.querySelector('.lfx-store-card-photo canvas')).toBeNull();
    expect(ui.el.querySelector('.lfx-store-card-photo-ph').hidden).toBe(false);
    res(c);
    await Promise.resolve();
    await Promise.resolve();
    expect(ui.el.querySelector('.lfx-store-card-photo canvas')).toBe(c);
    expect(ui.el.querySelector('.lfx-store-card-photo-ph').hidden).toBe(true);
  });
  it('Stempelreihenfolge: Bit i = Katalogindex i', () => {
    const ui = buildCard(data({ stamps: stampsMask([CATALOG[0].id]) }), {});
    expect(ui.el.querySelector('.lfx-store-card-stamp').classList.contains('is-on')).toBe(true);
  });
});

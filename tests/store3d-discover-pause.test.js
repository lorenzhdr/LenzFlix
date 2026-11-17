// @vitest-environment jsdom
// VIDEOTHEK LENZ · Pause-Menü: Eintrag „Entdeckungen (n/N)“ und Liste.
import { describe, it, expect } from 'vitest';
import { createPause } from '../src/js/store3d/ui/pause.js';

const base = () => ({ onResume() {}, onSearch() {}, onClassic() {}, onQuality() {}, onSound() {}, onFps() {}, onBigCovers() {}, onTheme() {}, onMenu() {}, getQuality: () => 'auto', getSound: () => true, getFps: () => false, getBigCovers: () => true });
const data = { count: 1, total: 3, items: [{ id: 'a', found: true, title: 'Fund A', desc: 'Beschreibung A', hint: 'Hinweis A' }, { id: 'b', found: false, title: 'Fund B', desc: 'Beschreibung B', hint: 'Hinweis B' }] };

describe('Pause: Entdeckungen', () => {
  it('ohne Daten ausgeblendet', () => {
    const host = document.createElement('div');
    const p = createPause(host, base());
    expect([...host.querySelectorAll('button')].some((b) => b.textContent.startsWith('Entdeckungen') && !b.hidden)).toBe(false);
    p.destroy();
  });
  it('zeigt Zähler, Liste mit ??? und Hinweisen, Zurück schließt', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const p = createPause(host, { ...base(), getDiscover: () => data });
    p.show();
    const btn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Entdeckungen (1/3)');
    expect(btn).toBeTruthy();
    btn.click();
    const text = host.querySelector('.lfx-store-discoverpick').textContent;
    expect(text).toContain('Fund A');
    expect(text).toContain('Beschreibung A');
    expect(text).toContain('???');
    expect(text).toContain('Hinweis B');
    expect(text).not.toContain('Fund B');
    expect(p.pickOpen).toBe(true);
    p.closePick();
    expect(p.pickOpen).toBe(false);
    p.destroy();
    host.remove();
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createParty } from '../src/js/store3d/cinema/party.js';
import { joinOffers } from '../src/js/store3d/palast/choice.js';

// Naht party.offers() -> choice.joinOffers (Welle 4 Korrektur 1: itemId gegen i) und „ohne Mehrspieler kein Konsolenfehler“.
const FILM = 'f0000000000000000000000000000004';
let clock;
function mkNet(o = {}) {
  const l = new Map();
  const n = {
    send: vi.fn(() => true),
    on: (ev, fn) => { const s = l.get(ev) || new Set(); s.add(fn); l.set(ev, s); return () => s.delete(fn); },
    emit: (ev, ...a) => { for (const f of [...(l.get(ev) || [])]) f(...a); },
    has: (k) => k === 'kino', serverNow: () => clock, me: () => ({ c: 1, k: 'k' }), active: () => true, setKino: vi.fn(), ...o,
  };
  return n;
}
const mk = (net) => createParty({ net: () => net, bridge: () => null, film: () => true, chatOn: () => false, toast: () => {} });

beforeEach(() => { vi.useFakeTimers(); clock = 1_000_000; });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('party.offers() -> joinOffers', () => {
  it('Angebot erscheint mit Titel und Unterzeile; unbekannter Film nicht', () => {
    const net = mkNet();
    const party = mk(net);
    party.listen();
    net.emit('msg:kh', { l: [[5, 2, FILM, 2, 1, [2, 3], 60000, clock], [6, 3, 'f0000000000000000000000000000009', 1, 1, [3], 0, clock]] });
    const items = new Map([[FILM, { Id: FILM, Name: 'Testfilm', Type: 'Movie' }]]);
    const out = joinOffers(party.offers(), items, null, 1, clock + 5000);
    expect(out).toHaveLength(1);
    expect(out[0].itemId).toBe(FILM);
    expect(out[0].sid).toBe(5);
    expect(out[0].title).toBe('Testfilm');
    expect(out[0].sub).toMatch(/^läuft bei 1:05/);
    party.dispose();
  });
  it('Form von offers() ist festgelegt', () => {
    const net = mkNet();
    const party = mk(net);
    net.emit('msg:kh', { l: [[5, 2, FILM, 2, 1, [2], 0, clock]] });
    party.listen();
    net.emit('msg:kh', { l: [[5, 2, FILM, 2, 1, [2], 0, clock]] });
    expect(Object.keys(party.offers()[0])).toEqual(['sid', 'host', 'itemId', 'n', 'st', 'm', 'p', 'at']);
    party.dispose();
  });
});

describe('party ohne Mehrspieler: still', () => {
  it('offers(), listen(), poll(), stand(), wrap() ohne net, ohne kino, ohne me(): kein Fehler, kein warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const net of [null, mkNet({ has: () => false }), mkNet({ me: undefined })]) {
      const party = mk(net);
      expect(party.offers()).toEqual([]);
      party.listen(); party.poll(clock, null); party.stand(); party.wrap(null);
      party.dispose();
    }
    const noMe = mk(mkNet({ me: () => null }));
    expect(noMe.offers()).toEqual([]);
    noMe.dispose();
    expect(warn).not.toHaveBeenCalled();
  });
});

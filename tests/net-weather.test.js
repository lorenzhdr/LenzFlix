// VIDEOTHEK LENZ · net/weather.js (Welle c, C2): Regen für alle gleich aus wl.wx und Server-Zeit; daytime.setRaining. Kein Netzwerk.
import { describe, it, expect, vi } from 'vitest';
import { createWeather, WX_EVAL_S } from '../src/js/store3d/net/weather.js';
import { wxRain, wxRoll, WX_SLOT_MS } from '../src/js/store3d/net/proto.js';

function setup(o = {}) {
  const st = { live: true, now: o.now === undefined ? 1_000_000_000 : o.now };
  const w = o.noProvider ? null : { setRaining: vi.fn() };
  const core = { ctx: { use: (n) => (n === 'weather' ? w : null) }, active: () => st.live, serverNow: () => st.now };
  return { part: createWeather(core), w, st };
}

// ein Seed, der im Slot von now regnet, und einer ohne Regen
const NOW = 1_000_000_000;
const rainSd = (() => { for (let sd = 1; sd < 5000; sd++) if (wxRain(sd, NOW)) return sd; return 0; })();
const drySd = (() => { for (let sd = 1; sd < 5000; sd++) if (!wxRain(sd, NOW)) return sd; return 0; })();

describe('net/weather', () => {
  it('Regen ist eine Funktion aus Seed und Slot: gleiche Eingabe, gleiches Ergebnis; Schwelle 0,35', () => {
    expect(rainSd).toBeGreaterThan(0);
    expect(wxRoll(rainSd, NOW)).toBeLessThan(0.35);
    expect(wxRoll(drySd, NOW)).toBeGreaterThanOrEqual(0.35);
    expect(wxRoll(rainSd, NOW)).toBe(wxRoll(rainSd, NOW + 1000)); // gleicher Slot
    expect(WX_SLOT_MS).toBe(1800000);
  });

  it('Willkommen setzt den Regen sofort (Regen und trocken)', () => {
    const a = setup();
    a.part.welcome({ wx: { sd: rainSd, l: 1800 } });
    expect(a.w.setRaining).toHaveBeenLastCalledWith(true);
    const b = setup();
    b.part.welcome({ wx: { sd: drySd, l: 1800 } });
    expect(b.w.setRaining).toHaveBeenLastCalledWith(false);
  });

  it('wertet alle 15 s neu aus (Slotwechsel)', () => {
    const s = setup();
    s.part.welcome({ wx: { sd: rainSd } });
    const n = s.w.setRaining.mock.calls.length;
    s.part.tick(WX_EVAL_S - 1);
    expect(s.w.setRaining.mock.calls.length).toBe(n);
    // nächster Slot, anderes Ergebnis möglich: es wird erneut ausgewertet
    s.st.now += WX_SLOT_MS;
    s.part.tick(2);
    expect(s.w.setRaining.mock.calls.length).toBe(n + 1);
    expect(s.w.setRaining).toHaveBeenLastCalledWith(wxRain(rainSd, NOW + WX_SLOT_MS));
  });

  it('ohne Server-Zeit beim Willkommen: Wiederholung im Tick, bis sie da ist', () => {
    const s = setup({ now: null });
    s.part.welcome({ wx: { sd: rainSd } });
    expect(s.w.setRaining).not.toHaveBeenCalled();
    s.part.tick(0.6);
    expect(s.w.setRaining).not.toHaveBeenCalled();
    s.st.now = NOW;
    s.part.tick(0.6);
    expect(s.w.setRaining).toHaveBeenCalledWith(true);
  });

  it('ohne wl.wx nichts; stop/dispose stellt die lokale Entscheidung (null) wieder her', () => {
    const a = setup();
    a.part.welcome({});
    a.part.tick(60);
    expect(a.w.setRaining).not.toHaveBeenCalled();
    const b = setup();
    b.part.welcome({ wx: { sd: drySd } });
    b.part.stop();
    expect(b.w.setRaining).toHaveBeenLastCalledWith(null);
    b.part.tick(60);
    const n = b.w.setRaining.mock.calls.length;
    b.part.tick(60);
    expect(b.w.setRaining.mock.calls.length).toBe(n);
    const c = setup();
    c.part.welcome({ wx: { sd: rainSd } });
    c.part.dispose();
    expect(c.w.setRaining).toHaveBeenLastCalledWith(null);
  });

  it('ohne Provider (Modul daytime fehlt) bricht nichts', () => {
    const s = setup({ noProvider: true });
    expect(() => { s.part.welcome({ wx: { sd: rainSd } }); s.part.tick(20); s.part.stop(); }).not.toThrow();
  });
});

// VIDEOTHEK LENZ · Mehrspieler (lfx-mp.1, Welle c): Wetter für alle gleich. Teil „weather“ des Moduls net (Fabrik createWeather, net/parts.js).
// Der Server liefert im Willkommen `wl.wx = { sd, l }`; Regen ist rein eine Funktion aus Seed und Server-Zeit (proto.js wxRain, 30-min-Slots,
// Vertrag docs/mp-api.md §8.3). Die Tageszeit bleibt die lokale Uhr. Der Teil wertet beim Willkommen und danach alle 15 s aus und schiebt das
// Ergebnis über den Provider 'weather'.setRaining(on) in modules/daytime.js (dort hat der Debug-Wert `rain` Vorrang). Ohne `wl.wx`, ohne
// Server-Zeit oder nach stop()/dispose() steht setRaining(null): lokale Entscheidung wie 1.15.
//   createWeather(core) → { welcome(wl), tick(dt), stop(), dispose() }
import { wxRain } from './proto.js';

export const WX_EVAL_S = 15; // Auswertung alle 15 s
const WX_RETRY_S = 0.5; // solange noch keine Server-Zeit da ist

export function createWeather(core) {
  const ctx = core.ctx;
  let sd = null;
  let acc = 0;
  let synced = false; // schon einmal mit gültiger Server-Zeit ausgewertet
  let pushed = false; // setRaining(true|false) steht (null muss zurückgesetzt werden)

  const provider = () => { const w = ctx.use('weather'); return w && typeof w.setRaining === 'function' ? w : null; };

  function release() {
    if (pushed) { const w = provider(); if (w) { try { w.setRaining(null); } catch { /* egal */ } } }
    pushed = false;
    synced = false;
  }

  function evaluate() {
    if (sd === null || !core.active()) return false;
    const now = core.serverNow();
    if (!Number.isFinite(now)) return false;
    const w = provider();
    if (!w) return false;
    try { w.setRaining(wxRain(sd, now)); } catch { return false; }
    pushed = true;
    synced = true;
    return true;
  }

  return {
    welcome(wl) {
      const x = wl && wl.wx;
      sd = x && typeof x === 'object' && Number.isFinite(x.sd) ? x.sd : null;
      acc = 0;
      synced = false;
      if (sd === null) { release(); return; }
      evaluate();
    },
    tick(dt) {
      if (sd === null) return;
      acc += dt;
      if (acc < (synced ? WX_EVAL_S : WX_RETRY_S)) return;
      acc = 0;
      evaluate();
    },
    stop() { sd = null; acc = 0; release(); },
    dispose() { sd = null; release(); },
  };
}

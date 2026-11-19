// VIDEOTHEK LENZ · Wetterzustand (1.19.0), rein (ohne three/DOM): löst die Quellen in einen abgeleiteten Zustand auf.
// Vorrang: Debug (Harness) > echtes Wetter (deps.weather) > Mehrspieler-Seed (setRaining) > lokaler Zufall.
//   resolveWeather({ debug, real, mp, local }) → { kind, i, raining, snowing, wet, cover, fog, storm, overcast, temp, real, src }
//   debug = { kind?, i?, cover?, sd?, fog?, temp? } | null · real = { k, i, sd, fog, t } | null · mp = true|false|null · local = bool
// raining (drizzle/rain/heavy/storm) bleibt ein Boolean wie vor 1.19; wet = raining || snowing; cover = liegender Schnee 0..1 (aus sd).
export const KINDS = ['clear', 'cloudy', 'fog', 'drizzle', 'rain', 'heavy', 'snow', 'storm'];
export const RAINY = ['drizzle', 'rain', 'heavy', 'storm'];
/** Niederschlagsstärke je Regenart (Niesel/normal/stark/Gewitter). */
const RAIN_I = { drizzle: 0.3, rain: 0.6, heavy: 1, storm: 0.9 };
/** Schneehöhe (m) für dünnen Belag und vollen Belag. */
const SNOW_THIN = 0.02;
const SNOW_FULL = 0.15;

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp01 = (v) => (v > 1 ? 1 : v > 0 ? v : 0);

/** Liegender Schnee aus der Schneehöhe: 0 ohne Schnee, ab 0,02 m dünn (0,2) bis ab 0,15 m voll (1). */
export function coverFromDepth(sd) {
  if (!fin(sd) || sd <= 0) return 0;
  if (sd <= SNOW_THIN) return 0.2;
  return clamp01(0.2 + (0.8 * (sd - SNOW_THIN)) / (SNOW_FULL - SNOW_THIN));
}

/** Stärke des fallenden Niederschlags für precip.setWeather. */
export function precipIntensity(kind, i) {
  if (kind === 'snow') return 0.3 + 0.7 * clamp01(fin(i) ? i : 0.5);
  return RAIN_I[kind] || 0;
}

function derive({ kind, i, cover, fog, temp, real, src }) {
  const k = KINDS.includes(kind) ? kind : 'clear';
  const raining = RAINY.includes(k);
  const snowing = k === 'snow';
  const f = clamp01(fin(fog) ? fog : 0);
  return {
    kind: k,
    i: raining || snowing ? precipIntensity(k, i) : 0,
    raining,
    snowing,
    wet: raining || snowing,
    cover: clamp01(fin(cover) ? cover : 0),
    fog: k === 'fog' ? Math.max(f, 0.5) : f,
    storm: k === 'storm',
    overcast: k !== 'clear',
    temp: fin(temp) ? Math.round(temp) : null,
    real: !!real,
    src,
  };
}

export function resolveWeather({ debug = null, real = null, mp = null, local = false } = {}) {
  if (debug && typeof debug === 'object' && (debug.kind || fin(debug.cover) || fin(debug.sd) || fin(debug.temp))) {
    const kind = KINDS.includes(debug.kind) ? debug.kind : 'clear';
    const cover = fin(debug.cover) ? debug.cover : fin(debug.sd) ? coverFromDepth(debug.sd) : (kind === 'snow' ? 0.5 : 0);
    const fog = fin(debug.fog) ? debug.fog : (kind === 'fog' ? (fin(debug.i) ? debug.i : 0.8) : 0);
    return derive({ kind, i: debug.i, cover, fog, temp: debug.temp, real: !debug.legacy, src: 'debug' }); // legacy = nur ?rain=1/0 (kein echtes Wetter, kein Thermometer)
  }
  if (real && KINDS.includes(real.k)) {
    return derive({ kind: real.k, i: real.i, cover: coverFromDepth(real.sd), fog: real.fog, temp: real.t, real: true, src: 'real' });
  }
  if (mp === true || mp === false) return derive({ kind: mp ? 'rain' : 'clear', real: false, src: 'mp' });
  return derive({ kind: local ? 'rain' : 'clear', real: false, src: 'local' });
}

/** Winterkleidung mit Hysterese: ab ≤ 3 °C an, ab ≥ 6 °C aus, dazwischen bleibt der Zustand; ohne Temperatur aus. */
export function winterNext(prev, temp) {
  if (!fin(temp)) return false;
  if (temp <= 3) return true;
  if (temp >= 6) return false;
  return !!prev;
}

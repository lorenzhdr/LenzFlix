// VIDEOTHEK LENZ · M4 Atmosphäre: gemeinsame, three-freie Helfer (Tageszeit, Wetter, Rate-Limit, Paletten).
// Keine Top-Level-Zugriffe auf window/document (Registry wird auch in Node-Tests importiert).

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

/** Kleiner deterministischer Zufall (mulberry32), unabhängig von three. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stunde (0..24, Bruchteil = Minuten) aus Date, Zahl (Stunde) oder undefined (= jetzt). */
export function hourOf(now) {
  if (typeof now === 'number' && Number.isFinite(now)) return ((now % 24) + 24) % 24;
  const d = now instanceof Date ? now : new Date();
  return d.getHours() + d.getMinutes() / 60;
}

/** 'day' (8–18 Uhr), 'dusk' (6–8 und 18–21 Uhr), 'night' (21–6 Uhr). */
export function timeOfDay(now) {
  const h = hourOf(now);
  if (h >= 8 && h < 18) return 'day';
  if ((h >= 6 && h < 8) || (h >= 18 && h < 21)) return 'dusk';
  return 'night';
}

/** Spät nachts (Kassierer-Spruch „Wir haben eigentlich schon zu …“). */
export function isLate(now) {
  const h = hourOf(now);
  return h >= 23 || h < 5;
}

/** Regenwahrscheinlichkeit je Besuch: ca. 35 %, nachts 50 %. */
export const RAIN_CHANCE = { day: 0.35, dusk: 0.35, night: 0.5 };

/** Regen ja/nein, deterministisch aus Seed; `force` (true/false) überschreibt (nur Debug). */
export function rainDecision(seed, tod, force) {
  if (force === true || force === false) return force;
  return seeded(seed)() < (RAIN_CHANCE[tod] ?? 0.35);
}

// Himmel: [Zenit, Mitte, Horizont] als [r,g,b] 0..1; `shade` = Multiplikator für Außen-Materialien (Fassade, Straße),
// `exposure` = Faktor auf toneMappingExposure, `hemi` = Faktor auf Hemisphärenlicht innen, `cool` = 0..1 Kältetönung innen.
const hexRgb = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const SKY = {
  day: { sky: [0x4a8fe0, 0x8cc4f2, 0xdff0ff].map(hexRgb), shade: [1, 1, 1], exposure: 1, hemi: 1, cool: 0, stars: 0 },
  dusk: { sky: [0x2b2f6e, 0xc4577a, 0xffb36b].map(hexRgb), shade: [0.55, 0.42, 0.5], exposure: 0.98, hemi: 0.95, cool: 0.1, stars: 0.25 },
  night: { sky: [0x04081f, 0x0b1538, 0x16264f].map(hexRgb), shade: [0.14, 0.16, 0.3], exposure: 0.93, hemi: 0.9, cool: 0.35, stars: 1 },
};

/**
 * Paletten für Tageszeit + Regen (Regen: Himmel grauer und dunkler, Außen etwas dunkler). Optionaler dritter Parameter (1.19.0):
 * { overcast: bool, fog: 0..1, snow: bool } für bedeckt/Nebel/Schnee ohne Regen (Himmel entsättigt, Nebel hell und flach).
 * Ohne ihn (oder bei lauter falschen Werten) bleibt das Ergebnis unverändert.
 */
export function skyPalette(tod, rain, ex) {
  const b = SKY[tod] || SKY.day;
  const grey = (c, k, g, s = 0.65) => {
    const l = (c[0] + c[1] + c[2]) / 3;
    return [lerp(c[0], l, s) * g, lerp(c[1], l, s) * g, lerp(c[2], l, s) * g + k];
  };
  if (!rain) {
    const fog = ex && Number.isFinite(ex.fog) ? clamp(ex.fog, 0, 1) : 0;
    const dull = !!ex && (ex.overcast || ex.snow || fog > 0);
    if (!dull) return { ...b, rain: false };
    const s = clamp(0.35 + (ex.snow ? 0.15 : 0) + fog * 0.5, 0, 0.95);
    const g = (ex.snow ? 0.9 : 0.88) - fog * 0.05;
    const sky = b.sky.map((c) => grey(c, 0.005, g, s));
    if (fog > 0) {
      const hor = sky[2]; // Nebel: Zenit und Mitte nähern sich dem Horizont (flacher, milchiger Himmel)
      for (let i = 0; i < 2; i++) sky[i] = sky[i].map((v, k) => lerp(v, hor[k], fog * (i ? 0.6 : 0.8)));
    }
    return {
      sky,
      shade: b.shade.map((v) => v * (ex.snow ? 1 : 0.93)),
      exposure: b.exposure,
      hemi: b.hemi * 0.98,
      cool: Math.min(1, b.cool + 0.04),
      stars: 0,
      rain: false,
    };
  }
  return {
    sky: b.sky.map((c) => grey(c, 0.01, 0.78)),
    shade: b.shade.map((v) => v * 0.85),
    exposure: b.exposure * 0.98,
    hemi: b.hemi * 0.97,
    cool: Math.min(1, b.cool + 0.08),
    stars: 0,
    rain: true,
  };
}

/** Gemeinsame Zustände mehrerer Module je Szene (z. B. Außenbereich von intro.js und daytime.js). */
const SHARED = new WeakMap();
export function shared(owner, key, make) {
  let m = SHARED.get(owner);
  if (!m) { m = new Map(); SHARED.set(owner, m); }
  if (!m.has(key)) m.set(key, make());
  return m.get(key);
}

/** IDs aller Titel der Ab-18-Abteilung(en): erscheinen weder in Personal-Tipps noch auf dem Fernseher im offenen Laden. */
export function adultIds(catalog) {
  const out = new Set();
  for (const d of (catalog && catalog.departments) || []) if (d && d.kind === 'adult') for (const id of d.itemIds || []) out.add(id);
  return out;
}

/** prefers-reduced-motion (SSR/Test-sicher). */
export function prefersReducedMotion() {
  try { return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** Läuft das Intro? (Gleiche Bedingung für Fassade/Rollladen in modules/city.js und modules/intro.js.) */
export function introWanted(o) {
  return !(o && (o.skipIntro || o.restore || o.openItemId || o.openTerminal)) && !prefersReducedMotion();
}

/** Rate-Limit für Sprechblasen: mindestens `gapMs` zwischen zwei Sprüchen; Uhr wird injiziert (Tests). */
export function createLimiter(gapMs = 20000) {
  let last = -Infinity;
  return {
    can(now, { force = false } = {}) { return force || now - last >= gapMs; },
    mark(now) { last = now; },
    reset() { last = -Infinity; },
    get last() { return last; },
  };
}

/** Kürzeste Winkeldifferenz b - a in [-PI, PI]. */
export const angDiff = (a, b) => {
  const T = Math.PI * 2;
  let d = (b - a) % T;
  if (d > Math.PI) d -= T;
  if (d < -Math.PI) d += T;
  return d;
};

// VIDEOTHEK LENZ · NPC-Aussehen (rein): Paletten und deterministische Zusammenstellung einer Figur aus einem Zufallsgeber.
// makeLook(rand, { role?, rain? }) → Look { height, build, skin, hair, hairStyle, top, bottom, shoes, hat, glasses, bag, umbrella, apron?, stripe? }

const SKIN = [[0.96, 0.78, 0.65], [0.93, 0.74, 0.6], [0.84, 0.62, 0.47], [0.7, 0.5, 0.36], [0.5, 0.34, 0.24], [0.38, 0.25, 0.18]];
const HAIR = [[0.1, 0.07, 0.06], [0.24, 0.13, 0.1], [0.45, 0.28, 0.14], [0.8, 0.62, 0.3], [0.7, 0.2, 0.12], [0.75, 0.75, 0.78], [0.3, 0.6, 0.85], [0.9, 0.35, 0.65]];
const TOP = [[0.85, 0.2, 0.2], [0.2, 0.45, 0.8], [0.95, 0.8, 0.2], [0.25, 0.65, 0.4], [0.55, 0.3, 0.7], [0.95, 0.5, 0.15], [0.9, 0.9, 0.92], [0.2, 0.22, 0.3], [0.95, 0.5, 0.65], [0.35, 0.75, 0.8]];
const BOTTOM = [[0.14, 0.16, 0.3], [0.22, 0.25, 0.4], [0.3, 0.25, 0.2], [0.12, 0.12, 0.14], [0.5, 0.5, 0.52], [0.55, 0.4, 0.25], [0.2, 0.35, 0.3]];
const SHOES = [[0.1, 0.1, 0.12], [0.9, 0.9, 0.92], [0.7, 0.2, 0.15], [0.35, 0.22, 0.12]];
const HATS = [null, null, null, 'cap', 'beanie', 'hat'];
const BAGS = [null, null, null, 'bag', 'shopping', 'backpack'];
const HAIR_STYLES = ['short', 'long', 'bald', 'tuft', 'bob'];

const pick = (arr, rand) => arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))];
const range = (a, b, rand) => a + (b - a) * rand();

/** Feste Rollen-Looks (Personal): Uniform-Farben. */
const ROLES = {
  ticket: { top: [0.55, 0.1, 0.18], bottom: [0.12, 0.1, 0.16], shoes: [0.08, 0.08, 0.1], stripe: [0.95, 0.8, 0.25], hat: 'cap', hatColor: [0.55, 0.1, 0.18], hair: HAIR[1], skin: SKIN[2], hairStyle: 'short', bag: null, glasses: true, height: 1.0, build: 1.0 },
  popcorn: { top: [0.93, 0.93, 0.95], bottom: [0.75, 0.15, 0.15], shoes: [0.15, 0.1, 0.1], stripe: [0.85, 0.15, 0.15], hat: 'cap', hatColor: [0.85, 0.15, 0.15], hair: HAIR[3], skin: SKIN[1], hairStyle: 'bob', bag: null, glasses: false, height: 0.98, build: 1.08 },
  kiosk: { top: [0.95, 0.5, 0.65], bottom: [0.3, 0.25, 0.4], shoes: [0.2, 0.15, 0.2], stripe: [1, 1, 1], hat: null, hair: HAIR[5], skin: SKIN[1], hairStyle: 'bob', bag: null, glasses: true, apron: [1, 0.85, 0.35], height: 0.96, build: 1.12 },
};

export function makeLook(rand, opts = {}) {
  const role = opts.role && ROLES[opts.role];
  if (role) return { ...role, role: opts.role, umbrella: false };
  const skin = pick(SKIN, rand);
  const hat = pick(HATS, rand);
  const top = pick(TOP, rand);
  return {
    role: null,
    height: range(0.9, 1.08, rand),
    build: range(0.88, 1.2, rand),
    skin,
    hair: pick(HAIR, rand),
    hairStyle: pick(HAIR_STYLES, rand),
    top,
    bottom: pick(BOTTOM, rand),
    shoes: pick(SHOES, rand),
    hat,
    hatColor: hat ? pick(TOP, rand) : null,
    glasses: rand() < 0.22,
    bag: pick(BAGS, rand),
    bagColor: pick(TOP, rand),
    stripe: rand() < 0.25 ? pick(TOP, rand) : null,
    umbrella: !!opts.rain && rand() < 0.75,
    umbrellaColor: pick(TOP, rand),
  };
}

/**
 * Schlüssel für den Geometrie-Cache (ohne Regenschirm, der ein eigenes Mesh ist; ohne height/build, die nur das Rig skalieren).
 * Render-Look v2: Schlüssel aus allen Render-Feldern (Farben auf 1/255 genau, damit jede Farbe die Geometrie ändert).
 */
export function lookKey(look) {
  if (look.v === 2) {
    const c = (v) => (Array.isArray(v) ? v.map((x) => Math.round(x * 255)).join('.') : '-');
    const o = (v) => (v && typeof v === 'object' ? v : {});
    const t = o(look.top);
    const b = o(look.bottom);
    const s = o(look.shoes);
    const h = o(look.hat);
    const g = o(look.bag);
    return ['v2', look.shape, c(look.skin), look.hairStyle, c(look.hair), look.eyes, look.brows, look.beard, t.cut, c(t.color), t.pattern, c(t.color2), b.cut, c(b.color), b.pattern, c(b.color2), s.model, c(s.color), c(s.sole), look.glasses, h.id, c(h.color), g.id, c(g.color)].join('|');
  }
  const f = (c) => (c ? c.map((v) => Math.round(v * 20)).join('.') : '-');
  return [look.role || 'p', f(look.skin), f(look.hair), look.hairStyle, f(look.top), f(look.bottom), f(look.shoes), look.hat || '-', f(look.hatColor), look.glasses ? 1 : 0, look.bag || '-', f(look.bagColor), f(look.stripe), f(look.apron)].join('|');
}

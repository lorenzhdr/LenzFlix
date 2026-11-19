// VIDEOTHEK LENZ · Figur-Editor (1.17.0): reines Modell (ohne DOM/three) – Zustand, Reiter, Auswahl-Logik, Sperren, Plätze, Abbrechen.
// Benutzt von ui/chareditor.js (Ansicht) und modules/avatar.js (Provider). Vertrag: .tmp/v117/contracts.md §3, §9.
//   createEditorModel({ code, slots, active, found, rand }) → Modell (siehe Rückgabe unten)
//   TABS · controlsFor(tabId, state) liefert Beschreibungen { id, label, kind: 'choice'|'color'|'range'|'slots', field, … }
import {
  UNLOCK_BASE, HAIR_STYLES, EYES, BROWS, BEARDS, SHAPES, TOP_CUTS, TOP_PATTERNS, BOTTOM_CUTS, BOTTOM_PATTERNS, SHOE_MODELS, GLASSES, HATS, BAGS,
  UNLOCK_TOPS, UNLOCK_BOTTOMS, UNLOCK_SHOES, UNLOCK_GLASSES, UNLOCK_HATS, UNLOCK_BAGS, SKIN, HAIR_COLORS, CLOTH_COLORS, SHOE_COLORS,
} from './ids.js';
import { F, LEN, CUSTOM_COLOR, MAX_CODE, decode, defaultCode, equal, encodeColor, decodeColor, randomLook } from './look2.js';
import { isUnlocked, lockHint } from './unlocks.js';

export const TABS = [
  { id: 'body', label: 'Körper', focus: 'body' },
  { id: 'hair', label: 'Haare', focus: 'hair' },
  { id: 'face', label: 'Gesicht', focus: 'face' },
  { id: 'top', label: 'Oberteil', focus: 'top' },
  { id: 'bottom', label: 'Hose', focus: 'bottom' },
  { id: 'shoes', label: 'Schuhe', focus: 'shoes' },
  { id: 'extras', label: 'Extras', focus: 'extras' },
  { id: 'slots', label: 'Plätze', focus: 'body' },
];

/** Kamerafokus des Studios je Reiter. */
export const focusOfTab = (id) => (TABS.find((t) => t.id === id) || TABS[0]).focus;
export const isTab = (id) => TABS.some((t) => t.id === id);

/** Felder mit Freischalt-Teilen → Slot-Name (char/unlocks.js). */
export const UNLOCK_SLOT = { [F.topCut]: 'top', [F.botCut]: 'bottom', [F.shoeModel]: 'shoes', [F.glasses]: 'glasses', [F.hat]: 'hat', [F.bag]: 'bag' };

/** Teil der Beschriftung (Deutsch). */
const L = {
  hair: ['Kurz', 'Lang', 'Glatze', 'Schopf', 'Bob', 'Millimeter', 'Seitenscheitel', 'Locken', 'Afro', 'Pferdeschwanz', 'Dutt', 'Irokese', 'Vokuhila', 'Stachelig', 'Tolle', 'Zöpfe', 'Zöpfchen', 'Undercut'],
  eyes: ['Punkte', 'Rund', 'Schmal', 'Verschlafen', 'Weit', 'Zwinkernd'],
  brows: ['Keine', 'Dünn', 'Dick', 'Geschwungen', 'Streng'],
  beard: ['Keiner', 'Stoppeln', 'Schnauzer', 'Spitzbart', 'Vollbart', 'Kinnbart'],
  shape: ['Gerade', 'Breite Schultern', 'Breite Hüften'],
  top: ['T-Shirt', 'Langarm', 'Kapuzenpulli', 'Hemd', 'Trägershirt', 'Pullover', 'Jacke', 'Weste', 'Polo', 'Kleid'],
  topU: ['Regencape', 'Dreier-Trikot', 'Hausverbot-Shirt', 'Warnweste-Shirt', 'Nietenjacke'],
  topP: ['Einfarbig', 'Brustband', 'Ringel', 'Längsstreifen', 'Zweifarbig', 'Karo'],
  bottom: ['Jeans', 'Shorts', 'Rock', 'Cargo', 'Trainingshose', 'Weite Hose'],
  bottomU: ['Zebrastreifen-Hose'],
  bottomP: ['Einfarbig', 'Streifen', 'Zweifarbig', 'Karo'],
  shoe: ['Turnschuhe', 'Stiefel', 'Sandalen', 'Halbschuhe', 'Hohe Turnschuhe'],
  shoeU: ['Farbklecks-Treter'],
  glasses: ['Keine', 'Rund', 'Eckig', 'Sonnenbrille', 'Streberbrille'],
  glassesU: ['Fliegerbrille', 'Dreidimensionale Brille', 'Pflaster-Veilchen'],
  hat: ['Keine', 'Kappe', 'Mütze', 'Hut', 'Anglerhut', 'Stirnband', 'Baskenmütze'],
  hatU: ['Goldkappe', 'Krone des Fundus', 'Katzenöhrchen', 'Dosenhut', 'Platzanweiser-Mütze', 'Lockenwickler-Haube'],
  bag: ['Keine', 'Umhängetasche', 'Rucksack', 'Einkaufstasche'],
  bagU: ['Chipstüte am Gurt', 'Kassettenrucksack', 'Katzenkopf-Rucksack'],
};

/** Provider-`setColor(part, idx)` → Feld. */
export const COLOR_PART_FIELD = {
  hair: F.hairColor, top: F.topColor, top2: F.topColor2, bottom: F.botColor, bottom2: F.botColor2, shoes: F.shoeColor, sole: F.sole, hat: F.hatColor, bag: F.bagColor,
};

const choice = (id, label, field, base, labels, unlock, unlockLabels, slot) => ({ id, label, kind: 'choice', field, base, labels, unlock, unlockLabels, slot });
const color = (id, label, field, palette, custom = true) => ({ id, label, kind: 'color', field, palette, custom });
const range = (id, label, field, min, max, lo, hi) => ({ id, label, kind: 'range', field, min, max, lo, hi });

const DEFS = {
  body: [
    color('skin', 'Hautton', F.skin, SKIN, false),
    range('height', 'Größe', F.height, 0, 20, 'klein', 'groß'),
    range('build', 'Statur', F.build, 0, 20, 'schmal', 'kräftig'),
    choice('shape', 'Körperform', F.shape, SHAPES, L.shape),
  ],
  hair: [
    choice('hairStyle', 'Frisur', F.hairStyle, HAIR_STYLES, L.hair),
    color('hairColor', 'Haarfarbe', F.hairColor, HAIR_COLORS),
  ],
  face: [
    choice('eyes', 'Augen', F.eyes, EYES, L.eyes),
    choice('brows', 'Brauen', F.brows, BROWS, L.brows),
    choice('beard', 'Bart', F.beard, BEARDS, L.beard),
  ],
  top: [
    choice('topCut', 'Schnitt', F.topCut, TOP_CUTS, L.top, UNLOCK_TOPS, L.topU, 'top'),
    color('topColor', 'Farbe', F.topColor, CLOTH_COLORS),
    choice('topPattern', 'Muster', F.topPattern, TOP_PATTERNS, L.topP),
    color('topColor2', 'Zweite Farbe', F.topColor2, CLOTH_COLORS),
  ],
  bottom: [
    choice('botCut', 'Schnitt', F.botCut, BOTTOM_CUTS, L.bottom, UNLOCK_BOTTOMS, L.bottomU, 'bottom'),
    color('botColor', 'Farbe', F.botColor, CLOTH_COLORS),
    choice('botPattern', 'Muster', F.botPattern, BOTTOM_PATTERNS, L.bottomP),
    color('botColor2', 'Zweite Farbe', F.botColor2, CLOTH_COLORS),
  ],
  shoes: [
    choice('shoeModel', 'Modell', F.shoeModel, SHOE_MODELS, L.shoe, UNLOCK_SHOES, L.shoeU, 'shoes'),
    color('shoeColor', 'Farbe', F.shoeColor, SHOE_COLORS),
    color('sole', 'Sohle', F.sole, SHOE_COLORS),
  ],
  extras: [
    choice('glasses', 'Brille', F.glasses, GLASSES, L.glasses, UNLOCK_GLASSES, L.glassesU, 'glasses'),
    choice('hat', 'Kopfbedeckung', F.hat, HATS, L.hat, UNLOCK_HATS, L.hatU, 'hat'),
    color('hatColor', 'Farbe der Kopfbedeckung', F.hatColor, CLOTH_COLORS),
    choice('bag', 'Tasche', F.bag, BAGS, L.bag, UNLOCK_BAGS, L.bagU, 'bag'),
    color('bagColor', 'Farbe der Tasche', F.bagColor, CLOTH_COLORS),
  ],
};

/** Alle Felddefinitionen (für Tests und Zufall): Feldindex → Definition. */
export const FIELD_DEFS = Object.values(DEFS).flat().reduce((m, d) => { m[d.field] = d; return m; }, {});

const isInt = (v) => typeof v === 'number' && Number.isInteger(v);
const copy = (c) => (Array.isArray(c) ? c.slice() : null);
const validSlot = (c) => Array.isArray(c) && c.length === LEN && c[0] === 2;

export function colorHex(code, palette) {
  const [r, g, b] = decodeColor(code, palette);
  const h = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
export const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/**
 * Editor-Modell. `slots` = gespeicherte Plätze (3 × int[26] | null), `active` = aktiver Platz, `found` = IDs der Entdeckungen
 * (Freischaltungen), `rand` = Zufallsquelle. Der Arbeitscode gehört dem Aktiven Platz; `result()` schreibt ihn dort hinein.
 */
export function createEditorModel({ code, slots, active, found = [], rand = Math.random } = {}) {
  const stored = [0, 1, 2].map((i) => (slots && validSlot(slots[i]) ? decode(slots[i]) : null));
  let act = isInt(active) && active >= 0 && active <= 2 ? active : 0;
  let cur = decode(code && validSlot(code) ? code : stored[act] || defaultCode());
  const origCode = cur.slice();
  const origSlots = stored.map(copy);
  const origAct = act;
  let foundIds = Array.isArray(found) ? found.slice() : [];

  const slotOfField = (field) => UNLOCK_SLOT[field] || null;
  const codeIsLocked = (field, v) => {
    const slot = slotOfField(field);
    return !!slot && isInt(v) && v >= UNLOCK_BASE && !isUnlocked(slot, v, foundIds);
  };

  const model = {
    code: () => cur.slice(),
    original: () => origCode.slice(),
    active: () => act,
    get: (field) => cur[field],
    setFound(f) { foundIds = Array.isArray(f) ? f.slice() : []; },

    /** Feld setzen. false bei ungültigem Wert, gesperrtem Teil oder unverändertem Wert. */
    set(field, value) {
      if (!isInt(field) || field < 1 || field >= LEN || !isInt(value)) return false;
      if (codeIsLocked(field, value)) return false;
      const t = cur.slice();
      t[field] = value;
      const d = decode(t);
      if (d[field] !== value || cur[field] === value) return false;
      cur = d;
      return true;
    },
    /** Eigene Farbe (nicht bei Haut). rgb = [r,g,b] 0..1. */
    setCustomColor(field, rgb) {
      const def = FIELD_DEFS[field];
      if (!def || def.kind !== 'color' || !def.custom || !Array.isArray(rgb)) return false;
      return model.set(field, encodeColor(rgb));
    },
    isLocked: (field, value) => codeIsLocked(field, value),
    lockHint: (field, value) => { const s = slotOfField(field); return s ? lockHint(s, value) : ''; },

    /** Alles zufällig (nur freigeschaltete Teile). */
    randomize() {
      const unl = new Set();
      for (const f of Object.keys(UNLOCK_SLOT)) {
        const slot = UNLOCK_SLOT[f];
        const list = { top: UNLOCK_TOPS, bottom: UNLOCK_BOTTOMS, shoes: UNLOCK_SHOES, glasses: UNLOCK_GLASSES, hat: UNLOCK_HATS, bag: UNLOCK_BAGS }[slot];
        for (let i = 0; i < list.length; i++) if (isUnlocked(slot, UNLOCK_BASE + i, foundIds)) unl.add(slot + ':' + (UNLOCK_BASE + i));
      }
      cur = decode(randomLook(rand, unl));
      return cur.slice();
    },
    /** Zurück auf den Stand beim Öffnen (Abbrechen). */
    reset() {
      cur = origCode.slice();
      act = origAct;
      for (let i = 0; i < 3; i++) stored[i] = copy(origSlots[i]);
      return cur.slice();
    },
    dirty() {
      if (!equal(cur, origCode) || act !== origAct) return true;
      return stored.some((s, i) => !((s === null && origSlots[i] === null) || (s && origSlots[i] && equal(s, origSlots[i]))));
    },

    // --- Plätze ---
    slots: () => [0, 1, 2].map((i) => ({ index: i, filled: !!stored[i] || i === act, active: i === act, code: i === act ? cur.slice() : copy(stored[i]) })),
    /** Gespeicherten Platz laden (verwirft die Änderungen am bisherigen aktiven Arbeitscode). */
    loadSlot(i) {
      if (!isInt(i) || i < 0 || i > 2 || !stored[i] || i === act) return false;
      act = i;
      cur = stored[i].slice();
      return true;
    },
    /** Leeren Platz anlegen: zufälliger Vorschlag, wird aktiv. */
    newSlot(i) {
      if (!isInt(i) || i < 0 || i > 2 || stored[i] || i === act) return false;
      act = i;
      model.randomize();
      return true;
    },
    /** Arbeitscode in den Platz i kopieren; der Platz wird aktiv. */
    saveToSlot(i) {
      if (!isInt(i) || i < 0 || i > 2) return false;
      if (i === act) return true;
      stored[i] = cur.slice();
      act = i;
      return true;
    },
    /** Ergebnis für „Übernehmen“: Plätze mit eingerechnetem Arbeitscode. */
    result() {
      const out = stored.map(copy);
      out[act] = cur.slice();
      return { code: cur.slice(), slots: out, active: act };
    },

    // --- Beschreibungen für die Ansicht ---
    tabs: () => TABS,
    controls: (tabId) => controlsFor(tabId, model),
  };
  return model;
}

/** Steuerelemente eines Reiters als einfache Beschreibung (Optionen mit selected/locked/hint). */
export function controlsFor(tabId, model) {
  const defs = DEFS[tabId];
  if (tabId === 'slots') return [{ id: 'slots', label: 'Plätze', kind: 'slots', slots: model.slots() }];
  if (!defs) return [];
  return defs.map((d) => {
    const v = model.get(d.field);
    if (d.kind === 'choice') {
      const options = d.base.map((id, i) => ({ value: i, id, label: d.labels[i] || id, locked: false, hint: '', selected: v === i }));
      if (d.unlock) {
        d.unlock.forEach((id, i) => {
          const value = UNLOCK_BASE + i;
          const locked = model.isLocked(d.field, value);
          options.push({ value, id, label: d.unlockLabels[i] || id, locked, hint: locked ? model.lockHint(d.field, value) : '', selected: v === value, unlock: true });
        });
      }
      return { id: d.id, label: d.label, kind: 'choice', field: d.field, options };
    }
    if (d.kind === 'color') {
      const custom = v >= CUSTOM_COLOR && v <= MAX_CODE;
      return {
        id: d.id, label: d.label, kind: 'color', field: d.field, custom: d.custom, value: v, isCustom: custom, hex: colorHex(v, d.palette),
        options: d.palette.map((_, i) => ({ value: i, hex: colorHex(i, d.palette), selected: v === i, label: `Farbe ${i + 1}` })),
      };
    }
    return { id: d.id, label: d.label, kind: 'range', field: d.field, min: d.min, max: d.max, value: v, lo: d.lo, hi: d.hi };
  });
}

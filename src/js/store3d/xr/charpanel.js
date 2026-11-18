// VIDEOTHEK LENZ · VR-Figurpanel „VR light“ (1.17.0): Outfit-Platz 1–3, Zufall, Paletten-Farben je Teil.
// Reine Spec-Funktion (kein three/DOM) für ctx.xr.panel.open(spec); der Provider `avatar` liefert die Daten.
// Kein Farbwähler, keine Texteingabe: nur große Felder für Laser/Trigger. Das Panel baut sich bei Änderungen
// per handle.update(spec) neu auf (die Textur-Erneuerung bei Größenwechsel erledigt xr/panel.js).
import { HAIR_COLORS, CLOTH_COLORS, SHOE_COLORS, UNLOCK_BASE } from '../char/ids.js';
import { F } from '../char/look2.js';

const NAMES_HAIR = ['Schwarz', 'Dunkelbraun', 'Braun', 'Kastanie', 'Hellbraun', 'Blond', 'Hellblond', 'Rotbraun', 'Orange', 'Grau', 'Weiß', 'Blau', 'Pink', 'Violett', 'Grün', 'Gelb'];
const NAMES_CLOTH = ['Rot', 'Blau', 'Gelb', 'Grün', 'Lila', 'Orange', 'Weiß', 'Nachtblau', 'Rosa', 'Türkis', 'Schwarz', 'Grau', 'Braun', 'Marine', 'Tannengrün', 'Weinrot'];
const NAMES_SHOE = ['Schwarz', 'Weiß', 'Rostrot', 'Braun', 'Blau', 'Grau', 'Gelb', 'Grün', 'Rosa', 'Lila', 'Dunkelbraun', 'Orange', 'Türkis', 'Weinrot', 'Beige', 'Marine'];

/** Teile des Panels (Reihenfolge = Reiter): avatar.setColor(part, idx), Look-Code-Index für die Markierung. */
export const PARTS = [
  { part: 'hair', label: 'Haare', field: F.hairColor, palette: HAIR_COLORS, names: NAMES_HAIR },
  { part: 'top', label: 'Oberteil', field: F.topColor, palette: CLOTH_COLORS, names: NAMES_CLOTH },
  { part: 'bottom', label: 'Hose', field: F.botColor, palette: CLOTH_COLORS, names: NAMES_CLOTH },
  { part: 'shoes', label: 'Schuhe', field: F.shoeColor, palette: SHOE_COLORS, names: NAMES_SHOE },
  { part: 'hat', label: 'Mütze', field: F.hatColor, palette: CLOTH_COLORS, names: NAMES_CLOTH },
  { part: 'bag', label: 'Tasche', field: F.bagColor, palette: CLOTH_COLORS, names: NAMES_CLOTH },
];

const call = (fn) => { try { return fn(); } catch { return undefined; } };

/**
 * Panel-Spec.
 * @param {object} avatar Provider avatar (slots/active/setSlot/randomize/setColor/code)
 * @param {{part:number}} state Zustand (gewählter Reiter, Index in PARTS)
 * @param {{refresh:()=>void, close:()=>void, onClose?:()=>void}} hooks
 */
export function buildCharSpec(avatar, state, hooks = {}) {
  const slots = call(() => avatar.slots()) || [];
  const active = call(() => avatar.active());
  const code = call(() => avatar.code()) || [];
  const cur = PARTS[state.part] || PARTS[0];
  const refresh = () => { if (hooks.refresh) hooks.refresh(); };

  const buttons = [];
  for (let i = 0; i < 3; i++) {
    const filled = !!slots[i];
    buttons.push({
      label: filled ? `Platz ${i + 1}` : `Platz ${i + 1} (leer)`,
      row: 0,
      on: filled && active === i,
      disabled: !filled,
      onSelect: () => { call(() => avatar.setSlot(i)); refresh(); },
    });
  }
  buttons.push({ label: 'Zufall', row: 1, onSelect: () => { call(() => avatar.randomize()); refresh(); } });
  buttons.push({ label: 'Fertig', row: 1, primary: true, onSelect: () => { if (hooks.close) hooks.close(); } });

  const sel = code[cur.field];
  cur.palette.forEach((rgb, idx) => {
    buttons.push({
      label: cur.names[idx],
      row: 2 + Math.floor(idx / 4),
      on: Number.isInteger(sel) && sel < UNLOCK_BASE && sel === idx,
      swatch: rgb.slice(0, 3).map((v) => Math.round(v * 255)), // Palette 0..1 → xr/panel.js erwartet 0..255
      onSelect: () => { call(() => avatar.setColor(cur.part, idx)); refresh(); },
    });
  });

  return {
    title: 'Figur',
    width: 0.9,
    tabs: PARTS.map((p, i) => ({ label: p.label, on: i === state.part, onSelect: () => { state.part = i; refresh(); } })),
    buttons,
    onClose: hooks.onClose,
  };
}

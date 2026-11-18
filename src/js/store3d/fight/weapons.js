// VIDEOTHEK LENZ · Waffentabelle und Treffer-Auswahl (1.18.0; rein, ohne three/DOM). Vertrag .tmp/v118/contracts.md §1.
export const WEAPON_IDS = ['hand', 'belt', 'whip', 'laser'];
export const CONE_DEG = 25;

/** range m · max Treffer · dmg Energie-Schaden · knock Rückstoß-Faktor · cooldown s · sfx Ton. Laser: kein Schaden, eigene Logik (laser-logic.js). */
const TABLE = {
  hand: { id: 'hand', range: 1.6, cone: CONE_DEG, max: 1, dmg: 12, knock: 1.0, cooldown: 0.35, sfx: 'slap' },
  belt: { id: 'belt', range: 2.2, cone: CONE_DEG, max: 1, dmg: 20, knock: 1.6, cooldown: 0.6, sfx: 'belt' },
  whip: { id: 'whip', range: 3.5, cone: CONE_DEG, max: 2, dmg: 26, knock: 1.4, cooldown: 1.0, sfx: 'whip' },
  laser: { id: 'laser', range: 15, cone: 0, max: 0, dmg: 0, knock: 0, cooldown: 0, sfx: 'laser' },
};

/** Waffen-Eintrag (unbekannte Id → hand). Kopie, damit Aufrufer die Tabelle nicht verändern. */
export function weaponInfo(id) { return { ...TABLE[WEAPON_IDS.includes(id) ? id : 'hand'] }; }

/**
 * Treffer-Auswahl in der xz-Ebene: Kandidaten [{x,z,...}] im Kegel (±cone) bis range, nächste zuerst, höchstens max.
 * → [{ index, dist, cand }]. Laser ohne Treffer (max 0).
 */
export function selectTargets(origin, dir, candidates, weapon) {
  const w = typeof weapon === 'string' ? weaponInfo(weapon) : (weapon || weaponInfo('hand'));
  const l = Math.hypot(dir.x, dir.z);
  if (!(w.max > 0) || l < 1e-4 || !candidates) return [];
  const dx = dir.x / l;
  const dz = dir.z / l;
  const cos = Math.cos(((w.cone || CONE_DEG) * Math.PI) / 180);
  const out = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const rx = c.x - origin.x;
    const rz = c.z - origin.z;
    const dist = Math.hypot(rx, rz);
    if (dist > w.range) continue;
    if (dist > 0.25 && (rx * dx + rz * dz) / dist < cos) continue;
    out.push({ index: i, dist, cand: c });
  }
  out.sort((a, b) => a.dist - b.dist);
  return out.slice(0, w.max);
}

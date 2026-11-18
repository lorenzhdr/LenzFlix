// VIDEOTHEK LENZ · Waffentabelle (1.18.0, Stub aus Welle 4; rein, ohne three/DOM; gefüllt in Welle 6). Vertrag .tmp/v118/contracts.md §1.
export const WEAPON_IDS = ['hand', 'belt', 'whip', 'laser'];
/** Waffen-Eintrag (Stub: nur die Id; Reichweite/Schaden folgen in Welle 6). */
export function weaponInfo(id) { return { id: WEAPON_IDS.includes(id) ? id : 'hand' }; }

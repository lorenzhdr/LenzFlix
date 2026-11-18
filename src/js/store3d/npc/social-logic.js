// VIDEOTHEK LENZ · NPC-Gesten (1.18.0; rein): Reaktion auf Spieler-Emotes, Ereignisse (Jubel, Kopfschütteln), Alltag, Auswahl der Reagierenden.
/** Spieler-Emote (id wie in net/emotes.js) → Reaktion { anim, cat (npc/lines.js), secs }. Nur Tanzen, Winken, Verbeugen lösen etwas aus. */
export const EMOTE_REACT = {
  dance: { anim: 'dance', cat: 'emoteDance', secs: 4 },
  wave: { anim: 'wave', cat: 'emoteWave', secs: 2.4 },
  bow: { anim: 'clap', cat: 'emoteBow', secs: 2.4 },
};
/** Ereignis → Reaktion. */
export const EVENT_REACT = {
  basket: { anim: 'cheer', cat: 'cheerBasket', secs: 2.6 },
  cans: { anim: 'cheer', cat: 'cheerCans', secs: 2.6 },
  discover: { anim: 'clap', cat: 'cheerDiscover', secs: 2.4 },
  alarm: { anim: 'shake', cat: 'headAlarm', secs: 1.6 },
  ban: { anim: 'shake', cat: 'headBan', secs: 1.6 },
};
/** Alltags-Wahrscheinlichkeiten je Sekunde (Warten an der Ampel, Bekannte). */
export const AMBIENT = { dance: 0.012, wave: 0.03, danceCool: 60, radius: 16 };

/** Emote-Name (id, 'Tanzen', Anim) → Reaktion | null. */
export function emoteReaction(name) {
  if (typeof name !== 'string') return null;
  const s = name.trim().toLowerCase();
  const id = s === 'tanzen' ? 'dance' : s === 'winken' ? 'wave' : s === 'verbeugen' ? 'bow' : s;
  return EMOTE_REACT[id] || null;
}

/** Entdeckungs-ID → Ereignisart (null = keine Reaktion). */
export function eventForDiscover(id) {
  if (!id) return null;
  if (id === 'hoop-3') return 'basket';
  if (id === 'can-pyramid') return 'cans';
  if (id === 'richard-ban') return 'ban';
  if (id === 'knockout' || id === 'gang-flee') return null;
  return 'discover';
}

/** Nächste Kandidaten [{x,z,...}] bis Radius r, höchstens n. → Kandidaten, nächste zuerst. */
export function pickReactors(cands, origin, o = {}) {
  const r = o.r || 8;
  const n = o.n || 2;
  return cands
    .map((c) => ({ c, d: Math.hypot(c.x - origin.x, c.z - origin.z) }))
    .filter((e) => e.d <= r)
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((e) => e.c);
}

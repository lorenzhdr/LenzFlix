// VIDEOTHEK LENZ · Suchergebnisse clientseitig ranken (rein): exakter Titel > Titel beginnt mit > Wortanfang > enthält > Rest.
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9äöüß ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Rang 0 (bester) bis 4 (kein Titeltreffer). */
export function titleRank(name, query) {
  const n = norm(name);
  const q = norm(query);
  if (!q) return 4;
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (` ${n}`.includes(` ${q}`)) return 2;
  if (n.includes(q)) return 3;
  return 4;
}

/**
 * @param {Array} items Jellyfin-Items
 * @param {string} query
 * @param {{hideRestFrom?: number}} [o] Rest (kein Titeltreffer) ausblenden, wenn mindestens so viele Titeltreffer existieren (Standard 5)
 */
export function rankResults(items, query, o = {}) {
  const hideFrom = o.hideRestFrom == null ? 5 : o.hideRestFrom;
  const scored = (items || []).filter((x) => x && x.Id).map((it, i) => ({ it, i, r: titleRank(it.Name, query) }));
  scored.sort((a, b) => a.r - b.r || a.i - b.i);
  const hits = scored.filter((x) => x.r < 4).length;
  return (hits >= hideFrom ? scored.filter((x) => x.r < 4) : scored).map((x) => x.it);
}

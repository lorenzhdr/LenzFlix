// WinAnsi (cp1252) für das PDF. Rein, ohne Abhängigkeiten.

const C1 = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

function codeOf(cp) {
  if (cp >= 0x20 && cp <= 0x7e) return cp;
  if (cp >= 0xa0 && cp <= 0xff) return cp;
  return C1[cp] || 0;
}

/** String → cp1252-Bytes. Unbekanntes: NFKD ohne Akzente (ő → o), sonst „?“. Steuerzeichen → Leerzeichen. */
export function encodeWinAnsi(str) {
  const out = [];
  for (const ch of String(str == null ? '' : str)) {
    const cp = ch.codePointAt(0);
    if (cp < 0x20 || cp === 0x7f) { out.push(0x20); continue; }
    let c = codeOf(cp);
    if (c) { out.push(c); continue; }
    const base = ch.normalize('NFKD');
    let any = false;
    for (const b of base) {
      const bp = b.codePointAt(0);
      if (bp >= 0x300 && bp <= 0x36f) continue; // Akzent entfernen
      const bc = codeOf(bp);
      out.push(bc || 0x3f);
      any = true;
    }
    if (!any) out.push(0x3f);
  }
  return Uint8Array.from(out);
}

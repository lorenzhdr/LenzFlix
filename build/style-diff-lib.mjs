// Diff-Logik für LENZFLIX-Style-Snapshots (siehe build/style-snapshot.js).

/** Snapshot zu flacher Map { schluessel: wert } machen. */
export function flatten(snap) {
  const out = new Map();
  const s = snap || {};
  out.set('meta | url', s.url ?? '');
  out.set('meta | innerWidth', s.innerWidth ?? '');
  out.set('meta | htmlClasses', (s.htmlClasses || []).join(' '));
  for (const [k, v] of Object.entries(s.vars || {})) out.set(`vars | ${k}`, v);
  for (const [sel, e] of Object.entries(s.els || {})) {
    if (e.error) { out.set(`${sel} | error`, e.error); continue; }
    out.set(`${sel} | count`, e.count);
    for (const part of ['style', 'before', 'after']) {
      for (const [p, v] of Object.entries(e[part] || {})) out.set(`${sel} | ${part === 'style' ? '' : part + ':'}${p}`, v);
    }
  }
  return out;
}

/**
 * Zwei Snapshots vergleichen.
 * @returns {{kind:'changed'|'added'|'removed', group:string, prop:string, from:any, to:any}[]}
 */
export function diffSnapshots(oldSnap, newSnap, { ignore = [] } = {}) {
  const skip = new Set(ignore.map((s) => s.trim()).filter(Boolean));
  const a = flatten(oldSnap);
  const b = flatten(newSnap);
  const keys = [...new Set([...a.keys(), ...b.keys()])];
  const out = [];
  for (const key of keys) {
    const idx = key.lastIndexOf(' | ');
    const group = key.slice(0, idx);
    const prop = key.slice(idx + 3);
    const bare = prop.replace(/^(before|after):/, '');
    if (skip.has(prop) || skip.has(bare)) continue;
    const inA = a.has(key);
    const inB = b.has(key);
    if (inA && inB) {
      if (String(a.get(key)) !== String(b.get(key))) out.push({ kind: 'changed', group, prop, from: a.get(key), to: b.get(key) });
    } else if (inB) out.push({ kind: 'added', group, prop, from: undefined, to: b.get(key) });
    else out.push({ kind: 'removed', group, prop, from: a.get(key), to: undefined });
  }
  return out;
}

const KIND_LABEL = { changed: 'GEAENDERT', added: 'NEU', removed: 'FEHLT' };

/** Diff als Text-Tabelle formatieren. */
export function formatDiff(diffs) {
  if (!diffs.length) return 'Keine Unterschiede.';
  const rows = diffs.map((d) => [
    KIND_LABEL[d.kind],
    d.group,
    d.prop,
    d.from === undefined ? '-' : String(d.from),
    d.to === undefined ? '-' : String(d.to),
  ]);
  const head = ['Art', 'Selektor', 'Property', 'Alt', 'Neu'];
  const all = [head, ...rows];
  const widths = head.map((_, i) => Math.min(60, Math.max(...all.map((r) => r[i].length))));
  const fmt = (r) => r.map((c, i) => (c.length > widths[i] ? c.slice(0, widths[i] - 1) + '…' : c.padEnd(widths[i]))).join('  ').trimEnd();
  return [fmt(head), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(fmt), '', `${diffs.length} Unterschied(e).`].join('\n');
}

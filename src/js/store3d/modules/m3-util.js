// VIDEOTHEK LENZ · M3 Kasse & Orte: reine Helfer (ohne three, ohne DOM) – Standort-Label, Suchergebnis-Mapping, Spurpunkte, Atlas-UVs.

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const pad2 = (n) => String(n).padStart(2, '0');

/** „Mo 11.11.2026  14:32:05“ (Verleihsystem-Kopfzeile). */
export function formatClock(d) {
  const t = d instanceof Date ? d : new Date(d);
  return `${WEEKDAYS[t.getDay()]} ${pad2(t.getDate())}.${pad2(t.getMonth() + 1)}.${t.getFullYear()}  ${pad2(t.getHours())}:${pad2(t.getMinutes())}:${pad2(t.getSeconds())}`;
}

export function departmentLabel(departments, id) {
  const d = (departments || []).find((x) => x && x.id === id);
  return d ? d.label : '';
}

/**
 * Standort einer Hülle: „Gang 3 · Regal 2 · Horror“. `slot` = ctx.items.slotOf(id) ({ run (1-basiert), face, dept }),
 * `layout` = ctx.layout (runs, faces). Ohne Slot: „im Lager“.
 */
export function locationLabel(slot, layout, departments) {
  if (!slot) return 'im Lager';
  const runs = (layout && layout.runs) || [];
  const run = runs[slot.run - 1];
  const face = layout && layout.faces ? layout.faces[slot.face] : null;
  const seg = face && Number.isFinite(face.seg) ? face.seg + 1 : null;
  const dept = departmentLabel(departments, slot.dept);
  let place;
  const style = run && run.style;
  if (style === 'wall') place = 'Serienwand';
  else if (style === 'kids') place = 'Kinder-Ecke';
  else if (style === 'adult') place = 'Ab 18';
  else if (style === 'new') place = 'Neuheiten-Regal';
  else {
    let n = 0;
    for (let i = 0; i <= slot.run - 1 && i < runs.length; i++) if (runs[i].style !== 'wall' && runs[i].style !== 'kids' && runs[i].style !== 'adult' && runs[i].style !== 'new') n++;
    place = n > 0 ? `Gang ${n}` : 'Gang';
  }
  const parts = [place];
  if (seg) parts.push(`Regal ${seg}`);
  const lp = place.toLowerCase();
  const ld = dept.toLowerCase();
  if (dept && !(ld && (lp.includes(ld) || ld.includes(lp)))) parts.push(dept);
  return parts.join(' · ');
}

export function typeLabel(item) {
  switch (item && item.Type) {
    case 'Movie': return 'Film';
    case 'Series': return 'Serie';
    case 'Episode': return 'Folge';
    case 'Season': return 'Staffel';
    case 'BoxSet': return 'Reihe';
    case 'Video': return 'Video';
    default: return (item && item.Type) || 'Titel';
  }
}

export const isEpisode = (item) => !!item && item.Type === 'Episode';

/** „S2 F3“ (Folge) – leer, wenn Nummern fehlen. */
export function episodeTag(item) {
  if (!item) return '';
  const s = Number.isFinite(item.ParentIndexNumber) ? `S${item.ParentIndexNumber}` : '';
  const e = Number.isFinite(item.IndexNumber) ? `F${item.IndexNumber}` : '';
  return [s, e].filter(Boolean).join(' ');
}

/** „Weiterschauen: Serie · S2 F3 · Titel“. */
export function resumeLabel(item) {
  if (!item) return '';
  if (!isEpisode(item)) return `Weiterschauen: ${item.Name || ''}`;
  return ['Weiterschauen: ' + (item.SeriesName || 'Serie'), episodeTag(item), item.Name].filter(Boolean).join(' · ');
}

/** Bildquelle für ein Cover: Folgen zeigen das Serien-Cover. */
export function coverRef(item) {
  if (!item) return { id: '', tag: undefined };
  if (isEpisode(item) && item.SeriesId) return { id: item.SeriesId, tag: item.SeriesPrimaryImageTag || undefined };
  return { id: item.Id, tag: item.ImageTags && item.ImageTags.Primary ? item.ImageTags.Primary : undefined };
}

/** Backdrop-Quelle (Schaufenster): Backdrop, sonst Primary. */
export function backdropRef(item) {
  if (item && item.BackdropImageTags && item.BackdropImageTags.length) return { id: item.Id, type: 'Backdrop', tag: item.BackdropImageTags[0] };
  return { id: item.Id, type: 'Primary', tag: item.ImageTags && item.ImageTags.Primary ? item.ImageTags.Primary : undefined };
}

/** Fortschritt 0..1 eines Titels (lfx.progress, sonst UserData.PlayedPercentage). */
export function progressOf(item) {
  if (!item) return 0;
  if (item.lfx && item.lfx.progress > 0) return Math.min(1, item.lfx.progress);
  const p = item.UserData && item.UserData.PlayedPercentage;
  return p > 0 ? Math.min(1, p / 100) : 0;
}

/**
 * Suchergebnis → Terminal-Zeile. env = { has(id) → bool (im Katalog), locate(id) → string | null (Standort-Label, null = nicht im Laden) }.
 * Aktionen: guide (Hinführen), counter (über den Tresen), play (Abspielen), series (Zur Serie).
 */
export function describeResult(item, env) {
  const ep = isEpisode(item);
  const targetId = ep ? item.SeriesId || null : item.Id;
  const inCatalog = !!targetId && env.has(targetId);
  const loc = inCatalog ? env.locate(targetId) : null;
  const sub = ep ? [item.SeriesName, episodeTag(item)].filter(Boolean).join(' · ') : '';
  const actions = [];
  if (loc) actions.push('guide');
  if (inCatalog && !ep) actions.push('counter');
  if (ep || !inCatalog) actions.push('play');
  if (ep && inCatalog) actions.push('series');
  return {
    id: item.Id,
    targetId,
    title: item.Name || '—',
    sub,
    year: item.ProductionYear ? String(item.ProductionYear) : '',
    typeLabel: typeLabel(item),
    location: loc || 'im Lager',
    inStore: !!loc,
    inCatalog,
    isEpisode: ep,
    actions,
    item,
  };
}

/** Standardansicht bei leerer Suche: „Neu im Sortiment“ und „Zuletzt zurückgegeben“. */
export function defaultSections(catalog, getItem, max = 6) {
  const out = [];
  const newDept = ((catalog && catalog.departments) || []).find((d) => d.kind === 'new');
  const fresh = newDept ? newDept.itemIds.map((id) => getItem(id)).filter(Boolean).slice(0, max) : [];
  if (fresh.length) out.push({ title: 'Neu im Sortiment', items: fresh });
  const back = ((catalog && catalog.resume) || []).slice(0, max);
  if (back.length) out.push({ title: 'Zuletzt zurückgegeben', items: back });
  return out;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Länge des Streckenzugs start → path[0] → … */
export function pathLength(start, path) {
  let len = 0;
  let px = start.x;
  let pz = start.z;
  for (const p of path || []) { len += Math.hypot(p.x - px, p.z - pz); px = p.x; pz = p.z; }
  return len;
}

/**
 * Leuchtspur: Punkte im Abstand `spacing` entlang des Streckenzugs start → path. Jeder Punkt trägt den Yaw `a`
 * (Konvention des Grundrisses: Vorwärts = (-sin a, -cos a)). Maximal `max` Punkte (Abstand wächst bei langen Wegen).
 */
export function trailPoints(start, path, spacing = 0.7, max = 90) {
  const total = pathLength(start, path);
  if (!(total > 0.05)) return [];
  const step = Math.max(spacing, total / max);
  const out = [];
  let dist = step * 0.5; // Abstand bis zum nächsten Punkt
  let px = start.x;
  let pz = start.z;
  for (const p of path) {
    const dx = p.x - px;
    const dz = p.z - pz;
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    const a = Math.atan2(-dx, -dz);
    let at = 0;
    while (dist <= len - at + 1e-9) {
      at += dist;
      out.push({ x: px + (dx / len) * at, z: pz + (dz / len) * at, a });
      dist = step;
    }
    dist -= len - at;
    px = p.x;
    pz = p.z;
  }
  return out;
}

/** Atlas-Zelle i (zeilenweise, oben links beginnend) → Pixel- und UV-Rechteck (UV mit flipY, v nach oben). */
export function atlasCell(i, cols, rows, cw, ch) {
  const c = i % cols;
  const r = Math.floor(i / cols);
  return {
    x: c * cw, y: r * ch, w: cw, h: ch,
    uv: [c / cols, 1 - (r + 1) / rows, (c + 1) / cols, 1 - r / rows],
  };
}

/** Verteilt n Zentren gleichmäßig über [x0, x1] (Mitte der n Abschnitte). */
export function spreadCenters(n, x0, x1) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(x0 + ((i + 0.5) / n) * (x1 - x0));
  return out;
}

/** Teilt die Liste auf `parts` Gruppen (je höchstens `cap`), Reihenfolge bleibt. */
export function splitEven(list, parts, cap) {
  const out = [];
  const n = Math.min(list.length, parts * cap);
  const base = Math.floor(n / parts);
  const extra = n % parts;
  let cur = 0;
  for (let i = 0; i < parts; i++) {
    const k = base + (i < extra ? 1 : 0);
    out.push(list.slice(cur, cur + k));
    cur += k;
  }
  return out;
}

/** Reiner Textumbruch für Canvas-Beschriftung (maxChars je Zeile, höchstens maxLines). */
export function wrapText(text, maxChars, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,1}$/, '…');
  }
  return lines;
}

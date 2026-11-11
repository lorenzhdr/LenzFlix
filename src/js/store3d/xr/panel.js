// VIDEOTHEK LENZ · VR-Panel: Canvas-Textur auf einer Fläche (1000 px/m). Spec-Form siehe Vertrag (eingefroren).
// layoutPanel ist rein (ohne Canvas) und liefert Zeichenoperationen sowie Trefferflächen in Pixeln.
import { Mesh, PlaneGeometry, MeshBasicMaterial, CanvasTexture, SRGBColorSpace, DoubleSide, Vector3 } from 'three';
import { keyboardLayout, keyboardHeight, applyKey } from './keyboard.js';

export const PX_PER_M = 1000;
export const MAX_H = 1100;
const PAD = 36;
const GAP = 18;
const MAX_HALF_ANGLE = (27.5 * Math.PI) / 180; // Panel höchstens ~55° breit
const HEAD_TURN = (35 * Math.PI) / 180;
const HEAD_WALK = 0.6;
const ROW_H = 88;
const BTN_H = 76;
const TAB_H = 60;
const INPUT_H = 72;
export const COLORS = {
  bg: 'rgba(13, 19, 48, 0.94)', border: '#2f3d86', text: '#f4f6ff', muted: '#aab4e8', yellow: '#ffd23f', pink: '#ff3d7f',
  fill: '#1a2458', fillOn: '#232f6c', hover: '#3a4a9c', dark: '#0d1330',
};
const FONT = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const approx = (text, size) => String(text).length * size * 0.55;

/** Text auf Breite maxW umbrechen (Wortgrenzen; überlange Wörter bleiben ganz). */
export function wrapText(text, maxW, size, measure = approx) {
  const out = [];
  for (const para of String(text == null ? '' : text).split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const cand = line ? `${line} ${w}` : w;
      if (line && measure(cand, size) > maxW) { out.push(line); line = w; } else line = cand;
    }
    out.push(line);
  }
  return out;
}

function build(s, W, scroll, measure, shift, visCap) {
  const ops = [];
  const hits = [];
  const inner = W - PAD * 2;
  let y = PAD;
  let maxScroll = 0;
  let listVisible = 0;
  const text = (x, yy, t, size, color, extra = {}) => ops.push({ t: 'text', x, y: yy, text: t, size, color, ...extra });
  const rect = (x, yy, w, h, fill, extra = {}) => ops.push({ t: 'rect', x, y: yy, w, h, fill, ...extra });

  if (s.title) {
    for (const ln of wrapText(s.title, inner, 46, measure)) { text(PAD, y, ln, 46, COLORS.yellow, { weight: '700' }); y += 56; }
    y += GAP - 6;
  }
  if (s.text) {
    for (const ln of wrapText(s.text, inner, 32, measure)) { text(PAD, y, ln, 32, COLORS.text); y += 44; }
    y += GAP - 6;
  }
  if (Array.isArray(s.lines) && s.lines.length) {
    for (const l of s.lines) for (const ln of wrapText(l, inner, 26, measure)) { text(PAD, y, ln, 26, COLORS.muted); y += 36; }
    y += GAP - 6;
  }
  if (Array.isArray(s.tabs) && s.tabs.length) {
    const tw = inner / s.tabs.length;
    s.tabs.forEach((tab, i) => {
      const x = PAD + i * tw;
      rect(x + 3, y, tw - 6, TAB_H, tab.on ? COLORS.yellow : COLORS.fill, { r: 14, key: `tab:${i}` });
      text(x + tw / 2, y + 15, tab.label, 28, tab.on ? COLORS.dark : COLORS.text, { align: 'center', weight: '600', maxW: tw - 30 });
      hits.push({ x: x + 3, y, w: tw - 6, h: TAB_H, kind: 'tab', ref: i });
    });
    y += TAB_H + GAP;
  }
  if (s.list && Array.isArray(s.list.rows)) {
    const rows = s.list.rows;
    const visible = visCap || Math.max(1, s.list.visible || 6);
    const shown = Math.min(visible, rows.length);
    listVisible = visible;
    maxScroll = Math.max(0, (rows.length - visible) * ROW_H);
    const sc = Math.max(0, Math.min(maxScroll, scroll || 0));
    const first = Math.floor(sc / ROW_H + 0.0001);
    for (let k = 0; k < shown; k++) {
      const i = first + k;
      const r = rows[i];
      if (!r) break;
      const ry = y + k * ROW_H;
      const acts = Array.isArray(r.actions) ? r.actions : [];
      const aw = 170;
      const bodyW = inner - acts.length * (aw + 8);
      rect(PAD, ry + 4, bodyW, ROW_H - 8, r.selected ? COLORS.fillOn : COLORS.fill, { r: 14, stroke: r.selected ? COLORS.yellow : null, key: `row:${i}` });
      let tagW = 0;
      if (r.tag) {
        tagW = Math.ceil(measure(String(r.tag), 22)) + 28;
        rect(PAD + bodyW - 16 - tagW, ry + 4 + (ROW_H - 8) / 2 - 20, tagW, 40, COLORS.pink, { r: 20 });
        text(PAD + bodyW - 16 - tagW / 2, ry + 4 + (ROW_H - 8) / 2 - 12, r.tag, 22, COLORS.dark, { align: 'center', weight: '700' });
      }
      const labelW = bodyW - 48 - (tagW ? tagW + 16 : 0);
      text(PAD + 24, ry + (r.sub ? 10 : 26), r.label, 30, COLORS.text, { weight: '600', maxW: labelW });
      if (r.sub) text(PAD + 24, ry + 50, r.sub, 22, COLORS.muted, { maxW: bodyW - 48 - (tagW ? tagW + 16 : 0) });
      hits.push({ x: PAD, y: ry + 4, w: bodyW, h: ROW_H - 8, kind: 'row', ref: i });
      acts.forEach((a, j) => {
        const ax = PAD + bodyW + 8 + j * (aw + 8);
        rect(ax, ry + 4, aw, ROW_H - 8, a.primary ? COLORS.yellow : COLORS.fill, { r: 14, key: `action:${i}:${j}` });
        text(ax + aw / 2, ry + 28, a.label, 26, a.primary ? COLORS.dark : COLORS.text, { align: 'center', weight: '600', maxW: aw - 20 });
        hits.push({ x: ax, y: ry + 4, w: aw, h: ROW_H - 8, kind: 'action', ref: { row: i, action: j } });
      });
    }
    if (maxScroll > 0) {
      // Scroll-Indikator im rechten Rand
      const trackH = shown * ROW_H - 8;
      const thumbH = Math.max(40, trackH * (visible / rows.length));
      const thumbY = y + 4 + (trackH - thumbH) * (sc / maxScroll);
      rect(W - 22, y + 4, 8, trackH, COLORS.fill, { r: 4 });
      rect(W - 22, thumbY, 8, thumbH, COLORS.yellow, { r: 4 });
    }
    y += shown * ROW_H + GAP;
  }
  if (s.input) {
    rect(PAD, y, inner, INPUT_H, COLORS.dark, { r: 14, stroke: COLORS.yellow, key: 'input:0' });
    const val = s.input.value == null ? '' : String(s.input.value);
    const has = val !== '';
    const maxW = inner - 44;
    text(PAD + 22, y + 18, has ? val : (s.input.placeholder || ''), 32, has ? COLORS.text : COLORS.muted, { maxW });
    const cx = PAD + 22 + (has ? Math.min(maxW, measure(val, 32)) : 0) + 3;
    ops.push({ t: 'cursor', x: cx, y: y + 16, w: 3, h: 40, fill: COLORS.yellow });
    hits.push({ x: PAD, y, w: inner, h: INPUT_H, kind: 'input', ref: 0 });
    y += INPUT_H + GAP;
    for (const k of keyboardLayout(inner, { shift })) {
      const isShift = k.key === 'shift';
      const isEnter = k.key === 'enter';
      const lit = isEnter || (isShift && shift);
      const kx = PAD + k.x;
      const ky = y + k.y;
      rect(kx, ky, k.w, k.h, lit ? COLORS.yellow : (k.label.length > 1 ? COLORS.fillOn : COLORS.fill), { r: 12, key: `key:${k.key}` });
      text(kx + k.w / 2, ky + 14, k.label, k.label.length > 1 ? 28 : 32, lit ? COLORS.dark : COLORS.text, { align: 'center', weight: '600' });
      hits.push({ x: kx, y: ky, w: k.w, h: k.h, kind: 'key', ref: k.key });
    }
    y += keyboardHeight() + GAP;
  }
  if (s.progress) {
    const v = Math.max(0, Math.min(1, Number(s.progress.value) || 0));
    if (s.progress.label) { text(PAD, y, s.progress.label, 26, COLORS.muted, { maxW: inner }); y += 36; }
    y += 6;
    rect(PAD, y, inner, 24, COLORS.fill, { r: 12, key: 'progress:0' });
    rect(PAD, y, Math.max(24, inner * v), 24, COLORS.yellow, { r: 12 });
    rect(PAD + Math.max(0, inner * v - 14), y - 6, 28, 36, COLORS.text, { r: 14 });
    if (typeof s.progress.onSeek === 'function') hits.push({ x: PAD, y: y - 20, w: inner, h: 64, kind: 'progress', ref: 0 });
    y += 24 + GAP + 8;
  }
  if (Array.isArray(s.buttons) && s.buttons.length) {
    const n = s.buttons.length;
    // Optional: b.row (Zahl) legt die Zeile fest (gleiche Zahl = gleiche Zeile, Reihenfolge bleibt); sonst automatisch gleichmäßig verteilt
    const manual = s.buttons.some((b) => Number.isFinite(b.row));
    const rowOf = [];
    const colOf = [];
    const sizeOf = [];
    let rowsN;
    if (manual) {
      const keys = [...new Set(s.buttons.map((b, i) => (Number.isFinite(b.row) ? b.row : -1 - i)))];
      rowsN = keys.length;
      const counts = new Array(rowsN).fill(0);
      s.buttons.forEach((b, i) => {
        const r = keys.indexOf(Number.isFinite(b.row) ? b.row : -1 - i);
        rowOf[i] = r;
        colOf[i] = counts[r]++;
      });
      s.buttons.forEach((b, i) => { sizeOf[i] = counts[rowOf[i]]; });
    } else {
      const perRow = Math.max(1, Math.min(n, Math.floor((inner + 14) / (190 + 14))));
      rowsN = Math.ceil(n / perRow);
      const per = Math.ceil(n / rowsN);
      s.buttons.forEach((b, i) => {
        const r = Math.floor(i / per);
        rowOf[i] = r;
        colOf[i] = i - r * per;
        sizeOf[i] = Math.min(per, n - r * per);
      });
    }
    s.buttons.forEach((b, i) => {
      const rowIdx = rowOf[i];
      const inRow = sizeOf[i];
      const col = colOf[i];
      const bw = (inner - (inRow - 1) * 14) / inRow;
      const x = PAD + col * (bw + 14);
      const by = y + rowIdx * (BTN_H + 14);
      const off = !!b.disabled;
      const lit = b.on || b.primary;
      rect(x, by, bw, BTN_H, lit ? COLORS.yellow : COLORS.fill, { r: 16, key: off ? null : `button:${i}`, alpha: off ? 0.4 : 1, stroke: b.on && !b.primary ? COLORS.pink : null });
      text(x + bw / 2, by + 21, b.label, 30, lit ? COLORS.dark : COLORS.text, { align: 'center', weight: '700', maxW: bw - 24, alpha: off ? 0.5 : 1 });
      if (!off) hits.push({ x, y: by, w: bw, h: BTN_H, kind: 'button', ref: i });
    });
    y += rowsN * BTN_H + (rowsN - 1) * 14 + GAP;
  }
  const height = Math.max(PAD * 2, y - GAP + PAD);
  return { ops, hits, height, maxScroll, listVisible };
}

/**
 * Layout (rein). Rückgabe { ops, hits, height, maxScroll }.
 * ops: { t:'text', x, y, text, size, color, weight?, align?, maxW? } | { t:'rect', x, y, w, h, fill, stroke?, r?, key?, alpha? } | { t:'cursor', x, y, w, h, fill }
 * hits: { x, y, w, h, kind: 'tab'|'row'|'action'|'input'|'key'|'progress'|'button', ref }
 * scroll = Verschiebung der Liste in Pixeln. opts: { shift, maxH }. Ist der Inhalt höher als maxH (1100 px),
 * werden die sichtbaren Listenzeilen reduziert (die Liste scrollt dann).
 */
export function layoutPanel(spec, W = 900, scroll = 0, measure = approx, opts = {}) {
  const s = spec || {};
  const maxH = opts.maxH || MAX_H;
  let L = build(s, W, scroll, measure, !!opts.shift, 0);
  if (L.height > maxH && L.listVisible > 1) {
    const over = Math.ceil((L.height - maxH) / ROW_H);
    L = build(s, W, scroll, measure, !!opts.shift, Math.max(1, L.listVisible - over));
  }
  return L;
}

/** 2D-Strahl (x, z) in Richtung (dx, dz) gegen Rechtecke { x0, z0, x1, z1 }: freie Strecke bis zum ersten Treffer (höchstens maxDist). */
export function rayClearance(rects, x, z, dx, dz, maxDist = Infinity) {
  let best = maxDist;
  for (const r of rects || []) {
    if (!r || !Number.isFinite(r.x0 + r.x1 + r.z0 + r.z1)) continue;
    let t0 = 0;
    let t1 = best;
    let ok = true;
    for (const [o, d, lo, hi] of [[x, dx, r.x0, r.x1], [z, dz, r.z0, r.z1]]) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } continue; }
      let a = (lo - o) / d;
      let b = (hi - o) / d;
      if (a > b) { const t = a; a = b; b = t; }
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      if (t0 > t1) { ok = false; break; }
    }
    if (ok && t0 < best) best = t0;
  }
  return best;
}

function roundPath(g, x, y, w, h, r) {
  g.beginPath();
  if (r && g.roundRect) g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
}

function paint(g, W, H, laid, hoverKey, cursorOn) {
  g.clearRect(0, 0, W, H);
  g.fillStyle = COLORS.bg;
  roundPath(g, 0, 0, W, H, 28);
  g.fill();
  g.strokeStyle = COLORS.border;
  g.lineWidth = 3;
  roundPath(g, 1.5, 1.5, W - 3, H - 3, 28);
  g.stroke();
  g.textBaseline = 'top';
  for (const op of laid.ops) {
    g.globalAlpha = op.alpha == null ? 1 : op.alpha;
    if (op.t === 'rect') {
      g.fillStyle = op.key && op.key === hoverKey ? COLORS.hover : op.fill;
      roundPath(g, op.x, op.y, op.w, op.h, op.r || 0);
      g.fill();
      if (op.stroke) { g.strokeStyle = op.stroke; g.lineWidth = 3; g.stroke(); }
    } else if (op.t === 'cursor') {
      if (cursorOn) { g.fillStyle = op.fill; g.fillRect(op.x, op.y, op.w, op.h); }
    } else {
      g.font = `${op.weight || '400'} ${op.size}px ${FONT}`;
      g.fillStyle = op.color;
      g.textAlign = op.align || 'left';
      g.fillText(op.text, op.x, op.y, op.maxW || undefined);
    }
  }
  g.globalAlpha = 1;
}

const keyOf = (h) => (h ? (h.kind === 'action' ? `action:${h.ref.row}:${h.ref.action}` : `${h.kind}:${h.ref}`) : null);
const warn = (what, err) => { try { console.warn(`[LenzFlix Store3D] ${what}`, err); } catch { /* egal */ } };

/**
 * Panel öffnen. anchor:
 *  'front' (Standard; auch 'hand'/'seat'): weltfest 1,1 m vor dem Kopf, etwa Augenhöhe − 0,1 m, nur Yaw zum Kopf;
 *  'low': weltfest 0,75 m vor dem Kopf, 0,45 m unter Augenhöhe, zum Kopf geneigt;
 *  Object3D: Kind dieses Objekts;
 *  { object, offset: {x,y,z}, follow: true }: weltfest, folgt dem Objekt träge (Handle-Methode tick(dt), Absicherung per onBeforeRender);
 *  { head: true, offset: {x: rechts, y, z: vor}, follow: true }: weltfest vor dem Kopf, folgt nur bei Drehung > 35° oder Weggehen > 0,6 m;
 *  clearance(x, z, dirX, dirZ, maxDist) → freie Strecke (m): 'front' rückt heran und schrumpft proportional (min. 0,5 m).
 * Rückgabe { mesh, update(spec), close(), hit(uv), hover(uv), scroll(dy), activate(hit), tick(dt), open }.
 * uv: u 0..1 von links, v 0..1 von unten (wie Raycast-uv).
 */
export function openPanel(spec, { anchor = 'front', camera, scene, measure, clearance } = {}) {
  let cur = spec || {};
  const W = Math.round((cur.width || 0.9) * PX_PER_M);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = 256;
  let g = null;
  try { g = canvas.getContext ? canvas.getContext('2d') : null; } catch { g = null; }
  const m = measure || (g ? (t, size) => { g.font = `600 ${size}px ${FONT}`; return g.measureText(t).width; } : approx);
  const makeTex = () => {
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  let tex = makeTex();
  // UI liegt immer oben (sonst ragen Regale/Hüllen in nahe Panels); der Laser zeichnet danach (renderOrder 950)
  const mat = new MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthTest: false, depthWrite: false, side: DoubleSide });
  const mesh = new Mesh(new PlaneGeometry(1, 1), mat);
  mesh.name = 'lfx-panel';
  mesh.renderOrder = 900;
  let laid = null;
  let scrollPx = 0;
  let hoverKey = null;
  let isOpen = true;
  let H = 0;
  let kbValue = null; // Eingabewert, falls die Spec ihn nicht zurückgibt
  let shift = false;
  let cursorOn = true;

  const effective = () => (cur.input && kbValue != null ? { ...cur, input: { ...cur.input, value: kbValue } } : cur);

  function redraw() {
    laid = layoutPanel(effective(), W, scrollPx, m, { shift });
    scrollPx = Math.max(0, Math.min(laid.maxScroll, scrollPx));
    const h = Math.min(MAX_H, Math.ceil(laid.height));
    if (h !== H) {
      const first = H === 0;
      H = h;
      canvas.height = H;
      mesh.geometry.dispose();
      mesh.geometry = new PlaneGeometry(W / PX_PER_M, H / PX_PER_M);
      // three legt den Texturspeicher fest an (texStorage2D): nach Größenwechsel neue Textur, sonst Geisterbild/kein Update
      if (!first) {
        tex.dispose();
        tex = makeTex();
        mat.map = tex;
        mat.needsUpdate = true;
      }
    }
    if (g) { paint(g, W, H, laid, hoverKey, cursorOn); tex.needsUpdate = true; }
  }

  // --- Anker ---
  const follow = anchor && anchor.follow && anchor.object && anchor.object.isObject3D ? anchor : null;
  const headFollow = !follow && anchor && anchor.follow && anchor.head ? anchor : null;
  const headRef = { x: 0, z: 0, fx: 0, fz: -1, set: false };
  const wantPos = new Vector3();
  const tmp = new Vector3();
  const head = new Vector3();
  const dir = new Vector3();
  const readHead = () => {
    if (!camera) return false;
    head.setFromMatrixPosition(camera.matrixWorld);
    dir.setFromMatrixColumn(camera.matrixWorld, 2).negate();
    return true;
  };
  const yawDir = () => {
    const d = dir.clone();
    d.y = 0;
    if (d.lengthSq() < 1e-6) d.set(0, 0, -1);
    return d.normalize();
  };

  function placeWorld() {
    const host = scene || (camera && camera.parent);
    if (host) host.add(mesh);
    if (!readHead()) return;
    const d = yawDir();
    // Winkelbreite höchstens ~55°: sonst weiter weg
    const minDist = (W / PX_PER_M / 2) / Math.tan(MAX_HALF_ANGLE);
    if (anchor === 'low') {
      const dist = Math.max(0.85, minDist);
      mesh.position.set(head.x + d.x * dist, head.y - 0.4, head.z + d.z * dist);
      mesh.lookAt(head.x, head.y, head.z);
    } else {
      const nominal = Math.max(1.1, minDist);
      let dist = nominal;
      if (typeof clearance === 'function') {
        // Regal/Wand vor dem Kopf: Panel rückt heran (min. 0,5 m) und schrumpft proportional (gleiche Winkelgröße)
        let free;
        try { free = Number(clearance(head.x, head.z, d.x, d.z, nominal + 0.15)); } catch { free = NaN; }
        if (Number.isFinite(free) && free - 0.15 < nominal) dist = Math.max(0.5, free - 0.15);
      }
      mesh.scale.setScalar(dist / nominal);
      mesh.position.set(head.x + d.x * dist, head.y - 0.1, head.z + d.z * dist);
      mesh.lookAt(head.x, mesh.position.y, head.z);
    }
  }

  // Kopf-Folgen (träge, weltfest): neues Ziel nur bei Drehung > 35° oder Weggehen > 0,6 m
  function headStep(dt, snap) {
    if (!headFollow || !readHead()) return;
    const d = yawDir();
    let moved = !headRef.set;
    if (!moved) {
      const dot = Math.max(-1, Math.min(1, d.x * headRef.fx + d.z * headRef.fz));
      moved = Math.acos(dot) > HEAD_TURN || Math.hypot(head.x - headRef.x, head.z - headRef.z) > HEAD_WALK;
    }
    if (moved) {
      headRef.set = true;
      headRef.x = head.x; headRef.z = head.z; headRef.fx = d.x; headRef.fz = d.z;
      const o = headFollow.offset || {};
      // rechts = (−d.z, d.x) mit y oben und Blick d; x > 0 = rechts
      wantPos.set(head.x + d.x * (o.z || 0.65) + -d.z * (o.x || 0), head.y + (o.y == null ? -0.15 : o.y), head.z + d.z * (o.z || 0.65) + d.x * (o.x || 0));
    }
    if (snap) mesh.position.copy(wantPos);
    else mesh.position.lerp(wantPos, 1 - Math.exp(-Math.max(0, dt) * 3));
    mesh.rotation.set(0, Math.atan2(head.x - mesh.position.x, head.z - mesh.position.z), 0);
  }

  function followStep(dt, snap) {
    if (!follow) return;
    follow.object.getWorldPosition(tmp);
    const o = follow.offset || {};
    tmp.x += o.x || 0;
    tmp.y += o.y || 0;
    tmp.z += o.z || 0;
    if (snap) mesh.position.copy(tmp);
    else mesh.position.lerp(tmp, 1 - Math.exp(-Math.max(0, dt) * 4));
    if (readHead()) mesh.rotation.set(0, Math.atan2(head.x - mesh.position.x, head.z - mesh.position.z), 0);
  }

  function place() {
    if (anchor && anchor.isObject3D) { anchor.add(mesh); return; }
    if (follow || headFollow) {
      const host = scene || (camera && camera.parent);
      if (host) host.add(mesh);
      if (follow) followStep(0, true); else headStep(0, true);
      return;
    }
    placeWorld();
  }

  redraw();
  place();

  const blink = () => {
    if (!isOpen || !cur.input) return;
    const on = Math.floor(performance.now() / 500) % 2 === 0;
    if (on !== cursorOn) { cursorOn = on; redraw(); }
  };
  let lastTick = -1e9;
  const tick = (dt) => {
    if (!isOpen) return;
    lastTick = performance.now();
    followStep(dt || 0, false);
    headStep(dt || 0, false);
    blink();
  };
  let lastRender = performance.now();
  mesh.onBeforeRender = () => {
    const now = performance.now();
    const dt = (now - lastRender) / 1000;
    lastRender = now;
    if (now - lastTick > 250) { followStep(dt, false); headStep(dt, false); blink(); }
  };

  const hitAt = (uv) => {
    if (!uv || !laid) return null;
    const px = uv.x * W;
    const py = (1 - uv.y) * H;
    for (let i = laid.hits.length - 1; i >= 0; i--) {
      const h = laid.hits[i];
      if (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) return h.kind === 'progress' ? { ...h, frac: Math.max(0, Math.min(1, (px - h.x) / h.w)) } : h;
    }
    return null;
  };

  const handle = {
    mesh,
    get open() { return isOpen; },
    get spec() { return cur; },
    update(next) {
      if (!isOpen) return;
      if (next) {
        const nv = next.input && next.input.value;
        const ov = cur.input && cur.input.value;
        if (nv != null && nv !== ov) kbValue = String(nv);
        if (!next.input) kbValue = null;
        cur = next;
      }
      redraw();
    },
    hit: hitAt,
    hover(uv) {
      const h = hitAt(uv);
      const k = keyOf(h);
      if (k !== hoverKey) { hoverKey = k; redraw(); }
      return h;
    },
    scroll(dy) {
      if (!isOpen || !laid || !laid.maxScroll) return;
      const n = Math.max(0, Math.min(laid.maxScroll, scrollPx + dy));
      if (n !== scrollPx) { scrollPx = n; redraw(); }
    },
    tick,
    /** Treffer auslösen (ruft die onSelect-Funktionen der Spec). */
    activate(h) {
      if (!isOpen || !h) return false;
      try {
        if (h.kind === 'button') { const b = cur.buttons && cur.buttons[h.ref]; if (b && !b.disabled && b.onSelect) b.onSelect(); }
        else if (h.kind === 'tab') { const t = cur.tabs && cur.tabs[h.ref]; if (t && t.onSelect) t.onSelect(); }
        else if (h.kind === 'row') { const r = cur.list && cur.list.rows[h.ref]; if (r && r.onSelect) r.onSelect(); }
        else if (h.kind === 'action') { const r = cur.list && cur.list.rows[h.ref.row]; const a = r && r.actions && r.actions[h.ref.action]; if (a && a.onSelect) a.onSelect(); }
        else if (h.kind === 'progress') { if (cur.progress && cur.progress.onSeek) cur.progress.onSeek(h.frac == null ? 0 : h.frac); }
        else if (h.kind === 'key') {
          if (!cur.input) return false;
          const base = kbValue != null ? kbValue : (cur.input.value == null ? '' : String(cur.input.value));
          const r = applyKey(base, h.ref, { shift });
          shift = r.shift;
          cursorOn = true;
          if (r.enter) { redraw(); if (cur.input.onEnter) cur.input.onEnter(r.value); }
          else {
            const changed = r.value !== base;
            kbValue = r.value;
            redraw();
            if (changed && cur.input.onInput) cur.input.onInput(r.value);
          }
        }
        else if (h.kind === 'input') { /* Fokus liegt immer auf dem Feld */ }
        else return false;
      } catch (err) { warn('Panel', err); }
      return true;
    },
    close() {
      if (!isOpen) return;
      isOpen = false;
      mesh.onBeforeRender = () => {};
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mat.dispose();
      tex.dispose();
      const cb = cur.onClose;
      try { if (cb) cb(); } catch (err) { warn('Panel.onClose', err); }
    },
  };
  return handle;
}

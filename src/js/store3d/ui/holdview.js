// VIDEOTHEK LENZ · Hülle in der Hand: animiert aus dem Regal vor die Kamera, drehbar (Cover vorn, gerenderte Rückseite),
// DOM-Panel mit Aktionen, bei Serien Staffel-Tabs + Folgenliste. Das Card-Mesh hängt an einem Anker: in 2D die Kamera (ohne Tiefentest),
// in VR der Grip-Raum der Hand (mit Tiefentest, Panel per app.xr.openPanel).
import {
  Group, Mesh, BoxGeometry, MeshBasicMaterial, MeshLambertMaterial, CanvasTexture, SRGBColorSpace, LinearFilter, Quaternion, Vector3, Euler,
} from 'three';
import { el } from './hud.js';
import { makeCanvas, FONT } from '../world/textures.js';
import { loadBitmap, closeBitmap } from '../covers/loader.js';
import { COVER, slotWorld } from '../world/build-shelves.js';
import { hash } from '../util/geo.js';

const TMP_Q = new Quaternion();
const TMP_V = new Vector3();
const TMP_E = new Euler();
const IDENT = new Quaternion();
const TARGET = { pos: new Vector3(), scale: 1, quat: new Quaternion() };
const ease = (t) => 1 - (1 - t) ** 3;

const SIDE_COLOR = { vhs: 0xe2d8bd, dvd: 0x1d3f9c, box: 0xc9a227 };
const BACK_COLORS = ['#1f2a44', '#3a1f2e', '#12352f', '#352a12', '#2a1f44', '#14303f'];

function ticksToText(ticks) {
  if (!ticks) return '';
  const min = Math.round(ticks / 600000000);
  if (min < 60) return `${min} Min.`;
  return `${Math.floor(min / 60)} Std. ${min % 60} Min.`;
}

function fsk(r) {
  if (!r) return '';
  const m = /^(?:FSK|DE)?[-\s]?(\d{1,2})$/i.exec(String(r).trim());
  return m ? `FSK ${m[1]}` : String(r);
}

function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text || '').split(/\n+/)) {
    let cur = '';
    for (const w of para.split(/\s+/).filter(Boolean)) {
      const t = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(t).width <= maxW || !cur) cur = t;
      else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
  }
  return out;
}

function drawFront(canvas, item, bmp) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const media = (item.lfx && item.lfx.media) || 'dvd';
  ctx.fillStyle = media === 'vhs' ? '#e2d8bd' : media === 'box' ? '#c9a227' : hash(item.Id || '') % 3 === 0 ? '#101012' : '#1d3f9c';
  ctx.fillRect(0, 0, W, H);
  const m = media === 'vhs' ? [26, 26, 26, 54] : media === 'box' ? [30, 30, 30, 30] : [38, 14, 14, 14];
  const ix = m[0];
  const iy = m[1];
  const iw = W - m[0] - m[2];
  const ih = H - m[1] - m[3];
  if (bmp) {
    const sw = bmp.width || bmp.naturalWidth;
    const sh = bmp.height || bmp.naturalHeight;
    const tr = iw / ih;
    let cw = sw;
    let ch = sh;
    let cx = 0;
    let cy = 0;
    if (sw / sh > tr) { cw = sh * tr; cx = (sw - cw) / 2; } else { ch = sw / tr; cy = (sh - ch) / 2; }
    ctx.drawImage(bmp, cx, cy, cw, ch, ix, iy, iw, ih);
  } else {
    const g = ctx.createLinearGradient(0, iy, 0, iy + ih);
    g.addColorStop(0, '#445'); g.addColorStop(1, '#223');
    ctx.fillStyle = g;
    ctx.fillRect(ix, iy, iw, ih);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = `bold 34px ${FONT}`;
    wrap(ctx, item.Name, iw - 40).slice(0, 6).forEach((l, i) => ctx.fillText(l, W / 2, iy + ih * 0.4 + i * 42));
  }
}

function drawBack(canvas, item) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const genre = (item.Genres && item.Genres[0]) || '';
  ctx.fillStyle = BACK_COLORS[hash(genre || item.Id || '') % BACK_COLORS.length];
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 3;
  ctx.strokeRect(18, 18, W - 36, H - 36);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.font = `bold 42px ${FONT}`;
  let y = 80;
  for (const l of wrap(ctx, item.Name, W - 80).slice(0, 3)) { ctx.fillText(l, 40, y); y += 48; }
  ctx.font = `22px ${FONT}`;
  ctx.fillStyle = '#ffd166';
  const meta = [item.ProductionYear, fsk(item.OfficialRating), item.RunTimeTicks ? ticksToText(item.RunTimeTicks) : (item.ChildCount ? `${item.ChildCount} Staffeln` : ''),
    item.CommunityRating ? `★ ${Number(item.CommunityRating).toFixed(1).replace('.', ',')}` : ''].filter(Boolean).join(' · ');
  y += 4;
  for (const l of wrap(ctx, meta, W - 80)) { ctx.fillText(l, 40, y); y += 28; }
  y += 6;
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `20px ${FONT}`;
  if (item.Genres && item.Genres.length) { ctx.fillText(item.Genres.slice(0, 3).join(' · '), 40, y); y += 36; }
  ctx.fillStyle = '#f2f2f2';
  ctx.font = `23px "Helvetica Neue",Arial,sans-serif`;
  const lines = wrap(ctx, item.Overview || 'Kurzinhalt wird geladen …', W - 80);
  const max = Math.floor((H - y - 90) / 31);
  lines.slice(0, max).forEach((l, i) => {
    const last = i === max - 1 && lines.length > max;
    ctx.fillText(last ? `${l.replace(/\s*\S{0,3}$/, '')} …` : l, 40, y + i * 26);
  });
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `bold 16px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('VIDEOTHEK LENZ', W / 2, H - 44);
  // Strichcode-Attrappe
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (let x = W / 2 - 60; x < W / 2 + 60; x += 4) ctx.fillRect(x, H - 38, 1 + ((x * 7) % 3), 12);
}

// --- Reine Hilfen (DOM und VR nutzen dieselbe Logik; getestet) ---
const clip = (text, n) => {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n).replace(/\s+\S*$/, '')} …`;
};

export function metaLine(it) {
  return [it.ProductionYear, fsk(it.OfficialRating), it.RunTimeTicks ? ticksToText(it.RunTimeTicks) : '', it.CommunityRating ? `★ ${Number(it.CommunityRating).toFixed(1).replace('.', ',')}` : ''].filter(Boolean).join(' · ');
}

export function itemFlags(it) {
  const ud = it.UserData || {};
  const lfx = it.lfx || {};
  return {
    fav: !!ud.IsFavorite,
    seen: !!(ud.Played || lfx.watched),
    resumable: it.Type !== 'Series' && !!((lfx.progress > 0) || (ud.PlaybackPositionTicks > 0)),
    series: it.Type === 'Series',
  };
}

/** Erste Staffel mit ungesehenen Folgen (sonst 0). */
export function firstOpenSeason(seasons) {
  return Math.max(0, (seasons || []).findIndex((s) => !(s.UserData && s.UserData.Played)));
}

/** Zeilenmodell einer Folge: name, tag (DOM), runtime, resume, played. */
export function episodeRow(ep) {
  const ticks = (ep.UserData && ep.UserData.PlaybackPositionTicks) || 0;
  const played = !!(ep.UserData && ep.UserData.Played);
  const n = ep.IndexNumber != null ? `${ep.IndexNumber}. ` : '';
  return { ep, name: `${n}${ep.Name || 'Folge'}`, tag: played ? '✓' : ticks > 0 ? '▶ weiter' : '', runtime: ep.RunTimeTicks ? ticksToText(ep.RunTimeTicks) : '', resume: ticks > 0, played };
}

/** Nächste Folge zum Abspielen: erste ungesehene, sonst die erste. */
export function nextEpisode(eps) {
  return (eps || []).find((x) => !(x.UserData && x.UserData.Played)) || (eps || [])[0] || null;
}

/** Serienmodell: Tabs (Staffeln), Zeilen (Folgen der gewählten Staffel), nächste Folge. */
export function seriesModel(seasons, eps, sel = 0) {
  const ss = seasons || [];
  return {
    tabs: ss.map((s, i) => ({ id: s.Id, label: s.Name || `Staffel ${i + 1}`, on: i === sel })),
    rows: (eps || []).map(episodeRow),
    next: nextEpisode(eps),
    firstOpen: firstOpenSeason(ss),
  };
}

/**
 * Panel-Spec für VR. st = { series: null | { seasons, sel, eps, status: 'loading'|'ready' } }.
 * act = { play(item, resume), toggle(kind), flip(), back(), season(i), episode(ep, resume) }.
 */
export function buildVrSpec(item, st, act) {
  const f = itemFlags(item);
  const meta = metaLine(item);
  const spec = {
    title: item.Name || '',
    lines: meta ? [meta] : [],
    width: 0.55,
  };
  const ov = item.Overview ? clip(item.Overview, f.series ? 90 : 130) : '';
  if (ov) spec.text = ov;
  const sr = f.series ? st && st.series : null;
  if (sr && sr.seasons && sr.seasons.length) {
    const m = seriesModel(sr.seasons, sr.eps, sr.sel);
    spec.tabs = m.tabs.map((t, i) => ({ label: t.label, on: t.on, onSelect: () => act.season(i) }));
    let rows;
    if (sr.status === 'loading') rows = [{ label: 'Lade Folgen …' }];
    else if (!m.rows.length) rows = [{ label: 'Keine Folgen gefunden.' }];
    else {
      rows = m.rows.map((r) => ({
        label: r.name,
        sub: [r.runtime, r.played ? 'gesehen' : r.resume ? 'weiter' : ''].filter(Boolean).join(' · ') || undefined,
        onSelect: () => act.episode(r.ep, r.resume),
      }));
    }
    spec.list = { rows, visible: 4 };
  } else if (f.series && sr && sr.status === 'ready') {
    spec.list = { rows: [{ label: 'Keine Folgen gefunden.' }], visible: 1 };
  }
  const buttons = [];
  if (!f.series) buttons.push({ label: 'Abspielen', primary: true, onSelect: () => act.play(item, false) });
  if (f.resumable) buttons.push({ label: 'Weiterschauen', primary: true, onSelect: () => act.play(item, true) });
  buttons.push({ label: f.fav ? 'Gemerkt ✓' : 'Merken', on: f.fav, onSelect: () => act.toggle('fav') });
  buttons.push({ label: f.seen ? 'Gesehen ✓' : 'Gesehen', on: f.seen, onSelect: () => act.toggle('seen') });
  buttons.push({ label: 'Umdrehen', onSelect: () => act.flip() });
  buttons.push({ label: 'Zurückstellen', onSelect: () => act.back() });
  spec.buttons = buttons;
  return spec;
}

export class HoldView {
  constructor(o) {
    this.host = o.host;
    this.camera = o.camera;
    this.anchor = o.camera; // Elternobjekt der Hüllen-Gruppe: Kamera (2D) oder Grip-Objekt (VR)
    this.xr = false;
    this.hand = 'right';
    this.openPanel = o.openPanel || null; // (spec) => Panel-Handle (VR), von der Hülle verdrahtet
    this.isXr = o.isXr || (() => true); // läuft die Sitzung noch? (Panel-onClose beim Sitzungsende ist kein Zurückstellen)
    this.vr = null; // VR-Panel-Handle
    this.series = null; // { seasons, sel, eps, status }
    this.hidden = false;
    this.deps = o.deps;
    this.items = o.items;
    this.shelves = o.shelves; // { faceViews, setHidden }
    this.covers = o.covers;
    this.notify = o.notify;
    this.onClosed = o.onClosed;
    this.onPlay = o.onPlay;
    this.layout = o.layout;
    this.item = null;
    this.state = 'idle'; // idle | in | held | out
    this.t = 0;
    this.dur = 0.4;
    this.group = null;
    this.rot = { x: 0, y: 0 };
    this.rotTargetY = 0;
    this.flipped = false;
    this.token = 0;
    this.dom = null;
    this.slot = null; // { fv, info }
    this.from = { pos: new Vector3(), quat: new Quaternion() };
    this.tex = [];
  }

  get isOpen() { return this.state !== 'idle'; }
  get itemId() { return this.item && (this.state === 'in' || this.state === 'held') ? this.item.Id : null; }

  /** @param {string} id @param {{fv,info}|null} slot @param {boolean} instant */
  open(id, slot, instant = false, opts = null) {
    if (this.state !== 'idle') this.dispose(true);
    const xr = !!(opts && opts.xr);
    this.xr = xr;
    this.anchor = (xr && opts.anchor) || this.camera;
    this.hand = (opts && opts.hand) || 'right';
    this.dur = xr && opts.grab ? 0.18 : 0.4;
    this.series = null;
    this.hidden = false;
    const item = this.items.get(id) || { Id: id, Name: '…', lfx: { media: 'dvd' } };
    this.item = item;
    this.slot = slot || null;
    this.token++;
    const token = this.token;
    const media = (item.lfx && item.lfx.media) || 'dvd';
    const th = COVER.thick[media] || COVER.thick.dvd;
    // Texturen: Vorderseite (Cover) + Rückseite (gerendert)
    this.front = makeCanvas(512, 768);
    this.back = makeCanvas(512, 768);
    drawFront(this.front, item, null);
    drawBack(this.back, item);
    const mkTex = (c) => {
      const t = new CanvasTexture(c);
      t.colorSpace = SRGBColorSpace;
      t.minFilter = LinearFilter;
      t.generateMipmaps = false;
      t.anisotropy = 4;
      this.tex.push(t);
      return t;
    };
    this.frontTex = mkTex(this.front);
    this.backTex = mkTex(this.back);
    const side = new MeshLambertMaterial({ color: SIDE_COLOR[media] || 0x1d3f9c, depthTest: xr, transparent: true });
    const front = new MeshBasicMaterial({ map: this.frontTex, depthTest: xr, transparent: true, toneMapped: false });
    const back = new MeshBasicMaterial({ map: this.backTex, depthTest: xr, transparent: true, toneMapped: false });
    const C = (this.layout && this.layout.spec && this.layout.spec.cover) || COVER; // gleiche Hüllengröße wie im Regal
    const w = media === 'box' ? C.boxW : C.w;
    const h = media === 'box' ? C.boxH : C.h;
    this.mesh = new Mesh(new BoxGeometry(w, h, th), [side, side, side, side, front, back]);
    this.mesh.renderOrder = xr ? 0 : 999;
    this.group = new Group();
    this.group.add(this.mesh);
    this.anchor.add(this.group);
    this.rot.x = 0; this.rot.y = 0; this.rotTargetY = 0; this.flipped = false;

    if (slot) {
      this.shelves.setHidden(slot.fv, slot.info, true);
      this.fromSlot();
    } else if (this.gripMode()) {
      this.from.pos.set(0, -0.1, 0.1);
      this.from.quat.setFromEuler(TMP_E.set(-0.5, 0, 0));
    } else {
      this.from.pos.set(0, -0.6, -0.5);
      this.from.quat.setFromEuler(TMP_E.set(-0.5, 0, 0));
    }
    this.state = instant ? 'held' : 'in';
    this.t = instant ? 1 : 0;
    this.pose(instant ? 1 : 0);
    this.buildPanel(token);
    this.loadCover(token);
    this.loadDetails(token);
    this.notify();
  }

  async loadCover(token) {
    const item = this.item;
    const tag = item.ImageTags && item.ImageTags.Primary;
    if (!tag) return;
    let url;
    try { url = this.deps.imageUrl(item.Id, { type: 'Primary', maxWidth: 600, tag, quality: 85 }); } catch { /* ohne Bild */ }
    const bmp = await loadBitmap(url, null, 15000);
    if (token !== this.token) { closeBitmap(bmp); return; }
    if (bmp) {
      drawFront(this.front, item, bmp);
      closeBitmap(bmp);
      this.frontTex.needsUpdate = true;
    }
  }

  async loadDetails(token) {
    try {
      const full = await this.deps.getItem(this.item.Id);
      if (token !== this.token || !full) return;
      Object.assign(this.item, { Overview: full.Overview, Genres: full.Genres || this.item.Genres, People: full.People, RunTimeTicks: full.RunTimeTicks || this.item.RunTimeTicks, OfficialRating: full.OfficialRating || this.item.OfficialRating, CommunityRating: full.CommunityRating || this.item.CommunityRating });
      if (!this.item.Overview) this.item.Overview = 'Zu diesem Titel gibt es keinen Kurzinhalt.';
      drawBack(this.back, this.item);
      this.backTex.needsUpdate = true;
      this.refreshMeta();
    } catch {
      if (token !== this.token) return;
      this.item.Overview = this.item.Overview || 'Kurzinhalt konnte nicht geladen werden.';
      drawBack(this.back, this.item);
      this.backTex.needsUpdate = true;
    }
  }

  // --- Panel ---
  buildPanel(token) {
    if (this.xr) { this.buildVrPanel(token); return; }
    const item = this.item;
    const root = el('div', 'lfx-store-hold');
    const drag = el('div', 'lfx-store-hold-drag');
    const panel = el('div', 'lfx-store-hold-panel');
    const title = el('div', 'lfx-store-hold-title', item.Name || '');
    const meta = el('div', 'lfx-store-hold-meta');
    const actions = el('div', 'lfx-store-hold-actions');
    panel.append(title, meta, actions);
    root.append(drag, panel);
    this.host.appendChild(root);
    this.dom = { root, drag, panel, title, meta, actions };

    const btn = (label, fn, cls = '') => {
      const b = el('button', `lfx-store-act ${cls}`.trim(), label);
      b.type = 'button';
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(b); });
      actions.appendChild(b);
      return b;
    };
    this.dom.btns = {};
    const { series: isSeries, resumable } = itemFlags(item);
    if (!isSeries) this.dom.btns.play = btn('Abspielen', () => this.play(item, false), 'lfx-store-act--primary');
    if (resumable) this.dom.btns.resume = btn('Weiterschauen', () => this.play(item, true), 'lfx-store-act--primary');
    this.dom.btns.fav = btn('', () => this.toggle('fav'));
    this.dom.btns.seen = btn('', () => this.toggle('seen'));
    this.dom.btns.flip = btn('Umdrehen', () => { this.flipped = !this.flipped; this.rotTargetY = this.flipped ? Math.PI : 0; });
    this.dom.btns.back = btn('Zurückstellen', () => this.close(true));
    this.refreshMeta();

    if (isSeries) this.buildSeries(token);

    // Ziehen = Hülle drehen
    let last = null;
    drag.addEventListener('pointerdown', (e) => { last = { x: e.clientX, y: e.clientY }; try { drag.setPointerCapture(e.pointerId); } catch { /* egal */ } });
    drag.addEventListener('pointermove', (e) => {
      if (!last) return;
      this.rot.y += (e.clientX - last.x) * 0.012;
      this.rot.x = Math.max(-0.8, Math.min(0.8, this.rot.x + (e.clientY - last.y) * 0.008));
      this.rotTargetY = this.rot.y;
      last = { x: e.clientX, y: e.clientY };
    });
    const end = () => { last = null; };
    drag.addEventListener('pointerup', end);
    drag.addEventListener('pointercancel', end);
  }

  refreshMeta() {
    if (this.vr) { this.refreshVr(); return; }
    if (!this.dom) return;
    const it = this.item;
    this.dom.meta.textContent = metaLine(it);
    const { fav, seen } = itemFlags(it);
    this.dom.btns.fav.textContent = fav ? 'Gemerkt ✓' : 'Merken';
    this.dom.btns.fav.classList.toggle('is-on', fav);
    this.dom.btns.seen.textContent = seen ? 'Gesehen ✓' : 'Gesehen';
    this.dom.btns.seen.classList.toggle('is-on', seen);
  }

  async toggle(kind) {
    const it = this.item;
    it.UserData = it.UserData || {};
    const token = this.token;
    try {
      if (kind === 'fav') {
        const next = !it.UserData.IsFavorite;
        await this.deps.setFavorite(it.Id, next);
        it.UserData.IsFavorite = next;
        this.deps.toast(next ? 'Gemerkt' : 'Nicht mehr gemerkt');
      } else {
        const next = !(it.UserData.Played || (it.lfx && it.lfx.watched));
        await this.deps.setPlayed(it.Id, next);
        it.UserData.Played = next;
        it.lfx = { ...(it.lfx || {}), watched: next };
        if (next) it.lfx.progress = 0;
        if (this.covers) this.covers.refreshItem(it.Id);
        this.deps.toast(next ? 'Als gesehen markiert' : 'Nicht mehr als gesehen markiert');
      }
    } catch {
      this.deps.toast('Das hat nicht geklappt');
    }
    if (token === this.token) this.refreshMeta();
  }

  async play(item, resume) {
    this.notify();
    if (this.onPlay) this.onPlay(item, resume);
    try { await this.deps.play(item, { resume }); } catch { this.deps.toast('Wiedergabe nicht möglich'); }
  }

  // Seriendaten (gemeinsam für DOM und VR)
  async loadSeasons(token) {
    let seasons;
    try { seasons = (await this.deps.getSeasons(this.item.Id)) || []; } catch { seasons = []; }
    return token !== this.token ? null : seasons;
  }

  async loadEpisodes(seasonId, token) {
    let eps;
    try { eps = (await this.deps.getEpisodes(this.item.Id, seasonId)) || []; } catch { eps = []; }
    return token !== this.token ? null : eps;
  }

  async buildSeries(token) {
    const { panel } = this.dom;
    const tabs = el('div', 'lfx-store-hold-tabs');
    const list = el('div', 'lfx-store-hold-eps');
    panel.append(tabs, list);
    const seasons = await this.loadSeasons(token);
    if (seasons === null) return;
    if (!seasons.length) { list.textContent = 'Keine Folgen gefunden.'; return; }
    const playBtn = this.dom.btns.play || (() => {
      const b = el('button', 'lfx-store-act lfx-store-act--primary', 'Abspielen');
      b.type = 'button';
      this.dom.actions.insertBefore(b, this.dom.actions.firstChild);
      this.dom.btns.play = b;
      return b;
    })();
    let eps = [];
    const select = async (i) => {
      [...tabs.children].forEach((c, k) => c.classList.toggle('is-on', k === i));
      list.textContent = 'Lade Folgen …';
      const got = await this.loadEpisodes(seasons[i].Id, token);
      if (got === null) return;
      eps = got;
      list.textContent = '';
      const m = seriesModel(seasons, eps, i);
      if (!m.rows.length) list.textContent = 'Keine Folgen gefunden.';
      for (const r of m.rows) {
        const row = el('button', 'lfx-store-ep');
        row.type = 'button';
        row.append(el('span', 'lfx-store-ep-name', r.name));
        if (r.tag) row.append(el('span', 'lfx-store-ep-tag', r.tag));
        row.addEventListener('click', (e) => { e.stopPropagation(); this.play(r.ep, r.resume); });
        list.appendChild(row);
      }
    };
    seasons.forEach((s, i) => {
      const t = el('button', 'lfx-store-tab', s.Name || `Staffel ${i + 1}`);
      t.type = 'button';
      t.addEventListener('click', (e) => { e.stopPropagation(); select(i); });
      tabs.appendChild(t);
    });
    playBtn.onclick = (e) => {
      e.stopPropagation();
      const next = nextEpisode(eps);
      if (next) this.play(next, !!(next.UserData && next.UserData.PlaybackPositionTicks > 0));
    };
    // erste Staffel mit ungesehenen Folgen vorwählen
    select(firstOpenSeason(seasons));
  }

  // --- VR-Panel ---
  vrSpec() {
    const spec = buildVrSpec(this.item, { series: this.series }, {
      play: (it, resume) => this.play(it, resume),
      toggle: (k) => this.toggle(k),
      flip: () => { this.flipped = !this.flipped; this.rotTargetY = this.flipped ? Math.PI : 0; },
      back: () => this.close(true),
      season: (i) => this.selectVrSeason(i),
      episode: (ep, resume) => this.play(ep, resume),
    });
    // Weltfest vor dem Kopf (0,65 m, 0,15 m unter Augenhöhe), seitlich zur freien Hand hin; folgt dem Kopf nur bei deutlicher Drehung/Bewegung
    spec.anchor = { head: true, offset: { x: this.hand === 'left' ? 0.3 : -0.3, y: -0.15, z: 0.65 }, follow: true };
    spec.onClose = () => { if (this.vr && this.isXr()) this.close(true); };
    return spec;
  }

  buildVrPanel(token) {
    if (typeof this.openPanel !== 'function' || !this.group) return;
    this.vr = this.openPanel(this.vrSpec());
    if (this.vr && this.hidden && this.vr.mesh) this.vr.mesh.visible = false;
    if (itemFlags(this.item).series) this.loadVrSeries(token);
  }

  refreshVr() {
    if (this.vr && this.group) { try { this.vr.update(this.vrSpec()); } catch { /* Panel schon zu */ } }
  }

  closeVr() {
    const h = this.vr;
    this.vr = null;
    if (h) { try { h.close(); } catch { /* egal */ } }
  }

  async loadVrSeries(token) {
    this.series = { seasons: [], sel: 0, eps: [], status: 'loading' };
    const seasons = await this.loadSeasons(token);
    if (seasons === null) return;
    this.series.seasons = seasons;
    if (!seasons.length) { this.series.status = 'ready'; this.refreshVr(); return; }
    await this.selectVrSeason(firstOpenSeason(seasons), token);
  }

  async selectVrSeason(i, token = this.token) {
    const sr = this.series;
    if (!sr || !sr.seasons[i]) return;
    sr.sel = i;
    sr.status = 'loading';
    sr.eps = [];
    this.refreshVr();
    const eps = await this.loadEpisodes(sr.seasons[i].Id, token);
    if (eps === null || this.series !== sr || sr.sel !== i) return;
    sr.eps = eps;
    sr.status = 'ready';
    this.refreshVr();
  }

  // --- Animation ---
  /** Grip-Raum der Hand (VR) statt Kamera. */
  gripMode() { return this.xr && this.anchor !== this.camera; }

  /**
   * Ausrichtung der Hülle im Anker (VR): Die Vorderseite (+z der Hülle) zeigt vom Griff zum Gesicht, also im Grip-Raum
   * nach oben (+y, leicht zur Körpermitte); im Ray-Raum der Hände nach hinten-oben. Hülle steht dabei „hochkant“, Oberkante nach vorn.
   */
  gripQuat(q) {
    const kind = this.anchor && this.anchor.userData && this.anchor.userData.lfxHold;
    const side = this.hand === 'left' ? -1 : 1;
    if (kind === 'grip') return q.setFromEuler(TMP_E.set(-Math.PI / 2, 0, 0.4 * side, 'ZXY'));
    if (kind === 'ray') return q.setFromEuler(TMP_E.set(-0.9, 0.25 * side, 0, 'YXZ'));
    return q.identity();
  }

  fromSlot() {
    this.anchor.updateMatrixWorld(true);
    slotWorld(this.slot.fv, this.slot.info, TMP_V, TMP_Q);
    this.from.pos.copy(this.anchor.worldToLocal(TMP_V.clone()));
    this.anchor.getWorldQuaternion(this.from.quat).invert().multiply(TMP_Q);
  }

  target() {
    if (this.gripMode()) {
      // Etwa 3 cm über und 9 cm vor dem Grip-Punkt, Vorderseite zum Gesicht (+z), natürliche Größe leicht vergrößert
      if (this.anchor.userData && this.anchor.userData.lfxHold === 'grip') TARGET.pos.set(0, 0.08, -0.04);
      else TARGET.pos.set(0, 0.03, -0.09);
      TARGET.scale = 1.2;
      this.gripQuat(TARGET.quat);
      return TARGET;
    }
    const wide = this.camera.aspect >= 1.2;
    if (wide) TARGET.pos.set(-0.14, 0.02, -0.66);
    else TARGET.pos.set(0, 0.3, -0.6);
    TARGET.scale = wide ? 2.9 : 3;
    return TARGET;
  }

  /** Pose zwischen Regal (t=0) und Hand (t=1). */
  pose(t) {
    if (!this.group) return;
    const tg = this.target();
    const k = ease(Math.max(0, Math.min(1, t)));
    if (this.state === 'out' && this.slot) {
      this.fromSlot();
    }
    this.group.position.lerpVectors(this.from.pos, tg.pos, k);
    // Hand-Größe unabhängig von der Regal-Hüllengröße (große Hüllen werden entsprechend kleiner skaliert)
    const C = this.layout && this.layout.spec && this.layout.spec.cover;
    const norm = C && !this.gripMode() ? COVER.h / C.h : 1;
    this.group.scale.setScalar(1 + (tg.scale * norm - 1) * k);
    this.group.quaternion.copy(this.from.quat).slerp(this.gripMode() ? tg.quat : IDENT, k);
  }

  update(dt) {
    if (this.state === 'idle' || !this.group) return;
    if (this.state === 'in') {
      this.t = Math.min(1, this.t + dt / this.dur);
      this.pose(this.t);
      if (this.t >= 1) this.state = 'held';
    } else if (this.state === 'out') {
      this.t = Math.max(0, this.t - dt / this.dur);
      const f = Math.min(1, dt * 12);
      this.rot.x -= this.rot.x * f;
      this.rot.y -= this.rot.y * f;
      this.pose(this.t);
      if (this.t <= 0) { this.finishClose(); return; }
    } else {
      this.pose(1);
      this.rot.y += (this.rotTargetY - this.rot.y) * Math.min(1, dt * 8);
    }
    const sway = this.state === 'held' && !this.xr ? Math.sin(performance.now() / 1400) * 0.04 : 0;
    TMP_E.set(this.rot.x + sway * 0.5, this.rot.y + sway, 0, 'YXZ');
    this.mesh.quaternion.setFromEuler(TMP_E);
  }

  /** Zurückstellen (animiert) bzw. sofort schließen. */
  close(animated = true) {
    if (this.state === 'idle' || this.state === 'out') return;
    if (this.dom) this.dom.root.classList.add('is-closing');
    this.closeVr();
    if (this.slot && animated) {
      this.state = 'out';
      this.t = 1;
      this.rot.y = ((((this.rot.y + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
      this.rotTargetY = 0;
    } else {
      this.finishClose();
    }
    this.token++;
    this.notify();
  }

  finishClose() {
    if (this.slot) this.shelves.setHidden(this.slot.fv, this.slot.info, false);
    this.teardown();
    this.state = 'idle';
    this.item = null;
    this.slot = null;
    if (this.onClosed) this.onClosed();
  }

  teardown() {
    if (this.group) {
      this.anchor.remove(this.group);
      this.mesh.geometry.dispose();
      const mats = Array.isArray(this.mesh.material) ? this.mesh.material : [this.mesh.material];
      new Set(mats).forEach((m) => m.dispose());
      this.group = null;
      this.mesh = null;
    }
    this.tex.forEach((t) => t.dispose());
    this.tex = [];
    if (this.front) { this.front.width = 1; this.front.height = 1; this.front = null; }
    if (this.back) { this.back.width = 1; this.back.height = 1; this.back = null; }
    if (this.dom) { this.dom.root.remove(); this.dom = null; }
    this.closeVr();
    this.series = null;
  }

  /** Hülle bleibt in der Hand, DOM wandert mit dem Host (resume). */
  setHost(host) {
    this.host = host;
    if (this.dom) host.appendChild(this.dom.root);
  }

  setVisible(on) {
    this.hidden = !on;
    if (this.group) this.group.visible = !!on;
    if (this.dom) this.dom.root.style.display = on ? '' : 'none';
    if (this.vr && this.vr.mesh) this.vr.mesh.visible = !!on;
  }

  /** Offene Hülle ohne Flug umhängen (VR-Start/-Ende) und die Panel-Art wechseln. */
  reanchor(anchor, { xr = false, hand } = {}) {
    const next = anchor || this.camera;
    if (hand) this.hand = hand;
    if (this.state === 'idle' || !this.group) { this.anchor = next; this.xr = !!xr; return; }
    this.anchor.remove(this.group);
    this.anchor = next;
    this.xr = !!xr;
    this.anchor.add(this.group);
    if (this.state === 'in') { this.state = 'held'; this.t = 1; }
    this.mesh.renderOrder = this.xr ? 0 : 999;
    const mats = Array.isArray(this.mesh.material) ? this.mesh.material : [this.mesh.material];
    new Set(mats).forEach((m) => { m.depthTest = this.xr; });
    this.group.visible = !this.hidden;
    // Panel wechseln: DOM weg, VR zu (oder umgekehrt)
    this.closeVr();
    if (this.dom) { this.dom.root.remove(); this.dom = null; }
    if (this.state !== 'out') this.buildPanel(this.token);
    if (this.hidden) this.setVisible(false);
    this.pose(1);
  }

  dispose(silent = false) {
    this.token++;
    if (this.slot) this.shelves.setHidden(this.slot.fv, this.slot.info, false);
    this.teardown();
    this.state = 'idle';
    this.item = null;
    this.slot = null;
    if (!silent && this.onClosed) this.onClosed();
  }
}

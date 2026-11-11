// VIDEOTHEK LENZ · Hülle in der Hand: animiert aus dem Regal vor die Kamera, drehbar (Cover vorn, gerenderte Rückseite),
// DOM-Panel mit Aktionen, bei Serien Staffel-Tabs + Folgenliste. Das Card-Mesh hängt an der Kamera (ohne Tiefentest).
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
const TARGET = { pos: new Vector3(), scale: 1 };
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

export class HoldView {
  constructor(o) {
    this.host = o.host;
    this.camera = o.camera;
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
  open(id, slot, instant = false) {
    if (this.state !== 'idle') this.dispose(true);
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
    const side = new MeshLambertMaterial({ color: SIDE_COLOR[media] || 0x1d3f9c, depthTest: false, transparent: true });
    const front = new MeshBasicMaterial({ map: this.frontTex, depthTest: false, transparent: true, toneMapped: false });
    const back = new MeshBasicMaterial({ map: this.backTex, depthTest: false, transparent: true, toneMapped: false });
    const w = media === 'box' ? 0.15 : COVER.w;
    const h = media === 'box' ? 0.205 : COVER.h;
    this.mesh = new Mesh(new BoxGeometry(w, h, th), [side, side, side, side, front, back]);
    this.mesh.renderOrder = 999;
    this.group = new Group();
    this.group.add(this.mesh);
    this.camera.add(this.group);
    this.rot.x = 0; this.rot.y = 0; this.rotTargetY = 0; this.flipped = false;

    if (slot) {
      this.shelves.setHidden(slot.fv, slot.info, true);
      this.camera.updateMatrixWorld(true);
      slotWorld(slot.fv, slot.info, TMP_V, TMP_Q);
      this.from.pos.copy(this.camera.worldToLocal(TMP_V.clone()));
      this.camera.getWorldQuaternion(this.from.quat).invert().multiply(TMP_Q);
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
    const isSeries = item.Type === 'Series';
    const resumable = !isSeries && ((item.lfx && item.lfx.progress > 0) || (item.UserData && item.UserData.PlaybackPositionTicks > 0));
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
    if (!this.dom) return;
    const it = this.item;
    const bits = [it.ProductionYear, fsk(it.OfficialRating), it.RunTimeTicks ? ticksToText(it.RunTimeTicks) : '', it.CommunityRating ? `★ ${Number(it.CommunityRating).toFixed(1).replace('.', ',')}` : ''].filter(Boolean);
    this.dom.meta.textContent = bits.join(' · ');
    const fav = !!(it.UserData && it.UserData.IsFavorite);
    const seen = !!((it.UserData && it.UserData.Played) || (it.lfx && it.lfx.watched));
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

  async buildSeries(token) {
    const { panel } = this.dom;
    const tabs = el('div', 'lfx-store-hold-tabs');
    const list = el('div', 'lfx-store-hold-eps');
    panel.append(tabs, list);
    let seasons = [];
    try { seasons = (await this.deps.getSeasons(this.item.Id)) || []; } catch { seasons = []; }
    if (token !== this.token) return;
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
      try { eps = (await this.deps.getEpisodes(this.item.Id, seasons[i].Id)) || []; } catch { eps = []; }
      if (token !== this.token) return;
      list.textContent = '';
      if (!eps.length) list.textContent = 'Keine Folgen gefunden.';
      for (const ep of eps) {
        const ticks = ep.UserData && ep.UserData.PlaybackPositionTicks;
        const row = el('button', 'lfx-store-ep');
        row.type = 'button';
        const n = ep.IndexNumber != null ? `${ep.IndexNumber}. ` : '';
        row.append(el('span', 'lfx-store-ep-name', `${n}${ep.Name || 'Folge'}`));
        const tag = ep.UserData && ep.UserData.Played ? '✓' : ticks > 0 ? '▶ weiter' : '';
        if (tag) row.append(el('span', 'lfx-store-ep-tag', tag));
        row.addEventListener('click', (e) => { e.stopPropagation(); this.play(ep, ticks > 0); });
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
      const next = eps.find((x) => !(x.UserData && x.UserData.Played)) || eps[0];
      if (next) this.play(next, !!(next.UserData && next.UserData.PlaybackPositionTicks > 0));
    };
    // erste Staffel mit ungesehenen Folgen vorwählen
    const firstOpen = Math.max(0, seasons.findIndex((s) => !(s.UserData && s.UserData.Played)));
    select(firstOpen);
  }

  // --- Animation ---
  target() {
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
      this.camera.updateMatrixWorld(true);
      slotWorld(this.slot.fv, this.slot.info, TMP_V, TMP_Q);
      this.from.pos.copy(this.camera.worldToLocal(TMP_V.clone()));
      this.camera.getWorldQuaternion(this.from.quat).invert().multiply(TMP_Q);
    }
    this.group.position.lerpVectors(this.from.pos, tg.pos, k);
    this.group.scale.setScalar(1 + (tg.scale - 1) * k);
    this.group.quaternion.copy(this.from.quat).slerp(IDENT, k);
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
    const sway = this.state === 'held' ? Math.sin(performance.now() / 1400) * 0.04 : 0;
    TMP_E.set(this.rot.x + sway * 0.5, this.rot.y + sway, 0, 'YXZ');
    this.mesh.quaternion.setFromEuler(TMP_E);
  }

  /** Zurückstellen (animiert) bzw. sofort schließen. */
  close(animated = true) {
    if (this.state === 'idle' || this.state === 'out') return;
    if (this.dom) this.dom.root.classList.add('is-closing');
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
      this.camera.remove(this.group);
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
  }

  /** Hülle bleibt in der Hand, DOM wandert mit dem Host (resume). */
  setHost(host) {
    this.host = host;
    if (this.dom) host.appendChild(this.dom.root);
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

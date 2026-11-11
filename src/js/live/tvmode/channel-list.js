// TV-Modus · Senderliste „Jetzt im TV“ (18 Zeilen). Vertrag: docs/tvmode.md („Senderliste (G)“, „Bilder“).
// Fabrik nach dem Komponentenschema: createChannelList({ doc, ctl, model, deps, opts }) → { el, update(snap), tick(t), destroy() }.
// opts: getNow() (Uhr der Engine). Importiert nur Dateien aus src/js/live/.
import { formatClock } from '../schedule/time.js';
import { channelColor, channelInk, shortName } from '../ui/logos.js';
import { createThumb } from './thumb.js';
import { channelName } from './model.js';

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const pct = (p) => `${(clamp01(p) * 100).toFixed(1)}%`;

/** Sender-Badge für den TV-Modus (eigenes DOM, kein createLogo: keine lfx-live-*-Klassen). */
export function createChannelBadge(doc, channel) {
  const no = channel ? channel.no : 1;
  const b = doc.createElement('span');
  b.className = 'lfx-tvm__chan-badge';
  b.style.background = channelColor(no);
  b.style.color = channelInk(no);
  b.textContent = shortName(channel);
  b.title = channelName(channel);
  return b;
}

export function createChannelList({ doc, ctl, model, deps = {}, opts = {} }) {
  const getNow = typeof opts.getNow === 'function' ? opts.getNow : () => Date.now();
  const el = doc.createElement('div');
  el.className = 'lfx-tvm__list';
  el.setAttribute('role', 'listbox');
  el.setAttribute('aria-label', 'Sender');

  const win = doc.defaultView || window;
  const IO = win.IntersectionObserver;
  let io = null;
  let alive = true;
  let current = 0;
  let revealed = false;
  const rows = []; // { no, btn, thumb, title, sub, fill, next, sig, entry, visible, fillPct, imgId }
  const byBtn = new Map();

  if (typeof IO === 'function') {
    io = new IO((list) => {
      for (const it of list) {
        if (!it.isIntersecting) continue;
        const r = byBtn.get(it.target);
        if (!r || r.visible) continue;
        r.visible = true;
        io.unobserve(it.target);
        loadThumb(r);
      }
    }, { rootMargin: '120px 0px' });
  }

  function loadThumb(r) {
    if (!alive || (io && !r.visible) || r.imgId === r.wantImg) return;
    r.imgId = r.wantImg;
    r.btn.classList.toggle('is-loading-img', !!r.wantImg);
    r.thumb.set(r.wantImg, r.no);
  }

  function fill(r, item, t) {
    const { channel, entry, next } = item;
    const sig = `${channel.name}|${entry ? entry.start : ''}|${entry ? entry.itemId : ''}`;
    r.entry = entry;
    if (sig === r.sig) return;
    r.sig = sig;
    let d = null;
    if (entry) d = model.describe(channel.no, entry, t);
    r.title.textContent = d ? d.title : 'Kein Programm';
    r.sub.textContent = d ? [d.time, d.sub].filter(Boolean).join(' · ') : '';
    if (next) {
      const nt = model.titleOf(next).title;
      r.next.textContent = `Danach: ${nt} · ${formatClock(next.start)}`;
      r.next.hidden = false;
    } else {
      r.next.textContent = '';
      r.next.hidden = true;
    }
    r.btn.classList.toggle('lfx-tvm__row--dim', !!d && d.kind !== 'program');
    r.wantImg = d ? d.imageItemId : null;
    if (r.visible || !io) loadThumb(r);
    r.badgeHost.replaceChildren(createChannelBadge(doc, channel));
    r.btn.setAttribute('aria-label', `Sender ${channel.no}, ${channelName(channel) || shortName(channel)}: ${d ? d.title : 'Kein Programm'}`);
  }

  function setProgress(r, t) {
    const e = r.entry;
    const p = e ? clamp01((t - e.start) / Math.max(1, e.end - e.start)) : 0;
    const s = pct(p);
    if (s !== r.fillPct) {
      r.fillPct = s;
      r.fill.style.width = s;
    }
  }

  function build() {
    const t = getNow();
    const all = model.nowAll(t);
    for (const item of all) {
      const no = item.channel.no;
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'lfx-tvm__row';
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', 'false');
      const noEl = doc.createElement('span');
      noEl.className = 'lfx-tvm__row-no';
      noEl.textContent = String(no);
      const logo = doc.createElement('span');
      logo.className = 'lfx-tvm__row-logo';
      const thumbHost = doc.createElement('span');
      thumbHost.className = 'lfx-tvm__row-thumb';
      thumbHost.setAttribute('aria-hidden', 'true');
      const thumb = createThumb({ doc, deps });
      thumb.set(null, no); // Platzhalter mit Nummer, das echte Bild lädt erst bei Sichtbarkeit
      thumbHost.append(thumb.el);
      const body = doc.createElement('span');
      body.className = 'lfx-tvm__row-body';
      const title = doc.createElement('span');
      title.className = 'lfx-tvm__row-title';
      const sub = doc.createElement('span');
      sub.className = 'lfx-tvm__row-sub';
      const bar = doc.createElement('span');
      bar.className = 'lfx-tvm__row-bar';
      const fillEl = doc.createElement('span');
      fillEl.className = 'lfx-tvm__row-fill';
      bar.append(fillEl);
      const nextEl = doc.createElement('span');
      nextEl.className = 'lfx-tvm__row-next';
      body.append(title, sub, bar, nextEl);
      btn.append(noEl, logo, thumbHost, body);
      const r = { no, btn, thumb, title, sub, fill: fillEl, next: nextEl, badgeHost: logo, sig: null, entry: null, visible: false, fillPct: '', imgId: null, wantImg: null };
      const done = () => btn.classList.remove('is-loading-img');
      thumb.el.addEventListener('load', done, true);
      thumb.el.addEventListener('error', done, true);
      btn.addEventListener('click', () => {
        if (alive) ctl.tune(no, { immediate: true });
      });
      rows.push(r);
      byBtn.set(btn, r);
      el.append(btn);
      fill(r, item, t);
      setProgress(r, t);
      if (io) io.observe(btn);
    }
  }

  function reveal(r) {
    const L = el;
    if (L.scrollHeight > L.clientHeight + 1) {
      // Desktop: die Liste scrollt intern, die Seite bleibt stehen.
      const top = r.btn.offsetTop;
      const h = r.btn.offsetHeight;
      if (top < L.scrollTop) L.scrollTop = top;
      else if (top + h > L.scrollTop + L.clientHeight) L.scrollTop = top + h - L.clientHeight;
      return;
    }
    // Handy: Die Liste liegt im Seitenfluss. Die Seite wird nie automatisch gescrollt (live geprüft: beim Öffnen mit
    // letztem Sender 18 sprang die Seite sonst ans Listenende); die aktuelle Zeile ist über die Hervorhebung erkennbar.
  }

  function mark(no) {
    for (const r of rows) {
      const on = r.no === no;
      r.btn.classList.toggle('is-current', on);
      r.btn.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) r.btn.setAttribute('aria-current', 'true');
      else r.btn.removeAttribute('aria-current');
    }
  }

  build();
  try {
    const s = ctl.state && ctl.state();
    if (s && s.on) {
      current = s.channel;
      mark(current);
    }
  } catch { /* Controller ohne state: egal */ }

  return {
    el,
    update(snap) {
      if (!alive || !snap) return;
      const no = snap.on ? snap.channel : 0;
      if (no === current && revealed) return;
      current = no;
      mark(no);
      const r = rows.find((x) => x.no === no);
      if (r) {
        reveal(r);
        revealed = true;
      }
    },
    tick(t) {
      if (!alive) return;
      const stale = rows.some((r) => !r.entry || t >= r.entry.end || t < r.entry.start);
      if (stale) {
        const all = model.nowAll(t);
        for (let i = 0; i < rows.length && i < all.length; i++) fill(rows[i], all[i], t);
      }
      for (const r of rows) setProgress(r, t);
    },
    destroy() {
      alive = false;
      if (io) io.disconnect();
      io = null;
      for (const r of rows) r.thumb.destroy();
      rows.length = 0;
      byBtn.clear();
      el.remove();
    },
  };
}

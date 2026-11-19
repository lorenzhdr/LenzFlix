// VIDEOTHEK LENZ · Mitgliedsausweis (1.17.0): DOM der Karte (rein DOM, kein three, kein Zustand).
// buildCard(data, opts) → { el, setPortrait(canvas|null), focus(), destroy() }
//   data = CardData (char/card.js); opts: { mode: 'self'|'peer'|'gate'|'rent', title?, onClose?, portrait?: Promise<Canvas|null>, reduced?, touch? }
// Die Stempel zählen aus data.total (nie fest 15); die Karte ist bis 31 Stempel ausgelegt (Bitmaske).
import { CATALOG } from '../discover/catalog.js';
import { formatDay, foundFromMask } from '../char/card.js';

const TIER_LABEL = { bronze: 'Bronze', silver: 'Silber', gold: 'Gold' };

function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const num = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };

export function buildCard(data, opts = {}) {
  const d = data || {};
  const mode = ['self', 'peer', 'gate', 'rent'].includes(opts.mode) ? opts.mode : 'self';
  const tier = TIER_LABEL[d.tier] ? d.tier : 'bronze';
  const total = Math.max(0, Math.min(31, num(d.total)));
  const found = new Set(foundFromMask(d.stamps));
  const foundCount = CATALOG.slice(0, total).filter((e) => found.has(e.id)).length;

  const root = h('div', `lfx-store-card-wrap is-${mode}`);
  const card = h('div', `lfx-store-card is-${tier}${tier === 'gold' && !opts.reduced ? ' is-glitter' : ''}${opts.reduced ? ' is-still' : ''}`);
  card.dataset.tier = tier;
  if (mode !== 'rent') { card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', opts.title || 'Mitgliedsausweis'); }
  root.appendChild(card);

  const head = h('div', 'lfx-store-card-head');
  head.append(h('div', 'lfx-store-card-brand', 'VIDEOTHEK LENZ'), h('div', 'lfx-store-card-sub', mode === 'peer' && d.name ? `Ausweis von ${d.name}` : 'Mitgliedsausweis'), h('div', 'lfx-store-card-tier', TIER_LABEL[tier]));

  const body = h('div', 'lfx-store-card-body');
  const photo = h('div', 'lfx-store-card-photo');
  photo.setAttribute('aria-hidden', 'true');
  const ph = h('div', 'lfx-store-card-photo-ph', '?');
  photo.appendChild(ph);
  const info = h('div', 'lfx-store-card-info');
  const row = (k, v, cls) => { const r = h('div', `lfx-store-card-row${cls ? ' ' + cls : ''}`); r.append(h('span', 'lfx-store-card-k', k), h('span', 'lfx-store-card-v', v)); return r; };
  info.append(
    row('Nr.', String(d.no || '000000'), 'is-no'),
    row('Name', d.name ? String(d.name) : '—'),
    row('Mitglied seit', formatDay(d.since)),
    row('Ausleihen', String(num(d.rent))),
    row('Kinobesuche', String(num(d.cine))),
  );
  body.append(photo, info);
  card.append(head, body);

  if (mode !== 'rent') {
    const st = h('div', 'lfx-store-card-stamps');
    st.append(h('div', 'lfx-store-card-stamps-t', `Entdeckungen ${foundCount}/${total}`));
    const grid = h('div', 'lfx-store-card-grid');
    grid.setAttribute('role', 'list');
    for (let i = 0; i < total; i++) {
      const e = CATALOG[i];
      const on = !!(e && found.has(e.id));
      const s = h('span', `lfx-store-card-stamp${on ? ' is-on' : ''}`, on ? '★' : '');
      s.setAttribute('role', 'listitem');
      if (on && e) { s.title = e.title; s.setAttribute('aria-label', e.title); } else s.setAttribute('aria-label', 'Noch nicht entdeckt');
      grid.appendChild(s);
    }
    st.appendChild(grid);
    card.appendChild(st);
  }

  let closeBtn = null;
  if (mode === 'gate') {
    closeBtn = h('button', 'lfx-store-act lfx-store-card-btn is-primary', 'Weiter');
  } else if (mode !== 'rent') {
    closeBtn = h('button', 'lfx-store-act lfx-store-card-btn', 'Schließen');
  }
  if (closeBtn) {
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => { if (opts.onClose) opts.onClose(); });
    card.appendChild(closeBtn);
  }

  let dead = false;
  const setPortrait = (canvas) => {
    if (dead) return;
    photo.querySelectorAll('canvas').forEach((c) => c.remove());
    if (canvas && canvas.nodeType === 1) { canvas.classList.add('lfx-store-card-photo-img'); ph.hidden = true; photo.appendChild(canvas); } else ph.hidden = false;
  };
  if (opts.portrait && typeof opts.portrait.then === 'function') opts.portrait.then(setPortrait, () => {});

  // Esc schließt (nicht beim Antrag: dort „Weiter“); Tasten erreichen die Bühne nicht
  if (mode !== 'rent') {
    root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if ((e.key === 'Escape' || e.code === 'Escape') && mode !== 'gate' && opts.onClose) { e.preventDefault(); opts.onClose(); }
    });
    for (const ev of ['keyup', 'keypress']) root.addEventListener(ev, (e) => e.stopPropagation());
    if (mode !== 'gate') root.addEventListener('click', (e) => { if (e.target === root && opts.onClose) opts.onClose(); });
  }

  return {
    el: root,
    setPortrait,
    focus() { if (closeBtn) { try { closeBtn.focus({ preventScroll: true }); } catch { /* egal */ } } },
    destroy() { dead = true; root.remove(); },
  };
}

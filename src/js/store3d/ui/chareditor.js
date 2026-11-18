// VIDEOTHEK LENZ · Figur-Editor (1.17.0): DOM-Ansicht für Pause-Menü, Frisierstuhl, Umkleide und das Gate „Mitgliedsantrag“.
// Reine Ansicht über char/editor-model.js: baut Reiter + Steuerelemente, ruft Callbacks, kennt weder three noch den Provider.
//   createCharEditor({ model, where: 'pause'|'chair'|'booth'|'gate', name?, live?, onChange(code), onTab(id), onRotate(dRad),
//                      onApply(), onCancel(), onDone(), onRandom?(), onSlot?(kind, i), focus? })
//     → { el, preview, destroy(), setTab(id), sync(), busy(on), stampEl, tab() }
// Gate: kein Abbrechen, Esc wirkungslos. Sonst: Esc = Abbrechen. Alle Knöpfe ≥ 44 px (CSS), aria-Labels, Tastatur (Tab, Pfeile im Reiter-Streifen).
import { TABS, isTab, hexToRgb } from '../char/editor-model.js';

const el = (tag, cls, attrs, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (attrs) for (const k of Object.keys(attrs)) { if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]); }
  if (text !== undefined) n.textContent = text;
  return n;
};

const TITLES = { pause: 'Deine Figur', chair: 'Frisierstuhl', booth: 'Umkleide', gate: 'Mitgliedsantrag' };
const ROT_STEP = 0.5;

export function createCharEditor(o) {
  const { model } = o;
  const where = TITLES[o.where] ? o.where : 'pause';
  const gate = where === 'gate';
  const live = !!o.live;
  let tab = isTab(o.focus) && !(gate && o.focus === 'slots') ? o.focus : 'body';
  let controls = []; // { sync() }
  let destroyed = false;
  let isBusy = false;
  const cleanups = [];

  const root = el('div', `lfx-store-char lfx-store-char--${where}${live ? ' is-live' : ''}`, { role: 'dialog', 'aria-modal': 'true', 'aria-label': TITLES[where] });
  const preview = el('div', 'lfx-store-char__preview', { 'aria-hidden': 'true' });
  const panel = el('div', 'lfx-store-char__panel');
  root.append(preview, panel);

  // --- Drehen der Vorschau (Ziehen + Knöpfe) ---
  if (!live) {
    let drag = null;
    const down = (e) => { drag = { x: e.clientX, id: e.pointerId }; try { preview.setPointerCapture(e.pointerId); } catch { /* jsdom */ } };
    const move = (e) => { if (!drag || e.pointerId !== drag.id) return; const dx = e.clientX - drag.x; drag.x = e.clientX; if (o.onRotate && dx) o.onRotate(dx * 0.012); };
    const up = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
    preview.addEventListener('pointerdown', down);
    preview.addEventListener('pointermove', move);
    preview.addEventListener('pointerup', up);
    preview.addEventListener('pointercancel', up);
    const rot = el('div', 'lfx-store-char__rot');
    const left = el('button', 'lfx-store-char__rotbtn', { type: 'button', 'aria-label': 'Figur nach links drehen' }, '⟲');
    const right = el('button', 'lfx-store-char__rotbtn', { type: 'button', 'aria-label': 'Figur nach rechts drehen' }, '⟳');
    left.addEventListener('click', () => { if (o.onRotate) o.onRotate(-ROT_STEP); });
    right.addEventListener('click', () => { if (o.onRotate) o.onRotate(ROT_STEP); });
    rot.append(left, right);
    preview.append(rot);
  }

  // --- Kopf (Gate: Antragsformular) ---
  let stampEl = null;
  if (gate) {
    const head = el('div', 'lfx-store-char__formhead');
    const headline = el('div', 'lfx-store-char__headline');
    headline.append(el('div', 'lfx-store-char__kicker', null, 'VIDEOTHEK LENZ'));
    headline.append(el('h2', 'lfx-store-char__title', null, 'Mitgliedsantrag'));
    head.append(headline);
    head.append(el('p', 'lfx-store-char__lead', null, 'Bitte in Druckbuchstaben ausfüllen. Die Durchschrift behältst du.'));
    const fields = el('div', 'lfx-store-char__fields');
    const f1 = el('label', 'lfx-store-char__field');
    f1.append(el('span', 'lfx-store-char__flabel', null, 'Name'));
    const name = el('input', 'lfx-store-char__input', { type: 'text', readonly: 'readonly', value: o.name || '', placeholder: 'Mitglied', 'aria-label': 'Name (vom Konto, nicht änderbar)' });
    name.value = o.name || '';
    f1.append(name);
    const f2 = el('div', 'lfx-store-char__field');
    f2.append(el('span', 'lfx-store-char__flabel', null, 'Mitgliedsnummer'));
    f2.append(el('span', 'lfx-store-char__static', null, 'wird beim Stempeln vergeben'));
    const f3 = el('div', 'lfx-store-char__field lfx-store-char__field--stamp');
    f3.append(el('span', 'lfx-store-char__flabel', null, 'Stempel'));
    stampEl = el('div', 'lfx-store-char__stamp', { 'aria-hidden': 'true' });
    stampEl.append(el('span', 'lfx-store-char__stamp-text', null, 'GENEHMIGT'));
    f3.append(stampEl);
    fields.append(f1, f2, f3);
    head.append(fields);
    panel.append(head);
  } else {
    const head = el('div', 'lfx-store-char__head');
    head.append(el('h2', 'lfx-store-char__title', null, TITLES[where]));
    panel.append(head);
  }

  // --- Reiter ---
  const tablist = el('div', 'lfx-store-char__tabs', { role: 'tablist', 'aria-label': 'Bereiche' });
  const tabBtns = new Map();
  const TABS_SHOWN = gate ? TABS.filter((t) => t.id !== 'slots') : TABS; // Gate: nur ein Platz, kein Plätze-Reiter
  for (const t of TABS_SHOWN) {
    const b = el('button', 'lfx-store-char__tab', { type: 'button', role: 'tab', id: `lfx-store-char-tab-${t.id}`, 'aria-controls': 'lfx-store-char-body', 'data-tab': t.id }, t.label);
    b.addEventListener('click', () => setTab(t.id, true));
    tabBtns.set(t.id, b);
    tablist.append(b);
  }
  tablist.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = TABS_SHOWN.findIndex((t) => t.id === tab);
    const n = TABS_SHOWN[(i + (e.key === 'ArrowRight' ? 1 : TABS_SHOWN.length - 1)) % TABS_SHOWN.length];
    e.preventDefault();
    setTab(n.id, true);
    const b = tabBtns.get(n.id);
    if (b) b.focus();
  });
  const body = el('div', 'lfx-store-char__body', { role: 'tabpanel', id: 'lfx-store-char-body' });
  const status = el('div', 'lfx-store-char__status', { role: 'status', 'aria-live': 'polite' });
  panel.append(tablist, body);

  // --- Fuß ---
  const foot = el('div', 'lfx-store-char__foot');
  foot.append(status);
  const rand = el('button', 'lfx-store-char__btn', { type: 'button' }, 'Zufall');
  rand.addEventListener('click', () => {
    model.randomize();
    changed();
    if (o.onRandom) o.onRandom();
  });
  foot.append(rand);
  let apply = null;
  let cancel = null;
  if (gate) {
    apply = el('button', 'lfx-store-char__btn lfx-store-char__btn--main', { type: 'button' }, 'Fertig');
    apply.addEventListener('click', () => { if (!isBusy && o.onDone) o.onDone(); });
    foot.append(apply);
  } else {
    cancel = el('button', 'lfx-store-char__btn', { type: 'button' }, 'Abbrechen');
    apply = el('button', 'lfx-store-char__btn lfx-store-char__btn--main', { type: 'button' }, 'Übernehmen');
    cancel.addEventListener('click', () => { if (!isBusy && o.onCancel) o.onCancel(); });
    apply.addEventListener('click', () => { if (!isBusy && o.onApply) o.onApply(); });
    foot.append(cancel, apply);
  }
  panel.append(foot);

  // Esc: Abbrechen (Gate: wirkungslos). Das Fenster-Esc der Bühne läuft zusätzlich über overlay.onClose.
  const onKey = (e) => {
    if (e.key !== 'Escape' && e.code !== 'Escape') return;
    e.stopPropagation();
    if (gate) { e.preventDefault(); return; }
    e.preventDefault();
    if (!isBusy && o.onCancel) o.onCancel();
  };
  root.addEventListener('keydown', onKey);
  cleanups.push(() => root.removeEventListener('keydown', onKey));

  function changed() {
    syncAll();
    if (o.onChange) o.onChange(model.code());
  }

  function setStatus(t) { status.textContent = t || ''; }

  // Scroll-Hinweis: Überblendung oben/unten, solange der Inhalt dort weitergeht (Touch hat keine sichtbare Laufleiste).
  // In jsdom (Höhe 0) bleibt alles aus.
  function updateScrollHint() {
    if (destroyed) return;
    const ch = body.clientHeight;
    const more = ch > 0 && body.scrollHeight - body.scrollTop - ch > 3;
    const less = ch > 0 && body.scrollTop > 3;
    body.classList.toggle('is-more', more);
    body.classList.toggle('is-less', less);
  }
  body.addEventListener('scroll', updateScrollHint, { passive: true });
  window.addEventListener('resize', updateScrollHint);
  cleanups.push(() => { body.removeEventListener('scroll', updateScrollHint); window.removeEventListener('resize', updateScrollHint); });
  let ro = null;
  if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(updateScrollHint); ro.observe(body); cleanups.push(() => ro.disconnect()); }

  // --- Steuerelemente ---
  function buildChoice(c) {
    const wrap = el('fieldset', 'lfx-store-char__group');
    wrap.append(el('legend', 'lfx-store-char__legend', null, c.label));
    const grid = el('div', 'lfx-store-char__grid');
    const btns = c.options.map((opt) => {
      const b = el('button', 'lfx-store-char__opt', { type: 'button', 'data-value': String(opt.value) });
      b.append(el('span', 'lfx-store-char__optlabel', null, opt.label));
      b.addEventListener('click', () => {
        const cur = model.controls(tab).find((x) => x.id === c.id);
        const o2 = cur && cur.options.find((x) => x.value === opt.value);
        if (o2 && o2.locked) { setStatus(`Gesperrt: ${o2.hint || 'noch nicht entdeckt'}`); return; }
        if (model.set(c.field, opt.value)) { setStatus(''); changed(); }
      });
      grid.append(b);
      return b;
    });
    wrap.append(grid);
    return {
      el: wrap,
      sync(cd) {
        cd.options.forEach((opt, i) => {
          const b = btns[i];
          b.classList.toggle('is-on', !!opt.selected);
          b.classList.toggle('is-locked', !!opt.locked);
          b.setAttribute('aria-pressed', opt.selected ? 'true' : 'false');
          b.setAttribute('aria-disabled', opt.locked ? 'true' : 'false');
          b.title = opt.locked ? `Gesperrt: ${opt.hint}` : '';
          b.setAttribute('aria-label', opt.locked ? `${opt.label} (gesperrt)` : opt.label);
          let lock = b.querySelector('.lfx-store-char__lock');
          if (opt.locked && !lock) b.append(el('span', 'lfx-store-char__lock', { 'aria-hidden': 'true' }));
          else if (!opt.locked && lock) lock.remove();
        });
      },
    };
  }

  function buildColor(c) {
    const wrap = el('fieldset', 'lfx-store-char__group');
    wrap.append(el('legend', 'lfx-store-char__legend', null, c.label));
    const grid = el('div', 'lfx-store-char__swatches');
    const btns = c.options.map((opt) => {
      const b = el('button', 'lfx-store-char__swatch', { type: 'button', 'data-value': String(opt.value), 'aria-label': `${c.label}: ${opt.label}` });
      b.style.background = opt.hex;
      b.addEventListener('click', () => { if (model.set(c.field, opt.value)) changed(); });
      grid.append(b);
      return b;
    });
    wrap.append(grid);
    let input = null;
    let customLabel = null;
    if (c.custom) {
      customLabel = el('label', 'lfx-store-char__custom');
      customLabel.append(el('span', null, null, 'Eigene Farbe …'));
      input = el('input', 'lfx-store-char__color', { type: 'color', 'aria-label': `${c.label}: eigene Farbe` });
      input.value = c.hex;
      input.addEventListener('input', () => {
        const rgb = hexToRgb(input.value);
        if (rgb && model.setCustomColor(c.field, rgb)) changed();
      });
      customLabel.append(input);
      wrap.append(customLabel);
    }
    return {
      el: wrap,
      sync(cd) {
        cd.options.forEach((opt, i) => {
          btns[i].classList.toggle('is-on', !!opt.selected);
          btns[i].setAttribute('aria-pressed', opt.selected ? 'true' : 'false');
        });
        if (input) {
          customLabel.classList.toggle('is-on', !!cd.isCustom);
          if (document.activeElement !== input) input.value = cd.hex;
        }
      },
    };
  }

  function buildRange(c) {
    const wrap = el('div', 'lfx-store-char__group lfx-store-char__group--range');
    const id = `lfx-store-char-r-${c.id}`;
    wrap.append(el('label', 'lfx-store-char__legend', { for: id }, c.label));
    const row = el('div', 'lfx-store-char__rangerow');
    const input = el('input', 'lfx-store-char__range', { type: 'range', id, min: String(c.min), max: String(c.max), step: '1', 'aria-label': c.label });
    input.value = String(c.value);
    input.addEventListener('input', () => { if (model.set(c.field, Number(input.value))) changed(); });
    row.append(el('span', 'lfx-store-char__rangelabel', null, c.lo), input, el('span', 'lfx-store-char__rangelabel', null, c.hi));
    wrap.append(row);
    return { el: wrap, sync(cd) { if (document.activeElement !== input) input.value = String(cd.value); } };
  }

  function buildSlots(c) {
    const wrap = el('div', 'lfx-store-char__group lfx-store-char__slots');
    wrap.append(el('p', 'lfx-store-char__hint', null, 'Drei Plätze für deine Figuren. „Laden“ wechselt, „Speichern“ legt die aktuelle Figur dort ab.'));
    const rows = c.slots.map((s) => {
      const row = el('div', 'lfx-store-char__slot', { 'data-slot': String(s.index) });
      const label = el('span', 'lfx-store-char__slotname');
      const load = el('button', 'lfx-store-char__btn lfx-store-char__btn--small', { type: 'button' });
      const save = el('button', 'lfx-store-char__btn lfx-store-char__btn--small', { type: 'button' }, 'Speichern');
      save.setAttribute('aria-label', `Aktuelle Figur auf Platz ${s.index + 1} speichern`);
      load.addEventListener('click', () => {
        const cur = model.slots()[s.index];
        const done = cur.active ? false : cur.filled ? model.loadSlot(s.index) : model.newSlot(s.index);
        if (done) { changed(); if (o.onSlot) o.onSlot('switch', s.index); }
      });
      save.addEventListener('click', () => {
        if (model.saveToSlot(s.index)) { syncAll(); setStatus(`Auf Platz ${s.index + 1} gespeichert.`); if (o.onSlot) o.onSlot('save', s.index); }
      });
      row.append(label, load, save);
      wrap.append(row);
      return { row, label, load, save };
    });
    return {
      el: wrap,
      sync(cd) {
        cd.slots.forEach((s, i) => {
          const r = rows[i];
          r.row.classList.toggle('is-active', s.active);
          r.label.textContent = `Platz ${s.index + 1}${s.active ? ' (aktiv)' : s.filled ? '' : ' (leer)'}`;
          r.load.textContent = s.active ? 'Aktiv' : s.filled ? 'Laden' : 'Neu anlegen';
          r.load.disabled = s.active;
          r.load.setAttribute('aria-label', s.active ? `Platz ${s.index + 1} ist aktiv` : s.filled ? `Platz ${s.index + 1} laden` : `Platz ${s.index + 1} neu anlegen`);
          r.save.disabled = s.active;
        });
      },
    };
  }

  function renderTab() {
    body.textContent = '';
    controls = [];
    const defs = model.controls(tab);
    for (const d of defs) {
      const built = d.kind === 'choice' ? buildChoice(d) : d.kind === 'color' ? buildColor(d) : d.kind === 'range' ? buildRange(d) : buildSlots(d);
      built.def = d;
      controls.push(built);
      body.append(built.el);
    }
    syncAll();
    body.scrollTop = 0;
    updateScrollHint();
  }

  function syncAll() {
    if (destroyed) return;
    const defs = model.controls(tab);
    controls.forEach((c, i) => { if (defs[i]) c.sync(defs[i]); });
    for (const [id, b] of tabBtns) {
      b.classList.toggle('is-on', id === tab);
      b.setAttribute('aria-selected', id === tab ? 'true' : 'false');
      b.tabIndex = id === tab ? 0 : -1;
    }
  }

  function setTab(id, user) {
    if (!isTab(id) || !tabBtns.has(id)) return;
    const was = tab;
    tab = id;
    setStatus('');
    renderTab();
    if (user && was !== id && o.onTab) o.onTab(id);
  }

  renderTab();

  return {
    el: root,
    preview,
    stampEl,
    tab: () => tab,
    setTab: (id) => setTab(id, true),
    sync: syncAll,
    /** Eingaben sperren (während Stempel/Blitz). */
    busy(on) {
      isBusy = !!on;
      root.classList.toggle('is-busy', isBusy);
      for (const b of root.querySelectorAll('button, input')) { if (b.classList.contains('lfx-store-char__input')) continue; b.toggleAttribute('data-busy', isBusy); }
      if (apply) apply.disabled = isBusy;
      if (cancel) cancel.disabled = isBusy;
      rand.disabled = isBusy;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const f of cleanups) f();
      root.remove();
    },
  };
}

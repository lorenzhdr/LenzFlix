// @vitest-environment jsdom
// Figur-Editor (1.17.0): Modell (rein) und Ansicht (jsdom). Kein WebGL, kein Netzwerk.
import { describe, it, expect, vi } from 'vitest';
import { createEditorModel, TABS, FIELD_DEFS, UNLOCK_SLOT, controlsFor, focusOfTab, hexToRgb, colorHex } from '../src/js/store3d/char/editor-model.js';
import { createCharEditor } from '../src/js/store3d/ui/chareditor.js';
import { F, LEN, defaultCode, equal, decode, randomLook, CUSTOM_COLOR } from '../src/js/store3d/char/look2.js';
import { UNLOCK_BASE, SKIN } from '../src/js/store3d/char/ids.js';
import { CATALOG } from '../src/js/store3d/discover/catalog.js';
import { UNLOCKS } from '../src/js/store3d/char/unlocks.js';

const seq = (n = 7) => { let s = n; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };
const allFound = () => CATALOG.map((e) => e.id);

describe('Editor-Modell: Optionen', () => {
  it('jede wählbare Option ändert genau ihr Feld', () => {
    const m = createEditorModel({ code: defaultCode(), found: allFound() });
    let n = 0;
    for (const t of TABS) {
      if (t.id === 'slots') continue;
      for (const c of m.controls(t.id)) {
        if (c.kind === 'choice') {
          for (const o of c.options) {
            const before = m.code();
            m.set(c.field, c.options[0].value === o.value && before[c.field] === o.value ? (c.options[1] || o).value : before[c.field]); // Ausgangslage mischen
            const start = m.code();
            const changed = m.set(c.field, o.value);
            expect(m.get(c.field)).toBe(o.value);
            expect(changed).toBe(start[c.field] !== o.value);
            const now = m.code();
            for (let i = 0; i < LEN; i++) if (i !== c.field) expect(now[i]).toBe(start[i]);
            n++;
          }
        } else if (c.kind === 'color') {
          for (const o of c.options) {
            m.set(c.field, o.value);
            expect(m.get(c.field)).toBe(o.value);
            n++;
          }
        } else if (c.kind === 'range') {
          for (const v of [c.min, 7, c.max]) { m.set(c.field, v); expect(m.get(c.field)).toBe(v); n++; }
        }
      }
    }
    expect(n).toBeGreaterThan(100);
  });

  it('Reiter decken alle Felder ab (ohne Version)', () => {
    const seen = new Set();
    for (const t of TABS) for (const c of controlsFor(t.id, createEditorModel({ code: defaultCode() }))) if (c.field !== undefined) seen.add(c.field);
    for (let i = 1; i < LEN; i++) expect(seen.has(i), `Feld ${i}`).toBe(true);
    expect(Object.keys(FIELD_DEFS).length).toBe(LEN - 1);
  });

  it('ungültige Werte werden abgelehnt', () => {
    const m = createEditorModel({ code: defaultCode() });
    expect(m.set(F.hairStyle, 99)).toBe(false);
    expect(m.set(F.hairStyle, -1)).toBe(false);
    expect(m.set(F.hairStyle, 1.5)).toBe(false);
    expect(m.set(0, 3)).toBe(false);
    expect(m.set(LEN, 1)).toBe(false);
    expect(m.set(F.skin, CUSTOM_COLOR | 0xabcdef)).toBe(false); // Haut: keine eigene Farbe
    expect(m.setCustomColor(F.skin, [1, 0, 0])).toBe(false);
    expect(equal(m.code(), defaultCode())).toBe(true);
  });

  it('eigene Farbe (nicht Haut)', () => {
    const m = createEditorModel({ code: defaultCode() });
    expect(m.setCustomColor(F.topColor, [1, 0, 0])).toBe(true);
    expect(m.get(F.topColor)).toBe(CUSTOM_COLOR | 0xff0000);
    expect(hexToRgb('#00ff00')).toEqual([0, 1, 0]);
    expect(hexToRgb('zz')).toBeNull();
    const c = m.controls('top').find((x) => x.id === 'topColor');
    expect(c.isCustom).toBe(true);
    expect(c.hex).toBe('#ff0000');
    expect(colorHex(0, SKIN)).toMatch(/^#[0-9a-f]{6}$/);
    expect(m.setCustomColor(F.topCut, [1, 0, 0])).toBe(false); // kein Farbfeld
  });

  it('Zufall bleibt gültig und nutzt nur freigeschaltete Teile', () => {
    const m = createEditorModel({ code: defaultCode(), found: [], rand: seq(3) });
    for (let i = 0; i < 40; i++) {
      const c = m.randomize();
      expect(equal(decode(c), c)).toBe(true);
      for (const f of Object.keys(UNLOCK_SLOT)) expect(c[f] < UNLOCK_BASE, `Feld ${f}`).toBe(true);
    }
    const m2 = createEditorModel({ code: defaultCode(), found: allFound(), rand: seq(5) });
    let saw = false;
    for (let i = 0; i < 400 && !saw; i++) { const c = m2.randomize(); saw = Object.keys(UNLOCK_SLOT).some((f) => c[f] >= UNLOCK_BASE); }
    expect(saw).toBe(true);
    expect(randomLook(seq(1)).length).toBe(LEN);
  });
});

describe('Editor-Modell: Sperren', () => {
  const u = UNLOCKS.find((x) => x.slot === 'hat');
  it('gesperrte Teile sind sichtbar, aber nicht wählbar; Hinweis kommt aus der Entdeckung', () => {
    const m = createEditorModel({ code: defaultCode(), found: [] });
    const hat = m.controls('extras').find((c) => c.id === 'hat');
    const opt = hat.options.find((o) => o.value === u.code);
    expect(opt.locked).toBe(true);
    expect(opt.hint.length).toBeGreaterThan(5);
    expect(m.set(F.hat, u.code)).toBe(false);
    expect(m.get(F.hat)).toBe(0);
    expect(m.isLocked(F.hat, u.code)).toBe(true);
    expect(m.isLocked(F.hat, 1)).toBe(false);
  });
  it('nach der Entdeckung wählbar', () => {
    const m = createEditorModel({ code: defaultCode(), found: [u.discover] });
    expect(m.set(F.hat, u.code)).toBe(true);
    const opt = m.controls('extras').find((c) => c.id === 'hat').options.find((o) => o.value === u.code);
    expect(opt.locked).toBe(false);
    expect(opt.selected).toBe(true);
    m.setFound([]);
    expect(m.isLocked(F.hat, u.code)).toBe(true);
  });
  it('jedes Freischalt-Teil taucht im passenden Reiter auf', () => {
    const m = createEditorModel({ code: defaultCode(), found: [] });
    const tabOf = { top: 'top', bottom: 'bottom', shoes: 'shoes', glasses: 'extras', hat: 'extras', bag: 'extras' };
    for (const x of UNLOCKS) {
      const found = m.controls(tabOf[x.slot]).flatMap((c) => c.options || []).some((o) => o.value === x.code && o.locked);
      expect(found, x.id).toBe(true);
    }
  });
});

describe('Editor-Modell: Abbrechen, Plätze', () => {
  it('reset stellt den Stand beim Öffnen wieder her', () => {
    const start = defaultCode();
    const m = createEditorModel({ code: start });
    expect(m.dirty()).toBe(false);
    m.set(F.hairStyle, 5);
    m.set(F.skin, 2);
    expect(m.dirty()).toBe(true);
    m.reset();
    expect(equal(m.code(), start)).toBe(true);
    expect(m.dirty()).toBe(false);
    expect(equal(m.original(), start)).toBe(true);
  });

  it('Plätze: laden, neu anlegen, speichern, Ergebnis', () => {
    const a = defaultCode();
    const b = defaultCode(); b[F.hairStyle] = 4;
    const m = createEditorModel({ code: a, slots: [a, b, null], active: 0, rand: seq(11) });
    expect(m.slots().map((s) => [s.filled, s.active])).toEqual([[true, true], [true, false], [false, false]]);
    expect(m.loadSlot(0)).toBe(false); // schon aktiv
    expect(m.loadSlot(2)).toBe(false); // leer
    m.set(F.skin, 4);
    expect(m.loadSlot(1)).toBe(true); // Änderungen am Platz 1 werden verworfen
    expect(m.active()).toBe(1);
    expect(equal(m.code(), b)).toBe(true);
    expect(m.newSlot(2)).toBe(true);
    expect(m.active()).toBe(2);
    expect(equal(decode(m.code()), m.code())).toBe(true);
    m.set(F.hairStyle, 7);
    expect(m.saveToSlot(0)).toBe(true); // Arbeitscode nach Platz 0, aktiv
    const r = m.result();
    expect(r.active).toBe(0);
    expect(r.slots[0][F.hairStyle]).toBe(7);
    expect(equal(r.slots[1], b)).toBe(true);
    expect(r.slots[2]).toBeNull();
    m.reset();
    expect(m.active()).toBe(0);
    expect(equal(m.result().slots[0], a)).toBe(true);
    expect(m.result().slots[2]).toBeNull();
  });

  it('Ergebnis schreibt den Arbeitscode in den aktiven Platz', () => {
    const a = defaultCode();
    const m = createEditorModel({ code: a, slots: [a, null, null], active: 0 });
    m.set(F.hairStyle, 3);
    const r = m.result();
    expect(r.slots[0][F.hairStyle]).toBe(3);
    expect(r.code[F.hairStyle]).toBe(3);
  });

  it('Fokus je Reiter', () => {
    expect(focusOfTab('hair')).toBe('hair');
    expect(focusOfTab('slots')).toBe('body');
    expect(focusOfTab('x')).toBe('body');
  });
});

describe('Editor-Ansicht', () => {
  const mount = (over = {}) => {
    const model = createEditorModel({ code: defaultCode(), found: [], ...(over.model || {}) });
    const cb = { onChange: vi.fn(), onTab: vi.fn(), onRotate: vi.fn(), onApply: vi.fn(), onCancel: vi.fn(), onDone: vi.fn(), onSlot: vi.fn() };
    const ui = createCharEditor({ model, where: 'pause', ...cb, ...(over.ui || {}) });
    document.body.append(ui.el);
    return { model, ui, cb };
  };
  const click = (n) => n.dispatchEvent(new MouseEvent('click', { bubbles: true }));

  it('Optionen anklicken ändert Code und meldet onChange', () => {
    const { model, ui, cb } = mount({ ui: { focus: 'hair' } });
    expect(ui.tab()).toBe('hair');
    const opt = ui.el.querySelector('.lfx-store-char__opt[data-value="8"]');
    click(opt);
    expect(model.get(F.hairStyle)).toBe(8);
    expect(opt.getAttribute('aria-pressed')).toBe('true');
    expect(cb.onChange).toHaveBeenCalledTimes(1);
    expect(cb.onChange.mock.calls[0][0][F.hairStyle]).toBe(8);
    click(opt); // gleiche Wahl: nichts
    expect(cb.onChange).toHaveBeenCalledTimes(1);
  });

  it('Farbfelder, Regler und eigene Farbe', () => {
    const { model, ui, cb } = mount({ ui: { focus: 'body' } });
    click(ui.el.querySelector('.lfx-store-char__swatch[data-value="5"]'));
    expect(model.get(F.skin)).toBe(5);
    expect(ui.el.querySelector('.lfx-store-char__color')).toBeNull(); // Haut: keine eigene Farbe
    const r = ui.el.querySelector('#lfx-store-char-r-height');
    r.value = '3';
    r.dispatchEvent(new Event('input', { bubbles: true }));
    expect(model.get(F.height)).toBe(3);
    ui.setTab('top');
    const col = ui.el.querySelector('.lfx-store-char__color');
    col.value = '#336699';
    col.dispatchEvent(new Event('input', { bubbles: true }));
    expect(model.get(F.topColor)).toBe(CUSTOM_COLOR | 0x336699);
    expect(cb.onChange).toHaveBeenCalledTimes(3);
    expect(cb.onTab).toHaveBeenCalledWith('top');
  });

  it('gesperrte Teile: Schloss, Hinweis, keine Wirkung', () => {
    const { model, ui, cb } = mount({ ui: { focus: 'extras' } });
    const u = UNLOCKS.find((x) => x.slot === 'hat');
    const b = ui.el.querySelector(`.lfx-store-char__opt[data-value="${u.code}"]`);
    expect(b.querySelector('.lfx-store-char__lock')).not.toBeNull();
    expect(b.getAttribute('aria-disabled')).toBe('true');
    click(b);
    expect(model.get(F.hat)).toBe(0);
    expect(cb.onChange).not.toHaveBeenCalled();
    expect(ui.el.querySelector('.lfx-store-char__status').textContent).toMatch(/Gesperrt/);
  });

  it('Zufall, Übernehmen, Abbrechen', () => {
    const { ui, cb } = mount();
    const btn = (t) => [...ui.el.querySelectorAll('.lfx-store-char__btn')].find((b) => b.textContent === t);
    click(btn('Zufall'));
    expect(cb.onChange).toHaveBeenCalledTimes(1);
    click(btn('Übernehmen'));
    expect(cb.onApply).toHaveBeenCalledTimes(1);
    click(btn('Abbrechen'));
    expect(cb.onCancel).toHaveBeenCalledTimes(1);
  });

  it('Esc bricht ab (Editor), im Gate wirkungslos', () => {
    const { ui, cb } = mount();
    ui.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    expect(cb.onCancel).toHaveBeenCalledTimes(1);
    const g = mount({ ui: { where: 'gate', name: 'Lenz' } });
    g.ui.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    expect(g.cb.onCancel).not.toHaveBeenCalled();
    expect([...g.ui.el.querySelectorAll('.lfx-store-char__btn')].some((b) => b.textContent === 'Abbrechen')).toBe(false);
  });

  it('Gate: Name schreibgeschützt, Fertig, kein Plätze-Reiter', () => {
    const { ui, cb } = mount({ ui: { where: 'gate', name: 'Lenz' } });
    const name = ui.el.querySelector('.lfx-store-char__input');
    expect(name.readOnly).toBe(true);
    expect(name.value).toBe('Lenz');
    expect(ui.el.querySelector('[data-tab="slots"]')).toBeNull();
    click([...ui.el.querySelectorAll('.lfx-store-char__btn')].find((b) => b.textContent === 'Fertig'));
    expect(cb.onDone).toHaveBeenCalledTimes(1);
    ui.busy(true);
    click([...ui.el.querySelectorAll('.lfx-store-char__btn')].find((b) => b.textContent === 'Fertig'));
    expect(cb.onDone).toHaveBeenCalledTimes(1);
  });

  it('Plätze-Reiter: Neu anlegen, Speichern', () => {
    const a = defaultCode();
    const { model, ui, cb } = mount({ model: { code: a, slots: [a, null, null], active: 0, rand: seq(2) }, ui: { focus: 'slots' } });
    const rows = ui.el.querySelectorAll('.lfx-store-char__slot');
    expect(rows.length).toBe(3);
    expect(rows[0].querySelector('button').disabled).toBe(true);
    click(rows[1].querySelector('button'));
    expect(model.active()).toBe(1);
    expect(cb.onSlot).toHaveBeenCalledWith('switch', 1);
    expect(cb.onChange).toHaveBeenCalledTimes(1);
    click(ui.el.querySelectorAll('.lfx-store-char__slot')[0].querySelectorAll('button')[1]);
    expect(model.active()).toBe(0);
    expect(cb.onSlot).toHaveBeenCalledWith('save', 0);
  });

  it('Reiter per Pfeiltaste, Drehen per Knopf und Ziehen, destroy', () => {
    const { ui, cb } = mount();
    ui.el.querySelector('.lfx-store-char__tab.is-on').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(ui.tab()).toBe('hair');
    click(ui.el.querySelector('[aria-label="Figur nach rechts drehen"]'));
    expect(cb.onRotate).toHaveBeenCalledWith(0.5);
    ui.preview.dispatchEvent(new MouseEvent('pointerdown', { clientX: 10, bubbles: true }));
    ui.preview.dispatchEvent(new MouseEvent('pointermove', { clientX: 60, bubbles: true }));
    expect(cb.onRotate.mock.calls.length).toBeGreaterThan(1);
    ui.destroy();
    expect(document.body.contains(ui.el)).toBe(false);
  });

  it('Live-Modus hat keine Dreh-Knöpfe', () => {
    const { ui } = mount({ ui: { live: true } });
    expect(ui.el.querySelector('.lfx-store-char__rot')).toBeNull();
    expect(ui.el.classList.contains('is-live')).toBe(true);
  });
});

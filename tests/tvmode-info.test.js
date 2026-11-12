// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInfo } from '../src/js/live/tvmode/info.js';

const T = Date.UTC(2026, 10, 11, 19, 0, 0);
const entry = { start: T, end: T + 3600000, type: 'program', itemId: 'm1' };

function make(over = {}) {
  const ctl = {
    restartTarget: vi.fn(() => ({ itemId: 'm1', type: 'movie', seriesId: null })),
    stop: vi.fn(),
  };
  const model = {
    channels: vi.fn(() => [{ no: 3, name: 'LIVE Kino', key: 'k' }]),
    describe: vi.fn(() => ({
      title: 'Testfilm', sub: 'S1 E3 · Folge', time: '20:00–21:00', progress: 0.5, badges: ['Premiere', 'ab 16'], kind: 'program',
      itemId: 'm1', overview: '', year: 1999, genres: ['Krimi'], runMin: 60,
    })),
    nextProgram: vi.fn(() => ({ start: T + 3600000, end: T + 7200000, type: 'program', itemId: 'm2' })),
    titleOf: vi.fn(() => ({ title: 'Nachfilm', sub: '' })),
  };
  const deps = { playFromStart: vi.fn(), openDetails: vi.fn() };
  const details = { get: vi.fn(() => ''), request: vi.fn(), map: vi.fn(() => new Map()), on: vi.fn(() => () => {}) };
  const pip = { supported: vi.fn(() => true), toggle: vi.fn() };
  const info = createInfo({ doc: document, ctl, model, deps, opts: { details, pip, getNow: () => T + 1800000, ...over } });
  document.body.append(info.el);
  return { info, ctl, model, deps, details, pip };
}
const snap = { on: true, channel: 3, entry, phase: 'playing' };
const q = (info, s) => info.el.querySelector(s);

beforeEach(() => { document.body.innerHTML = ''; });

describe('info', () => {
  it('zeigt Sender, Titel, Untertitel, Zeit, Badges, Danach und fragt die Inhaltsangabe an', () => {
    const { info, details } = make();
    info.update(snap);
    expect(q(info, '.lfx-tvm__info-no').textContent).toBe('3');
    expect(q(info, '.lfx-tvm__info-badge .lfx-tvm__chan-badge').textContent).toBe('KINO');
    expect(info.el.textContent).not.toMatch(/LIVE/);
    expect(q(info, '.lfx-tvm__info-head').getAttribute('aria-label')).toBe('Sender 3, Kino');
    expect(q(info, '.lfx-tvm__info-meta').contains(q(info, '.lfx-tvm__badges'))).toBe(true);
    expect(q(info, '.lfx-tvm__info-title').textContent).toBe('Testfilm');
    expect(q(info, '.lfx-tvm__info-sub').textContent).toBe('S1 E3 · Folge');
    expect(q(info, '.lfx-tvm__info-time').textContent).toBe('20:00 – 21:00');
    expect([...info.el.querySelectorAll('.lfx-tvm__badge')].map((b) => b.textContent)).toEqual(['Premiere', 'ab 16', 'Krimi', '1999']);
    expect(q(info, '.lfx-tvm__info-next').textContent).toMatch(/^Danach: Nachfilm · \d\d:\d\d$/);
    expect(q(info, '.lfx-tvm__info-fill').style.width).toBe('50%');
    expect(details.request).toHaveBeenCalledWith('m1');
  });

  it('tick aktualisiert den Fortschrittsbalken', () => {
    const { info } = make();
    info.update(snap);
    info.tick(T + 900000);
    expect(q(info, '.lfx-tvm__info-fill').style.width).toBe('25%');
  });

  it('Von vorne stoppt das TV, dann playFromStart mit der Id', () => {
    const { info, ctl, deps } = make();
    const order = [];
    ctl.stop.mockImplementation(() => order.push('stop'));
    deps.playFromStart.mockImplementation(() => order.push('play'));
    info.update(snap);
    q(info, '.lfx-tvm__btn--restart').click();
    expect(order).toEqual(['stop', 'play']);
    expect(deps.playFromStart).toHaveBeenCalledWith('m1');
  });

  it('Details ruft openDetails, ohne das TV zu stoppen', () => {
    const { info, ctl, deps } = make();
    info.update(snap);
    q(info, '.lfx-tvm__btn--details').click();
    expect(deps.openDetails).toHaveBeenCalledWith('m1');
    expect(ctl.stop).not.toHaveBeenCalled();
  });

  it('hat keinen eigenen Bild-in-Bild-Knopf (nur in der Player-Leiste)', () => {
    const { info, pip } = make();
    info.update(snap);
    expect(q(info, '.lfx-tvm__btn--info-pip')).toBeNull();
    expect(info.el.querySelectorAll('.lfx-tvm__info-actions .lfx-tvm__btn')).toHaveLength(2);
    expect(pip.toggle).not.toHaveBeenCalled();
  });

  it('Sendepause/Füller: Knöpfe deaktiviert und ausgeblendet', () => {
    const { info, ctl, model } = make();
    ctl.restartTarget.mockReturnValue(null);
    model.describe.mockReturnValue({ title: 'Sendepause', sub: '', time: '01:00–05:00', progress: 0, badges: [], kind: 'closedown', itemId: null, overview: '', year: null, genres: [], runMin: null });
    info.update({ ...snap, entry: { ...entry, type: 'closedown', itemId: null } });
    expect(q(info, '.lfx-tvm__btn--restart').disabled).toBe(true);
    expect(q(info, '.lfx-tvm__btn--restart').hidden).toBe(true);
    expect(q(info, '.lfx-tvm__btn--details').hidden).toBe(true);
  });

  it('Inhaltsangabe aus details, „Mehr“ klappt aus', () => {
    const { info, details } = make();
    details.get.mockReturnValue('Eine lange Handlung.');
    info.update(snap);
    expect(q(info, '.lfx-tvm__info-text').textContent).toBe('Eine lange Handlung.');
    const more = q(info, '.lfx-tvm__info-more');
    more.click();
    expect(info.el.classList.contains('is-expanded')).toBe(true);
    expect(more.textContent).toBe('Weniger');
  });

  it('destroy entfernt das Element und meldet details ab', () => {
    const off = vi.fn();
    const m = make();
    m.details.on = vi.fn(() => off);
    const info = createInfo({ doc: document, ctl: m.ctl, model: m.model, deps: m.deps, opts: { details: m.details, pip: m.pip } });
    document.body.append(info.el);
    info.destroy();
    expect(off).toHaveBeenCalled();
    expect(info.el.isConnected).toBe(false);
  });
});

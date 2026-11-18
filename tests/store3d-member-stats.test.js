// @vitest-environment jsdom
// VIDEOTHEK LENZ · Modul member: Zähler (1×/Tag/Titel/Art, je Gerät), ensure, cardData mit/ohne Name, Richard-Anbindung.
import { describe, it, expect, vi, afterEach } from 'vitest';
import member from '../src/js/store3d/modules/member.js';
import { emptyProfile, normalize } from '../src/js/features/store/profile-merge.js';
import { defaultCode } from '../src/js/store3d/char/look2.js';
import { TOTAL } from '../src/js/store3d/discover/catalog.js';

function fakeProfile(dev = 'dev00001', init) {
  let data = normalize(init || emptyProfile());
  return {
    dev,
    get: () => data,
    update: vi.fn((fn) => { const d = JSON.parse(JSON.stringify(data)); fn(d); data = normalize(d); }),
    state: () => 'ok',
    onRemote: () => () => {},
  };
}

function mk({ profile = fakeProfile(), code = defaultCode(), mp, user = { name: 'Max' }, found = [] } = {}) {
  const providers = new Map();
  const host = document.createElement('div');
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  document.body.appendChild(host);
  const overlay = { el: null, onClose: null, open: vi.fn((el, o) => { overlay.el = el; overlay.onClose = o && o.onClose; host.appendChild(el); }), close: vi.fn(() => { if (overlay.el) overlay.el.remove(); overlay.el = null; const f = overlay.onClose; overlay.onClose = null; if (f) f(); }), isOpen: () => !!overlay.el };
  const ctx = {
    deps: { profile, user, ...(mp ? { mp } : {}) },
    provide: (n, p) => { providers.set(n, p); return () => providers.delete(n); },
    use: (n) => {
      if (n === 'avatar') return { code: () => code, portrait: () => Promise.resolve(null) };
      if (n === 'discover') return { getNetState: () => ({ found }) };
      return providers.get(n) || null;
    },
    xr: { presenting: () => false, toast: vi.fn() },
    overlay, renderer: { domElement: canvas }, isTouch: true,
  };
  const inst = member.init(ctx);
  return { ctx, inst, m: providers.get('member'), profile, host, overlay };
}

afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); });

describe('member: Zähler', () => {
  it('zählt je Titel und Art einmal pro Tag, je Gerät getrennt', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T10:00:00Z'));
    const { m, profile } = mk({ profile: fakeProfile('devaaaaa') });
    expect(m.count('rent', 't1')).toBe(true);
    expect(m.count('rent', 't1')).toBe(false);
    expect(m.count('rent', 't2')).toBe(true);
    expect(m.count('cine', 't1')).toBe(true); // andere Art, gleicher Titel
    expect(m.count('cine', 't1')).toBe(false);
    expect(profile.get().cnt.rent).toEqual({ devaaaaa: 2 });
    expect(profile.get().cnt.cine).toEqual({ devaaaaa: 1 });
    vi.setSystemTime(new Date('2026-11-19T00:01:00Z'));
    expect(m.count('rent', 't1')).toBe(true); // neuer Tag
    expect(profile.get().cnt.rent.devaaaaa).toBe(3);
  });
  it('zweites Gerät schreibt unter eigener Geräte-ID', () => {
    const p = fakeProfile('devbbbbb', { cnt: { rent: { devaaaaa: 4 }, cine: {}, last: {} } });
    const { m } = mk({ profile: p });
    expect(m.count('rent', 'x')).toBe(true);
    expect(p.get().cnt.rent).toEqual({ devaaaaa: 4, devbbbbb: 1 });
  });
  it('lehnt falsche Art/leere ID ab und arbeitet ohne Profil still', () => {
    const { m } = mk();
    expect(m.count('foo', 'x')).toBe(false);
    expect(m.count('rent', '')).toBe(false);
    const n = mk({ profile: null });
    expect(n.m.count('rent', 'x')).toBe(false);
    expect(() => n.m.ensure()).not.toThrow();
  });
});

describe('member: ensure', () => {
  it('vergibt 6-stellige Nummer und seit, ändert vorhandene nie', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T10:00:00Z'));
    const { m, profile } = mk();
    m.ensure();
    const mem = profile.get().mem;
    expect(mem.no).toMatch(/^\d{6}$/);
    expect(mem.since).toBe(Math.floor(Date.parse('2026-11-18T10:00:00Z') / 86400000));
    const before = JSON.stringify(mem);
    profile.update.mockClear();
    m.ensure();
    expect(JSON.stringify(profile.get().mem)).toBe(before);
    expect(profile.update).not.toHaveBeenCalled();
  });
  it('seit = früheste Entdeckung', () => {
    const t = Date.parse('2026-05-02T12:00:00Z');
    const p = fakeProfile('dev00001', { disc: { roof: t } });
    const { m } = mk({ profile: p });
    m.ensure();
    expect(p.get().mem.since).toBe(Math.floor(t / 86400000));
  });
});

describe('member: cardData', () => {
  it('null ohne Figur', () => {
    const base = mk();
    expect(base.m.cardData()).not.toBeNull();
    const none = mk({ code: null });
    expect(none.m.cardData()).toBeNull();
  });
  it('Name nur bei „Name zeigen“', () => {
    expect(mk({ mp: { prefs: () => ({ name: true }) } }).m.cardData().name).toBe('Max');
    expect(mk({ mp: { prefs: () => ({ name: false }) } }).m.cardData().name).toBeNull();
    expect(mk().m.cardData().name).toBe('Max'); // ohne Mehrspieler: Standard an
  });
  it('Summen, Stempel (Profil + Entdeckungen) und total', () => {
    const p = fakeProfile('devaaaaa', { cnt: { rent: { devaaaaa: 3, devbbbbb: 2 }, cine: { devaaaaa: 1 }, last: {} }, disc: { roof: 19000 * 86400000 + 5 }, mem: { no: '123456', since: 19100 } });
    const { m } = mk({ profile: p, found: ['zebra'] });
    const c = m.cardData();
    expect(c.rent).toBe(5);
    expect(c.cine).toBe(1);
    expect(c.no).toBe('123456');
    expect(c.since).toBe(19000); // frühester Wert aus Entdeckung und mem.since
    expect(c.total).toBe(TOTAL);
    expect(c.stamps).toBeGreaterThan(0);
    expect(c.tier).toBe('bronze');
    expect(c.code).toHaveLength(26);
  });
});

describe('member: showCard', () => {
  it('self: Overlay mit Karte, Schließen löst auf', async () => {
    const { m, overlay } = mk();
    const p = m.showCard(m.cardData(), { mode: 'self' });
    expect(overlay.open).toHaveBeenCalledTimes(1);
    expect(overlay.el.querySelector('.lfx-store-card')).toBeTruthy();
    overlay.el.querySelector('.lfx-store-card-btn').click();
    await expect(p).resolves.toBeUndefined();
    expect(overlay.el).toBeNull();
  });
  it('rent: kurzes Einblenden ohne Overlay, nach 1,2 s weg', async () => {
    vi.useFakeTimers();
    const { m, overlay, host } = mk();
    const p = m.showCard(m.cardData(), { mode: 'rent' });
    expect(overlay.open).not.toHaveBeenCalled();
    expect(host.querySelector('.lfx-store-card-wrap.is-rent')).toBeTruthy();
    vi.advanceTimersByTime(1250);
    await p;
    expect(host.querySelector('.lfx-store-card-wrap')).toBeNull();
  });
  it('VR: rent zeigt nichts, self nur Toast', async () => {
    const t = mk();
    t.ctx.xr.presenting = () => true;
    await t.m.showCard(t.m.cardData(), { mode: 'rent' });
    expect(t.host.querySelector('.lfx-store-card')).toBeNull();
    await t.m.showCard(t.m.cardData(), { mode: 'self' });
    expect(t.overlay.open).not.toHaveBeenCalled();
    expect(t.ctx.xr.toast).toHaveBeenCalled();
  });
});

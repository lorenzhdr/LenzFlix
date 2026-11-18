// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emptyProfile, mergeProfiles, normalize, serialize, MAX_CHARS } from '../src/js/features/store/profile-merge.js';
import { createProfile } from '../src/js/features/store/profile.js';

const look = (n = 1) => [2, 3, 10, 10, 0, 0, n, 0, 1, 0, 0, 1, 0, 6, 0, 13, 0, 11, 0, 1, 1, 0, 0, 0, 0, 0];
const prof = (o = {}) => normalize(o);

describe('normalize', () => {
  it('Müll wird zum leeren Profil', () => {
    for (const x of [null, 5, 'x', [], { fig: 3, cnt: 'a', disc: [1] }]) expect(normalize(x)).toEqual(emptyProfile());
    expect(emptyProfile()).toMatchObject({ v: 1, fig: { act: 0, slots: [null, null, null] }, set: { cam: 'ego' }, mem: {}, disc: {} });
  });
  it('ungültige Slots werden null, gültige bleiben', () => {
    const p = normalize({ fig: { act: 7, slots: [{ l: [1, 2], t: 5 }, { l: look(), t: 9, prov: true }, 'x'] } });
    expect(p.fig.act).toBe(0);
    expect(p.fig.slots[0]).toBeNull();
    expect(p.fig.slots[1]).toEqual({ l: look(), t: 9, prov: true });
    expect(p.fig.slots[2]).toBeNull();
  });
});

describe('mergeProfiles', () => {
  it('Slot: letzter Schreiber gewinnt, Gleichstand lokal', () => {
    const a = prof({ fig: { act: 0, slots: [{ l: look(1), t: 10 }, null, null] } });
    const b = prof({ fig: { act: 0, slots: [{ l: look(2), t: 20 }, { l: look(3), t: 1 }, null] } });
    const m = mergeProfiles(a, b);
    expect(m.fig.slots[0].l[6]).toBe(2);
    expect(m.fig.slots[1].l[6]).toBe(3);
    expect(mergeProfiles(a, prof({ fig: { slots: [{ l: look(4), t: 10 }] } })).fig.slots[0].l[6]).toBe(1);
  });
  it('Konto-Slot ohne prov schlägt lokalen prov-Slot immer', () => {
    const local = prof({ fig: { slots: [{ l: look(1), t: 999, prov: true }] } });
    const remote = prof({ fig: { slots: [{ l: look(2), t: 1 }] } });
    expect(mergeProfiles(local, remote).fig.slots[0].l[6]).toBe(2);
    expect(mergeProfiles(remote, local).fig.slots[0].l[6]).toBe(2);
  });
  it('set und seen: neuerer Zeitstempel', () => {
    const m = mergeProfiles(prof({ set: { cam: 'third', t: 5 }, seen: { t: 9, gabi: 'x' } }), prof({ set: { cam: 'ego', t: 6 }, seen: { t: 3, gabi: 'y' } }));
    expect(m.set).toEqual({ cam: 'ego', t: 6 });
    expect(m.seen).toEqual({ t: 9, gabi: 'x' });
  });
  it('mem: kleineres since gewinnt samt no', () => {
    const m = mergeProfiles(prof({ mem: { no: '111111', since: 50 } }), prof({ mem: { no: '222222', since: 40 } }));
    expect(m.mem).toEqual({ no: '222222', since: 40 });
    expect(mergeProfiles(prof(), prof({ mem: { no: '333333', since: 7 } })).mem.no).toBe('333333');
    expect(mergeProfiles(prof({ mem: { no: '333333', since: 7 } }), prof()).mem.no).toBe('333333');
  });
  it('cnt: je Gerät max, höchstens 8 Geräte (Rest in _), last nur lokal', () => {
    const rent = {};
    for (let i = 1; i <= 10; i++) rent[`d${i}`] = i;
    const m = mergeProfiles(prof({ cnt: { rent: { d1: 5, x: 1 }, last: { a: 3 } } }), prof({ cnt: { rent: { d1: 2, d2: 9 }, cine: { d1: 4 }, last: { b: 4 } } }));
    expect(m.cnt.rent).toEqual({ d1: 5, d2: 9, x: 1 });
    expect(m.cnt.cine).toEqual({ d1: 4 });
    expect(m.cnt.last).toEqual({ a: 3 });
    const big = mergeProfiles(prof({ cnt: { rent } }), prof()).cnt.rent;
    expect(Object.keys(big).filter((k) => k !== '_')).toHaveLength(8);
    expect(big._).toBe(3);
  });
  it('disc: Vereinigung mit früherem Zeitstempel; evt: neuerer', () => {
    const m = mergeProfiles(prof({ disc: { a: 10, b: 5 }, evt: { salonChair: 5 } }), prof({ disc: { a: 4, c: 7 }, evt: { salonChair: 8 } }));
    expect(m.disc).toEqual({ a: 4, b: 5, c: 7 });
    expect(m.evt.salonChair).toBe(8);
  });
  it('idempotent', () => {
    const a = prof({ fig: { act: 1, slots: [null, { l: look(), t: 3 }, null] }, disc: { a: 1 }, mem: { no: '123456', since: 9 } });
    expect(mergeProfiles(a, a)).toEqual(a);
  });
});

describe('serialize', () => {
  it('ohne cnt.last und höchstens 6000 Zeichen', () => {
    const disc = {};
    const last = {};
    for (let i = 0; i < 64; i++) disc[`id-${i}-${'x'.repeat(30)}`] = 1700000000000 + i;
    for (let i = 0; i < 300; i++) last[`k${i}`] = 20000;
    const big = prof({ disc, cnt: { last, rent: { a: 1 } }, fig: { slots: [0, 1, 2].map(() => ({ l: look(), t: 1 })) } });
    const s = serialize(big);
    expect(s.length).toBeLessThanOrEqual(MAX_CHARS);
    expect(JSON.parse(s).cnt.last).toBeUndefined();
    expect(serialize(prof({ disc: { a: 1 }, cnt: { last } }))).not.toContain('"k1"');
  });
});

describe('createProfile (Upload, Cache, Zustände)', () => {
  let remote;
  let client;
  const ls = () => window.localStorage;
  const cache = () => JSON.parse(ls().getItem('lfx.store.profile.u1'));
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    remote = { Id: 'lenzstore', CustomPrefs: { chromecastVersion: 'stable' } };
    client = {
      getDisplayPreferences: vi.fn(async () => JSON.parse(JSON.stringify(remote))),
      updateDisplayPreferences: vi.fn(async (id, p) => { remote = JSON.parse(JSON.stringify(p)); }),
    };
    window.ApiClient = client;
  });
  afterEach(() => { vi.useRealTimers(); delete window.ApiClient; });

  const mk = (name = 'Lenz') => createProfile({ uid: 'u1', name, storage: ls() });
  const setLook = (p, n) => p.update((d) => { d.fig.slots[0] = { l: look(n), t: Date.now() }; });

  it('Zustand: unknown ohne Cache, ok nach load, local mit Cache', async () => {
    const p = mk();
    expect(p.state()).toBe('unknown');
    expect(p.get().v).toBe(1);
    expect(await p.load()).toBe('ok');
    setLook(p, 1);
    expect(mk().state()).toBe('local');
  });

  it('Geräte-ID: 8 Zeichen, stabil', () => {
    const d = mk().dev;
    expect(d).toMatch(/^[a-z0-9]{8}$/);
    expect(ls().getItem('lfx.store.dev')).toBe(d);
    expect(mk().dev).toBe(d);
  });

  it('update: Cache sofort, Upload nach 2 s, geteilte CustomPrefs bleiben, nie Id lenzflix', async () => {
    const p = mk();
    await p.load();
    setLook(p, 5);
    expect(cache().dirty).toBe(true);
    expect(client.updateDisplayPreferences).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2000);
    expect(client.updateDisplayPreferences).toHaveBeenCalledTimes(1);
    expect(remote.CustomPrefs.chromecastVersion).toBe('stable');
    expect(JSON.parse(remote.CustomPrefs.profile).fig.slots[0].l[6]).toBe(5);
    expect(cache().dirty).toBe(false);
    const ids = [...client.getDisplayPreferences.mock.calls, ...client.updateDisplayPreferences.mock.calls].map((c) => c[0]);
    expect(ids.every((i) => i === 'lenzstore')).toBe(true);
  });

  it('mehrere Änderungen werden entprellt zu einem POST', async () => {
    const p = mk();
    await p.load();
    setLook(p, 1);
    await vi.advanceTimersByTimeAsync(1500);
    setLook(p, 2);
    await vi.advanceTimersByTimeAsync(1500);
    expect(client.updateDisplayPreferences).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(client.updateDisplayPreferences).toHaveBeenCalledTimes(1);
  });

  it('GET-Fehler: kein POST, Retry nach 5 s, dirty bleibt bis Erfolg', async () => {
    const p = mk();
    client.getDisplayPreferences.mockRejectedValue(new Error('offline'));
    expect(await p.load()).toBe('unknown');
    setLook(p, 3);
    await vi.advanceTimersByTimeAsync(2000);
    expect(client.updateDisplayPreferences).not.toHaveBeenCalled();
    expect(cache().dirty).toBe(true);
    client.getDisplayPreferences.mockImplementation(async () => JSON.parse(JSON.stringify(remote)));
    await vi.advanceTimersByTimeAsync(5000);
    expect(client.updateDisplayPreferences).toHaveBeenCalledTimes(1);
    expect(p.state()).toBe('ok');
    expect(cache().dirty).toBe(false);
  });

  it('POST-Fehler: Retry, danach dirty=false', async () => {
    const p = mk();
    await p.load();
    client.updateDisplayPreferences.mockRejectedValueOnce(new Error('503'));
    setLook(p, 4);
    await vi.advanceTimersByTimeAsync(2000);
    expect(cache().dirty).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(client.updateDisplayPreferences).toHaveBeenCalledTimes(2);
    expect(cache().dirty).toBe(false);
  });

  it('dirty aus dem Cache wird beim nächsten Start hochgeladen', async () => {
    const p = mk();
    client.getDisplayPreferences.mockRejectedValue(new Error('x'));
    await p.load();
    setLook(p, 6);
    p.dispose();
    client.getDisplayPreferences.mockImplementation(async () => JSON.parse(JSON.stringify(remote)));
    const q = mk();
    expect(q.get().fig.slots[0].l[6]).toBe(6);
    await q.load();
    expect(JSON.parse(remote.CustomPrefs.profile).fig.slots[0].l[6]).toBe(6);
  });

  it('Konto-Daten werden gemerged, onRemote feuert, kein POST ohne Änderung', async () => {
    remote.CustomPrefs.profile = JSON.stringify({ v: 1, fig: { act: 0, slots: [{ l: look(8), t: 50 }, null, null] }, disc: { a: 3 } });
    const p = mk();
    const got = vi.fn();
    p.onRemote(got);
    expect(await p.load()).toBe('ok');
    expect(p.get().fig.slots[0].l[6]).toBe(8);
    expect(got).toHaveBeenCalled();
    expect(client.updateDisplayPreferences).not.toHaveBeenCalled();
  });

  it('langsames Konto: load() liefert nach dem Timeout den lokalen Zustand, onRemote kommt später', async () => {
    let release;
    client.getDisplayPreferences.mockImplementation(() => new Promise((r) => { release = () => r({ CustomPrefs: { profile: JSON.stringify({ v: 1, disc: { z: 1 } }) } }); }));
    const p = mk();
    const got = vi.fn();
    p.onRemote(got);
    const pr = p.load({ timeoutMs: 4000 });
    await vi.advanceTimersByTimeAsync(4000);
    expect(await pr).toBe('unknown');
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(p.state()).toBe('ok');
    expect(got).toHaveBeenCalled();
    expect(p.get().disc.z).toBe(1);
  });

  it('alte lokale Entdeckungen (Schlüssel nach Name) werden einmalig übernommen', async () => {
    ls().setItem('lfx.store.discover.Lenz', JSON.stringify({ v: 1, found: { roof: 111, graffiti: 222 } }));
    const p = mk('Lenz');
    expect(p.get().disc).toEqual({ roof: 111, graffiti: 222 });
    await p.load();
    expect(JSON.parse(remote.CustomPrefs.profile).disc).toEqual({ roof: 111, graffiti: 222 });
    ls().setItem('lfx.store.discover.Lenz', JSON.stringify({ v: 1, found: { zebra: 5 } }));
    expect(mk('Lenz').get().disc.zebra).toBeUndefined();
  });

  it('Müll im Cache und im Konto ist unschädlich', async () => {
    ls().setItem('lfx.store.profile.u1', '{kaputt');
    remote.CustomPrefs.profile = '###';
    const p = mk();
    expect(await p.load()).toBe('ok');
    expect(p.get()).toMatchObject({ v: 1 });
  });
});

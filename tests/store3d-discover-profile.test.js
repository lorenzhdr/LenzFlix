// @vitest-environment jsdom
// VIDEOTHEK LENZ · Entdeckungen und Konto-Profil (deps.profile.disc): Start-Vereinigung, Schreiben ins Profil, späte Konto-Daten.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import discover from '../src/js/store3d/modules/discover.js';
import { emptyProfile, normalize } from '../src/js/features/store/profile-merge.js';
import { keyFor } from '../src/js/store3d/discover/storage.js';

function fakeProfile(init) {
  let data = normalize(init || emptyProfile());
  const subs = new Set();
  return {
    dev: 'dev00001',
    get: () => data,
    update: vi.fn((fn) => { const d = JSON.parse(JSON.stringify(data)); fn(d); data = normalize(d); }),
    onRemote: (fn) => { subs.add(fn); return () => subs.delete(fn); },
    remote(next) { data = normalize(next); for (const f of [...subs]) f(data); },
    subs,
  };
}

function boot(profile, user = { id: 'u1', name: 'Max' }) {
  const providers = new Map();
  const ctx = {
    layout: {}, deps: { user, ...(profile ? { profile } : {}) }, opts: {},
    provide: (n, p) => { providers.set(n, p); return () => providers.delete(n); },
    use: () => null, track() {}, scene: { add() {} },
    xr: { toast: vi.fn(), presenting: () => false },
    player: { getPose: () => ({ x: 0, y: 0, z: 0 }), getY: () => 0 },
    camera: { getWorldDirection() {}, position: { x: 0, y: 0, z: 0 } },
  };
  const inst = discover.init(ctx);
  return { api: providers.get('discover'), inst, ctx, providers };
}

beforeEach(() => { localStorage.clear(); });

describe('discover und Profil', () => {
  it('vereinigt Profil-Funde beim Start mit dem lokalen Speicher (beide Richtungen)', () => {
    localStorage.setItem(keyFor('u1'), JSON.stringify({ v: 1, found: { zebra: 1234 } }));
    const p = fakeProfile({ disc: { roof: 5000, 'car-honk': 6000 } });
    const { api } = boot(p);
    expect(api.has('roof')).toBe(true);
    expect(api.has('car-honk')).toBe(true);
    expect(api.has('zebra')).toBe(true);
    expect(p.get().disc.zebra).toBe(1234); // lokaler Fund ins Profil, mit Originalzeit
    const stored = JSON.parse(localStorage.getItem(keyFor('u1')));
    expect(stored.found.roof).toBe(5000); // Originalzeit des Kontos bleibt
    expect(api.summary().count).toBe(3);
  });
  it('übernommene Funde lösen keinen Toast aus', () => {
    const { ctx } = boot(fakeProfile({ disc: { roof: 5000 } }));
    expect(ctx.xr.toast).not.toHaveBeenCalled();
  });
  it('found() schreibt zusätzlich ins Profil, Wiederholung nicht', () => {
    const p = fakeProfile();
    const { api } = boot(p);
    p.update.mockClear();
    expect(api.found('graffiti')).toBe(true);
    expect(p.get().disc.graffiti).toBeGreaterThan(0);
    expect(api.found('graffiti')).toBe(false);
    expect(p.update).toHaveBeenCalledTimes(1);
    expect(api.getNetState().found).toContain('graffiti');
  });
  it('späte Konto-Daten (onRemote) werden leise übernommen und gemeldet', () => {
    const p = fakeProfile();
    const { api } = boot(p);
    const got = [];
    api.onChange((id, n) => got.push([id, n]));
    p.remote({ disc: { zebra: 4000 } });
    expect(api.has('zebra')).toBe(true);
    expect(got).toEqual([['zebra', 1]]);
  });
  it('lokaler Schlüssel bleibt user.id oder user.name; dispose räumt onRemote ab', () => {
    const p = fakeProfile();
    const { api, inst } = boot(p, { name: 'Nur Name' });
    api.found('roof');
    expect(localStorage.getItem(keyFor('Nur Name'))).toContain('roof');
    expect(p.subs.size).toBe(1);
    inst.dispose();
    expect(p.subs.size).toBe(0);
  });
  it('ohne Profil wie bisher', () => {
    const { api } = boot(null);
    expect(api.found('roof')).toBe(true);
    expect(api.summary().count).toBe(1);
  });
  it('reset leert auch das Profil', () => {
    const p = fakeProfile({ disc: { roof: 5000 } });
    const { api } = boot(p);
    api.reset();
    expect(api.has('roof')).toBe(false);
    expect(p.get().disc).toEqual({});
  });
});

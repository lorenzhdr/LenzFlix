// VIDEOTHEK LENZ: Konto-Profil (1.17.0), deps.profile für das 3D-Bundle (Vertrag .tmp/v117/contracts.md §4).
// Cache localStorage lfx.store.profile.<uid> = { data, dirty }; Upload 2 s entprellt: GET → merge → POST (ohne erfolgreiches GET nie ein POST),
// Wiederholung nach 5 s / 30 s / 2 min, dirty bleibt bis zum Erfolg (und wird beim nächsten Start hochgeladen).
import { updateCustom } from './displayprefs.js';
import { emptyProfile, mergeProfiles, normalize, serialize } from './profile-merge.js';

const PREFS_ID = 'lenzstore';
const KEY = 'profile';
const DELAYS = [5000, 30000, 120000];

export function createProfile({ uid, name, storage }) {
  const rd = (k) => { try { return storage.getItem(k); } catch { return null; } };
  const wr = (k, v) => { try { storage.setItem(k, v); } catch { /* Speicher gesperrt */ } };
  const ck = `lfx.store.profile.${uid}`;
  let data = emptyProfile();
  let dirty = false;
  let state = 'unknown';
  let rev = 0;
  let tries = 0;
  let timer = null;
  let busy = null;
  let dead = false;
  const subs = new Set();

  try {
    const c = JSON.parse(rd(ck));
    if (c && typeof c === 'object' && c.data) { data = normalize(c.data); dirty = c.dirty === true; state = 'local'; }
  } catch { /* defekt: leer */ }

  let dev = rd('lfx.store.dev');
  if (!/^[a-z0-9]{8}$/.test(dev || '')) {
    dev = Array.from({ length: 8 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
    wr('lfx.store.dev', dev);
  }

  // Zweiter Tab desselben Kontos: vor dem Schreiben den fremden Cache einmischen (Zähler/Plätze gehen nicht verloren)
  const absorb = () => {
    try {
      const c = JSON.parse(rd(ck));
      if (c && typeof c === 'object' && c.data) {
        const m = mergeProfiles(data, normalize(c.data));
        if (JSON.stringify(m) !== JSON.stringify(data)) { data = m; return true; }
      }
    } catch { /* defekt: ignorieren */ }
    return false;
  };
  const save = () => { absorb(); wr(ck, JSON.stringify({ data, dirty })); };
  const onStorage = (e) => {
    if (dead || !e || e.key !== ck || !absorb()) return;
    for (const fn of [...subs]) { try { fn(data); } catch { /* egal */ } }
  };
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('storage', onStorage);

  // Einmalige Übernahme der alten lokalen Entdeckungen (Schlüssel nach Jellyfin-Name, wie discover.js); Marker je Gerät.
  const mk = `lfx.store.discmerged.${uid}`;
  if (rd(mk) !== '1') {
    try {
      const old = normalize({ disc: (JSON.parse(rd(`lfx.store.discover.${name ? String(name).slice(0, 64) : 'anon'}`)) || {}).found }).disc;
      const keys = Object.keys(old).filter((k) => !data.disc[k] || old[k] < data.disc[k]);
      if (keys.length) {
        data = normalize({ ...data, disc: { ...data.disc, ...Object.fromEntries(keys.map((k) => [k, old[k]])) } });
        dirty = true;
        save();
      }
    } catch { /* kein/defekter alter Speicher */ }
    wr(mk, '1');
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = dead ? null : setTimeout(() => { timer = null; sync().catch(() => {}); }, ms);
  }

  function sync() {
    if (busy) return busy;
    let sent = 0;
    busy = updateCustom(PREFS_ID, KEY, (raw) => {
      let rem;
      try { rem = normalize(raw ? JSON.parse(raw) : null); } catch { rem = emptyProfile(); }
      const before = JSON.stringify(data);
      const wasOk = state === 'ok';
      data = mergeProfiles(data, rem);
      state = 'ok';
      sent = rev;
      save();
      if (!dead && (!wasOk || JSON.stringify(data) !== before)) {
        for (const fn of [...subs]) { try { fn(data); } catch { /* egal */ } }
      }
      const out = serialize(data);
      return dirty || out !== serialize(rem) ? out : null;
    }).then(() => {
      busy = null;
      tries = 0;
      if (sent === rev) dirty = false;
      save();
      if (dirty) schedule(2000);
    }, (e) => {
      busy = null;
      if (tries < DELAYS.length) schedule(DELAYS[tries++]);
      throw e;
    });
    return busy;
  }

  return {
    dev,
    get: () => data,
    state: () => state,
    update(mutator) {
      const d = JSON.parse(JSON.stringify(data));
      mutator(d);
      data = normalize(d);
      rev += 1;
      dirty = true;
      tries = 0;
      save();
      schedule(2000);
    },
    onRemote(fn) { subs.add(fn); return () => subs.delete(fn); },
    /** Konto laden (und ggf. hochladen); wartet höchstens timeoutMs. Löst mit dem Zustand auf. */
    load({ timeoutMs = 4000 } = {}) {
      return new Promise((res) => {
        const t = setTimeout(() => res(state), timeoutMs);
        const done = () => { clearTimeout(t); res(state); };
        sync().then(done, done);
      });
    },
    dispose() { dead = true; if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('storage', onStorage); clearTimeout(timer); timer = null; subs.clear(); },
  };
}

// Gemeinsamer Stub-ctx für die Overlay-Tests (kein Import aus schedule/).
import { vi } from 'vitest';

export const H = 3600000;
export const DAY = 24 * H;
export const NOW = Date.UTC(2026, 10, 11, 20, 15, 7); // Mi 11.11.2026, 20:15:07 (Planzone vereinfacht UTC)

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const pad = (n) => String(n).padStart(2, '0');

export const dayOf = (t) => Math.floor((t - 5 * H) / DAY);
export const bounds = (D) => ({ start: D * DAY + 5 * H, end: (D + 1) * DAY + 5 * H });
export const clock = (t) => {
  const d = new Date(t);
  return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes());
};
export const fmtDay = (D) => {
  const d = new Date(D * DAY + 5 * H);
  return { weekday: WD[d.getUTCDay()], long: '', date: pad(d.getUTCDate()) + '.' + pad(d.getUTCMonth() + 1) + '.' };
};

export const ITEMS = {
  m1: { title: 'Der Film', year: 1999, genres: ['Action', 'Drama'], durMs: 95 * 60000 },
  e1: { title: 'Titel', seriesTitle: 'Serie', seriesId: 's1', season: 1, episode: 2, kind: 'episode', durMs: 45 * 60000 },
};

export function makePlan(no, D) {
  const s = bounds(D).start;
  const e = bounds(D).end;
  if (no === 18) return [{ start: s, end: e, type: 'closedown', reason: 'empty' }];
  const E = (a, b, o) => Object.assign({ start: s + a * H, end: s + b * H }, o);
  const out = [
    E(0, 1.5, { type: 'program', itemId: 'm1', premiere: 'film' }),
    E(1.5, 2, { type: 'filler' }),
    E(2, 7, { type: 'fill', itemId: 'm1' }),
    E(7, 15, { type: 'program', itemId: 'e1', premiere: 'episode', age: 16 }),
    E(15, 24, { type: 'program', itemId: 'e1', rerun: true, seriesId: 's1' }),
  ];
  if (no === 17) out[3].theme = 'Filmreihe Test';
  return out;
}

export function makeChannels() {
  const out = [];
  for (let no = 1; no <= 18; no++) {
    const base = { no, name: 'LIVE Sender' + no, kind: no >= 5 && no <= 16 ? 'genre' : 'special' };
    if (no >= 5 && no <= 16) base.genreLabel = 'Genre' + no;
    out.push(base);
  }
  return out;
}

export function makeScheduler(over) {
  const chans = makeChannels();
  const sched = {
    channels: () => chans,
    prepare: vi.fn(() => Promise.resolve()),
    planDay: (no, D) => makePlan(no, D),
    nowOn: (no, t) => {
      const D = dayOf(t);
      const entry = makePlan(no, D).find((x) => x.start <= t && t < x.end);
      return { entry, offsetMs: t - entry.start, D };
    },
    upcoming: (no, t, n) => {
      const D = dayOf(t);
      const all = [...makePlan(no, D), ...makePlan(no, D + 1)].filter((x) => x.type === 'program' && x.end > t);
      return all.slice(0, n + 1);
    },
    item: (id) => ITEMS[id] || null,
    genres: () => [
      { label: 'Action', count: 120 },
      { label: 'Komödie', count: 80 },
      { label: 'Sci-Fi; Fantasy', count: 3 },
      { label: 'Drama', count: 60 },
    ],
  };
  return Object.assign(sched, over || {});
}

export function makeCtx(over) {
  let style = 'crt80';
  const ctx = {
    scheduler: makeScheduler(),
    now: () => NOW,
    channels: () => makeChannels(),
    currentChannel: () => 1,
    tune: vi.fn(),
    closeOverlay: vi.fn(),
    formatClock: clock,
    formatDay: fmtDay,
    broadcastDayOf: dayOf,
    dayBounds: bounds,
    style: () => style,
    setStyle: vi.fn((id) => {
      style = id;
    }),
    styles: [
      { id: 'crt80', name: 'Röhre 80er' },
      { id: 'silver', name: 'Silber' },
      { id: 'flat', name: 'Flach' },
      { id: 'plain', name: 'Schlicht' },
    ],
    user: { id: 'u', name: 'Test', isAdmin: false },
    isAdmin: false,
    channelConfig: {},
    previousThemeName: 'LENZFLIX',
    leaveToLibrary: vi.fn(),
    openThemePicker: vi.fn(),
    openDashboard: vi.fn(),
    logout: vi.fn(),
    imageUrl: () => '',
    toast: vi.fn(),
  };
  return Object.assign(ctx, over || {});
}

export const flush = () => new Promise((r) => setTimeout(r, 0));

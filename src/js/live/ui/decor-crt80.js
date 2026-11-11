// LENZ LIVE · Dekor-Spezifikation „Röhre 80er“ (crt80): Wohnzimmer um 1982 mit Holz-Truhe als Fernseher.
// Format siehe decor.js / docs/live.md („Dekor und Röhren-Effekte“). Alle Optik steckt in decor-crt80.css / tv-crt80.css.
const pre = (cls) => cls.split(' ').map((c) => (c.startsWith('lfx-') ? c : `lfx-live-d-${c}`)).join(' ');
const d = (cls, children, extra) => ({ cls: pre(cls), ...(children ? { children } : {}), ...(extra || {}) });
const items = (cls, n) => d(cls, null, { count: n });

// Zimmerantenne: Sockel, zwei Teleskopstäbe in V-Form mit Gelenken und Kugelspitzen
const antenna = d('ant', [
  d('ant__rod ant__rod--l', [d('ant__seg'), d('ant__seg'), d('ant__seg'), d('ant__tip')]),
  d('ant__rod ant__rod--r', [d('ant__seg'), d('ant__seg'), d('ant__seg'), d('ant__tip')]),
  d('ant__base'),
  d('ant__hub'),
]);

// Kassette ohne Beschriftung: Gehäuse, Etikett, Fenster mit zwei Spulen
const tape = (v) => d(`tape lfx-live-d-tape--${v}`, [
  d('tape__label'),
  d('tape__win', [d('tape__reel'), d('tape__reel')]),
]);

export default {
  room: [
    d('wallglow'),
    d('tvshade'),
    d('shade'),
    // Stufe 2
    d('frame lfx-live-d-frame--a', [d('frame__mat', [d('frame__art lfx-live-d-frame__art--sun')])]),
    d('frame lfx-live-d-frame--b', [d('frame__mat', [d('frame__art lfx-live-d-frame__art--hills')])]),
    d('clock', [
      d('clock__rim', [
        d('clock__face', [
          items('clock__ticks', 12),
          d('clock__h'),
          d('clock__m'),
          d('clock__pin'),
        ]),
      ]),
    ]),
    // Stufe 3
    d('lamp', [
      d('lamp__glow'),
      d('lamp__cone'),
      d('lamp__shade'),
      d('lamp__pole'),
      d('lamp__base'),
    ]),
    d('rug', [d('rug__pattern'), d('rug__edge')]),
    // Stufe 1: Lowboard mit Türen, Fach, Videorekorder und Kassetten
    d('board', [
      d('board__shadow'),
      d('board__legs', [d('board__leg'), d('board__leg'), d('board__leg'), d('board__leg')]),
      d('board__body', [
        d('board__door board__door--l', [d('board__handle')]),
        d('board__niche', [
          d('vcr', [
            d('vcr__top'),
            d('vcr__front', [
              d('vcr__slot'),
              d('vcr__disp', null, { display: 'vcr' }),
              d('vcr__btns', null, { count: 5 }),
            ]),
            d('vcr__feet'),
          ]),
          d('tapes', [tape('a'), tape('b'), tape('c')]),
        ]),
        d('board__door board__door--r', [d('board__handle')]),
      ]),
      d('board__top'),
    ]),
    d('plant', [
      d('plant__shadow'),
      d('plant__leaves', null, { count: 11 }),
      d('plant__pot'),
    ]),
  ],
  tv: [
    antenna,
    d('feet', [d('foot'), d('foot')]),
    d('topface'),
    d('rim'),
    d('bezel', [d('bezel__shine')]),
    d('plate', [
      d('scale lfx-live-d-scale--a', null, { count: 9 }),
      d('scale lfx-live-d-scale--b', null, { count: 9 }),
      d('btns', null, { count: 8 }),
      d('power'),
    ]),
  ],
  glass: [
    d('g-vig'),
    d('g-mask'),
    d('g-scan'),
    d('g-fringe'),
    d('g-flicker'),
    d('g-roll'),
    d('g-glare'),
  ],
};

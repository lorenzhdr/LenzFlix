// LENZ LIVE · Dekor-Spezifikation „Silber-Röhre“ (silver): Wohnzimmer der frühen 2000er. Format siehe decor.js / docs/live.md („Dekor und Röhren-Effekte“).
// room  = Raum hinter dem Fernseher (Wand, Boden, Glas-Rack mit DVD-Player und Receiver, Pflanze, Wandregal, Lautsprecher)
// tv    = Gehäuse-Details am Fernseher (Lautsprecherfeld, Logo-Fläche, Klappe) 
// glass = Röhrenglas im Bildschirm (Wölbung, Reflex, Scanlines, Flimmern, Rollbalken, Farbsäume)
const dev = (cls, display, kids) => ({
  cls: `lfx-live-d-dev ${cls}`,
  children: [
    { cls: 'lfx-live-d-dev__shadow' },
    { cls: 'lfx-live-d-dev__body' },
    { cls: 'lfx-live-d-dev__seam' },
    { cls: 'lfx-live-d-dev__tray' },
    { cls: 'lfx-live-d-dev__disp', display },
    { cls: 'lfx-live-d-dev__btns', count: 4 },
    { cls: 'lfx-live-d-dev__knob' },
    ...(kids || []),
  ],
});

export default {
  room: [
    { cls: 'lfx-live-d-wall', children: [{ cls: 'lfx-live-d-wall__light' }] },
    { cls: 'lfx-live-d-tvshadow' },
    { cls: 'lfx-live-d-clock', children: [{ cls: 'lfx-live-d-clock__ticks', count: 12 }, { cls: 'lfx-live-d-clock__h' }, { cls: 'lfx-live-d-clock__m' }, { cls: 'lfx-live-d-clock__cap' }] },
    { cls: 'lfx-live-d-baseboard' },
    { cls: 'lfx-live-d-floor', children: [{ cls: 'lfx-live-d-floor__shine' }] },
    // Wandregal mit DVD-Rücken (Stufe 2)
    {
      cls: 'lfx-live-d-wshelf',
      children: [
        { cls: 'lfx-live-d-wshelf__row', count: 9 },
        { cls: 'lfx-live-d-wshelf__board', children: [{ cls: 'lfx-live-d-wshelf__face' }] },
      ],
    },
    // Pflanze: Bambus im Topf (Stufe 2)
    {
      cls: 'lfx-live-d-plant',
      children: [
        { cls: 'lfx-live-d-plant__stalks', count: 8 },
        { cls: 'lfx-live-d-plant__pot', children: [{ cls: 'lfx-live-d-plant__soil' }] },
        { cls: 'lfx-live-d-plant__shadow' },
      ],
    },
    // Standlautsprecher (Stufe 3)
    { cls: 'lfx-live-d-spk lfx-live-d-spk--l', children: [{ cls: 'lfx-live-d-spk__cloth' }, { cls: 'lfx-live-d-spk__tw' }, { cls: 'lfx-live-d-spk__wf' }, { cls: 'lfx-live-d-spk__wf lfx-live-d-spk__wf--2' }] },
    { cls: 'lfx-live-d-spk lfx-live-d-spk--r', children: [{ cls: 'lfx-live-d-spk__cloth' }, { cls: 'lfx-live-d-spk__tw' }, { cls: 'lfx-live-d-spk__wf' }, { cls: 'lfx-live-d-spk__wf lfx-live-d-spk__wf--2' }] },
    // Glas-Rack mit Chromfüßen (Platte und zwei Böden, je mit Kante und Fläche)
    {
      cls: 'lfx-live-d-rack',
      children: [
        { cls: 'lfx-live-d-rack__shadow' },
        { cls: 'lfx-live-d-rack__leg lfx-live-d-rack__leg--l' },
        { cls: 'lfx-live-d-rack__leg lfx-live-d-rack__leg--il' },
        { cls: 'lfx-live-d-rack__leg lfx-live-d-rack__leg--ir' },
        { cls: 'lfx-live-d-rack__leg lfx-live-d-rack__leg--r' },
        { cls: 'lfx-live-d-rack__shelf lfx-live-d-rack__shelf--2', children: [{ cls: 'lfx-live-d-rack__face' }] },
        { cls: 'lfx-live-d-rack__shelf lfx-live-d-rack__shelf--1', children: [{ cls: 'lfx-live-d-rack__face' }] },
        { cls: 'lfx-live-d-rack__top', children: [{ cls: 'lfx-live-d-rack__face' }] },
      ],
    },
    // Geräte im Rack (Raum-Ebene, mittig unter dem Fernseher über --lfx-s-m)
    dev('lfx-live-d-dvd', 'dvd'),
    dev('lfx-live-d-rcv', 'rcv'),
    // Subwoofer: Würfel vor dem linken Rack-Ende (Stufe 3)
    { cls: 'lfx-live-d-sub', children: [{ cls: 'lfx-live-d-sub__drv' }] },
  ],
  tv: [
    // Gehäuse
    { cls: 'lfx-live-d-top' },
    { cls: 'lfx-live-d-rim' },
    { cls: 'lfx-live-d-grille', children: [{ cls: 'lfx-live-d-grille__dots' }] },
    { cls: 'lfx-live-d-logo' },
    { cls: 'lfx-live-d-flap', children: [{ cls: 'lfx-live-d-flap__keys', count: 6 }] },
    { cls: 'lfx-live-d-foot' },
    { cls: 'lfx-live-d-contact' },
  ],
  glass: [
    { cls: 'lfx-live-d-g-vignette' },
    { cls: 'lfx-live-d-g-lines' },
    { cls: 'lfx-live-d-g-flicker' },
    { cls: 'lfx-live-d-g-roll' },
    { cls: 'lfx-live-d-g-fringe' },
    { cls: 'lfx-live-d-g-reflex' },
  ],
};

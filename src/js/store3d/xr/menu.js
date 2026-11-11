// VIDEOTHEK LENZ · VR-Menü: Panel-Spec aus dem Zustand (Einstellungen schreiben app.opts.vr und sichern über mode.savePrefs()).

const onOff = (v) => (v ? 'An' : 'Aus');

/** Hilfe: vr-Einstellungen in place ändern (app.vr ist dasselbe Objekt) und sichern. */
function setVr(mode, patch) {
  const app = mode.app;
  if (!app.opts.vr) app.opts.vr = {};
  Object.assign(app.opts.vr, patch);
  mode.savePrefs();
}

/**
 * Panel-Spec des Menüs.
 * @param {object} mode XrMode (app, closeMenu, refreshMenu, recenter, exit, diagOn, cinema)
 */
export function buildMenuSpec(mode) {
  const app = mode.app;
  const vr = app.opts.vr || {};
  const again = () => mode.refreshMenu();
  const rows = [
    { label: 'Ton', tag: onOff(app.sound), onSelect: () => { app.setSound(!app.sound); mode.savePrefs(); again(); } },
    { label: 'Drehen', tag: vr.turn === 'smooth' ? 'Weich' : 'Ruck 45°', onSelect: () => { setVr(mode, { turn: vr.turn === 'smooth' ? 'snap' : 'smooth' }); again(); } },
    { label: 'Vignette', tag: onOff(vr.vignette !== false), onSelect: () => { setVr(mode, { vignette: vr.vignette === false }); again(); } },
    { label: 'Größe', tag: vr.height === 'seated' ? 'Sitzend' : 'Automatisch', onSelect: () => { setVr(mode, { height: vr.height === 'seated' ? 'auto' : 'seated' }); mode.recenter(); again(); } },
    { label: 'Neu ausrichten', sub: 'Sitzhöhe neu kalibrieren', onSelect: () => { mode.recenter(); mode.toast('Neu ausgerichtet', 1600); } },
    { label: 'Qualität', tag: vr.quality === 'low' ? 'Niedrig' : 'Mittel', onSelect: () => { const q = vr.quality === 'low' ? 'mid' : 'low'; setVr(mode, { quality: q }); app.setQuality(q); again(); } },
    { label: 'Kassen-PC-Suche', onSelect: () => { mode.closeMenu(); app.openTerminal(''); } },
    { label: 'Diagnose', tag: onOff(mode.diagOn), onSelect: () => { mode.setDiag(!mode.diagOn); again(); } },
  ];
  let extra;
  try { extra = mode.cinema && typeof mode.cinema.menuItems === 'function' ? mode.cinema.menuItems() || [] : []; } catch { extra = []; }
  for (const it of extra) {
    if (!it || !it.label) continue;
    rows.push({ label: it.label, tag: it.tag, sub: it.sub, onSelect: () => { mode.closeMenu(); if (typeof it.onSelect === 'function') it.onSelect(); } });
  }
  return {
    title: 'VR-Menü',
    width: 0.9,
    list: { rows, visible: 7 },
    buttons: [
      { label: 'Weiter', primary: true, onSelect: () => mode.closeMenu() },
      { label: 'VR verlassen', onSelect: () => { mode.closeMenu(); mode.exit(); } },
    ],
    onClose: () => { mode.menuPanel = null; },
  };
}

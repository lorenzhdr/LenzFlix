// VIDEOTHEK LENZ · Pause-Menü (DOM im Host).
import { el } from './hud.js';

const QUALITY_LABEL = { auto: 'Auto', low: 'Niedrig', mid: 'Mittel', high: 'Hoch' };
const QUALITY_NEXT = { auto: 'low', low: 'mid', mid: 'high', high: 'auto' };

const SENS_LABEL = { low: 'Niedrig', normal: 'Normal', high: 'Hoch' };
const SENS_NEXT = { low: 'normal', normal: 'high', high: 'low' };
const PITCH_LABEL = { normal: 'Normal', tief: 'Tief', sehrtief: 'Sehr tief' };
const PITCH_NEXT = { normal: 'tief', tief: 'sehrtief', sehrtief: 'normal' };
const AUTO_DEVICE = 'Automatisch (Gerätestimme)';
const AUTO_ONLINE = 'Automatisch (Online bevorzugt)';
const NOTE_ONLINE = 'Online: Sätze, Name und Filmtitel gehen an den Stimmendienst des Browsers.';
const NOTE_TIP = 'Tipp: Männliche Online-Stimmen (z. B. „Natural“) gibt es in manchen Browsern (z. B. dem Windows-Standardbrowser); am iPhone unter Einstellungen → Bedienungshilfen → Gesprochene Inhalte → Stimmen → Deutsch weitere laden.';

/** Kurzname einer Browser-Stimme („Microsoft Conrad Online (Natural) - German (Germany)“ → „Conrad“). */
export function shortVoiceName(name) {
  const n = String(name || '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/^(Microsoft|Google|Apple)\s+/i, '')
    .replace(/\s+Online\s*$/i, '')
    .trim();
  return n || String(name || '');
}

/** Diagnosezeile zur Kassierer-Stimme (nur Zustand, nie Gesprochenes). */
export function voiceNote(info, wantOnline = false) {
  if (!info || !info.diag) return '';
  const d = String(info.diag);
  const name = info.voiceName || '';
  const warn = wantOnline && !info.online ? ' – keine Online-Stimme verfügbar, nutze Gerätestimme' : '';
  if (info.online) {
    const st = d === 'ok' ? '' : d === 'locked' ? ' – wartet auf ersten Tipp' : d === 'notStarted' ? ' – hat nicht gesprochen' : d.startsWith('error:') ? ` – Fehler (${d.slice(6)})` : '';
    return `Stimme: ${name}${st} · online: Sätze, Name und Titel gehen an den Stimmendienst des Browsers`;
  }
  if (d === 'ok') return `Stimme: ${name} (${info.lang || ''})${warn}`;
  if (d === 'locked') return 'Stimme: wartet auf ersten Tipp';
  if (d === 'notStarted') return `Stimme: ${name} – Gerät hat nicht gesprochen (Stummschalter?)`;
  if (d === 'noLocalDe') return 'Stimme: keine deutsche Gerätestimme – Einstellungen → Bedienungshilfen → Gesprochene Inhalte → Stimmen → Deutsch';
  if (d === 'novoices') return 'Stimme: keine Stimmen gefunden';
  if (d === 'unsupported') return 'Stimme: vom Browser nicht unterstützt';
  if (d.startsWith('error:')) return `Stimme: Fehler (${d.slice(6)})`;
  return '';
}

/**
 * @param {HTMLElement} host
 * @param {object} a { onResume, onVr?() / getVr?() → bool (VR-Modus-Eintrag nur wenn true), onSearch, onClassic, onQuality(q), onSound(on), onFps(on), onBigCovers(on), onTheme, onMenu(anchor), getQuality, getSound, getFps, getBigCovers,
 *   getVoiceInfo?() → { diag, voiceName, lang, onlineDe } | null (Diagnosezeile unter „Ton“, nur bei Ton an),
 *   onVoice?({ name?, online?, pitch? }) (Stimmwahl/Tonlage; spricht danach die Probe), getVoicePrefs?() → { name, online, pitch },
 *   getVoiceList?() → [{ name, lang, online, male }] (deutsche Stimmen),
 *   onTouchControl?(scheme) / getTouchControl?() → 'joystick' | 'touch' (nur Touch; fehlt = Knopf ausgeblendet),
 *   onTouchTune?({ holdInvertY?, holdInvertX?, lookInvertY?, lookInvertX?, touchSens? }) / getTouchTune?() → dieselben Felder (Menü „Touch-Steuerung“, nur Touch; Standard: nichts umgekehrt, 'normal'),
 *   onFullscreen?(), getFullscreen?() → bool, fullscreenKind?() → 'api' | 'guide' | 'none' (nur Touch; fehlt/none = Knopf ausgeblendet) }
 */
export function createPause(host, a) {
  const root = el('div', 'lfx-store-pause');
  root.hidden = true;
  const panel = el('div', 'lfx-store-pause-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Pause');
  const title = el('div', 'lfx-store-pause-title', 'Pause');
  panel.appendChild(title);
  const mk = (label, fn, cls = '') => {
    const b = el('button', `lfx-store-act ${cls}`.trim(), label);
    b.type = 'button';
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(b); });
    panel.appendChild(b);
    return b;
  };
  mk('Weiter', () => a.onResume(), 'lfx-store-act--primary');
  const vrb = mk('VR-Modus', () => { if (a.onVr) a.onVr(); }); // synchron im Klick (Nutzeraktivierung für requestSession)
  vrb.hidden = true;
  mk('Suche', () => a.onSearch());
  mk('Klassische Ansicht', () => a.onClassic());
  const q = mk('', () => {
    const next = QUALITY_NEXT[a.getQuality()] || 'auto';
    a.onQuality(next);
    refresh();
  });
  const s = mk('', () => { a.onSound(!a.getSound()); refresh(); });
  const vo = mk('', () => openPick());
  const note = el('div', 'lfx-store-pause-note');
  note.hidden = true;
  panel.appendChild(note);
  const f = mk('', () => { a.onFps(!a.getFps()); refresh(); });
  const bc = mk('', () => { a.onBigCovers(!a.getBigCovers()); refresh(); });
  const tc = mk('Touch-Steuerung …', () => openTouch());
  const fs = mk('', () => { if (a.onFullscreen) a.onFullscreen(); refresh(); }, 'lfx-store-act--fs');
  mk('Design wechseln', () => a.onTheme());
  mk('Menü', (b) => a.onMenu(b));
  // --- Stimmenauswahl (Panel über dem Pause-Menü) ---
  const pick = el('div', 'lfx-store-voicepick');
  pick.hidden = true;
  const pickPanel = el('div', 'lfx-store-voicepick-panel');
  pickPanel.setAttribute('role', 'dialog');
  pickPanel.setAttribute('aria-label', 'Stimme');
  pickPanel.appendChild(el('div', 'lfx-store-pause-title', 'Stimme'));
  const list = el('div', 'lfx-store-voicelist');
  const pitchBtn = el('button', 'lfx-store-act lfx-store-voicepitch');
  pitchBtn.type = 'button';
  const pickNote = el('div', 'lfx-store-pause-note lfx-store-voicepick-note');
  const doneBtn = el('button', 'lfx-store-act lfx-store-act--primary', 'Fertig');
  doneBtn.type = 'button';
  pickPanel.append(list, pitchBtn, pickNote, doneBtn);
  pick.appendChild(pickPanel);
  const prefsNow = () => (a.getVoicePrefs && a.getVoicePrefs()) || { name: '', online: false, pitch: 'tief' };
  const voicesNow = () => { try { return (a.getVoiceList && a.getVoiceList()) || []; } catch { return []; } };
  /** Aktive Auswahl: Eintrag mit exakt gewähltem Namen, sonst „Automatisch“. */
  const selectedVoice = (pr, voices) => (pr.name ? voices.find((v) => v.name === pr.name) || null : null);
  function entry(label, on, fn) {
    const b = el('button', 'lfx-store-act lfx-store-voiceitem', label);
    b.type = 'button';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.classList.toggle('is-on', on);
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); renderPick(); }); // synchron: Probe zählt als Nutzergeste
    return b;
  }
  function renderPick() {
    const pr = prefsNow();
    const voices = voicesNow();
    const sel = selectedVoice(pr, voices);
    list.textContent = '';
    list.appendChild(entry(AUTO_DEVICE, !sel && !pr.online, () => a.onVoice({ name: '', online: false })));
    list.appendChild(entry(AUTO_ONLINE, !sel && !!pr.online, () => a.onVoice({ name: '', online: true })));
    for (const v of voices) {
      list.appendChild(entry(`${shortVoiceName(v.name)}${v.online ? ' · online' : ''}`, !!sel && sel.name === v.name, () => a.onVoice({ name: v.name })));
    }
    if (!voices.length) list.appendChild(el('div', 'lfx-store-pause-note', 'Keine deutschen Stimmen gefunden'));
    pitchBtn.textContent = `Tonlage: ${PITCH_LABEL[pr.pitch] || PITCH_LABEL.tief}`;
    const info = a.getVoiceInfo ? a.getVoiceInfo() : null;
    const usesOnline = sel ? sel.online : !!pr.online && !!(info && info.online);
    const lines = [];
    if (usesOnline) lines.push(NOTE_ONLINE);
    if (!voices.some((v) => v.male)) lines.push(NOTE_TIP);
    pickNote.textContent = lines.join(' ');
    pickNote.hidden = !lines.length;
    refresh();
  }
  pitchBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    a.onVoice({ pitch: PITCH_NEXT[prefsNow().pitch] || 'sehrtief' });
    renderPick();
  });
  function openPick() {
    renderPick();
    pick.hidden = false;
    const on = list.querySelector('[aria-pressed="true"]') || list.querySelector('button');
    if (on) { try { on.focus({ preventScroll: true }); } catch { /* egal */ } }
  }
  function closePick() {
    if (pick.hidden) return;
    pick.hidden = true;
    try { vo.focus({ preventScroll: true }); } catch { /* egal */ }
  }
  doneBtn.addEventListener('click', (e) => { e.stopPropagation(); closePick(); });
  pick.addEventListener('click', (e) => { if (e.target === pick) { e.stopPropagation(); closePick(); } });

  // --- Touch-Steuerung (Panel über dem Pause-Menü, nur Touch) ---
  const tp = el('div', 'lfx-store-voicepick lfx-store-touchpick');
  tp.hidden = true;
  const tpPanel = el('div', 'lfx-store-voicepick-panel');
  tpPanel.setAttribute('role', 'dialog');
  tpPanel.setAttribute('aria-label', 'Touch-Steuerung');
  tpPanel.appendChild(el('div', 'lfx-store-pause-title', 'Touch-Steuerung'));
  const tuneNow = () => (a.getTouchTune && a.getTouchTune()) || {};
  const mkT = (fn) => {
    const b = el('button', 'lfx-store-act');
    b.type = 'button';
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); refreshTouch(); });
    tpPanel.appendChild(b);
    return b;
  };
  const tSchemeB = mkT(() => { if (a.onTouchControl) a.onTouchControl(a.getTouchControl && a.getTouchControl() === 'touch' ? 'joystick' : 'touch'); });
  const flag = (key) => () => { if (a.onTouchTune) a.onTouchTune({ [key]: !tuneNow()[key] }); };
  const tHoldY = mkT(flag('holdInvertY'));
  const tHoldX = mkT(flag('holdInvertX'));
  const tLookY = mkT(flag('lookInvertY'));
  const tLookX = mkT(flag('lookInvertX'));
  const tSens = mkT(() => { if (a.onTouchTune) a.onTouchTune({ touchSens: SENS_NEXT[tuneNow().touchSens] || 'normal' }); });
  const tBack = el('button', 'lfx-store-act lfx-store-act--primary', 'Zurück');
  tBack.type = 'button';
  tBack.addEventListener('click', (e) => { e.stopPropagation(); closeTouch(); });
  tpPanel.appendChild(tBack);
  tp.appendChild(tpPanel);
  function refreshTouch() {
    const t = tuneNow();
    const nr = (on) => (on ? 'Umgekehrt' : 'Normal');
    tSchemeB.textContent = `Steuerung: ${a.getTouchControl && a.getTouchControl() === 'touch' ? 'Touch' : 'Joystick'}`;
    tHoldY.textContent = `Cover kippen: ${nr(t.holdInvertY)}`;
    tHoldX.textContent = `Cover drehen: ${nr(t.holdInvertX)}`;
    tLookY.textContent = `Umschauen hoch/runter: ${nr(t.lookInvertY)}`;
    tLookX.textContent = `Umschauen links/rechts: ${nr(t.lookInvertX)}`;
    tSens.textContent = `Empfindlichkeit: ${SENS_LABEL[t.touchSens] || SENS_LABEL.normal}`;
  }
  function openTouch() {
    refreshTouch();
    tp.hidden = false;
    try { tSchemeB.focus({ preventScroll: true }); } catch { /* egal */ }
  }
  function closeTouch() {
    if (tp.hidden) return;
    tp.hidden = true;
    try { tc.focus({ preventScroll: true }); } catch { /* egal */ }
  }
  tp.addEventListener('click', (e) => { if (e.target === tp) { e.stopPropagation(); closeTouch(); } });

  function refresh() {
    vrb.hidden = !(a.getVr && a.getVr());
    q.textContent = `Qualität: ${QUALITY_LABEL[a.getQuality()] || 'Auto'}`;
    s.textContent = `Ton: ${a.getSound() ? 'An' : 'Aus'}`;
    f.textContent = `FPS-Anzeige: ${a.getFps() ? 'An' : 'Aus'}`;
    bc.textContent = `Hüllen: ${a.getBigCovers() ? 'Groß' : 'Normal'}`;
    tc.hidden = !a.onTouchControl && !a.onTouchTune;
    if (!tp.hidden) refreshTouch();
    const pr = prefsNow();
    const wantOnline = !!pr.online;
    vo.hidden = !a.onVoice || !a.getSound();
    const chosen = pr.name ? voicesNow().find((v) => v.name === pr.name) : null;
    vo.textContent = `Stimme: ${chosen ? shortVoiceName(chosen.name) : 'Automatisch'}`;
    const vt = a.getSound() ? voiceNote(a.getVoiceInfo ? a.getVoiceInfo() : null, wantOnline) : '';
    note.textContent = vt;
    note.hidden = !vt;
    const fk = a.fullscreenKind ? a.fullscreenKind() : 'none';
    fs.hidden = fk !== 'api' && fk !== 'guide';
    fs.textContent = fk === 'guide' ? 'Vollbild …' : `Vollbild: ${a.getFullscreen && a.getFullscreen() ? 'An' : 'Aus'}`;
  }
  root.appendChild(panel);
  root.appendChild(pick);
  root.appendChild(tp);
  root.addEventListener('click', (e) => { if (e.target === root) a.onResume(); });

  host.appendChild(root);
  refresh();
  let focusBack = null;
  return {
    root,
    get visible() { return !root.hidden; },
    get pickOpen() { return !pick.hidden || !tp.hidden; },
    get touchOpen() { return !tp.hidden; },
    closePick() { closePick(); closeTouch(); },
    show() {
      pick.hidden = true;
      tp.hidden = true;
      refresh();
      focusBack = document.activeElement;
      root.hidden = false;
      const first = panel.querySelector('button');
      if (first) { try { first.focus({ preventScroll: true }); } catch { /* egal */ } }
    },
    hide() {
      root.hidden = true;
      pick.hidden = true;
      tp.hidden = true;
      if (focusBack && typeof focusBack.focus === 'function') { try { focusBack.focus({ preventScroll: true }); } catch { /* egal */ } }
      focusBack = null;
    },
    refresh() { refresh(); if (!pick.hidden) renderPick(); },
    destroy() { root.remove(); },
  };
}

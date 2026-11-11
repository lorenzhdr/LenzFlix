// VIDEOTHEK LENZ · Stimme des Kassierers (Web Speech API). Hilfsdatei, KEIN Modul der Registry.
// Datenschutz: Standardmäßig nur Stimmen mit localService === true, damit Nutzername und Filmtitel nie an Dritte gehen.
// Online-Stimmen (z. B. „Natural“-Stimmen des Browsers) nur, wenn der Nutzer sie im Pause-Menü ausdrücklich einschaltet.
// Text wird nie geloggt.

const MALE = ['markus', 'martin', 'stefan', 'conrad', 'killian', 'florian', 'yannick', 'viktor', 'jonas'];
const NOVELTY = ['eddy', 'reed', 'rocko', 'grandpa', 'eloquence'];

const isDe = (v) => /^de([-_]|$)/i.test(String((v && v.lang) || ''));
const isDeDE = (v) => /^de[-_]de$/i.test(String((v && v.lang) || ''));
const nameOf = (v) => String((v && v.name) || '').toLowerCase();

/**
 * Beste deutsche Stimme. opts.online: zuerst Online-Stimmen (männliche „Natural“ > andere „Natural“ > übrige, pitch 1.0,
 * Ergebnis mit online: true); sonst bzw. ohne Online-Stimme die beste lokale: männlich zuerst (pitch 1.0), sonst irgendeine
 * lokale deutsche mit pitch 0.8, sonst null.
 */
export function pickVoice(voices, opts = {}) {
  const all = Array.from(voices || []).filter((v) => v && isDe(v));
  if (opts.name) { // ausdrücklich gewählte Stimme (exakter Name), unabhängig von Gerät/Online
    const f = all.find((v) => v.name === opts.name);
    if (f) return { voice: f, pitch: 1.0, online: f.localService !== true };
  }
  if (opts.online) {
    const onl = all.filter((v) => v.localService !== true);
    if (onl.length) {
      const rank = (v) => {
        const n = nameOf(v);
        const nat = n.includes('natural') ? 0 : 1;
        const male = MALE.some((m) => n.includes(m)) ? 0 : 1;
        return nat * 4 + male * 2 + (isDeDE(v) ? 0 : 1);
      };
      const best = onl.map((v, i) => ({ v, r: rank(v), i })).sort((a, b) => a.r - b.r || a.i - b.i)[0].v;
      return { voice: best, pitch: 1.0, online: true };
    }
  }
  const list = all.filter((v) => v.localService === true);
  if (!list.length) return null;
  const key = (v) => {
    const n = nameOf(v);
    const mi = MALE.findIndex((m) => n.includes(m));
    if (mi < 0) return null;
    return [NOVELTY.some((x) => n.includes(x)) ? 1 : 0, isDeDE(v) ? 0 : 1, mi];
  };
  const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  const males = list.map((v) => ({ v, k: key(v) })).filter((e) => e.k).sort((p, q) => cmp(p.k, q.k));
  if (males.length) return { voice: males[0].v, pitch: 1.0 };
  return { voice: list.find(isDeDE) || list[0], pitch: 0.8 };
}

/** Tonlagen-Faktoren (mit dem Grund-pitch aus pickVoice multipliziert, Ergebnis auf [0.5, 2] begrenzt). */
export const PITCH_FACTOR = { normal: 1.0, tief: 0.8, sehrtief: 0.65 };
const clampPitch = (x) => Math.max(0.5, Math.min(2, x));

/** Alle deutschen Stimmen: [{ name, lang, online, male }], männliche zuerst, Gerät vor Online, dann nach Name. */
export function listVoices(voices) {
  return Array.from(voices || []).filter((v) => v && isDe(v)).map((v) => ({
    name: String(v.name || ''), lang: String(v.lang || ''), online: v.localService !== true, male: MALE.some((m) => nameOf(v).includes(m)),
  })).sort((a, b) => (a.male ? 0 : 1) - (b.male ? 0 : 1) || (a.online ? 1 : 0) - (b.online ? 1 : 0) || a.name.localeCompare(b.name, 'de'));
}

const START_WAIT = 2000; // so lange darf onstart ausbleiben, bevor „notStarted“ gilt / ein neuer Freischalt-Versuch erlaubt ist
const PENDING_MAX = 15000;

/**
 * Stimme des Kassierers. Freischaltung (iOS/Safari): Sprechen klappt erst nach einer ECHTEN Nutzeraktivierung
 * (touchend/click/keydown; pointerdown und Escape zählen nicht). `unlocked` wird erst wahr, wenn onstart einer Äußerung
 * tatsächlich gefeuert hat; bis dahin versucht jede weitere Geste es erneut.
 */
export function createVoice({ soundOn = () => true, online = () => false, prefer, synth, Utterance } = {}) {
  const S = synth !== undefined ? synth : (typeof window !== 'undefined' ? window.speechSynthesis : null);
  const U = Utterance !== undefined ? Utterance : (typeof window !== 'undefined' ? window.SpeechSynthesisUtterance : null);
  let picked = null;
  let current = null; // Referenz gegen den Chrome-GC-Bug
  let unlockUtt = null; // dito für die Freischalt-Äußerung
  let speaking = false;
  let finish = null;
  let disposed = false;
  let timer = 0;
  let safety = 0;
  let startWatch = 0;
  let reload = 0;
  let reloads = 0;
  let unlocked = false;
  let unlockTry = 0;
  let notStarted = false;
  let lastError = '';
  let pending = null; // { text, volume, at, onBegin, onEnd }: wartende Zeile, wird in der Geste als Freischaltung gesprochen
  const gestureEvents = ['touchend', 'click', 'keydown']; // KEIN pointerdown: auf iOS keine Nutzeraktivierung

  // prefer() → { online, name, pitchFactor }; ohne prefer gilt nur online()
  const prefs = () => {
    let p;
    try { p = prefer ? prefer() : null; } catch { p = null; }
    return { online: p && p.online !== undefined ? !!p.online : !!online(), name: (p && p.name) || '', pf: p && Number.isFinite(p.pitchFactor) ? p.pitchFactor : 1 };
  };
  const refresh = () => {
    if (!S || picked) return;
    try { const p = prefs(); picked = pickVoice(S.getVoices ? S.getVoices() : [], { online: p.online, name: p.name }); } catch { picked = null; }
  };
  const onVoices = () => refresh();

  if (S && U) {
    refresh();
    try { if (S.addEventListener) S.addEventListener('voiceschanged', onVoices); } catch { /* egal */ }
    if (!picked) {
      reload = setInterval(() => {
        reloads++;
        refresh();
        if (picked || reloads >= 5 || disposed) { clearInterval(reload); reload = 0; }
      }, 500);
    }
  }

  const settle = () => {
    speaking = false;
    clearTimeout(safety); safety = 0;
    const f = finish; finish = null;
    if (f) f();
  };

  function removeGestures() {
    for (const ev of gestureEvents) document.removeEventListener(ev, onGesture, { capture: true });
  }
  function started() {
    clearTimeout(startWatch); startWatch = 0;
    notStarted = false;
    lastError = '';
    if (unlockUtt) unlockUtt = null;
    if (!unlocked) { unlocked = true; removeGestures(); }
  }
  function noteError(e) {
    const code = e && typeof e.error === 'string' ? e.error : '';
    if (code && code !== 'canceled' && code !== 'interrupted') lastError = code;
  }
  function watchStart() {
    clearTimeout(startWatch);
    startWatch = setTimeout(() => { startWatch = 0; if (!disposed) { notStarted = true; unlockUtt = null; } }, START_WAIT);
  }
  function mkUtt(str, volume) {
    const u = new U(str);
    u.voice = picked.voice;
    u.lang = picked.voice.lang || 'de-DE';
    u.rate = 1.0;
    u.pitch = clampPitch(picked.pitch * prefs().pf);
    u.volume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1));
    return u;
  }

  /** Sofort sprechen (synchron im Kontext des Aufrufers). */
  function begin(str, volume) {
    try {
      const u = mkUtt(str, volume);
      current = u;
      const done = () => { if (current === u) { current = null; settle(); } };
      u.onstart = () => { if (current === u) speaking = true; started(); };
      u.onend = done;
      u.onerror = (e) => { noteError(e); done(); };
      speaking = true;
      safety = setTimeout(() => { if (current === u) { current = null; settle(); } }, str.length * 90 + 1500);
      watchStart();
      S.speak(u);
    } catch { current = null; settle(); }
  }

  function say(text, { volume = 1 } = {}) {
    if (disposed || !S || !U) return Promise.resolve();
    refresh();
    if (!picked) return Promise.resolve();
    const str = String(text || '');
    if (!str.trim()) return Promise.resolve();
    if (!current && !timer && !speaking) {
      // Leerlauf: synchron sprechen (Geste bleibt erhalten; cancel()+speak im selben Tick verliert Äußerungen)
      pending = null;
      return new Promise((resolve) => { finish = resolve; begin(str, volume); });
    }
    cancel();
    return new Promise((resolve) => {
      finish = resolve;
      timer = setTimeout(() => { // Chrome-Quirk: nach cancel() einen Tick warten
        timer = 0;
        if (disposed) { settle(); return; }
        begin(str, volume);
      }, 0);
    });
  }

  /** Probezeile (z. B. nach Stimmwahl): wie say, im Leerlauf synchron (Nutzergeste). */
  function preview(text, opts) { return say(text, opts); }

  function cancel() {
    clearTimeout(timer); timer = 0;
    clearTimeout(startWatch); startWatch = 0;
    pending = null;
    current = null;
    try { if (S && S.cancel) S.cancel(); } catch { /* egal */ }
    settle();
  }

  /** Zeile merken, solange noch nicht freigeschaltet: wird bei der nächsten Geste synchron gesprochen (= Freischaltung). */
  function setPending(text, { volume = 1, onBegin, onEnd } = {}) {
    if (disposed || unlocked) return;
    pending = { text: String(text || ''), volume, at: Date.now(), onBegin, onEnd };
  }
  function clearPending() { pending = null; }

  function onGesture(e) {
    if (unlocked || disposed || !soundOn() || !S || !U) return;
    if (e && e.type === 'keydown' && (e.key === 'Escape' || e.code === 'Escape')) return;
    const t = Date.now();
    if (unlockTry && t - unlockTry < START_WAIT) return; // Freischalt-Äußerung läuft noch
    refresh();
    if (!picked) return; // ohne Stimme nie als freigeschaltet markieren
    unlockTry = t;
    const w = pending;
    if (w && t - w.at < PENDING_MAX && w.text.trim() && !current && !timer && !speaking) {
      pending = null;
      finish = () => { if (w.onEnd) { try { w.onEnd(); } catch { /* egal */ } } };
      if (w.onBegin) { try { w.onBegin(); } catch { /* egal */ } }
      begin(w.text, w.volume);
      return;
    }
    try {
      const u = mkUtt(' ', 0.01);
      unlockUtt = u;
      u.onstart = () => started();
      u.onerror = (ev) => noteError(ev);
      watchStart();
      S.speak(u);
    } catch { /* egal */ }
  }
  function unlock() {
    if (unlocked || disposed || !S || !U) return;
    for (const ev of gestureEvents) document.addEventListener(ev, onGesture, { capture: true, passive: true });
  }

  function dispose() {
    if (disposed) return;
    cancel();
    disposed = true;
    removeGestures();
    clearInterval(reload); reload = 0;
    try { if (S && S.removeEventListener) S.removeEventListener('voiceschanged', onVoices); } catch { /* egal */ }
  }

  const allVoices = () => { try { return Array.from((S && S.getVoices && S.getVoices()) || []); } catch { return []; } };

  return {
    say, preview, cancel, unlock, dispose, setPending, clearPending,
    /** Deutsche Stimmen des Geräts/Browsers (siehe listVoices). */
    listVoices() { return listVoices(allVoices()); },
    /** Stimme neu wählen (z. B. nach Umschalten Gerät/Online). */
    reselect() { picked = null; lastError = ''; notStarted = false; refresh(); },
    /** Gewählte Stimme ist eine Online-Stimme. */
    get online() { return !!(picked && picked.online); },
    get unlocked() { return unlocked; },
    get speaking() { return speaking; },
    get voiceName() { refresh(); return picked ? picked.voice.name : ''; },
    get lang() { return picked ? String(picked.voice.lang || '') : ''; },
    /** Anzahl deutscher Nicht-Lokal-Stimmen (werden aus Datenschutzgründen nicht benutzt). */
    get onlineDe() { return allVoices().filter((v) => v && isDe(v) && v.localService !== true).length; },
    /** 'unsupported' | 'novoices' | 'noLocalDe' | 'error:<code>' | 'notStarted' | 'locked' | 'ok' */
    get diag() {
      if (!S || !U) return 'unsupported';
      refresh();
      if (!picked) return allVoices().length ? 'noLocalDe' : 'novoices';
      if (lastError) return `error:${lastError}`;
      if (notStarted) return 'notStarted';
      if (!unlocked) return 'locked';
      return 'ok';
    },
  };
}

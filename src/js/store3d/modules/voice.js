// VIDEOTHEK LENZ · Stimme des Kassierers (Web Speech API, nur lokale Gerätestimmen). Hilfsdatei, KEIN Modul der Registry.
// Datenschutz: Es werden ausschließlich Stimmen mit localService === true benutzt, damit Nutzername und Filmtitel nie
// an Dritte gesendet werden. Text wird nie geloggt.

const MALE = ['markus', 'martin', 'stefan', 'conrad', 'killian', 'florian', 'yannick', 'viktor', 'jonas'];
const NOVELTY = ['eddy', 'reed', 'rocko', 'grandpa', 'eloquence'];

const isDe = (v) => /^de([-_]|$)/i.test(String((v && v.lang) || ''));
const isDeDE = (v) => /^de[-_]de$/i.test(String((v && v.lang) || ''));
const nameOf = (v) => String((v && v.name) || '').toLowerCase();

/** Beste lokale deutsche Stimme: männlich zuerst (pitch 1.0), sonst irgendeine lokale deutsche mit pitch 0.8, sonst null. */
export function pickVoice(voices) {
  const list = Array.from(voices || []).filter((v) => v && v.localService === true && isDe(v));
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

export function createVoice({ soundOn = () => true, synth, Utterance } = {}) {
  const S = synth !== undefined ? synth : (typeof window !== 'undefined' ? window.speechSynthesis : null);
  const U = Utterance !== undefined ? Utterance : (typeof window !== 'undefined' ? window.SpeechSynthesisUtterance : null);
  let picked = null;
  let current = null; // Referenz gegen den Chrome-GC-Bug
  let speaking = false;
  let finish = null;
  let disposed = false;
  let timer = 0;
  let safety = 0;
  let reload = 0;
  let reloads = 0;
  let unlocked = false;
  const unlockFns = new Set();
  const gestureEvents = ['pointerdown', 'keydown', 'touchend', 'click'];

  const refresh = () => {
    if (!S || picked) return;
    try { picked = pickVoice(S.getVoices ? S.getVoices() : []); } catch { picked = null; }
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

  function say(text, { volume = 1 } = {}) {
    if (disposed || !S || !U) return Promise.resolve();
    refresh();
    if (!picked) return Promise.resolve();
    const str = String(text || '');
    if (!str.trim()) return Promise.resolve();
    cancel();
    return new Promise((resolve) => {
      finish = resolve;
      timer = setTimeout(() => {
        timer = 0;
        if (disposed) { settle(); return; }
        let u;
        try {
          u = new U(str);
          u.voice = picked.voice;
          u.lang = picked.voice.lang || 'de-DE';
          u.rate = 1.0;
          u.pitch = picked.pitch;
          u.volume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1));
          current = u;
          const done = () => { if (current === u) { current = null; settle(); } };
          u.onstart = () => { if (current === u) speaking = true; };
          u.onend = done;
          u.onerror = done;
          speaking = true;
          safety = setTimeout(() => { if (current === u) { current = null; settle(); } }, str.length * 90 + 1500);
          S.speak(u);
        } catch { current = null; settle(); }
      }, 0);
    });
  }

  function cancel() {
    clearTimeout(timer); timer = 0;
    current = null;
    try { if (S && S.cancel) S.cancel(); } catch { /* egal */ }
    settle();
  }

  const onGesture = () => {
    if (unlocked || !soundOn()) return; // erst bei eingeschaltetem Ton verbrauchen
    unlocked = true;
    removeGestures();
    if (!S || !U) return;
    refresh();
    if (!picked) return;
    try {
      const u = new U(' ');
      u.volume = 0;
      u.voice = picked.voice;
      u.lang = picked.voice.lang || 'de-DE';
      S.speak(u);
    } catch { /* egal */ }
    // Wartende Zeilen erst NACH der (synchronen) Freischalt-Äußerung starten
    for (const fn of [...unlockFns]) { try { fn(); } catch { /* egal */ } }
    unlockFns.clear();
  };
  function removeGestures() {
    for (const ev of gestureEvents) document.removeEventListener(ev, onGesture, { capture: true });
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
    unlockFns.clear();
    clearInterval(reload); reload = 0;
    try { if (S && S.removeEventListener) S.removeEventListener('voiceschanged', onVoices); } catch { /* egal */ }
  }

  return {
    say, cancel, unlock, dispose,
    /** fn() wird einmal nach der ersten Freischalt-Geste aufgerufen → remover. */
    onUnlock(fn) { if (unlocked || disposed) return () => {}; unlockFns.add(fn); return () => unlockFns.delete(fn); },
    get unlocked() { return unlocked; },
    get speaking() { return speaking; },
    get voiceName() { return picked ? picked.voice.name : ''; },
  };
}

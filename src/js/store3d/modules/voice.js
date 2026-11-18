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

/**
 * Stimme je Seed (Personen, 1.17.0): stabile Wahl aus den deutschen Stimmen (lokal; mit opts.online auch Online-Stimmen),
 * nach Name sortiert. Ohne passende Stimme null. Grund-pitch 1.0; die Äußerung stellt pitch/rate selbst.
 */
export function pickVoiceSeeded(voices, seed, opts = {}) {
  const all = Array.from(voices || []).filter((v) => v && isDe(v));
  const list = (opts.online ? all : all.filter((v) => v.localService === true)).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de') || 0);
  if (!list.length) return null;
  const v = list[seedHash(seed) % list.length];
  return { voice: v, pitch: 1.0, online: v.localService !== true };
}

/** Seed → nichtnegative Ganzzahl: Zahlen bleiben (abs, floor), Texte (z. B. 'gabi-haarscharf') werden per FNV-1a gehasht. */
export function seedHash(seed) {
  const n = Number(seed);
  if (typeof seed !== 'string' && Number.isFinite(n)) return Math.abs(Math.floor(n));
  if (typeof seed === 'string' && seed.trim() !== '' && Number.isFinite(n)) return Math.abs(Math.floor(n));
  let h = 0x811c9dc5;
  const str = String(seed === undefined || seed === null ? '' : seed);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/**
 * Stimmfärbung je Seed (rein, deterministisch): { pitch 0.7..1.4, rate 0.85..1.15 }. Bei wenigen Stimmen (nVoices < 4) volle
 * Spreizung, damit Personen trotzdem verschieden klingen; bei vielen Stimmen enger (die Stimme selbst unterscheidet schon).
 */
export function voiceFor(seed, nVoices = 1) {
  const h = seedHash(seed);
  const a = ((Math.imul(h, 2654435761) >>> 0) % 1000) / 999; // 0..1
  const b = ((Math.imul(h ^ 0x9e3779b9, 2246822519) >>> 0) % 1000) / 999;
  const wide = !(nVoices >= 4);
  const pLo = wide ? 0.7 : 0.9;
  const pHi = wide ? 1.4 : 1.15;
  const rLo = wide ? 0.85 : 0.92;
  const rHi = wide ? 1.15 : 1.08;
  const r2 = (x) => Math.round(x * 100) / 100;
  return { pitch: r2(pLo + a * (pHi - pLo)), rate: r2(rLo + b * (rHi - rLo)) };
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
  const seeded = new Map(); // voiceSeed → gewählte Personenstimme
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
  /** Stimme für eine Äußerung: mit voiceSeed die Personenstimme (gecacht), sonst die Hauptstimme. */
  function pickFor(ex) {
    if (!ex || ex.voiceSeed === undefined || ex.voiceSeed === null) return picked;
    const k = typeof ex.voiceSeed === 'string' ? ex.voiceSeed : seedHash(ex.voiceSeed);
    if (seeded.has(k)) return seeded.get(k);
    let r;
    try { r = pickVoiceSeeded(S.getVoices ? S.getVoices() : [], k, { online: prefs().online }); } catch { r = null; }
    r = r || picked;
    if (r) r = { ...r, nVoices: seedVoiceCount() };
    seeded.set(k, r);
    return r;
  }
  function seedVoiceCount() {
    try { const o = prefs().online; return Array.from((S.getVoices ? S.getVoices() : []) || []).filter((v) => v && isDe(v) && (o || v.localService === true)).length; } catch { return 1; }
  }
  function mkUtt(str, volume, ex) {
    const u = new U(str);
    const pk = pickFor(ex) || picked;
    u.voice = pk.voice;
    u.lang = pk.voice.lang || 'de-DE';
    const seededEx = !!ex && ex.voiceSeed !== undefined && ex.voiceSeed !== null;
    const vf = seededEx ? voiceFor(ex.voiceSeed, pk.nVoices || 1) : null; // Personen ohne eigene Werte: Färbung aus dem Seed
    u.rate = ex && Number.isFinite(ex.rate) ? Math.max(0.5, Math.min(2, ex.rate)) : (vf ? vf.rate : 1.0);
    // Personen: pitch ist absolut (Personenstimme hat Grund-pitch 1.0); Hauptstimme: Grund-pitch × Pref-Faktor
    u.pitch = ex && ex.voiceSeed !== undefined && ex.voiceSeed !== null
      ? clampPitch((Number.isFinite(ex.pitch) ? ex.pitch : vf.pitch) * pk.pitch)
      : clampPitch(picked.pitch * prefs().pf * (ex && Number.isFinite(ex.pitch) ? ex.pitch : 1));
    u.volume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1));
    return u;
  }

  /** Sofort sprechen (synchron im Kontext des Aufrufers). */
  function begin(str, volume, ex) {
    try {
      const u = mkUtt(str, volume, ex);
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

  /** opts: { volume, voiceSeed?, pitch?, rate? } – die letzten drei nur für Personenstimmen (Sprecher-Regie). */
  function say(text, opts = {}) {
    const { volume = 1 } = opts;
    const ex = opts.voiceSeed !== undefined || opts.pitch !== undefined || opts.rate !== undefined ? opts : null;
    if (disposed || !S || !U) return Promise.resolve();
    refresh();
    if (!picked) return Promise.resolve();
    const str = String(text || '');
    if (!str.trim()) return Promise.resolve();
    if (!current && !timer && !speaking) {
      // Leerlauf: synchron sprechen (Geste bleibt erhalten; cancel()+speak im selben Tick verliert Äußerungen)
      pending = null;
      return new Promise((resolve) => { finish = resolve; begin(str, volume, ex); });
    }
    cancel();
    return new Promise((resolve) => {
      finish = resolve;
      timer = setTimeout(() => { // Chrome-Quirk: nach cancel() einen Tick warten
        timer = 0;
        if (disposed) { settle(); return; }
        begin(str, volume, ex);
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

  /** Wie eine Nutzergeste: sofort freischalten (synchron aus einem Klick-Handler, z. B. „In VR betreten“). */
  function unlockNow() {
    if (unlocked || disposed) return;
    unlock();
    onGesture({ type: 'click' });
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
    say, preview, cancel, unlock, unlockNow, dispose, setPending, clearPending,
    /** Deutsche Stimmen des Geräts/Browsers (siehe listVoices). */
    listVoices() { return listVoices(allVoices()); },
    /** Stimme neu wählen (z. B. nach Umschalten Gerät/Online). */
    reselect() { picked = null; seeded.clear(); lastError = ''; notStarted = false; refresh(); },
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

export const RICHARD_PRIO = 100;
export const SPEAK_DIST = 10;
const SEEN_MS = 30000; // so lange zählt ein Sprecher als „in der Nähe bekannt“ (Wahl der nächsten Person)

/**
 * Sprecher-Regie (1.17.0, Vertrag §5): wer darf gerade laut sprechen? Ein Gerät, eine Stimme.
 * speaker({ id, voiceSeed, pitch, rate, prio, pos: () => ({x,y,z}) }) → { say(text, { volume? }) → Promise<'spoken'|'bubble'|'muted'>, cancel(), release() }
 *   'spoken' = gesprochen · 'bubble' = nicht laut, der Aufrufer zeigt eine Blase · 'muted' = Ton aus (der Aufrufer zeigt ebenfalls die Blase)
 * Regeln: Richard (prio ≥ 100) hat Vorrang und unterbricht; sonst spricht nur die nächste Person bis 10 m, alle anderen bekommen 'bubble'.
 * Läuft schon eine Rede, wartet höchstens eine Zeile (die neuere nähere/höhere ersetzt die wartende); statt hartem cancel() läuft
 * die Warteschlange (Chrome verliert sonst Zeilen). Text wird nie geloggt.
 * deps: voice (createVoice), soundOn(), listener() → {x,y,z}|null (Spielerpose), now() → ms.
 */
export function createDirector({ voice, soundOn = () => true, listener = () => null, now = () => Date.now(), maxDist = SPEAK_DIST } = {}) {
  const reg = new Map(); // id → { sp, seen }
  let cur = null; // { sp, text, opts, prio, resolve, preempted }
  let queued = null;
  let disposed = false;
  let seq = 0;

  const distOf = (sp) => {
    let a;
    let b;
    try { a = listener(); b = sp.pos ? sp.pos() : null; } catch { return Infinity; }
    if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) return Infinity;
    return Math.hypot(a.x - b.x, (a.z || 0) - (b.z || 0));
  };
  const voiceOk = () => {
    if (!voice) return false;
    const dg = voice.diag;
    return dg !== 'unsupported' && dg !== 'novoices' && dg !== 'noLocalDe';
  };
  const volumeFor = (dist, vol) => {
    const v = Number.isFinite(vol) ? vol : 1;
    const f = dist < 3 ? 1 : 1 - ((Math.min(dist, maxDist) - 3) / (maxDist - 3)) * 0.5;
    return Math.max(0, Math.min(1, v * f));
  };
  /** Ist `sp` die nächste kürzlich aktive Person (≤ maxDist)? Gleichstand: der zuerst eingetragene. */
  const isNearest = (sp, dist) => {
    const t = now();
    for (const [id, r] of reg) {
      if (r.sp === sp || r.sp.prio >= RICHARD_PRIO) continue;
      if (t - r.seen > SEEN_MS) { reg.delete(id); continue; }
      if (distOf(r.sp) < dist) return false;
    }
    return true;
  };

  function run(entry) {
    cur = entry;
    const o = { volume: entry.volume };
    if (entry.sp.voiceSeed !== undefined) o.voiceSeed = entry.sp.voiceSeed;
    if (Number.isFinite(entry.sp.pitch)) o.pitch = entry.sp.pitch;
    if (Number.isFinite(entry.sp.rate)) o.rate = entry.sp.rate;
    let p;
    try { p = voice.say(entry.text, o); } catch { p = Promise.resolve(); }
    Promise.resolve(p).then(() => {
      if (cur === entry) { cur = null; entry.resolve(entry.preempted ? 'bubble' : 'spoken'); next(); } else entry.resolve('bubble');
    });
  }
  function next() {
    const q = queued;
    queued = null;
    if (!q || disposed || cur) { if (q) q.resolve('bubble'); return; }
    if (!soundOn()) { q.resolve('muted'); return; }
    const d = distOf(q.sp);
    if (d > maxDist || !voiceOk()) { q.resolve('bubble'); return; }
    q.volume = volumeFor(d, q.opts.volume);
    run(q);
  }

  function speaker(opts = {}) {
    const sp = {
      id: opts.id !== undefined ? opts.id : `s${++seq}`,
      voiceSeed: opts.voiceSeed,
      pitch: opts.pitch,
      rate: opts.rate,
      prio: Number.isFinite(opts.prio) ? opts.prio : 0,
      pos: typeof opts.pos === 'function' ? opts.pos : null,
    };
    const richard = () => sp.prio >= RICHARD_PRIO;
    return {
      say(text, o = {}) {
        const str = String(text || '');
        if (disposed || !soundOn()) return Promise.resolve('muted');
        if (!str.trim()) return Promise.resolve('bubble');
        const rec = reg.get(sp.id);
        if (rec) { rec.sp = sp; rec.seen = now(); } else reg.set(sp.id, { sp, seen: now() });
        const entry = { sp, text: str, opts: o, volume: o.volume, prio: sp.prio, resolve: null, preempted: false };
        return new Promise((resolve) => {
          entry.resolve = resolve;
          let dist;
          if (!richard()) {
            dist = distOf(sp);
            if (dist > maxDist || !voiceOk() || !voice.unlocked || !isNearest(sp, dist)) { resolve('bubble'); return; }
            entry.volume = volumeFor(dist, o.volume);
            if (cur && cur.prio > entry.prio) { resolve('bubble'); return; } // Höheres spricht gerade (Richard)
          }
          if (cur && (richard() ? entry.prio >= cur.prio : false)) {
            // Vorrang: laufende Rede unterbrechen (voice.say löst die alte auf), Wartende verwerfen
            if (queued) { queued.resolve('bubble'); queued = null; }
            cur.preempted = true;
            run(entry);
            return;
          }
          if (cur) {
            if (queued && queued.prio >= entry.prio) { resolve('bubble'); return; } // höchstens eine wartende Zeile
            if (queued) queued.resolve('bubble');
            queued = entry;
            return;
          }
          run(entry);
        });
      },
      cancel() {
        if (queued && queued.sp === sp) { queued.resolve('bubble'); queued = null; }
        if (cur && cur.sp === sp) { const c = cur; cur = null; c.preempted = true; try { voice.cancel(); } catch { /* egal */ } c.resolve('bubble'); next(); }
      },
      release() { reg.delete(sp.id); this.cancel(); },
    };
  }

  function stopAll() {
    if (queued) { queued.resolve('bubble'); queued = null; }
    if (cur) { const c = cur; cur = null; c.preempted = true; c.resolve('bubble'); }
    try { if (voice) voice.cancel(); } catch { /* egal */ }
  }
  return {
    speaker,
    stopAll,
    get busy() { return !!cur; },
    dispose() { if (disposed) return; stopAll(); disposed = true; reg.clear(); },
  };
}

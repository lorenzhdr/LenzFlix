// LenzFlix Auto-Weiter: Jellyfins „Jetzt starten“-Knopf im „Nächste Folge“-Overlay füllt sich über 5 s, danach Proxy-Klick darauf.
// Der Text des Knopfs bleibt unverändert; die Füllung ist ein Span (.lfx-autonext__fill) als erstes Kind von .btnStartNow.
// Ein/Aus nur über das Geheimmenü (getAutoNextEnabled/loadAutoNextEnabled/setAutoNextEnabled), pro Konto in den
// DisplayPreferences (Id 'lenzflix-player', Client 'lenzflix', CustomPrefs.autoNext = '1'|'0'), lokaler Spiegel lfx.autonext.<uid>.
// Eigenständig: KEINE Importe (Hauptbundle und Extra-Skript lenzupnext.js tragen denselben Code; wer zuerst startet, besitzt
// über window.__lfxAutoNext). Chromium-53-tauglich (LG webOS 4): keine neueren APIs (append/entries/finally/padStart/async …).
// Aus im Design VIDEOTHEK (Klasse lfx-theme-store / #lfx-store-park): dort nutzt das 3D-Kino denselben Player.

export const AUTONEXT_VERSION = '2';
export const AUTONEXT_DELAY_MS = 5000;
export const AUTONEXT_TICK_MS = 400;
export const AUTONEXT_EVENT = 'lfx:autonext';
const PREFS_ID = 'lenzflix-player';
const PREFS_CLIENT = 'lenzflix';
const PREFS_KEY = 'autoNext';
const MIRROR = 'lfx.autonext.';
const PAGE = '[id="videoOsdPage"]:not(.hide)';
// „Verbergen“ setzt erst upNextDialog-hidden (Ausblend-Transition), danach .hide → beides zählt als versteckt.
const UP = '.upNextContainer:not(.hide):not(.upNextDialog-hidden)';
const FILL = 'lfx-autonext__fill';
const HOST = 'lfx-autonext-host';
const RETRY_MS = 30000;

let inst = null;
let evSeq = 0; // zählt setAutoNextEnabled-Aufrufe: ein Ereignis hat Vorrang vor einem gleichzeitig laufenden GET
let writeChain = Promise.resolve();

function blocked() {
  return document.documentElement.classList.contains('lfx-theme-store') || Boolean(document.getElementById('lfx-store-park'));
}

function warn(e) {
  try {
    console.warn('[LenzFlix] Auto-Weiter', e && e.message ? e.message : 'Fehler');
  } catch { /* ignorieren */ }
}

const api = () => window.ApiClient || null;
function uidNow() {
  try {
    const c = api();
    return c && typeof c.getCurrentUserId === 'function' ? c.getCurrentUserId() || null : null;
  } catch {
    return null;
  }
}
const mirrorKey = (uid) => MIRROR + (uid || 'anon');
function readMirror(uid) {
  try {
    const v = window.localStorage.getItem(mirrorKey(uid));
    return v === '0' ? false : v === '1' ? true : null;
  } catch {
    return null;
  }
}
function writeMirror(uid, on) {
  try {
    window.localStorage.setItem(mirrorKey(uid), on ? '1' : '0');
  } catch { /* ignorieren */ }
}

/** Lokaler Spiegel (fehlend = an). */
export function getAutoNextEnabled() {
  const m = readMirror(uidNow());
  return m === null ? true : m;
}

/** Liest den Serverwert; null, wenn kein Client/Benutzer verfügbar (kein Fehler). Lehnt bei Serverfehlern ab. */
function readServer() {
  const c = api();
  const uid = uidNow();
  if (!c || !uid || typeof c.getDisplayPreferences !== 'function') return null;
  const seq = evSeq;
  let p;
  try {
    p = Promise.resolve(c.getDisplayPreferences(PREFS_ID, uid, PREFS_CLIENT));
  } catch (err) {
    p = Promise.reject(err);
  }
  return p.then((prefs) => {
    const cp = prefs && prefs.CustomPrefs ? prefs.CustomPrefs : null;
    const on = !cp || cp[PREFS_KEY] !== '0';
    if (seq !== evSeq) return getAutoNextEnabled(); // inzwischen gesetzter Wert (Ereignis) hat Vorrang
    writeMirror(uid, on);
    return on;
  });
}

/** Serverwert laden (und Spiegel aktualisieren); ohne ApiClient/Benutzer oder bei Fehler der Spiegelwert. */
export function loadAutoNextEnabled() {
  const p = readServer();
  if (!p) return Promise.resolve(getAutoNextEnabled());
  return p.then((on) => on, (e) => {
    warn(e);
    return getAutoNextEnabled();
  });
}

/** Setzt Ein/Aus: Spiegel, sofortiges Ereignis lfx:autonext, dann GET → autoNext ändern → POST. Resolved auch bei Fehlern. */
export function setAutoNextEnabled(on) {
  const v = Boolean(on);
  evSeq++;
  writeMirror(uidNow(), v);
  try {
    window.dispatchEvent(new CustomEvent(AUTONEXT_EVENT, { detail: { on: v } }));
  } catch (e) {
    warn(e);
  }
  const c = api();
  const uid = uidNow();
  if (!c || !uid || typeof c.getDisplayPreferences !== 'function' || typeof c.updateDisplayPreferences !== 'function') {
    return Promise.resolve();
  }
  const job = () => {
    let p;
    try {
      p = Promise.resolve(c.getDisplayPreferences(PREFS_ID, uid, PREFS_CLIENT));
    } catch (err) {
      p = Promise.reject(err);
    }
    return p.then((prefs) => {
      const body = prefs || {};
      const next = {};
      if (body.CustomPrefs) for (const k in body.CustomPrefs) next[k] = body.CustomPrefs[k];
      next[PREFS_KEY] = v ? '1' : '0';
      body.CustomPrefs = next;
      if (!body.Id) body.Id = PREFS_ID;
      return c.updateDisplayPreferences(PREFS_ID, body, uid, PREFS_CLIENT);
    }).then(() => undefined, (e) => {
      warn(e);
    });
  };
  writeChain = writeChain.then(job, job);
  return writeChain;
}

function create() {
  let timer = 0;
  let alive = true;
  let enabled = getAutoNextEnabled();
  let pageWasVisible = false;
  let needLoad = true;
  let busy = false;
  let retryAt = 0;
  let curStart = null; // aktuelles .btnStartNow = aktuelles Erscheinen des Overlays
  let run = null; // { deadline, startTime, video }
  let pending = false; // Erscheinen erkannt, Lauf wartet noch auf laufende Wiedergabe
  const activePage = () => document.querySelector(PAGE);

  // ---------------------------------------------------------------- Füllung
  function fillOf(btn) {
    for (let n = btn.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 1 && n.classList.contains(FILL)) return n;
    }
    return null;
  }
  function ensureFill(btn) {
    btn.classList.add(HOST);
    if (fillOf(btn)) return;
    const fill = document.createElement('span');
    fill.className = FILL;
    fill.setAttribute('aria-hidden', 'true');
    btn.insertBefore(fill, btn.firstChild);
  }
  function removeFill(btn) {
    btn.classList.remove('is-running');
    btn.classList.remove(HOST);
    let f = fillOf(btn);
    while (f) {
      btn.removeChild(f);
      f = fillOf(btn);
    }
  }
  function removeAllFills() {
    const list = document.querySelectorAll('.' + HOST + ', .' + FILL);
    for (let i = 0; i < list.length; i++) {
      const el = list[i];
      if (el.classList.contains(FILL)) {
        if (el.parentNode) el.parentNode.removeChild(el);
      } else {
        el.classList.remove('is-running');
        el.classList.remove(HOST);
      }
    }
  }

  // ---------------------------------------------------------------- Lauf
  function videoEl() {
    return document.querySelector('video.htmlvideoplayer');
  }
  function onVideoAbort() {
    if (run) endRun();
  }
  function onSeeking() {
    if (run && run.video && run.video.currentTime < run.startTime - 1) endRun();
  }
  function unbindVideo() {
    if (!run || !run.video) return;
    run.video.removeEventListener('pause', onVideoAbort);
    run.video.removeEventListener('emptied', onVideoAbort);
    run.video.removeEventListener('seeking', onSeeking);
  }
  /** Beendet/bricht den Lauf ab (idempotent); bis zum nächsten Erscheinen kein Neustart. */
  function endRun() {
    unbindVideo();
    run = null;
    if (curStart) curStart.classList.remove('is-running');
  }
  function startRun() {
    const btn = curStart;
    if (!btn || !enabled || blocked()) return;
    if (run) endRun();
    const video = videoEl();
    run = { deadline: Date.now() + AUTONEXT_DELAY_MS, startTime: video ? video.currentTime : 0, video };
    if (video) {
      video.addEventListener('pause', onVideoAbort);
      video.addEventListener('emptied', onVideoAbort);
      video.addEventListener('seeking', onSeeking);
    }
    ensureFill(btn);
    btn.classList.remove('is-running');
    void btn.offsetWidth; // Reflow: die CSS-Transition startet sicher bei scaleX(0)
    btn.classList.add('is-running');
  }
  /** Lauf starten, sobald das Video spielt; ist es pausiert, wartet „pending“ bis zur Wiedergabe (Tick prüft erneut). */
  function tryStart() {
    if (!pending || run || !enabled) return;
    const v = videoEl();
    if (v && v.paused) return;
    pending = false;
    startRun();
  }
  function fire() {
    const page = activePage();
    const sb = page && page.querySelector(UP + ' .btnStartNow');
    endRun();
    if (!sb || blocked() || sb !== curStart) return;
    sb.click();
  }

  /** Schalter aus dem Geheimmenü (Ereignis lfx:autonext) – sofort übernehmen. */
  function onToggle(ev) {
    const on = Boolean(ev && ev.detail && ev.detail.on);
    if (on === enabled) return;
    enabled = on;
    if (!on) {
      pending = false;
      endRun();
      if (curStart) removeFill(curStart);
    } else if (curStart && !blocked()) {
      ensureFill(curStart);
      pending = true;
      tryStart();
    }
  }

  // Ereignisse zählen auch instanzlokal: setzt die andere Bundle-Kopie (Geheimmenü im Hauptbundle, Besitzer ist lenzupnext.js),
  // sieht diese Kopie deren evSeq nicht.
  let seenEvents = 0;
  function onEvent(ev) {
    seenEvents++;
    onToggle(ev);
  }

  // ---------------------------------------------------------------- Laden
  function sync() {
    if (!alive || busy || !needLoad || Date.now() < retryAt) return;
    const seq = evSeq;
    const seen = seenEvents;
    const p = readServer();
    if (!p) return;
    busy = true;
    p.then((on) => {
      busy = false;
      if (!alive) return;
      needLoad = false;
      if (seq !== evSeq || seen !== seenEvents) return; // Ereignis war schneller
      onToggle({ detail: { on } });
    }, (e) => {
      busy = false;
      if (!alive) return;
      retryAt = Date.now() + RETRY_MS;
      warn(e);
    });
  }

  // ---------------------------------------------------------------- Takt
  function tick() {
    if (!alive) return;
    if (blocked()) {
      endRun();
      pending = false;
      curStart = null;
      removeAllFills();
      pageWasVisible = false;
      return;
    }
    const page = activePage();
    if (page && !pageWasVisible) needLoad = true;
    pageWasVisible = Boolean(page);
    sync();
    const up = page && page.querySelector(UP);
    const start = up && up.querySelector('.btnStartNow');
    if (!start) {
      if (run) endRun();
      pending = false;
      curStart = null;
      return;
    }
    const fresh = start !== curStart;
    if (fresh) {
      if (run) endRun();
      curStart = start;
      pending = enabled;
    }
    if (enabled) ensureFill(start);
    else if (fillOf(start) || start.classList.contains(HOST)) removeFill(start);
    tryStart();
    if (!run) return;
    if (run.video && run.video.currentTime < run.startTime - 1) {
      endRun();
      return;
    }
    if (Date.now() >= run.deadline) fire();
  }

  window.addEventListener(AUTONEXT_EVENT, onEvent);
  timer = window.setInterval(tick, AUTONEXT_TICK_MS);
  tick();

  return function destroy() {
    if (!alive) return;
    alive = false;
    window.clearInterval(timer);
    window.removeEventListener(AUTONEXT_EVENT, onEvent);
    endRun();
    removeAllFills();
    curStart = null;
    if (inst === destroy) inst = null;
    if (window.__lfxAutoNext && window.__lfxAutoNext.destroy === destroy) {
      try {
        delete window.__lfxAutoNext;
      } catch {
        window.__lfxAutoNext = undefined;
      }
    }
  };
}

/** Startet Auto-Weiter. false, wenn schon eine Instanz (dieses oder des anderen Bundles) besitzt. */
export function startAutoNext() {
  if (window.__lfxAutoNext || inst) return false;
  const destroy = create();
  inst = destroy;
  window.__lfxAutoNext = { version: AUTONEXT_VERSION, destroy };
  return true;
}

/** Räumt nur ab, wenn diese Instanz Besitzer ist. */
export function stopAutoNext() {
  if (inst) inst();
}

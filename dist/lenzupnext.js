(() => {
  // src/js/autonext/autonext.js
  var AUTONEXT_VERSION = "2";
  var AUTONEXT_DELAY_MS = 5e3;
  var AUTONEXT_TICK_MS = 400;
  var AUTONEXT_EVENT = "lfx:autonext";
  var PREFS_ID = "lenzflix-player";
  var PREFS_CLIENT = "lenzflix";
  var PREFS_KEY = "autoNext";
  var MIRROR = "lfx.autonext.";
  var PAGE = '[id="videoOsdPage"]:not(.hide)';
  var UP = ".upNextContainer:not(.hide):not(.upNextDialog-hidden)";
  var FILL = "lfx-autonext__fill";
  var HOST = "lfx-autonext-host";
  var RETRY_MS = 3e4;
  var inst = null;
  var evSeq = 0;
  var writeChain = Promise.resolve();
  function blocked() {
    return document.documentElement.classList.contains("lfx-theme-store") || Boolean(document.getElementById("lfx-store-park"));
  }
  function warn(e) {
    try {
      console.warn("[LenzFlix] Auto-Weiter", e && e.message ? e.message : "Fehler");
    } catch (e2) {
    }
  }
  var api = () => window.ApiClient || null;
  function uidNow() {
    try {
      const c = api();
      return c && typeof c.getCurrentUserId === "function" ? c.getCurrentUserId() || null : null;
    } catch (e) {
      return null;
    }
  }
  var mirrorKey = (uid) => MIRROR + (uid || "anon");
  function readMirror(uid) {
    try {
      const v = window.localStorage.getItem(mirrorKey(uid));
      return v === "0" ? false : v === "1" ? true : null;
    } catch (e) {
      return null;
    }
  }
  function writeMirror(uid, on) {
    try {
      window.localStorage.setItem(mirrorKey(uid), on ? "1" : "0");
    } catch (e) {
    }
  }
  function getAutoNextEnabled() {
    const m = readMirror(uidNow());
    return m === null ? true : m;
  }
  function readServer() {
    const c = api();
    const uid = uidNow();
    if (!c || !uid || typeof c.getDisplayPreferences !== "function") return null;
    const seq = evSeq;
    let p;
    try {
      p = Promise.resolve(c.getDisplayPreferences(PREFS_ID, uid, PREFS_CLIENT));
    } catch (err) {
      p = Promise.reject(err);
    }
    return p.then((prefs) => {
      const cp = prefs && prefs.CustomPrefs ? prefs.CustomPrefs : null;
      const on = !cp || cp[PREFS_KEY] !== "0";
      if (seq !== evSeq) return getAutoNextEnabled();
      writeMirror(uid, on);
      return on;
    });
  }
  function create() {
    let timer = 0;
    let alive = true;
    let enabled = getAutoNextEnabled();
    let pageWasVisible = false;
    let needLoad = true;
    let busy = false;
    let retryAt = 0;
    let curStart = null;
    let run = null;
    let pending = false;
    const activePage = () => document.querySelector(PAGE);
    function fillOf(btn) {
      for (let n = btn.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 1 && n.classList.contains(FILL)) return n;
      }
      return null;
    }
    function ensureFill(btn) {
      btn.classList.add(HOST);
      if (fillOf(btn)) return;
      const fill = document.createElement("span");
      fill.className = FILL;
      fill.setAttribute("aria-hidden", "true");
      btn.insertBefore(fill, btn.firstChild);
    }
    function removeFill(btn) {
      btn.classList.remove("is-running");
      btn.classList.remove(HOST);
      let f = fillOf(btn);
      while (f) {
        btn.removeChild(f);
        f = fillOf(btn);
      }
    }
    function removeAllFills() {
      const list = document.querySelectorAll("." + HOST + ", ." + FILL);
      for (let i = 0; i < list.length; i++) {
        const el = list[i];
        if (el.classList.contains(FILL)) {
          if (el.parentNode) el.parentNode.removeChild(el);
        } else {
          el.classList.remove("is-running");
          el.classList.remove(HOST);
        }
      }
    }
    function videoEl() {
      return document.querySelector("video.htmlvideoplayer");
    }
    function onVideoAbort() {
      if (run) endRun();
    }
    function onSeeking() {
      if (run && run.video && run.video.currentTime < run.startTime - 1) endRun();
    }
    function unbindVideo() {
      if (!run || !run.video) return;
      run.video.removeEventListener("pause", onVideoAbort);
      run.video.removeEventListener("emptied", onVideoAbort);
      run.video.removeEventListener("seeking", onSeeking);
    }
    function endRun() {
      unbindVideo();
      run = null;
      if (curStart) curStart.classList.remove("is-running");
    }
    function startRun() {
      const btn = curStart;
      if (!btn || !enabled || blocked()) return;
      if (run) endRun();
      const video = videoEl();
      run = { deadline: Date.now() + AUTONEXT_DELAY_MS, startTime: video ? video.currentTime : 0, video };
      if (video) {
        video.addEventListener("pause", onVideoAbort);
        video.addEventListener("emptied", onVideoAbort);
        video.addEventListener("seeking", onSeeking);
      }
      ensureFill(btn);
      btn.classList.remove("is-running");
      void btn.offsetWidth;
      btn.classList.add("is-running");
    }
    function tryStart() {
      if (!pending || run || !enabled) return;
      const v = videoEl();
      if (v && v.paused) return;
      pending = false;
      startRun();
    }
    function fire() {
      const page = activePage();
      const sb = page && page.querySelector(UP + " .btnStartNow");
      endRun();
      if (!sb || blocked() || sb !== curStart) return;
      sb.click();
    }
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
    let seenEvents = 0;
    function onEvent(ev) {
      seenEvents++;
      onToggle(ev);
    }
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
        if (seq !== evSeq || seen !== seenEvents) return;
        onToggle({ detail: { on } });
      }, (e) => {
        busy = false;
        if (!alive) return;
        retryAt = Date.now() + RETRY_MS;
        warn(e);
      });
    }
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
      const start = up && up.querySelector(".btnStartNow");
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
        } catch (e) {
          window.__lfxAutoNext = void 0;
        }
      }
    };
  }
  function startAutoNext() {
    if (window.__lfxAutoNext || inst) return false;
    const destroy = create();
    inst = destroy;
    window.__lfxAutoNext = { version: AUTONEXT_VERSION, destroy };
    return true;
  }

  // src/js/autonext/standalone.js
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startAutoNext);
  else startAutoNext();
})();

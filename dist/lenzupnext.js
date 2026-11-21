(() => {
  // src/js/autonext/autonext.js
  var AUTONEXT_VERSION = "1";
  var AUTONEXT_DELAY_MS = 5e3;
  var AUTONEXT_TICK_MS = 400;
  var PREFS_ID = "lenzflix-player";
  var PREFS_CLIENT = "lenzflix";
  var PREFS_KEY = "autoNext";
  var MIRROR = "lfx.autonext.";
  var PAGE = '[id="videoOsdPage"]:not(.hide)';
  var UP = ".upNextContainer:not(.hide):not(.upNextDialog-hidden)";
  var BTN = "lfx-autonext";
  var RETRY_MS = 3e4;
  var inst = null;
  function blocked() {
    return document.documentElement.classList.contains("lfx-theme-store") || Boolean(document.getElementById("lfx-store-park"));
  }
  function warn(e) {
    try {
      console.warn("[LenzFlix] Auto-Weiter", e && e.message ? e.message : "Fehler");
    } catch (e2) {
    }
  }
  function create() {
    let timer = 0;
    let alive = true;
    let enabled = true;
    let userTouched = false;
    let pageWasVisible = false;
    let needLoad = true;
    let dirty = false;
    let busy = false;
    let retryAt = 0;
    let mirrorUid = null;
    let curStart = null;
    let run = null;
    let pending = false;
    const api = () => window.ApiClient || null;
    const uidNow = () => {
      try {
        const c = api();
        return c && typeof c.getCurrentUserId === "function" ? c.getCurrentUserId() || null : null;
      } catch (e) {
        return null;
      }
    };
    const mirrorKey = (uid) => MIRROR + (uid || "anon");
    function readMirror(uid) {
      try {
        const v = window.localStorage.getItem(mirrorKey(uid));
        return v === "0" ? false : v === "1" ? true : null;
      } catch (e) {
        return null;
      }
    }
    function writeMirror() {
      try {
        window.localStorage.setItem(mirrorKey(uidNow()), enabled ? "1" : "0");
      } catch (e) {
      }
    }
    const activePage = () => document.querySelector(PAGE);
    function label() {
      return enabled ? "Auto-Weiter: An" : "Auto-Weiter: Aus";
    }
    function paint(btn) {
      btn.classList.toggle("is-on", enabled);
      btn.setAttribute("aria-pressed", enabled ? "true" : "false");
      const text = btn.querySelector(".lfx-autonext__text");
      if (!text) return;
      let s = label();
      if (run) s = "Weiter in " + Math.max(1, Math.ceil((run.deadline - Date.now()) / 1e3));
      if (text.textContent !== s) text.textContent = s;
    }
    function paintAll() {
      const list = document.querySelectorAll("." + BTN);
      for (let i = 0; i < list.length; i++) paint(list[i]);
    }
    function makeBtn() {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "raised raised-mini emby-button upNextDialog-button " + BTN;
      const fill = document.createElement("span");
      fill.className = "lfx-autonext__fill";
      fill.setAttribute("aria-hidden", "true");
      const text = document.createElement("span");
      text.className = "lfx-autonext__text";
      btn.appendChild(fill);
      btn.appendChild(text);
      btn.addEventListener("click", onBtnClick);
      return btn;
    }
    function ensureBtn(start) {
      const bar = start.parentNode;
      if (!bar) return null;
      let btn = bar.querySelector("." + BTN);
      if (!btn) {
        btn = makeBtn();
        const hide = bar.querySelector(".btnHide");
        bar.insertBefore(btn, hide ? hide.nextSibling : null);
      }
      return btn;
    }
    const curBtn = () => curStart && curStart.parentNode ? curStart.parentNode.querySelector("." + BTN) : null;
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
      const btn = curBtn();
      if (btn) {
        btn.classList.remove("is-running");
        paint(btn);
      }
    }
    function startRun() {
      const btn = curBtn();
      if (!btn || !enabled || blocked()) return;
      if (run) endRun();
      const video = videoEl();
      run = { deadline: Date.now() + AUTONEXT_DELAY_MS, startTime: video ? video.currentTime : 0, video };
      if (video) {
        video.addEventListener("pause", onVideoAbort);
        video.addEventListener("emptied", onVideoAbort);
        video.addEventListener("seeking", onSeeking);
      }
      btn.classList.remove("is-running");
      paint(btn);
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
    function onBtnClick(ev) {
      ev.stopPropagation();
      ev.preventDefault();
      userTouched = true;
      if (enabled) {
        enabled = false;
        pending = false;
        endRun();
      } else {
        enabled = true;
        if (curStart && !blocked()) {
          pending = true;
          tryStart();
        }
      }
      writeMirror();
      dirty = true;
      retryAt = 0;
      paintAll();
      sync();
    }
    function sync() {
      if (!alive || busy || Date.now() < retryAt) return;
      const c = api();
      const uid = uidNow();
      if (!c || !uid) return;
      if (mirrorUid !== uid) {
        mirrorUid = uid;
        if (!userTouched) {
          const m = readMirror(uid);
          if (m !== null && m !== enabled) {
            enabled = m;
            paintAll();
          }
        }
      }
      if (!dirty && !needLoad) return;
      if (typeof c.getDisplayPreferences !== "function") return;
      const writing = dirty;
      busy = true;
      let p;
      try {
        p = Promise.resolve(c.getDisplayPreferences(PREFS_ID, uid, PREFS_CLIENT));
      } catch (err) {
        p = Promise.reject(err);
      }
      p.then((prefs) => {
        if (!alive) return null;
        const cp = prefs && prefs.CustomPrefs ? prefs.CustomPrefs : null;
        if (!writing && !dirty) {
          if (!userTouched && cp) {
            enabled = cp[PREFS_KEY] !== "0";
            writeMirror();
            paintAll();
          }
          needLoad = false;
          return null;
        }
        if (typeof c.updateDisplayPreferences !== "function") return null;
        const body = prefs || {};
        const next = {};
        if (body.CustomPrefs) for (const k in body.CustomPrefs) next[k] = body.CustomPrefs[k];
        next[PREFS_KEY] = enabled ? "1" : "0";
        body.CustomPrefs = next;
        if (!body.Id) body.Id = PREFS_ID;
        dirty = false;
        needLoad = false;
        return Promise.resolve(c.updateDisplayPreferences(PREFS_ID, body, uid, PREFS_CLIENT));
      }).then(() => {
        busy = false;
      }, (e) => {
        busy = false;
        if (!alive) return;
        if (writing) dirty = true;
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
        const gone = document.querySelectorAll("." + BTN);
        for (let i = 0; i < gone.length; i++) if (gone[i].parentNode) gone[i].parentNode.removeChild(gone[i]);
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
      }
      const btn = ensureBtn(start);
      if (!btn) return;
      if (fresh) {
        paint(btn);
        pending = enabled;
      }
      tryStart();
      if (!run) {
        paint(btn);
        return;
      }
      if (run.video && run.video.currentTime < run.startTime - 1) {
        endRun();
        return;
      }
      if (Date.now() >= run.deadline) fire();
      else paint(btn);
    }
    timer = window.setInterval(tick, AUTONEXT_TICK_MS);
    const mirror = readMirror(uidNow());
    if (mirror !== null) enabled = mirror;
    tick();
    return function destroy() {
      if (!alive) return;
      alive = false;
      window.clearInterval(timer);
      endRun();
      const list = document.querySelectorAll("." + BTN);
      for (let i = 0; i < list.length; i++) {
        list[i].removeEventListener("click", onBtnClick);
        if (list[i].parentNode) list[i].parentNode.removeChild(list[i]);
      }
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

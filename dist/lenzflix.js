(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // src/js/core/api.js
  function readStoredServer() {
    try {
      const raw = JSON.parse(window.localStorage.getItem("jellyfin_credentials") || "null");
      const servers = raw && raw.Servers || [];
      return servers.find((s) => s && s.AccessToken && s.UserId) || servers[0] || null;
    } catch {
      return null;
    }
  }
  function call(client, name) {
    return client && typeof client[name] === "function" ? client[name]() : void 0;
  }
  function trimSlash(s) {
    return String(s || "").replace(/\/+$/, "");
  }
  function getAuth() {
    const client = window.ApiClient;
    const stored = readStoredServer();
    const address = trimSlash(call(client, "serverAddress") || stored && (stored.ManualAddress || stored.LocalAddress) || "");
    const userId = call(client, "getCurrentUserId") || stored && stored.UserId || null;
    const token2 = call(client, "accessToken") || stored && stored.AccessToken || null;
    const serverId = call(client, "serverId") || stored && stored.Id || null;
    return { address, userId, token: token2, serverId };
  }
  function getUserId() {
    return getAuth().userId;
  }
  function isReady() {
    const a = getAuth();
    return Boolean(a.userId && a.token);
  }
  function toQuery(params) {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
      if (v === void 0 || v === null || v === "") continue;
      usp.set(k, Array.isArray(v) ? v.join(",") : String(v));
    }
    const s = usp.toString();
    return s ? `?${s}` : "";
  }
  function buildUrl(path, params) {
    const { address } = getAuth();
    return `${address}${path.startsWith("/") ? "" : "/"}${path}${toQuery(params)}`;
  }
  async function getJson(path, params, { signal } = {}) {
    const { token: token2, address } = getAuth();
    if (token2 && typeof fetch === "function") {
      const res = await fetch(buildUrl(path, params), {
        headers: { Authorization: `MediaBrowser Token="${token2}"`, Accept: "application/json" },
        signal
      });
      if (!res.ok) throw new Error(`LenzFlix API: HTTP ${res.status} f\xFCr ${path}`);
      return res.status === 204 ? null : res.json();
    }
    const client = window.ApiClient;
    if (client && typeof client.ajax === "function") {
      const url = typeof client.getUrl === "function" ? client.getUrl(path, params || {}) : `${address}${path}${toQuery(params)}`;
      return client.ajax({ type: "GET", url, dataType: "json" });
    }
    throw new Error("LenzFlix API: kein ApiClient/Token verf\xFCgbar");
  }
  function getItems(params) {
    return getJson("/Items", { userId: getUserId(), ...params });
  }
  function getItem(id, params) {
    return getJson(`/Users/${getUserId()}/Items/${id}`, params);
  }
  function getLatest(params) {
    return getJson("/Items/Latest", { userId: getUserId(), ...params });
  }
  function getResume(params) {
    return getJson("/UserItems/Resume", { userId: getUserId(), ...params });
  }
  function getNextUp(params) {
    return getJson("/Shows/NextUp", { userId: getUserId(), ...params });
  }
  function getSeasons(seriesId, params) {
    return getJson(`/Shows/${seriesId}/Seasons`, { userId: getUserId(), ...params });
  }
  function getEpisodes(seriesId, params) {
    return getJson(`/Shows/${seriesId}/Episodes`, { userId: getUserId(), ...params });
  }
  function getSimilar(id, params) {
    return getJson(`/Items/${id}/Similar`, { userId: getUserId(), ...params });
  }
  function getViews() {
    return getJson("/UserViews", { userId: getUserId() });
  }
  async function setFavorite(id, isFavorite) {
    const client = window.ApiClient;
    const userId = getUserId();
    if (client && typeof client.updateFavoriteStatus === "function") {
      return client.updateFavoriteStatus(userId, id, Boolean(isFavorite));
    }
    const { token: token2 } = getAuth();
    const res = await fetch(buildUrl(`/Users/${userId}/FavoriteItems/${id}`), {
      method: isFavorite ? "POST" : "DELETE",
      headers: { Authorization: `MediaBrowser Token="${token2}"` }
    });
    if (!res.ok) throw new Error(`LenzFlix API: HTTP ${res.status} (Favorit)`);
    return res.json();
  }
  async function setPlayed(id, played) {
    const userId = getUserId();
    const { token: token2 } = getAuth();
    const res = await fetch(buildUrl(`/Users/${userId}/PlayedItems/${id}`), {
      method: played ? "POST" : "DELETE",
      headers: { Authorization: `MediaBrowser Token="${token2}"` }
    });
    if (!res.ok) throw new Error(`LenzFlix API: HTTP ${res.status} (Gesehen)`);
  }
  function first(arr) {
    return Array.isArray(arr) && arr.length ? arr[0] : null;
  }
  function imageUrlFor(id, { type = "Primary", maxWidth, maxHeight, quality = 90, tag } = {}) {
    if (!id) return null;
    return buildUrl(`/Items/${id}/Images/${type}`, { maxWidth, maxHeight, quality, tag });
  }
  function imageUrl(item, { type = "Primary", maxWidth, maxHeight, quality = 90 } = {}) {
    if (!item) return null;
    const tag = type === "Backdrop" ? first(item.BackdropImageTags) : item.ImageTags && item.ImageTags[type];
    if (!tag) return null;
    return imageUrlFor(item.Id, { type, maxWidth, maxHeight, quality, tag });
  }
  function pickLandscape(item) {
    if (!item) return null;
    const tags = item.ImageTags || {};
    const candidates = [
      [item.Id, "Thumb", tags.Thumb],
      [item.Id, "Backdrop", first(item.BackdropImageTags)],
      [item.ParentThumbItemId, "Thumb", item.ParentThumbImageTag],
      [item.ParentBackdropItemId, "Backdrop", first(item.ParentBackdropImageTags)],
      [item.Id, "Primary", tags.Primary],
      [item.SeriesId, "Primary", item.SeriesPrimaryImageTag]
    ];
    for (const [id, type, tag] of candidates) {
      if (id && tag) return { id, type, tag };
    }
    return null;
  }
  function landscapeImage(item, { maxWidth = 780, quality = 85 } = {}) {
    const pick = pickLandscape(item);
    return pick ? imageUrlFor(pick.id, { ...pick, maxWidth, quality }) : null;
  }
  function logoImage(item, { maxWidth = 500, quality = 90 } = {}) {
    if (!item) return null;
    const own = item.ImageTags && item.ImageTags.Logo;
    if (own) return imageUrlFor(item.Id, { type: "Logo", tag: own, maxWidth, quality });
    if (item.ParentLogoItemId && item.ParentLogoImageTag) {
      return imageUrlFor(item.ParentLogoItemId, { type: "Logo", tag: item.ParentLogoImageTag, maxWidth, quality });
    }
    return null;
  }
  var userCache = /* @__PURE__ */ new Map();
  async function getUser() {
    const userId = getUserId();
    if (!userId) return null;
    if (userCache.has(userId)) return userCache.get(userId);
    try {
      const client = window.ApiClient;
      const user = client && typeof client.getCurrentUser === "function" ? await client.getCurrentUser() : await getJson(`/Users/${userId}`);
      if (!user) return null;
      userCache.set(userId, user);
      return user;
    } catch {
      return null;
    }
  }

  // src/js/core/cache.js
  var store = /* @__PURE__ */ new Map();
  var inflight = /* @__PURE__ */ new Map();
  function cached(key, loader, ttlMs = 6e4) {
    const hit = store.get(key);
    if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value);
    if (inflight.has(key)) return inflight.get(key);
    const p = Promise.resolve().then(loader).then((value) => {
      store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    }).finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }
  function clearCache(prefix) {
    for (const k of [...store.keys()]) if (!prefix || k.startsWith(prefix)) store.delete(k);
  }
  function debounce(fn, ms) {
    let t = null;
    const wrapped = (...args) => {
      clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        fn(...args);
      }, ms);
    };
    wrapped.cancel = () => {
      clearTimeout(t);
      t = null;
    };
    return wrapped;
  }

  // src/js/core/router.js
  function parseHash(hash) {
    let h2 = String(hash || "").replace(/^#!?/, "");
    if (!h2.startsWith("/")) h2 = `/${h2}`;
    const qi = h2.indexOf("?");
    const raw = qi < 0 ? h2 : h2.slice(0, qi);
    const params = new URLSearchParams(qi < 0 ? "" : h2.slice(qi + 1));
    const path = raw.replace(/\/+$/, "") || "/";
    return { path: path === "/" ? "/home" : path, params, hash: h2 };
  }
  function currentRoute(reason = "initial") {
    const r = parseHash(window.location.hash);
    r.reason = reason;
    return r;
  }
  var handlers = /* @__PURE__ */ new Set();
  var listening = false;
  function dispatch(reason) {
    const route = currentRoute(reason);
    for (const fn of [...handlers]) {
      try {
        fn(route);
      } catch (e) {
        console.error("[LenzFlix] route handler", e);
      }
    }
  }
  var listener = (e) => dispatch(e.type);
  function startListening() {
    if (listening) return;
    listening = true;
    window.addEventListener("hashchange", listener);
    document.addEventListener("viewshow", listener);
  }
  function stopListening() {
    if (!listening) return;
    listening = false;
    window.removeEventListener("hashchange", listener);
    document.removeEventListener("viewshow", listener);
  }
  function onRoute(handler) {
    handlers.add(handler);
    startListening();
    try {
      handler(currentRoute("initial"));
    } catch (e) {
      console.error("[LenzFlix] route handler", e);
    }
    return () => {
      handlers.delete(handler);
      if (!handlers.size) stopListening();
    };
  }
  var features = /* @__PURE__ */ new Map();
  var featureSub = null;
  var evaluating = false;
  var rerun = null;
  function runPass(route) {
    const plan = [...features.values()].map((entry) => {
      let matched = false;
      try {
        matched = Boolean(entry.feature.match(route));
      } catch (e) {
        console.error(`[LenzFlix] ${entry.feature.name}.match`, e);
      }
      return { entry, matched };
    });
    const alive = (entry) => features.get(entry.feature.name) === entry;
    for (const { entry, matched } of plan) {
      if (matched || !entry.mounted || !alive(entry)) continue;
      entry.mounted = false;
      try {
        entry.feature.unmount();
      } catch (e) {
        console.error(`[LenzFlix] Feature ${entry.feature.name}`, e);
      }
    }
    for (const { entry, matched } of plan) {
      if (!matched || !alive(entry)) continue;
      const { feature } = entry;
      try {
        if (!entry.mounted) {
          entry.mounted = true;
          feature.mount(route);
        } else if (typeof feature.update === "function") {
          feature.update(route);
        }
      } catch (e) {
        console.error(`[LenzFlix] Feature ${feature.name}`, e);
      }
    }
  }
  function evaluate(route) {
    if (evaluating) {
      rerun = route;
      return;
    }
    evaluating = true;
    try {
      let next = route;
      let guard = 0;
      while (next && guard++ < 10) {
        rerun = null;
        runPass(next);
        next = rerun;
      }
    } finally {
      evaluating = false;
      rerun = null;
    }
  }
  function registerFeature(feature) {
    if (!feature || !feature.name) throw new Error("Feature braucht einen Namen");
    if (features.has(feature.name)) return () => unregisterFeature(feature.name);
    features.set(feature.name, { feature, mounted: false });
    if (!featureSub) featureSub = onRoute(evaluate);
    else evaluate(currentRoute("register"));
    return () => unregisterFeature(feature.name);
  }
  function unregisterFeature(name) {
    const entry = features.get(name);
    if (!entry) return;
    features.delete(name);
    if (entry.mounted) {
      try {
        entry.feature.unmount();
      } catch (e) {
        console.error(`[LenzFlix] Feature ${name}.unmount`, e);
      }
    }
    if (!features.size && featureSub) {
      featureSub();
      featureSub = null;
    }
  }
  function reevaluate() {
    if (features.size) evaluate(currentRoute("refresh"));
  }
  function resetRouter() {
    for (const name of [...features.keys()]) unregisterFeature(name);
    handlers.clear();
    featureSub = null;
    stopListening();
  }

  // src/js/core/version.js
  var VERSION = "1.5.0";

  // src/js/core/themecss.js
  var CLASS = "lfx-theme-css";
  var ACTIVE_ID = "lfx-theme-css";
  var CORE_RE = /lenzflix(\.min)?\.(css|js)(?=$|[?#])/i;
  var CORE_CSS_RE = /lenzflix(\.min)?\.css(?=$|[?#])/i;
  var FILES = { plus: "lenzplus", prime: "lenzprime" };
  var BOOT_SCRIPT_SRC = (() => {
    try {
      const s = document.currentScript;
      return s && s.src || "";
    } catch {
      return "";
    }
  })();
  function parseCoreUrl(href, withQuery = false) {
    const s = String(href || "");
    const m = s.match(CORE_RE);
    if (!m) return null;
    const cut = s.indexOf(m[0]);
    const rest = s.slice(cut + m[0].length);
    return { base: s.slice(0, cut), min: Boolean(m[1]), query: withQuery && rest.startsWith("?") ? rest.split("#")[0] : "" };
  }
  function fromImportRules(rules, depth = 0) {
    if (!rules || depth > 4) return null;
    for (const rule of Array.from(rules)) {
      if (rule && rule.href && CORE_CSS_RE.test(rule.href)) {
        const hit = parseCoreUrl(rule.href);
        if (hit) return hit;
      }
      try {
        if (rule && rule.styleSheet) {
          const hit = fromImportRules(rule.styleSheet.cssRules, depth + 1);
          if (hit) return hit;
        }
      } catch {
      }
    }
    return null;
  }
  function fromStyleSheets() {
    let sheets;
    try {
      sheets = Array.from(document.styleSheets || []);
    } catch {
      return null;
    }
    for (const sheet of sheets) {
      if (sheet.href && CORE_CSS_RE.test(sheet.href)) {
        const hit = parseCoreUrl(sheet.href);
        if (hit) return hit;
      }
      try {
        const hit = fromImportRules(sheet.cssRules);
        if (hit) return hit;
      } catch {
      }
    }
    return null;
  }
  function fromElements() {
    for (const l of document.querySelectorAll('link[rel~="stylesheet"]')) {
      const hit2 = parseCoreUrl(l.getAttribute("href") || "");
      if (hit2) return hit2;
    }
    const hit = parseCoreUrl(BOOT_SCRIPT_SRC);
    if (hit) return hit;
    for (const s of document.querySelectorAll("script[src]")) {
      const h2 = parseCoreUrl(s.getAttribute("src") || "");
      if (h2) return h2;
    }
    return null;
  }
  function normBase(b) {
    const s = String(b || "");
    return s.endsWith("/") ? s : `${s}/`;
  }
  function resolveThemeCssBase() {
    const cfg = window.LenzFlixConfig && window.LenzFlixConfig.themeCssBase;
    if (typeof cfg === "string" && cfg.trim()) {
      const detected = fromStyleSheets() || fromElements();
      return { base: normBase(cfg.trim()), min: Boolean(detected && detected.min), query: "" };
    }
    const dev = document.getElementById("lfx-dev-css");
    if (dev) {
      const hit2 = parseCoreUrl(dev.getAttribute("href") || dev.href || "", true);
      if (hit2) return { base: hit2.base, min: false, query: hit2.query };
    }
    const hit = fromStyleSheets() || fromElements();
    if (hit) return { base: hit.base, min: hit.min, query: "" };
    return { base: `https://cdn.jsdelivr.net/gh/lorenzhdr/LenzFlix@v${VERSION}/dist/`, min: true, query: "" };
  }
  function themeCssUrl(id) {
    const file = FILES[id];
    if (!file) return null;
    const { base, min, query: query2 } = resolveThemeCssBase();
    return `${base}${file}${min ? ".min" : ""}.css${query2 || ""}`;
  }
  function getThemeCssLink(id) {
    for (const l of document.querySelectorAll(`link.${CLASS}`)) {
      if (l.getAttribute("data-lfx-theme") === id) return l;
    }
    return null;
  }
  var inflight2 = /* @__PURE__ */ new Map();
  function ensureThemeCss(id, { timeout = 1500 } = {}) {
    if (!FILES[id]) return Promise.resolve(true);
    const existing = getThemeCssLink(id);
    if (existing && existing.getAttribute("data-lfx-loaded") === "1") return Promise.resolve(true);
    if (inflight2.has(id) && existing) return inflight2.get(id);
    existing?.remove();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.className = CLASS;
    link.setAttribute("data-lfx-theme", id);
    const p = new Promise((resolve2) => {
      let done = false;
      let timer = null;
      const finish3 = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        link.onload = link.onerror = null;
        if (inflight2.get(id) === p) inflight2.delete(id);
        if (ok) link.setAttribute("data-lfx-loaded", "1");
        else link.remove();
        resolve2(ok);
      };
      link.onload = () => finish3(true);
      link.onerror = () => finish3(false);
      timer = setTimeout(() => finish3(false), timeout);
      link.href = themeCssUrl(id);
      document.head.appendChild(link);
    });
    inflight2.set(id, p);
    return p;
  }
  function removeThemeCss(exceptId) {
    for (const l of [...document.querySelectorAll(`link.${CLASS}`)]) {
      if (exceptId && l.getAttribute("data-lfx-theme") === exceptId) {
        l.id = ACTIVE_ID;
      } else {
        inflight2.delete(l.getAttribute("data-lfx-theme"));
        l.remove();
      }
    }
  }

  // src/js/core/favicon.js
  var FLIX_HREF = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAACKElEQVR42u3az2oTQQDH8V801SY2LUoOwryCF1/Ji4+lL+HVJ2hToo2xHqXRy0IPha40Ch6cQgjJRSo07ucLc1kYdpf5sH9getmRFoPxWZLLJJMkx0lOk8xL2/yK/rreDgG4SFLWDl8lma6gmCeZlrZZWtpuANjUzyTnFcVJHcelbX5Y7m4A2NQyyZc1FJPSNtcAdAPANhTn9VvibWmb910E0O8w/r0kL+pYJOkkgAfegt0OAAAEgAAQAAJAAAgAASAABIAAEAACQAAIAAEgAASAABAAAkAACAABIAAEgAAQAAJAAAgAASAABIAAEAACQAAIAAEgAASAABAAAkAACAABIAAEgAAQAAJAAAgAASAABIAAEAACQAAIAAEgAASAABAAAkAACAABIAAEgAAQAAJAAAgAASAABIAAEAACQAAAIAAEgAAQAAJAAAiArvV8MRg/6+KN93blQheD8UWS8o9Pc5lkluRTHSdJpqVtrgDoBoBtfa8gZitAJqVtrgHoBoBNLZN8TfI5yVmFMU/yobTNDQD/P4Bt3aw8KWZJPiY5LW3z7T5ebN/33533KMnLOm57k+SVvwABIAAEgAAQAAJAAAgAASAABIAAEAACQAAIAAEgABR7ApPkdZJRksMke0kOkjxOMkwySLKf5Ek9Nqr3dlSRH9U5o5W52iUApW3e5W53Ge9XOMOKZ1jxHObPbumnSR5WPP2KZx3c7dyDCmsVXH8F673tN5bcY1gLzpx6AAAAAElFTkSuQmCC";
  var FAVICONS = { flix: FLIX_HREF, plus: FLIX_HREF, prime: FLIX_HREF };
  var ATTR = "data-lfx-orig";
  var created = null;
  var patched = [];
  var currentTheme = null;
  function hrefFor(theme) {
    return FAVICONS[theme] || FAVICONS.flix;
  }
  function applyFavicon(theme = "flix") {
    if (!document.head) return;
    const href = hrefFor(theme);
    if (created) {
      if (theme !== currentTheme) {
        currentTheme = theme;
        for (const l of [...patched, created]) l.setAttribute("href", href);
      }
      return;
    }
    currentTheme = theme;
    patched = [...document.head.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')];
    for (const l of patched) {
      l.setAttribute(ATTR, l.getAttribute("href") ?? "");
      l.setAttribute("href", href);
      l.setAttribute("type", "image/png");
      l.removeAttribute("sizes");
    }
    created = document.createElement("link");
    created.id = "lfx-favicon";
    created.rel = "icon";
    created.type = "image/png";
    created.href = href;
    document.head.append(created);
  }
  function removeFavicon() {
    created?.remove();
    created = null;
    currentTheme = null;
    for (const l of patched) {
      if (l.hasAttribute(ATTR)) {
        l.setAttribute("href", l.getAttribute(ATTR));
        l.removeAttribute(ATTR);
      }
    }
    patched = [];
  }

  // src/js/core/dom.js
  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === void 0 || v === null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of [].concat(children ?? [])) {
      if (c === null || c === void 0 || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  var mounts = /* @__PURE__ */ new Set();
  function mountPoint(id, { parent = document.body, before = null, className = "", tag = "div" } = {}) {
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement(tag);
      el.id = id;
      if (className) el.className = className;
      if (before && before.parentNode === parent) parent.insertBefore(el, before);
      else parent.append(el);
    }
    mounts.add(el);
    return el;
  }
  function unmountPoint(elOrId) {
    const el = typeof elOrId === "string" ? document.getElementById(elOrId) : elOrId;
    if (el) {
      el.remove();
      mounts.delete(el);
    }
  }
  function removeAllMounts() {
    for (const el of mounts) el.remove();
    mounts.clear();
  }

  // src/js/core/toast.js
  var ID = "lfx-toast";
  var hideTimer = null;
  var removeTimer = null;
  function clearTimers() {
    clearTimeout(hideTimer);
    clearTimeout(removeTimer);
    hideTimer = removeTimer = null;
  }
  function toast(text, { duration = 3e3 } = {}) {
    clearTimers();
    const root4 = mountPoint(ID, { className: "lfx-toast" });
    root4.classList.remove("is-leaving");
    root4.setAttribute("role", "status");
    root4.setAttribute("aria-live", "polite");
    root4.replaceChildren(h("div", { class: "lfx-toast__msg" }, [String(text)]));
    hideTimer = setTimeout(() => {
      root4.classList.add("is-leaving");
      removeTimer = setTimeout(() => {
        unmountPoint(root4);
        hideTimer = removeTimer = null;
      }, 200);
    }, duration);
  }
  function clearToast() {
    clearTimers();
    unmountPoint(ID);
  }

  // src/js/core/theme.js
  var THEMES = ["flix", "plus", "prime"];
  var THEME_META = {
    flix: { id: "flix", name: "LENZFLIX", tagline: "Klassisch: rote Akzente, Querformat-Karten", palette: ["#141414", "#e50914", "#ffffff", "#808080"] },
    plus: { id: "plus", name: "LENZ+", tagline: "Karussell, Poster und Marken-Hubs", palette: ["#10131f", "#050507", "#1bb3e8", "#f5f5f7"] },
    prime: { id: "prime", name: "LENZPRIME", tagline: "Vollbild-Hero, Badges und Trailer", palette: ["#0a0e17", "#1a98ff", "#ffffff", "#3a3d45"] }
  };
  var KEY_USER = "lfx.theme.";
  var KEY_LAST = "lfx.theme.last";
  var PREFS_ID = "lenzflix";
  var PREFS_CLIENT = "lenzflix";
  var HASH_PARAM = "lfxtheme";
  var SAVE_DEBOUNCE_MS = 400;
  var CSS_TIMEOUT_MS = 3e3;
  var REVEAL_MS = 1500;
  var LOADING = "lfx-theme-loading";
  var PREHIDE_ID = "lfx-theme-prehide";
  var PREHIDE_CSS = "html.lfx-theme-loading:not(.layout-tv) body{opacity:0!important}";
  var TV_UA = /Web0S|webOS|Tizen|SmartTV|SMART-TV/i;
  var root = () => document.documentElement;
  var started = false;
  var chosen = null;
  var effective = null;
  var state = "pending";
  var seq = 0;
  var inflight3 = null;
  var touched = 0;
  var lastUid = null;
  var remoteDone = false;
  var saveTimer = null;
  var revealTimer = null;
  var unsynced = false;
  var earlyId = null;
  var earlyAt = 0;
  var earlyTimer = null;
  var listeners = /* @__PURE__ */ new Set();
  function normalizeTheme(x) {
    return THEMES.includes(x) ? x : "flix";
  }
  function getChosenTheme() {
    return chosen === null ? resolveLocalChoice() : chosen;
  }
  function getTheme() {
    return effective;
  }
  function isTheme(id) {
    return effective === id;
  }
  function brandName(id = getTheme() || "flix") {
    return THEME_META[normalizeTheme(id)].name;
  }
  function onThemeChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function lsGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  function lsSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
    }
  }
  function userKey() {
    const uid = getUserId();
    return uid ? KEY_USER + uid : null;
  }
  function strictTheme(x) {
    return THEMES.includes(x) ? x : null;
  }
  function resolveLocalChoice() {
    const uk = userKey();
    return strictTheme(uk && lsGet(uk)) || strictTheme(lsGet(KEY_LAST)) || "flix";
  }
  function saveLocal(id) {
    const uk = userKey();
    if (uk) lsSet(uk, id);
    lsSet(KEY_LAST, id);
  }
  function takeHashChoice(consume = true) {
    let r;
    try {
      r = parseHash(window.location.hash);
    } catch {
      return null;
    }
    if (!r.params.has(HASH_PARAM)) return null;
    const id = strictTheme(r.params.get(HASH_PARAM));
    if (!consume) return id;
    r.params.delete(HASH_PARAM);
    try {
      const qs = r.params.toString();
      const hash = `#${r.path}${qs ? `?${qs}` : ""}`;
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${hash}`);
    } catch {
    }
    return id;
  }
  async function fetchPrefs(uid) {
    const client = window.ApiClient;
    if (client && typeof client.getDisplayPreferences === "function") {
      return client.getDisplayPreferences(PREFS_ID, uid, PREFS_CLIENT);
    }
    return getJson(`/DisplayPreferences/${PREFS_ID}`, { userId: uid, client: PREFS_CLIENT });
  }
  async function postPrefs(uid, prefs) {
    const client = window.ApiClient;
    if (client && typeof client.updateDisplayPreferences === "function") {
      return client.updateDisplayPreferences(PREFS_ID, prefs, uid, PREFS_CLIENT);
    }
    const { token: token2 } = getAuth();
    const res = await fetch(buildUrl(`/DisplayPreferences/${PREFS_ID}`, { userId: uid, client: PREFS_CLIENT }), {
      method: "POST",
      headers: { Authorization: `MediaBrowser Token="${token2}"`, "Content-Type": "application/json" },
      body: JSON.stringify(prefs)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return null;
  }
  async function uploadTheme(uid, id) {
    try {
      const prefs = await fetchPrefs(uid) || {};
      prefs.CustomPrefs = { ...prefs.CustomPrefs || {}, theme: id };
      if (!prefs.Id) prefs.Id = PREFS_ID;
      await postPrefs(uid, prefs);
    } catch (e) {
      console.warn("[LenzFlix] Design konnte nicht auf dem Server gespeichert werden:", e && e.message ? e.message : e);
    } finally {
      if (!saveTimer) unsynced = false;
    }
  }
  function scheduleUpload(id) {
    const uid = getUserId();
    if (!uid) return;
    unsynced = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      uploadTheme(uid, id);
    }, SAVE_DEBOUNCE_MS);
  }
  async function loadRemoteTheme(uid) {
    const startTouched = touched;
    let remote;
    try {
      const prefs = await fetchPrefs(uid);
      remote = strictTheme(prefs && prefs.CustomPrefs && prefs.CustomPrefs.theme);
    } catch (e) {
      console.warn("[LenzFlix] Design konnte nicht vom Server geladen werden:", e && e.message ? e.message : e);
      return;
    }
    if (!started || getUserId() !== uid) return;
    if (touched !== startTouched || unsynced) {
      scheduleUpload(chosen);
      return;
    }
    if (remote) {
      if (remote !== chosen) await setTheme(remote, { source: "server" });
    } else if (lsGet(KEY_USER + uid) || chosen !== "flix") {
      uploadTheme(uid, chosen);
    }
  }
  function forcedFlix() {
    try {
      return root().classList.contains("layout-tv") || TV_UA.test(navigator.userAgent || "");
    } catch {
      return false;
    }
  }
  function desired() {
    return forcedFlix() ? "flix" : chosen;
  }
  function setHtmlTheme(id) {
    const cl2 = root().classList;
    for (const c of [...cl2]) {
      if (c.startsWith("lfx-theme-") && c !== LOADING && c !== `lfx-theme-${id}`) cl2.remove(c);
    }
    if (!cl2.contains(`lfx-theme-${id}`)) cl2.add(`lfx-theme-${id}`);
    if (cl2.contains(LOADING)) cl2.remove(LOADING);
    removePrehide();
  }
  function removePrehide() {
    const el = document.getElementById(PREHIDE_ID);
    if (el) el.remove();
  }
  function endEarly() {
    clearTimeout(earlyTimer);
    earlyTimer = null;
    earlyId = null;
  }
  function abortEarly() {
    if (earlyId === null) return;
    endEarly();
    earlyAt = 0;
    removePrehide();
    root().classList.remove(LOADING);
    removeThemeCss(null);
  }
  function earlyTheme() {
    if (started || earlyId !== null) return;
    let id;
    try {
      id = !forcedFlix() && (takeHashChoice(false) || resolveLocalChoice()) || "flix";
    } catch {
      return;
    }
    if (id !== "plus" && id !== "prime") return;
    earlyId = id;
    earlyAt = Date.now();
    if (!document.getElementById(PREHIDE_ID)) {
      const st = document.createElement("style");
      st.id = PREHIDE_ID;
      st.textContent = PREHIDE_CSS;
      (document.head || root()).appendChild(st);
    }
    root().classList.add(LOADING);
    earlyTimer = setTimeout(() => {
      earlyTimer = null;
      if (!started) abortEarly();
    }, REVEAL_MS);
    try {
      Promise.resolve(ensureThemeCss(id, { timeout: CSS_TIMEOUT_MS })).catch(() => {
      });
    } catch {
    }
  }
  function emit(theme, previous) {
    for (const fn of [...listeners]) {
      try {
        fn({ theme, previous });
      } catch (e) {
        console.error("[LenzFlix] onThemeChange", e);
      }
    }
  }
  function revealFlix() {
    const previous = effective;
    effective = "flix";
    setHtmlTheme("flix");
    applyFavicon("flix");
    reevaluate();
    emit("flix", previous);
  }
  function commit(id, nextState = "active") {
    const previous = effective;
    effective = id;
    state = nextState;
    setHtmlTheme(id);
    removeThemeCss(id === "flix" ? null : id);
    applyFavicon(id);
    if (previous !== id) {
      reevaluate();
      emit(id, previous);
    }
  }
  function transition(target) {
    if (inflight3 && inflight3.target === target) return inflight3.promise;
    const mine = ++seq;
    if (target === "flix") {
      inflight3 = null;
      commit("flix");
      return Promise.resolve(true);
    }
    if (effective === target) {
      inflight3 = null;
      return Promise.resolve(true);
    }
    const initial = effective === null;
    if (initial) {
      state = "pending";
      root().classList.add(LOADING);
      clearTimeout(revealTimer);
      const waited = earlyAt ? Math.max(0, Date.now() - earlyAt) : 0;
      earlyAt = 0;
      revealTimer = setTimeout(() => {
        revealTimer = null;
        if (mine === seq && effective === null) revealFlix();
      }, Math.max(0, REVEAL_MS - waited));
    }
    const promise = ensureThemeCss(target, { timeout: CSS_TIMEOUT_MS }).then((ok) => {
      if (initial && mine === seq) {
        clearTimeout(revealTimer);
        revealTimer = null;
      }
      if (mine !== seq) return false;
      inflight3 = null;
      if (ok) {
        commit(target);
        return true;
      }
      console.warn("[LenzFlix] Design-CSS konnte nicht geladen werden");
      toast("Design konnte nicht geladen werden");
      if (initial || effective === null) commit("flix", "failed");
      else chosen = effective;
      return false;
    });
    inflight3 = { target, promise };
    return promise;
  }
  async function setTheme(id, { source = "user" } = {}) {
    const next = normalizeTheme(id);
    chosen = next;
    if (source === "user") touched++;
    if (!started) {
      saveLocal(next);
      if (source === "user") scheduleUpload(next);
      return;
    }
    const ok = await transition(desired());
    if (ok || chosen === next) {
      saveLocal(chosen);
      if (source === "user") scheduleUpload(chosen);
    }
  }
  function applyThemeClass() {
    if (!started || chosen === null) return;
    const cl2 = root().classList;
    if (effective === null) {
      if (!cl2.contains(LOADING) && inflight3) cl2.add(LOADING);
      return;
    }
    const want = desired();
    if (state !== "failed" && effective !== want && !(inflight3 && inflight3.target === want)) {
      transition(want);
      return;
    }
    if (!cl2.contains(`lfx-theme-${effective}`)) setHtmlTheme(effective);
  }
  function startTheme() {
    if (started) return;
    started = true;
    endEarly();
    lastUid = getUserId() || null;
    const fromHash = takeHashChoice();
    if (fromHash) {
      chosen = fromHash;
      touched++;
      saveLocal(fromHash);
      scheduleUpload(fromHash);
    } else {
      chosen = resolveLocalChoice();
    }
    transition(desired());
  }
  function syncThemeUser() {
    if (!started) return;
    const uid = getUserId() || null;
    if (uid !== lastUid) {
      lastUid = uid;
      remoteDone = false;
      clearTimeout(saveTimer);
      saveTimer = null;
      unsynced = false;
      chosen = resolveLocalChoice();
      transition(desired());
    }
    const fromHash = takeHashChoice();
    if (fromHash) setTheme(fromHash, { source: "user" });
    if (uid && !remoteDone && isReady()) {
      remoteDone = true;
      loadRemoteTheme(uid);
    }
  }
  function stopTheme() {
    if (!started && earlyId !== null) return;
    const cl2 = root().classList;
    const hasDom = started || [...cl2].some((c) => c.startsWith("lfx-theme-")) || document.querySelector("link.lfx-theme-css");
    if (!hasDom) return;
    started = false;
    endEarly();
    earlyAt = 0;
    removePrehide();
    seq++;
    inflight3 = null;
    clearTimeout(saveTimer);
    saveTimer = null;
    clearTimeout(revealTimer);
    revealTimer = null;
    unsynced = false;
    for (const c of [...cl2]) if (c.startsWith("lfx-theme-")) cl2.remove(c);
    removeThemeCss(null);
    effective = null;
    state = "pending";
    chosen = null;
    remoteDone = false;
    lastUid = null;
  }
  function destroyTheme() {
    abortEarly();
    stopTheme();
    listeners.clear();
    touched = 0;
  }

  // src/js/core/layout.js
  var root2 = () => document.documentElement;
  function isModern() {
    return Boolean(document.querySelector("header.MuiAppBar-root"));
  }
  function isTv() {
    return root2().classList.contains("layout-tv");
  }
  function isMobile() {
    return root2().classList.contains("layout-mobile") || window.innerWidth < 800;
  }
  function setClass(name, on) {
    const cl2 = root2().classList;
    if (cl2.contains(name) !== on) cl2.toggle(name, on);
  }
  function applyLayoutClasses() {
    setClass("lfx-js", true);
    setClass("lfx-modern", isModern());
    setClass("lfx-tv", isTv());
    applyThemeClass();
  }
  var observer = null;
  var resizeHandler = null;
  var lastMobile = null;
  var RESIZE_DEBOUNCE_MS = 200;
  function onResizeDebounced() {
    const now = isMobile();
    if (now === lastMobile) return;
    lastMobile = now;
    applyLayoutClasses();
    reevaluate();
  }
  function initLayout() {
    applyLayoutClasses();
    if (!observer && typeof MutationObserver === "function") {
      observer = new MutationObserver(applyLayoutClasses);
      observer.observe(root2(), { attributes: true, attributeFilter: ["class"] });
    }
    if (!resizeHandler) {
      lastMobile = isMobile();
      resizeHandler = debounce(onResizeDebounced, RESIZE_DEBOUNCE_MS);
      window.addEventListener("resize", resizeHandler);
    }
    return destroyLayout;
  }
  function destroyLayout() {
    if (observer) observer.disconnect();
    observer = null;
    if (resizeHandler) {
      window.removeEventListener("resize", resizeHandler);
      resizeHandler.cancel();
    }
    resizeHandler = null;
    lastMobile = null;
    const cl2 = root2().classList;
    cl2.remove("lfx-js", "lfx-modern", "lfx-tv", "lfx-scrolled", "lfx-nav-on");
    for (const c of [...cl2]) if (c.startsWith("lfx-theme-")) cl2.remove(c);
  }

  // src/js/core/csscheck.js
  function cssActive() {
    try {
      return getComputedStyle(document.documentElement).getPropertyValue("--lfx-css").trim() === "1";
    } catch {
      return false;
    }
  }

  // src/js/shared/routes.js
  var enc = encodeURIComponent;
  var titleHref = (id) => `#/home?lfx=title&id=${enc(id)}`;
  var hubHref = (libId) => `#/home?lfx=hub&lib=${enc(libId)}`;
  var browseHref = (libId, genreId) => `#/home?lfx=browse&lib=${enc(libId)}${genreId ? `&genre=${enc(genreId)}` : ""}`;
  var searchHref = (q) => `#/home?lfx=search${q ? `&q=${enc(q)}` : ""}`;
  var KINDS = ["title", "hub", "browse", "search", "new"];
  function parseLfxRoute(route) {
    const empty2 = { kind: null, id: null, lib: null, genre: null, q: null };
    if (!route || !route.params || route.path !== "/home") return empty2;
    const kind2 = route.params.get("lfx");
    if (!KINDS.includes(kind2)) return empty2;
    return {
      kind: kind2,
      id: route.params.get("id") || null,
      lib: route.params.get("lib") || null,
      genre: route.params.get("genre") || null,
      q: route.params.get("q") || null
    };
  }

  // src/js/features/themeroute.js
  var REDIRECT_KINDS = ["title", "hub", "browse", "search"];
  var lastKey = null;
  var seq2 = 0;
  function libraryUrl(id, ct) {
    const q = `topParentId=${id}&collectionType=${ct}`;
    switch (ct) {
      case "movies":
        return `#/movies?${q}`;
      case "tvshows":
        return `#/tv?${q}`;
      case "music":
        return `#/music?${q}`;
      case "books":
        return `#/books?${q}`;
      case "musicvideos":
        return `#/musicvideos?${q}`;
      case "boxsets":
        return `#/boxsets?${q}`;
      case "playlists":
        return `#/playlists?${q}`;
      case "homevideos":
        return `#/homevideos?topParentId=${id}`;
      case "livetv":
        return "#/livetv";
      default:
        return ct ? `#/list?parentId=${id}` : `#/mixed?topParentId=${id}&collectionType=mixed`;
    }
  }
  function replaceTo(hash) {
    const { pathname, search } = window.location;
    window.location.replace(`${pathname}${search}${hash}`);
  }
  function redirect(route) {
    const r = parseLfxRoute(route);
    const key = route.hash;
    if (key === lastKey) return;
    lastKey = key;
    const mine = ++seq2;
    if (r.kind === "title") {
      if (!r.id) return replaceTo("#/home");
      const { serverId } = getAuth();
      replaceTo(`#/details?id=${encodeURIComponent(r.id)}${serverId ? `&serverId=${encodeURIComponent(serverId)}` : ""}`);
    } else if (r.kind === "hub") {
      replaceTo("#/home");
    } else if (r.kind === "search") {
      replaceTo(r.q ? `#/search?query=${encodeURIComponent(r.q)}` : "#/search");
    } else if (r.kind === "browse") {
      if (!r.lib) return replaceTo("#/home");
      const lib = r.lib;
      const stillHere = () => mine === seq2 && window.location.hash.replace(/^#!?/, "") === key.replace(/^#!?/, "");
      Promise.resolve().then(() => getViews()).then((views) => {
        const items = views && views.Items || [];
        const v = items.find((x) => x.Id === lib);
        return v ? libraryUrl(v.Id, v.CollectionType) : "#/home";
      }).catch(() => `#/list?parentId=${encodeURIComponent(lib)}`).then((hash) => {
        if (stillHere()) replaceTo(hash);
      });
    }
  }
  var themeroute = {
    name: "themeroute",
    match: (route) => isTheme("flix") && REDIRECT_KINDS.includes(parseLfxRoute(route).kind),
    mount: (route) => redirect(route),
    update: (route) => redirect(route),
    unmount: () => {
      lastKey = null;
      seq2++;
    }
  };
  var themeroute_default = themeroute;

  // src/js/core/stats.js
  var stats_exports = {};
  __export(stats_exports, {
    STATS_LABEL: () => STATS_LABEL,
    getStatsUrl: () => getStatsUrl,
    isStatsHref: () => isStatsHref,
    statsHref: () => statsHref
  });
  function clean(raw) {
    const s = String(raw == null ? "" : raw).trim().replace(/^["'\s]+|["'\s]+$/g, "");
    if (!s || /[\s"'\\<>]/.test(s)) return null;
    if (/^https:\/\/[^/]/i.test(s)) return s;
    if (/^\/(?![/\\])/.test(s)) return s;
    return null;
  }
  function getStatsUrl() {
    const fromConfig = clean(window.LenzFlixConfig && window.LenzFlixConfig.statsUrl);
    if (fromConfig) return fromConfig;
    try {
      return clean(getComputedStyle(document.documentElement).getPropertyValue("--lfx-stats-url"));
    } catch {
      return null;
    }
  }
  function statsHref(theme = getTheme() || "flix") {
    const url = getStatsUrl();
    if (!url) return null;
    return `${url}${url.includes("?") ? "&" : "?"}theme=${encodeURIComponent(theme)}`;
  }
  var STATS_LABEL = "Meine Statistik";
  function isStatsHref(href) {
    const stats = getStatsUrl();
    if (!stats || !href) return false;
    try {
      const a = new URL(href, window.location.href);
      const b = new URL(stats, window.location.href);
      return a.origin === b.origin && a.pathname.replace(/\/+$/, "") === b.pathname.replace(/\/+$/, "");
    } catch {
      return false;
    }
  }

  // src/js/core/swipe.js
  var DECIDE_PX = 8;
  var SAMPLE_MS = 100;
  var FALLBACK_PX = 80;
  var EASE = "cubic-bezier(0.2,0,0,1)";
  var ANIM = `transform 180ms ${EASE}`;
  function defaultReducedMotion() {
    try {
      return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  }
  function scrolledAncestor(target, el) {
    let n = target && target.nodeType === 1 ? target : target && target.parentElement;
    while (n) {
      if (n.scrollTop > 0) return true;
      if (n === el) break;
      n = n.parentElement;
    }
    return false;
  }
  function attachSwipeClose(el, opts = {}) {
    const onClose = opts.onClose;
    const handleZone = opts.handleZone ?? 32;
    const canStart = opts.canStart || (() => true);
    const threshold = opts.threshold ?? 0.3;
    const velocity = opts.velocity ?? 0.5;
    const backdrop = opts.backdrop || null;
    const reduced = opts.reducedMotion || defaultReducedMotion;
    const now = () => Date.now();
    let state16 = "idle";
    let startX = 0;
    let startY = 0;
    let dy = 0;
    let samples = [];
    let timer = 0;
    let detached = false;
    let finishFn = null;
    const height = () => el.offsetHeight || el.getBoundingClientRect().height || 0;
    function clearTimer() {
      if (timer) clearTimeout(timer);
      timer = 0;
    }
    function resetStyles() {
      el.classList.remove("lfx-dragging");
      el.style.removeProperty("transform");
      el.style.removeProperty("transition");
      if (backdrop) {
        backdrop.style.removeProperty("opacity");
        backdrop.style.removeProperty("transition");
      }
    }
    function animateThen(ms, fn) {
      clearTimer();
      let done = false;
      const finish3 = () => {
        if (done) return;
        done = true;
        clearTimer();
        el.removeEventListener("transitionend", onEnd2);
        finishFn = null;
        fn();
      };
      const onEnd2 = (e) => {
        if (e.target === el) finish3();
      };
      finishFn = () => {
        done = true;
        el.removeEventListener("transitionend", onEnd2);
      };
      el.addEventListener("transitionend", onEnd2);
      timer = setTimeout(finish3, ms);
    }
    function setBackdrop(v, animate) {
      if (!backdrop) return;
      backdrop.style.transition = animate ? "opacity 180ms linear" : "none";
      backdrop.style.opacity = String(v);
    }
    function close2() {
      state16 = "closing";
      if (reduced()) {
        onClose();
        return;
      }
      el.style.transition = ANIM;
      el.style.transform = "translateY(100%)";
      setBackdrop(0.3, true);
      animateThen(250, () => onClose());
    }
    function springBack() {
      state16 = "closing";
      el.style.transition = ANIM;
      el.style.transform = "translateY(0px)";
      setBackdrop(1, true);
      animateThen(250, () => {
        resetStyles();
        state16 = "idle";
      });
    }
    function velocityNow() {
      if (samples.length < 2) return 0;
      const first2 = samples[0];
      const last = samples[samples.length - 1];
      const dt = last.t - first2.t;
      return dt > 0 ? (last.y - first2.y) / dt : 0;
    }
    function onStart(e) {
      if (state16 === "closing") return;
      state16 = "idle";
      const touches = e.touches || [];
      if (touches.length !== 1) {
        state16 = "ignored";
        return;
      }
      const t = touches[0];
      const rect = el.getBoundingClientRect();
      const inHandle = t.clientY - rect.top <= handleZone;
      if (!inHandle && scrolledAncestor(e.target, el)) {
        state16 = "ignored";
        return;
      }
      if (!canStart(e)) {
        state16 = "ignored";
        return;
      }
      state16 = "tracking";
      startX = t.clientX;
      startY = t.clientY;
      dy = 0;
      samples = [{ t: now(), y: startY }];
    }
    function onMove2(e) {
      if (state16 !== "tracking" && state16 !== "dragging") return;
      const touches = e.touches || [];
      if (touches.length !== 1) {
        if (state16 === "dragging") springBack();
        else state16 = "ignored";
        return;
      }
      const t = touches[0];
      const mx = t.clientX - startX;
      const my = t.clientY - startY;
      if (state16 === "tracking") {
        if (Math.hypot(mx, my) < DECIDE_PX) return;
        if (my > 0 && my > Math.abs(mx)) {
          state16 = "dragging";
          el.classList.add("lfx-dragging");
          el.style.transition = "none";
        } else {
          state16 = "ignored";
          return;
        }
      }
      if (e.cancelable) e.preventDefault();
      dy = Math.max(0, my);
      const ts = now();
      samples.push({ t: ts, y: t.clientY });
      while (samples.length > 2 && ts - samples[0].t > SAMPLE_MS) samples.shift();
      el.style.transform = `translateY(${dy}px)`;
      const h2 = height() || 300;
      setBackdrop(1 - 0.7 * Math.min(1, dy / h2), false);
    }
    function onEnd() {
      if (state16 === "dragging") {
        const h2 = height();
        const far = h2 > 0 ? dy > threshold * h2 : dy > FALLBACK_PX;
        if (far || velocityNow() > velocity) close2();
        else springBack();
      } else if (state16 !== "closing") {
        state16 = "idle";
      }
    }
    function onCancel() {
      if (state16 === "dragging") springBack();
      else if (state16 !== "closing") state16 = "idle";
    }
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove2, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onCancel);
    return function detach() {
      if (detached) return;
      detached = true;
      clearTimer();
      if (finishFn) finishFn();
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove2);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onCancel);
      resetStyles();
      state16 = "idle";
    };
  }

  // src/js/core/themepicker.js
  var ID2 = "lfx-themepicker";
  var OPEN_CLASS = "lfx-themepicker-open";
  var MOBILE_QUERY = "(max-width: 799px)";
  var current = null;
  function isMobileViewport() {
    try {
      return typeof window.matchMedia === "function" && window.matchMedia(MOBILE_QUERY).matches;
    } catch {
      return false;
    }
  }
  var span = (cls, children) => h("span", { class: cls }, children);
  function buildPreview(id) {
    const tiles = (n) => Array.from({ length: n }, () => span("lfx-tp__tile"));
    const root4 = span(`lfx-tp__preview lfx-tp__preview--${id}`);
    root4.setAttribute("aria-hidden", "true");
    if (id === "plus") {
      root4.append(
        span("lfx-tp__bar", [span("lfx-tp__dot"), span("lfx-tp__dot"), span("lfx-tp__dot"), span("lfx-tp__dot")]),
        span("lfx-tp__hero lfx-tp__hero--side lfx-tp__hero--l"),
        span("lfx-tp__hero"),
        span("lfx-tp__hero lfx-tp__hero--side lfx-tp__hero--r"),
        span("lfx-tp__pager", [span("lfx-tp__pdot is-on"), span("lfx-tp__pdot"), span("lfx-tp__pdot")]),
        span("lfx-tp__row", tiles(5))
      );
    } else if (id === "prime") {
      root4.append(
        span("lfx-tp__hero", [span("lfx-tp__line"), span("lfx-tp__line lfx-tp__line--s"), span("lfx-tp__btn")]),
        span("lfx-tp__row", tiles(4).map((t) => {
          t.append(span("lfx-tp__badge-mini"));
          return t;
        }))
      );
    } else {
      root4.append(span("lfx-tp__logo"), span("lfx-tp__hero"), span("lfx-tp__row", tiles(4)));
    }
    return root4;
  }
  function buildMark(id, name) {
    if (id === "plus") {
      return span("lfx-tp__mark lfx-tp__mark--plus", [span("lfx-tp__mark-text", ["LENZ"]), span("lfx-tp__mark-plus", ["+"])]);
    }
    if (id === "prime") {
      return span("lfx-tp__mark lfx-tp__mark--prime", [span("lfx-tp__mark-text", ["lenzprime"])]);
    }
    return span("lfx-tp__mark lfx-tp__mark--flix", [name]);
  }
  function buildCard(c, id) {
    const meta = THEME_META[id] || { id, name: id, tagline: "", palette: [] };
    const btn = h("button", {
      type: "button",
      class: `lfx-tp__card lfx-tp__card--${id}`,
      "aria-pressed": "false",
      dataset: { theme: id }
    }, [
      buildPreview(id),
      span("lfx-tp__info", [
        buildMark(id, meta.name),
        span("lfx-tp__tagline", [meta.tagline || ""]),
        span("lfx-tp__palette", (meta.palette || []).map((hex) => h("span", { class: "lfx-tp__swatch", style: { background: hex } })))
      ]),
      span("lfx-tp__state", [span("lfx-tp__active", ["Aktiv"]), span("lfx-tp__spin")])
    ]);
    btn.setAttribute("aria-label", `${meta.name}${meta.tagline ? `, ${meta.tagline}` : ""}`);
    btn.addEventListener("click", () => choose(c, id));
    return btn;
  }
  function refresh(c) {
    const chosen2 = getChosenTheme();
    for (const [id, btn] of c.cards) {
      const on = id === chosen2;
      btn.setAttribute("aria-pressed", String(on));
      btn.classList.toggle("is-active", on);
      const busy = c.loading === id;
      if (busy) btn.setAttribute("aria-busy", "true");
      else btn.removeAttribute("aria-busy");
      btn.classList.toggle("is-loading", busy);
    }
  }
  function choose(c, id) {
    if (current !== c || c.loading) return;
    if (id === getChosenTheme()) return;
    c.loading = id;
    refresh(c);
    const done = () => {
      if (c.loading === id) c.loading = null;
      if (current === c) refresh(c);
    };
    let p;
    try {
      p = Promise.resolve(setTheme(id, { source: "user" }));
    } catch {
      done();
      return;
    }
    p.then(done, done);
  }
  function closeThemePicker() {
    const c = current;
    if (!c) return;
    current = null;
    if (c.detachSwipe) c.detachSwipe();
    if (c.unsub) c.unsub();
    window.removeEventListener("keydown", c.onKeydown, true);
    c.overlay.removeEventListener("click", c.onOverlayClick);
    unmountPoint(c.overlay);
    document.documentElement.classList.remove(OPEN_CLASS);
    const back = c.returnFocus;
    if (back && typeof back.focus === "function" && back.isConnected) {
      try {
        back.focus({ preventScroll: true });
      } catch {
      }
    }
  }
  function openThemePicker({ returnFocus } = {}) {
    if (current) closeThemePicker();
    const sheet = isMobileViewport();
    const overlay = mountPoint(ID2, { className: `lfx-tp${sheet ? " lfx-tp--sheet" : ""}` });
    overlay.className = `lfx-tp${sheet ? " lfx-tp--sheet" : ""}`;
    const c = { overlay, cards: /* @__PURE__ */ new Map(), loading: null, returnFocus: returnFocus || null };
    const closeBtn = h("button", { type: "button", class: "lfx-tp__close", "aria-label": "Schlie\xDFen" }, "\xD7");
    closeBtn.addEventListener("click", () => closeThemePicker());
    const dialog = h("div", { class: "lfx-tp__dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "lfx-tp-title", tabindex: "-1" }, [
      h("div", { class: "lfx-tp__handle", "aria-hidden": "true" }),
      closeBtn,
      h("div", { class: "lfx-tp__head" }, [
        h("h2", { class: "lfx-tp__title", id: "lfx-tp-title" }, "Design"),
        h("p", { class: "lfx-tp__sub" }, "W\xE4hle, wie deine Mediathek aussieht.")
      ])
    ]);
    const grid = h("div", { class: "lfx-tp__grid" });
    for (const id of THEMES) {
      const card3 = buildCard(c, id);
      c.cards.set(id, card3);
      grid.append(card3);
    }
    dialog.append(grid);
    overlay.replaceChildren(dialog);
    c.dialog = dialog;
    c.onKeydown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        closeThemePicker();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = [...dialog.querySelectorAll("button:not([disabled])")];
      if (!nodes.length) {
        e.preventDefault();
        return;
      }
      const first2 = nodes[0];
      const last = nodes[nodes.length - 1];
      const active4 = document.activeElement;
      if (!dialog.contains(active4) || active4 === dialog) {
        e.preventDefault();
        (e.shiftKey ? last : first2).focus();
      } else if (e.shiftKey && active4 === first2) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active4 === last) {
        e.preventDefault();
        first2.focus();
      }
    };
    c.onOverlayClick = (e) => {
      if (e.target === overlay) closeThemePicker();
    };
    window.addEventListener("keydown", c.onKeydown, true);
    overlay.addEventListener("click", c.onOverlayClick);
    c.unsub = onThemeChange(() => {
      if (current === c) refresh(c);
    });
    if (sheet) {
      c.detachSwipe = attachSwipeClose(dialog, { onClose: () => {
        if (current === c) closeThemePicker();
      } });
    }
    document.documentElement.classList.add(OPEN_CLASS);
    current = c;
    refresh(c);
    const activeCard = c.cards.get(getChosenTheme()) || grid.querySelector("button");
    if (activeCard) activeCard.focus({ preventScroll: true });
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
    raf(() => {
      if (current === c) overlay.classList.add("is-open");
    });
    return c;
  }

  // src/js/core/ambient.js
  var ID3 = "lfx-ambient";
  var clamp = (n) => Math.max(0, Math.min(255, Math.round(Number(n) || 0)));
  var current2 = null;
  function setAmbient(r, g, b) {
    const [R, G, B] = [clamp(r), clamp(g), clamp(b)];
    current2 = [R, G, B];
    const s = document.documentElement.style;
    s.setProperty("--lfx-ambient-r", String(R));
    s.setProperty("--lfx-ambient-g", String(G));
    s.setProperty("--lfx-ambient-b", String(B));
    s.setProperty("--lfx-ambient", `${R} ${G} ${B}`);
  }
  function resetAmbient() {
    current2 = null;
    const s = document.documentElement.style;
    for (const p of ["--lfx-ambient-r", "--lfx-ambient-g", "--lfx-ambient-b", "--lfx-ambient"]) s.removeProperty(p);
  }
  function mountAmbient() {
    return mountPoint(ID3, { before: document.body.firstChild, className: "lfx-ambient" });
  }
  function unmountAmbient() {
    unmountPoint(ID3);
    resetAmbient();
  }

  // src/js/features/nav.js
  var { STATS_LABEL: STATS_LABEL2 } = stats_exports;
  var statsLink = () => typeof statsHref === "function" ? statsHref() : getStatsUrl();
  var NAV_ID = "lfx-nav";
  var EXCLUDED = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video|dashboard|queue)/;
  var SCROLL_THRESHOLD = 10;
  function viewUrl(view) {
    const id = view.Id;
    const ct = view.CollectionType;
    const q = `topParentId=${id}&collectionType=${ct}`;
    switch (ct) {
      case "movies":
        return `#/movies?${q}`;
      case "tvshows":
        return `#/tv?${q}`;
      case "music":
        return `#/music?${q}`;
      case "books":
        return `#/books?${q}`;
      case "musicvideos":
        return `#/musicvideos?${q}`;
      case "boxsets":
        return `#/boxsets?${q}`;
      case "playlists":
        return `#/playlists?${q}`;
      case "homevideos":
        return `#/homevideos?topParentId=${id}`;
      case "livetv":
        return "#/livetv";
      default:
        return ct ? `#/list?parentId=${id}` : `#/mixed?topParentId=${id}&collectionType=mixed`;
    }
  }
  var VIEW_LABELS = { boxsets: "Sammlungen", playlists: "Playlists" };
  function buildNavModel(views) {
    const items = views && views.Items || (Array.isArray(views) ? views : []);
    const series = items.find((v) => v.CollectionType === "tvshows") || null;
    const movies = items.find((v) => v.CollectionType === "movies") || null;
    const more = items.filter((v) => v !== series && v !== movies).map((v) => ({ id: v.Id, label: VIEW_LABELS[v.CollectionType] || v.Name, href: viewUrl(v) }));
    return { series, movies, more };
  }
  function activeKey(route, model) {
    const { path, params } = route;
    if (path === "/home") {
      if (params.get("lfx") === "new") return "new";
      return params.get("tab") === "1" ? "list" : "home";
    }
    const lib = params.get("topParentId") || params.get("parentId");
    if (path === "/tv") return !lib || model.series && lib === model.series.Id ? "series" : "more";
    if (path === "/movies") return !lib || model.movies && lib === model.movies.Id ? "movies" : "more";
    if (lib && model.series && lib === model.series.Id) return "series";
    if (lib && model.movies && lib === model.movies.Id) return "movies";
    if (lib && model.more.some((m) => m.id === lib)) return "more";
    return null;
  }
  function navItems(model) {
    const items = [{ key: "home", label: "Startseite", href: "#/home" }];
    if (model.series) items.push({ key: "series", label: "Serien", href: viewUrl(model.series) });
    if (model.movies) items.push({ key: "movies", label: "Filme", href: viewUrl(model.movies) });
    items.push({ key: "new", label: "Neu und beliebt", href: "#/home?lfx=new" });
    items.push({ key: "list", label: "Meine Liste", href: "#/home?tab=1" });
    return items;
  }
  var state2 = {
    nav: null,
    model: { series: null, movies: null, more: [] },
    route: null,
    cleanups: [],
    menuOpen: false,
    seq: 0
  };
  function setMenu(open2) {
    state2.menuOpen = open2;
    const wrap = state2.nav && state2.nav.querySelector(".lfx-nav__more");
    if (!wrap) return;
    wrap.classList.toggle("is-open", open2);
    const btn = wrap.querySelector(".lfx-nav__more-btn");
    if (btn) btn.setAttribute("aria-expanded", String(open2));
  }
  function applyActive() {
    if (!state2.nav || !state2.route) return;
    const key = activeKey(state2.route, state2.model);
    for (const el of state2.nav.querySelectorAll("[data-key]")) {
      const on = el.dataset.key === key;
      el.classList.toggle("is-active", on);
      if (el.tagName === "A") {
        if (on) el.setAttribute("aria-current", "page");
        else el.removeAttribute("aria-current");
      }
    }
  }
  function render() {
    const nav = state2.nav;
    if (!nav) return;
    nav.textContent = "";
    for (const it of navItems(state2.model)) {
      nav.append(h("a", { class: "lfx-nav__item", href: it.href, dataset: { key: it.key } }, it.label));
    }
    const more = state2.model.more;
    const statsUrl = statsLink();
    {
      const entries = more.map((m) => h("a", { class: "lfx-nav__menu-item", role: "menuitem", href: m.href, dataset: { id: m.id } }, m.label));
      if (statsUrl) entries.push(h("a", { class: "lfx-nav__menu-item lfx-nav__menu-item--stats", role: "menuitem", href: statsUrl }, STATS_LABEL2));
      const designBtn = h("button", { type: "button", class: "lfx-nav__menu-item lfx-nav__menu-item--design", role: "menuitem" }, "Design Einstellungen");
      entries.push(designBtn);
      const menu = h("div", { class: "lfx-nav__menu", role: "menu", id: "lfx-nav-menu" }, entries);
      const btn = h("button", {
        type: "button",
        class: "lfx-nav__item lfx-nav__more-btn",
        "aria-haspopup": "true",
        "aria-expanded": "false",
        "aria-controls": "lfx-nav-menu",
        dataset: { key: "more" }
      }, ["Mehr", h("span", { class: "lfx-nav__caret", "aria-hidden": "true" })]);
      const wrap = h("div", { class: "lfx-nav__more" }, [btn, menu]);
      btn.addEventListener("click", () => setMenu(!state2.menuOpen));
      wrap.addEventListener("mouseenter", () => setMenu(true));
      wrap.addEventListener("mouseleave", () => setMenu(false));
      wrap.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          setMenu(false);
          btn.focus();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          const items = [...menu.querySelectorAll('[role="menuitem"]')];
          const i = items.indexOf(document.activeElement);
          const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
          setMenu(true);
          items[next].focus();
          e.preventDefault();
        }
      });
      menu.addEventListener("click", () => setMenu(false));
      designBtn.addEventListener("click", () => {
        setMenu(false);
        openThemePicker({ returnFocus: btn });
      });
      nav.append(wrap);
      if (state2.menuOpen) setMenu(true);
    }
    applyActive();
  }
  function onScroll() {
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const root4 = document.documentElement;
    const on = y > SCROLL_THRESHOLD;
    if (root4.classList.contains("lfx-scrolled") !== on) root4.classList.toggle("lfx-scrolled", on);
  }
  function onDocClick(e) {
    if (state2.menuOpen && state2.nav && !state2.nav.contains(e.target)) setMenu(false);
  }
  async function loadViews(seq3) {
    try {
      const views = await cached(`views:${getUserId()}`, getViews, 5 * 6e4);
      if (seq3 !== state2.seq || !state2.nav) return;
      state2.model = buildNavModel(views);
    } catch {
      if (seq3 !== state2.seq || !state2.nav) return;
      state2.model = { series: null, movies: null, more: [] };
    }
    render();
  }
  var navFeature = {
    name: "nav",
    match(route) {
      return isReady() && isModern() && !isTv() && isTheme("flix") && !EXCLUDED.test(route.path);
    },
    mount(route) {
      const seq3 = ++state2.seq;
      state2.route = route;
      state2.nav = mountPoint(NAV_ID, { tag: "nav", className: "lfx-nav" });
      state2.nav.setAttribute("aria-label", "Hauptnavigation");
      mountAmbient();
      document.documentElement.classList.add("lfx-nav-on");
      render();
      window.addEventListener("scroll", onScroll, { passive: true });
      document.addEventListener("click", onDocClick, true);
      state2.cleanups.push(
        () => window.removeEventListener("scroll", onScroll),
        () => document.removeEventListener("click", onDocClick, true)
      );
      onScroll();
      loadViews(seq3);
    },
    update(route) {
      const changed = !state2.route || state2.route.hash !== route.hash;
      state2.route = route;
      if (changed) setMenu(false);
      applyActive();
    },
    unmount() {
      state2.seq++;
      for (const fn of state2.cleanups.splice(0)) fn();
      unmountPoint(NAV_ID);
      unmountAmbient();
      const cl2 = document.documentElement.classList;
      cl2.remove("lfx-nav-on", "lfx-scrolled");
      state2.nav = null;
      state2.menuOpen = false;
    }
  };
  var nav_default = navFeature;

  // src/js/features/mobilenav.js
  var { STATS_LABEL: STATS_LABEL3 } = stats_exports;
  var statsLink2 = () => typeof statsHref === "function" ? statsHref() : getStatsUrl();
  var ROOT_ID = "lfx-mnav";
  var OVERLAY_ID = "lfx-mnav-overlay";
  var EXCLUDED2 = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video|dashboard|queue)/;
  var FOCUSABLE = "a[href], button:not([disabled])";
  function showsPills(route) {
    return route.path === "/home" && route.params.get("tab") !== "1" && !route.params.get("lfx");
  }
  function pillItems(model) {
    return navItems(model).filter((it) => it.key === "series" || it.key === "movies" || it.key === "list");
  }
  function overlayItems(model) {
    const items = navItems(model).map((it) => ({ key: it.key, label: it.label, href: it.href }));
    for (const m of model.more) items.push({ key: "more", label: m.label, href: m.href, id: m.id });
    const statsUrl = statsLink2();
    if (statsUrl) items.push({ key: "stats", label: STATS_LABEL3, href: statsUrl, external: true });
    items.push({ key: "design", label: "Design Einstellungen", action: "design" });
    return items;
  }
  var state3 = {
    model: { series: null, movies: null, more: [] },
    route: null,
    root: null,
    pills: null,
    overlay: null,
    catBtn: null,
    returnFocus: null,
    cleanups: [],
    seq: 0
  };
  var cl = () => document.documentElement.classList;
  function isOpen() {
    return Boolean(state3.overlay && !state3.overlay.hidden);
  }
  function openOverlay() {
    if (!state3.overlay || isOpen()) return;
    state3.returnFocus = document.activeElement;
    state3.overlay.hidden = false;
    cl().add("lfx-mnav-open");
    if (state3.catBtn) state3.catBtn.setAttribute("aria-expanded", "true");
    const close2 = state3.overlay.querySelector(".lfx-mnav-overlay__close");
    if (close2) close2.focus();
  }
  function closeOverlay({ restoreFocus = true } = {}) {
    if (!state3.overlay || !isOpen()) return;
    state3.overlay.hidden = true;
    cl().remove("lfx-mnav-open");
    if (state3.catBtn) state3.catBtn.setAttribute("aria-expanded", "false");
    const back = state3.returnFocus;
    state3.returnFocus = null;
    if (restoreFocus && back && typeof back.focus === "function" && back.isConnected) back.focus();
  }
  function onOverlayKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeOverlay();
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = [...state3.overlay.querySelectorAll(FOCUSABLE)];
    if (!nodes.length) return;
    const first2 = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first2) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first2.focus();
    }
  }
  function applyActive2() {
    if (!state3.route) return;
    const key = activeKey(state3.route, state3.model);
    for (const el of document.querySelectorAll(`#${ROOT_ID} [data-key], #${OVERLAY_ID} [data-key]`)) {
      if (el.dataset.key === "cats") continue;
      const on = el.dataset.key === key;
      el.classList.toggle("is-active", on);
      if (el.tagName === "A") {
        if (on) el.setAttribute("aria-current", "page");
        else el.removeAttribute("aria-current");
      }
    }
  }
  function applyPillsVisibility() {
    const on = Boolean(state3.route && showsPills(state3.route));
    if (state3.pills) state3.pills.hidden = !on;
    if (cl().contains("lfx-mnav-pills") !== on) cl().toggle("lfx-mnav-pills", on);
  }
  function render2() {
    if (!state3.pills || !state3.overlay) return;
    state3.pills.textContent = "";
    for (const it of pillItems(state3.model)) {
      state3.pills.append(h("a", { class: "lfx-mnav__pill", href: it.href, dataset: { key: it.key } }, it.label));
    }
    state3.catBtn = h("button", {
      type: "button",
      class: "lfx-mnav__pill lfx-mnav__pill--cats",
      "aria-haspopup": "dialog",
      "aria-expanded": String(isOpen()),
      "aria-controls": OVERLAY_ID,
      dataset: { key: "cats" }
    }, ["Mehr", h("span", { class: "lfx-mnav__caret", "aria-hidden": "true" })]);
    state3.catBtn.addEventListener("click", () => isOpen() ? closeOverlay() : openOverlay());
    state3.pills.append(state3.catBtn);
    const list = h(
      "ul",
      { class: "lfx-mnav-overlay__list" },
      overlayItems(state3.model).map((it) => h("li", null, [
        it.action ? h("button", { type: "button", class: `lfx-mnav-overlay__link lfx-mnav-overlay__link--${it.action}`, dataset: { action: it.action } }, it.label) : (
          // Externe Seite (Statistik): kein data-key, damit sie nie als aktiver Tab markiert wird
          h("a", { class: `lfx-mnav-overlay__link${it.external ? " lfx-mnav-overlay__link--stats" : ""}`, href: it.href, ...it.external ? {} : { dataset: { key: it.key } } }, it.label)
        )
      ]))
    );
    const close2 = h("button", { type: "button", class: "lfx-mnav-overlay__close", "aria-label": "Schlie\xDFen" }, "\xD7");
    close2.addEventListener("click", () => closeOverlay());
    state3.overlay.textContent = "";
    state3.overlay.append(list, close2);
    applyActive2();
    applyPillsVisibility();
  }
  async function loadViews2(seq3) {
    try {
      const views = await cached(`views:${getUserId()}`, getViews, 5 * 6e4);
      if (seq3 !== state3.seq || !state3.root) return;
      state3.model = buildNavModel(views);
    } catch {
      if (seq3 !== state3.seq || !state3.root) return;
      state3.model = { series: null, movies: null, more: [] };
    }
    render2();
  }
  var mobilenavFeature = {
    name: "mobilenav",
    match(route) {
      return isReady() && isModern() && !isTv() && isMobile() && isTheme("flix") && !EXCLUDED2.test(route.path);
    },
    mount(route) {
      const seq3 = ++state3.seq;
      state3.route = route;
      state3.root = mountPoint(ROOT_ID, { className: "lfx-mnav" });
      state3.root.textContent = "";
      state3.pills = h("div", { class: "lfx-mnav__pills", role: "navigation", "aria-label": "Filter", hidden: true });
      state3.root.append(
        h("a", { class: "lfx-mnav__logo", href: "#/home", "aria-label": "LenzFlix Startseite" }),
        state3.pills
      );
      state3.overlay = mountPoint(OVERLAY_ID, { className: "lfx-mnav-overlay" });
      state3.overlay.setAttribute("role", "dialog");
      state3.overlay.setAttribute("aria-modal", "true");
      state3.overlay.setAttribute("aria-label", "Mehr");
      state3.overlay.hidden = true;
      state3.overlay.addEventListener("keydown", onOverlayKey);
      const onOverlayClick = (e) => {
        const t = e.target.closest && e.target.closest("a, button[data-action]");
        if (!t) return;
        const opener = state3.returnFocus || state3.catBtn;
        closeOverlay({ restoreFocus: false });
        if (t.dataset && t.dataset.action === "design") openThemePicker({ returnFocus: opener });
      };
      state3.overlay.addEventListener("click", onOverlayClick);
      state3.cleanups.push(
        () => state3.overlay && state3.overlay.removeEventListener("keydown", onOverlayKey),
        () => state3.overlay && state3.overlay.removeEventListener("click", onOverlayClick)
      );
      cl().add("lfx-mnav-on");
      render2();
      loadViews2(seq3);
    },
    update(route) {
      const changed = !state3.route || state3.route.hash !== route.hash;
      state3.route = route;
      if (changed) closeOverlay({ restoreFocus: false });
      applyActive2();
      applyPillsVisibility();
    },
    unmount() {
      state3.seq++;
      closeOverlay({ restoreFocus: false });
      for (const fn of state3.cleanups.splice(0)) fn();
      unmountPoint(ROOT_ID);
      unmountPoint(OVERLAY_ID);
      cl().remove("lfx-mnav-on", "lfx-mnav-pills", "lfx-mnav-open");
      state3.root = null;
      state3.pills = null;
      state3.overlay = null;
      state3.catBtn = null;
      state3.returnFocus = null;
      state3.model = { series: null, movies: null, more: [] };
    }
  };
  var mobilenav_default = mobilenavFeature;

  // src/js/features/billboard.js
  var billboard_exports = {};
  __export(billboard_exports, {
    ROTATE_MS: () => ROTATE_MS,
    TRAILER_DELAY_MS: () => TRAILER_DELAY_MS,
    render: () => render3
  });

  // src/js/core/color.js
  var DEFAULT_AMBIENT = [27, 40, 41];
  function rgbToHsl(r, g, b) {
    const R = r / 255, G = g / 255, B = b / 255;
    const max = Math.max(R, G, B), min = Math.min(R, G, B);
    const l = (max + min) / 2;
    const d = max - min;
    if (d === 0) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    let h2;
    if (max === R) h2 = (G - B) / d % 6;
    else if (max === G) h2 = (B - R) / d + 2;
    else h2 = (R - G) / d + 4;
    h2 *= 60;
    if (h2 < 0) h2 += 360;
    return [h2, s, l];
  }
  function hslToRgb(h2, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const hp = (h2 % 360 + 360) % 360 / 60;
    const x = c * (1 - Math.abs(hp % 2 - 1));
    let r, g, b;
    if (hp < 1) [r, g, b] = [c, x, 0];
    else if (hp < 2) [r, g, b] = [x, c, 0];
    else if (hp < 3) [r, g, b] = [0, c, x];
    else if (hp < 4) [r, g, b] = [0, x, c];
    else if (hp < 5) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const m = l - c / 2;
    return [r, g, b].map((v) => Math.round((v + m) * 255));
  }
  function dominantColor(rgba) {
    const buckets = /* @__PURE__ */ new Map();
    for (let i = 0; i + 3 < rgba.length; i += 4) {
      const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], a = rgba[i + 3];
      if (a < 128) continue;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const l = (max + min) / 510;
      if (l < 0.08 || l > 0.92) continue;
      const d = (max - min) / 255;
      const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
      const w = s + 0.05;
      const key = r >> 4 << 8 | g >> 4 << 4 | b >> 4;
      let e = buckets.get(key);
      if (!e) buckets.set(key, e = { w: 0, r: 0, g: 0, b: 0 });
      e.w += w;
      e.r += r * w;
      e.g += g * w;
      e.b += b * w;
    }
    let best = null;
    for (const e of buckets.values()) if (!best || e.w > best.w) best = e;
    if (!best) return null;
    return [Math.round(best.r / best.w), Math.round(best.g / best.w), Math.round(best.b / best.w)];
  }
  function clampAmbient([r, g, b], { lMin = 0.18, lMax = 0.24, sMax = 0.55 } = {}) {
    const [h2, s, l] = rgbToHsl(r, g, b);
    return hslToRgb(h2, Math.min(s, sMax), Math.min(lMax, Math.max(lMin, l)));
  }
  function ambientFromPixels(rgba) {
    const dom = dominantColor(rgba);
    return dom ? clampAmbient(dom) : DEFAULT_AMBIENT.slice();
  }

  // src/js/core/itemstore.js
  var store2 = /* @__PURE__ */ new Map();
  var MAX = 2e3;
  function putItems(items) {
    for (const it of items || []) {
      if (!it || !it.Id) continue;
      store2.delete(it.Id);
      store2.set(it.Id, it);
    }
    while (store2.size > MAX) store2.delete(store2.keys().next().value);
  }
  function getStoredItem(id) {
    return store2.get(id) || null;
  }

  // src/js/core/icons.js
  var svg = (path) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${path}</svg>`;
  var ICON_MORE = svg('<circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>');
  var ICON_DOWNLOAD = svg('<path d="M11 3h2v9.2l3.6-3.6 1.4 1.4-6 6-6-6 1.4-1.4 3.6 3.6z"/><path d="M5 19h14v2H5z"/>');
  var ICON_LIKE = svg(
    '<path d="M2 10h4v11H2z"/><path d="M8 21V10l4.3-7.2c.4-.6 1.1-.9 1.8-.7 1 .3 1.6 1.3 1.4 2.3L14.8 9H20.5c1.2 0 2.1 1.1 1.9 2.3l-1.3 8.5c-.2 1.2-1.2 2.2-2.4 2.2z"/>'
  );
  var ICON_LIKE_OUTLINE = svg(
    '<path fill-rule="evenodd" d="M2 10h4v11H2zm1.5 1.5v8h1v-8z"/><path fill-rule="evenodd" d="M8 10l4.3-7.2c.4-.6 1.1-.9 1.8-.7 1 .3 1.6 1.3 1.4 2.3L14.8 9H20.5c1.2 0 2.1 1.1 1.9 2.3l-1.3 8.5c-.2 1.2-1.2 2.2-2.4 2.2H8zm2 1.1V19h8.7l1.2-7.4h-7.3l1.2-5.6z"/>'
  );
  var ICON_EYE = svg(
    '<path fill-rule="evenodd" d="M12 5c4.6 0 8.6 2.9 10.5 7-1.9 4.1-5.9 7-10.5 7S3.4 16.100 1.500 12C3.400 7.900 7.400 5 12 5zm0 2c-3.500 0-6.600 2-8.200 5 1.600 3 4.700 5 8.200 5s6.600-2 8.200-5C18.600 9 15.500 7 12 7zm0 1.500a3.500 3.500 0 110 7 3.500 3.500 0 010-7zm0 2a1.500 1.500 0 100 3 1.500 1.500 0 000-3z"/>'
  );
  var ICON_EYE_CHECK = svg(
    '<path fill-rule="evenodd" d="M12 5c4.600 0 8.600 2.900 10.500 7-1.900 4.100-5.900 7-10.500 7S3.400 16.100 1.500 12C3.400 7.900 7.400 5 12 5zm0 2c-3.500 0-6.600 2-8.200 5 1.600 3 4.700 5 8.200 5s6.600-2 8.200-5C18.600 9 15.500 7 12 7z"/><path d="M10.500 14.600L8.400 12.500l1-1 1.100 1.100 3.100-3.100 1 1z"/>'
  );

  // src/js/core/playback.js
  function isVisible(el) {
    return el.getClientRects().length > 0;
  }
  function findProxyContainer() {
    const all = [...document.querySelectorAll(".itemsContainer")].filter((c) => c.querySelector(".card"));
    return all.find(isVisible) || all[0] || null;
  }
  function buildProxy(item, resume) {
    const el = document.createElement("div");
    el.className = "itemAction lfx-proxy";
    el.style.display = "none";
    el.setAttribute("data-action", resume ? "resume" : "play");
    el.setAttribute("data-id", item.Id);
    el.setAttribute("data-serverid", item.ServerId || getAuth().serverId || "");
    el.setAttribute("data-type", item.Type || "");
    el.setAttribute("data-mediatype", item.MediaType || "");
    el.setAttribute("data-isfolder", String(Boolean(item.IsFolder)));
    const ticks = resume && item.UserData ? item.UserData.PlaybackPositionTicks || 0 : 0;
    if (ticks) el.setAttribute("data-positionticks", String(ticks));
    return el;
  }
  function playViaDetails(item, resume, timeoutMs) {
    return new Promise((resolve2) => {
      const serverId = item.ServerId || getAuth().serverId || "";
      window.location.hash = `#/details?id=${item.Id}&serverId=${serverId}`;
      const started2 = Date.now();
      const timer = setInterval(() => {
        const wrap = document.querySelector(".itemDetailPage:not(.hide) .mainDetailButtons");
        const visible = (sel) => wrap && [...wrap.querySelectorAll(sel)].find((b) => !b.classList.contains("hide"));
        const target = resume ? visible(".btnPlay") : visible(".btnReplay") || visible(".btnPlay");
        if (target) {
          clearInterval(timer);
          target.click();
          resolve2(true);
        } else if (Date.now() - started2 > timeoutMs) {
          clearInterval(timer);
          resolve2(false);
        }
      }, 150);
    });
  }
  async function play(item, { resume = false, timeoutMs = 8e3 } = {}) {
    if (!item || !item.Id) return false;
    const container = findProxyContainer();
    if (container) {
      const proxy = buildProxy(item, resume);
      container.append(proxy);
      try {
        proxy.click();
      } finally {
        proxy.remove();
      }
      return true;
    }
    return playViaDetails(item, resume, timeoutMs);
  }

  // src/js/core/itemmenu.js
  var END_QUIET_MS = 800;
  var NO_DIALOG_TIMEOUT_MS = 4e3;
  var HIDDEN_FIRST = ["download", "downloadall", "multiSelect"];
  var CHANGING_COMMANDS = ["delete", "edit", "editimages", "editsubtitles", "identify", "refresh", "addtocollection", "removefromcollection"];
  var RETRY_COMMANDS = ["delete", "refresh"];
  var RETRY_DELAYS = [1e3, 3e3, 8e3];
  var FOLDER_TYPES = ["Series", "Season", "BoxSet"];
  var EDGE = 8;
  function rectOf(anchor) {
    if (anchor && typeof anchor.getBoundingClientRect === "function") return anchor.getBoundingClientRect();
    const x = Number(anchor && anchor.x) || 0;
    const y = Number(anchor && anchor.y) || 0;
    return { left: x, right: x, top: y, bottom: y, width: 0, height: 0 };
  }
  function computeMenuPosition(anchorRect, viewport, menu = { w: 300, h: 320 }) {
    const vp = viewport || { w: window.innerWidth, h: window.innerHeight };
    const gap = 4;
    const clamp2 = (v, min, max) => Math.max(min, Math.min(v, Math.max(min, max)));
    const isPoint = anchorRect.right === anchorRect.left;
    let x = isPoint ? anchorRect.left : anchorRect.right - menu.w;
    x = clamp2(x, EDGE, vp.w - menu.w - EDGE);
    let y = anchorRect.bottom + gap;
    if (y + menu.h > vp.h - EDGE) {
      const above = anchorRect.top - gap - menu.h;
      y = above >= EDGE ? above : y;
    }
    y = clamp2(y, EDGE, vp.h - menu.h - EDGE);
    return { x, y };
  }
  var listeners2 = /* @__PURE__ */ new Set();
  var ownDeletes = /* @__PURE__ */ new Set();
  function onItemsChanged(fn) {
    listeners2.add(fn);
    return () => listeners2.delete(fn);
  }
  function emit2({ removed = [], updated = [] }) {
    if (!removed.length && !updated.length) return;
    if (removed.some((id) => ownDeletes.has(id))) {
      for (const id of removed) ownDeletes.delete(id);
      toast("Gel\xF6scht");
    }
    for (const fn of [...listeners2]) {
      try {
        fn({ removed, updated });
      } catch {
      }
    }
  }
  var retryTimers = [];
  function clearRetries() {
    retryTimers.forEach(clearTimeout);
    retryTimers = [];
  }
  function isNetworkError(err) {
    return err instanceof TypeError || /failed to fetch|network/i.test(String(err && err.message));
  }
  async function verifyItem(id, removalOnly = false) {
    let item;
    try {
      item = await getItem(id);
    } catch (err) {
      if (isNetworkError(err) || !/\b404\b/.test(String(err && err.message))) return false;
      emit2({ removed: [id], updated: [] });
      return true;
    }
    if (!item || !item.Id) {
      emit2({ removed: [id], updated: [] });
      return true;
    }
    if (removalOnly) return false;
    putItems([item]);
    emit2({ removed: [], updated: [id] });
    return false;
  }
  function afterSession(id, command) {
    if (!id || !CHANGING_COMMANDS.includes(command)) return;
    if (command === "delete") ownDeletes.add(id);
    let done = false;
    const run = async () => {
      if (done) return;
      if (await verifyItem(id, command === "delete")) done = true;
    };
    run();
    if (RETRY_COMMANDS.includes(command)) {
      const last = RETRY_DELAYS[RETRY_DELAYS.length - 1];
      for (const delay of RETRY_DELAYS) {
        retryTimers.push(
          setTimeout(async () => {
            await run();
            if (delay === last && !done) ownDeletes.delete(id);
          }, delay)
        );
      }
    }
  }
  var session = null;
  function clearMarker() {
    const root4 = document.documentElement;
    root4.classList.remove("lfx-menu-open");
    root4.style.removeProperty("--lfx-menu-x");
    root4.style.removeProperty("--lfx-menu-y");
  }
  function setPosition(pos) {
    const root4 = document.documentElement;
    root4.style.setProperty("--lfx-menu-x", `${Math.round(pos.x)}px`);
    root4.style.setProperty("--lfx-menu-y", `${Math.round(pos.y)}px`);
  }
  var isTouchSheet = () => typeof window.matchMedia === "function" && window.matchMedia("(hover: none), (max-width: 799px)").matches;
  function attachSheetSwipe(s, sheet) {
    if (!isTouchSheet()) return;
    const backdrop = document.querySelector(".dialogBackdrop");
    s.detachSwipe = attachSwipeClose(sheet, {
      backdrop,
      onClose: () => {
        if (s.escaped || !sheet.isConnected) return;
        s.escaped = true;
        history.back();
      }
    });
  }
  function teardown(s) {
    if (s.detachSwipe) {
      s.detachSwipe();
      s.detachSwipe = null;
    }
    s.observer.disconnect();
    clearTimeout(s.endTimer);
    clearTimeout(s.startTimer);
    document.removeEventListener("click", s.onClick, true);
    window.removeEventListener("keydown", s.onKey, true);
    s.wrapper.remove();
    clearMarker();
    if (session === s) session = null;
  }
  function finish(s) {
    if (session !== s) return;
    teardown(s);
    const { anchor, opts, command, item } = s;
    if (anchor && typeof anchor.focus === "function" && anchor.isConnected) {
      try {
        anchor.focus({ preventScroll: true });
      } catch {
      }
    }
    if (typeof opts.onClose === "function") {
      try {
        opts.onClose({ command });
      } catch {
      }
    }
    afterSession(item.Id, command);
  }
  function focusFirstEntry(sheet) {
    const entries = [...sheet.querySelectorAll(".actionSheetMenuItem")].filter(
      (el) => !HIDDEN_FIRST.includes(el.getAttribute("data-id")) && !el.hidden && el.style.display !== "none"
    );
    if (entries[0]) entries[0].focus({ preventScroll: true });
  }
  function onMutation(s) {
    const containers = document.querySelectorAll(".dialogContainer");
    if (containers.length) {
      s.sawDialog = true;
      clearTimeout(s.endTimer);
      s.endTimer = null;
      clearTimeout(s.startTimer);
      s.startTimer = null;
      if (!s.sheet) {
        const sheet = document.querySelector(".dialogContainer .dialog.actionSheet");
        if (sheet) {
          s.sheet = sheet;
          const w = sheet.offsetWidth;
          const hgt = sheet.offsetHeight;
          if (w && hgt) setPosition(computeMenuPosition(rectOf(s.anchor), void 0, { w, h: hgt }));
          focusFirstEntry(sheet);
          attachSheetSwipe(s, sheet);
        }
      }
    }
    if (s.sheet && !s.sheet.isConnected && !s.markerCleared) {
      s.markerCleared = true;
      clearMarker();
    }
    if (!containers.length && s.sawDialog && !s.endTimer) {
      s.endTimer = setTimeout(() => finish(s), END_QUIET_MS);
    }
  }
  function buildProxyFor(item) {
    const isFolder = Boolean(item.IsFolder) || FOLDER_TYPES.includes(item.Type);
    const el = document.createElement("div");
    el.className = "lfx-proxy itemAction";
    el.setAttribute("data-action", "menu");
    el.setAttribute("data-id", item.Id);
    el.setAttribute("data-serverid", item.ServerId || getAuth().serverId || "");
    el.setAttribute("data-type", item.Type || "");
    el.setAttribute("data-isfolder", String(isFolder));
    el.setAttribute("data-mediatype", item.MediaType || (isFolder ? "" : "Video"));
    return el;
  }
  function openItemMenu(item, anchor, opts = {}) {
    if (!item || !item.Id) return false;
    if (session) teardown(session);
    const container = findProxyContainer();
    if (!container) {
      toast("Men\xFC hier nicht verf\xFCgbar");
      return false;
    }
    const wrapper = document.createElement("div");
    wrapper.className = "lfx-proxywrap itemsContainer";
    wrapper.style.display = "none";
    const list = Array.isArray(opts.siblings) && opts.siblings.some((s2) => s2 && s2.Id === item.Id) ? opts.siblings : [item];
    let target = null;
    for (const it of list) {
      if (!it || !it.Id) continue;
      const proxy = buildProxyFor(it);
      wrapper.append(proxy);
      if (it.Id === item.Id) target = proxy;
    }
    container.append(wrapper);
    const s = {
      item,
      anchor,
      opts,
      wrapper,
      command: null,
      sheet: null,
      sawDialog: false,
      markerCleared: false,
      endTimer: null,
      startTimer: null,
      observer: null,
      onClick: null
    };
    s.onClick = (e) => {
      if (s.command) return;
      const entry = e.target && e.target.closest && e.target.closest(".actionSheetMenuItem[data-id]");
      if (entry && (!s.sheet || s.sheet.contains(entry))) s.command = entry.getAttribute("data-id");
    };
    s.onKey = (e) => {
      if (e.key !== "Escape") return;
      if (s.sheet && !s.sheet.isConnected) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (!s.sheet || s.escaped) return;
      s.escaped = true;
      history.back();
    };
    window.addEventListener("keydown", s.onKey, true);
    s.observer = new MutationObserver(() => onMutation(s));
    s.observer.observe(document.body, { childList: true });
    document.addEventListener("click", s.onClick, true);
    s.startTimer = setTimeout(() => finish(s), NO_DIALOG_TIMEOUT_MS);
    session = s;
    setPosition(computeMenuPosition(rectOf(anchor)));
    document.documentElement.classList.add("lfx-menu-open");
    target.click();
    return true;
  }
  function isMenuOpen() {
    return session !== null;
  }
  function closeItemMenu() {
    if (session) teardown(session);
    else clearMarker();
    clearRetries();
    ownDeletes.clear();
  }
  var unsubscribeWatch = null;
  function onLibraryChanged(msg) {
    const data = msg && msg.Data || {};
    const removed = Array.isArray(data.ItemsRemoved) ? data.ItemsRemoved.filter(Boolean) : [];
    const updated = Array.isArray(data.ItemsUpdated) ? data.ItemsUpdated.filter(Boolean) : [];
    emit2({ removed, updated });
  }
  function startItemWatch() {
    if (unsubscribeWatch) return;
    const client = window.ApiClient;
    if (!client || typeof client.subscribe !== "function") return;
    try {
      const res = client.subscribe(["LibraryChanged"], onLibraryChanged);
      unsubscribeWatch = typeof res === "function" ? res : () => {
        if (typeof client.unsubscribe === "function") client.unsubscribe(["LibraryChanged"], onLibraryChanged);
      };
    } catch {
      unsubscribeWatch = null;
    }
  }
  function stopItemWatch() {
    if (unsubscribeWatch) {
      try {
        unsubscribeWatch();
      } catch {
      }
      unsubscribeWatch = null;
    }
    closeItemMenu();
  }

  // src/js/core/sheet.js
  var SHEET_ID = "lfx-sheet";
  var current3 = null;
  function isChooserOpen() {
    return current3 !== null;
  }
  function isCurrent(c) {
    return current3 !== null && current3 === c;
  }
  function closeChooser() {
    const c = current3;
    if (!c) return;
    current3 = null;
    if (c.detachSwipe) c.detachSwipe();
    window.removeEventListener("keydown", c.onKeydown, true);
    c.overlay.removeEventListener("click", c.onOverlayClick);
    unmountPoint(c.overlay);
    document.documentElement.classList.remove("lfx-sheet-open");
    const a = c.anchorEl;
    if (a && typeof a.focus === "function" && a.isConnected) {
      try {
        a.focus({ preventScroll: true });
      } catch {
      }
    }
  }
  function renderSheet(c, title, entries) {
    c.title.textContent = title;
    c.list.replaceChildren(
      ...entries.map(
        ({ label, note, onClick, disabled, primary }) => h(
          "button",
          {
            type: "button",
            class: `lfx-sheet__item${primary ? " lfx-sheet__item--primary" : ""}`,
            disabled: disabled ? true : null,
            onclick: onClick
          },
          note ? [h("span", { class: "lfx-sheet__text" }, [h("span", null, [label]), h("span", { class: "lfx-sheet__note" }, [note])])] : [label]
        )
      )
    );
    const first2 = c.list.querySelector("button:not([disabled])");
    if (first2) first2.focus({ preventScroll: true });
  }
  function openSheet(anchorEl, label) {
    closeChooser();
    const overlay = mountPoint(SHEET_ID, { className: "lfx-sheet-overlay" });
    const title = h("h2", { class: "lfx-sheet__title" }, [label || ""]);
    const list = h("div", { class: "lfx-sheet__list" });
    const sheet = h("div", { class: "lfx-sheet", role: "dialog", "aria-modal": "true", "aria-label": label || "" }, [title, list]);
    overlay.replaceChildren(sheet);
    const pos = computeMenuPosition(anchorEl ? rectOf(anchorEl) : { left: 0, right: window.innerWidth, top: 0, bottom: 0 });
    sheet.style.setProperty("--lfx-sheet-x", `${Math.round(pos.x)}px`);
    sheet.style.setProperty("--lfx-sheet-y", `${Math.round(pos.y)}px`);
    const c = { overlay, sheet, title, list, anchorEl };
    c.onKeydown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        closeChooser();
        return;
      }
      if (e.key !== "Tab") return;
      const focusable = [...sheet.querySelectorAll("button:not([disabled])")];
      if (!focusable.length) {
        e.preventDefault();
        return;
      }
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      const active4 = document.activeElement;
      if (!sheet.contains(active4)) {
        e.preventDefault();
        firstEl.focus();
      } else if (e.shiftKey && active4 === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active4 === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    c.onOverlayClick = (e) => {
      if (e.target === overlay) closeChooser();
    };
    window.addEventListener("keydown", c.onKeydown, true);
    overlay.addEventListener("click", c.onOverlayClick);
    if (typeof window.matchMedia === "function" && window.matchMedia("(hover: none), (max-width: 799px)").matches) {
      c.detachSwipe = attachSwipeClose(sheet, { onClose: () => {
        if (current3 === c) closeChooser();
      } });
    }
    document.documentElement.classList.add("lfx-sheet-open");
    current3 = c;
    sheet.setAttribute("tabindex", "-1");
    sheet.focus({ preventScroll: true });
    return c;
  }
  function confirmAction({ title, confirmLabel, anchorEl, onConfirm } = {}) {
    const c = openSheet(anchorEl, title);
    renderSheet(c, title, [
      {
        label: confirmLabel,
        primary: true,
        onClick: () => {
          closeChooser();
          if (typeof onConfirm === "function") onConfirm();
        }
      },
      { label: "Abbrechen", onClick: () => closeChooser() }
    ]);
    return c;
  }

  // src/js/core/download.js
  var FOLDER_TYPES2 = ["Series", "Season"];
  async function canDownload(item) {
    if (!item) return false;
    const user = await getUser();
    if (!user || !user.Policy || user.Policy.EnableContentDownloading !== true) return false;
    if (FOLDER_TYPES2.includes(item.Type)) return true;
    if (item.IsFolder || item.Type === "BoxSet") return false;
    return item.CanDownload !== false;
  }
  function downloadUrl(id) {
    const { address, token: token2 } = getAuth();
    if (!token2) return null;
    return `${address || ""}/Items/${id}/Download?ApiKey=${encodeURIComponent(token2)}`;
  }
  function triggerDownload(item) {
    const url = downloadUrl(item.Id);
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", "");
    a.rel = "noopener";
    a.style.display = "none";
    document.body.append(a);
    try {
      a.click();
    } finally {
      a.remove();
    }
  }
  var PROBE_TIMEOUT = 5e3;
  async function probeDownload(url, outerSignal) {
    const controller = new AbortController();
    const onOuter = () => controller.abort();
    if (outerSignal) {
      if (outerSignal.aborted) return { ok: true, unknown: true };
      outerSignal.addEventListener("abort", onOuter, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT);
    try {
      const res = await fetch(url, { headers: { Range: "bytes=0-0" }, signal: controller.signal });
      const result = res.ok ? { ok: true } : { ok: false, status: res.status };
      controller.abort();
      return result;
    } catch {
      return { ok: true, unknown: true };
    } finally {
      clearTimeout(timer);
      if (outerSignal) outerSignal.removeEventListener("abort", onOuter);
    }
  }
  var failToast = (status) => toast(`Download nicht m\xF6glich (Fehler ${status || "?"})`);
  async function downloadItem(item) {
    if (!item || !item.Id) return;
    const url = downloadUrl(item.Id);
    if (!url) {
      toast("Download nicht m\xF6glich");
      return;
    }
    const probe = await probeDownload(url);
    if (!probe.ok) {
      failToast(probe.status);
      return;
    }
    triggerDownload(item);
    toast("Download gestartet");
  }
  var manyTimer = null;
  var manyResolve = null;
  var manyAbort = null;
  function cancelDownloads() {
    clearTimeout(manyTimer);
    manyTimer = null;
    if (manyAbort) {
      const ac = manyAbort;
      manyAbort = null;
      ac.abort();
    }
    if (manyResolve) {
      const r = manyResolve;
      manyResolve = null;
      r();
    }
  }
  function downloadMany(items) {
    cancelDownloads();
    const list = (items || []).filter((i) => i && i.Id);
    if (!list.length) return Promise.resolve();
    const n = list.length;
    const touch = typeof window.matchMedia === "function" && window.matchMedia("(hover: none)").matches;
    const startMsg = touch ? `${n} Downloads gestartet \u2013 falls blockiert, bitte Episoden einzeln laden` : `${n} Downloads gestartet`;
    const ac = new AbortController();
    manyAbort = ac;
    return new Promise((resolve2) => {
      manyResolve = resolve2;
      let i = 0;
      const finish3 = () => {
        if (manyAbort === ac) {
          manyAbort = null;
          manyResolve = null;
        }
        resolve2();
      };
      const step = async () => {
        manyTimer = null;
        const item = list[i];
        const url = downloadUrl(item.Id);
        const probe = url ? await probeDownload(url, ac.signal) : { ok: false };
        if (ac.signal.aborted) return;
        if (!probe.ok) {
          failToast(probe.status);
          finish3();
          return;
        }
        if (i === 0) toast(startMsg);
        triggerDownload(item);
        i += 1;
        if (i < list.length) manyTimer = setTimeout(step, 1e3);
        else finish3();
      };
      step();
    });
  }
  async function startDownload(item, anchorEl) {
    if (!item) return;
    if (FOLDER_TYPES2.includes(item.Type)) return openDownloadChooser(item, anchorEl);
    return downloadItem(item);
  }
  function confirmStep(c, episodes) {
    const n = episodes.length;
    renderSheet(c, `${n} ${n === 1 ? "Episode" : "Episoden"} herunterladen?`, [
      {
        label: "Herunterladen",
        primary: true,
        onClick: () => {
          closeChooser();
          downloadMany(episodes);
        }
      },
      { label: "Abbrechen", onClick: () => closeChooser() }
    ]);
  }
  var downloadable = (ep) => ep && ep.CanDownload !== false && ep.LocationType !== "Virtual";
  async function loadEpisodes(item) {
    const fields = "CanDownload";
    if (item.Type === "Season") {
      const res = await getEpisodes(item.SeriesId || item.ParentId, { seasonId: item.Id, Fields: fields });
      return { seasons: [], episodes: (res && res.Items || []).filter(downloadable) };
    }
    const [seasonsRes, epRes] = await Promise.all([getSeasons(item.Id), getEpisodes(item.Id, { Fields: fields })]);
    return {
      seasons: seasonsRes && seasonsRes.Items || [],
      episodes: (epRes && epRes.Items || []).filter(downloadable)
    };
  }
  async function openDownloadChooser(item, anchorEl) {
    if (!item) return;
    closeChooser();
    const c = openSheet(anchorEl, "Download");
    renderSheet(c, "Download", [{ label: "L\xE4dt \u2026", disabled: true }]);
    let data;
    try {
      data = await loadEpisodes(item);
    } catch {
      data = { seasons: [], episodes: [] };
    }
    if (!isCurrent(c)) return;
    if (!data.episodes.length) {
      closeChooser();
      toast("Keine herunterladbaren Episoden");
      return;
    }
    if (item.Type === "Season") {
      confirmStep(c, data.episodes);
      return;
    }
    const count = (n) => `${n} ${n === 1 ? "Episode" : "Episoden"}`;
    const touch = typeof window.matchMedia === "function" && window.matchMedia("(hover: none)").matches;
    const entries = [
      {
        label: `Ganze Serie (${count(data.episodes.length)})`,
        note: touch ? "Funktioniert nur am Desktop" : null,
        disabled: touch,
        onClick: () => confirmStep(c, data.episodes)
      }
    ];
    for (const season of data.seasons) {
      const eps = data.episodes.filter((ep) => ep.SeasonId === season.Id);
      if (!eps.length) continue;
      entries.push({ label: `${season.Name || "Staffel"} (${count(eps.length)})`, onClick: () => confirmStep(c, eps) });
    }
    renderSheet(c, "Download", entries);
  }

  // src/js/features/modal/data.js
  var TTL = 5 * 6e4;
  var ITEM_FIELDS = "Overview,Genres,People,Studios,Taglines,OfficialRating,ProductionYear,RunTimeTicks,ChildCount,RemoteTrailers,MediaSources,Width,ImageTags,BackdropImageTags,UserData";
  var LIST_FIELDS = "Overview,UserData,ImageTags,RunTimeTicks,ProductionYear,OfficialRating";
  var itemsOf = (res) => res && res.Items || [];
  async function loadItem(id) {
    const item = await cached(`lfx:modal:item:${id}`, () => getItem(id, { Fields: ITEM_FIELDS }), TTL);
    if (item) putItems([item]);
    return item;
  }
  async function loadSeasons(seriesId) {
    const items = itemsOf(await cached(`lfx:modal:seasons:${seriesId}`, () => getSeasons(seriesId, { Fields: "Overview,UserData,ImageTags" }), TTL));
    putItems(items);
    return items;
  }
  async function loadEpisodes2(seriesId, seasonId) {
    const items = itemsOf(await cached(`lfx:modal:eps:${seriesId}:${seasonId}`, () => getEpisodes(seriesId, { SeasonId: seasonId, Fields: LIST_FIELDS }), TTL));
    putItems(items);
    return items;
  }
  async function loadNextUp(seriesId) {
    const items = itemsOf(await cached(`lfx:modal:next:${seriesId}`, () => getNextUp({ SeriesId: seriesId, Limit: 1, Fields: LIST_FIELDS }), 6e4));
    putItems(items);
    return items[0] || null;
  }
  async function loadSimilar(id) {
    const items = itemsOf(await cached(`lfx:modal:similar:${id}`, () => getSimilar(id, { Limit: 12, Fields: LIST_FIELDS }), TTL));
    putItems(items);
    return items;
  }
  async function loadCollection(id) {
    const items = itemsOf(await cached(`lfx:modal:coll:${id}`, () => getItems({ ParentId: id, SortBy: "PremiereDate,SortName", Fields: LIST_FIELDS }), TTL));
    putItems(items);
    return items;
  }
  async function setLike(id, likes) {
    const { token: token2, userId } = getAuth();
    const res = await fetch(buildUrl(`/Users/${userId}/Items/${id}/Rating`, likes ? { likes: true } : void 0), {
      method: likes ? "POST" : "DELETE",
      headers: { Authorization: `MediaBrowser Token="${token2}"` }
    });
    if (!res.ok) throw new Error(`LenzFlix API: HTTP ${res.status} (Bewertung)`);
  }

  // src/js/features/modal/format.js
  var TICKS_PER_MIN = 6e8;
  function formatRuntime(ticks) {
    const mins = Math.round((Number(ticks) || 0) / TICKS_PER_MIN);
    if (mins < 1) return "";
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    if (!hh) return `${mins} Min.`;
    return mm ? `${hh} Std. ${mm} Min.` : `${hh} Std.`;
  }
  function seasonsLabel(n) {
    const c = Number(n) || 0;
    if (c < 1) return "";
    return `${c} ${c === 1 ? "Staffel" : "Staffeln"}`;
  }
  function qualityLabel(item) {
    if (!item) return "";
    let width = Number(item.Width) || 0;
    if (!width) {
      const sources = item.MediaSources || [];
      for (const src of sources) {
        const v = (src.MediaStreams || []).find((s) => s.Type === "Video" && s.Width);
        if (v) {
          width = Number(v.Width);
          break;
        }
      }
    }
    if (width >= 3e3) return "4K";
    if (width >= 1200) return "HD";
    return "";
  }
  function ratingText(rating) {
    const r = String(rating || "").trim();
    if (!r) return "";
    const m = /(\d{1,2})/.exec(r);
    if (!m) return /^(fsk[- ]?)?(0|ohne|alle|g)$/i.test(r) ? "Ohne Altersbeschr\xE4nkung" : r;
    const n = Number(m[1]);
    return n === 0 ? "Ohne Altersbeschr\xE4nkung" : `Freigegeben ab ${n} Jahren`;
  }
  function metaParts(item) {
    if (!item) return { year: "", length: "", quality: "", rating: "" };
    const isSeries = item.Type === "Series";
    return {
      year: item.ProductionYear ? String(item.ProductionYear) : "",
      length: isSeries ? seasonsLabel(item.ChildCount) : formatRuntime(item.RunTimeTicks),
      quality: qualityLabel(item),
      rating: item.OfficialRating || ""
    };
  }
  function peopleOf(item, type) {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const p of item && item.People || []) {
      if (!p || p.Type !== type || !p.Name || seen.has(p.Name)) continue;
      seen.add(p.Name);
      out.push(p);
    }
    return out;
  }
  function progressPercent(item) {
    const ud = item && item.UserData;
    if (!ud) return 0;
    if (ud.PlaybackPositionTicks > 0 && item.RunTimeTicks > 0) {
      return Math.max(0, Math.min(100, ud.PlaybackPositionTicks / item.RunTimeTicks * 100));
    }
    return ud.PlayedPercentage > 0 && ud.PlayedPercentage < 100 ? ud.PlayedPercentage : 0;
  }
  function hasResume(item) {
    const ud = item && item.UserData;
    return Boolean(ud && ud.PlaybackPositionTicks > 0);
  }
  function episodeLabel(ep) {
    return ep && ep.IndexNumber != null ? String(ep.IndexNumber) : "";
  }
  function pickInitialSeason(seasons, preferredId) {
    if (!seasons || !seasons.length) return null;
    if (preferredId && seasons.some((s) => s.Id === preferredId)) return preferredId;
    const regular = seasons.find((s) => s.IndexNumber > 0);
    return (regular || seasons[0]).Id;
  }

  // src/js/features/modal/render.js
  var TITLE_ID = "lfx-modal-title";
  var EPISODES_INITIAL = 10;
  var CARDS_INITIAL = 6;
  var ICONS = {
    play: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M6 4l15 8-15 8z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>',
    like: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M2 21h4V9H2zm20-11a2 2 0 00-2-2h-6.3l1-4.6v-.3a1.5 1.5 0 00-.4-1L13.2 1 7.6 6.6A2 2 0 007 8v11a2 2 0 002 2h9a2 2 0 001.8-1.2l3-7a2 2 0 00.2-.8z"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M7.4 8.6L12 13.2l4.6-4.6L18 10l-6 6-6-6z"/></svg>'
  };
  function icon(name) {
    const s = h("span", { class: "lfx-modal__icon", "aria-hidden": "true" });
    s.innerHTML = name.startsWith("<svg") ? name : ICONS[name] || "";
    return s;
  }
  function badge(text, extra = "") {
    return text ? h("span", { class: `lfx-modal__badge ${extra}`.trim() }, text) : null;
  }
  function heroImage(item) {
    return imageUrl(item, { type: "Backdrop", maxWidth: 1280 }) || landscapeImage(item, { maxWidth: 1280 });
  }
  function detailHref(id, serverId) {
    return `#/details?id=${id}&serverId=${serverId || getAuth().serverId || ""}`;
  }
  function buildSkeleton() {
    const line = (w) => h("div", { class: "lfx-skel lfx-skel--line", style: w ? { width: w } : null });
    return h("div", { class: "lfx-modal__skeleton", "aria-busy": "true" }, [
      h("div", { class: "lfx-modal__hero lfx-skel" }),
      h("div", { class: "lfx-modal__body" }, [
        h("div", {}, [line("40%"), line(), line(), line("70%")]),
        h("div", {}, [line(), line()])
      ])
    ]);
  }
  function buildError(message, href, onNavigate) {
    return h("div", { class: "lfx-modal__error", role: "alert" }, [
      h("h2", { id: TITLE_ID, class: "lfx-modal__error-title" }, "Titel konnte nicht geladen werden"),
      h("p", {}, message || "Bitte sp\xE4ter erneut versuchen."),
      h("a", { class: "lfx-modal__link", href, onclick: (e) => {
        e.preventDefault();
        onNavigate(href);
      } }, "Zur Detailseite")
    ]);
  }
  function roundButton(label, iconName, onclick, extra = "") {
    return h("button", { type: "button", class: `lfx-modal__round ${extra}`.trim(), "aria-label": label, title: label, onclick }, [icon(iconName)]);
  }
  function setFavState(btn, on) {
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.replaceChildren(icon(on ? "check" : "plus"));
  }
  function setLikeState(btn, on) {
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.replaceChildren(icon(on ? ICON_LIKE : ICON_LIKE_OUTLINE));
  }
  var PLAYED_LABELS = {
    item: ["Als gesehen markieren", "Als ungesehen markieren"],
    series: ["Ganze Serie als gesehen markieren", "Ganze Serie als ungesehen markieren"],
    season: ["Staffel als gesehen markieren", "Staffel als ungesehen markieren"]
  };
  function setPlayedState(btn, on) {
    const labels = PLAYED_LABELS[btn.dataset.scope] || PLAYED_LABELS.item;
    const label = on ? labels[1] : labels[0];
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
    btn.replaceChildren(icon(on ? ICON_EYE_CHECK : ICON_EYE));
  }
  function playedButton(item, { small = false, scope = null, on = null, onclick = null } = {}) {
    const sc = scope || (item.Type === "Series" ? "series" : "item");
    const btn = roundButton(PLAYED_LABELS[sc][0], ICON_EYE, onclick, `${small ? "lfx-modal__round--small " : ""}lfx-modal__round--played`);
    btn.dataset.scope = sc;
    setPlayedState(btn, on === null ? Boolean(item.UserData && item.UserData.Played === true) : on);
    return btn;
  }
  function setEpisodeSeen(row, on) {
    if (!row) return;
    row.classList.toggle("is-played", on);
    const thumb = row.querySelector(".lfx-modal__ep-thumb");
    if (!thumb) return;
    const mark = thumb.querySelector(".lfx-modal__ep-seen");
    if (on && !mark) thumb.append(seenMark());
    if (!on && mark) mark.remove();
  }
  function seenMark() {
    const m = h("span", { class: "lfx-modal__ep-seen", "aria-hidden": "true" });
    m.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';
    return m;
  }
  var isFolderType = (item) => item.Type === "Series" || item.Type === "Season";
  function downloadButton(item, small = false, label = null) {
    const text = label || (isFolderType(item) ? "Episoden herunterladen" : "Herunterladen");
    const btn = roundButton(text, ICON_DOWNLOAD, (e) => {
      e.stopPropagation();
      startDownload(item, btn);
    }, `${small ? "lfx-modal__round--small " : ""}lfx-modal__round--dl`);
    btn.hidden = true;
    Promise.resolve(canDownload(item)).then((ok) => {
      if (ok && btn.isConnected) btn.hidden = false;
    }).catch(() => {
    });
    return btn;
  }
  function menuButton(item, small = false, label = "Mehr", opts = null) {
    const btn = roundButton(label, ICON_MORE, (e) => {
      e.stopPropagation();
      opts ? openItemMenu(item, btn, opts) : openItemMenu(item, btn);
    }, `${small ? "lfx-modal__round--small " : ""}lfx-modal__round--menu`);
    btn.setAttribute("aria-haspopup", "menu");
    return btn;
  }
  var stopKeys = (btn) => {
    btn.addEventListener("keydown", (e) => e.stopPropagation());
    return btn;
  };
  function setPlayLabel(btn, label) {
    const t = btn.querySelector(".lfx-modal__play-text");
    if (t) t.textContent = label;
  }
  function buildDetail(item, H, { playLabel: playLabel2 = "Abspielen" } = {}) {
    const ud = item.UserData || {};
    const logo = logoImage(item, { maxWidth: 500 });
    const img = heroImage(item);
    const playBtn = h("button", { type: "button", class: "lfx-modal__play", onclick: () => H.play() }, [
      icon("play"),
      h("span", { class: "lfx-modal__play-text" }, playLabel2)
    ]);
    const favBtn = roundButton("Meine Liste", "plus", () => H.toggleFav(favBtn), "lfx-modal__round--fav");
    setFavState(favBtn, Boolean(ud.IsFavorite));
    const likeBtn = roundButton("Gef\xE4llt mir", ICON_LIKE_OUTLINE, () => H.toggleLike(likeBtn), "lfx-modal__round--like");
    setLikeState(likeBtn, ud.Likes === true);
    const dlBtn = downloadButton(item);
    const menuBtn = menuButton(item);
    const playedBtn = item.Type === "BoxSet" || item.Type === "Season" ? null : playedButton(item, { onclick: () => item.Type === "Series" ? H.toggleSeriesPlayed(playedBtn) : H.togglePlayed(item, playedBtn) });
    const title = h("h2", { id: TITLE_ID, class: logo ? "lfx-modal__title lfx-sr" : "lfx-modal__title" }, item.Name || "");
    const hero = h("div", { class: "lfx-modal__hero" }, [
      img ? h("img", { class: "lfx-modal__hero-img", src: img, alt: "" }) : null,
      h("div", { class: "lfx-modal__hero-fade" }),
      h("div", { class: "lfx-modal__hero-content" }, [
        logo ? h("img", { class: "lfx-modal__logo", src: logo, alt: "" }) : null,
        title,
        h("div", { class: "lfx-modal__actions" }, [playBtn, favBtn, likeBtn, dlBtn, menuBtn, playedBtn])
      ])
    ]);
    const m = metaParts(item);
    const meta = h("div", { class: "lfx-modal__meta" }, [
      m.year ? h("span", { class: "lfx-modal__year" }, m.year) : null,
      m.length ? h("span", { class: "lfx-modal__length" }, m.length) : null,
      badge(m.quality),
      badge(m.rating)
    ]);
    const tagline = (item.Taglines || [])[0];
    const left = h("div", { class: "lfx-modal__main" }, [
      meta,
      tagline ? h("p", { class: "lfx-modal__tagline" }, tagline) : null,
      item.Overview ? h("p", { class: "lfx-modal__overview" }, item.Overview) : null
    ]);
    const cast = peopleOf(item, "Actor");
    const side = h("div", { class: "lfx-modal__side" });
    if (cast.length) {
      const line = h("p", {}, [h("span", { class: "lfx-modal__label" }, "Besetzung: "), h("span", { class: "lfx-modal__value" }, cast.slice(0, 3).map((p) => p.Name).join(", "))]);
      if (cast.length > 3) {
        line.append(", ", h("a", { class: "lfx-modal__more-link", href: "#", onclick: (e) => {
          e.preventDefault();
          H.scrollToInfo();
        } }, "mehr"));
      }
      side.append(line);
    }
    const genres = (item.Genres || []).join(", ");
    if (genres) side.append(h("p", {}, [h("span", { class: "lfx-modal__label" }, "Genres: "), h("span", { class: "lfx-modal__value" }, genres)]));
    const studios = (item.Studios || []).map((s) => s.Name).filter(Boolean).join(", ");
    if (studios) side.append(h("p", {}, [h("span", { class: "lfx-modal__label" }, "Studio: "), h("span", { class: "lfx-modal__value" }, studios)]));
    const body = h("div", { class: "lfx-modal__body" }, [left, side]);
    const episodesSlot = h("section", { class: "lfx-modal__section lfx-modal__episodes", hidden: true });
    const extraSlot = h("section", { class: "lfx-modal__section", hidden: true });
    const similarSlot = h("section", { class: "lfx-modal__section", hidden: true });
    const infoSlot = buildInfo(item, H);
    const href = detailHref(item.Id, item.ServerId);
    const footer = h("div", { class: "lfx-modal__footer" }, [
      h("a", { class: "lfx-modal__link", href, onclick: (e) => {
        e.preventDefault();
        H.navigate(href);
      } }, "Zur Detailseite")
    ]);
    const el = h("div", { class: "lfx-modal__detail" }, [hero, body, episodesSlot, extraSlot, similarSlot, infoSlot, footer]);
    return { el, playBtn, favBtn, likeBtn, dlBtn, menuBtn, playedBtn, episodesSlot, extraSlot, similarSlot, infoSlot };
  }
  function personLinks(people, H) {
    const span2 = h("span", { class: "lfx-modal__value" });
    people.forEach((p, i) => {
      if (i) span2.append(", ");
      const href = detailHref(p.Id, null);
      span2.append(h("a", { class: "lfx-modal__person", href, onclick: (e) => {
        e.preventDefault();
        H.navigate(href);
      } }, p.Name));
    });
    return span2;
  }
  function infoRow(label, valueNode) {
    return h("p", { class: "lfx-modal__inforow" }, [h("span", { class: "lfx-modal__label" }, `${label}: `), valueNode]);
  }
  function buildInfo(item, H) {
    const sec = h("section", { class: "lfx-modal__section lfx-modal__info" }, [
      h("h3", { class: "lfx-modal__h" }, ["Info zu ", h("strong", {}, item.Name || "")])
    ]);
    const dirs = peopleOf(item, "Director");
    if (dirs.length) sec.append(infoRow("Regie", personLinks(dirs, H)));
    const cast = peopleOf(item, "Actor");
    if (cast.length) sec.append(infoRow("Besetzung", personLinks(cast, H)));
    const writers = peopleOf(item, "Writer");
    if (writers.length) sec.append(infoRow("Drehbuch", personLinks(writers, H)));
    if ((item.Genres || []).length) sec.append(infoRow("Genres", h("span", { class: "lfx-modal__value" }, item.Genres.join(", "))));
    if (item.OfficialRating) {
      sec.append(infoRow("Altersfreigabe", h("span", { class: "lfx-modal__value" }, [badge(item.OfficialRating), " ", ratingText(item.OfficialRating)])));
    }
    const studios = (item.Studios || []).map((s) => s.Name).filter(Boolean);
    if (studios.length) sec.append(infoRow("Studio", h("span", { class: "lfx-modal__value" }, studios.join(", "))));
    return sec;
  }
  function episodeRow(ep, selectedId, H, siblings) {
    const img = imageUrl(ep, { type: "Primary", maxWidth: 400 }) || landscapeImage(ep, { maxWidth: 400 });
    const pct = progressPercent(ep);
    const rt = formatRuntime(ep.RunTimeTicks);
    const seen = Boolean(ep.UserData && ep.UserData.Played === true);
    const playedBtn = playedButton(ep, { small: true, scope: "item", onclick: (e) => {
      e.stopPropagation();
      H.togglePlayed(ep, playedBtn);
    } });
    return h("div", {
      class: `lfx-modal__ep${ep.Id === selectedId ? " is-selected" : ""}${seen ? " is-played" : ""}`,
      role: "button",
      tabindex: "0",
      "data-id": ep.Id,
      "data-lfx-id": ep.Id,
      "data-lfx-type": "Episode",
      "aria-label": `Episode abspielen: ${ep.Name || ""}`,
      onclick: () => H.playItem(ep),
      onkeydown: (e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          H.playItem(ep);
        }
      }
    }, [
      h("span", { class: "lfx-modal__ep-num" }, episodeLabel(ep)),
      h("div", { class: "lfx-modal__ep-thumb" }, [
        img ? h("img", { src: img, alt: "", loading: "lazy" }) : null,
        h("span", { class: "lfx-modal__ep-playicon" }, [icon("play")]),
        pct > 0 && !seen ? h("div", { class: "lfx-progress" }, [h("div", { class: "lfx-progress__bar", style: { width: `${pct.toFixed(1)}%` } })]) : null,
        seen ? seenMark() : null
      ]),
      h("div", { class: "lfx-modal__ep-text" }, [
        h("div", { class: "lfx-modal__ep-head" }, [h("span", { class: "lfx-modal__ep-title" }, ep.Name || ""), rt ? h("span", { class: "lfx-modal__ep-rt" }, rt) : null]),
        ep.Overview ? h("p", { class: "lfx-modal__ep-desc" }, ep.Overview) : null
      ]),
      h("div", { class: "lfx-modal__epactions" }, [
        stopKeys(playedBtn),
        stopKeys(downloadButton(ep, true, `Herunterladen: ${ep.Name || "Episode"}`)),
        stopKeys(menuButton(ep, true, `Mehr zu ${ep.Name || "Episode"}`, { siblings }))
      ])
    ]);
  }
  function moreButton(onclick) {
    return h("div", { class: "lfx-modal__more" }, [
      h("button", { type: "button", class: "lfx-modal__more-btn", "aria-label": "Mehr anzeigen", title: "Mehr anzeigen", onclick }, [icon("chevron")])
    ]);
  }
  function renderEpisodes(slot, state16, H) {
    slot.hidden = false;
    slot.replaceChildren();
    const { seasons, seasonId, episodes, selectedEpisodeId } = state16;
    putItems(episodes);
    const current6 = seasons.find((s) => s.Id === seasonId);
    const head = h("div", { class: "lfx-modal__eps-head" }, [h("h3", { class: "lfx-modal__h" }, "Folgen")]);
    const tools = h("div", { class: "lfx-modal__eps-tools" });
    head.append(tools);
    if (seasonId && episodes.length) {
      const seasonBtn = playedButton({}, {
        scope: "season",
        on: episodes.every((e) => e.UserData && e.UserData.Played === true),
        onclick: () => H.toggleSeasonPlayed(seasonBtn)
      });
      tools.append(seasonBtn);
    }
    if (seasons.length > 1) {
      const list = h("ul", { class: "lfx-modal__seasonlist", role: "listbox", hidden: true });
      const btn = h("button", {
        type: "button",
        class: "lfx-modal__seasonbtn",
        "aria-haspopup": "listbox",
        "aria-expanded": "false",
        onclick: () => toggle(list.hidden)
      }, [h("span", {}, current6 && current6.Name || "Staffel"), icon("chevron")]);
      const toggle = (open2) => {
        list.hidden = !open2;
        btn.setAttribute("aria-expanded", String(open2));
      };
      for (const s of seasons) {
        list.append(h("li", { role: "presentation" }, [h("button", {
          type: "button",
          role: "option",
          class: "lfx-modal__seasonopt",
          "aria-selected": String(s.Id === seasonId),
          "data-id": s.Id,
          onclick: () => {
            toggle(false);
            if (s.Id !== seasonId) H.season(s.Id);
          }
        }, s.Name || `Staffel ${s.IndexNumber}`)]));
      }
      tools.append(h("div", { class: "lfx-modal__dropdown" }, [btn, list]));
      if (tools.querySelector(".lfx-modal__round--played")) tools.classList.add("lfx-modal__eps-tools--joined");
    }
    slot.append(head);
    const listEl = h("div", { class: "lfx-modal__eplist" });
    slot.append(listEl);
    if (!episodes.length) {
      listEl.append(h("p", { class: "lfx-modal__empty" }, "Keine Folgen verf\xFCgbar."));
      return;
    }
    const selIdx = episodes.findIndex((e) => e.Id === selectedEpisodeId);
    let shown = Math.max(EPISODES_INITIAL, selIdx + 1);
    const draw = () => {
      listEl.replaceChildren(...episodes.slice(0, shown).map((e) => episodeRow(e, selectedEpisodeId, H, episodes)));
      if (shown < episodes.length) listEl.append(moreButton(() => {
        shown = episodes.length;
        draw();
      }));
    };
    draw();
  }
  function card(item, H) {
    const img = landscapeImage(item, { maxWidth: 500 });
    const rt = formatRuntime(item.RunTimeTicks);
    const fav = h("button", {
      type: "button",
      class: "lfx-modal__round lfx-modal__round--small lfx-modal__round--fav",
      "aria-label": "Meine Liste",
      title: "Meine Liste",
      onclick: (e) => {
        e.stopPropagation();
        H.toggleFavOf(item, fav);
      }
    });
    setFavState(fav, Boolean(item.UserData && item.UserData.IsFavorite));
    const open2 = () => H.openItem(item.Id);
    return h("div", {
      class: "lfx-modal__card",
      role: "button",
      tabindex: "0",
      "data-id": item.Id,
      "aria-label": item.Name || "",
      onclick: open2,
      onkeydown: (e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) {
          e.preventDefault();
          open2();
        }
      }
    }, [
      h("div", { class: "lfx-modal__card-img" }, [
        img ? h("img", { src: img, alt: "", loading: "lazy" }) : h("span", { class: "lfx-modal__card-name" }, item.Name || ""),
        rt ? h("span", { class: "lfx-modal__card-rt" }, rt) : null
      ]),
      h("div", { class: "lfx-modal__card-body" }, [
        h("div", { class: "lfx-modal__card-meta" }, [
          h("div", {}, [badge(item.OfficialRating), item.ProductionYear ? h("span", { class: "lfx-modal__year" }, String(item.ProductionYear)) : null]),
          fav
        ]),
        item.Overview ? h("p", { class: "lfx-modal__card-desc" }, item.Overview) : null
      ])
    ]);
  }
  function renderCards(slot, title, items, H, initial = CARDS_INITIAL) {
    slot.replaceChildren();
    if (!items.length) {
      slot.hidden = true;
      return;
    }
    slot.hidden = false;
    slot.append(h("h3", { class: "lfx-modal__h" }, title));
    const grid = h("div", { class: "lfx-modal__grid" });
    slot.append(grid);
    let shown = initial;
    const draw = () => {
      grid.replaceChildren(...items.slice(0, shown).map((it) => card(it, H)));
      slot.querySelector(".lfx-modal__more")?.remove();
      if (shown < items.length) slot.append(moreButton(() => {
        shown = items.length;
        draw();
      }));
    };
    draw();
  }

  // src/js/features/modal.js
  var ROOT_ID2 = "lfx-modal";
  var ALLOWED_TYPES = /* @__PURE__ */ new Set(["Movie", "Series", "Episode", "Season", "BoxSet", "Video", "MusicVideo"]);
  var BLOCKED_PATHS = ["/video", "/login", "/dashboard"];
  var SKIP_IN_CARD = '.cardOverlayButton, .lfx-card__action, button, [data-action="menu"], [data-action="play"], [data-action="resume"]';
  var IMAGE_LINK = "a.cardImageContainer, a.lfx-card__link";
  var state4 = null;
  var clickInstalled = false;
  var rootEl = () => document.documentElement;
  var overlayOnTop = () => Boolean(document.querySelector(".dialogContainer")) || isChooserOpen();
  function isBlockedRoute(route) {
    return BLOCKED_PATHS.some((p) => route.path === p || route.path.startsWith(`${p}/`) || p === "/dashboard" && route.path.startsWith("/dashboard"));
  }
  function featureActive() {
    const cl2 = rootEl().classList;
    return cl2.contains("lfx-js") && !cl2.contains("lfx-tv") && !cl2.contains("layout-tv") && !isTv();
  }
  function findInterceptTarget(e) {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return null;
    if (!featureActive() || isBlockedRoute(parseHash(window.location.hash))) return null;
    const t = e.target;
    if (!t || !t.closest) return null;
    if (t.closest('.dialog, .dialogContainer, [role="dialog"], .MuiPopover-root, .lfx-modal-overlay, .detailImageContainer')) return null;
    const card3 = t.closest(".lfx-card[data-lfx-id], .card[data-id]");
    if (!card3) return null;
    if (document.querySelector(".selectionCommandsPanel, .itemSelectionPanel")) return null;
    const skip = t.closest(SKIP_IN_CARD);
    if (skip && card3.contains(skip) && !skip.matches(IMAGE_LINK)) return null;
    const id = card3.dataset.lfxId || card3.dataset.id;
    const type = card3.dataset.lfxType || card3.dataset.type;
    if (!id || !ALLOWED_TYPES.has(type)) return null;
    return { card: card3, id, type, opener: t.closest("a, button") || card3 };
  }
  function onDocumentClick(e) {
    const hit = findInterceptTarget(e);
    if (!hit) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    openModal(hit.id, { opener: hit.opener });
  }
  function resolveId(itemOrId) {
    return typeof itemOrId === "string" ? itemOrId : itemOrId && itemOrId.Id;
  }
  function openModal(itemOrId, opts = {}) {
    const id = resolveId(itemOrId);
    if (!id) return Promise.resolve();
    if (!featureActive()) {
      const sid = itemOrId && itemOrId.ServerId || getAuth().serverId || "";
      location.hash = `#/details?id=${id}${sid ? `&serverId=${sid}` : ""}`;
      return Promise.resolve();
    }
    const theme = getTheme();
    if (theme && theme !== "flix") {
      location.hash = titleHref(id);
      return Promise.resolve();
    }
    const hint = typeof itemOrId === "object" ? itemOrId : null;
    if (state4) return loadInto(id, hint, true);
    create(opts.opener || (document.activeElement !== document.body ? document.activeElement : null));
    return loadInto(id, hint, false);
  }
  function create(opener) {
    const overlay = mountPoint(ROOT_ID2, { className: "lfx-modal-overlay" });
    overlay.replaceChildren();
    const closeBtn = h("button", { type: "button", class: "lfx-modal__close", "aria-label": "Schlie\xDFen", title: "Schlie\xDFen", onclick: () => closeModal() }, [icon("close")]);
    const content = h("div", { class: "lfx-modal__content" });
    const modal = h("div", { class: "lfx-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": TITLE_ID, tabindex: "-1" }, [closeBtn, content]);
    overlay.append(modal);
    overlay.scrollTop = 0;
    const onOverlayClick = (e) => {
      if (e.target !== overlay) return;
      if (e.target.closest && e.target.closest(".dialogContainer, .dialogBackdrop, #lfx-sheet")) return;
      if (overlayOnTop()) return;
      closeModal();
    };
    overlay.addEventListener("click", onOverlayClick);
    state4 = { overlay, modal, content, closeBtn, opener, token: 0, pushed: false, after: null, fallback: null, main: null, parts: null, autoScroll: null, seasons: [], episodes: [], seasonId: null, selectedEpisodeId: null, onOverlayClick, unsub: null };
    state4.unsub = onItemsChanged(onChanged);
    if (typeof window.matchMedia === "function" && window.matchMedia("(max-width: 799px)").matches) {
      state4.detachSwipe = attachSwipeClose(modal, {
        backdrop: overlay,
        canStart: () => overlay.scrollTop <= 0 && !overlayOnTop(),
        onClose: () => closeModal()
      });
    }
    rootEl().classList.add("lfx-modal-open");
    document.addEventListener("keydown", onKeydown, true);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("hashchange", onHashChange);
    try {
      history.pushState({ ...history.state || {}, lfxModal: true }, "", location.href);
      state4.pushed = true;
    } catch {
    }
    closeBtn.focus({ preventScroll: true });
  }
  function teardown2() {
    if (!state4) return null;
    const s = state4;
    state4 = null;
    clearTimeout(s.fallback);
    cancelAutoScroll(s);
    if (typeof s.unsub === "function") s.unsub();
    if (s.detachSwipe) s.detachSwipe();
    s.overlay.removeEventListener("click", s.onOverlayClick);
    document.removeEventListener("keydown", onKeydown, true);
    window.removeEventListener("popstate", onPopState);
    window.removeEventListener("hashchange", onHashChange);
    rootEl().classList.remove("lfx-modal-open");
    unmountPoint(s.overlay);
    const op = s.opener;
    if (op && op.isConnected && typeof op.focus === "function" && !overlayOnTop()) op.focus({ preventScroll: true });
    return s.after;
  }
  function closeModal(opts = {}) {
    if (!state4) return;
    if (opts.after) state4.after = opts.after;
    if (state4.pushed) {
      state4.fallback = setTimeout(() => finish2(), 600);
      history.back();
    } else {
      finish2();
    }
  }
  function finish2() {
    const after = teardown2();
    if (after) after();
  }
  function onPopState() {
    if (!state4) return;
    const st = history.state;
    if (st && st.lfxModal) return;
    state4.pushed = false;
    finish2();
  }
  function onHashChange() {
    if (!state4) return;
    state4.pushed = false;
    const after = state4.after;
    teardown2();
    if (after) after();
  }
  function focusables() {
    if (!state4) return [];
    const sel = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]';
    return [...state4.modal.querySelectorAll(sel)].filter((el) => !el.closest("[hidden]"));
  }
  function onKeydown(e) {
    if (!state4) return;
    if (overlayOnTop()) return;
    if (e.key === "Escape") {
      const open2 = state4.modal.querySelector('.lfx-modal__seasonbtn[aria-expanded="true"]');
      e.stopPropagation();
      e.preventDefault();
      if (open2) {
        open2.click();
        open2.focus();
      } else closeModal();
      return;
    }
    if (e.key !== "Tab") return;
    const list = focusables();
    if (!list.length) {
      e.preventDefault();
      return;
    }
    const first2 = list[0];
    const last = list[list.length - 1];
    const active4 = document.activeElement;
    if (!state4.modal.contains(active4)) {
      e.preventDefault();
      first2.focus();
    } else if (e.shiftKey && active4 === first2) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active4 === last) {
      e.preventDefault();
      first2.focus();
    }
  }
  async function resolveTarget(id, hint) {
    const item = hint || getStoredItem(id) || await loadItem(id);
    const sel = { seasonId: null, episodeId: null };
    let targetId = id;
    if (item.Type === "Episode") {
      targetId = item.SeriesId || item.ParentId || id;
      sel.episodeId = item.Id;
      sel.seasonId = item.SeasonId || item.ParentId || null;
    } else if (item.Type === "Season") {
      targetId = item.SeriesId || item.ParentId || id;
      sel.seasonId = item.Id;
    }
    return { targetId, sel };
  }
  async function loadInto(id, hint, replace, refresh2 = false) {
    const s = state4;
    const token2 = ++s.token;
    const stale = () => state4 !== s || s.token !== token2;
    if (!refresh2) cancelAutoScroll(s);
    if (refresh2) {
    } else if (replace) {
      s.content.replaceChildren(buildSkeleton());
      s.overlay.scrollTop = 0;
      if (s.pushed) {
        try {
          history.replaceState({ ...history.state || {}, lfxModal: true }, "", location.href);
        } catch {
        }
      }
    } else {
      s.content.replaceChildren(buildSkeleton());
    }
    let main;
    let sel;
    try {
      const r = await resolveTarget(id, hint);
      sel = refresh2 ? { seasonId: s.seasonId, episodeId: s.selectedEpisodeId } : r.sel;
      main = await loadItem(r.targetId);
      if (!main) throw new Error("Titel nicht gefunden");
    } catch (err) {
      if (stale()) return;
      if (refresh2) return;
      const href = detailHref(id, null);
      s.content.replaceChildren(buildError(err && err.message ? "Der Server hat nicht geantwortet." : "", href, (hash) => navigate(hash)));
      return;
    }
    if (stale()) return;
    s.main = main;
    s.seasonId = sel.seasonId;
    s.selectedEpisodeId = sel.episodeId;
    const H = makeHandlers(s, token2);
    const isSeries = main.Type === "Series";
    const parts = buildDetail(main, H, { playLabel: !isSeries && hasResume(main) ? "Fortsetzen" : "Abspielen" });
    s.parts = parts;
    s.content.replaceChildren(parts.el);
    if (!refresh2) s.overlay.scrollTop = 0;
    const tasks = [];
    if (isSeries) {
      tasks.push(loadSeriesParts(s, token2, H, refresh2));
      tasks.push(loadNextUp(main.Id).then((ep) => {
        if (!stale() && ep && hasResume(ep)) setPlayLabel(parts.playBtn, "Fortsetzen");
      }).catch(() => {
      }));
    }
    if (main.Type === "BoxSet") {
      tasks.push(loadCollection(main.Id).then((items) => {
        if (!stale()) renderCards(parts.extraSlot, "Filme dieser Sammlung", items, H, items.length);
      }).catch(() => {
      }));
    } else {
      tasks.push(loadSimilar(main.Id).then((items) => {
        if (!stale()) renderCards(parts.similarSlot, "\xC4hnliche Titel", items.filter((i) => i.Id !== main.Id), H);
      }).catch(() => {
      }));
    }
    await Promise.all(tasks);
  }
  async function loadSeriesParts(s, token2, H, refresh2 = false) {
    const stale = () => state4 !== s || s.token !== token2;
    try {
      s.seasons = await loadSeasons(s.main.Id);
      if (stale()) return;
      s.seasonId = pickInitialSeason(s.seasons, s.seasonId);
      if (!s.seasonId) return;
      await showSeason(s, token2, H, { reveal: !refresh2 });
    } catch {
    }
  }
  var USER_SCROLL_EVENTS = ["wheel", "touchstart", "pointerdown", "keydown"];
  function cancelAutoScroll(s) {
    const a = s && s.autoScroll;
    if (!a) return;
    s.autoScroll = null;
    a.cancelled = true;
    if (a.raf != null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(a.raf);
    for (const t of USER_SCROLL_EVENTS) s.overlay.removeEventListener(t, a.onUser);
  }
  function scheduleRevealScroll(s, token2, row) {
    cancelAutoScroll(s);
    const a = { cancelled: false, raf: null, onUser: null };
    a.onUser = () => cancelAutoScroll(s);
    s.autoScroll = a;
    for (const t of USER_SCROLL_EVENTS) s.overlay.addEventListener(t, a.onUser, { passive: true });
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
    a.raf = raf(() => {
      a.raf = null;
      if (a.cancelled || state4 !== s || s.token !== token2 || s.autoScroll !== a || !row.isConnected) {
        cancelAutoScroll(s);
        return;
      }
      cancelAutoScroll(s);
      const top = Math.max(0, Math.round(row.getBoundingClientRect().top - s.overlay.getBoundingClientRect().top + s.overlay.scrollTop - 24));
      let reduce = false;
      try {
        reduce = Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      } catch {
      }
      if (typeof s.overlay.scrollTo === "function") s.overlay.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
      else s.overlay.scrollTop = top;
    });
  }
  async function showSeason(s, token2, H, opts = {}) {
    const episodes = await loadEpisodes2(s.main.Id, s.seasonId);
    if (state4 !== s || s.token !== token2) return;
    s.episodes = episodes;
    renderEpisodes(s.parts.episodesSlot, { seasons: s.seasons, seasonId: s.seasonId, episodes, selectedEpisodeId: s.selectedEpisodeId }, H);
    const row = s.parts.episodesSlot.querySelector(".lfx-modal__ep.is-selected");
    if (!row) return;
    const list = row.parentElement;
    if (list && list.scrollHeight > list.clientHeight) {
      const lr = list.getBoundingClientRect();
      const rr = row.getBoundingClientRect();
      if (rr.top < lr.top || rr.bottom > lr.bottom) list.scrollTop = Math.max(0, rr.top - lr.top + list.scrollTop - (list.clientHeight - rr.height) / 2);
    }
    if (opts.reveal && s.selectedEpisodeId) scheduleRevealScroll(s, token2, row);
  }
  function onChanged({ removed = [], updated = [] } = {}) {
    const s = state4;
    if (!s || !s.main) return;
    const id = s.main.Id;
    if (removed.includes(id)) {
      closeModal();
      return;
    }
    const gone = removed.filter((rid) => s.episodes.some((e) => e.Id === rid));
    if (gone.length) {
      s.episodes = s.episodes.filter((e) => !gone.includes(e.Id));
      clearCache(`lfx:modal:eps:${id}:`);
      for (const rid of gone) {
        s.overlay.querySelectorAll(".lfx-modal__ep").forEach((row) => {
          if (row.dataset.id === rid) row.remove();
        });
      }
    }
    if (updated.includes(id)) {
      for (const key of ["item", "seasons", "next", "similar", "coll"]) clearCache(`lfx:modal:${key}:${id}`);
      clearCache(`lfx:modal:eps:${id}:`);
      loadInto(id, null, true, true);
    }
  }
  function navigate(hash) {
    closeModal({ after: () => {
      location.hash = hash;
    } });
  }
  async function toggleFavGeneric(item, btn) {
    item.UserData = item.UserData || {};
    const next = !item.UserData.IsFavorite;
    item.UserData.IsFavorite = next;
    setFavState(btn, next);
    try {
      await setFavorite(item.Id, next);
    } catch {
      item.UserData.IsFavorite = !next;
      setFavState(btn, !next);
    }
  }
  var isPlayed = (it) => Boolean(it && it.UserData && it.UserData.Played === true);
  var folgen = (n) => n === 1 ? "1 Folge" : `${n} Folgen`;
  var SAVE_ERROR = "Konnte nicht gespeichert werden";
  function clearPlayedCaches(itemId, seriesId) {
    clearCache(`lfx:modal:item:${itemId}`);
    if (seriesId) {
      clearCache(`lfx:modal:next:${seriesId}`);
      clearCache(`lfx:modal:eps:${seriesId}:`);
    }
  }
  function syncSeasonBtn(s) {
    const btn = s.parts && s.parts.episodesSlot.querySelector('.lfx-modal__round--played[data-scope="season"]');
    if (btn) setPlayedState(btn, s.episodes.length > 0 && s.episodes.every(isPlayed));
  }
  async function bulkPlayed(s, targetId, next) {
    const seriesId = s.main.Id;
    await setPlayed(targetId, next);
    clearPlayedCaches(seriesId, seriesId);
    const seasonIds = targetId === seriesId ? s.seasons.map((x) => x.Id) : [targetId];
    const wrong = [];
    for (const sid of seasonIds) {
      try {
        for (const e of await loadEpisodes2(seriesId, sid)) if (isPlayed(e) !== next) wrong.push(e);
      } catch {
      }
    }
    let failed = 0;
    for (let i = 0; i < wrong.length; i += 6) {
      const res = await Promise.allSettled(wrong.slice(i, i + 6).map((e) => setPlayed(e.Id, next)));
      failed += res.filter((r) => r.status === "rejected").length;
    }
    clearPlayedCaches(seriesId, seriesId);
    return failed;
  }
  async function seriesEpisodeCount(s) {
    try {
      let n = 0;
      for (const se of s.seasons) n += (await loadEpisodes2(s.main.Id, se.Id)).length;
      return n;
    } catch {
      return 0;
    }
  }
  function makeHandlers(s, token2) {
    const main = s.main;
    const stale = () => state4 !== s || s.token !== token2;
    const askBulk = ({ btn, n, next, targetId, isSeries }) => {
      const verb = next ? "gesehen" : "ungesehen";
      confirmAction({
        title: n ? `${folgen(n)} als ${verb} markieren?` : `Alle Folgen als ${verb} markieren?`,
        confirmLabel: `Als ${verb} markieren`,
        anchorEl: btn,
        onConfirm: async () => {
          if (stale()) return;
          btn.disabled = true;
          try {
            const failed = await bulkPlayed(s, targetId, next);
            if (stale()) return;
            if (isSeries || !next) {
              main.UserData = main.UserData || {};
              main.UserData.Played = isSeries ? next : false;
              if (s.parts && s.parts.playedBtn) setPlayedState(s.parts.playedBtn, main.UserData.Played);
            }
            await showSeason(s, token2, H).catch(() => {
            });
            if (failed) toast(SAVE_ERROR);
            else toast(isSeries ? `Serie als ${verb} markiert` : `${folgen(n)} als ${verb} markiert`);
          } catch {
            toast(SAVE_ERROR);
          } finally {
            btn.disabled = false;
          }
        }
      });
    };
    const H = {
      async togglePlayed(item, btn) {
        const prev = { ...item.UserData || {} };
        const next = prev.Played !== true;
        const row = btn.closest(".lfx-modal__ep");
        item.UserData = { ...prev, Played: next, PlaybackPositionTicks: 0 };
        delete item.UserData.PlayedPercentage;
        setPlayedState(btn, next);
        setEpisodeSeen(row, next);
        syncSeasonBtn(s);
        try {
          await setPlayed(item.Id, next);
        } catch {
          item.UserData = prev;
          setPlayedState(btn, !next);
          setEpisodeSeen(row, !next);
          if (!stale()) syncSeasonBtn(s);
          toast(SAVE_ERROR);
          return;
        }
        putItems([item]);
        clearPlayedCaches(item.Id, item.Type === "Episode" ? main.Id : null);
        if (next && row) row.querySelector(".lfx-progress")?.remove();
        if (!next && item.Type === "Episode" && main.Type === "Series" && isPlayed(main) && !stale()) {
          main.UserData.Played = false;
          if (s.parts && s.parts.playedBtn) setPlayedState(s.parts.playedBtn, false);
        }
      },
      async toggleSeriesPlayed(btn) {
        const next = !isPlayed(main);
        const n = await seriesEpisodeCount(s);
        if (stale()) return;
        askBulk({ btn, n, next, targetId: main.Id, isSeries: true });
      },
      toggleSeasonPlayed(btn) {
        if (!s.seasonId || !s.episodes.length) return;
        askBulk({ btn, n: s.episodes.length, next: !s.episodes.every(isPlayed), targetId: s.seasonId, isSeries: false });
      },
      async play() {
        let target = main;
        let resume = hasResume(main);
        if (main.Type === "Series") {
          target = await loadNextUp(main.Id).catch(() => null);
          if (!target) {
            const eps = s.seasons.length ? await loadEpisodes2(main.Id, pickInitialSeason(s.seasons, null)).catch(() => []) : [];
            target = eps[0] || null;
          }
          resume = hasResume(target);
        }
        if (target) await play(target, { resume });
      },
      toggleFav: (btn) => toggleFavGeneric(main, btn),
      toggleFavOf: (item, btn) => toggleFavGeneric(item, btn),
      async toggleLike(btn) {
        main.UserData = main.UserData || {};
        const next = main.UserData.Likes !== true;
        main.UserData.Likes = next ? true : null;
        setLikeState(btn, next);
        try {
          await setLike(main.Id, next);
        } catch {
          main.UserData.Likes = next ? null : true;
          setLikeState(btn, !next);
        }
      },
      openItem: (id) => loadInto(id, null, true),
      navigate,
      scrollToInfo() {
        const el = s.parts && s.parts.infoSlot;
        if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
      },
      async season(seasonId) {
        s.seasonId = seasonId;
        s.selectedEpisodeId = null;
        await showSeason(s, token2, H).catch(() => {
        });
      },
      playItem: (ep) => play(ep, { resume: hasResume(ep) })
    };
    return H;
  }
  function destroyAll() {
    if (state4) {
      state4.pushed = false;
      teardown2();
    }
    if (clickInstalled) {
      document.removeEventListener("click", onDocumentClick, true);
      clickInstalled = false;
    }
  }
  var modalFeature = {
    name: "modal",
    match: (route) => !isBlockedRoute(route) && !isTv(),
    mount() {
      if (!clickInstalled) {
        document.addEventListener("click", onDocumentClick, true);
        clickInstalled = true;
      }
    },
    unmount: destroyAll
  };
  var modal_default = modalFeature;

  // src/js/shared/trailer.js
  var DIRECT_VIDEO = /\.(mp4|m4v|webm)(\?|#|$)/i;
  function trailerUrl(trailerId) {
    const c = window.ApiClient;
    if (c && typeof c.getUrl === "function") {
      return c.getUrl(`Videos/${trailerId}/stream.mp4`, { static: true, api_key: c.accessToken() });
    }
    const { address, token: token2 } = getAuth();
    return `${address}/Videos/${trailerId}/stream.mp4?static=true&api_key=${encodeURIComponent(token2 || "")}`;
  }
  async function loadLocalTrailer(item) {
    if (!item || !(item.LocalTrailerCount > 0)) return null;
    const list = await getJson(`/Users/${getUserId()}/Items/${item.Id}/LocalTrailers`);
    const t = Array.isArray(list) ? list[0] : null;
    return t && t.Id ? t : null;
  }
  function directRemoteTrailerUrl(item) {
    const list = item && Array.isArray(item.RemoteTrailers) ? item.RemoteTrailers : [];
    for (const r of list) {
      const u = r && typeof r.Url === "string" ? r.Url : "";
      if (/^https?:\/\//i.test(u) && DIRECT_VIDEO.test(u)) return u;
    }
    return null;
  }
  function applyStartAt(v, startAt) {
    if (!(startAt > 0)) return;
    const apply = () => {
      const d = v.duration;
      if (Number.isFinite(d) && d > 30 && d > startAt + 20) {
        try {
          v.currentTime = startAt;
        } catch {
        }
      }
    };
    if (v.readyState >= 1) apply();
    else v.addEventListener("loadedmetadata", apply, { once: true });
  }
  function createMutedPreview(container, item, { delay = 1500, onStart, onEnd, startAt = 0 } = {}) {
    let dead = false;
    let video = null;
    let started2 = false;
    const cleanup = () => {
      if (video) {
        const v = video;
        video = null;
        try {
          v.pause();
          v.removeAttribute("src");
          if (v.load) v.load();
        } catch {
        }
        v.remove();
      }
    };
    const finish3 = () => {
      if (dead) return;
      dead = true;
      clearTimeout(timer);
      const wasStarted = started2;
      cleanup();
      if (wasStarted && typeof onEnd === "function") onEnd();
    };
    const start6 = async () => {
      timer = null;
      if (dead || !container) return;
      let src;
      try {
        const t = await loadLocalTrailer(item);
        src = t ? trailerUrl(t.Id) : directRemoteTrailerUrl(item);
      } catch {
        src = directRemoteTrailerUrl(item);
      }
      if (dead || !src) return;
      const v = document.createElement("video");
      v.className = "lfx-preview__video";
      v.setAttribute("playsinline", "");
      v.setAttribute("aria-hidden", "true");
      v.preload = "auto";
      v.muted = true;
      v.setAttribute("muted", "");
      v.addEventListener("playing", () => {
        if (dead || video !== v || started2) return;
        started2 = true;
        if (typeof onStart === "function") onStart(v);
      });
      v.addEventListener("ended", finish3);
      v.addEventListener("error", finish3);
      video = v;
      applyStartAt(v, startAt);
      v.src = src;
      container.append(v);
      try {
        const p = v.play && v.play();
        if (p && p.catch) p.catch(finish3);
      } catch {
        finish3();
      }
    };
    let timer = setTimeout(start6, delay);
    return {
      cancel() {
        if (dead) return;
        dead = true;
        clearTimeout(timer);
        timer = null;
        cleanup();
      }
    };
  }

  // src/js/features/billboard/format.js
  var DAY = 864e5;
  var NEW_DAYS = 14;
  function hasLogoAndBackdrop(it) {
    return Boolean(it && it.Id && it.ImageTags && it.ImageTags.Logo && it.BackdropImageTags && it.BackdropImageTags.length);
  }
  function shuffled(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function buildPool(latest, random, opts = {}) {
    const { newCount = 4, randomCount = 8, avoidFirstId = null, rng = Math.random } = opts;
    const uniq2 = (list, skip) => {
      const seen = new Set(skip);
      const out2 = [];
      for (const it of list || []) {
        if (hasLogoAndBackdrop(it) && !seen.has(it.Id)) {
          seen.add(it.Id);
          out2.push(it);
        }
      }
      return out2;
    };
    const a = shuffled(uniq2(latest, []).slice(0, newCount), rng);
    const b = uniq2(random, a.map((it) => it.Id)).slice(0, randomCount);
    const fresh = b.filter((it) => it.Id !== avoidFirstId);
    const first2 = fresh.find((it) => it.LocalTrailerCount > 0) || fresh[0];
    if (first2) {
      b.splice(b.indexOf(first2), 1);
      b.unshift(first2);
    }
    const out = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (b[i]) out.push(b[i]);
      if (a[i]) out.push(a[i]);
    }
    return out;
  }
  function formatRuntime2(ticks) {
    const total = Math.round((Number(ticks) || 0) / 6e8);
    if (total <= 0) return "";
    const hrs = Math.floor(total / 60);
    const min = total % 60;
    if (!hrs) return `${min} Min.`;
    return min ? `${hrs} Std. ${min} Min.` : `${hrs} Std.`;
  }
  function formatRating(rating) {
    const s = String(rating || "").trim();
    if (!s) return "";
    const m = /^(?:FSK|DE)[\s-]*(\d{1,2})$/i.exec(s);
    return m ? m[1] : s;
  }
  function formatSeasons(n) {
    const c = Number(n) || 0;
    if (c <= 0) return "";
    return c === 1 ? "1 Staffel" : `${c} Staffeln`;
  }
  function metaParts2(item) {
    const parts = [];
    const isSeries = item.Type === "Series";
    parts.push({ text: isSeries ? "Serie" : "Film" });
    if (item.Genres && item.Genres[0]) parts.push({ text: item.Genres[0] });
    if (item.ProductionYear) parts.push({ text: String(item.ProductionYear) });
    const extra = isSeries ? formatSeasons(item.ChildCount) : formatRuntime2(item.RunTimeTicks);
    if (extra) parts.push({ text: extra });
    const rating = formatRating(item.OfficialRating);
    if (rating) parts.push({ text: rating, rating: true });
    return parts;
  }
  function genreLine(item) {
    const g = item && Array.isArray(item.Genres) ? item.Genres.filter(Boolean).slice(0, 3) : [];
    return g.join(" \u2022 ");
  }
  function badgeFor(item, now = Date.now()) {
    const t = item && item.DateCreated ? Date.parse(item.DateCreated) : NaN;
    if (Number.isFinite(t) && now - t >= 0 && now - t < NEW_DAYS * DAY) return "Neu hinzugef\xFCgt";
    return null;
  }
  function hasProgress(item) {
    return Boolean(item && item.UserData && item.UserData.PlaybackPositionTicks > 0);
  }

  // src/js/features/billboard.js
  var ROTATE_MS = 1e4;
  var TRAILER_DELAY_MS = 4e3;
  var IMG_FADE_MS = 1e3;
  var TEXT_FADE_MS = 400;
  var FIELDS = "Overview,Genres,OfficialRating,ProductionYear,RunTimeTicks,ChildCount,DateCreated,RemoteTrailers,LocalTrailerCount";
  var NS = "http://www.w3.org/2000/svg";
  function svg2(html, cls) {
    const el = document.createElementNS(NS, "svg");
    el.setAttribute("viewBox", "0 0 24 24");
    el.setAttribute("aria-hidden", "true");
    if (cls) el.setAttribute("class", cls);
    el.innerHTML = html;
    return el;
  }
  var ICON_PLAY = '<path fill="currentColor" d="M6 3.5v17a1 1 0 0 0 1.5.86l14-8.5a1 1 0 0 0 0-1.72l-14-8.5A1 1 0 0 0 6 3.5z"/>';
  var ICON_MUTED = '<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z"/>';
  var ICON_SOUND = '<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/>';
  var ICON_PLUS = '<path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/>';
  var ICON_CHECK = '<path fill="currentColor" d="M9.2 16.6 4.9 12.3l-1.4 1.4 5.7 5.7L20.5 8.1l-1.4-1.4z"/>';
  var ICON_BADGE = '<defs><linearGradient id="lfx-bb-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5fa2"/><stop offset="1" stop-color="#e50914"/></linearGradient></defs><path fill="url(#lfx-bb-grad)" d="M3 10.5v3a1 1 0 0 0 1 1h1.5l2.5 5h2.2l-1.7-5H11l8 4.5v-13L11 10H4a1 1 0 0 0-1 .5zM21 9.5v5a2.5 2.5 0 0 0 0-5z"/>';
  var LAST_FIRST_KEY = "lfx-bb-first";
  function readLastFirst() {
    try {
      return sessionStorage.getItem(LAST_FIRST_KEY);
    } catch {
      return null;
    }
  }
  function writeLastFirst(id) {
    try {
      sessionStorage.setItem(LAST_FIRST_KEY, id);
    } catch {
    }
  }
  async function fetchPool() {
    const base = {
      Recursive: true,
      IncludeItemTypes: "Movie,Series",
      ImageTypes: "Logo,Backdrop",
      Fields: FIELDS,
      EnableUserData: true,
      Limit: 40
    };
    const [latest, random] = await Promise.all([
      getItems({ ...base, SortBy: "DateCreated", SortOrder: "Descending" }).catch(() => null),
      getItems({ ...base, SortBy: "Random" }).catch(() => null)
    ]);
    const pool = buildPool(latest && latest.Items, random && random.Items, { avoidFirstId: readLastFirst() });
    if (pool[0]) writeLastFirst(pool[0].Id);
    return pool;
  }
  function reducedMotion() {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function loadAmbient(item, isCurrent2) {
    const url = imageUrl(item, { type: "Backdrop", maxWidth: 64, quality: 60 });
    if (!url || typeof Image === "undefined") return;
    const img = new Image();
    img.onload = () => {
      if (!isCurrent2()) return;
      try {
        const w = img.naturalWidth || 64;
        const hh = img.naturalHeight || 36;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = hh;
        const ctx2d = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx2d) return;
        ctx2d.drawImage(img, 0, 0, w, hh);
        const [r, g, b] = ambientFromPixels(ctx2d.getImageData(0, 0, w, hh).data);
        setAmbient(r, g, b);
      } catch {
      }
    };
    img.src = url;
  }
  function render3(slot) {
    let disposed = false;
    let pool = [];
    let index = 0;
    let gen3 = 0;
    let hovering = false;
    let trailerActive = false;
    let rotateTimer = null;
    let trailerTimer = null;
    const timers = /* @__PURE__ */ new Set();
    let video = null;
    let card3 = null;
    let media = null;
    let content = null;
    let muteBtn = null;
    let dots = null;
    const cleanupFns = [];
    const later = (fn, ms) => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
      return t;
    };
    const paused = () => hovering || trailerActive || document.hidden || document.documentElement.classList.contains("lfx-modal-open") || isMenuOpen() || isChooserOpen();
    function stopTrailer() {
      clearTimeout(trailerTimer);
      trailerTimer = null;
      trailerActive = false;
      if (video) {
        const v = video;
        video = null;
        try {
          v.pause();
          v.removeAttribute("src");
          if (v.load) v.load();
        } catch {
        }
        v.remove();
      }
      if (muteBtn) muteBtn.hidden = true;
      if (card3) card3.classList.remove("is-trailer");
    }
    function scheduleRotate() {
      clearTimeout(rotateTimer);
      rotateTimer = null;
      if (disposed || pool.length < 2 || reducedMotion()) return;
      rotateTimer = setTimeout(() => {
        rotateTimer = null;
        if (paused()) scheduleRotate();
        else show2((index + 1) % pool.length);
      }, ROTATE_MS);
    }
    function buildListButton(item) {
      const btn = h("button", { type: "button", class: "lfx-bb__btn lfx-bb__btn--list", "aria-label": "Meine Liste" });
      const paint = () => {
        const on = Boolean(item.UserData && item.UserData.IsFavorite);
        btn.replaceChildren(svg2(on ? ICON_CHECK : ICON_PLUS), h("span", null, "Meine Liste"));
        btn.classList.toggle("is-on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      };
      paint();
      btn.addEventListener("click", async () => {
        const prev = Boolean(item.UserData && item.UserData.IsFavorite);
        item.UserData = { ...item.UserData || {}, IsFavorite: !prev };
        paint();
        try {
          await setFavorite(item.Id, !prev);
        } catch {
          item.UserData = { ...item.UserData || {}, IsFavorite: prev };
          paint();
        }
      });
      return btn;
    }
    function buildRoundButtons(item) {
      const folder = item.Type === "Series" || item.Type === "Season";
      const dlLabel = folder ? "Episoden herunterladen" : "Herunterladen";
      const dl = h("button", {
        type: "button",
        class: "lfx-bb__btn lfx-bb__btn--dl",
        "aria-label": dlLabel,
        title: dlLabel,
        hidden: true
      });
      dl.innerHTML = ICON_DOWNLOAD;
      dl.addEventListener("click", (e) => {
        e.stopPropagation();
        startDownload(item, dl);
      });
      Promise.resolve(canDownload(item)).then((ok) => {
        if (ok && !disposed && slot.contains(dl)) dl.hidden = false;
      }, () => {
      });
      const menu = h("button", {
        type: "button",
        class: "lfx-bb__btn lfx-bb__btn--menu",
        "aria-label": "Mehr",
        title: "Mehr",
        "aria-haspopup": "menu"
      });
      menu.innerHTML = ICON_MORE;
      menu.addEventListener("click", (e) => {
        e.stopPropagation();
        openItemMenu(item, menu);
      });
      return [dl, menu];
    }
    function buildContent(item) {
      const logo = logoImage(item, { maxWidth: 720 });
      const meta = h("div", { class: "lfx-bb__meta" });
      metaParts2(item).forEach((p, i) => {
        if (i) meta.append(h("span", { class: "lfx-bb__dot", "aria-hidden": "true" }, "\u2022"));
        meta.append(h("span", { class: p.rating ? "lfx-bb__rating" : null }, p.text));
      });
      const playBtn = h("button", { type: "button", class: "lfx-bb__btn lfx-bb__btn--play" }, [svg2(ICON_PLAY), h("span", null, "Abspielen")]);
      playBtn.addEventListener("click", () => play(item, { resume: hasProgress(item) }));
      const infoBtn = h("button", { type: "button", class: "lfx-bb__btn lfx-bb__btn--info" }, [h("span", null, "Weitere Infos")]);
      infoBtn.addEventListener("click", () => openModal(item));
      const listBtn = buildListButton(item);
      const genres = genreLine(item);
      const badgeText = badgeFor(item);
      return h("div", null, [
        h("div", { class: "lfx-bb__text" }, [
          logo ? h("img", { class: "lfx-bb__logo", src: logo, alt: item.Name || "", decoding: "async" }) : h("h2", { class: "lfx-bb__title" }, item.Name || ""),
          meta,
          genres ? h("div", { class: "lfx-bb__genres" }, genres) : null,
          item.Overview ? h("p", { class: "lfx-bb__desc" }, item.Overview) : null
        ]),
        h("div", { class: "lfx-bb__buttons" }, [playBtn, infoBtn, listBtn, ...buildRoundButtons(item)]),
        badgeText ? h("span", { class: "lfx-bb__badge" }, [svg2(ICON_BADGE), badgeText]) : null
      ]);
    }
    function buildImage(item) {
      const bd = imageUrl(item, { type: "Backdrop", maxWidth: 1920, quality: 90 });
      const poster = imageUrl(item, { type: "Primary", maxWidth: 900, quality: 90 });
      return h("picture", { class: "lfx-bb__pic" }, [
        poster ? h("source", { media: "(max-width: 799px)", srcset: poster }) : null,
        h("img", { class: "lfx-bb__img", src: bd, alt: "", decoding: "async" })
      ]);
    }
    function updateDots() {
      if (!dots) return;
      [...dots.children].forEach((b, i) => {
        b.classList.toggle("is-active", i === index);
        b.setAttribute("aria-current", i === index ? "true" : "false");
      });
    }
    function fillDots() {
      dots.replaceChildren(...pool.map((it, i) => {
        const b = h("button", { type: "button", class: "lfx-bb__dotbtn", "aria-label": `Empfehlung ${i + 1}: ${it.Name || ""}` });
        b.addEventListener("click", () => show2(i));
        return b;
      }));
      dots.hidden = pool.length < 2;
      updateDots();
    }
    function onChanged2({ removed = [], updated = [] }) {
      if (disposed || !card3) return;
      const cur3 = pool[index];
      if (removed.length && pool.some((it) => removed.includes(it.Id))) {
        const curGone = cur3 && removed.includes(cur3.Id);
        pool = pool.filter((it) => !removed.includes(it.Id));
        if (!pool.length) {
          gen3 += 1;
          stopTrailer();
          clearTimeout(rotateTimer);
          clearTimeout(trailerTimer);
          timers.forEach(clearTimeout);
          timers.clear();
          content.replaceChildren();
          slot.hidden = true;
          resetAmbient();
          return;
        }
        index = curGone ? Math.min(index, pool.length - 1) : pool.indexOf(cur3);
        fillDots();
        if (curGone) show2(index);
        return;
      }
      if (cur3 && updated.includes(cur3.Id)) {
        const fresh = getStoredItem(cur3.Id);
        if (!fresh) return;
        const merged = { ...cur3, ...fresh };
        pool[index] = merged;
        if (!content.classList.contains("is-out")) content.replaceChildren(...buildContent(merged).childNodes);
      }
    }
    function setMuteIcon() {
      if (!video) return;
      muteBtn.replaceChildren(svg2(video.muted ? ICON_MUTED : ICON_SOUND));
      muteBtn.setAttribute("aria-label", video.muted ? "Ton einschalten" : "Ton ausschalten");
    }
    async function startTrailer(item, myGen) {
      if (!(item.LocalTrailerCount > 0) || disposed || myGen !== gen3) return;
      try {
        const t = await loadLocalTrailer(item);
        if (myGen !== gen3 || disposed) return;
        if (!t) return;
        const v = h("video", { class: "lfx-bb__video", playsinline: true, preload: "auto", "aria-hidden": "true" });
        v.muted = true;
        v.setAttribute("muted", "");
        v.addEventListener("playing", () => {
          if (myGen !== gen3 || video !== v) return;
          trailerActive = true;
          v.classList.add("is-in");
          card3.classList.add("is-trailer");
          muteBtn.hidden = false;
          setMuteIcon();
        });
        const end = () => {
          if (video !== v) return;
          stopTrailer();
          scheduleRotate();
        };
        v.addEventListener("ended", end);
        v.addEventListener("error", end);
        v.src = trailerUrl(t.Id);
        video = v;
        media.append(v);
        const p = v.play && v.play();
        if (p && p.catch) p.catch(end);
      } catch {
      }
    }
    function show2(i, immediate = false) {
      if (disposed || !pool[i]) return;
      const item = pool[i];
      index = i;
      gen3 += 1;
      const myGen = gen3;
      stopTrailer();
      updateDots();
      const pic = buildImage(item);
      const olds = [...media.querySelectorAll(".lfx-bb__pic")];
      media.append(pic);
      if (immediate || !olds.length) {
        olds.forEach((o) => o.remove());
        pic.classList.add("is-in");
      } else {
        requestAnimationFrame(() => pic.classList.add("is-in"));
        later(() => olds.forEach((o) => o.remove()), IMG_FADE_MS + 50);
      }
      const swap = () => {
        if (disposed || myGen !== gen3) return;
        content.replaceChildren(...buildContent(item).childNodes);
        content.classList.remove("is-out");
      };
      if (immediate || !content.firstChild) swap();
      else {
        content.classList.add("is-out");
        later(swap, TEXT_FADE_MS);
      }
      putItems([item]);
      loadAmbient(item, () => myGen === gen3 && !disposed);
      scheduleRotate();
      clearTimeout(trailerTimer);
      trailerTimer = setTimeout(() => startTrailer(item, myGen), TRAILER_DELAY_MS);
    }
    function build8() {
      media = h("div", { class: "lfx-bb__media" });
      content = h("div", { class: "lfx-bb__live", "aria-live": "off" });
      muteBtn = h("button", { type: "button", class: "lfx-bb__mute", hidden: true, "aria-label": "Ton einschalten" });
      muteBtn.addEventListener("click", () => {
        if (!video) return;
        video.muted = !video.muted;
        setMuteIcon();
      });
      dots = h("div", { class: "lfx-bb__dots", role: "group", "aria-label": "Empfehlung w\xE4hlen" });
      fillDots();
      card3 = h("div", { class: "lfx-bb" }, [
        media,
        h("div", { class: "lfx-bb__shade", "aria-hidden": "true" }),
        h("span", { class: "lfx-bb__mark", "aria-hidden": "true" }),
        muteBtn,
        content,
        dots
      ]);
      slot.replaceChildren(card3);
      slot.setAttribute("aria-roledescription", "Karussell");
      const onEnter = () => {
        hovering = true;
      };
      const onLeave = () => {
        hovering = false;
        scheduleRotate();
      };
      const onVis = () => {
        if (!document.hidden) scheduleRotate();
      };
      const onCardClick = (e) => {
        if (!isMobile() || e.target.closest && e.target.closest("button, a")) return;
        if (pool[index]) openModal(pool[index]);
      };
      card3.addEventListener("click", onCardClick);
      card3.addEventListener("mouseenter", onEnter);
      card3.addEventListener("mouseleave", onLeave);
      document.addEventListener("visibilitychange", onVis);
      cleanupFns.push(() => document.removeEventListener("visibilitychange", onVis));
      cleanupFns.push(onItemsChanged(onChanged2));
    }
    async function init2() {
      let items = [];
      try {
        items = await fetchPool();
      } catch {
      }
      if (disposed) return;
      if (!items.length) {
        slot.hidden = true;
        resetAmbient();
        return;
      }
      pool = items;
      putItems(pool);
      build8();
      slot.hidden = false;
      show2(0, true);
    }
    slot.hidden = true;
    init2();
    return () => {
      disposed = true;
      gen3 += 1;
      clearTimeout(rotateTimer);
      clearTimeout(trailerTimer);
      timers.forEach(clearTimeout);
      timers.clear();
      stopTrailer();
      cleanupFns.forEach((f) => f());
      slot.replaceChildren();
      slot.removeAttribute("aria-roledescription");
      resetAmbient();
    };
  }

  // src/js/features/rows.js
  var rows_exports = {};
  __export(rows_exports, {
    render: () => render4
  });

  // src/js/features/rows/logic.js
  var NEW_DAYS2 = 14;
  var DAY_MS = 864e5;
  var ITEM_FIELDS2 = [
    "PrimaryImageAspectRatio",
    "Overview",
    "Genres",
    "DateCreated",
    "ParentId",
    "ImageTags",
    "BackdropImageTags",
    "ParentThumbItemId",
    "ParentThumbImageTag",
    "ParentBackdropItemId",
    "ParentBackdropImageTags",
    "SeriesId",
    "SeriesPrimaryImageTag",
    "ChildCount",
    "RecursiveItemCount",
    "OfficialRating",
    "ProductionYear",
    "RunTimeTicks",
    "ParentLogoItemId",
    "ParentLogoImageTag"
  ].join(",");
  var BASE_PARAMS = {
    Fields: ITEM_FIELDS2,
    EnableUserData: true,
    ImageTypeLimit: 1,
    EnableImageTypes: "Primary,Backdrop,Thumb,Logo"
  };
  var NEW_EPISODE_AIRED_DAYS = 365;
  function newSeriesIdsFrom(episodes, now = Date.now()) {
    const ids = /* @__PURE__ */ new Set();
    for (const e of episodes || []) {
      if (!e || !e.SeriesId) continue;
      if (!isRecent(e.DateCreated, now, NEW_DAYS2)) continue;
      if (!isRecent(e.PremiereDate, now, NEW_EPISODE_AIRED_DAYS)) continue;
      ids.add(e.SeriesId);
    }
    return ids;
  }
  function isRecent(dateStr, now = Date.now(), days = NEW_DAYS2) {
    const t = Date.parse(dateStr);
    if (Number.isNaN(t)) return false;
    return now - t < days * DAY_MS;
  }
  function badgeFor2(item, newSeriesIds, now = Date.now()) {
    if (!item) return null;
    if (item.Type === "Movie") return isRecent(item.DateCreated, now) ? "Neu hinzugef\xFCgt" : null;
    if (item.Type === "Series") {
      if (isRecent(item.DateCreated, now)) return "Neu hinzugef\xFCgt";
      const has = newSeriesIds && (typeof newSeriesIds.has === "function" ? newSeriesIds.has(item.Id) : newSeriesIds.includes(item.Id));
      return has ? "Neue Folgen" : null;
    }
    return null;
  }
  function selectTop10(items) {
    const seen = /* @__PURE__ */ new Set();
    const list = [];
    for (const it of items || []) {
      if (!it || !it.Id || it.Type !== "Movie" && it.Type !== "Series" || seen.has(it.Id)) continue;
      seen.add(it.Id);
      list.push(it);
    }
    const ts = (it) => {
      const t = Date.parse(it.DateCreated);
      return Number.isNaN(t) ? -Infinity : t;
    };
    return list.map((it, i) => ({ it, i })).sort((a, b) => ts(b.it) - ts(a.it) || a.i - b.i).slice(0, 10).map((x) => x.it);
  }
  function progressPercent2(item) {
    const ud = item && item.UserData;
    if (!ud) return 0;
    let p = Number(ud.PlayedPercentage);
    if (!(p > 0) && ud.PlaybackPositionTicks && item.RunTimeTicks) p = ud.PlaybackPositionTicks / item.RunTimeTicks * 100;
    if (!(p > 0)) return 0;
    return Math.min(100, Math.max(0, p));
  }
  function dayKey(date = /* @__PURE__ */ new Date()) {
    const p = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  }
  function hashString(str) {
    let h2 = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h2 ^= str.charCodeAt(i);
      h2 = Math.imul(h2, 16777619);
    }
    return h2 >>> 0;
  }
  function mulberry32(a) {
    return () => {
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function seededShuffle(arr, seed) {
    const out = arr.slice();
    const rnd = mulberry32(hashString(String(seed)));
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  function pickGenres(genres, { seed, count = 6, minTitles = 8 } = {}) {
    const names = [];
    for (const g of genres || []) {
      const name = typeof g === "string" ? g : g && g.Name;
      if (!name) continue;
      if (typeof g === "object") {
        const known = g.MovieCount != null || g.SeriesCount != null;
        if (known && (g.MovieCount || 0) + (g.SeriesCount || 0) < minTitles) continue;
      }
      if (!names.includes(name)) names.push(name);
    }
    names.sort((a, b) => a.localeCompare(b, "de"));
    return seededShuffle(names, seed).slice(0, count);
  }

  // src/js/features/rows/card.js
  function detailHref2(item) {
    const serverId = item.ServerId || getAuth().serverId || "";
    return `#/details?id=${encodeURIComponent(item.Id)}${serverId ? `&serverId=${encodeURIComponent(serverId)}` : ""}`;
  }
  function displayTitle(item) {
    return item.Type === "Episode" && item.SeriesName ? item.SeriesName : item.Name || "";
  }
  function ariaLabel(item) {
    if (item.Type === "Episode" && item.SeriesName) return `${item.SeriesName} \u2013 ${item.Name || ""}`.trim();
    return item.Name || "";
  }
  function landscapeFor(item, maxWidth = 600) {
    if (item.Type === "Episode") {
      for (const type of ["Thumb", "Primary"]) {
        const url2 = imageUrl(item, { type, maxWidth, quality: 85 });
        if (url2) return { url: url2, isThumb: false };
      }
    }
    const url = landscapeImage(item, { maxWidth });
    if (!url) return null;
    const pick = pickLandscape(item);
    return { url, isThumb: Boolean(pick && pick.type === "Thumb") };
  }
  function posterUrl(item, maxWidth = 300) {
    if (item.Type === "Episode") {
      return item.SeriesId && item.SeriesPrimaryImageTag ? imageUrlFor(item.SeriesId, { type: "Primary", maxWidth, quality: 85, tag: item.SeriesPrimaryImageTag }) : null;
    }
    return imageUrl(item, { type: "Primary", maxWidth, quality: 85 });
  }
  function createCard(item, opts = {}) {
    const { badge: badge3 = null, kind: kind2 = "landscape", rank = 0 } = opts;
    const title = displayTitle(item);
    let link;
    if (kind2 === "top10") {
      const url = imageUrl(item, { type: "Primary", maxWidth: 300, quality: 85 }) || landscapeImage(item, { maxWidth: 300 });
      link = h("a", { class: "lfx-card__link", href: detailHref2(item), "aria-label": ariaLabel(item) }, [
        url ? h("img", { class: "lfx-card__img", src: url, alt: "", loading: "lazy", decoding: "async" }) : h("span", { class: "lfx-card__title" }, title)
      ]);
    } else {
      const img = landscapeFor(item);
      const poster = kind2 === "landscape" ? posterUrl(item) : null;
      const children = [];
      const src = img ? img.url : poster;
      if (src) {
        const imgEl = h("img", { class: "lfx-card__img", src, alt: "", loading: "lazy", decoding: "async" });
        children.push(poster ? h("picture", null, [h("source", { media: "(max-width: 799px)", srcset: poster }), imgEl]) : imgEl);
      }
      const titled = !img || !img.isThumb;
      if (titled) {
        const logo = logoImage(item, { maxWidth: 400 });
        children.push(logo ? h("img", { class: "lfx-card__logo", src: logo, alt: "", loading: "lazy", decoding: "async" }) : h("span", { class: "lfx-card__title" }, title));
      }
      link = h("a", {
        class: `lfx-card__link${titled ? " lfx-card__link--titled" : ""}`,
        href: detailHref2(item),
        "aria-label": ariaLabel(item)
      }, children);
    }
    const card3 = h("div", {
      class: `lfx-card${kind2 === "top10" ? " lfx-card--top10" : ""}`,
      dataset: { lfxId: item.Id, lfxType: item.Type || "" },
      tabindex: "-1",
      role: "listitem"
    });
    if (kind2 === "top10" && rank) {
      card3.append(h("span", { class: `lfx-card__rank${rank >= 10 ? " lfx-card__rank--wide" : ""}`, "aria-hidden": "true" }, String(rank)));
    }
    card3.append(link);
    if (badge3) card3.append(h("span", { class: "lfx-badge" }, badge3));
    if (kind2 === "resume") {
      const p = progressPercent2(item);
      if (p > 0) {
        card3.append(h("div", { class: "lfx-progress" }, [
          h("div", { class: "lfx-progress__bar", style: { width: `${Math.round(p * 10) / 10}%` } })
        ]));
      }
    }
    return card3;
  }

  // src/js/features/rows/scroller.js
  var CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><polyline points="8,3 17,12 8,21" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function chevronButton(dir, label) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `lfx-row__arrow lfx-row__arrow--${dir}`;
    b.setAttribute("aria-label", label);
    b.tabIndex = -1;
    b.hidden = true;
    b.innerHTML = CHEVRON;
    return b;
  }
  function attachScroller({ track, prev, next, indicator }) {
    let raf = 0;
    let shownPages = 0;
    const cards = () => Array.from(track.querySelectorAll(".lfx-card"));
    const visible = () => {
      const v = parseFloat(getComputedStyle(track).getPropertyValue("--lfx-cards-visible"));
      return v > 0 ? v : 4;
    };
    function pageWidth() {
      const cs = cards();
      if (cs.length > 1 && cs[1].offsetLeft > cs[0].offsetLeft) return (cs[1].offsetLeft - cs[0].offsetLeft) * visible();
      return track.clientWidth || 1;
    }
    function update() {
      raf = 0;
      const left = track.scrollLeft;
      const max = track.scrollWidth - track.clientWidth;
      const pw = pageWidth();
      const pages = Math.max(1, Math.ceil(cards().length / visible()));
      prev.hidden = left <= 2;
      next.hidden = !(max > 2) || left >= max - 2;
      if (indicator) {
        if (pages !== shownPages) {
          shownPages = pages;
          indicator.textContent = "";
          for (let i = 0; i < pages; i++) indicator.append(document.createElement("span"));
        }
        indicator.hidden = pages <= 1;
        const page = left >= max - 2 && max > 2 ? pages - 1 : Math.min(pages - 1, Math.round(left / pw));
        Array.from(indicator.children).forEach((s, i) => s.classList.toggle("is-active", i === page));
      }
    }
    const schedule2 = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    function go2(dir) {
      const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      const left = Math.max(0, track.scrollLeft + dir * pageWidth());
      if (typeof track.scrollTo === "function") track.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
      else track.scrollLeft = left;
    }
    const onPrev = () => go2(-1);
    const onNext = () => go2(1);
    function links() {
      return Array.from(track.querySelectorAll(".lfx-card__link"));
    }
    function onFocusIn(e) {
      const a = e.target.closest && e.target.closest(".lfx-card__link");
      if (!a) return;
      for (const l of links()) l.tabIndex = l === a ? 0 : -1;
    }
    function onKey3(e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const a = e.target.closest && e.target.closest(".lfx-card__link");
      if (!a) return;
      const ls2 = links();
      const t = ls2[ls2.indexOf(a) + (e.key === "ArrowRight" ? 1 : -1)];
      if (t) {
        e.preventDefault();
        t.focus();
      }
    }
    prev.addEventListener("click", onPrev);
    next.addEventListener("click", onNext);
    track.addEventListener("scroll", schedule2, { passive: true });
    track.addEventListener("focusin", onFocusIn);
    track.addEventListener("keydown", onKey3);
    window.addEventListener("resize", schedule2);
    const ls = links();
    ls.forEach((l, i) => {
      l.tabIndex = i === 0 ? 0 : -1;
    });
    schedule2();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      prev.removeEventListener("click", onPrev);
      next.removeEventListener("click", onNext);
      track.removeEventListener("scroll", schedule2);
      track.removeEventListener("focusin", onFocusIn);
      track.removeEventListener("keydown", onKey3);
      window.removeEventListener("resize", schedule2);
    };
  }

  // src/js/core/charts.js
  var TIMEOUT_MS = 8e3;
  var TTL_MS = 5 * 60 * 1e3;
  function getChartsUrl() {
    const clean2 = (raw) => {
      const s = String(raw == null ? "" : raw).trim().replace(/^["'\s]+|["'\s]+$/g, "").replace(/\/+$/, "");
      return /^https:\/\/[^\s"']+$/i.test(s) ? s : null;
    };
    const fromConfig = clean2(window.LenzFlixConfig && window.LenzFlixConfig.chartsUrl);
    if (fromConfig) return fromConfig;
    try {
      return clean2(getComputedStyle(document.documentElement).getPropertyValue("--lfx-charts-url"));
    } catch {
      return null;
    }
  }
  var warned = false;
  function warnOnce(msg) {
    if (warned) return;
    warned = true;
    console.warn(`[LenzFlix] Charts nicht verf\xFCgbar: ${msg}`);
  }
  function validEntries(list) {
    return Array.isArray(list) ? list.filter((e) => e && typeof e.id === "string" && e.id) : null;
  }
  function validate(json) {
    if (!json || typeof json !== "object" || json.version !== 1) return null;
    const movies = validEntries(json.movies);
    const series = validEntries(json.series);
    const all = validEntries(json.all);
    if (!movies || !series || !all) return null;
    const days = Number(json.windowDays);
    return { ...json, movies, series, all, windowDays: days > 0 ? days : 30 };
  }
  async function fetchCharts() {
    const base = getChartsUrl();
    if (!base) return null;
    const { token: token2 } = getAuth();
    if (!token2) return null;
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
    try {
      const res = await fetch(`${base}/charts`, {
        headers: { "X-Emby-Token": token2, Accept: "application/json" },
        signal: ctrl ? ctrl.signal : void 0
      });
      if (!res.ok) {
        warnOnce(`HTTP ${res.status}`);
        return null;
      }
      const data = validate(await res.json());
      if (!data) warnOnce("ung\xFCltige Antwort");
      return data;
    } catch (e) {
      warnOnce(e && e.name === "AbortError" ? "Zeit\xFCberschreitung" : "Netzwerkfehler");
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  function getCharts() {
    if (!getChartsUrl()) return Promise.resolve(null);
    return cached("charts", fetchCharts, TTL_MS);
  }
  var normId = (id) => String(id || "").replace(/-/g, "").toLowerCase();
  async function resolveChartItems(entries, { type, limit = 10 } = {}) {
    const list = (Array.isArray(entries) ? entries : []).filter((e) => e && e.id && (!type || e.type === type));
    if (!list.length) return [];
    const res = await getItems({ Ids: list.map((e) => e.id).join(","), ...BASE_PARAMS });
    const found = Array.isArray(res) ? res : res && Array.isArray(res.Items) ? res.Items : [];
    const byId = new Map(found.filter((i) => i && i.Id).map((i) => [normId(i.Id), i]));
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    for (const e of list) {
      const key = normId(e.id);
      const item = byId.get(key);
      if (!item || seen.has(key)) continue;
      seen.add(key);
      item._lfxViewers = e.viewers;
      item._lfxPlays = e.plays;
      out.push(item);
      if (out.length >= limit) break;
    }
    putItems(out);
    return out;
  }

  // src/js/features/rows/sources.js
  var MOVIE_SERIES = "Movie,Series";
  function asItems(res) {
    if (Array.isArray(res)) return res;
    return res && Array.isArray(res.Items) ? res.Items : [];
  }
  var newSeriesCache = { at: 0, promise: null };
  var TEN_MIN = 10 * 60 * 1e3;
  function getNewSeriesIds(now = Date.now()) {
    if (newSeriesCache.promise && now - newSeriesCache.at < TEN_MIN) return newSeriesCache.promise;
    const promise = getItems({
      IncludeItemTypes: "Episode",
      Recursive: true,
      SortBy: "DateCreated",
      SortOrder: "Descending",
      Fields: "SeriesId,DateCreated,PremiereDate",
      EnableImages: false,
      EnableUserData: false,
      Limit: 500
    }).then((res) => newSeriesIdsFrom(asItems(res), now)).catch((e) => {
      console.warn("[LenzFlix] Neue-Folgen-Abfrage fehlgeschlagen", e && e.message);
      newSeriesCache = { at: 0, promise: null };
      return /* @__PURE__ */ new Set();
    });
    newSeriesCache = { at: now, promise };
    return promise;
  }
  var MIN_CHART_ROW = 5;
  async function buildChartDefs() {
    try {
      const charts = await getCharts();
      if (!charts) return [];
      const specs = [
        { id: "top10-series", title: `Top 10 Serien auf ${brandName()}`, key: "series" },
        { id: "top10-movies", title: `Top 10 Filme auf ${brandName()}`, key: "movies" }
      ];
      const defs = [];
      for (const s of specs) {
        const list = await resolveChartItems(charts[s.key], { limit: 10 });
        if (list.length >= MIN_CHART_ROW) defs.push({ id: s.id, title: s.title, kind: "top10", load: () => list });
      }
      return defs;
    } catch (e) {
      console.warn("[LenzFlix] Chart-Zeilen nicht aufgebaut", e && e.message);
      return [];
    }
  }
  async function buildRowDefs({ seed = dayKey(), genreCount = 6 } = {}) {
    const [viewsRes, genresRes] = await Promise.allSettled([
      getViews(),
      getJson("/Genres", { userId: getUserId(), IncludeItemTypes: MOVIE_SERIES, Recursive: true })
    ]);
    const views = viewsRes.status === "fulfilled" ? asItems(viewsRes.value) : [];
    const genres = genresRes.status === "fulfilled" ? asItems(genresRes.value) : [];
    const movieView = views.find((v) => v.CollectionType === "movies");
    const tvView = views.find((v) => v.CollectionType === "tvshows");
    const items = (params) => getItems({ ...BASE_PARAMS, ...params }).then(asItems);
    const defs = [];
    defs.push({
      id: "resume",
      title: "Weiterschauen",
      kind: "resume",
      load: () => getResume({ ...BASE_PARAMS, MediaTypes: "Video", Limit: 20 }).then(asItems)
    });
    defs.push({
      id: "nextup",
      title: "Als N\xE4chstes",
      kind: "landscape",
      load: () => getNextUp({ ...BASE_PARAMS, Limit: 20, EnableResumable: false, EnableRewatching: false }).then(asItems)
    });
    const chartDefs = await buildChartDefs();
    if (chartDefs.length) defs.push(...chartDefs);
    else {
      defs.push({
        id: "top10",
        title: `Top 10: Neu auf ${brandName()}`,
        kind: "top10",
        load: () => items({
          IncludeItemTypes: MOVIE_SERIES,
          Recursive: true,
          SortBy: "DateCreated",
          SortOrder: "Descending",
          Limit: 10
        }).then(selectTop10)
      });
    }
    if (movieView) {
      defs.push({
        id: "latest-movies",
        title: "Neu hinzugef\xFCgt: Filme",
        kind: "landscape",
        load: () => getLatest({ ...BASE_PARAMS, ParentId: movieView.Id, GroupItems: true, Limit: 20 }).then(asItems)
      });
    }
    if (tvView) {
      defs.push({
        id: "latest-series",
        title: "Neu hinzugef\xFCgt: Serien",
        kind: "landscape",
        load: () => getLatest({ ...BASE_PARAMS, ParentId: tvView.Id, GroupItems: true, Limit: 20 }).then(asItems)
      });
    }
    defs.push({
      id: "favorites",
      title: "Meine Liste",
      kind: "landscape",
      load: () => items({ IncludeItemTypes: MOVIE_SERIES, Recursive: true, IsFavorite: true, SortBy: "SortName", Limit: 50 })
    });
    defs.push({
      id: "because",
      title: null,
      kind: "landscape",
      async load(def) {
        const played = await items({
          IncludeItemTypes: "Movie,Episode",
          Recursive: true,
          Filters: "IsPlayed",
          SortBy: "DatePlayed",
          SortOrder: "Descending",
          Limit: 1
        });
        const last = played[0];
        if (!last) return [];
        const baseId = last.Type === "Episode" ? last.SeriesId : last.Id;
        const name = last.Type === "Episode" ? last.SeriesName : last.Name;
        if (!baseId || !name) return [];
        const similar = await getSimilar(baseId, { ...BASE_PARAMS, Limit: 20 }).then(asItems);
        if (similar.length) def.title = `Weil du ${name} angesehen hast`;
        return similar.filter((i) => i.Id !== baseId);
      }
    });
    for (const name of pickGenres(genres, { seed, count: genreCount })) {
      defs.push({
        id: `genre-${name}`,
        title: name,
        kind: "landscape",
        async load() {
          const list = await items({ IncludeItemTypes: MOVIE_SERIES, Recursive: true, Genres: name, SortBy: "Random", Limit: 20 });
          return list.length >= 8 ? list : [];
        }
      });
    }
    defs.push({
      id: "toprated",
      title: "Hochbewertet",
      kind: "landscape",
      load: () => items({
        IncludeItemTypes: MOVIE_SERIES,
        Recursive: true,
        SortBy: "CommunityRating",
        SortOrder: "Descending",
        MinCommunityRating: 7.5,
        Limit: 20
      })
    });
    return defs;
  }

  // src/js/features/rows.js
  function skeleton(def) {
    const cards = [];
    for (let i = 0; i < 6; i++) cards.push(h("div", { class: "lfx-skel" }));
    return h("section", { class: `lfx-row lfx-row--${def.kind}${def.kind === "landscape" ? " lfx-row--poster" : ""} is-loading`, dataset: { lfxRow: def.id } }, [
      h("div", { class: "lfx-row__head" }, [h("h2", { class: "lfx-row__title" }, def.title || "")]),
      h("div", { class: "lfx-row__viewport" }, [h("div", { class: "lfx-row__skeleton" }, cards)])
    ]);
  }
  function fill(rowEl, def, items, newSeries) {
    const now = Date.now();
    const cards = items.map((it, i) => createCard(it, {
      kind: def.kind,
      rank: def.kind === "top10" ? i + 1 : 0,
      badge: badgeFor2(it, newSeries, now)
    }));
    const track = h("div", { class: "lfx-row__track", role: "list", "aria-label": def.title || "" }, cards);
    const prev = chevronButton("prev", "Zur\xFCck");
    const next = chevronButton("next", "Weiter");
    const indicator = h("div", { class: "lfx-row__pages", "aria-hidden": "true", hidden: true });
    rowEl.querySelector(".lfx-row__head").append(indicator);
    const viewport = rowEl.querySelector(".lfx-row__viewport");
    viewport.textContent = "";
    viewport.append(prev, track, next);
    rowEl.querySelector(".lfx-row__title").textContent = def.title || "";
    rowEl.classList.remove("is-loading");
    return attachScroller({ track, prev, next, indicator });
  }
  function render4(slot) {
    let disposed = false;
    let observer2 = null;
    const disposers = [];
    slot.hidden = false;
    slot.textContent = "";
    disposers.push(onItemsChanged(({ removed }) => {
      if (disposed || !removed || !removed.length) return;
      const gone = new Set(removed);
      for (const row of [...slot.querySelectorAll(".lfx-row")]) {
        const track = row.querySelector(".lfx-row__track");
        if (!track) continue;
        let changed = false;
        for (const card3 of [...track.querySelectorAll(".lfx-card[data-lfx-id]")]) {
          if (gone.has(card3.dataset.lfxId)) {
            card3.remove();
            changed = true;
          }
        }
        if (!changed) continue;
        if (!track.querySelector(".lfx-card")) row.remove();
        else track.dispatchEvent(new Event("scroll"));
      }
    }));
    async function loadRow(rowEl, def) {
      try {
        const items = (await def.load(def)).filter((i) => i && i.Id);
        if (disposed) return;
        if (!items.length) {
          rowEl.remove();
          return;
        }
        putItems(items);
        const newSeries = await getNewSeriesIds();
        if (disposed) return;
        disposers.push(fill(rowEl, def, items, newSeries));
      } catch (e) {
        console.warn(`[LenzFlix] Zeile "${def.id}" nicht geladen`, e && e.message);
        if (!disposed) rowEl.remove();
      }
    }
    (async () => {
      if (!isReady()) {
        console.warn("[LenzFlix] Zeilen: keine Anmeldung");
        return;
      }
      let defs;
      try {
        defs = await buildRowDefs();
      } catch (e) {
        console.warn("[LenzFlix] Zeilen konnten nicht aufgebaut werden", e && e.message);
        return;
      }
      if (disposed) return;
      const pending = /* @__PURE__ */ new Map();
      for (const def of defs) {
        const el = skeleton(def);
        pending.set(el, def);
        slot.append(el);
      }
      if (typeof IntersectionObserver === "function") {
        observer2 = new IntersectionObserver((entries) => {
          for (const en of entries) {
            const def = pending.get(en.target);
            if (!en.isIntersecting || !def) continue;
            pending.delete(en.target);
            observer2.unobserve(en.target);
            loadRow(en.target, def);
          }
        }, { rootMargin: "600px 0px" });
        for (const el of pending.keys()) observer2.observe(el);
      } else {
        for (const [el, def] of pending) loadRow(el, def);
      }
    })();
    return () => {
      disposed = true;
      if (observer2) observer2.disconnect();
      observer2 = null;
      for (const d of disposers.splice(0)) d();
      slot.textContent = "";
    };
  }

  // src/js/features/home.js
  var HOME_ID = "lfx-home";
  var cleanups = [];
  var waitTimer = null;
  function isHomeRoute(route) {
    return route.path === "/home" && route.params.get("tab") !== "1" && !route.params.get("lfx");
  }
  function findHomeTab() {
    const tab2 = document.querySelector("#indexPage:not(.hide) #homeTab");
    return tab2 && tab2.isConnected ? tab2 : null;
  }
  function teardown3() {
    for (const fn of cleanups.splice(0)) {
      try {
        fn && fn();
      } catch (e) {
        console.error("[LenzFlix] home cleanup", e);
      }
    }
    document.getElementById(HOME_ID)?.remove();
    document.documentElement.classList.remove("lfx-home-on");
  }
  function build(tab2) {
    teardown3();
    const billboardSlot = h("section", { id: "lfx-billboard", class: "lfx-billboard", "aria-label": "Empfehlung" });
    const rowsSlot = h("div", { id: "lfx-rows", class: "lfx-rows" });
    const root4 = h("div", { id: HOME_ID, class: "lfx-home" }, [billboardSlot, rowsSlot]);
    tab2.prepend(root4);
    document.documentElement.classList.add("lfx-home-on");
    const ctx = { root: root4 };
    for (const [mod, slot] of [[billboard_exports, billboardSlot], [rows_exports, rowsSlot]]) {
      try {
        cleanups.push(mod.render(slot, ctx));
      } catch (e) {
        console.error("[LenzFlix] home render", e);
      }
    }
  }
  function ensure() {
    clearTimeout(waitTimer);
    const existing = document.getElementById(HOME_ID);
    const tab2 = findHomeTab();
    if (tab2 && existing && tab2.contains(existing)) return;
    if (tab2) {
      build(tab2);
      return;
    }
    let tries = 0;
    const poll = () => {
      const t = findHomeTab();
      if (t) build(t);
      else if (++tries < 30) waitTimer = setTimeout(poll, 200);
    };
    waitTimer = setTimeout(poll, 200);
  }
  var homeFeature = {
    name: "home",
    match: (route) => isHomeRoute(route) && !isTv() && isTheme("flix"),
    mount: () => ensure(),
    update: () => ensure(),
    unmount: () => {
      clearTimeout(waitTimer);
      teardown3();
    }
  };
  var home_default = homeFeature;

  // src/js/features/hovercard/meta.js
  var TICKS_PER_MIN2 = 6e8;
  function formatRating2(rating) {
    if (!rating) return "";
    const s = String(rating).trim();
    const m = /^(?:DE[-\s_:]*)?(?:FSK)[-\s_:]*(\d+)$/i.exec(s) || /^DE[-\s_:]*(\d+)$/i.exec(s);
    return m ? m[1] : s;
  }
  function formatMinutes(totalMin) {
    const min = Math.round(totalMin);
    if (!(min > 0)) return "";
    const h2 = Math.floor(min / 60);
    const m = min % 60;
    if (h2 && m) return `${h2} Std. ${m} Min.`;
    if (h2) return `${h2} Std.`;
    return `${m} Min.`;
  }
  function formatRuntimeTicks(ticks) {
    return ticks > 0 ? formatMinutes(ticks / TICKS_PER_MIN2) : "";
  }
  function formatDuration(item) {
    if (!item) return "";
    const count = item.ChildCount || 0;
    switch (item.Type) {
      case "Series": {
        const episodes = item.RecursiveItemCount || 0;
        if (count === 1 && episodes > 0) return `${episodes} ${episodes === 1 ? "Folge" : "Folgen"}`;
        if (count > 0) return `${count} ${count === 1 ? "Staffel" : "Staffeln"}`;
        return episodes > 0 ? `${episodes} ${episodes === 1 ? "Folge" : "Folgen"}` : "";
      }
      case "Season":
        return count > 0 ? `${count} ${count === 1 ? "Folge" : "Folgen"}` : "";
      case "BoxSet":
        return count > 0 ? `${count} Titel` : "";
      default:
        return formatRuntimeTicks(item.RunTimeTicks);
    }
  }
  function qualityBadge(item) {
    if (!item) return null;
    let width = item.Width || 0;
    if (!width) {
      const sources = item.MediaSources || [];
      for (const src of sources) {
        const v = (src.MediaStreams || []).find((s) => s.Type === "Video" && s.Width);
        if (v) {
          width = v.Width;
          break;
        }
      }
    }
    if (width >= 3800) return "4K";
    if (width >= 1200) return "HD";
    return null;
  }
  function progressPercent3(item) {
    const ud = item && item.UserData;
    if (!ud) return 0;
    let pct = 0;
    if (item.RunTimeTicks > 0 && ud.PlaybackPositionTicks > 0) pct = ud.PlaybackPositionTicks / item.RunTimeTicks * 100;
    else if (ud.PlayedPercentage > 0) pct = ud.PlayedPercentage;
    return Math.max(0, Math.min(100, pct));
  }
  function remainingText(item) {
    const ud = item && item.UserData;
    if (!item || !(item.RunTimeTicks > 0) || !ud || !(ud.PlaybackPositionTicks > 0)) return "";
    const left = Math.ceil((item.RunTimeTicks - ud.PlaybackPositionTicks) / TICKS_PER_MIN2);
    const text = formatMinutes(Math.max(1, left));
    return `noch ${text}`;
  }
  function episodeLabel2(item) {
    if (!item) return "";
    const name = item.Name ? `\u201E${item.Name}\u201C` : "";
    const n = item.IndexNumber;
    return [n || n === 0 ? `F${n}` : "", name].filter(Boolean).join(" ");
  }
  function genreList(item, max = 3) {
    const g = item && item.Genres || [];
    return g.filter(Boolean).slice(0, max);
  }
  function computePopupRect(cardRect, viewportW, scale = 1.5, { minWidth = 0, pad = 8, viewportH } = {}) {
    const cardW = cardRect.width !== void 0 ? cardRect.width : cardRect.right - cardRect.left;
    const cardH = cardRect.height !== void 0 ? cardRect.height : cardRect.bottom - cardRect.top;
    const cardLeft = cardRect.left;
    const cardTop = cardRect.top;
    const width = Math.min(Math.max(cardW * scale, minWidth), Math.max(0, viewportW - 2 * pad));
    const imageHeight = width * 9 / 16;
    let left = cardLeft + cardW / 2 - width / 2;
    if (left < pad) left = cardLeft;
    else if (left + width > viewportW - pad) left = cardLeft + cardW - width;
    left = Math.max(pad, Math.min(left, viewportW - pad - width));
    let top = cardTop + cardH / 2 - imageHeight / 2;
    if (viewportH) top = Math.max(pad, Math.min(top, viewportH - pad - imageHeight));
    return { left, top, width, imageHeight };
  }

  // src/js/features/hovercard.js
  var POPUP_ID = "lfx-hovercard";
  var EXCLUDED3 = /^\/(video|login|dashboard|selectserver|addserver|startup|forgotpassword|resetpassword|wizard)/;
  var NATIVE_TYPES = /* @__PURE__ */ new Set(["Movie", "Series", "Episode", "Season", "BoxSet", "Video"]);
  var DEFAULT_DELAY = 500;
  var CLOSE_GRACE = 150;
  var CLOSE_ANIM = 200;
  var SCALE = 1.5;
  var MIN_WIDTH = 300;
  var ITEM_TTL = 5 * 6e4;
  function resolveTarget2(el) {
    if (!el || typeof el.closest !== "function") return null;
    if (el.closest(`#${POPUP_ID}, #lfx-modal, .lfx-modal, .vertical-wrap`)) return null;
    const own = el.closest(".lfx-card[data-lfx-id]");
    if (own) return { card: own, id: own.dataset.lfxId, type: own.dataset.lfxType || "", own: true };
    const card3 = el.closest(".emby-scroller .card[data-id]");
    if (!card3 || !NATIVE_TYPES.has(card3.dataset.type)) return null;
    return { card: card3, id: card3.dataset.id, type: card3.dataset.type, own: false };
  }
  function stubItem(target) {
    const d = target.card.dataset;
    if (target.own) return { Id: target.id, Type: target.type };
    return {
      Id: target.id,
      Type: target.type,
      ServerId: d.serverid || void 0,
      MediaType: d.mediatype || void 0,
      IsFolder: d.isfolder === "true"
    };
  }
  function cardImageUrl(card3) {
    const img = card3.querySelector("img.lfx-card__img, img.cardImage");
    const src = img && (img.getAttribute("src") || img.getAttribute("data-src"));
    if (src) return src;
    const bg = card3.querySelector(".cardImageContainer");
    if (bg) {
      const m = /url\(["']?(.*?)["']?\)/.exec(bg.style.backgroundImage || "");
      if (m) return m[1];
    }
    return null;
  }
  var ICONS2 = {
    play: '<path d="M8 5v14l11-7z"/>',
    plus: '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/>',
    check: '<path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>',
    chevron: '<path d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z"/>'
  };
  function svg3(name) {
    return `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true" focusable="false">${ICONS2[name]}</svg>`;
  }
  var active = false;
  var session2 = null;
  var openTimer = null;
  var closeTimer = null;
  var listeners3 = [];
  var unsubItems = null;
  var lastOver = null;
  var wasHeld = false;
  function holdOpen() {
    return Boolean(isMenuOpen() || isChooserOpen());
  }
  function readDelay() {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue("--lfx-hover-delay").trim();
      const m = /^([\d.]+)(ms|s)$/.exec(v);
      if (m) return m[2] === "s" ? parseFloat(m[1]) * 1e3 : parseFloat(m[1]);
    } catch {
    }
    return DEFAULT_DELAY;
  }
  function hoverCapable() {
    return typeof window.matchMedia === "function" && window.matchMedia("(hover:hover) and (pointer:fine)").matches;
  }
  function enabled() {
    const cl2 = document.documentElement.classList;
    return cl2.contains("lfx-js") && !cl2.contains("lfx-tv") && !isTv() && !isMobile() && hoverCapable();
  }
  function clearOpen() {
    if (openTimer) clearTimeout(openTimer);
    openTimer = null;
  }
  function clearClose() {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = null;
  }
  async function setLike2(id, likes) {
    const { token: token2, userId } = getAuth();
    const res = await fetch(buildUrl(`/Users/${userId}/Items/${id}/Rating`, likes ? { likes: true } : void 0), {
      method: likes ? "POST" : "DELETE",
      headers: { Authorization: `MediaBrowser Token="${token2}"` }
    });
    if (!res.ok) throw new Error(`LenzFlix API: HTTP ${res.status} (Bewertung)`);
  }
  function userData(s) {
    return s.item && s.item.UserData || {};
  }
  function patchUserData(s, patch) {
    s.item = { ...s.item, UserData: { ...userData(s), ...patch } };
    putItems([s.item]);
    clearCache(`hc:${getUserId()}:${s.item.Id}`);
  }
  async function toggleFavorite(s) {
    if (s.busyFav) return;
    s.busyFav = true;
    const before = Boolean(s.fav);
    s.fav = !before;
    updateButtons(s);
    try {
      await setFavorite(s.item.Id, s.fav);
      patchUserData(s, { IsFavorite: s.fav });
    } catch (e) {
      s.fav = before;
      console.error("[LenzFlix] Favorit", e && e.message);
    } finally {
      s.busyFav = false;
      updateButtons(s);
    }
  }
  async function toggleLike(s) {
    if (s.busyLike) return;
    s.busyLike = true;
    const before = Boolean(s.like);
    s.like = !before;
    updateButtons(s);
    try {
      await setLike2(s.item.Id, s.like);
      patchUserData(s, { Likes: s.like ? true : void 0 });
    } catch (e) {
      s.like = before;
      console.error("[LenzFlix] Bewertung", e && e.message);
    } finally {
      s.busyLike = false;
      updateButtons(s);
    }
  }
  var SAVE_ERROR2 = "Konnte nicht gespeichert werden";
  var isBulk = (it) => Boolean(it) && (it.Type === "Series" || it.Type === "Season");
  var folgen2 = (n) => n === 1 ? "1 Folge" : `${n} Folgen`;
  async function loadBulkEpisodes(item) {
    const isSeason = item.Type === "Season";
    const seriesId = isSeason ? item.SeriesId || item.ParentId : item.Id;
    const params = { Fields: "UserData" };
    if (isSeason) params.SeasonId = item.Id;
    const res = await getEpisodes(seriesId, params);
    return res && res.Items || [];
  }
  async function togglePlayed(s) {
    if (s.busyPlayed) return;
    if (isBulk(s.item)) {
      askBulkPlayed(s);
      return;
    }
    s.busyPlayed = true;
    const item = s.item;
    const before = Boolean(s.played);
    const next = !before;
    s.played = next;
    updateButtons(s);
    try {
      await setPlayed(item.Id, next);
      patchUserData(s, { Played: next, PlaybackPositionTicks: 0 });
    } catch (e) {
      s.played = before;
      console.error("[LenzFlix] Gesehen", e && e.message);
      toast(SAVE_ERROR2);
    } finally {
      s.busyPlayed = false;
      updateButtons(s);
    }
  }
  async function askBulkPlayed(s) {
    s.busyPlayed = true;
    wasHeld = true;
    clearClose();
    const item = s.item;
    const next = !s.played;
    const verb = next ? "gesehen" : "ungesehen";
    let n = 0;
    try {
      n = (await loadBulkEpisodes(item)).length;
    } catch {
    }
    s.busyPlayed = false;
    confirmAction({
      title: n ? `${folgen2(n)} als ${verb} markieren?` : `Alle Folgen als ${verb} markieren?`,
      confirmLabel: `Als ${verb} markieren`,
      anchorEl: s.btns.played,
      onConfirm: async () => {
        s.busyPlayed = true;
        let failed = 0;
        try {
          await setPlayed(item.Id, next);
          try {
            const wrong = (await loadBulkEpisodes(item)).filter((e) => Boolean(e.UserData && e.UserData.Played === true) !== next);
            for (let i = 0; i < wrong.length; i += 6) {
              const res = await Promise.allSettled(wrong.slice(i, i + 6).map((e) => setPlayed(e.Id, next)));
              failed += res.filter((r) => r.status === "rejected").length;
            }
          } catch {
          }
          if (s.item && s.item.Id === item.Id) {
            s.played = next;
            patchUserData(s, { Played: next, PlaybackPositionTicks: 0 });
          }
          clearCache(`lfx:modal:item:${item.Id}`);
          clearCache(`lfx:modal:next:${item.Id}`);
          clearCache(`lfx:modal:eps:${item.Type === "Season" ? item.SeriesId || item.ParentId : item.Id}:`);
          toast(failed ? SAVE_ERROR2 : `${item.Type === "Season" ? "Staffel" : "Serie"} als ${verb} markiert`);
        } catch (e) {
          console.error("[LenzFlix] Gesehen", e && e.message);
          toast(SAVE_ERROR2);
        } finally {
          s.busyPlayed = false;
          updateButtons(s);
        }
      }
    });
  }
  function startPlayback(s) {
    const ud = userData(s);
    const resume = (ud.PlaybackPositionTicks || 0) > 0 || progressPercent3(s.item) > 0;
    const item = s.item;
    closeNow();
    play(item, { resume });
  }
  function openMenu(s) {
    wasHeld = true;
    clearClose();
    openItemMenu(s.item, s.btns.menu.btn, { onClose: () => onMenuClosed(s) });
  }
  function downloadClick(s) {
    wasHeld = true;
    clearClose();
    startDownload(s.item, s.btns.dl.btn);
  }
  function showDetails(s) {
    const item = s.item;
    closeNow();
    openModal(item);
  }
  function circleButton(cls, label, onClick) {
    const btn = h("button", { type: "button", class: `lfx-hc__btn ${cls}`, "aria-label": label });
    const tip = h("span", { class: "lfx-hc__tip", "aria-hidden": "true" }, label);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return { btn, tip, wrap: h("span", { class: "lfx-hc__btnwrap" }, [btn, tip]) };
  }
  function setButton(b, label, iconHtml, pressed) {
    b.btn.setAttribute("aria-label", label);
    b.tip.textContent = label;
    b.btn.innerHTML = iconHtml;
    if (pressed === void 0) b.btn.removeAttribute("aria-pressed");
    else b.btn.setAttribute("aria-pressed", String(pressed));
    b.btn.classList.toggle("is-on", Boolean(pressed));
  }
  function updateButtons(s) {
    setButton(s.btns.play, "Abspielen", svg3("play"));
    setButton(
      s.btns.list,
      s.fav ? "Aus Meiner Liste entfernen" : "Zu Meiner Liste hinzuf\xFCgen",
      s.fav ? svg3("check") : svg3("plus"),
      Boolean(s.fav)
    );
    setButton(
      s.btns.like,
      s.like ? "Gef\xE4llt mir nicht mehr" : "Gef\xE4llt mir",
      s.like ? ICON_LIKE : ICON_LIKE_OUTLINE,
      Boolean(s.like)
    );
    setButton(s.btns.dl, /^(Series|Season)$/.test(s.item.Type) ? "Episoden herunterladen" : "Herunterladen", ICON_DOWNLOAD);
    setButton(s.btns.menu, "Mehr", ICON_MORE);
    setButton(s.btns.more, "Weitere Infos", svg3("chevron"));
    const bulk = isBulk(s.item);
    const pb = s.btns.played;
    const what = s.item.Type === "Season" ? "Staffel" : "Ganze Serie";
    const label = bulk ? s.played ? `${what} als ungesehen markieren` : `${what} als gesehen markieren` : s.played ? "Als ungesehen markieren" : "Als gesehen markieren";
    pb.setAttribute("aria-label", label);
    pb.title = label;
    pb.innerHTML = s.played ? ICON_EYE_CHECK : ICON_EYE;
    pb.setAttribute("aria-pressed", String(Boolean(s.played)));
    pb.classList.toggle("is-on", Boolean(s.played));
  }
  function badge2(text, cls = "") {
    return h("span", { class: `lfx-hc__badge ${cls}`.trim() }, text);
  }
  function renderBody(s) {
    const it = s.item;
    const body = s.body;
    body.textContent = "";
    const pct = progressPercent3(it);
    if (it.Type === "Episode") {
      const label = episodeLabel2(it);
      if (label) body.append(h("div", { class: "lfx-hc__ep" }, label));
      if (pct > 0) {
        body.append(
          h("div", { class: "lfx-hc__progress" }, [
            h("div", { class: "lfx-hc__rail" }, h("div", { class: "lfx-hc__fill", style: { width: `${pct}%` } })),
            h("span", { class: "lfx-hc__remain" }, remainingText(it))
          ])
        );
      }
    }
    if (!(it.Type === "Episode" && pct > 0)) {
      const parts = [];
      const rating = formatRating2(it.OfficialRating);
      if (rating) parts.push(badge2(rating, "lfx-hc__badge--rating"));
      const dur = formatDuration(it);
      if (dur) parts.push(h("span", { class: "lfx-hc__dur" }, dur));
      const q = qualityBadge(it);
      if (q) parts.push(badge2(q, "lfx-hc__badge--q"));
      if (it.ProductionYear) parts.push(h("span", { class: "lfx-hc__year" }, String(it.ProductionYear)));
      if (parts.length) body.append(h("div", { class: "lfx-hc__meta" }, parts));
    }
    const genres = genreList(it, 3);
    if (genres.length) {
      const row = h("div", { class: "lfx-hc__genres" });
      genres.forEach((g, i) => {
        if (i) row.append(h("span", { class: "lfx-hc__dot", "aria-hidden": "true" }, "\u2022"));
        row.append(h("span", null, g));
      });
      body.append(row);
    }
  }
  function applyMedia(s) {
    const it = s.item;
    const portrait = !s.own && /Portrait|Square/i.test(s.card.className);
    const fromCard = cardImageUrl(s.card);
    const landscape = it && it.ImageTags ? landscapeImage(it) : null;
    const url = (portrait || !fromCard ? landscape || fromCard : fromCard) || null;
    if (url && s.img.getAttribute("src") !== url) s.img.src = url;
    if (s.overlay.childNodes.length) return;
    const cardLogo = s.card.querySelector(".lfx-card__logo");
    const cardTitle = s.card.querySelector(".lfx-card__title");
    if (cardLogo && cardLogo.getAttribute("src")) {
      s.overlay.append(h("img", { class: "lfx-hc__logo", src: cardLogo.getAttribute("src"), alt: "" }));
    } else if (cardTitle) {
      s.overlay.append(h("span", { class: "lfx-hc__title" }, cardTitle.textContent));
    } else if (!s.own && it && it.ImageTags) {
      const pick = pickLandscape(it);
      if (pick && pick.type !== "Thumb") {
        const logo = logoImage(it);
        if (logo) s.overlay.append(h("img", { class: "lfx-hc__logo", src: logo, alt: "" }));
        else if (it.Name) s.overlay.append(h("span", { class: "lfx-hc__title" }, it.Name));
      }
    }
  }
  function render5(s) {
    s.fav = Boolean(userData(s).IsFavorite);
    s.like = userData(s).Likes === true;
    s.played = userData(s).Played === true;
    s.el.setAttribute("aria-label", s.item.Name || s.card.querySelector("[aria-label]")?.getAttribute("aria-label") || "Titel");
    updateButtons(s);
    renderBody(s);
    applyMedia(s);
    refreshDownload(s);
  }
  function refreshDownload(s) {
    const item = s.item;
    Promise.resolve().then(() => canDownload(item)).then((ok) => {
      if (session2 !== s || !s.item || s.item.Id !== item.Id) return;
      s.btns.dl.wrap.hidden = !ok;
    }).catch(() => {
    });
  }
  async function hydrate(s, force = false) {
    const id = s.item.Id;
    if (!force && s.item.Genres && s.item.UserData) return;
    try {
      const full = await cached(`hc:${getUserId()}:${id}`, () => getItem(id), ITEM_TTL);
      if (session2 !== s || !full) return;
      const keepFav = s.busyFav ? s.fav : void 0;
      const keepLike = s.busyLike ? s.like : void 0;
      const keepPlayed = s.busyPlayed ? s.played : void 0;
      s.item = { ...s.item, ...full };
      putItems([s.item]);
      render5(s);
      if (keepFav !== void 0) s.fav = keepFav;
      if (keepLike !== void 0) s.like = keepLike;
      if (keepPlayed !== void 0) s.played = keepPlayed;
      if (keepFav !== void 0 || keepLike !== void 0 || keepPlayed !== void 0) updateButtons(s);
    } catch {
    }
  }
  function buildPopup(s) {
    const img = h("img", { class: "lfx-hc__img", alt: "", decoding: "async" });
    const overlay = h("div", { class: "lfx-hc__overlay" });
    const playedBtn = h("button", { type: "button", class: "lfx-hc__played", "aria-label": "Als gesehen markieren" });
    playedBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      togglePlayed(s);
    });
    const media = h("div", { class: "lfx-hc__media" }, [img, overlay, playedBtn]);
    media.addEventListener("click", () => showDetails(s));
    s.btns = {
      play: circleButton("lfx-hc__btn--play", "Abspielen", () => startPlayback(s)),
      list: circleButton("lfx-hc__btn--list", "Meine Liste", () => toggleFavorite(s)),
      like: circleButton("lfx-hc__btn--like", "Gef\xE4llt mir", () => toggleLike(s)),
      dl: circleButton("lfx-hc__btn--dl", "Herunterladen", () => downloadClick(s)),
      menu: circleButton("lfx-hc__btn--menu", "Mehr", () => openMenu(s)),
      more: circleButton("lfx-hc__btn--more", "Weitere Infos", () => showDetails(s))
    };
    s.btns.played = playedBtn;
    s.btns.dl.wrap.hidden = true;
    s.btns.menu.btn.setAttribute("aria-haspopup", "menu");
    const body = h("div", { class: "lfx-hc__body" });
    const actions = h("div", { class: "lfx-hc__actions" }, [
      h("div", { class: "lfx-hc__actions-main" }, [s.btns.play.wrap, s.btns.list.wrap, s.btns.like.wrap, s.btns.dl.wrap, s.btns.menu.wrap]),
      s.btns.more.wrap
    ]);
    const info = h("div", { class: "lfx-hc__info" }, [actions, body]);
    const el = h("div", { id: POPUP_ID, class: "lfx-hc", role: "dialog", "aria-label": "Titel" }, [media, info]);
    s.el = el;
    s.img = img;
    s.overlay = overlay;
    s.body = body;
    return el;
  }
  function open(target) {
    if (!enabled() || !target.card.isConnected) return;
    closeNow();
    const cardRect = target.card.getBoundingClientRect();
    if (!cardRect.width) return;
    const s = {
      card: target.card,
      target,
      own: target.own,
      item: getStoredItem(target.id) || stubItem(target),
      closing: false,
      removeTimer: null,
      busyFav: false,
      busyLike: false,
      busyPlayed: false
    };
    const el = buildPopup(s);
    session2 = s;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;
    const rect = computePopupRect(cardRect, vw, SCALE, { minWidth: MIN_WIDTH, viewportH: vh });
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.top}px`;
    el.style.width = `${rect.width}px`;
    render5(s);
    document.body.append(el);
    const total = el.offsetHeight;
    let top = rect.top;
    if (total && top + total > vh - 8) top = Math.max(8, vh - 8 - total);
    el.style.top = `${top}px`;
    const k = cardRect.width / rect.width;
    const dx = cardRect.left - rect.left;
    const dy = cardRect.top + cardRect.height / 2 - (top + rect.imageHeight * k / 2);
    el.style.setProperty("--lfx-hc-from", `translate(${dx}px, ${dy}px) scale(${k})`);
    void el.offsetWidth;
    el.classList.add("is-open");
    hydrate(s);
  }
  function removeSession(s) {
    if (s.removeTimer) clearTimeout(s.removeTimer);
    s.removeTimer = null;
    s.el.remove();
    if (session2 === s) session2 = null;
  }
  function close() {
    clearClose();
    const s = session2;
    if (!s || s.closing) return;
    s.closing = true;
    s.el.classList.remove("is-open");
    s.el.classList.add("is-closing");
    s.removeTimer = setTimeout(() => removeSession(s), CLOSE_ANIM);
  }
  function closeNow() {
    clearClose();
    if (session2) removeSession(session2);
  }
  function scheduleClose() {
    if (closeTimer || !session2 || session2.closing) return;
    closeTimer = setTimeout(() => {
      closeTimer = null;
      close();
    }, CLOSE_GRACE);
  }
  function leave() {
    clearOpen();
    if (holdOpen()) return;
    if (session2) scheduleClose();
  }
  function pointerStillInside(s, el) {
    if (el && el.isConnected && (s.el.contains(el) || s.card.contains(el))) return true;
    try {
      return s.el.matches(":hover") || s.card.matches(":hover");
    } catch {
      return false;
    }
  }
  function onMenuClosed(s) {
    wasHeld = false;
    if (session2 !== s || s.closing) return;
    if (!pointerStillInside(s, lastOver)) scheduleClose();
  }
  function onMove(e) {
    if (e.pointerType && e.pointerType !== "mouse") return;
    lastOver = e.target;
    if (!wasHeld) return;
    if (holdOpen()) return;
    wasHeld = false;
    if (session2 && !session2.closing && !pointerStillInside(session2, e.target)) scheduleClose();
  }
  function onOver(e) {
    if (e.pointerType && e.pointerType !== "mouse") return;
    const t = e.target;
    lastOver = t;
    if (holdOpen()) {
      wasHeld = true;
      clearOpen();
      return;
    }
    wasHeld = false;
    if (session2 && !session2.closing && session2.el.contains(t)) {
      clearClose();
      return;
    }
    const target = resolveTarget2(t);
    if (!target || !enabled()) {
      leave();
      return;
    }
    clearClose();
    if (session2 && !session2.closing && session2.card === target.card) return;
    clearOpen();
    if (session2) closeNow();
    openTimer = setTimeout(() => {
      openTimer = null;
      open(target);
    }, readDelay());
  }
  function onOut(e) {
    if (e.pointerType && e.pointerType !== "mouse") return;
    if (holdOpen()) return;
    if (!e.relatedTarget) leave();
  }
  function onKey(e) {
    if (holdOpen()) return;
    if (e.key === "Escape" && session2) close();
  }
  function onHash() {
    clearOpen();
    closeNow();
  }
  function onAbort() {
    if (holdOpen()) return;
    onHash();
  }
  function onItems({ removed = [], updated = [] } = {}) {
    const s = session2;
    if (!s || !s.item) return;
    const id = s.item.Id;
    if (removed.includes(id)) {
      closeNow();
      return;
    }
    if (updated.includes(id)) {
      clearCache(`hc:${getUserId()}:${id}`);
      const fresh = getStoredItem(id);
      if (fresh) s.item = { ...s.item, ...fresh };
      hydrate(s, true);
    }
  }
  function onClickCapture(e) {
    if (session2 && session2.el.contains(e.target)) return;
    onAbort();
  }
  function start() {
    if (active) return;
    active = true;
    const add2 = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      listeners3.push(() => target.removeEventListener(type, fn, opts));
    };
    add2(document, "pointerover", onOver, { passive: true });
    add2(document, "pointerout", onOut, { passive: true });
    add2(document, "pointermove", onMove, { passive: true });
    add2(document, "keydown", onKey);
    add2(document, "click", onClickCapture, true);
    add2(window, "scroll", onAbort, { capture: true, passive: true });
    add2(window, "resize", onAbort, { passive: true });
    add2(window, "hashchange", onHash);
    unsubItems = onItemsChanged(onItems);
  }
  function stop() {
    active = false;
    wasHeld = false;
    lastOver = null;
    if (typeof unsubItems === "function") unsubItems();
    unsubItems = null;
    clearOpen();
    closeNow();
    for (const off of listeners3.splice(0)) off();
  }
  var hovercardFeature = {
    name: "hovercard",
    match(route) {
      return isTheme("flix") && !EXCLUDED3.test(route.path) && isReady() && !isTv() && !isMobile() && hoverCapable();
    },
    mount() {
      start();
    },
    unmount() {
      stop();
    }
  };
  var hovercard_default = hovercardFeature;

  // src/js/features/newpopular/format.js
  var MONTHS = ["JAN", "FEB", "M\xC4R", "APR", "MAI", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEZ"];
  function dateParts(iso) {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;
    const d = new Date(t);
    return { month: MONTHS[d.getMonth()], day: String(d.getDate()).padStart(2, "0") };
  }
  function longDate(iso) {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "";
    return new Date(t).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" });
  }
  function sinceLabel(item, newSeriesIds, now = Date.now()) {
    const created2 = Date.parse(item && item.DateCreated);
    const recent = !Number.isNaN(created2) && now - created2 < 14 * 864e5;
    const has = newSeriesIds && typeof newSeriesIds.has === "function" && newSeriesIds.has(item.Id);
    if (item && item.Type === "Series" && has && !recent) return "Neue Folgen";
    const d = longDate(item && item.DateCreated);
    return d ? `Neu seit ${d}` : "Neu";
  }
  function hasPlayCounts(items) {
    return (items || []).some((i) => Number(i && i.UserData && i.UserData.PlayCount) > 0);
  }
  function uniqueTitles(items, limit = Infinity) {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const it of items || []) {
      if (!it || !it.Id || it.Type !== "Movie" && it.Type !== "Series" || seen.has(it.Id)) continue;
      seen.add(it.Id);
      out.push(it);
      if (out.length >= limit) break;
    }
    return out;
  }

  // src/js/features/newpopular.js
  var ROOT_ID3 = "lfx-newpopular";
  var ON_CLASS = "lfx-newpopular-on";
  var TYPES = "Movie,Series";
  var sectionDefs = () => [
    { id: "new", label: `Neu bei ${brandName()}`, icon: "\u{1F37F}" },
    { id: "watched", label: "Am h\xE4ufigsten geschaut", icon: "\u{1F525}" },
    { id: "top-series", label: "Top 10 Serien", icon: "\u{1F51F}" },
    { id: "top-movies", label: "Top 10 Filme", icon: "\u{1F51F}" }
  ];
  var cleanups2 = [];
  var waitTimer2 = null;
  function isNewRoute(route) {
    return route.path === "/home" && route.params.get("lfx") === "new";
  }
  function findHomeTab2() {
    const tab2 = document.querySelector("#indexPage:not(.hide) #homeTab");
    return tab2 && tab2.isConnected ? tab2 : null;
  }
  function teardown4() {
    for (const fn of cleanups2.splice(0)) {
      try {
        fn && fn();
      } catch (e) {
        console.error("[LenzFlix] newpopular cleanup", e);
      }
    }
    document.getElementById(ROOT_ID3)?.remove();
    document.documentElement.classList.remove(ON_CLASS);
  }
  var query = (params) => getItems({
    ...BASE_PARAMS,
    IncludeItemTypes: TYPES,
    Recursive: true,
    ...params
  }).then(asItems);
  function loadNew() {
    return query({ SortBy: "DateCreated", SortOrder: "Descending", Limit: 20 }).then((l) => uniqueTitles(l, 20));
  }
  var MIN_CHART_TITLES = 3;
  var chartSubtitle = (days) => `Meistgesehen auf ${brandName()} \xB7 letzte ${days || 30} Tage`;
  async function loadChart(key, limit, type) {
    try {
      const charts = await getCharts();
      if (!charts || !(charts[key] || []).length) return { items: [], charted: false };
      const items = await resolveChartItems(charts[key], { type, limit });
      return items.length >= MIN_CHART_TITLES ? { items, charted: true, windowDays: charts.windowDays } : { items: [], charted: false };
    } catch (e) {
      console.warn("[LenzFlix] Charts nicht aufl\xF6sbar", e && e.message);
      return { items: [], charted: false };
    }
  }
  async function loadMostWatchedSection() {
    const chart = await loadChart("all", 20);
    if (chart.charted) return { ...chart, items: uniqueTitles(chart.items, 20) };
    return { items: await loadMostWatched(), charted: false };
  }
  async function loadTopSection(type) {
    const chart = await loadChart(type === "Series" ? "series" : "movies", 10);
    if (chart.charted) return chart;
    return { items: await loadTop(type), charted: false };
  }
  async function loadMostWatched() {
    const byPlays = await query({ SortBy: "PlayCount", SortOrder: "Descending", Limit: 20 });
    if (hasPlayCounts(byPlays)) return uniqueTitles(byPlays, 20);
    return uniqueTitles(await query({ SortBy: "CommunityRating", SortOrder: "Descending", Limit: 20 }), 20);
  }
  var loadTop = (type) => query({
    IncludeItemTypes: type,
    SortBy: "DateCreated",
    SortOrder: "Descending",
    Limit: 10
  }).then((l) => uniqueTitles(l, 10));
  function svg4(path) {
    const w = h("span", { class: "lfx-np__ico", "aria-hidden": "true" });
    w.innerHTML = `<svg viewBox="0 0 24 24" focusable="false">${path}</svg>`;
    return w;
  }
  var ICON_PLAY2 = '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>';
  var ICON_PLUS2 = '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>';
  var ICON_CHECK2 = '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
  var ICON_DOWN = '<path d="M5 9l7 7 7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
  function roundButton2(label, icon5, onClick, extra = "") {
    const b = h("button", { type: "button", class: `lfx-np__btn ${extra}`.trim(), "aria-label": label, title: label, onclick: onClick });
    b.append(svg4(icon5));
    return b;
  }
  function iconButton(mod, label, icon5, onClick) {
    const b = h("button", { type: "button", class: `lfx-np__btn lfx-np__btn--${mod}`, "aria-label": label, title: label });
    b.append(h("span", { class: "lfx-np__ico", "aria-hidden": "true" }));
    b.firstChild.innerHTML = icon5;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick(b);
    });
    return b;
  }
  function extraButtons(item) {
    const folder = item.Type === "Series" || item.Type === "Season";
    const dl = iconButton("dl", folder ? "Episoden herunterladen" : "Herunterladen", ICON_DOWNLOAD, (b) => startDownload(item, b));
    dl.hidden = true;
    Promise.resolve(canDownload(item)).then((ok) => {
      if (ok && dl.isConnected) dl.hidden = false;
    }, () => {
    });
    const menu = iconButton("menu", "Mehr", ICON_MORE, (b) => openItemMenu(item, b));
    menu.setAttribute("aria-haspopup", "menu");
    return [dl, menu];
  }
  function favoriteButton(item) {
    let fav = Boolean(item.UserData && item.UserData.IsFavorite);
    function paint() {
      const label = fav ? "Aus Meine Liste entfernen" : "Zu Meine Liste hinzuf\xFCgen";
      btn.setAttribute("aria-label", label);
      btn.title = label;
      btn.querySelector("svg").innerHTML = fav ? ICON_CHECK2 : ICON_PLUS2;
      btn.classList.toggle("is-on", fav);
      btn.setAttribute("aria-pressed", String(fav));
    }
    const btn = roundButton2("Meine Liste", ICON_PLUS2, async () => {
      const next = !fav;
      try {
        await setFavorite(item.Id, next);
        fav = next;
        if (item.UserData) item.UserData.IsFavorite = next;
        paint();
      } catch (e) {
        console.warn("[LenzFlix] Meine Liste fehlgeschlagen", e && e.message);
      }
    }, "lfx-np__btn--fav");
    paint();
    return btn;
  }
  function createNewEntry(item, newSeries) {
    const parts = dateParts(item.DateCreated);
    const title = item.Name || "";
    const bg = imageUrl(item, { type: "Backdrop", maxWidth: 1e3, quality: 85 }) || (landscapeFor(item, 1e3) || {}).url;
    const logo = logoImage(item, { maxWidth: 400 });
    const open2 = (e) => {
      if (e && e.preventDefault) e.preventDefault();
      openModal(item);
    };
    const media = h("a", { class: "lfx-np__media", href: detailHref2(item), "aria-label": title, onclick: open2 }, [
      bg ? h("img", { class: "lfx-np__img", src: bg, alt: "", loading: "lazy", decoding: "async" }) : null,
      logo ? h("img", { class: "lfx-np__media-logo", src: logo, alt: "", loading: "lazy", decoding: "async" }) : h("span", { class: "lfx-np__media-title" }, title)
    ]);
    const buttons = h("div", { class: "lfx-np__btns" }, [
      roundButton2("Abspielen", ICON_PLAY2, () => {
        play(item, { resume: false });
      }),
      favoriteButton(item),
      ...extraButtons(item),
      roundButton2("Weitere Infos", ICON_DOWN, open2)
    ]);
    const genres = (item.Genres || []).slice(0, 4).join(" \u2022 ");
    const body = h("div", { class: "lfx-np__body" }, [
      h("div", { class: "lfx-np__name" }, title),
      h("div", { class: "lfx-np__since" }, sinceLabel(item, newSeries)),
      item.Overview ? h("p", { class: "lfx-np__overview" }, item.Overview) : null,
      genres ? h("div", { class: "lfx-np__genres" }, genres) : null
    ]);
    return h("article", { class: "lfx-np__entry", dataset: { lfxId: item.Id } }, [
      h("div", { class: "lfx-np__date", "aria-hidden": parts ? "true" : null }, parts ? [h("span", { class: "lfx-np__month" }, parts.month), h("span", { class: "lfx-np__day" }, parts.day)] : []),
      h("div", { class: "lfx-np__main" }, [h("div", { class: "lfx-np__mediawrap" }, [media, buttons]), body])
    ]);
  }
  function createRow(title, items, kind2, newSeries) {
    const now = Date.now();
    const cards = items.map((it, i) => createCard(it, {
      kind: kind2,
      rank: kind2 === "top10" ? i + 1 : 0,
      badge: badgeFor2(it, newSeries, now)
    }));
    const track = h("div", { class: "lfx-row__track", role: "list", "aria-label": title }, cards);
    const prev = chevronButton("prev", "Zur\xFCck");
    const next = chevronButton("next", "Weiter");
    const indicator = h("div", { class: "lfx-row__pages", "aria-hidden": "true", hidden: true });
    const el = h("div", { class: "lfx-rows" }, [
      h("section", { class: `lfx-row lfx-row--${kind2}` }, [
        h("div", { class: "lfx-row__head" }, [h("h2", { class: "lfx-row__title" }, title), indicator]),
        h("div", { class: "lfx-row__viewport" }, [prev, track, next])
      ])
    ]);
    return { el, scroller: { track, prev, next, indicator } };
  }
  function sectionShell(def) {
    return h("section", { class: "lfx-np__section", id: `lfx-np-${def.id}`, dataset: { np: def.id } }, [
      h("h2", { class: "lfx-np__heading" }, def.label)
    ]);
  }
  function build2(tab2) {
    teardown4();
    let disposed = false;
    const scrollers = [];
    const sections = new Map(sectionDefs().map((d) => [d.id, sectionShell(d)]));
    const pills = /* @__PURE__ */ new Map();
    const nav = h("nav", { class: "lfx-np__tabs", "aria-label": "Neu und beliebt" });
    function setActive(id) {
      for (const [pid, pill] of pills) pill.classList.toggle("is-active", pid === id);
    }
    for (const d of sectionDefs()) {
      const pill = h("button", {
        type: "button",
        class: "lfx-np__pill",
        dataset: { np: d.id },
        onclick: () => {
          const sec = sections.get(d.id);
          setActive(d.id);
          if (sec && typeof sec.scrollIntoView === "function") sec.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, [h("span", { class: "lfx-np__pill-ico", "aria-hidden": "true" }, d.icon), d.label]);
      pills.set(d.id, pill);
      nav.append(pill);
    }
    const root4 = h("div", { id: ROOT_ID3, class: "lfx-np" }, [nav, ...sections.values()]);
    tab2.prepend(root4);
    document.documentElement.classList.add(ON_CLASS);
    setActive("new");
    let raf = 0;
    const onScroll6 = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        let current6 = null;
        for (const [id, sec] of sections) {
          if (sec.isConnected && sec.getBoundingClientRect().top <= 170) current6 = id;
        }
        if (current6) setActive(current6);
      });
    };
    window.addEventListener("scroll", onScroll6, { passive: true });
    function drop(id) {
      sections.get(id)?.remove();
      sections.delete(id);
      pills.get(id)?.remove();
      pills.delete(id);
    }
    function relabel(id, label) {
      const heading = sections.get(id)?.querySelector(".lfx-np__heading");
      if (heading) heading.textContent = label;
      const pill = pills.get(id);
      if (pill && pill.lastChild) pill.lastChild.textContent = label;
    }
    let newSeriesIds = /* @__PURE__ */ new Set();
    function onChanged2({ removed = [], updated = [] }) {
      if (disposed) return;
      const list = root4.querySelector(".lfx-np__list");
      for (const id of removed) {
        root4.querySelectorAll("[data-lfx-id]").forEach((el) => {
          if (el.dataset.lfxId === id) el.remove();
        });
      }
      if (list && removed.length && !list.children.length) drop("new");
      if (list) {
        for (const id of updated) {
          const fresh = getStoredItem(id);
          const entry = [...list.children].find((el) => el.dataset.lfxId === id);
          if (fresh && entry) entry.replaceWith(createNewEntry(fresh, newSeriesIds));
        }
      }
    }
    cleanups2.push(onItemsChanged(onChanged2));
    async function fill3(id, loader, renderer, fallbackLabel) {
      try {
        const res = await loader();
        const items = Array.isArray(res) ? res : res.items;
        const meta = Array.isArray(res) ? {} : res;
        if (disposed) return;
        if (!items.length) {
          drop(id);
          return;
        }
        putItems(items);
        const newSeries = await getNewSeriesIds();
        if (disposed) return;
        newSeriesIds = newSeries;
        if (fallbackLabel && !meta.charted) relabel(id, fallbackLabel);
        renderer(sections.get(id), items, newSeries, meta);
      } catch (e) {
        console.warn(`[LenzFlix] Neu und beliebt "${id}" nicht geladen`, e && e.message);
        if (!disposed) drop(id);
      }
    }
    const rowRenderer = (title, kind2, fallbackTitle) => (sec, items, newSeries, meta = {}) => {
      const row = createRow(meta.charted || !fallbackTitle ? title : fallbackTitle, items, kind2, newSeries);
      sec.querySelector(".lfx-np__heading")?.remove();
      if (meta.charted) {
        row.el.querySelector(".lfx-row__head").after(h("p", { class: "lfx-np__sub" }, chartSubtitle(meta.windowDays)));
      }
      sec.append(row.el);
      scrollers.push(attachScroller(row.scroller));
    };
    if (isReady()) {
      fill3("new", loadNew, (sec, items, newSeries) => {
        sec.append(h("div", { class: "lfx-np__list" }, items.map((it) => createNewEntry(it, newSeries))));
      });
      fill3("watched", loadMostWatchedSection, rowRenderer("Am h\xE4ufigsten geschaut", "landscape"));
      fill3("top-series", () => loadTopSection("Series"), rowRenderer("Top 10 Serien", "top10", "Neueste Serien"), "Neueste Serien");
      fill3("top-movies", () => loadTopSection("Movie"), rowRenderer("Top 10 Filme", "top10", "Neueste Filme"), "Neueste Filme");
    } else {
      console.warn("[LenzFlix] Neu und beliebt: keine Anmeldung");
    }
    cleanups2.push(() => {
      disposed = true;
      window.removeEventListener("scroll", onScroll6);
      if (raf) cancelAnimationFrame(raf);
      for (const d of scrollers.splice(0)) {
        try {
          d && d();
        } catch {
        }
      }
    });
  }
  function ensure2() {
    clearTimeout(waitTimer2);
    const existing = document.getElementById(ROOT_ID3);
    const tab2 = findHomeTab2();
    if (tab2 && existing && tab2.contains(existing)) return;
    if (tab2) {
      build2(tab2);
      return;
    }
    let tries = 0;
    const poll = () => {
      const t = findHomeTab2();
      if (t) build2(t);
      else if (++tries < 30) waitTimer2 = setTimeout(poll, 200);
    };
    waitTimer2 = setTimeout(poll, 200);
  }
  var newPopularFeature = {
    name: "newpopular",
    match: (route) => isNewRoute(route) && !isTv(),
    mount: () => ensure2(),
    update: () => ensure2(),
    unmount: () => {
      clearTimeout(waitTimer2);
      teardown4();
    }
  };
  var newpopular_default = newPopularFeature;

  // src/js/features/contextmenu.js
  var EXCLUDED4 = /^\/(video|login|dashboard|selectserver|addserver|startup|forgotpassword|resetpassword|wizard)/;
  var TARGET = ".lfx-card[data-lfx-id], .lfx-modal__ep[data-lfx-id]";
  var LONG_PRESS_MS = 500;
  var MOVE_TOLERANCE = 10;
  var CLICK_WINDOW_MS = 700;
  var DOUBLE_OPEN_MS = 800;
  var active2 = false;
  var listeners4 = [];
  var pressTimer = null;
  var press = null;
  var swallowUntil = 0;
  var lastLongPressAt = -Infinity;
  function resolve(el) {
    if (!el || typeof el.closest !== "function") return null;
    return el.closest(TARGET);
  }
  function itemFor(el, fallbackType) {
    const id = el.dataset.lfxId;
    return getStoredItem(id) || { Id: id, Type: el.dataset.lfxType || fallbackType || void 0 };
  }
  function openFor(el, x, y) {
    const item = itemFor(el);
    const opts = {};
    if (el.classList.contains("lfx-modal__ep") && el.parentElement) {
      opts.siblings = [...el.parentElement.children].filter((n) => n.matches(".lfx-modal__ep[data-lfx-id]")).map((n) => itemFor(n, "Episode"));
    }
    openItemMenu(item, { x, y }, opts);
  }
  function inNativeDialog(el) {
    return Boolean(el.closest && el.closest(".dialogContainer, .dialog"));
  }
  function onContextMenu(e) {
    const el = resolve(e.target);
    if (!el) return;
    if (e.shiftKey) return;
    if (isMenuOpen() && inNativeDialog(el)) return;
    e.preventDefault();
    e.stopPropagation();
    if (Date.now() - lastLongPressAt < DOUBLE_OPEN_MS) return;
    openFor(el, e.clientX, e.clientY);
  }
  function cancelPress() {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
    press = null;
  }
  function onTouchStart(e) {
    if (e.touches && e.touches.length > 1) {
      cancelPress();
      return;
    }
    cancelPress();
    const el = resolve(e.target);
    if (!el) return;
    if (isMenuOpen() && inNativeDialog(el)) return;
    const t = e.touches && e.touches[0] || e;
    const state16 = { x: t.clientX, y: t.clientY, fired: false };
    press = state16;
    pressTimer = setTimeout(() => {
      pressTimer = null;
      if (press !== state16 || !el.isConnected) return;
      state16.fired = true;
      lastLongPressAt = Date.now();
      openFor(el, state16.x, state16.y);
    }, LONG_PRESS_MS);
  }
  function onTouchMove(e) {
    if (!press || press.fired) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    if (Math.hypot(t.clientX - press.x, t.clientY - press.y) > MOVE_TOLERANCE) cancelPress();
  }
  function onTouchEnd() {
    if (press && press.fired) swallowUntil = Date.now() + CLICK_WINDOW_MS;
    cancelPress();
  }
  function onClickCapture2(e) {
    if (!swallowUntil) return;
    const until = swallowUntil;
    if (e.target && e.target.closest && e.target.closest(".lfx-proxywrap")) return;
    swallowUntil = 0;
    if (Date.now() > until) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }
  function start2() {
    if (active2) return;
    active2 = true;
    const add2 = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      listeners4.push(() => target.removeEventListener(type, fn, opts));
    };
    add2(document, "contextmenu", onContextMenu, true);
    add2(document, "touchstart", onTouchStart, { passive: true });
    add2(document, "touchmove", onTouchMove, { passive: true });
    add2(document, "touchend", onTouchEnd, { passive: true });
    add2(document, "touchcancel", cancelPress, { passive: true });
    add2(window, "scroll", cancelPress, { capture: true, passive: true });
    add2(window, "click", onClickCapture2, true);
  }
  function stop2() {
    active2 = false;
    cancelPress();
    swallowUntil = 0;
    lastLongPressAt = -Infinity;
    for (const off of listeners4.splice(0)) off();
  }
  var contextmenuFeature = {
    name: "contextmenu",
    match(route) {
      return !isTv() && !EXCLUDED4.test(route.path);
    },
    mount() {
      start2();
      startItemWatch();
    },
    unmount() {
      stop2();
      stopItemWatch();
      closeChooser();
      cancelDownloads();
      clearToast();
    }
  };
  var contextmenu_default = contextmenuFeature;

  // src/js/features/statshint.js
  var ID4 = "lfx-statshint";
  var KEY = "lfx.statsHint";
  var SESSION_KEY = "lfx.statsHint.shown";
  var HINT_DURATION = 7e3;
  var HINT_DELAY = 1500;
  var HINT_DAYS = 10;
  var LEAVE_MS = 200;
  var EXCLUDED5 = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video)/;
  function readState() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      return v && typeof v === "object" ? v : {};
    } catch {
      return {};
    }
  }
  function writeState(patch) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...readState(), ...patch }));
    } catch {
    }
  }
  function markSeen() {
    writeState({ seen: true });
  }
  function shouldShow(now = Date.now()) {
    const st = readState();
    if (st.seen) return false;
    if (st.firstShown && now - st.firstShown > HINT_DAYS * 864e5) return false;
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return false;
    } catch {
    }
    return true;
  }
  function isHomeRoute2(route) {
    return route.path === "/home" && route.params.get("tab") !== "1" && !route.params.get("lfx");
  }
  var state5 = { el: null, showTimer: null, hideTimer: null, removeTimer: null, deadline: 0, remaining: 0, onClick: null };
  function clearTimers2() {
    clearTimeout(state5.showTimer);
    clearTimeout(state5.hideTimer);
    clearTimeout(state5.removeTimer);
    state5.showTimer = state5.hideTimer = state5.removeTimer = null;
  }
  function removeHint() {
    clearTimers2();
    if (state5.el) unmountPoint(state5.el);
    state5.el = null;
  }
  function leave2() {
    if (!state5.el) return;
    const el = state5.el;
    clearTimeout(state5.hideTimer);
    state5.hideTimer = null;
    el.classList.add("is-leaving");
    state5.removeTimer = setTimeout(() => {
      state5.removeTimer = null;
      if (state5.el === el) removeHint();
    }, LEAVE_MS);
  }
  function startHideTimer(ms) {
    clearTimeout(state5.hideTimer);
    state5.deadline = Date.now() + ms;
    state5.hideTimer = setTimeout(leave2, ms);
  }
  function canHover() {
    return typeof window.matchMedia === "function" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }
  function show() {
    state5.showTimer = null;
    const url = statsHref() || getStatsUrl();
    if (!url || state5.el || !shouldShow()) return;
    const link = h("a", { class: "lfx-statshint__link", href: url }, [
      h("span", { class: "lfx-statshint__badge" }, "Neu"),
      h("span", { class: "lfx-statshint__text" }, `${STATS_LABEL} \u2013 deine Sehgewohnheiten im \xDCberblick`),
      h("span", { class: "lfx-statshint__arrow", "aria-hidden": "true" }, "\u203A")
    ]);
    const close2 = h("button", { type: "button", class: "lfx-statshint__close", "aria-label": "Hinweis schlie\xDFen" }, "\xD7");
    close2.addEventListener("click", (e) => {
      e.preventDefault();
      leave2();
    });
    const root4 = mountPoint(ID4, { className: "lfx-statshint" });
    root4.classList.remove("is-leaving");
    const top = !isMobile();
    root4.classList.toggle("lfx-statshint--top", top);
    const nav = top ? document.getElementById("lfx-nav") : null;
    const navRight = nav ? Math.round(nav.getBoundingClientRect().right) : 0;
    root4.style.left = top && navRight > 0 ? `${navRight + 12}px` : "";
    root4.setAttribute("role", "status");
    root4.setAttribute("aria-live", "polite");
    root4.replaceChildren(h("div", { class: "lfx-statshint__box" }, [link, close2]));
    state5.el = root4;
    if (canHover()) {
      root4.addEventListener("mouseenter", () => {
        if (!state5.hideTimer) return;
        state5.remaining = Math.max(500, state5.deadline - Date.now());
        clearTimeout(state5.hideTimer);
        state5.hideTimer = null;
      });
      root4.addEventListener("mouseleave", () => {
        if (state5.el !== root4 || state5.hideTimer || state5.removeTimer) return;
        startHideTimer(state5.remaining || HINT_DURATION);
      });
    }
    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
    }
    if (!readState().firstShown) writeState({ firstShown: Date.now() });
    startHideTimer(HINT_DURATION);
  }
  function sync(route) {
    if (isHomeRoute2(route)) {
      if (!state5.el && !state5.showTimer && shouldShow()) state5.showTimer = setTimeout(show, HINT_DELAY);
    } else {
      removeHint();
    }
  }
  var statshintFeature = {
    name: "statshint",
    match(route) {
      return isTheme("flix") && isModern() && !isTv() && Boolean(getStatsUrl()) && !EXCLUDED5.test(route.path);
    },
    mount(route) {
      state5.onClick = (e) => {
        const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
        if (a && isStatsHref(a.getAttribute("href"))) {
          markSeen();
          removeHint();
        }
      };
      document.addEventListener("click", state5.onClick, true);
      sync(route);
    },
    update(route) {
      sync(route);
    },
    unmount() {
      if (state5.onClick) document.removeEventListener("click", state5.onClick, true);
      state5.onClick = null;
      removeHint();
    }
  };
  var statshint_default = statshintFeature;

  // src/js/core/popover.js
  var ID5 = "lfx-popover";
  var GAP = 8;
  var MARGIN = 8;
  var current4 = null;
  function isPopoverOpen() {
    return current4 !== null;
  }
  function closePopover({ restoreFocus = false } = {}) {
    const c = current4;
    if (!c) return;
    current4 = null;
    window.removeEventListener("keydown", c.onKeydown, true);
    document.removeEventListener("click", c.onDocClick, true);
    window.removeEventListener("resize", c.onClose);
    window.removeEventListener("scroll", c.onScroll, true);
    unmountPoint(c.el);
    if (c.anchorEl) {
      c.anchorEl.removeAttribute("aria-expanded");
      if (c.hadExpanded !== null) c.anchorEl.setAttribute("aria-expanded", c.hadExpanded);
      if (restoreFocus && c.anchorEl.isConnected && typeof c.anchorEl.focus === "function") {
        try {
          c.anchorEl.focus({ preventScroll: true });
        } catch {
        }
      }
    }
  }
  function place(el, anchorEl, align) {
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const a = anchorEl.getBoundingClientRect();
    const w = el.offsetWidth;
    const hgt = el.offsetHeight;
    let left = align === "start" ? a.left : a.right - w;
    let top = a.bottom + GAP;
    if (vw) left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));
    if (vh && top + hgt > vh - MARGIN) top = Math.max(MARGIN, a.top - GAP - hgt);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }
  function openPopover(anchorEl, { label, items = [], align = "end", className = "" } = {}) {
    closePopover();
    const el = mountPoint(ID5, { className: `lfx-popover${className ? ` ${className}` : ""}` });
    el.className = `lfx-popover${className ? ` ${className}` : ""}`;
    el.setAttribute("role", "menu");
    if (label) el.setAttribute("aria-label", label);
    const list = items.filter((it) => it && !it.hidden);
    const nodes = list.map((it) => {
      const cls = `lfx-popover__item${it.className ? ` ${it.className}` : ""}`;
      const kids = [];
      if (it.icon) {
        const ic = h("span", { class: "lfx-popover__icon", "aria-hidden": "true" });
        ic.innerHTML = it.icon;
        kids.push(ic);
      }
      kids.push(h("span", { class: "lfx-popover__label" }, it.label));
      const node = it.href ? h("a", { class: cls, role: "menuitem", href: it.href, dataset: { key: it.key } }, kids) : h("button", { type: "button", class: cls, role: "menuitem", dataset: { key: it.key } }, kids);
      node.addEventListener("click", () => {
        closePopover();
        if (typeof it.onClick === "function") it.onClick();
      });
      return node;
    });
    el.replaceChildren(...nodes);
    const c = { el, anchorEl, hadExpanded: anchorEl ? anchorEl.getAttribute("aria-expanded") : null };
    c.close = () => {
      if (current4 === c) closePopover({ restoreFocus: true });
    };
    c.onClose = () => {
      if (current4 === c) closePopover();
    };
    c.onScroll = (e) => {
      if (e.target && e.target !== document && el.contains(e.target)) return;
      c.onClose();
    };
    c.onDocClick = (e) => {
      if (el.contains(e.target) || anchorEl && anchorEl.contains(e.target)) return;
      c.onClose();
    };
    c.onKeydown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        c.close();
      } else if (e.key === "Tab") {
        closePopover({ restoreFocus: true });
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) && nodes.length) {
        const i = nodes.indexOf(document.activeElement);
        let next;
        if (e.key === "Home") next = 0;
        else if (e.key === "End") next = nodes.length - 1;
        else if (e.key === "ArrowDown") next = i < 0 ? 0 : (i + 1) % nodes.length;
        else next = i < 0 ? nodes.length - 1 : (i - 1 + nodes.length) % nodes.length;
        e.preventDefault();
        nodes[next].focus();
      }
    };
    current4 = c;
    if (anchorEl) anchorEl.setAttribute("aria-expanded", "true");
    window.addEventListener("keydown", c.onKeydown, true);
    document.addEventListener("click", c.onDocClick, true);
    window.addEventListener("resize", c.onClose);
    window.addEventListener("scroll", c.onScroll, true);
    if (anchorEl) place(el, anchorEl, align);
    if (nodes[0]) nodes[0].focus({ preventScroll: true });
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
    raf(() => {
      if (current4 === c) el.classList.add("is-open");
    });
    return { el, close: c.close };
  }

  // src/js/shared/profile.js
  function logout() {
    const d = window.Dashboard;
    if (d && typeof d.logout === "function") {
      d.logout();
      return;
    }
    window.location.hash = "#/mypreferencesmenu";
  }
  async function profileEntries({ theme, returnFocus } = {}) {
    const entries = [];
    if (getStatsUrl()) {
      entries.push({ key: "stats", label: "Meine Statistik", href: statsHref(theme) || getStatsUrl(), className: "is-stats" });
    }
    entries.push({ key: "design", label: "Design Einstellungen", onClick: () => openThemePicker({ returnFocus }) });
    entries.push({ key: "settings", label: "Einstellungen", href: "#/mypreferencesmenu" });
    let user = null;
    try {
      user = await getUser();
    } catch {
    }
    if (user && user.Policy && user.Policy.IsAdministrator) {
      entries.push({ key: "dashboard", label: "Dashboard", href: "#/dashboard" });
    }
    entries.push({ key: "logout", label: "Abmelden", onClick: () => logout() });
    return entries;
  }
  async function getUserChip() {
    let user = null;
    try {
      user = await getUser();
    } catch {
    }
    const name = user && user.Name || "";
    const tag = user && user.PrimaryImageTag;
    const id = user && user.Id || getUserId();
    const imageUrl2 = tag && id ? buildUrl(`/Users/${id}/Images/Primary`, { tag, maxWidth: 96 }) : null;
    return { name, imageUrl: imageUrl2 };
  }

  // src/js/shared/libraries.js
  var HUB_TYPES = ["movies", "tvshows", "homevideos", "mixed"];
  function viewHref(view) {
    const id = view.Id;
    const ct = view.CollectionType;
    const q = `topParentId=${id}&collectionType=${ct}`;
    switch (ct) {
      case "movies":
        return `#/movies?${q}`;
      case "tvshows":
        return `#/tv?${q}`;
      case "music":
        return `#/music?${q}`;
      case "books":
        return `#/books?${q}`;
      case "musicvideos":
        return `#/musicvideos?${q}`;
      case "boxsets":
        return `#/boxsets?${q}`;
      case "playlists":
        return `#/playlists?${q}`;
      case "homevideos":
        return `#/homevideos?topParentId=${id}`;
      case "livetv":
        return "#/livetv";
      default:
        return ct ? `#/list?parentId=${id}` : `#/mixed?topParentId=${id}&collectionType=mixed`;
    }
  }
  function getLibraries() {
    return cached("libraries", async () => {
      const res = await getViews();
      const list = Array.isArray(res) ? res : res && res.Items || [];
      return list.filter((v) => v && v.Id).map((v) => ({
        id: v.Id,
        name: v.Name,
        collectionType: v.CollectionType || null,
        href: viewHref(v),
        hubCapable: !v.CollectionType || HUB_TYPES.includes(v.CollectionType)
      }));
    }, 5 * 60 * 1e3);
  }

  // src/js/features/plus/header-icons.js
  var svg5 = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  var ICONS3 = {
    home: svg5('<path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M5.5 10v9.5h5v-5.2h3v5.2h5V10"/>'),
    homeFill: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3.5 11.2 12 4l8.5 7.2V20h-6v-5.7h-5V20h-6z"/></svg>',
    back: svg5('<path d="m14.5 5-7 7 7 7"/>'),
    list: svg5('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M12 8.8v6.4M8.8 12h6.4"/>'),
    movies: svg5('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 4v16M16 4v16M4 8.5h4M4 15.5h4M16 8.5h4M16 15.5h4"/>'),
    tv: svg5('<rect x="3" y="6.5" width="18" height="12" rx="2.5"/><path d="m8 3 4 3.5L16 3"/>'),
    star: svg5('<path d="m12 3.8 2.5 5.1 5.6.8-4.1 4 1 5.6-5-2.7-5 2.7 1-5.6-4.1-4 5.6-.8z"/>'),
    search: svg5('<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>')
  };

  // src/js/features/plus/mobile.js
  function isPhone() {
    return isMobile() && window.innerWidth < 800;
  }

  // src/js/features/plus/header.js
  var ROOT_ID4 = "lfx-plus-header";
  var ON_CLASS2 = "lfx-plus-header-on";
  var HIDDEN_CLASS = "lfx-plus-header-hidden";
  var EXCLUDED6 = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video|dashboard|queue)/;
  var SOLID_AT = 10;
  var HIDE_AFTER = 80;
  var SCROLL_DELTA = 4;
  var OPEN_DELAY = 150;
  var CLOSE_DELAY = 250;
  function navItems2(libs) {
    const list = Array.isArray(libs) ? libs : [];
    const movies = list.find((l) => l.collectionType === "movies") || null;
    const series = list.find((l) => l.collectionType === "tvshows") || null;
    const items = [
      { key: "home", label: "Startseite", href: "#/home", icon: "home" },
      { key: "list", label: "Meine Liste", href: "#/home?tab=1", icon: "list" }
    ];
    if (movies) items.push({ key: "movies", label: "Filme", href: browseHref(movies.id), icon: "movies" });
    if (series) items.push({ key: "series", label: "Serien", href: browseHref(series.id), icon: "tv" });
    items.push({ key: "new", label: "Neu & beliebt", href: "#/home?lfx=new", icon: "star" });
    return items;
  }
  function activeKey2(route, libs) {
    if (!route) return null;
    const list = Array.isArray(libs) ? libs : [];
    const movies = list.find((l) => l.collectionType === "movies");
    const series = list.find((l) => l.collectionType === "tvshows");
    const { kind: kind2, lib } = parseLfxRoute(route);
    if (route.path === "/home") {
      if (kind2 === "new") return "new";
      if (kind2 === "search") return "search";
      if (kind2 === "browse") {
        if (movies && lib === movies.id) return "movies";
        if (series && lib === series.id) return "series";
        return null;
      }
      if (kind2) return null;
      const tab2 = route.params.get("tab");
      if (tab2 === "1") return "list";
      return !tab2 || tab2 === "0" ? "home" : null;
    }
    const parent = route.params.get("topParentId") || route.params.get("parentId");
    if (route.path === "/movies" && (!parent || movies && parent === movies.id)) return "movies";
    if (route.path === "/tv" && (!parent || series && parent === series.id)) return "series";
    return null;
  }
  var state6 = {
    root: null,
    nav: null,
    chip: null,
    route: null,
    libs: [],
    seq: 0,
    // Menü-Öffnen
    mountSeq: 0,
    // Mount-Generation (async Füllung)
    cleanups: [],
    menu: null,
    pinned: false,
    openTimer: null,
    closeTimer: null,
    raf: 0,
    lastY: 0
  };
  var icon2 = (name, cls) => {
    const span2 = h("span", { class: cls, "aria-hidden": "true" });
    span2.innerHTML = ICONS3[name];
    return span2;
  };
  function applyActive3() {
    if (!state6.root) return;
    const key = state6.route ? activeKey2(state6.route, state6.libs) : null;
    for (const el of state6.root.querySelectorAll("[data-key]")) {
      const on = el.dataset.key === key;
      el.classList.toggle("is-active", on);
      if (on) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    }
  }
  function renderNav() {
    if (!state6.nav) return;
    state6.nav.textContent = "";
    for (const it of navItems2(state6.libs)) {
      state6.nav.append(
        h("a", { class: "lfx-plus-header__item", href: it.href, dataset: { key: it.key } }, [
          icon2(it.icon, "lfx-plus-header__icon"),
          h("span", { class: "lfx-plus-header__label" }, it.label)
        ])
      );
    }
    applyActive3();
  }
  var menuOpen = () => Boolean(state6.menu && state6.menu.el.isConnected && isPopoverOpen());
  function clearTimers3() {
    clearTimeout(state6.openTimer);
    clearTimeout(state6.closeTimer);
    state6.openTimer = null;
    state6.closeTimer = null;
  }
  function closeMenu() {
    clearTimers3();
    state6.seq++;
    if (menuOpen()) closePopover();
    state6.menu = null;
    state6.pinned = false;
  }
  async function openMenu2() {
    if (!state6.chip || menuOpen()) return;
    const seq3 = ++state6.seq;
    let items;
    try {
      items = await profileEntries({ theme: "plus", returnFocus: state6.chip });
    } catch {
      items = [];
    }
    if (seq3 !== state6.seq || !state6.chip || menuOpen()) return;
    const menu = openPopover(state6.chip, { label: "Profilmen\xFC", items, align: "start", className: "lfx-plus-menu" });
    state6.menu = menu;
    menu.el.addEventListener("mouseenter", () => clearTimeout(state6.closeTimer));
    menu.el.addEventListener("mouseleave", () => scheduleClose2());
  }
  function scheduleOpen() {
    clearTimeout(state6.closeTimer);
    if (menuOpen() || state6.openTimer) return;
    state6.openTimer = setTimeout(() => {
      state6.openTimer = null;
      openMenu2();
    }, OPEN_DELAY);
  }
  function scheduleClose2() {
    clearTimeout(state6.openTimer);
    state6.openTimer = null;
    if (state6.pinned || !menuOpen()) return;
    clearTimeout(state6.closeTimer);
    state6.closeTimer = setTimeout(() => {
      state6.closeTimer = null;
      if (!state6.pinned) closeMenu();
    }, CLOSE_DELAY);
  }
  function onChipClick() {
    clearTimers3();
    if (menuOpen()) {
      if (state6.pinned) closeMenu();
      else state6.pinned = true;
      return;
    }
    state6.pinned = true;
    openMenu2();
  }
  async function fillChip(mountSeq) {
    let user = { name: "", imageUrl: null };
    try {
      user = await getUserChip();
    } catch {
    }
    if (mountSeq !== state6.mountSeq || !state6.chip) return;
    const avatar = state6.chip.querySelector(".lfx-plus-header__avatar");
    const name = state6.chip.querySelector(".lfx-plus-header__name");
    name.textContent = user.name || "";
    if (user.imageUrl) {
      avatar.style.backgroundImage = `url("${user.imageUrl}")`;
      avatar.textContent = "";
    } else {
      avatar.textContent = (user.name || "?").trim().charAt(0).toUpperCase();
    }
    if (user.name) state6.chip.setAttribute("aria-label", `Profilmen\xFC: ${user.name}`);
  }
  function setHidden(on) {
    if (state6.root) state6.root.classList.toggle("is-hidden", on);
    document.documentElement.classList.toggle(HIDDEN_CLASS, on);
  }
  function scrollTick() {
    state6.raf = 0;
    const root4 = state6.root;
    if (!root4) return;
    const y = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
    const dy = y - state6.lastY;
    root4.classList.toggle("is-solid", y > SOLID_AT);
    if (y <= SOLID_AT) {
      setHidden(false);
    } else if (dy >= SCROLL_DELTA && y > HIDE_AFTER) {
      if (!root4.contains(document.activeElement) && !menuOpen()) setHidden(true);
    } else if (dy <= -SCROLL_DELTA) {
      setHidden(false);
    }
    if (Math.abs(dy) >= SCROLL_DELTA || y <= SOLID_AT) state6.lastY = y;
  }
  function onScroll2() {
    if (state6.raf) return;
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
    state6.raf = raf(scrollTick);
  }
  async function loadLibraries(mountSeq) {
    let libs = [];
    try {
      libs = await getLibraries() || [];
    } catch {
    }
    if (mountSeq !== state6.mountSeq || !state6.root) return;
    state6.libs = libs;
    renderNav();
  }
  var plusHeader = {
    name: "plus-header",
    match(route) {
      return isTheme("plus") && isModern() && !isTv() && !isPhone() && isReady() && !EXCLUDED6.test(route.path);
    },
    mount(route) {
      const mountSeq = ++state6.mountSeq;
      state6.route = route;
      state6.libs = [];
      state6.pinned = false;
      const root4 = mountPoint(ROOT_ID4, { tag: "header", className: "lfx-plus-header" });
      root4.textContent = "";
      state6.root = root4;
      const brand = h("a", { class: "lfx-plus-header__brand", href: "#/home", "aria-label": `${brandName("plus")} Startseite` });
      const chip = h("button", {
        type: "button",
        class: "lfx-plus-header__chip",
        "aria-haspopup": "menu",
        "aria-label": "Profilmen\xFC"
      }, [
        h("span", { class: "lfx-plus-header__avatar", "aria-hidden": "true" }),
        h("span", { class: "lfx-plus-header__name" })
      ]);
      const nav = h("nav", { class: "lfx-plus-header__nav", "aria-label": "Hauptnavigation" });
      const search = h("a", { class: "lfx-plus-header__search", href: searchHref(), "aria-label": "Suche", dataset: { key: "search" } });
      search.append(icon2("search", "lfx-plus-header__icon"));
      root4.append(h("div", { class: "lfx-plus-header__left" }, [brand, chip]), nav, search);
      state6.nav = nav;
      state6.chip = chip;
      chip.addEventListener("click", onChipClick);
      chip.addEventListener("mouseenter", scheduleOpen);
      chip.addEventListener("mouseleave", scheduleClose2);
      chip.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          state6.pinned = true;
          clearTimers3();
          openMenu2();
        }
      });
      document.documentElement.classList.add(ON_CLASS2);
      renderNav();
      window.addEventListener("scroll", onScroll2, { passive: true });
      state6.cleanups.push(() => window.removeEventListener("scroll", onScroll2));
      state6.lastY = Math.max(0, window.scrollY || 0);
      scrollTick();
      fillChip(mountSeq);
      loadLibraries(mountSeq);
    },
    update(route) {
      const changed = !state6.route || state6.route.hash !== route.hash;
      state6.route = route;
      if (changed) {
        closeMenu();
        setHidden(false);
      }
      applyActive3();
    },
    unmount() {
      state6.mountSeq++;
      closeMenu();
      for (const fn of state6.cleanups.splice(0)) fn();
      if (state6.raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(state6.raf);
      state6.raf = 0;
      unmountPoint(ROOT_ID4);
      document.documentElement.classList.remove(ON_CLASS2, HIDDEN_CLASS);
      state6.root = null;
      state6.nav = null;
      state6.chip = null;
      state6.libs = [];
    }
  };
  var header_default = plusHeader;

  // src/js/features/plus/mobilehead.js
  var ROOT_ID5 = "lfx-plus-mhead";
  var ON_CLASS3 = "lfx-plus-mhead-on";
  var EXCLUDED7 = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video|dashboard|queue)/;
  var SOLID_AT2 = 8;
  function showsBack(route) {
    if (!route) return false;
    if (route.path !== "/home") return true;
    const { kind: kind2 } = parseLfxRoute(route);
    return Boolean(kind2) && kind2 !== "hub";
  }
  function headerTitle(route, libs) {
    if (!route) return "";
    const list = Array.isArray(libs) ? libs : [];
    const libName = (id) => (list.find((l) => l.id === id) || {}).name || "";
    if (route.path === "/home") {
      const { kind: kind2, lib } = parseLfxRoute(route);
      if (kind2 === "hub" || kind2 === "browse") return libName(lib) || (kind2 === "browse" ? "Bibliothek" : "");
      if (kind2 === "new") return "Neu & beliebt";
      if (kind2 === "search") return "Suche";
      if (kind2) return "";
      return route.params.get("tab") === "1" ? "Meine Liste" : "F\xFCr dich";
    }
    if (route.path === "/movies" || route.path === "/tv") {
      const parent = route.params.get("topParentId") || route.params.get("parentId");
      return libName(parent) || (route.path === "/movies" ? "Filme" : "Serien");
    }
    if (/^\/(mypreferences|usermenu)/.test(route.path)) return "Einstellungen";
    return "";
  }
  var state7 = { root: null, backEl: null, titleEl: null, route: null, libs: [], seq: 0, raf: 0, cleanups: [] };
  function render6() {
    if (!state7.root) return;
    const back = showsBack(state7.route);
    state7.backEl.hidden = !back;
    state7.root.classList.toggle("has-back", back);
    state7.titleEl.textContent = headerTitle(state7.route, state7.libs);
  }
  function scrollTick2() {
    state7.raf = 0;
    if (!state7.root) return;
    const y = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
    state7.root.classList.toggle("is-solid", y > SOLID_AT2);
  }
  function onScroll3() {
    if (state7.raf) return;
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
    state7.raf = raf(scrollTick2);
  }
  async function loadLibraries2(seq3) {
    let libs = [];
    try {
      libs = await getLibraries() || [];
    } catch {
    }
    if (seq3 !== state7.seq || !state7.root) return;
    state7.libs = libs;
    render6();
  }
  var plusMobileHead = {
    name: "plus-mobilehead",
    match(route) {
      return isTheme("plus") && isModern() && !isTv() && isPhone() && isReady() && !EXCLUDED7.test(route.path);
    },
    mount(route) {
      const seq3 = ++state7.seq;
      state7.route = route;
      state7.libs = [];
      const root4 = mountPoint(ROOT_ID5, { tag: "header", className: "lfx-plus-mhead" });
      root4.textContent = "";
      const backEl = h("button", { type: "button", class: "lfx-plus-mhead__back", "aria-label": "Zur\xFCck", hidden: true });
      backEl.innerHTML = ICONS3.back;
      backEl.addEventListener("click", () => window.history.back());
      const titleEl = h("h1", { class: "lfx-plus-mhead__title" });
      root4.append(backEl, titleEl);
      state7.root = root4;
      state7.backEl = backEl;
      state7.titleEl = titleEl;
      document.documentElement.classList.add(ON_CLASS3);
      window.addEventListener("scroll", onScroll3, { passive: true });
      state7.cleanups.push(() => window.removeEventListener("scroll", onScroll3));
      render6();
      scrollTick2();
      loadLibraries2(seq3);
    },
    update(route) {
      state7.route = route;
      render6();
    },
    unmount() {
      state7.seq++;
      for (const fn of state7.cleanups.splice(0)) fn();
      if (state7.raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(state7.raf);
      state7.raf = 0;
      unmountPoint(ROOT_ID5);
      document.documentElement.classList.remove(ON_CLASS3);
      state7.root = null;
      state7.backEl = null;
      state7.titleEl = null;
      state7.libs = [];
    }
  };
  var mobilehead_default = plusMobileHead;

  // src/js/features/plus/switcher.js
  var ROOT_ID6 = "lfx-plus-switcher";
  var ON_CLASS4 = "lfx-plus-switcher-on";
  function isSwitcherRoute(route) {
    if (!route || route.path !== "/home" || !route.params) return false;
    const { kind: kind2 } = parseLfxRoute(route);
    if (kind2 === "hub") return true;
    if (route.params.get("lfx")) return false;
    const tab2 = route.params.get("tab");
    return !tab2 || tab2 === "0";
  }
  function switcherTabs(libs) {
    const tabs = [{ key: "foryou", label: "F\xFCr dich", href: "#/home" }];
    for (const l of Array.isArray(libs) ? libs : []) {
      tabs.push({ key: `lib:${l.id}`, label: l.name, href: l.hubCapable ? hubHref(l.id) : l.href });
    }
    return tabs;
  }
  function activeTab(route) {
    const { kind: kind2, lib } = parseLfxRoute(route);
    if (kind2 === "hub" && lib) return `lib:${lib}`;
    return "foryou";
  }
  var state8 = { root: null, route: null, libs: [], seq: 0 };
  function applyActive4() {
    if (!state8.root || !state8.route) return;
    const key = activeTab(state8.route);
    let active4 = null;
    for (const el of state8.root.querySelectorAll('[role="tab"]')) {
      const on = el.dataset.key === key;
      el.classList.toggle("is-active", on);
      el.setAttribute("aria-selected", String(on));
      el.tabIndex = on ? 0 : -1;
      if (on) active4 = el;
    }
    const list = state8.root.querySelector(".lfx-plus-switcher__list");
    if (active4 && list && list.scrollWidth > list.clientWidth) {
      list.scrollLeft = Math.max(0, active4.offsetLeft - (list.clientWidth - active4.offsetWidth) / 2);
    }
  }
  function render7() {
    if (!state8.root) return;
    const list = h("div", { class: "lfx-plus-switcher__list", role: "tablist", "aria-label": "Ansicht w\xE4hlen" });
    for (const t of switcherTabs(state8.libs)) {
      list.append(h("a", { class: "lfx-plus-switcher__tab", role: "tab", href: t.href, dataset: { key: t.key } }, t.label));
    }
    list.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const tabs = [...list.querySelectorAll('[role="tab"]')];
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      e.preventDefault();
      next.tabIndex = 0;
      next.focus();
    });
    state8.root.replaceChildren(list);
    applyActive4();
  }
  async function loadLibraries3(seq3) {
    let libs = [];
    try {
      libs = await getLibraries() || [];
    } catch {
    }
    if (seq3 !== state8.seq || !state8.root) return;
    state8.libs = libs;
    render7();
  }
  var plusSwitcher = {
    name: "plus-switcher",
    match(route) {
      return isTheme("plus") && isModern() && !isTv() && isReady() && isSwitcherRoute(route);
    },
    mount(route) {
      const seq3 = ++state8.seq;
      state8.route = route;
      state8.libs = [];
      state8.root = mountPoint(ROOT_ID6, { className: "lfx-plus-switcher" });
      document.documentElement.classList.add(ON_CLASS4);
      render7();
      loadLibraries3(seq3);
    },
    update(route) {
      state8.route = route;
      applyActive4();
    },
    unmount() {
      state8.seq++;
      unmountPoint(ROOT_ID6);
      document.documentElement.classList.remove(ON_CLASS4);
      state8.root = null;
      state8.libs = [];
    }
  };
  var switcher_default = plusSwitcher;

  // src/js/shared/hub.js
  var asItems2 = (res) => Array.isArray(res) ? res : res && Array.isArray(res.Items) ? res.Items : [];
  function hubTypes(lib) {
    switch (lib && lib.collectionType) {
      case "movies":
        return { items: "Movie", resume: "Movie" };
      case "tvshows":
        return { items: "Series", resume: "Episode" };
      case "homevideos":
        return { items: "Video", resume: "Video" };
      default:
        return { items: "Movie,Series", resume: "Movie,Episode" };
    }
  }
  async function loadResume(lib, types) {
    const list = asItems2(await getResume({
      ...BASE_PARAMS,
      ParentId: lib.id,
      MediaTypes: "Video",
      IncludeItemTypes: types.resume,
      Limit: 20
    }));
    return list;
  }
  async function buildHubRowDefs(lib, { seed = dayKey(), genreCount = 6 } = {}) {
    if (!lib || !lib.id) return [];
    const types = hubTypes(lib);
    const items = (params) => getItems({
      ...BASE_PARAMS,
      ParentId: lib.id,
      IncludeItemTypes: types.items,
      Recursive: true,
      ...params
    }).then(asItems2);
    const defs = [
      { id: `${lib.id}-resume`, title: "Weiterschauen", kind: "resume", load: () => loadResume(lib, types) },
      {
        id: `${lib.id}-latest`,
        title: "Neu hinzugef\xFCgt",
        kind: "landscape",
        load: () => getLatest({
          ...BASE_PARAMS,
          ParentId: lib.id,
          IncludeItemTypes: types.items,
          GroupItems: true,
          Limit: 20
        }).then(asItems2)
      },
      {
        id: `${lib.id}-toprated`,
        title: "Hochbewertet",
        kind: "poster",
        load: () => items({ SortBy: "CommunityRating", SortOrder: "Descending", Limit: 20 })
      }
    ];
    let genres;
    try {
      genres = asItems2(await getJson("/Genres", {
        userId: getUserId(),
        ParentId: lib.id,
        IncludeItemTypes: types.items,
        Recursive: true,
        SortBy: "SortName"
      }));
    } catch {
      genres = [];
    }
    const idByName = new Map(genres.filter((g) => g && g.Name && g.Id).map((g) => [g.Name, g.Id]));
    for (const name of pickGenres(genres, { seed, count: genreCount })) {
      const gid = idByName.get(name);
      if (!gid) continue;
      defs.push({
        id: `${lib.id}-genre-${gid}`,
        title: name,
        kind: "landscape",
        load: () => items({ GenreIds: gid, SortBy: "Random", Limit: 20 })
      });
    }
    defs.push({
      id: `${lib.id}-random`,
      title: "Zuf\xE4llige Auswahl",
      kind: "poster",
      load: () => items({ SortBy: "Random", Limit: 20 })
    });
    return defs;
  }
  var HERO_FIELDS = `${BASE_PARAMS.Fields},RemoteTrailers,LocalTrailerCount`;
  async function getHubHeroPool(lib) {
    if (!lib || !lib.id) return [];
    const types = hubTypes(lib);
    const q = (params) => getItems({
      ...BASE_PARAMS,
      Fields: HERO_FIELDS,
      ParentId: lib.id,
      IncludeItemTypes: types.items,
      Recursive: true,
      ...params
    }).then(asItems2);
    const [latest, random] = await Promise.all([
      q({ SortBy: "DateCreated", SortOrder: "Descending", Limit: 30 }).catch(() => []),
      q({ SortBy: "Random", Limit: 40 }).catch(() => [])
    ]);
    const pool = buildPool(latest, random, { newCount: 3, randomCount: 7 });
    if (pool.length) return pool;
    const seen = /* @__PURE__ */ new Set();
    return [...latest, ...random].filter((it) => {
      if (!it || !it.Id || seen.has(it.Id) || !(it.BackdropImageTags && it.BackdropImageTags.length)) return false;
      seen.add(it.Id);
      return true;
    }).slice(0, 8);
  }

  // src/js/shared/newcontent.js
  var TTL_MS2 = 5 * 60 * 1e3;
  var asArr = (res) => Array.isArray(res) ? res : res && Array.isArray(res.Items) ? res.Items : [];
  function newContentFrom(episodes, now = Date.now(), { days = NEW_DAYS2 } = {}) {
    const map = /* @__PURE__ */ new Map();
    for (const e of episodes || []) {
      if (!e || !e.SeriesId || !isRecent(e.DateCreated, now, days)) continue;
      const isSeason = e.IndexNumber === 1 && e.ParentIndexNumber > 1;
      if (isSeason) map.set(e.SeriesId, "season");
      else if (!map.has(e.SeriesId)) map.set(e.SeriesId, "episode");
    }
    return map;
  }
  var emptyInfo = () => ({ bySeries: /* @__PURE__ */ new Map(), newMovieIds: /* @__PURE__ */ new Set(), newSeriesIds: /* @__PURE__ */ new Set() });
  async function load(now) {
    const [eps, titles] = await Promise.allSettled([
      getItems({
        IncludeItemTypes: "Episode",
        Recursive: true,
        SortBy: "DateCreated",
        SortOrder: "Descending",
        Limit: 500,
        Fields: "DateCreated,ParentIndexNumber,IndexNumber,SeriesId",
        EnableImages: false,
        EnableUserData: false
      }),
      getItems({
        IncludeItemTypes: "Movie,Series",
        Recursive: true,
        SortBy: "DateCreated",
        SortOrder: "Descending",
        Limit: 100,
        Fields: "DateCreated",
        EnableImages: false,
        EnableUserData: false
      })
    ]);
    if (eps.status === "rejected" && titles.status === "rejected") throw eps.reason;
    const info = emptyInfo();
    if (eps.status === "fulfilled") info.bySeries = newContentFrom(asArr(eps.value), now);
    if (titles.status === "fulfilled") {
      for (const it of asArr(titles.value)) {
        if (!it || !it.Id || !isRecent(it.DateCreated, now)) continue;
        if (it.Type === "Movie") info.newMovieIds.add(it.Id);
        else if (it.Type === "Series") info.newSeriesIds.add(it.Id);
      }
    }
    return info;
  }
  async function getNewContentInfo() {
    try {
      return await cached("newcontent", () => load(Date.now()), TTL_MS2);
    } catch (e) {
      console.warn("[LenzFlix] Neu-Info nicht verf\xFCgbar", e && e.message);
      return emptyInfo();
    }
  }
  function kind(item, info) {
    if (!item || !info) return null;
    if (item.Type === "Movie") return info.newMovieIds && info.newMovieIds.has(item.Id) ? "movie" : null;
    if (item.Type !== "Series" && item.Type !== "Episode") return null;
    const sid = item.Type === "Episode" ? item.SeriesId : item.Id;
    if (item.Type === "Series" && info.newSeriesIds && info.newSeriesIds.has(sid)) return "series";
    const s = info.bySeries && info.bySeries.get(sid);
    if (s === "season") return "season";
    if (s === "episode") return "episode";
    return null;
  }
  var CAPS = { movie: "NEUER FILM", series: "NEUE SERIE", season: "NEUE STAFFEL", episode: "NEUE FOLGE" };
  var SENTENCE = { movie: "Neuer Film", series: "Neue Serie", season: "Neue Staffel", episode: "Neue Folge" };
  function newBadge(item, info) {
    const k = kind(item, info);
    return k ? CAPS[k] : null;
  }
  function plusBadge(item, info) {
    const k = kind(item, info);
    return k ? SENTENCE[k] : null;
  }

  // src/js/features/plus/card.js
  var SEP = " \u2022 ";
  function displayTitle2(item) {
    return item.Type === "Episode" && item.SeriesName ? item.SeriesName : item.Name || "";
  }
  function yearGenres(item) {
    const g = Array.isArray(item.Genres) ? item.Genres.filter(Boolean).slice(0, 3).join(", ") : "";
    return [item.ProductionYear ? String(item.ProductionYear) : "", g].filter(Boolean).join(SEP);
  }
  function remainingLabel(item) {
    const ud = item && item.UserData;
    const total = Number(item && item.RunTimeTicks) || 0;
    const pos = Number(ud && ud.PlaybackPositionTicks) || 0;
    if (!total || !(pos > 0) || pos >= total) return "";
    const min = Math.max(1, Math.round((total - pos) / 6e8));
    const hrs = Math.floor(min / 60);
    const rest = min % 60;
    if (!hrs) return `Noch ${min} Min.`;
    return rest ? `Noch ${hrs} Std. ${rest} Min.` : `Noch ${hrs} Std.`;
  }
  function episodeLine(item) {
    if (item.Type === "Episode") {
      const s = item.ParentIndexNumber;
      const e = item.IndexNumber;
      const code = s != null && e != null ? `S${s}:F${e}` : e != null ? `F${e}` : "";
      return [code, item.Name].filter(Boolean).join(" ");
    }
    return yearGenres(item);
  }
  function ratingBox(item) {
    const r = formatRating(item && item.OfficialRating);
    return r ? h("span", { class: "lfx-plus-rating" }, r) : null;
  }
  function cardShell(item, kind2, extraClass) {
    return h("div", {
      class: `lfx-card lfx-plus-card lfx-plus-card--${kind2}${extraClass ? ` ${extraClass}` : ""}`,
      dataset: { lfxId: item.Id, lfxType: item.Type || "" },
      tabindex: "-1",
      role: "listitem"
    });
  }
  function ariaFor(item) {
    if (item.Type === "Episode" && item.SeriesName) return `${item.SeriesName} \u2013 ${item.Name || ""}`.trim();
    return item.Name || "";
  }
  function createPosterCard(item, { badge: badge3 = null } = {}) {
    const url = posterUrl(item, 400) || null;
    const media = [];
    if (url) media.push(h("img", { class: "lfx-card__img", src: url, alt: "", loading: "lazy", decoding: "async" }));
    else media.push(h("span", { class: "lfx-card__title lfx-plus-card__fallback" }, displayTitle2(item)));
    if (badge3) {
      const logo = logoImage(item, { maxWidth: 360 });
      media.push(h("div", { class: "lfx-plus-card__new" }, [
        h("span", { class: "lfx-plus-badge" }, badge3),
        logo ? h("img", { class: "lfx-card__logo lfx-plus-card__logo", src: logo, alt: "", loading: "lazy", decoding: "async" }) : null,
        h("span", { class: "lfx-plus-card__meta" }, yearGenres(item))
      ]));
    }
    const link = h("a", { class: "lfx-card__link", href: titleHref(item.Id), "aria-label": ariaFor(item) }, media);
    const card3 = cardShell(item, "poster", badge3 ? "lfx-plus-card--new" : "");
    card3.append(link);
    return card3;
  }
  function createResumeCard(item) {
    const img = landscapeFor(item, 600);
    const media = [];
    if (img) media.push(h("img", { class: "lfx-card__img", src: img.url, alt: "", loading: "lazy", decoding: "async" }));
    else media.push(h("span", { class: "lfx-card__title lfx-plus-card__fallback" }, displayTitle2(item)));
    const p = progressPercent2(item);
    if (p > 0) {
      media.push(h("div", { class: "lfx-plus-progress" }, [
        h("div", { class: "lfx-plus-progress__bar", style: { width: `${Math.round(p * 10) / 10}%` } })
      ]));
    }
    const link = h("a", { class: "lfx-card__link", href: titleHref(item.Id), "aria-label": ariaFor(item) }, media);
    const playBtn = h("button", {
      type: "button",
      class: "lfx-plus-card__play lfx-card__action",
      "aria-label": `${displayTitle2(item)} fortsetzen`,
      tabindex: "-1",
      onclick: (e) => {
        e.preventDefault();
        e.stopPropagation();
        play(item, { resume: true });
      }
    }, [h("span", { class: "lfx-plus-card__play-icon", "aria-hidden": "true" })]);
    const rest = remainingLabel(item);
    const info = h("div", { class: "lfx-plus-card__info" }, [
      rest ? h("div", { class: "lfx-plus-card__rest" }, rest) : null,
      h("div", { class: "lfx-plus-card__name" }, displayTitle2(item)),
      h("div", { class: "lfx-plus-card__sub" }, [ratingBox(item), h("span", null, episodeLine(item))])
    ]);
    const card3 = cardShell(item, "resume");
    card3.append(h("div", { class: "lfx-plus-card__media" }, [link, playBtn]), info);
    return card3;
  }
  function createPlusCard(item, { kind: kind2 = "poster", badge: badge3 = null } = {}) {
    return kind2 === "resume" ? createResumeCard(item) : createPosterCard(item, { badge: badge3 });
  }

  // src/js/features/plus/hero.js
  var HERO_INTERVAL = 7e3;
  var HERO_FIELDS2 = `${BASE_PARAMS.Fields},Taglines`;
  var asItems3 = (res) => Array.isArray(res) ? res : res && Array.isArray(res.Items) ? res.Items : [];
  var CHEVRON2 = '<svg viewBox="0 0 14 27" aria-hidden="true" focusable="false"><polyline points="1.5,1.5 12.5,13.5 1.5,25.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function taglineFor(item) {
    const t = Array.isArray(item.Taglines) ? item.Taglines.find(Boolean) : "";
    if (t) return t;
    const o = String(item.Overview || "").replace(/\s+/g, " ").trim();
    if (o.length <= 150) return o;
    const cut = o.slice(0, 150);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 100)).replace(/[\s,.;:!?-]+$/, "")}\u2026`;
  }
  async function loadHomeHeroPool() {
    const q = (params) => getItems({
      ...BASE_PARAMS,
      Fields: HERO_FIELDS2,
      IncludeItemTypes: "Movie,Series",
      Recursive: true,
      ...params
    }).then(asItems3);
    const [latest, random] = await Promise.all([
      q({ SortBy: "DateCreated", SortOrder: "Descending", Limit: 30 }).catch(() => []),
      q({ SortBy: "Random", Limit: 40 }).catch(() => [])
    ]);
    const pool = buildPool(latest, random, { newCount: 3, randomCount: 7 });
    if (pool.length) return pool;
    const seen = /* @__PURE__ */ new Set();
    return [...latest, ...random].filter((it) => {
      if (!it || !it.Id || seen.has(it.Id) || !(it.BackdropImageTags && it.BackdropImageTags.length)) return false;
      seen.add(it.Id);
      return true;
    }).slice(0, 8);
  }
  function buildSlide(item, i, info, mobile) {
    const bd = mobile && imageUrl(item, { type: "Primary", maxWidth: 900, quality: 80 }) || imageUrl(item, { type: "Backdrop", maxWidth: mobile ? 1e3 : 1920, quality: 80 });
    const logo = logoImage(item, { maxWidth: 520 });
    const badge3 = plusBadge(item, info);
    const tag = taglineFor(item);
    const meta = yearGenres(item);
    const rating = ratingBox(item);
    return h("a", {
      class: "lfx-plus-hero__slide",
      href: titleHref(item.Id),
      dataset: { index: String(i) },
      "aria-label": item.Name || ""
    }, [
      bd ? h("img", { class: "lfx-plus-hero__img", src: bd, alt: "", decoding: "async", loading: i < 3 ? "eager" : "lazy" }) : null,
      h("div", { class: "lfx-plus-hero__shade", "aria-hidden": "true" }),
      h("div", { class: "lfx-plus-hero__content" }, [
        badge3 ? h("span", { class: "lfx-plus-badge lfx-plus-hero__badge" }, badge3) : null,
        logo ? h("img", { class: "lfx-plus-hero__logo", src: logo, alt: item.Name || "", decoding: "async" }) : h("span", { class: "lfx-plus-hero__title" }, item.Name || ""),
        tag ? h("p", { class: "lfx-plus-hero__tagline" }, tag) : null,
        rating || meta ? h("div", { class: "lfx-plus-hero__meta" }, [rating, meta ? h("span", null, meta) : null]) : null
      ])
    ]);
  }
  function createHero(items, { info = null, interval = HERO_INTERVAL, mobile = isPhone() } = {}) {
    const list = (items || []).filter((it) => it && it.Id);
    if (!list.length) return null;
    const n = list.length;
    const slides = list.map((it, i) => buildSlide(it, i, info, mobile));
    const track = h("div", { class: "lfx-plus-hero__track" }, slides);
    const prev = h("button", { type: "button", class: "lfx-plus-hero__nav lfx-plus-hero__nav--prev", "aria-label": "Vorherige Empfehlung", tabindex: "-1" });
    const next = h("button", { type: "button", class: "lfx-plus-hero__nav lfx-plus-hero__nav--next", "aria-label": "N\xE4chste Empfehlung", tabindex: "-1" });
    prev.innerHTML = CHEVRON2;
    next.innerHTML = CHEVRON2;
    const dots = list.map((it, i) => h("button", {
      type: "button",
      class: "lfx-plus-hero__dot",
      "aria-label": `Empfehlung ${i + 1} von ${n}`,
      onclick: () => go2(i)
    }));
    const dotsEl = h("div", { class: "lfx-plus-hero__dots" }, n > 1 ? dots : []);
    const el = h("section", { class: `lfx-plus-hero${mobile ? " lfx-plus-hero--m" : ""}`, "aria-roledescription": "carousel", "aria-label": "Empfehlungen" }, [
      h("div", { class: "lfx-plus-hero__viewport" }, [track]),
      n > 1 && !mobile ? prev : null,
      n > 1 && !mobile ? next : null,
      mobile ? null : dotsEl
    ]);
    let idx = 0;
    let timer = null;
    let hover = false;
    let focus = false;
    const running = () => !mobile && n > 1 && !hover && !focus && !document.hidden;
    function stop5() {
      clearTimeout(timer);
      timer = null;
    }
    function schedule2() {
      stop5();
      if (running()) timer = setTimeout(() => go2(idx + 1), interval);
    }
    function paint() {
      el.style.setProperty("--i", String(idx));
      slides.forEach((s, i) => {
        const active4 = i === idx;
        s.classList.toggle("is-active", active4);
        s.setAttribute("aria-hidden", active4 ? "false" : "true");
        s.tabIndex = active4 ? 0 : -1;
      });
      dots.forEach((d, i) => {
        d.classList.toggle("is-active", i === idx);
        if (i === idx) d.setAttribute("aria-current", "true");
        else d.removeAttribute("aria-current");
      });
    }
    function scrollToSlide(i) {
      const s = slides[i];
      if (!s || typeof track.scrollTo !== "function") return;
      const tr = track.getBoundingClientRect();
      const sr = s.getBoundingClientRect();
      const left = track.scrollLeft + (sr.left - tr.left) - (tr.width - sr.width) / 2;
      track.scrollTo({ left, behavior: "smooth" });
    }
    function go2(i) {
      idx = (i % n + n) % n;
      paint();
      if (mobile) scrollToSlide(idx);
      schedule2();
    }
    let scrollRaf = 0;
    function onTrackScroll() {
      if (scrollRaf) return;
      const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
      scrollRaf = raf(() => {
        scrollRaf = 0;
        const tr = track.getBoundingClientRect();
        const mid = tr.left + tr.width / 2;
        let best = idx;
        let bestD = Infinity;
        slides.forEach((s, i) => {
          const r = s.getBoundingClientRect();
          const d = Math.abs(r.left + r.width / 2 - mid);
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        });
        if (best !== idx) {
          idx = best;
          paint();
        }
      });
    }
    const onPrev = (e) => {
      e.preventDefault();
      go2(idx - 1);
    };
    const onNext = (e) => {
      e.preventDefault();
      go2(idx + 1);
    };
    const onSlideClick = (e) => {
      const s = e.target.closest && e.target.closest(".lfx-plus-hero__slide");
      if (!s || s.classList.contains("is-active")) return;
      e.preventDefault();
      go2(Number(s.dataset.index));
    };
    const onEnter = () => {
      hover = true;
      stop5();
    };
    const onLeave = () => {
      hover = false;
      schedule2();
    };
    const onFocusIn = () => {
      focus = true;
      stop5();
    };
    const onFocusOut = (e) => {
      if (!el.contains(e.relatedTarget)) {
        focus = false;
        schedule2();
      }
    };
    const onVis = () => document.hidden ? stop5() : schedule2();
    const onKey3 = (e) => {
      if (e.key === "ArrowLeft") go2(idx - 1);
      else if (e.key === "ArrowRight") go2(idx + 1);
    };
    prev.addEventListener("click", onPrev);
    next.addEventListener("click", onNext);
    track.addEventListener("click", onSlideClick);
    if (mobile) track.addEventListener("scroll", onTrackScroll, { passive: true });
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);
    el.addEventListener("focusin", onFocusIn);
    el.addEventListener("focusout", onFocusOut);
    el.addEventListener("keydown", onKey3);
    document.addEventListener("visibilitychange", onVis);
    paint();
    schedule2();
    return {
      el,
      go: go2,
      index: () => idx,
      destroy() {
        stop5();
        track.removeEventListener("scroll", onTrackScroll);
        if (scrollRaf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(scrollRaf);
        scrollRaf = 0;
        prev.removeEventListener("click", onPrev);
        next.removeEventListener("click", onNext);
        track.removeEventListener("click", onSlideClick);
        el.removeEventListener("mouseenter", onEnter);
        el.removeEventListener("mouseleave", onLeave);
        el.removeEventListener("focusin", onFocusIn);
        el.removeEventListener("focusout", onFocusOut);
        el.removeEventListener("keydown", onKey3);
        document.removeEventListener("visibilitychange", onVis);
        el.remove();
      }
    };
  }

  // src/js/shared/collections.js
  var asItems4 = (res) => Array.isArray(res) ? res : res && Array.isArray(res.Items) ? res.Items : [];
  var FIELDS2 = "ChildCount,ImageTags,BackdropImageTags";
  function pickImage(b) {
    const tags = b.ImageTags || {};
    const bd = Array.isArray(b.BackdropImageTags) ? b.BackdropImageTags[0] : null;
    if (tags.Thumb) return { type: "Thumb", tag: tags.Thumb };
    if (bd) return { type: "Backdrop", tag: bd };
    if (tags.Primary) return { type: "Primary", tag: tags.Primary };
    return null;
  }
  function getCollections({ tag = "lenzplus", fallbackLimit = 8 } = {}) {
    return cached(`collections:${tag}:${fallbackLimit}`, async () => {
      const q = (params) => getItems({
        IncludeItemTypes: "BoxSet",
        Recursive: true,
        Fields: FIELDS2,
        ImageTypeLimit: 1,
        EnableImageTypes: "Primary,Backdrop,Thumb",
        EnableUserData: false,
        ...params
      }).then(asItems4);
      let list = tag ? await q({ Tags: tag, SortBy: "SortName", SortOrder: "Ascending" }) : [];
      if (!list.length) {
        const all = await q({ SortBy: "SortName", SortOrder: "Ascending" });
        list = all.slice().sort((a, b) => (b.ChildCount || 0) - (a.ChildCount || 0)).slice(0, fallbackLimit);
      }
      return list.filter((b) => b && b.Id).map((b) => {
        const img = pickImage(b);
        return {
          id: b.Id,
          name: b.Name,
          imageUrl: img ? imageUrlFor(b.Id, { type: img.type, tag: img.tag, maxWidth: 640 }) : null,
          imageType: img ? img.type : null,
          href: `#/details?id=${b.Id}`
        };
      });
    }, 5 * 60 * 1e3);
  }

  // src/js/features/plus/brands.js
  function buildBrandRow(collections) {
    const list = (collections || []).filter((c) => c && c.id);
    if (!list.length) return null;
    const cells = list.map((c) => h("div", { role: "listitem", class: "lfx-plus-brands__cell" }, [
      h("a", { class: "lfx-plus-brand", href: titleHref(c.id), "aria-label": c.name || "Sammlung", title: c.name || "Sammlung" }, [
        c.imageUrl ? h("img", { class: "lfx-plus-brand__img", src: c.imageUrl, alt: "", loading: "lazy", decoding: "async" }) : null,
        c.imageUrl ? null : h("span", { class: "lfx-plus-brand__name" }, c.name || "")
      ])
    ]));
    return h("section", { class: "lfx-plus-brands", "aria-label": "Sammlungen" }, [
      h("div", { class: "lfx-plus-brands__track", role: "list" }, cells)
    ]);
  }
  function buildPlaceholder(count = 6) {
    const cells = Array.from({ length: count }, () => h("div", { class: "lfx-plus-brands__cell" }, [h("div", { class: "lfx-plus-brand" })]));
    return h("section", { class: "lfx-plus-brands is-loading", "aria-hidden": "true" }, [
      h("div", { class: "lfx-plus-brands__track" }, cells)
    ]);
  }
  function renderBrands(parent, before) {
    let disposed = false;
    let el = buildPlaceholder();
    parent.insertBefore(el, before && before.parentNode === parent ? before : null);
    const swap = (next) => {
      if (disposed) return;
      if (next) el.replaceWith(next);
      else el.remove();
      el = next;
    };
    getCollections().then((list) => swap(buildBrandRow(list))).catch((e) => {
      console.warn("[LenzFlix] Sammlungen nicht geladen", e && e.message);
      swap(null);
    });
    return () => {
      disposed = true;
      if (el) el.remove();
      el = null;
    };
  }

  // src/js/features/plus/rows.js
  function skeleton2(def) {
    const resume = def.kind === "resume";
    const cells = [];
    for (let i = 0; i < 6; i++) cells.push(h("div", { class: "lfx-plus-skel" }));
    return h("section", {
      class: `lfx-plus-row lfx-plus-row--${resume ? "resume" : "poster"} is-loading`,
      dataset: { lfxRow: def.id }
    }, [
      h("h2", { class: "lfx-plus-row__title" }, def.title || ""),
      h("div", { class: "lfx-plus-row__viewport" }, [h("div", { class: "lfx-plus-row__skeleton" }, cells)])
    ]);
  }
  function fill2(rowEl, def, items, info) {
    const resume = def.kind === "resume";
    const cards = items.map((it) => createPlusCard(it, {
      kind: resume ? "resume" : "poster",
      badge: resume ? null : plusBadge(it, info)
    }));
    const track = h("div", { class: "lfx-plus-row__track", role: "list", "aria-label": def.title || "" }, cards);
    const prev = chevronButton("prev", "Zur\xFCck");
    const next = chevronButton("next", "Weiter");
    prev.classList.add("lfx-plus-row__arrow");
    next.classList.add("lfx-plus-row__arrow");
    const viewport = rowEl.querySelector(".lfx-plus-row__viewport");
    viewport.textContent = "";
    viewport.append(prev, track, next);
    rowEl.querySelector(".lfx-plus-row__title").textContent = def.title || "";
    rowEl.classList.remove("is-loading");
    return attachScroller({ track, prev, next, indicator: null });
  }
  function renderRows(slot, getDefs) {
    let disposed = false;
    let observer2 = null;
    const disposers = [];
    slot.textContent = "";
    disposers.push(onItemsChanged(({ removed }) => {
      if (disposed || !removed || !removed.length) return;
      const gone = new Set(removed);
      for (const row of [...slot.querySelectorAll(".lfx-plus-row")]) {
        const track = row.querySelector(".lfx-plus-row__track");
        if (!track) continue;
        let changed = false;
        for (const card3 of [...track.querySelectorAll(".lfx-card[data-lfx-id]")]) {
          if (gone.has(card3.dataset.lfxId)) {
            card3.remove();
            changed = true;
          }
        }
        if (!changed) continue;
        if (!track.querySelector(".lfx-card")) row.remove();
        else track.dispatchEvent(new Event("scroll"));
      }
    }));
    async function loadRow(rowEl, def) {
      try {
        const items = (await def.load(def)).filter((i) => i && i.Id);
        if (disposed) return;
        if (!items.length) {
          rowEl.remove();
          return;
        }
        putItems(items);
        const info = await getNewContentInfo();
        if (disposed) return;
        disposers.push(fill2(rowEl, def, items, info));
      } catch (e) {
        console.warn(`[LenzFlix] Zeile "${def.id}" nicht geladen`, e && e.message);
        if (!disposed) rowEl.remove();
      }
    }
    (async () => {
      let defs;
      try {
        defs = await getDefs();
      } catch (e) {
        console.warn("[LenzFlix] Zeilen konnten nicht aufgebaut werden", e && e.message);
        return;
      }
      if (disposed) return;
      const pending = /* @__PURE__ */ new Map();
      for (const def of defs || []) {
        const el = skeleton2(def);
        pending.set(el, def);
        slot.append(el);
      }
      if (typeof IntersectionObserver === "function") {
        observer2 = new IntersectionObserver((entries) => {
          for (const en of entries) {
            const def = pending.get(en.target);
            if (!en.isIntersecting || !def) continue;
            pending.delete(en.target);
            observer2.unobserve(en.target);
            loadRow(en.target, def);
          }
        }, { rootMargin: "600px 0px" });
        for (const el of pending.keys()) observer2.observe(el);
      } else {
        for (const [el, def] of pending) loadRow(el, def);
      }
    })();
    return () => {
      disposed = true;
      if (observer2) observer2.disconnect();
      observer2 = null;
      for (const d of disposers.splice(0)) d();
      slot.textContent = "";
    };
  }

  // src/js/features/plus/home.js
  var ROOT_ID7 = "lfx-plus-home";
  var ON_CLASS5 = "lfx-plus-home-on";
  var cleanups3 = [];
  var waitTimer3 = null;
  var token = 0;
  var currentKey = null;
  var currentPhone = false;
  function routeKey(route) {
    if (!route || route.path !== "/home") return null;
    const lfx = route.params.get("lfx");
    if (lfx === "hub") {
      const lib = route.params.get("lib");
      return lib ? `hub:${lib}` : null;
    }
    if (lfx || route.params.get("tab") === "1") return null;
    return "home";
  }
  function findHomeTab3() {
    const tab2 = document.querySelector("#indexPage:not(.hide) #homeTab");
    return tab2 && tab2.isConnected ? tab2 : null;
  }
  function teardown5() {
    token++;
    for (const fn of cleanups3.splice(0)) {
      try {
        fn && fn();
      } catch (e) {
        console.error("[LenzFlix] plus-home cleanup", e);
      }
    }
    document.getElementById(ROOT_ID7)?.remove();
    document.documentElement.classList.remove(ON_CLASS5);
    currentKey = null;
    currentPhone = false;
  }
  async function build3(tab2, key) {
    teardown5();
    const my = token;
    const isHub = key.startsWith("hub:");
    const heroSlot = h("div", { class: "lfx-plus-home__hero is-loading" });
    const rowsSlot = h("div", { class: "lfx-plus-rows" });
    const root4 = h("div", { id: ROOT_ID7, class: `lfx-plus-home${isHub ? " lfx-plus-home--hub" : ""}` }, [heroSlot, rowsSlot]);
    tab2.prepend(root4);
    document.documentElement.classList.add(ON_CLASS5);
    currentKey = key;
    currentPhone = isPhone();
    const alive = () => my === token;
    let lib = null;
    if (isHub) {
      try {
        const libs = await getLibraries();
        lib = libs.find((l) => l.id === key.slice(4)) || null;
      } catch {
        lib = null;
      }
      if (!alive()) return;
    }
    (async () => {
      try {
        const [pool, info] = await Promise.all([
          isHub ? lib ? getHubHeroPool(lib) : [] : loadHomeHeroPool(),
          getNewContentInfo()
        ]);
        if (!alive() || !pool.length) return;
        const hero = createHero(pool, { info });
        if (!hero) return;
        heroSlot.classList.remove("is-loading");
        heroSlot.append(hero.el);
        cleanups3.push(() => hero.destroy());
      } catch (e) {
        console.warn("[LenzFlix] Hero nicht geladen", e && e.message);
      } finally {
        heroSlot.classList.remove("is-loading");
      }
    })();
    if (!isHub) cleanups3.push(renderBrands(root4, rowsSlot));
    cleanups3.push(renderRows(rowsSlot, () => isHub ? lib ? buildHubRowDefs(lib) : [] : buildRowDefs()));
  }
  function ensure3(route) {
    clearTimeout(waitTimer3);
    const key = routeKey(route);
    if (!key) return;
    const existing = document.getElementById(ROOT_ID7);
    const tab2 = findHomeTab3();
    if (tab2 && existing && tab2.contains(existing) && currentKey === key && currentPhone === isPhone()) return;
    let tries = 0;
    const poll = () => {
      const t = findHomeTab3();
      if (t) build3(t, key);
      else if (++tries < 30) waitTimer3 = setTimeout(poll, 200);
    };
    if (tab2) build3(tab2, key);
    else waitTimer3 = setTimeout(poll, 200);
  }
  var home_default2 = {
    name: "plus-home",
    match: (route) => isTheme("plus") && isModern() && !isTv() && isReady() && routeKey(route) !== null,
    mount: (route) => ensure3(route),
    update: (route) => ensure3(route),
    unmount: () => {
      clearTimeout(waitTimer3);
      teardown5();
    }
  };

  // src/js/shared/titleactions.js
  var SAVE_ERROR3 = "Konnte nicht gespeichert werden";
  var isPlayed2 = (it) => Boolean(it && it.UserData && it.UserData.Played === true);
  var folgen3 = (n) => n === 1 ? "1 Folge" : `${n} Folgen`;
  function clearPlayedCaches2(itemId, seriesId) {
    clearCache(`lfx:modal:item:${itemId}`);
    if (seriesId) {
      clearCache(`lfx:modal:next:${seriesId}`);
      clearCache(`lfx:modal:eps:${seriesId}:`);
    }
  }
  async function bulkPlayed2(seriesId, targetId, seasonIds, next) {
    await setPlayed(targetId, next);
    clearPlayedCaches2(seriesId, seriesId);
    const wrong = [];
    for (const sid of seasonIds) {
      try {
        for (const e of await loadEpisodes2(seriesId, sid)) if (isPlayed2(e) !== next) wrong.push(e);
      } catch {
      }
    }
    let failed = 0;
    for (let i = 0; i < wrong.length; i += 6) {
      const res = await Promise.allSettled(wrong.slice(i, i + 6).map((e) => setPlayed(e.Id, next)));
      failed += res.filter((r) => r.status === "rejected").length;
    }
    clearPlayedCaches2(seriesId, seriesId);
    return failed;
  }
  function askConfirm({ title, confirmLabel, anchorEl }) {
    return new Promise((resolve2) => {
      let done = false;
      let obs = null;
      const settle = (v) => {
        if (done) return;
        done = true;
        if (obs) obs.disconnect();
        resolve2(v);
      };
      const sheet = confirmAction({ title, confirmLabel, anchorEl, onConfirm: () => settle(true) });
      const overlay = sheet && sheet.overlay;
      if (overlay && typeof MutationObserver === "function") {
        obs = new MutationObserver(() => {
          if (!overlay.isConnected) settle(false);
        });
        obs.observe(document.body, { childList: true, subtree: true });
      }
    });
  }
  async function bulkToggle(item, anchorEl) {
    const isSeries = item.Type === "Series";
    const seriesId = isSeries ? item.Id : item.SeriesId || item.ParentId;
    let seasonIds;
    let episodeLists;
    try {
      if (isSeries) {
        const seasons = await loadSeasons(item.Id);
        seasonIds = seasons.map((s) => s.Id);
      } else {
        seasonIds = [item.Id];
      }
      episodeLists = [];
      for (const sid of seasonIds) episodeLists.push(await loadEpisodes2(seriesId, sid));
    } catch {
      seasonIds = seasonIds || [];
      episodeLists = episodeLists || [];
    }
    const eps = episodeLists.flat();
    const prev = isPlayed2(item);
    const next = isSeries ? !prev : !(eps.length > 0 && eps.every(isPlayed2));
    const n = eps.length;
    const verb = next ? "gesehen" : "ungesehen";
    const ok = await askConfirm({
      title: n ? `${folgen3(n)} als ${verb} markieren?` : `Alle Folgen als ${verb} markieren?`,
      confirmLabel: `Als ${verb} markieren`,
      anchorEl
    });
    if (!ok) return prev;
    try {
      const failed = await bulkPlayed2(seriesId, item.Id, seasonIds, next);
      if (failed) {
        toast(SAVE_ERROR3);
        return prev;
      }
      item.UserData = { ...item.UserData || {}, Played: next };
      putItems([item]);
      toast(isSeries ? `Serie als ${verb} markiert` : `${folgen3(n)} als ${verb} markiert`);
      return next;
    } catch {
      toast(SAVE_ERROR3);
      return prev;
    }
  }
  async function togglePlayed2(item, { anchorEl } = {}) {
    if (!item || !item.Id) return false;
    if (item.Type === "Series" || item.Type === "Season") return bulkToggle(item, anchorEl);
    const prev = { ...item.UserData || {} };
    const next = prev.Played !== true;
    item.UserData = { ...prev, Played: next, PlaybackPositionTicks: 0 };
    delete item.UserData.PlayedPercentage;
    try {
      await setPlayed(item.Id, next);
    } catch {
      item.UserData = prev;
      toast(SAVE_ERROR3);
      return prev.Played === true;
    }
    putItems([item]);
    clearPlayedCaches2(item.Id, item.Type === "Episode" ? item.SeriesId : null);
    return next;
  }
  async function toggleFavorite2(item) {
    if (!item || !item.Id) return false;
    const prev = Boolean(item.UserData && item.UserData.IsFavorite);
    const next = !prev;
    item.UserData = { ...item.UserData || {}, IsFavorite: next };
    try {
      await setFavorite(item.Id, next);
    } catch {
      item.UserData = { ...item.UserData || {}, IsFavorite: prev };
      return prev;
    }
    putItems([item]);
    return next;
  }
  async function startDownloadFor(item, { anchorEl } = {}) {
    if (!item || !item.Id) return false;
    try {
      await startDownload(item, anchorEl);
      return true;
    } catch {
      return false;
    }
  }
  async function openTitleMenu(item, anchorEl) {
    if (!item || !item.Id) return false;
    return Boolean(openItemMenu(item, anchorEl));
  }

  // src/js/features/plus/title-mount.js
  var ROOT = () => document.documentElement;
  function findHomeTab4() {
    const tab2 = document.querySelector("#indexPage:not(.hide) #homeTab");
    return tab2 && tab2.isConnected ? tab2 : null;
  }
  function whenHomeTab(cb, { tries = 30, every = 200 } = {}) {
    let dead = false;
    let timer = null;
    let n = 0;
    const poll = () => {
      timer = null;
      if (dead) return;
      const t = findHomeTab4();
      if (t) cb(t);
      else if (++n < tries) timer = setTimeout(poll, every);
    };
    poll();
    return () => {
      dead = true;
      if (timer) clearTimeout(timer);
      timer = null;
    };
  }
  function setPageOn(cls, on) {
    const cl2 = ROOT().classList;
    cl2.toggle("lfx-plus-page-on", on);
    cl2.toggle(cls, on);
  }
  function scrollTop() {
    try {
      window.scrollTo(0, 0);
    } catch {
    }
  }

  // src/js/features/plus/title-cards.js
  function ageBox(rating) {
    const r = String(rating || "").trim().replace(/^fsk[-\s]?/i, "");
    return r ? h("span", { class: "lfx-plus-age" }, r) : null;
  }
  function metaText(item, { genres = 3 } = {}) {
    if (!item) return "";
    const m = metaParts(item);
    const g = (item.Genres || []).slice(0, genres).join(", ");
    return [m.year, m.length, g].filter(Boolean).join(" \u2022 ");
  }
  function metaLine(item, opts) {
    return h("div", { class: "lfx-plus-meta" }, [ageBox(item && item.OfficialRating), h("span", { class: "lfx-plus-meta__text" }, metaText(item, opts))]);
  }
  var episodeCode = (ep) => ep && ep.ParentIndexNumber != null && ep.IndexNumber != null ? `S${ep.ParentIndexNumber}:F${ep.IndexNumber}` : "";
  function gridCard(item, { badge: badge3 = null, text = false } = {}) {
    const card3 = createCard(item, { kind: "landscape", badge: badge3 });
    card3.classList.add("lfx-card--plus");
    if (text) {
      const ep = item.Type === "Episode";
      const code = ep ? episodeCode(item) : "";
      const meta = ep ? [item.SeriesName, code].filter(Boolean).join(" \u2022 ") : "";
      card3.append(h("div", { class: "lfx-plus-result__text" }, [
        h("div", { class: "lfx-plus-result__title" }, item.Name || ""),
        ep ? h("div", { class: "lfx-plus-meta" }, [h("span", { class: "lfx-plus-meta__text" }, meta)]) : metaLine(item)
      ]));
    }
    return card3;
  }

  // src/js/features/plus/title.js
  var ROOT_ID8 = "lfx-plus-title";
  var TRAILER_ID = "lfx-plus-trailer";
  var ON_CLASS6 = "lfx-plus-title-on";
  var TICKS_PER_MIN3 = 6e8;
  var svg6 = (path) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${path}</svg>`;
  var ICON_PLAY3 = svg6('<path d="M7 4.5v15l12-7.5z"/>');
  var ICON_PLUS3 = svg6('<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/>');
  var ICON_CHECK3 = svg6('<path d="M9.2 16.6 4.9 12.3l1.4-1.4 2.9 2.9 8.5-8.5 1.4 1.4z"/>');
  var ICON_TRAILER = svg6('<path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2v10h14V7zm4 1.5 6 3.5-6 3.5z"/>');
  var ICON_CHEVRON = svg6('<path d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z"/>');
  var ICON_CLOSE = svg6('<path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z"/>');
  var state9 = null;
  var gen = 0;
  var routeId = (route) => {
    const r = parseLfxRoute(route);
    return r.kind === "title" ? r.id : null;
  };
  var stalenessOf = (g) => () => !state9 || state9.g !== g;
  function closeTrailer() {
    const el = document.getElementById(TRAILER_ID);
    if (!el) return;
    const v = el.querySelector("video");
    if (v) {
      try {
        v.pause();
        v.removeAttribute("src");
        if (v.load) v.load();
      } catch {
      }
    }
    if (typeof el.__lfxCleanup === "function") el.__lfxCleanup();
    unmountPoint(el);
  }
  function dispose() {
    gen += 1;
    const s = state9;
    state9 = null;
    closeTrailer();
    try {
      closePopover();
    } catch {
    }
    if (s) {
      if (s.cancelWait) s.cancelWait();
      for (const fn of s.cleanups.splice(0)) {
        try {
          fn && fn();
        } catch (e) {
          console.error("[LenzFlix] plus-title cleanup", e);
        }
      }
      if (s.root) s.root.remove();
    }
    document.getElementById(ROOT_ID8)?.remove();
    setPageOn(ON_CLASS6, false);
  }
  function circle(mod, label, icon5, onClick) {
    const b = h("button", { type: "button", class: `lfx-plus-circle lfx-plus-circle--${mod}`, "aria-label": label, title: label });
    const ico = h("span", { class: "lfx-plus-circle__ico", "aria-hidden": "true" });
    ico.innerHTML = icon5;
    b.append(ico);
    b.addEventListener("click", (e) => {
      e.preventDefault();
      onClick(b);
    });
    return b;
  }
  function setIcon(btn, icon5) {
    const ico = btn.querySelector(".lfx-plus-circle__ico");
    if (ico) ico.innerHTML = icon5;
  }
  function setLabel(btn, label) {
    btn.setAttribute("aria-label", label);
    btn.title = label;
  }
  var remainingText2 = (it) => {
    const total = Number(it && it.RunTimeTicks) || 0;
    const pos = Number(it && it.UserData && it.UserData.PlaybackPositionTicks) || 0;
    const left = Math.round((total - pos) / TICKS_PER_MIN3);
    return total && pos && left > 0 ? `Noch ${left} Min.` : "";
  };
  function backdropUrl(item) {
    return imageUrl(item, { type: "Backdrop", maxWidth: 1920, quality: 80 }) || landscapeImage(item, { maxWidth: 1920, quality: 80 });
  }
  function errorBox(message) {
    return h("div", { class: "lfx-plus-title__error", role: "alert" }, [
      h("h1", { class: "lfx-plus-title__errtitle" }, "Titel konnte nicht geladen werden"),
      h("p", null, message || "Bitte sp\xE4ter erneut versuchen."),
      h("a", { class: "lfx-plus-pill", href: "#/home" }, "Zur Startseite")
    ]);
  }
  function openTrailer(src, returnFocus) {
    closeTrailer();
    const overlay = mountPoint(TRAILER_ID, { className: "lfx-plus-trailer" });
    overlay.replaceChildren();
    const video = h("video", { class: "lfx-plus-trailer__video", controls: true, autoplay: true, playsinline: true });
    const close2 = () => {
      closeTrailer();
      if (returnFocus && returnFocus.isConnected && returnFocus.focus) {
        try {
          returnFocus.focus({ preventScroll: true });
        } catch {
        }
      }
    };
    const closeBtn = h("button", { type: "button", class: "lfx-plus-trailer__close", "aria-label": "Trailer schlie\xDFen", title: "Schlie\xDFen", onclick: close2 });
    const ico = h("span", { "aria-hidden": "true" });
    ico.innerHTML = ICON_CLOSE;
    closeBtn.append(ico);
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Trailer");
    overlay.append(video, closeBtn);
    const onKey3 = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close2();
    };
    const onBackdrop = (e) => {
      if (e.target === overlay) close2();
    };
    window.addEventListener("keydown", onKey3, true);
    overlay.addEventListener("click", onBackdrop);
    overlay.__lfxCleanup = () => {
      window.removeEventListener("keydown", onKey3, true);
      overlay.removeEventListener("click", onBackdrop);
    };
    video.addEventListener("error", () => {
      toast("Trailer konnte nicht abgespielt werden");
      close2();
    });
    video.addEventListener("ended", close2);
    video.src = src;
    try {
      const p = video.play && video.play();
      if (p && p.catch) p.catch(() => {
      });
    } catch {
    }
    closeBtn.focus();
  }
  async function resolveTarget3(id) {
    const first2 = getStoredItem(id) || await loadItem(id);
    if (!first2) throw new Error("Titel nicht gefunden");
    const sel = { target: id, seasonId: null, episodeId: null };
    if (first2.Type === "Episode") {
      sel.target = first2.SeriesId || first2.ParentId || id;
      sel.episodeId = first2.Id;
      sel.seasonId = first2.SeasonId || first2.ParentId || null;
    } else if (first2.Type === "Season") {
      sel.target = first2.SeriesId || first2.ParentId || id;
      sel.seasonId = first2.Id;
    }
    return sel;
  }
  function buildDetails(main) {
    const rows = [];
    const add2 = (label, value) => {
      if (!value) return;
      rows.push(h("div", { class: "lfx-plus-details__row" }, [h("dt", null, label), h("dd", null, value)]));
    };
    const runtime = main.Type === "Series" ? "" : formatRuntime(main.RunTimeTicks);
    add2("Laufzeit", runtime);
    if (main.Type === "Series" && main.ChildCount) add2("Staffeln", String(main.ChildCount));
    add2("Erscheinungsjahr", main.ProductionYear ? String(main.ProductionYear) : "");
    add2("Altersfreigabe", ratingText(main.OfficialRating));
    add2("Genres", (main.Genres || []).join(", "));
    add2("Studio", (main.Studios || []).map((s) => s.Name).filter(Boolean).slice(0, 4).join(", "));
    add2("Regie", peopleOf(main, "Director").map((p) => p.Name).slice(0, 4).join(", "));
    add2("Besetzung", peopleOf(main, "Actor").map((p) => p.Name).slice(0, 12).join(", "));
    const streams = main.MediaSources && main.MediaSources[0] && main.MediaSources[0].MediaStreams || [];
    const langs = (type) => [...new Set(streams.filter((s) => s.Type === type).map((s) => s.DisplayLanguage || s.Language).filter(Boolean))];
    add2("Audio", langs("Audio").join(", "));
    add2("Untertitel", langs("Subtitle").join(", "));
    const left = h("div", { class: "lfx-plus-details__main" }, [
      h("h2", { class: "lfx-plus-details__title" }, main.Name || ""),
      main.Taglines && main.Taglines[0] ? h("p", { class: "lfx-plus-details__tagline" }, main.Taglines[0]) : null,
      main.Overview ? h("p", { class: "lfx-plus-details__text" }, main.Overview) : null
    ]);
    return h("div", { class: "lfx-plus-details" }, [left, h("dl", { class: "lfx-plus-details__list" }, rows)]);
  }
  function episodeCard(ep, selected, onPlay) {
    const img = imageUrl(ep, { type: "Primary", maxWidth: 640, quality: 85 }) || (landscapeFor(ep, 640) || {}).url || null;
    const p = progressPercent(ep);
    const played = ep.UserData && ep.UserData.Played === true;
    const mins = formatRuntime(ep.RunTimeTicks);
    const media = h("span", { class: "lfx-plus-ep__media" }, [
      img ? h("img", { class: "lfx-plus-ep__img", src: img, alt: "", loading: "lazy", decoding: "async" }) : null,
      played ? h("span", { class: "lfx-plus-ep__seen", "aria-label": "Gesehen", title: "Gesehen" }) : null,
      p > 0 ? h("span", { class: "lfx-plus-progress lfx-plus-ep__progress" }, [h("span", { class: "lfx-plus-progress__bar", style: { width: `${Math.round(p * 10) / 10}%` } })]) : null
    ]);
    const num = ep.IndexNumber != null ? `${ep.IndexNumber}. ` : "";
    const btn = h("button", {
      type: "button",
      class: `lfx-plus-ep${selected ? " is-selected" : ""}`,
      dataset: { id: ep.Id },
      "aria-label": `${num}${ep.Name || ""} abspielen`,
      onclick: () => onPlay(ep)
    }, [
      media,
      h("span", { class: "lfx-plus-ep__title" }, `${num}${ep.Name || ""}`),
      mins ? h("span", { class: "lfx-plus-ep__dur" }, mins) : null,
      ep.Overview ? h("span", { class: "lfx-plus-ep__text" }, ep.Overview) : null
    ]);
    return btn;
  }
  async function load2(g) {
    const stale = stalenessOf(g);
    const s = state9;
    const root4 = s.root;
    let sel;
    let main;
    try {
      sel = await resolveTarget3(s.id);
      if (stale()) return;
      main = await loadItem(sel.target);
      if (!main) throw new Error("Titel nicht gefunden");
    } catch (e) {
      if (stale()) return;
      root4.replaceChildren(errorBox(e && e.message ? "Der Server hat nicht geantwortet." : ""));
      root4.classList.add("is-error");
      return;
    }
    if (stale()) return;
    const isSeries = main.Type === "Series";
    const isBox = main.Type === "BoxSet";
    const c = { main, seasons: [], seasonId: sel.seasonId, selectedEp: sel.episodeId, focusEp: null, nextUp: null, trailerSrc: null };
    const bg = backdropUrl(main);
    const backdrop = h("div", { class: "lfx-plus-title__backdrop", "aria-hidden": "true" }, [
      bg ? h("img", { class: "lfx-plus-title__bgimg", src: bg, alt: "", decoding: "async" }) : null,
      h("div", { class: "lfx-plus-title__shade" }),
      h("div", { class: "lfx-plus-title__dim" })
    ]);
    const logo = logoImage(main, { maxWidth: 720 });
    const name = h("h1", { class: `lfx-plus-title__name${logo ? " has-logo" : ""}` }, logo ? [h("img", {
      class: "lfx-plus-title__logo",
      src: logo,
      alt: main.Name || "",
      // Logo lädt nicht: Name als Text-Titel
      onerror: () => {
        name.classList.remove("has-logo");
        name.textContent = main.Name || "";
      }
    })] : main.Name || "");
    const progressSlot = h("div", { class: "lfx-plus-title__progress", hidden: true });
    const playLabel2 = h("span", { class: "lfx-plus-pill__label" }, "Abspielen");
    const playIco = h("span", { class: "lfx-plus-pill__ico", "aria-hidden": "true" });
    playIco.innerHTML = ICON_PLAY3;
    const playBtn = h("button", { type: "button", class: "lfx-plus-pill lfx-plus-pill--primary" }, [playIco, playLabel2]);
    const code = episodeCode;
    const target = () => {
      if (!isSeries) return { item: main, resume: hasResume(main), label: hasResume(main) ? "Fortsetzen" : "Abspielen" };
      const ep = c.focusEp || c.nextUp;
      if (!ep) return { item: null, resume: false, label: "Abspielen" };
      const cd = code(ep);
      const resume = hasResume(ep);
      if (resume) return { item: ep, resume, label: cd ? `${cd} fortsetzen` : "Fortsetzen" };
      return { item: ep, resume, label: c.focusEp && cd ? `${cd} abspielen` : "Abspielen" };
    };
    const paintPlay2 = () => {
      playLabel2.textContent = target().label;
      const it = isSeries ? c.focusEp || c.nextUp : main;
      const p = it ? progressPercent(it) : 0;
      progressSlot.replaceChildren();
      progressSlot.hidden = !(p > 0);
      if (p > 0) {
        const left = remainingText2(it);
        if (isSeries) {
          const cd = code(it);
          progressSlot.append(h("div", { class: "lfx-plus-title__eptitle" }, [cd, it.Name].filter(Boolean).join(" ")));
        }
        progressSlot.append(h("div", { class: "lfx-plus-title__progressrow" }, [
          h("span", { class: "lfx-plus-progress" }, [h("span", { class: "lfx-plus-progress__bar", style: { width: `${Math.round(p * 10) / 10}%` } })]),
          left ? h("span", { class: "lfx-plus-title__left" }, left) : null
        ]));
      }
    };
    playBtn.addEventListener("click", async () => {
      let t = target();
      if (isSeries && !t.item) {
        try {
          const eps = c.seasons.length ? await loadEpisodes2(main.Id, pickInitialSeason(c.seasons, null)) : [];
          t = { item: eps[0] || null, resume: false };
        } catch {
          t = { item: null };
        }
        if (stale()) return;
      }
      if (t.item) await play(t.item, { resume: Boolean(t.resume) });
    });
    const circles = [];
    const favBtn = circle("fav", "Zu Meine Liste hinzuf\xFCgen", ICON_PLUS3, async () => {
      favBtn.disabled = true;
      const on = await toggleFavorite2(main);
      favBtn.disabled = false;
      if (!stale()) paintFav(on);
    });
    const paintFav = (on) => {
      setIcon(favBtn, on ? ICON_CHECK3 : ICON_PLUS3);
      setLabel(favBtn, on ? "Aus Meine Liste entfernen" : "Zu Meine Liste hinzuf\xFCgen");
      favBtn.classList.toggle("is-on", on);
      favBtn.setAttribute("aria-pressed", String(on));
    };
    paintFav(Boolean(main.UserData && main.UserData.IsFavorite));
    circles.push(favBtn);
    const trailerBtn = circle("trailer", "Trailer ansehen", ICON_TRAILER, (b) => {
      if (c.trailerSrc) openTrailer(c.trailerSrc, b);
    });
    trailerBtn.hidden = true;
    circles.push(trailerBtn);
    const dlBtn = circle("dl", isSeries ? "Episoden herunterladen" : "Herunterladen", ICON_DOWNLOAD, (b) => {
      startDownloadFor(main, { anchorEl: b });
    });
    dlBtn.hidden = true;
    circles.push(dlBtn);
    const seenBtn = circle("seen", "Als gesehen markieren", ICON_EYE, async (b) => {
      b.disabled = true;
      const on = await togglePlayed2(main, { anchorEl: b });
      b.disabled = false;
      if (stale()) return;
      paintSeen(on);
      if (isSeries) refreshEpisodes();
    });
    const paintSeen = (on) => {
      setIcon(seenBtn, on ? ICON_EYE_CHECK : ICON_EYE);
      setLabel(seenBtn, on ? "Als ungesehen markieren" : "Als gesehen markieren");
      seenBtn.classList.toggle("is-on", on);
      seenBtn.setAttribute("aria-pressed", String(on));
    };
    paintSeen(Boolean(main.UserData && main.UserData.Played));
    circles.push(seenBtn);
    const moreBtn = circle("more", "Mehr", ICON_MORE, (b) => {
      openTitleMenu(main, b);
    });
    moreBtn.setAttribute("aria-haspopup", "menu");
    circles.push(moreBtn);
    const hero = h("section", { class: "lfx-plus-title__hero", "aria-label": main.Name || "Titel" }, [
      name,
      metaLine(main, { genres: 3 }),
      main.Overview ? h("p", { class: "lfx-plus-title__overview" }, main.Overview) : null,
      progressSlot,
      h("div", { class: "lfx-plus-title__buttons" }, [playBtn, ...circles])
    ]);
    const panels = [];
    const addTab = (id, label, panel) => panels.push({ id, label, panel });
    const episodesBody = h("div", { class: "lfx-plus-grid lfx-plus-grid--eps", role: "list" });
    const seasonBar = h("div", { class: "lfx-plus-title__seasonbar" });
    if (isSeries) addTab("eps", "Folgen", h("div", { class: "lfx-plus-panel" }, [seasonBar, episodesBody]));
    const listBody = h("div", { class: "lfx-plus-grid lfx-plus-grid--cards", role: "list" });
    if (isBox) addTab("items", "Titel", h("div", { class: "lfx-plus-panel" }, [listBody]));
    else addTab("similar", "Empfehlungen", h("div", { class: "lfx-plus-panel" }, [listBody]));
    addTab("details", "Details", h("div", { class: "lfx-plus-panel" }, [buildDetails(main)]));
    const tablist = h("div", { class: "lfx-plus-title__tabs", role: "tablist", "aria-label": "Bereiche" });
    const panelWrap = h("div", { class: "lfx-plus-title__panels" });
    const tabBtns = /* @__PURE__ */ new Map();
    const select = (id) => {
      for (const t of panels) {
        const on = t.id === id;
        tabBtns.get(t.id).classList.toggle("is-active", on);
        tabBtns.get(t.id).setAttribute("aria-selected", String(on));
        tabBtns.get(t.id).tabIndex = on ? 0 : -1;
        t.panel.hidden = !on;
      }
    };
    for (const t of panels) {
      const b = h("button", { type: "button", class: "lfx-plus-title__tab", role: "tab", id: `lfx-plus-tab-${t.id}`, onclick: () => select(t.id) }, t.label);
      t.panel.setAttribute("role", "tabpanel");
      t.panel.setAttribute("aria-labelledby", `lfx-plus-tab-${t.id}`);
      tabBtns.set(t.id, b);
      tablist.append(b);
      panelWrap.append(t.panel);
    }
    tablist.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const ids = panels.map((t) => t.id);
      const cur3 = ids.findIndex((i) => tabBtns.get(i).classList.contains("is-active"));
      const next = ids[(cur3 + (e.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length];
      select(next);
      tabBtns.get(next).focus();
    });
    select(panels[0].id);
    const footer = h("footer", { class: "lfx-plus-title__footer" });
    root4.classList.remove("is-loading");
    root4.replaceChildren(backdrop, h("div", { class: "lfx-plus-title__content" }, [hero, tablist, panelWrap, footer]));
    paintPlay2();
    let raf = 0;
    const onScroll6 = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const vh = window.innerHeight || 800;
        const v = Math.max(0, Math.min(1, (window.scrollY || document.documentElement.scrollTop || 0) / (vh * 0.55)));
        root4.style.setProperty("--lfx-plus-dim", String(Math.round(v * 100) / 100));
        tablist.classList.toggle("is-stuck", tablist.getBoundingClientRect().top <= 67);
      });
    };
    window.addEventListener("scroll", onScroll6, { passive: true });
    s.cleanups.push(() => {
      window.removeEventListener("scroll", onScroll6);
      if (raf) cancelAnimationFrame(raf);
    });
    const playEpisode = (ep) => play(ep, { resume: hasResume(ep) });
    async function showSeason2() {
      const sid = c.seasonId;
      if (!sid) return;
      let eps;
      try {
        eps = await loadEpisodes2(main.Id, sid);
      } catch {
        if (!stale() && c.seasonId === sid) episodesBody.replaceChildren(h("p", { class: "lfx-plus-empty" }, "Folgen konnten nicht geladen werden."));
        return;
      }
      if (stale() || c.seasonId !== sid) return;
      c.episodes = eps;
      if (c.selectedEp && !c.focusEp) {
        const hit = eps.find((e) => e.Id === c.selectedEp);
        if (hit) {
          c.focusEp = hit;
          paintPlay2();
        }
      }
      episodesBody.replaceChildren(...eps.map((e) => {
        const card3 = episodeCard(e, e.Id === c.selectedEp, playEpisode);
        card3.setAttribute("role", "listitem");
        return card3;
      }));
      if (!eps.length) episodesBody.append(h("p", { class: "lfx-plus-empty" }, "Keine Folgen vorhanden."));
    }
    const refreshEpisodes = () => {
      showSeason2();
    };
    function paintSeasonBar() {
      seasonBar.replaceChildren();
      const cur3 = c.seasons.find((x) => x.Id === c.seasonId);
      if (!cur3) return;
      if (c.seasons.length < 2) {
        seasonBar.append(h("span", { class: "lfx-plus-season lfx-plus-season--static" }, cur3.Name || "Staffel 1"));
        return;
      }
      const label = h("span", null, cur3.Name || "Staffel");
      const ico = h("span", { class: "lfx-plus-season__chev", "aria-hidden": "true" });
      ico.innerHTML = ICON_CHEVRON;
      const btn = h("button", { type: "button", class: "lfx-plus-season", "aria-haspopup": "menu" }, [label, ico]);
      btn.addEventListener("click", () => {
        openPopover(btn, {
          label: "Staffel w\xE4hlen",
          align: "start",
          className: "lfx-plus-season-menu",
          items: c.seasons.map((x) => ({
            key: x.Id,
            label: x.Name || "Staffel",
            className: x.Id === c.seasonId ? "is-active" : "",
            onClick: () => {
              closePopover();
              if (x.Id === c.seasonId) return;
              c.seasonId = x.Id;
              c.selectedEp = null;
              paintSeasonBar();
              showSeason2();
            }
          }))
        });
      });
      seasonBar.append(btn);
    }
    const tasks = [];
    if (isSeries) {
      tasks.push(loadSeasons(main.Id).then(async (list) => {
        if (stale()) return;
        c.seasons = list;
        c.seasonId = pickInitialSeason(list, c.seasonId);
        paintSeasonBar();
        if (sel.episodeId) select("eps");
        await showSeason2();
      }).catch(() => {
      }));
      tasks.push(loadNextUp(main.Id).then((ep) => {
        if (stale()) return;
        c.nextUp = ep;
        paintPlay2();
      }).catch(() => {
      }));
    }
    const fillCards = (items, emptyText) => {
      if (stale()) return;
      if (!items.length) {
        listBody.replaceChildren(h("p", { class: "lfx-plus-empty" }, emptyText));
        return;
      }
      listBody.replaceChildren(...items.map((it) => gridCard(it)));
    };
    if (isBox) tasks.push(loadCollection(main.Id).then((l) => fillCards(l, "Diese Sammlung ist leer.")).catch(() => fillCards([], "Titel konnten nicht geladen werden.")));
    else tasks.push(loadSimilar(main.Id).then((l) => fillCards(l.filter((i) => i.Id !== main.Id), "Keine Empfehlungen verf\xFCgbar.")).catch(() => fillCards([], "Keine Empfehlungen verf\xFCgbar.")));
    (async () => {
      let src;
      try {
        const t = await loadLocalTrailer(main);
        src = t ? trailerUrl(t.Id) : directRemoteTrailerUrl(main);
      } catch {
        src = directRemoteTrailerUrl(main);
      }
      if (stale() || !src) return;
      c.trailerSrc = src;
      trailerBtn.hidden = false;
    })();
    Promise.resolve(canDownload(main)).then((ok) => {
      if (!stale() && ok) dlBtn.hidden = false;
    }, () => {
    });
    s.cleanups.push(onItemsChanged(({ removed = [], updated = [] } = {}) => {
      if (stale()) return;
      if (removed.includes(main.Id) || removed.includes(s.id)) {
        location.hash = "#/home";
      } else if (updated.includes(main.Id)) {
        begin(s.id, { keepScroll: true });
      }
    }));
    await Promise.all(tasks);
  }
  function begin(id, { keepScroll = false } = {}) {
    dispose();
    const g = gen;
    state9 = { g, id, root: null, cleanups: [], cancelWait: null };
    const s = state9;
    s.cancelWait = whenHomeTab((tab2) => {
      if (state9 !== s) return;
      const root4 = h("div", { id: ROOT_ID8, class: "lfx-plus-page lfx-plus-title is-loading", "aria-busy": "true" }, [
        h("div", { class: "lfx-plus-title__skeleton" })
      ]);
      s.root = root4;
      tab2.prepend(root4);
      setPageOn(ON_CLASS6, true);
      if (!keepScroll) scrollTop();
      load2(g).then(() => {
        if (state9 === s) root4.removeAttribute("aria-busy");
      }).catch((e) => console.error("[LenzFlix] plus-title", e));
    });
  }
  var title_default = {
    name: "plus-title",
    match: (route) => isTheme("plus") && isModern() && !isTv() && isReady() && routeId(route) != null,
    mount(route) {
      const id = routeId(route);
      if (id) begin(id);
    },
    update(route) {
      const id = routeId(route);
      if (!id) return;
      if (state9 && state9.id === id && state9.root && state9.root.isConnected) return;
      begin(id);
    },
    unmount: dispose
  };

  // src/js/features/plus/browse.js
  var ROOT_ID9 = "lfx-plus-browse";
  var ON_CLASS7 = "lfx-plus-browse-on";
  var PAGE = 40;
  var state10 = null;
  var routeOf = (route) => {
    const r = parseLfxRoute(route);
    return r.kind === "browse" && r.lib ? { lib: r.lib, genre: r.genre } : null;
  };
  var asItems5 = (res) => Array.isArray(res) ? res : res && Array.isArray(res.Items) ? res.Items : [];
  function dispose2() {
    const s = state10;
    state10 = null;
    if (s) {
      if (s.cancelWait) s.cancelWait();
      for (const fn of s.cleanups.splice(0)) {
        try {
          fn && fn();
        } catch (e) {
          console.error("[LenzFlix] plus-browse cleanup", e);
        }
      }
      if (s.root) s.root.remove();
    }
    document.getElementById(ROOT_ID9)?.remove();
    setPageOn(ON_CLASS7, false);
  }
  function paintChips(s) {
    for (const chip of s.chips.querySelectorAll(".lfx-plus-chip")) {
      const on = (chip.dataset.genre || "") === (s.genreId || "");
      chip.classList.toggle("is-active", on);
      if (on) chip.setAttribute("aria-current", "true");
      else chip.removeAttribute("aria-current");
    }
  }
  function reload(s) {
    s.seq += 1;
    s.items = [];
    s.total = null;
    s.done = false;
    s.loading = false;
    s.grid.replaceChildren();
    s.status.replaceChildren();
    paintChips(s);
    loadMore(s);
  }
  async function loadMore(s) {
    if (state10 !== s || s.loading || s.done) return;
    const seq3 = s.seq;
    s.loading = true;
    s.root.setAttribute("aria-busy", "true");
    const stale = () => state10 !== s || s.seq !== seq3;
    try {
      const res = await getItems({
        ...BASE_PARAMS,
        ParentId: s.libId,
        IncludeItemTypes: s.types,
        Recursive: true,
        SortBy: "SortName",
        SortOrder: "Ascending",
        GenreIds: s.genreId || void 0,
        StartIndex: s.items.length,
        Limit: PAGE
      });
      if (stale()) return;
      const items = asItems5(res);
      putItems(items);
      s.total = res && typeof res.TotalRecordCount === "number" ? res.TotalRecordCount : null;
      s.items.push(...items);
      if (s.info === null) {
        s.info = await getNewContentInfo().catch(() => false);
        if (stale()) return;
      }
      for (const it of items) s.grid.append(gridCard(it, { badge: s.info ? plusBadge(it, s.info) : null }));
      s.done = items.length < PAGE || s.total != null && s.items.length >= s.total;
      if (!s.items.length) s.status.replaceChildren(h("p", { class: "lfx-plus-empty" }, "Keine Titel gefunden."));
    } catch (e) {
      if (stale()) return;
      console.warn("[LenzFlix] plus-browse konnte nicht laden", e && e.message);
      s.done = true;
      s.status.replaceChildren(
        h("p", { class: "lfx-plus-empty" }, "Titel konnten nicht geladen werden."),
        h("button", { type: "button", class: "lfx-plus-pill", onclick: () => {
          s.done = false;
          s.status.replaceChildren();
          loadMore(s);
        } }, "Erneut versuchen")
      );
    } finally {
      if (!stale()) {
        s.loading = false;
        s.root.removeAttribute("aria-busy");
      }
    }
  }
  async function build4(tab2, s) {
    const stale = () => state10 !== s;
    let lib = null;
    try {
      lib = (await getLibraries()).find((l) => l.id === s.libId) || null;
    } catch {
    }
    if (stale()) return;
    s.types = hubTypes(lib).items;
    const title = h("h1", { class: "lfx-plus-browse__title" }, lib ? lib.name : "Bibliothek");
    const chips = h("nav", { class: "lfx-plus-chips", "aria-label": "Genres" });
    const grid = h("div", { class: "lfx-plus-grid lfx-plus-grid--cards", role: "list" });
    const status = h("div", { class: "lfx-plus-browse__status" });
    const sentinel = h("div", { class: "lfx-plus-browse__sentinel", "aria-hidden": "true" });
    const root4 = h("div", { id: ROOT_ID9, class: "lfx-plus-page lfx-plus-browse" }, [title, chips, grid, status, sentinel]);
    Object.assign(s, { root: root4, chips, grid, status });
    tab2.prepend(root4);
    setPageOn(ON_CLASS7, true);
    scrollTop();
    const addChip = (label, genreId) => {
      chips.append(h("a", {
        class: "lfx-plus-chip",
        href: browseHref(s.libId, genreId),
        dataset: { genre: genreId || "" }
      }, label));
    };
    addChip("Alle", null);
    if (typeof IntersectionObserver === "function") {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore(s);
      }, { rootMargin: "800px 0px" });
      io.observe(sentinel);
      s.cleanups.push(() => io.disconnect());
    } else {
      const onScroll6 = () => {
        const r = sentinel.getBoundingClientRect();
        if (r.top < (window.innerHeight || 800) + 800) loadMore(s);
      };
      window.addEventListener("scroll", onScroll6, { passive: true });
      s.cleanups.push(() => window.removeEventListener("scroll", onScroll6));
    }
    reload(s);
    try {
      const genres = asItems5(await getJson("/Genres", {
        userId: getUserId(),
        ParentId: s.libId,
        IncludeItemTypes: s.types,
        Recursive: true,
        SortBy: "SortName"
      })).filter((g) => g && g.Id && g.Name);
      if (stale()) return;
      for (const g of genres) addChip(g.Name, g.Id);
      paintChips(s);
    } catch {
    }
  }
  function begin2(r) {
    dispose2();
    const s = {
      libId: r.lib,
      genreId: r.genre || null,
      seq: 0,
      items: [],
      total: null,
      done: false,
      loading: false,
      info: null,
      cleanups: [],
      cancelWait: null,
      root: null
    };
    state10 = s;
    s.cancelWait = whenHomeTab((tab2) => {
      if (state10 === s) build4(tab2, s);
    });
  }
  var browse_default = {
    name: "plus-browse",
    match: (route) => isTheme("plus") && isModern() && !isTv() && isReady() && routeOf(route) != null,
    mount(route) {
      const r = routeOf(route);
      if (r) begin2(r);
    },
    update(route) {
      const r = routeOf(route);
      if (!r) return;
      if (!state10 || state10.libId !== r.lib || !state10.root || !state10.root.isConnected) {
        begin2(r);
        return;
      }
      if ((r.genre || null) !== state10.genreId) {
        state10.genreId = r.genre || null;
        reload(state10);
      }
    },
    unmount: dispose2
  };

  // src/js/shared/search.js
  var asItems6 = (res) => Array.isArray(res) ? res : res && Array.isArray(res.Items) ? res.Items : [];
  var MIN_LEN = 2;
  async function searchItems(q, { limit = 40, signal } = {}) {
    const out = { movies: [], series: [], episodes: [], people: [] };
    const term = String(q == null ? "" : q).trim();
    if (term.length < MIN_LEN) return out;
    const userId = getUserId();
    const get = (path, params) => getJson(path, { userId, ...params }, { signal }).then(asItems6);
    const soft = (e) => {
      if (e && e.name === "AbortError") throw e;
      return [];
    };
    const [titles, episodes, people] = await Promise.all([
      get("/Items", { ...BASE_PARAMS, searchTerm: term, IncludeItemTypes: "Movie,Series", Recursive: true, Limit: limit }),
      get("/Items", { ...BASE_PARAMS, searchTerm: term, IncludeItemTypes: "Episode", Recursive: true, Limit: 12 }).catch(soft),
      get("/Persons", { searchTerm: term, Limit: 8, Fields: "PrimaryImageAspectRatio", ImageTypeLimit: 1 }).catch(soft)
    ]);
    out.movies = titles.filter((i) => i.Type === "Movie");
    out.series = titles.filter((i) => i.Type === "Series");
    out.episodes = episodes;
    out.people = people;
    return out;
  }
  async function tileFor(genre, parentId) {
    const own = genre.ImageTags && (genre.ImageTags.Thumb ? "Thumb" : genre.ImageTags.Primary ? "Primary" : null);
    if (own) return imageUrlFor(genre.Id, { type: own, tag: genre.ImageTags[own], maxWidth: 640 });
    const top = asItems6(await getItems({
      ParentId: parentId || void 0,
      GenreIds: genre.Id,
      IncludeItemTypes: "Movie,Series",
      Recursive: true,
      SortBy: "CommunityRating",
      SortOrder: "Descending",
      Limit: 5,
      Fields: "BackdropImageTags",
      ImageTypeLimit: 1,
      EnableImageTypes: "Backdrop",
      EnableUserData: false
    }));
    const hit = top.find((i) => i.BackdropImageTags && i.BackdropImageTags.length);
    return hit ? imageUrlFor(hit.Id, { type: "Backdrop", tag: hit.BackdropImageTags[0], maxWidth: 640 }) : null;
  }
  async function getGenreTiles({ parentId, limit = 12 } = {}) {
    const res = await getJson("/Genres", {
      userId: getUserId(),
      ParentId: parentId || void 0,
      IncludeItemTypes: "Movie,Series",
      Recursive: true,
      SortBy: "SortName",
      Fields: "PrimaryImageAspectRatio"
    });
    const genres = asItems6(res).filter((g) => g && g.Id && g.Name).slice(0, limit);
    return Promise.all(genres.map(async (g) => {
      let imageUrl2;
      try {
        imageUrl2 = await cached(`genretile:${parentId || ""}:${g.Id}`, () => tileFor(g, parentId), 10 * 60 * 1e3);
      } catch {
        imageUrl2 = null;
      }
      return { id: g.Id, name: g.Name, imageUrl: imageUrl2 };
    }));
  }

  // src/js/features/plus/search.js
  var ROOT_ID10 = "lfx-plus-search";
  var ON_CLASS8 = "lfx-plus-search-on";
  var DEBOUNCE_MS = 300;
  var MIN_LEN2 = 2;
  var LUPE = '<svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="13.5" cy="13.5" r="8.5"/><path d="M20 20l8 8"/></svg>';
  var X = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z"/></svg>';
  var state11 = null;
  var routeQ = (route) => {
    const r = parseLfxRoute(route);
    return r.kind === "search" ? r.q || "" : null;
  };
  function dispose3() {
    const s = state11;
    state11 = null;
    if (s) {
      if (s.cancelWait) s.cancelWait();
      clearTimeout(s.timer);
      if (s.abort) s.abort.abort();
      for (const fn of s.cleanups.splice(0)) {
        try {
          fn && fn();
        } catch (e) {
          console.error("[LenzFlix] plus-search cleanup", e);
        }
      }
      if (s.root) s.root.remove();
    }
    document.getElementById(ROOT_ID10)?.remove();
    setPageOn(ON_CLASS8, false);
  }
  function tile(href, label, imageUrl2, { nameOnImage = true } = {}) {
    const hide = !!imageUrl2 && !nameOnImage;
    return h("a", { class: "lfx-plus-tile", href, "aria-label": label, title: label }, [
      imageUrl2 ? h("img", { class: "lfx-plus-tile__img", src: imageUrl2, alt: "", loading: "lazy", decoding: "async" }) : null,
      h("span", { class: `lfx-plus-tile__name${imageUrl2 ? hide ? " is-sr" : " has-img" : ""}` }, label)
    ]);
  }
  function section(title, body, mod = "") {
    return h("section", { class: `lfx-plus-section ${mod}`.trim() }, [h("h2", { class: "lfx-plus-section__title" }, title), body]);
  }
  async function genreLib() {
    try {
      const libs = await getLibraries();
      return libs.find((l) => l.collectionType === "movies") || libs.find((l) => l.collectionType === "tvshows") || libs.find((l) => l.hubCapable) || null;
    } catch {
      return null;
    }
  }
  async function renderEmpty(s, seq3) {
    const stale = () => state11 !== s || s.seq !== seq3;
    s.results.replaceChildren();
    const [lib, genres, colls] = await Promise.all([
      genreLib(),
      getGenreTiles({ limit: 16 }).catch(() => []),
      getCollections().catch(() => [])
    ]);
    if (stale()) return;
    const parts = [];
    if (genres.length) {
      parts.push(section("Genres", h("div", { class: "lfx-plus-tilerow" }, genres.map((g) => tile(
        lib ? browseHref(lib.id, g.id) : searchHref(g.name),
        g.name,
        g.imageUrl
      )))));
    }
    if (colls.length) {
      parts.push(section("Sammlungen", h("div", { class: "lfx-plus-tilerow" }, colls.map((c) => tile(titleHref(c.id), c.name, c.imageUrl, { nameOnImage: false })))));
    }
    s.results.replaceChildren(...parts);
  }
  function personCard(p) {
    const url = imageUrl(p, { type: "Primary", maxWidth: 240, quality: 85 });
    return h("a", { class: "lfx-plus-person", href: `#/details?id=${encodeURIComponent(p.Id)}` }, [
      h("span", { class: "lfx-plus-person__img" }, url ? [h("img", { src: url, alt: "", loading: "lazy", decoding: "async" })] : []),
      h("span", { class: "lfx-plus-person__name" }, p.Name || "")
    ]);
  }
  async function runSearch(s, term) {
    if (s.abort) s.abort.abort();
    const seq3 = ++s.seq;
    s.term = term;
    s.syncUi();
    if (term.length < MIN_LEN2) {
      s.abort = null;
      s.root.removeAttribute("aria-busy");
      await renderEmpty(s, seq3);
      return;
    }
    const ctl = new AbortController();
    s.abort = ctl;
    s.root.setAttribute("aria-busy", "true");
    const stale = () => state11 !== s || s.seq !== seq3;
    try {
      const [res, info] = await Promise.all([
        searchItems(term, { signal: ctl.signal }),
        getNewContentInfo().catch(() => null)
      ]);
      if (stale()) return;
      const titles = [...res.movies, ...res.series];
      putItems([...titles, ...res.episodes]);
      const parts = [];
      if (titles.length) {
        parts.push(section("Filme und Serien", h(
          "div",
          { class: "lfx-plus-grid lfx-plus-grid--cards", role: "list" },
          titles.map((it) => gridCard(it, { text: true, badge: info ? plusBadge(it, info) : null }))
        )));
      }
      if (res.episodes.length) {
        parts.push(section("Folgen", h(
          "div",
          { class: "lfx-plus-grid lfx-plus-grid--cards", role: "list" },
          res.episodes.map((it) => gridCard(it, { text: true }))
        ), "lfx-plus-section--small"));
      }
      if (res.people.length) {
        parts.push(section("Personen", h("div", { class: "lfx-plus-people" }, res.people.map(personCard)), "lfx-plus-section--small"));
      }
      if (!parts.length) parts.push(h("p", { class: "lfx-plus-empty" }, `Keine Ergebnisse f\xFCr \u201E${term}\u201C.`));
      s.results.replaceChildren(...parts);
      s.root.removeAttribute("aria-busy");
    } catch (e) {
      if (e && e.name === "AbortError") return;
      if (stale()) return;
      console.warn("[LenzFlix] plus-search fehlgeschlagen", e && e.message);
      s.results.replaceChildren(h("p", { class: "lfx-plus-empty" }, "Die Suche ist fehlgeschlagen."));
      s.root.removeAttribute("aria-busy");
    }
  }
  function build5(tab2, s, q) {
    const input = h("input", {
      type: "search",
      class: "lfx-plus-search__input",
      placeholder: "Titel, Charakter oder Genre suchen",
      "aria-label": "Suche",
      autocomplete: "off",
      spellcheck: "false",
      value: q
    });
    input.value = q;
    const icon5 = h("span", { class: "lfx-plus-search__icon", "aria-hidden": "true" });
    icon5.innerHTML = LUPE;
    const clear = h("button", { type: "button", class: "lfx-plus-search__clear", "aria-label": "Eingabe l\xF6schen", title: "L\xF6schen", hidden: !q }, []);
    clear.innerHTML = X;
    const results = h("div", { class: "lfx-plus-search__results", "aria-live": "polite" });
    const field = h("div", { class: "lfx-plus-search__field" }, [icon5, input, clear]);
    const root4 = h("div", { id: ROOT_ID10, class: "lfx-plus-page lfx-plus-search", role: "search" }, [field, results]);
    Object.assign(s, { root: root4, input, results });
    s.syncUi = () => {
      clear.hidden = !input.value;
    };
    tab2.prepend(root4);
    setPageOn(ON_CLASS8, true);
    const writeHash = (term) => {
      try {
        history.replaceState(history.state, "", searchHref(term));
      } catch {
      }
    };
    const onInput = () => {
      clearTimeout(s.timer);
      s.syncUi();
      s.timer = setTimeout(() => {
        const term = input.value.trim();
        writeHash(term);
        runSearch(s, term);
      }, DEBOUNCE_MS);
    };
    const onClear = () => {
      input.value = "";
      clearTimeout(s.timer);
      writeHash("");
      runSearch(s, "");
      input.focus();
    };
    const onKey3 = (e) => {
      if (e.key === "Enter") {
        clearTimeout(s.timer);
        const term = input.value.trim();
        writeHash(term);
        runSearch(s, term);
      }
    };
    input.addEventListener("input", onInput);
    input.addEventListener("keydown", onKey3);
    clear.addEventListener("click", onClear);
    s.cleanups.push(() => {
      input.removeEventListener("input", onInput);
      input.removeEventListener("keydown", onKey3);
      clear.removeEventListener("click", onClear);
    });
    try {
      input.focus({ preventScroll: true });
    } catch {
    }
    runSearch(s, q.trim());
  }
  function begin3(q) {
    dispose3();
    const s = { root: null, input: null, results: null, term: null, timer: null, abort: null, seq: 0, cleanups: [], cancelWait: null, syncUi: () => {
    } };
    state11 = s;
    s.cancelWait = whenHomeTab((tab2) => {
      if (state11 === s) build5(tab2, s, q);
    });
  }
  var search_default = {
    name: "plus-search",
    match: (route) => isTheme("plus") && isModern() && !isTv() && isReady() && routeQ(route) != null,
    mount(route) {
      begin3(routeQ(route) || "");
    },
    update(route) {
      const q = routeQ(route);
      if (q == null) return;
      if (!state11 || !state11.root || !state11.root.isConnected) {
        begin3(q);
        return;
      }
      if (q.trim() !== (state11.term || "")) {
        state11.input.value = q;
        clearTimeout(state11.timer);
        runSearch(state11, q.trim());
      }
      try {
        state11.input.focus({ preventScroll: true });
      } catch {
      }
    },
    unmount: dispose3
  };

  // src/js/features/plus/tabbar.js
  var ROOT_ID11 = "lfx-plus-tabbar";
  var ON_CLASS9 = "lfx-plus-tabbar-on";
  var KB_CLASS = "lfx-plus-kb";
  var HIDE_CLASS = "lfx-plus-tabbar-hide";
  var EXCLUDED8 = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video|dashboard|queue)/;
  var TEXT_INPUT = "input:not([type=button]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=range]), textarea, select";
  var TABS = [
    { key: "home", label: "Startseite", href: "#/home", icon: "home" },
    { key: "list", label: "Meine Liste", href: "#/home?tab=1", icon: "list" },
    { key: "search", label: "Suche", href: searchHref(), icon: "search" }
  ];
  function tabKey(route) {
    if (!route) return null;
    if (route.path === "/home") {
      const { kind: kind2 } = parseLfxRoute(route);
      if (kind2 === "search") return "search";
      if (kind2 === "new") return "profile";
      if (kind2 === "hub") return "home";
      if (kind2) return null;
      const tab2 = route.params.get("tab");
      if (tab2 === "1") return "list";
      return !tab2 || tab2 === "0" ? "home" : null;
    }
    if (/^\/(mypreferences|usermenu)/.test(route.path)) return "profile";
    return null;
  }
  var isVideoHash = (hash) => /^#!?[/]video(?:[/?]|$)/.test(String(hash || ""));
  function sheetEntries(libs, profile, { go: go2, close: close2 }) {
    const entries = [{ label: "Neu & beliebt", onClick: () => {
      close2();
      go2("#/home?lfx=new");
    } }];
    for (const l of Array.isArray(libs) ? libs : []) {
      const href = l.hubCapable ? hubHref(l.id) : l.href;
      if (href) entries.push({ label: l.name, onClick: () => {
        close2();
        go2(href);
      } });
    }
    for (const p of Array.isArray(profile) ? profile : []) {
      if (p.href) entries.push({ label: p.label, onClick: () => {
        close2();
        go2(p.href);
      }, stats: p.key === "stats" });
      else if (typeof p.onClick === "function") entries.push({ label: p.label, onClick: () => {
        close2();
        p.onClick();
      } });
    }
    return entries;
  }
  function go(href) {
    if (String(href).startsWith("#")) window.location.hash = href;
    else window.location.assign(href);
  }
  var state12 = { root: null, route: null, profileBtn: null, sheet: null, seq: 0, cleanups: [] };
  var iconEl = (name) => {
    const span2 = h("span", { class: "lfx-plus-tabbar__icon", "aria-hidden": "true" });
    span2.innerHTML = ICONS3[name];
    return span2;
  };
  function applyActive5() {
    if (!state12.root) return;
    const key = tabKey(state12.route);
    for (const el of state12.root.querySelectorAll("[data-key]")) {
      const on = el.dataset.key === key;
      el.classList.toggle("is-active", on);
      if (on) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
      if (el.dataset.key === "home") el.querySelector(".lfx-plus-tabbar__icon").innerHTML = ICONS3[on ? "homeFill" : "home"];
    }
  }
  function closeProfile() {
    state12.seq++;
    const c = state12.sheet;
    state12.sheet = null;
    if (c && isCurrent(c)) closeChooser();
  }
  async function openProfile() {
    if (state12.sheet && isCurrent(state12.sheet)) {
      closeProfile();
      return;
    }
    const seq3 = ++state12.seq;
    const anchor = state12.profileBtn;
    let libs = [];
    let profile = [];
    let user = { name: "" };
    try {
      libs = await getLibraries() || [];
    } catch {
    }
    try {
      profile = await profileEntries({ theme: "plus", returnFocus: anchor });
    } catch {
    }
    try {
      user = await getUserChip();
    } catch {
    }
    if (seq3 !== state12.seq || !state12.root) return;
    const c = openSheet(anchor, "Profil");
    state12.sheet = c;
    const entries = sheetEntries(libs, profile, { go, close: () => closeChooser() });
    renderSheet(c, user && user.name || "Profil", entries);
    const buttons = c.list ? c.list.querySelectorAll(".lfx-sheet__item") : [];
    entries.forEach((e, i) => {
      if (e.stats && buttons[i]) buttons[i].classList.add("is-stats");
    });
  }
  async function fillAvatar(seq3) {
    let user = { name: "", imageUrl: null };
    try {
      user = await getUserChip();
    } catch {
    }
    if (seq3 !== state12.seq || !state12.profileBtn) return;
    const avatar = state12.profileBtn.querySelector(".lfx-plus-tabbar__avatar");
    if (user.imageUrl) {
      avatar.style.backgroundImage = `url("${user.imageUrl}")`;
      avatar.textContent = "";
    } else {
      avatar.textContent = (user.name || "?").trim().charAt(0).toUpperCase();
    }
    if (user.name) state12.profileBtn.setAttribute("aria-label", `Profil: ${user.name}`);
  }
  var plusTabbar = {
    name: "plus-tabbar",
    match(route) {
      return isTheme("plus") && isModern() && !isTv() && isPhone() && isReady() && !EXCLUDED8.test(route.path);
    },
    mount(route) {
      const seq3 = ++state12.seq;
      state12.route = route;
      const root4 = mountPoint(ROOT_ID11, { tag: "nav", className: "lfx-plus-tabbar" });
      root4.textContent = "";
      root4.setAttribute("aria-label", "Hauptnavigation");
      for (const t of TABS) {
        root4.append(h("a", { class: "lfx-plus-tabbar__tab", href: t.href, "aria-label": t.label, dataset: { key: t.key } }, [iconEl(t.icon)]));
      }
      const profileBtn = h("button", {
        type: "button",
        class: "lfx-plus-tabbar__tab",
        "aria-label": "Profil",
        "aria-haspopup": "dialog",
        dataset: { key: "profile" }
      }, [h("span", { class: "lfx-plus-tabbar__avatar", "aria-hidden": "true" })]);
      profileBtn.addEventListener("click", openProfile);
      root4.append(profileBtn);
      state12.root = root4;
      state12.profileBtn = profileBtn;
      const cl2 = document.documentElement.classList;
      const onFocusIn = (e) => {
        if (e.target && e.target.matches && e.target.matches(TEXT_INPUT)) cl2.add(KB_CLASS);
      };
      const onFocusOut = () => cl2.remove(KB_CLASS);
      document.addEventListener("focusin", onFocusIn);
      document.addEventListener("focusout", onFocusOut);
      state12.cleanups.push(() => {
        document.removeEventListener("focusin", onFocusIn);
        document.removeEventListener("focusout", onFocusOut);
        cl2.remove(KB_CLASS);
      });
      const onHash2 = () => cl2.toggle(HIDE_CLASS, isVideoHash(window.location.hash));
      window.addEventListener("hashchange", onHash2);
      state12.cleanups.push(() => {
        window.removeEventListener("hashchange", onHash2);
        cl2.remove(HIDE_CLASS);
      });
      cl2.remove(HIDE_CLASS);
      cl2.add(ON_CLASS9);
      applyActive5();
      fillAvatar(seq3);
    },
    update(route) {
      const changed = !state12.route || state12.route.hash !== route.hash;
      state12.route = route;
      if (changed) closeProfile();
      applyActive5();
    },
    unmount() {
      closeProfile();
      for (const fn of state12.cleanups.splice(0)) fn();
      unmountPoint(ROOT_ID11);
      document.documentElement.classList.remove(ON_CLASS9);
      state12.root = null;
      state12.profileBtn = null;
    }
  };
  var tabbar_default = plusTabbar;

  // src/js/features/plus/nativedetail.js
  var URL_RE = /url\(\s*["']?([^"')]+)["']?\s*\)/;
  var bgUrl = (el) => {
    if (!el) return null;
    const css = el.style && el.style.backgroundImage || (typeof getComputedStyle === "function" ? getComputedStyle(el).backgroundImage : "");
    const m = URL_RE.exec(css || "");
    return m ? m[1] : null;
  };
  function setClass2(el, cls, on) {
    if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
  }
  function logoHidden(el) {
    if (typeof getComputedStyle !== "function") return false;
    return getComputedStyle(el).display === "none";
  }
  function createNativeDetail({ name, theme, nologoClass, nobdClass = null }) {
    const NOLOGO = nologoClass;
    const NOBD = nobdClass;
    const ALL = [NOLOGO, NOBD].filter(Boolean);
    const state16 = { page: null, obs: null, timer: 0, poll: 0, probes: /* @__PURE__ */ new Map(), tries: 0 };
    function probeLogo(url) {
      if (state16.probes.has(url) || typeof Image !== "function") return;
      state16.probes.set(url, "pending");
      const img = new Image();
      img.onload = () => state16.probes.set(url, "ok");
      img.onerror = () => {
        state16.probes.set(url, "bad");
        evaluate3();
      };
      img.src = url;
    }
    function evaluate3() {
      const page = state16.page;
      if (!page || !page.isConnected) return;
      const logoEl = page.querySelector(".detailLogo");
      const logoUrl = logoEl && !logoEl.classList.contains("hide") ? bgUrl(logoEl) : null;
      if (logoUrl) probeLogo(logoUrl);
      let noLogo = !logoUrl || state16.probes.get(logoUrl) === "bad";
      if (!noLogo) {
        const had = page.classList.contains(NOLOGO);
        if (had) page.classList.remove(NOLOGO);
        noLogo = logoHidden(logoEl);
        if (had) page.classList.add(NOLOGO);
      }
      setClass2(page, NOLOGO, noLogo);
      if (NOBD) {
        const bd = page.querySelector(".itemBackdrop");
        const own = bd && !bd.classList.contains("hide") && bgUrl(bd);
        const global = !!document.querySelector(".backdropContainer .displayingBackdropImage");
        const wide = typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1000px)").matches;
        setClass2(page, NOBD, !own && !(wide && global));
      }
    }
    function schedule2() {
      if (state16.timer) return;
      state16.timer = setTimeout(() => {
        state16.timer = 0;
        evaluate3();
      }, 60);
    }
    function clearPage() {
      if (state16.obs) state16.obs.disconnect();
      state16.obs = null;
      clearTimeout(state16.timer);
      clearTimeout(state16.poll);
      state16.timer = 0;
      state16.poll = 0;
      if (state16.page) {
        state16.page.classList.remove(...ALL);
        state16.page = null;
      }
      for (const p of document.querySelectorAll(ALL.map((c) => `.${c}`).join(", "))) p.classList.remove(...ALL);
      state16.probes.clear();
    }
    function attach2() {
      const page = document.querySelector("#itemDetailPage:not(.hide)");
      if (!page) {
        if (++state16.tries < 30) state16.poll = setTimeout(attach2, 200);
        return;
      }
      if (state16.page === page) return;
      if (state16.obs) state16.obs.disconnect();
      state16.page = page;
      state16.obs = new MutationObserver((records) => {
        if (records.every((r) => r.type === "attributes" && r.target === page)) return;
        schedule2();
      });
      state16.obs.observe(page, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style"] });
      evaluate3();
    }
    const feature = {
      name,
      match: (route) => isTheme(theme) && isModern() && !isTv() && isReady() && route.path === "/details",
      mount() {
        state16.tries = 0;
        attach2();
      },
      update() {
        state16.tries = 0;
        clearTimeout(state16.poll);
        state16.probes.clear();
        const page = document.querySelector("#itemDetailPage:not(.hide)");
        if (page && page !== state16.page) clearPage();
        attach2();
        evaluate3();
      },
      unmount: clearPage
    };
    return { feature, evaluate: evaluate3 };
  }
  var plus = createNativeDetail({
    name: "plus-nativedetail",
    theme: "plus",
    nologoClass: "lfx-plus-nologo",
    nobdClass: "lfx-plus-nobackdrop"
  });
  var evaluate2 = plus.evaluate;
  var nativedetail_default = plus.feature;

  // src/js/features/plus/favempty.js
  var ID6 = "lfx-plus-favempty";
  var EMPTY_TEXT = "Noch nichts auf deiner Liste. F\xFCge Titel \xFCber + hinzu.";
  var SETTLE_MS = 1500;
  var state13 = { tab: null, obs: null, timer: 0, poll: 0, tries: 0 };
  var isFavRoute = (route) => route && route.path === "/home" && route.params.get("tab") === "1" && !route.params.get("lfx");
  function findTab() {
    const tab2 = document.querySelector("#indexPage:not(.hide) #favoritesTab");
    return tab2 && tab2.isConnected ? tab2 : null;
  }
  var hasCards = (tab2) => !!tab2.querySelector(".card, .listItem");
  function check() {
    state13.timer = 0;
    const tab2 = state13.tab;
    if (!tab2 || !tab2.isConnected) return;
    const mine = document.getElementById(ID6);
    if (hasCards(tab2)) {
      if (mine) mine.remove();
    } else if (!mine) {
      tab2.prepend(h("p", { id: ID6, class: "lfx-plus-favempty" }, EMPTY_TEXT));
    }
  }
  function schedule(delay = SETTLE_MS) {
    clearTimeout(state13.timer);
    state13.timer = setTimeout(check, delay);
  }
  function teardown6() {
    if (state13.obs) state13.obs.disconnect();
    state13.obs = null;
    clearTimeout(state13.timer);
    clearTimeout(state13.poll);
    state13.timer = 0;
    state13.poll = 0;
    state13.tab = null;
    document.getElementById(ID6)?.remove();
  }
  function attach() {
    const tab2 = findTab();
    if (!tab2) {
      if (++state13.tries < 30) state13.poll = setTimeout(attach, 200);
      return;
    }
    if (state13.tab === tab2) return;
    teardown6();
    state13.tab = tab2;
    state13.obs = new MutationObserver((records) => {
      if (records.every((r) => [...r.addedNodes, ...r.removedNodes].every((n) => n.id === ID6))) return;
      schedule();
    });
    state13.obs.observe(tab2, { childList: true, subtree: true });
    schedule();
  }
  var favempty_default = {
    name: "plus-favempty",
    match: (route) => isTheme("plus") && isModern() && !isTv() && isReady() && isFavRoute(route),
    mount() {
      state13.tries = 0;
      attach();
    },
    update() {
      state13.tries = 0;
      attach();
    },
    unmount: teardown6
  };

  // src/js/features/plus/index.js
  var plusFeatures = [header_default, mobilehead_default, switcher_default, home_default2, title_default, browse_default, search_default, tabbar_default, nativedetail_default, favempty_default];

  // src/js/features/prime/search.js
  var ID7 = "lfx-prime-search";
  var DEBOUNCE_MS2 = 300;
  var MAX_CARDS = 8;
  var MAX_CARDS_MOBILE = 18;
  var MAX_SUGGESTIONS = 5;
  var MIN_LEN3 = 2;
  var SVG_NS = "http://www.w3.org/2000/svg";
  var FOCUSABLE2 = "a[href], button:not([disabled]), input:not([disabled])";
  var cur = null;
  function searchIcon() {
    const svg9 = document.createElementNS(SVG_NS, "svg");
    svg9.setAttribute("viewBox", "0 0 24 24");
    svg9.setAttribute("aria-hidden", "true");
    svg9.setAttribute("class", "lfx-prime-search__icon");
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", "M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.3 4.3-1.4 1.4-4.3-4.3A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z");
    svg9.append(p);
    return svg9;
  }
  function formatRuntime3(ticks) {
    const min = Math.round((Number(ticks) || 0) / 6e8);
    if (!min) return "";
    return min >= 60 ? `${Math.floor(min / 60)} Std. ${min % 60} Min.` : `${min} Min.`;
  }
  function metaOf(item) {
    const parts = [];
    if (item.ProductionYear) parts.push(String(item.ProductionYear));
    if (item.Type === "Movie") {
      const rt = formatRuntime3(item.RunTimeTicks);
      if (rt) parts.push(rt);
    } else if (item.Type === "Series") {
      parts.push("Serie");
    }
    return parts.join(" \xB7 ");
  }
  function card2(item, close2, mobile = false) {
    const url = mobile && imageUrl(item, { type: "Primary", maxWidth: 300, quality: 85 }) || landscapeImage(item, { maxWidth: 400 });
    const a = h("a", {
      class: "lfx-prime-search__card",
      href: titleHref(item.Id),
      dataset: { id: item.Id }
    }, [
      h("span", { class: "lfx-prime-search__thumb" }, url ? h("img", { src: url, alt: "", loading: "lazy", decoding: "async" }) : null),
      h("span", { class: "lfx-prime-search__title" }, item.Name || ""),
      mobile ? null : h("span", { class: "lfx-prime-search__meta" }, metaOf(item))
    ]);
    a.addEventListener("click", () => close2());
    return a;
  }
  function isPrimeSearchOpen() {
    return cur !== null;
  }
  function closePrimeSearch({ restoreFocus = true } = {}) {
    const c = cur;
    if (!c) return;
    cur = null;
    clearTimeout(c.timer);
    if (c.ctrl) c.ctrl.abort();
    document.removeEventListener("keydown", c.onKeydown, true);
    window.removeEventListener("hashchange", c.onHash);
    unmountPoint(c.root);
    document.documentElement.classList.remove("lfx-prime-search-open");
    const back = c.returnFocus;
    if (restoreFocus && back && back.isConnected && typeof back.focus === "function") {
      try {
        back.focus({ preventScroll: true });
      } catch {
      }
    }
  }
  function openPrimeSearch({ returnFocus } = {}) {
    if (cur) {
      cur.input.focus();
      return;
    }
    const prev = returnFocus || (document.activeElement && document.activeElement !== document.body ? document.activeElement : null);
    const mobile = isMobile();
    const root4 = mountPoint(ID7, { className: `lfx-prime-search${mobile ? " lfx-prime-search--full" : ""}` });
    root4.setAttribute("role", "dialog");
    root4.setAttribute("aria-modal", "true");
    root4.setAttribute("aria-label", "Suche");
    const input = h("input", {
      class: "lfx-prime-search__input",
      type: "search",
      placeholder: "Suchen",
      autocomplete: "off",
      spellcheck: "false",
      "aria-label": "Suchen"
    });
    const clear = h("button", { type: "button", class: "lfx-prime-search__clear", hidden: true }, "L\xF6schen");
    const cancel = mobile ? h("button", { type: "button", class: "lfx-prime-search__cancel" }, "Abbrechen") : null;
    const form = h("form", { class: "lfx-prime-search__form", role: "search" }, [searchIcon(), input, clear]);
    const head = mobile ? h("div", { class: "lfx-prime-search__head" }, [form, cancel]) : form;
    const suggest = h("ul", { class: "lfx-prime-search__suggest", "aria-label": "Vorschl\xE4ge" });
    const grid = h("div", { class: "lfx-prime-search__grid" });
    const status = h("p", { class: "lfx-prime-search__status", role: "status" });
    const panel = h("div", { class: "lfx-prime-search__panel" }, [head, suggest, status, grid]);
    root4.replaceChildren(panel);
    const c = { root: root4, input, panel, timer: null, ctrl: null, returnFocus: prev, seq: 0 };
    cur = c;
    const close2 = () => closePrimeSearch();
    const reset = () => {
      suggest.replaceChildren();
      grid.replaceChildren();
      status.textContent = "";
    };
    const run = async (term) => {
      if (c.ctrl) c.ctrl.abort();
      const seq3 = ++c.seq;
      if (term.length < MIN_LEN3) {
        c.ctrl = null;
        reset();
        return;
      }
      const ctrl = new AbortController();
      c.ctrl = ctrl;
      try {
        const res = await searchItems(term, { limit: 24, signal: ctrl.signal });
        if (cur !== c || seq3 !== c.seq || ctrl.signal.aborted) return;
        const items = [...res.movies, ...res.series];
        suggest.replaceChildren(...items.slice(0, MAX_SUGGESTIONS).map((it) => {
          const a = h("a", { class: "lfx-prime-search__sug", href: titleHref(it.Id) }, it.Name || "");
          a.addEventListener("click", close2);
          return h("li", null, a);
        }));
        grid.replaceChildren(...items.slice(0, mobile ? MAX_CARDS_MOBILE : MAX_CARDS).map((it) => card2(it, close2, mobile)));
        status.textContent = items.length ? "" : `Keine Treffer f\xFCr \u201E${term}\u201C.`;
      } catch (e) {
        if (e && e.name === "AbortError") return;
        if (cur !== c || seq3 !== c.seq) return;
        reset();
        status.textContent = "Die Suche ist fehlgeschlagen.";
      }
    };
    input.addEventListener("input", () => {
      clear.hidden = input.value === "";
      clearTimeout(c.timer);
      c.timer = setTimeout(() => run(input.value.trim()), DEBOUNCE_MS2);
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      clearTimeout(c.timer);
      run(input.value.trim());
    });
    clear.addEventListener("click", () => {
      input.value = "";
      clear.hidden = true;
      clearTimeout(c.timer);
      run("");
      input.focus();
    });
    if (cancel) cancel.addEventListener("click", () => close2());
    root4.addEventListener("mousedown", (e) => {
      if (!panel.contains(e.target)) close2();
    });
    c.onKeydown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        close2();
      } else if (e.key === "Tab") {
        const list = [...panel.querySelectorAll(FOCUSABLE2)].filter((el) => !el.hidden);
        if (!list.length) return;
        const first2 = list[0];
        const last = list[list.length - 1];
        const active4 = document.activeElement;
        if (!panel.contains(active4)) {
          e.preventDefault();
          first2.focus();
        } else if (e.shiftKey && active4 === first2) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active4 === last) {
          e.preventDefault();
          first2.focus();
        }
      }
    };
    c.onHash = () => closePrimeSearch({ restoreFocus: false });
    document.addEventListener("keydown", c.onKeydown, true);
    window.addEventListener("hashchange", c.onHash);
    document.documentElement.classList.add("lfx-prime-search-open");
    input.focus({ preventScroll: true });
  }

  // src/js/features/prime/header-menus.js
  var LEAVE_MS2 = 180;
  var ITEM = ".lfx-prime-flyout__item";
  function column(title, entries) {
    return h("section", { class: "lfx-prime-flyout__col" }, [
      h("h3", { class: "lfx-prime-flyout__head" }, title),
      entries.length ? h("div", { class: "lfx-prime-flyout__list" }, entries.map((e) => h("a", {
        class: "lfx-prime-flyout__item",
        href: e.href,
        role: "menuitem",
        dataset: { key: e.key }
      }, e.label))) : h("p", { class: "lfx-prime-flyout__empty" }, "Nichts vorhanden")
    ]);
  }
  function openMenus({ wrap, button, flyout, load: load4 }) {
    let opened = false;
    let loaded = false;
    let leaveTimer2 = null;
    let pinned = false;
    let gen3 = 0;
    const items = () => [...flyout.querySelectorAll(ITEM)];
    async function ensureLoaded() {
      if (loaded) return;
      loaded = true;
      const mine = ++gen3;
      let data;
      try {
        data = await load4();
      } catch {
        data = { libraries: [], collections: [] };
      }
      if (mine !== gen3) return;
      flyout.replaceChildren(
        column("Bibliotheken", data.libraries),
        h("span", { class: "lfx-prime-flyout__sep", "aria-hidden": "true" }),
        column("Empfohlene Sammlungen", data.collections)
      );
    }
    function open2({ focus = false } = {}) {
      clearTimeout(leaveTimer2);
      if (!opened) {
        opened = true;
        flyout.hidden = false;
        wrap.classList.add("is-open");
        button.setAttribute("aria-expanded", "true");
      }
      const p = ensureLoaded();
      if (focus) p.then(() => {
        if (opened) {
          const f = items()[0];
          if (f) f.focus();
        }
      });
    }
    function close2({ restoreFocus = false } = {}) {
      clearTimeout(leaveTimer2);
      if (!opened) return;
      opened = false;
      pinned = false;
      flyout.hidden = true;
      wrap.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
      if (restoreFocus) button.focus();
    }
    const onEnter = () => open2();
    const onLeave = () => {
      clearTimeout(leaveTimer2);
      if (pinned) return;
      leaveTimer2 = setTimeout(() => close2(), LEAVE_MS2);
    };
    const onClick = (e) => {
      if (e.detail === 0) {
        if (opened) close2();
        else open2({ focus: true });
      } else if (opened && !pinned) {
        pinned = true;
      } else if (opened) close2();
      else {
        open2();
        pinned = true;
      }
    };
    const onFlyoutClick = (e) => {
      if (e.target.closest && e.target.closest(ITEM)) close2();
    };
    const onKeydown2 = (e) => {
      if (!opened) {
        if (e.key === "ArrowDown" && e.target === button) {
          e.preventDefault();
          open2({ focus: true });
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close2({ restoreFocus: true });
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
        const list = items();
        if (!list.length) return;
        const i = list.indexOf(document.activeElement);
        let next;
        if (e.key === "Home") next = 0;
        else if (e.key === "End") next = list.length - 1;
        else if (e.key === "ArrowDown") next = i < 0 ? 0 : (i + 1) % list.length;
        else next = i < 0 ? list.length - 1 : (i - 1 + list.length) % list.length;
        e.preventDefault();
        list[next].focus();
      }
    };
    const onFocusOut = (e) => {
      if (opened && e.relatedTarget && !wrap.contains(e.relatedTarget)) close2();
    };
    const onDocClick2 = (e) => {
      if (opened && !wrap.contains(e.target)) close2();
    };
    wrap.addEventListener("mouseenter", onEnter);
    wrap.addEventListener("mouseleave", onLeave);
    button.addEventListener("click", onClick);
    flyout.addEventListener("click", onFlyoutClick);
    wrap.addEventListener("keydown", onKeydown2);
    wrap.addEventListener("focusout", onFocusOut);
    document.addEventListener("click", onDocClick2, true);
    return {
      open: open2,
      close: close2,
      isOpen: () => opened,
      destroy() {
        gen3++;
        close2();
        document.removeEventListener("click", onDocClick2, true);
        wrap.removeEventListener("mouseenter", onEnter);
        wrap.removeEventListener("mouseleave", onLeave);
        wrap.removeEventListener("keydown", onKeydown2);
        wrap.removeEventListener("focusout", onFocusOut);
      }
    };
  }

  // src/js/features/prime/profile-sheet.js
  var ID8 = "lfx-prime-profilesheet";
  var OPEN_CLASS2 = "lfx-prime-profilesheet-open";
  var FOCUSABLE3 = "a[href], button:not([disabled])";
  var cur2 = null;
  function closeProfileSheet({ restoreFocus = true } = {}) {
    const c = cur2;
    if (!c) return;
    cur2 = null;
    if (c.detachSwipe) c.detachSwipe();
    window.removeEventListener("keydown", c.onKeydown, true);
    window.removeEventListener("hashchange", c.onHash);
    unmountPoint(c.root);
    document.documentElement.classList.remove(OPEN_CLASS2);
    const back = c.returnFocus;
    if (restoreFocus && back && back.isConnected && typeof back.focus === "function") {
      try {
        back.focus({ preventScroll: true });
      } catch {
      }
    }
  }
  function entryNode(it, close2) {
    const kids = [h("span", { class: "lfx-prime-psheet__label" }, it.label)];
    const cls = `lfx-prime-psheet__item${it.className ? ` ${it.className}` : ""}`;
    const node = it.href ? h("a", { class: cls, href: it.href, dataset: { key: it.key || "" } }, kids) : h("button", { type: "button", class: cls, dataset: { key: it.key || "" } }, kids);
    node.addEventListener("click", () => {
      close2({ restoreFocus: false });
      if (typeof it.onClick === "function") it.onClick();
    });
    return node;
  }
  function section2(title, nodes) {
    return h("section", { class: "lfx-prime-psheet__section" }, [
      title ? h("h3", { class: "lfx-prime-psheet__head" }, title) : null,
      ...nodes
    ]);
  }
  function openProfileSheet({ returnFocus } = {}) {
    closeProfileSheet({ restoreFocus: false });
    const root4 = mountPoint(ID8, { className: "lfx-prime-psheet-overlay" });
    const who = h("div", { class: "lfx-prime-psheet__who" });
    const body = h("div", { class: "lfx-prime-psheet__body" });
    const sheet = h("div", { class: "lfx-prime-psheet", role: "dialog", "aria-modal": "true", "aria-label": "Profil", tabindex: "-1" }, [
      h("span", { class: "lfx-prime-psheet__grip", "aria-hidden": "true" }),
      who,
      body
    ]);
    root4.replaceChildren(sheet);
    const c = { root: root4, sheet, returnFocus: returnFocus || null };
    cur2 = c;
    const close2 = (opts) => {
      if (cur2 === c) closeProfileSheet(opts);
    };
    c.onKeydown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        close2();
      } else if (e.key === "Tab") {
        const list = [...sheet.querySelectorAll(FOCUSABLE3)];
        if (!list.length) {
          e.preventDefault();
          return;
        }
        const first2 = list[0];
        const last = list[list.length - 1];
        const active4 = document.activeElement;
        if (!sheet.contains(active4)) {
          e.preventDefault();
          first2.focus();
        } else if (e.shiftKey && active4 === first2) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active4 === last) {
          e.preventDefault();
          first2.focus();
        }
      }
    };
    c.onHash = () => close2({ restoreFocus: false });
    root4.addEventListener("click", (e) => {
      if (e.target === root4) close2();
    });
    window.addEventListener("keydown", c.onKeydown, true);
    window.addEventListener("hashchange", c.onHash);
    if (typeof attachSwipeClose === "function") {
      c.detachSwipe = attachSwipeClose(sheet, { onClose: () => close2(), backdrop: root4 });
    }
    document.documentElement.classList.add(OPEN_CLASS2);
    sheet.focus({ preventScroll: true });
    const mine = c;
    (async () => {
      const [chip, libs, entries] = await Promise.all([
        getUserChip().catch(() => ({ name: "", imageUrl: null })),
        getLibraries().catch(() => []),
        profileEntries({ theme: "prime", returnFocus }).catch(() => [])
      ]);
      if (cur2 !== mine) return;
      const initial = (chip.name || "?").trim().charAt(0).toUpperCase() || "?";
      who.replaceChildren(
        h("span", { class: "lfx-prime-psheet__avatar", "aria-hidden": "true" }, chip.imageUrl ? h("img", { src: chip.imageUrl, alt: "", draggable: "false" }) : h("span", null, initial)),
        h("span", { class: "lfx-prime-psheet__name" }, chip.name || "Profil")
      );
      const nav = [{ key: "new", label: "Neu & beliebt", href: "#/home?lfx=new" }];
      const libNodes = (libs || []).map((l) => ({ key: `lib:${l.id}`, label: l.name, href: l.hubCapable ? hubHref(l.id) : l.href }));
      body.replaceChildren(...[
        section2(null, nav.map((it) => entryNode(it, close2))),
        libNodes.length ? section2("Bibliotheken", libNodes.map((it) => entryNode(it, close2))) : null,
        section2(null, entries.filter((it) => it && !it.hidden).map((it) => entryNode(it, close2)))
      ].filter(Boolean));
      const first2 = body.querySelector(FOCUSABLE3);
      if (first2 && document.activeElement === sheet) first2.focus({ preventScroll: true });
    })();
    return { close: close2 };
  }

  // src/js/features/prime/header.js
  var ID9 = "lfx-prime-header";
  var HTML_CLASS = "lfx-prime-header-on";
  var MOBILE_CLASS = "lfx-prime-mobile";
  var PILLS_CLASS = "lfx-prime-header-pills";
  var EXCLUDED9 = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video|dashboard|queue)/;
  var SCROLL_THRESHOLD2 = 10;
  var LIST_HREF = "#/home?tab=1";
  var SVG_NS2 = "http://www.w3.org/2000/svg";
  var ICONS4 = {
    search: "M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.3 4.3-1.4 1.4-4.3-4.3A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z",
    grid: "M5 4h3v3H5V4Zm5.5 0h3v3h-3V4ZM16 4h3v3h-3V4ZM5 10.5h3v3H5v-3Zm5.5 0h3v3h-3v-3Zm5.5 0h3v3h-3v-3ZM5 17h3v3H5v-3Zm5.5 0h3v3h-3v-3Zm5.5 0h3v3h-3v-3Z",
    back: "M15.5 4.5 8 12l7.5 7.5-1.6 1.6L4.8 12l9.1-9.1z",
    bookmark: "M6 3h12a1 1 0 0 1 1 1v17l-7-4.6L5 21V4a1 1 0 0 1 1-1Zm1 2v12.2l5-3.3 5 3.3V5H7Z"
  };
  function icon3(name) {
    const svg9 = document.createElementNS(SVG_NS2, "svg");
    svg9.setAttribute("viewBox", "0 0 24 24");
    svg9.setAttribute("aria-hidden", "true");
    svg9.setAttribute("focusable", "false");
    const p = document.createElementNS(SVG_NS2, "path");
    p.setAttribute("d", ICONS4[name]);
    svg9.append(p);
    return svg9;
  }
  function navItems3(libs) {
    const list = Array.isArray(libs) ? libs : [];
    const items = [{ key: "home", label: "Startseite", href: "#/home" }];
    const movies = list.find((l) => l.collectionType === "movies");
    const series = list.find((l) => l.collectionType === "tvshows");
    if (movies) items.push({ key: `lib:${movies.id}`, label: "Filme", href: hubHref(movies.id) });
    if (series) items.push({ key: `lib:${series.id}`, label: "Serien", href: hubHref(series.id) });
    items.push({ key: "new", label: "Neu & beliebt", href: "#/home?lfx=new" });
    return items;
  }
  function activeKey3(route) {
    if (!route || route.path !== "/home") return null;
    const p = route.params;
    const lfx = p.get("lfx");
    if (lfx === "new") return "new";
    if (lfx === "hub" && p.get("lib")) return `lib:${p.get("lib")}`;
    if (lfx) return null;
    return p.get("tab") === "1" ? "list" : "home";
  }
  function mobileKind(route) {
    if (!route || route.path !== "/home") return "sub";
    const lfx = route.params.get("lfx");
    if (route.params.get("tab") === "1") return "sub";
    return !lfx || lfx === "hub" ? "home" : "sub";
  }
  var NATIVE_TITLES = {
    "/mypreferencesmenu": "Einstellungen",
    "/mypreferencesdisplay": "Anzeige",
    "/mypreferenceshome": "Startseite",
    "/mypreferencesplayback": "Wiedergabe",
    "/mypreferencessubtitles": "Untertitel",
    "/mypreferencescontrols": "Steuerung",
    "/mypreferencesquickconnect": "Quick Connect",
    "/userprofile": "Profil",
    "/search": "Suche",
    "/queue": "Warteschlange"
  };
  function domText(selector, attr) {
    const el = document.querySelector(selector);
    if (!el) return "";
    return String((attr ? el.getAttribute(attr) : el.textContent) || "").trim();
  }
  function mobileTitle(route, libs = []) {
    if (!route) return "";
    const p = route.params;
    if (route.path === "/home") {
      const lfx = p.get("lfx");
      if (p.get("tab") === "1") return "Meine Liste";
      if (lfx === "new") return "Neu & beliebt";
      if (lfx === "search") return "Suche";
      if (lfx === "title") return domText(".lfx-pt__title") || domText(".lfx-pt__logo", "alt");
      if (lfx === "browse") {
        const lib2 = libs.find((l) => l.id === p.get("lib"));
        return lib2 ? lib2.name || "" : "";
      }
      return "";
    }
    if (NATIVE_TITLES[route.path]) return NATIVE_TITLES[route.path];
    const libId = p.get("topParentId") || p.get("parentId");
    const lib = libId ? libs.find((l) => l.id === libId) : null;
    if (lib) return lib.name || "";
    if (route.path === "/details" || route.path === "/item") return domText(".page:not(.hide) .nameContainer h1");
    return "";
  }
  function goBack() {
    if (window.history.length > 1) window.history.back();
    else window.location.hash = "#/home";
  }
  var state14 = {
    mobile: false,
    kind: null,
    el: null,
    route: null,
    libs: [],
    cleanups: [],
    menus: null,
    seq: 0,
    raf: 0,
    profileBusy: false,
    titleTimer: 0
  };
  function refreshTitle() {
    if (!state14.el || !state14.mobile || !state14.route) return;
    const t = state14.el.querySelector(".lfx-prime-header__title");
    if (!t) return;
    const next = mobileTitle(state14.route, state14.libs);
    if (t.textContent !== next) t.textContent = next;
  }
  function stopTitlePoll() {
    if (state14.titleTimer) clearInterval(state14.titleTimer);
    state14.titleTimer = 0;
  }
  function startTitlePoll() {
    stopTitlePoll();
    if (!state14.mobile || state14.kind !== "sub") return;
    let n = 0;
    state14.titleTimer = setInterval(() => {
      refreshTitle();
      n += 1;
      if (n >= 24 || !state14.el) stopTitlePoll();
    }, 250);
  }
  function applyActive6() {
    if (!state14.el || !state14.route) return;
    const key = activeKey3(state14.route);
    for (const el of state14.el.querySelectorAll("[data-key]")) {
      const on = el.dataset.key === key;
      el.classList.toggle("is-active", on);
      if (on) el.setAttribute("aria-current", "page");
      else el.removeAttribute("aria-current");
    }
  }
  function renderNav2() {
    const nav = state14.el && state14.el.querySelector(".lfx-prime-header__nav");
    if (!nav) return;
    nav.replaceChildren(...navItems3(state14.libs).map((it) => h("a", {
      class: "lfx-prime-header__link",
      href: it.href,
      dataset: { key: it.key }
    }, it.label)));
    applyActive6();
  }
  function profileIsOpen() {
    const el = document.getElementById("lfx-popover");
    return isPopoverOpen() && Boolean(el && el.classList.contains("lfx-prime-profile"));
  }
  function closeProfile2() {
    if (profileIsOpen()) closePopover();
  }
  async function toggleProfile(btn) {
    if (profileIsOpen()) {
      closePopover({ restoreFocus: true });
      return;
    }
    if (state14.profileBusy) return;
    state14.profileBusy = true;
    try {
      state14.menus.close();
      const items = await profileEntries({ theme: "prime", returnFocus: btn });
      if (!state14.el || !btn.isConnected) return;
      openPopover(btn, { label: "Profil", items, align: "end", className: "lfx-prime-profile" });
    } finally {
      state14.profileBusy = false;
    }
  }
  function build6() {
    const logo = h("a", { class: "lfx-prime-header__logo", href: "#/home", "aria-label": "LENZPRIME \u2013 Startseite" });
    const nav = h("nav", { class: "lfx-prime-header__nav", "aria-label": "Hauptnavigation" });
    const searchBtn = h("button", {
      type: "button",
      class: "lfx-prime-header__icon",
      "aria-label": "Suche",
      "aria-haspopup": "dialog"
    }, [icon3("search")]);
    searchBtn.addEventListener("click", () => {
      state14.menus.close();
      closeProfile2();
      if (isPrimeSearchOpen()) closePrimeSearch();
      else openPrimeSearch({ returnFocus: searchBtn });
    });
    const gridBtn = h("button", {
      type: "button",
      class: "lfx-prime-header__icon",
      "aria-label": "Bibliotheken und Sammlungen",
      "aria-haspopup": "true",
      "aria-expanded": "false",
      "aria-controls": "lfx-prime-grid"
    }, [icon3("grid")]);
    const flyout = h("div", { class: "lfx-prime-flyout", id: "lfx-prime-grid", role: "menu", hidden: true, "aria-label": "Bibliotheken und Sammlungen" });
    const gridWrap = h("div", { class: "lfx-prime-header__flyout-wrap" }, [gridBtn, flyout]);
    const listLink = h("a", {
      class: "lfx-prime-header__icon",
      href: LIST_HREF,
      "aria-label": "Meine Liste",
      dataset: { key: "list" }
    }, [icon3("bookmark")]);
    const avatar = h("button", {
      type: "button",
      class: "lfx-prime-header__avatar",
      "aria-label": "Profil",
      "aria-haspopup": "true"
    });
    avatar.addEventListener("click", () => toggleProfile(avatar));
    const right = h("div", { class: "lfx-prime-header__right" }, [searchBtn, gridWrap, listLink, avatar]);
    const bar = h("div", { class: "lfx-prime-header__bar" }, [logo, nav, right]);
    state14.el.replaceChildren(bar);
    state14.menus = openMenus({ wrap: gridWrap, button: gridBtn, flyout, load: loadFlyoutData });
    return { avatar };
  }
  function buildMobile(route) {
    const kind2 = mobileKind(route);
    state14.kind = kind2;
    const avatar = h("button", {
      type: "button",
      class: "lfx-prime-header__avatar",
      "aria-label": "Profil",
      "aria-haspopup": "dialog"
    });
    avatar.addEventListener("click", () => {
      closePrimeSearch({ restoreFocus: false });
      openProfileSheet({ returnFocus: avatar });
    });
    let left;
    if (kind2 === "home") {
      left = [h("a", { class: "lfx-prime-header__logo", href: "#/home", "aria-label": "LENZPRIME \u2013 Startseite" })];
    } else {
      const back = h("button", { type: "button", class: "lfx-prime-header__back", "aria-label": "Zur\xFCck" });
      back.append(icon3("back"));
      back.addEventListener("click", goBack);
      left = [back, h("h1", { class: "lfx-prime-header__title" }, mobileTitle(route, state14.libs))];
    }
    const bar = h("div", { class: "lfx-prime-header__bar" }, [...left, h("div", { class: "lfx-prime-header__right" }, [avatar])]);
    const kids = [bar];
    if (kind2 === "home") kids.push(h("nav", { class: "lfx-prime-header__pills", "aria-label": "Filme und Serien" }));
    state14.el.replaceChildren(...kids);
    return { avatar };
  }
  function renderPills() {
    const nav = state14.el && state14.el.querySelector(".lfx-prime-header__pills");
    if (!nav) return;
    const items = navItems3(state14.libs).filter((it) => it.key.startsWith("lib:"));
    nav.replaceChildren(...items.map((it) => h("a", {
      class: "lfx-prime-header__pill",
      href: it.href,
      dataset: { key: it.key }
    }, it.label)));
    nav.hidden = !items.length;
    applyActive6();
  }
  async function loadFlyoutData() {
    let libs = state14.libs;
    let cols;
    try {
      cols = await getCollections();
    } catch {
      cols = [];
    }
    if (!libs.length) {
      try {
        libs = await getLibraries();
      } catch {
        libs = [];
      }
    }
    return {
      libraries: libs.map((l) => ({ key: l.id, label: l.name, href: l.hubCapable ? hubHref(l.id) : l.href })),
      collections: cols.map((c) => ({ key: c.id, label: c.name, href: titleHref(c.id) }))
    };
  }
  async function loadLibs(seq3) {
    try {
      const libs = await getLibraries();
      if (seq3 !== state14.seq || !state14.el) return;
      state14.libs = libs;
    } catch {
      if (seq3 !== state14.seq || !state14.el) return;
      state14.libs = [];
    }
    renderNav2();
    renderPills();
    refreshTitle();
  }
  async function loadAvatar(seq3, avatar) {
    let chip = { name: "", imageUrl: null };
    try {
      chip = await getUserChip();
    } catch {
    }
    if (seq3 !== state14.seq || !state14.el) return;
    avatar.replaceChildren();
    if (chip.imageUrl) avatar.append(h("img", { src: chip.imageUrl, alt: "", draggable: "false" }));
    else avatar.append(h("span", { class: "lfx-prime-header__initial", "aria-hidden": "true" }, (chip.name || "?").trim().charAt(0).toUpperCase() || "?"));
    if (chip.name) avatar.setAttribute("aria-label", `Profil: ${chip.name}`);
  }
  function onScroll4() {
    if (state14.raf) return;
    state14.raf = requestAnimationFrame(() => {
      state14.raf = 0;
      applyScroll();
    });
  }
  function applyScroll() {
    if (!state14.el || state14.mobile) return;
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const on = y > SCROLL_THRESHOLD2;
    if (state14.el.classList.contains("is-scrolled") !== on) state14.el.classList.toggle("is-scrolled", on);
  }
  function syncHtmlClasses() {
    const cl2 = document.documentElement.classList;
    cl2.toggle(MOBILE_CLASS, state14.mobile);
    cl2.toggle(PILLS_CLASS, state14.mobile && state14.kind === "home");
  }
  function render8() {
    const seq3 = ++state14.seq;
    if (state14.menus) state14.menus.destroy();
    state14.menus = null;
    closeProfile2();
    closeProfileSheet({ restoreFocus: false });
    state14.mobile = isMobile();
    state14.kind = null;
    const parts = state14.mobile ? buildMobile(state14.route) : build6();
    state14.el.className = `lfx-prime-header${state14.mobile ? ` lfx-prime-header--mobile lfx-prime-header--${state14.kind}` : ""}`;
    syncHtmlClasses();
    applyScroll();
    renderNav2();
    renderPills();
    loadLibs(seq3);
    loadAvatar(seq3, parts.avatar);
    startTitlePoll();
  }
  var header_default2 = {
    name: "prime-header",
    match(route) {
      return isTheme("prime") && isModern() && !isTv() && isReady() && !EXCLUDED9.test(route.path);
    },
    mount(route) {
      state14.route = route;
      state14.el = mountPoint(ID9, { tag: "header", className: "lfx-prime-header" });
      document.documentElement.classList.add(HTML_CLASS);
      window.addEventListener("scroll", onScroll4, { passive: true });
      state14.cleanups.push(() => window.removeEventListener("scroll", onScroll4));
      render8();
    },
    update(route) {
      const changed = !state14.route || state14.route.hash !== route.hash;
      state14.route = route;
      if (!state14.el) return;
      const mobileNow = isMobile();
      if (mobileNow !== state14.mobile || mobileNow && mobileKind(route) !== state14.kind) {
        closePrimeSearch({ restoreFocus: false });
        render8();
        return;
      }
      if (changed && state14.menus) state14.menus.close();
      if (state14.mobile) {
        refreshTitle();
        if (changed) startTitlePoll();
      }
      applyActive6();
    },
    unmount() {
      state14.seq++;
      stopTitlePoll();
      for (const fn of state14.cleanups.splice(0)) fn();
      if (state14.raf) cancelAnimationFrame(state14.raf);
      state14.raf = 0;
      if (state14.menus) state14.menus.destroy();
      state14.menus = null;
      closeProfile2();
      closeProfileSheet({ restoreFocus: false });
      closePrimeSearch({ restoreFocus: false });
      unmountPoint(ID9);
      document.documentElement.classList.remove(HTML_CLASS, MOBILE_CLASS, PILLS_CLASS);
      state14.el = null;
      state14.libs = [];
      state14.mobile = false;
      state14.kind = null;
      state14.profileBusy = false;
    }
  };

  // src/js/features/prime/footer.js
  function buildMoreButton(onClick) {
    const btn = h("button", { type: "button", class: "lfx-prime-more" }, "Mehr");
    btn.addEventListener("click", () => onClick(btn));
    return btn;
  }
  function buildFooter() {
    const href = statsHref("prime");
    const picker = h("button", { type: "button", class: "lfx-prime-footer__link" }, "Design Einstellungen");
    picker.addEventListener("click", () => openThemePicker({ returnFocus: picker }));
    const links = [
      href ? h("a", { class: "lfx-prime-footer__link", href }, STATS_LABEL) : null,
      picker
    ];
    return h("footer", { class: "lfx-prime-footer" }, [
      h("span", { class: "lfx-prime-footer__mark", role: "img", "aria-label": "LENZPRIME" }),
      h("nav", { class: "lfx-prime-footer__links", "aria-label": "Fu\xDFzeile" }, links),
      h("p", { class: "lfx-prime-footer__note" }, "LENZPRIME f\xFCr Jellyfin")
    ]);
  }

  // src/js/shared/trend.js
  var norm = (id) => String(id || "").replace(/-/g, "").toLowerCase();
  async function getTrendInfo() {
    const rank = /* @__PURE__ */ new Map();
    let charts;
    try {
      charts = await getCharts();
    } catch {
      charts = null;
    }
    if (!charts) return { available: false, rank };
    const add2 = (list, type) => {
      (Array.isArray(list) ? list : []).forEach((e, i) => {
        const key = norm(e && e.id);
        if (key && !rank.has(key)) rank.set(key, { rank: i + 1, type });
      });
    };
    add2(charts.movies, "Movie");
    add2(charts.series, "Series");
    return { available: true, rank };
  }
  function entryFor(item, trend2) {
    if (!item || !trend2 || !trend2.available || !trend2.rank) return null;
    const id = item.Type === "Episode" ? item.SeriesId : item.Id;
    return trend2.rank.get(norm(id)) || null;
  }
  function trendBadge(item, trend2) {
    if (!item) return null;
    if (!trend2 || !trend2.available) {
      return (item.Type === "Movie" || item.Type === "Series") && Number(item.CommunityRating) >= 8 ? "AM BELIEBTESTEN" : null;
    }
    const e = entryFor(item, trend2);
    if (!e) return null;
    if (e.rank <= 3) return "AM BELIEBTESTEN";
    if (e.rank <= 10) return "IM TREND";
    return null;
  }
  function heroTrendLine(item, trend2) {
    const e = entryFor(item, trend2);
    return e && e.rank <= 10 ? `Platz ${e.rank} der Top 10` : null;
  }
  function cardBadge(item, { newInfo, trend: trend2 } = {}) {
    return newBadge(item, newInfo) || trendBadge(item, trend2);
  }

  // src/js/features/prime/hero-play.js
  async function seriesTarget(series) {
    let target = await loadNextUp(series.Id).catch(() => null);
    if (!target) {
      const seasons = await loadSeasons(series.Id).catch(() => []);
      const sid = pickInitialSeason(seasons, null);
      const eps = sid ? await loadEpisodes2(series.Id, sid).catch(() => []) : [];
      target = eps[0] || null;
    }
    return target;
  }
  async function playTitle(item) {
    if (!item || !item.Id) return false;
    let target = item;
    if (item.Type === "Series") target = await seriesTarget(item);
    if (!target) return false;
    return play(target, { resume: hasResume(target) });
  }
  function playLabel(item, next = null) {
    if (item && item.Type === "Series") {
      if (!next) return { line1: "Abspielen", line2: null, progress: 0 };
      const resume2 = hasResume(next);
      const started2 = resume2 || next.IndexNumber > 1 || next.ParentIndexNumber > 1;
      if (!started2) return { line1: "Abspielen", line2: null, progress: 0 };
      const n = next.IndexNumber != null ? `Folge ${next.IndexNumber}` : "N\xE4chste Folge";
      return { line1: n, line2: resume2 ? "Fortsetzen" : "weiter ansehen", progress: resume2 ? progressPercent(next) : 0 };
    }
    const resume = hasResume(item);
    return { line1: resume ? "Fortsetzen" : "Abspielen", line2: null, progress: resume ? progressPercent(item) : 0 };
  }

  // src/js/features/prime/preview-gate.js
  var HOLD_EVENT = "lfx-prime-preview-hold";
  var VISIBLE_RATIO = 0.2;
  function setPreviewHold(on) {
    document.dispatchEvent(new CustomEvent(HOLD_EVENT, { detail: { on: Boolean(on) } }));
  }
  function autoPause(video, { respectHold = false } = {}) {
    let visible = true;
    let held = false;
    let stopped = false;
    let io = null;
    const sync2 = () => {
      if (stopped || !video) return;
      const want = visible && !held && !document.hidden;
      try {
        if (want && video.paused) {
          const p = video.play && video.play();
          if (p && p.catch) p.catch(() => {
          });
        } else if (!want && !video.paused) {
          video.pause();
        }
      } catch {
      }
    };
    const onVis = () => sync2();
    const onHold = (e) => {
      held = Boolean(e.detail && e.detail.on);
      sync2();
    };
    if (typeof IntersectionObserver === "function") {
      io = new IntersectionObserver((entries) => {
        const e = entries[entries.length - 1];
        if (!e) return;
        visible = e.isIntersecting && e.intersectionRatio >= VISIBLE_RATIO;
        sync2();
      }, { threshold: [0, VISIBLE_RATIO, 1] });
      io.observe(video);
    }
    document.addEventListener("visibilitychange", onVis);
    if (respectHold) document.addEventListener(HOLD_EVENT, onHold);
    return {
      stop() {
        stopped = true;
        if (io) io.disconnect();
        io = null;
        document.removeEventListener("visibilitychange", onVis);
        document.removeEventListener(HOLD_EVENT, onHold);
      }
    };
  }

  // src/js/features/prime/hero.js
  var ROTATE_MS2 = 2e4;
  var TRAILER_DELAY_MS2 = 3e3;
  var IMG_FADE_MS2 = 1e3;
  var TEXT_FADE_MS2 = 350;
  var FIELDS3 = "Overview,Genres,OfficialRating,ProductionYear,RunTimeTicks,ChildCount,DateCreated,RemoteTrailers,LocalTrailerCount";
  var FIRST_KEY = "lfx-prime-hero-first";
  var NS2 = "http://www.w3.org/2000/svg";
  function svg7(html, cls) {
    const el = document.createElementNS(NS2, "svg");
    el.setAttribute("viewBox", "0 0 24 24");
    el.setAttribute("aria-hidden", "true");
    if (cls) el.setAttribute("class", cls);
    el.innerHTML = html;
    return el;
  }
  var ICON_PLAY4 = '<path fill="currentColor" d="M6 3.5v17a1 1 0 0 0 1.5.86l14-8.5a1 1 0 0 0 0-1.72l-14-8.5A1 1 0 0 0 6 3.5z"/>';
  var ICON_PLUS4 = '<path fill="currentColor" d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z"/>';
  var ICON_CHECK4 = '<path fill="currentColor" d="M9.2 16.6 4.9 12.3l-1.4 1.4 5.7 5.7L20.5 8.1l-1.4-1.4z"/>';
  var ICON_INFO = '<path fill="currentColor" d="M11 10h2v8h-2zM11 6h2v2h-2z"/>';
  var ICON_MUTED2 = '<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z"/>';
  var ICON_SOUND2 = '<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/>';
  var ICON_TREND = '<path fill="currentColor" d="M3 17.6 9.5 11l4 4L21 7.5V12h2V4h-8v2h4.6l-6.1 6.1-4-4L1.6 16.2z"/>';
  var ICON_CHEV = '<polyline points="8,3 17,12 8,21" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
  function svgIcon(html, cls) {
    return svg7(html, cls);
  }
  var reducedMotion2 = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function readFirst() {
    try {
      return sessionStorage.getItem(FIRST_KEY);
    } catch {
      return null;
    }
  }
  function writeFirst(id) {
    try {
      sessionStorage.setItem(FIRST_KEY, id);
    } catch {
    }
  }
  async function fetchHomePool() {
    const base = { Recursive: true, IncludeItemTypes: "Movie,Series", ImageTypes: "Logo,Backdrop", Fields: FIELDS3, EnableUserData: true, Limit: 40 };
    const [latest, random] = await Promise.all([
      getItems({ ...base, SortBy: "DateCreated", SortOrder: "Descending" }).catch(() => null),
      getItems({ ...base, SortBy: "Random" }).catch(() => null)
    ]);
    const pool = buildPool(latest && latest.Items, random && random.Items, { avoidFirstId: readFirst(), newCount: 3, randomCount: 7 });
    if (pool[0]) writeFirst(pool[0].Id);
    return pool;
  }
  function renderHero(slot, { loadPool }) {
    const mobile = isMobile();
    let newInfo = null;
    let logoBox = null;
    let disposed = false;
    let pool = [];
    let index = 0;
    let gen3 = 0;
    let hovering = false;
    let trailerActive = false;
    let rotateTimer = null;
    let preview = null;
    let gate = null;
    let video = null;
    let trend2 = null;
    let media = null;
    let content = null;
    let muteBtn = null;
    let dots = null;
    let hero = null;
    const timers = /* @__PURE__ */ new Set();
    const cleanupFns = [];
    const later = (fn, ms) => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
      return t;
    };
    const paused = () => hovering || trailerActive || document.hidden || document.documentElement.classList.contains("lfx-modal-open") || isMenuOpen() || isChooserOpen();
    function stopTrailer() {
      if (gate) {
        gate.stop();
        gate = null;
      }
      if (preview) {
        preview.cancel();
        preview = null;
      }
      video = null;
      trailerActive = false;
      if (muteBtn) muteBtn.hidden = true;
      if (hero) hero.classList.remove("is-trailer");
    }
    function scheduleRotate() {
      clearTimeout(rotateTimer);
      rotateTimer = null;
      if (disposed || pool.length < 2 || reducedMotion2()) return;
      rotateTimer = setTimeout(() => {
        rotateTimer = null;
        if (paused()) scheduleRotate();
        else show2((index + 1) % pool.length);
      }, ROTATE_MS2);
    }
    function setMuteIcon() {
      if (!video) return;
      muteBtn.replaceChildren(svg7(video.muted ? ICON_MUTED2 : ICON_SOUND2));
      muteBtn.setAttribute("aria-label", video.muted ? "Ton einschalten" : "Ton ausschalten");
    }
    function startTrailer(item, myGen) {
      if (mobile || reducedMotion2() || disposed || myGen !== gen3) return;
      preview = createMutedPreview(media, item, {
        delay: TRAILER_DELAY_MS2,
        startAt: 4,
        onStart: (v) => {
          if (disposed || myGen !== gen3) return;
          video = v;
          gate = autoPause(v, { respectHold: true });
          trailerActive = true;
          v.classList.add("is-in");
          hero.classList.add("is-trailer");
          muteBtn.hidden = false;
          setMuteIcon();
        },
        onEnd: () => {
          if (disposed || myGen !== gen3) return;
          preview = null;
          stopTrailer();
          scheduleRotate();
        }
      });
    }
    function playButton(item, myGen) {
      const label = h("span", { class: "lfx-prime-hero__label" });
      const btn = h("button", { type: "button", class: "lfx-prime-hero__play" }, [svg7(ICON_PLAY4), label]);
      const bar = h("span", { class: "lfx-prime-hero__bar" });
      const progress = h("span", { class: "lfx-prime-hero__progress", hidden: true }, [bar]);
      const paint = (state16) => {
        label.replaceChildren(...[
          h("span", { class: "lfx-prime-hero__label1" }, state16.line1),
          state16.line2 ? h("span", { class: "lfx-prime-hero__label2" }, state16.line2) : null
        ].filter(Boolean));
        btn.classList.toggle("is-two", Boolean(state16.line2));
        progress.hidden = !(state16.progress > 0);
        bar.style.width = `${Math.round(state16.progress)}%`;
      };
      paint(playLabel(item));
      if (item.Type === "Series") {
        loadNextUp(item.Id).then((ep) => {
          if (disposed || myGen !== gen3 || !btn.isConnected) return;
          paint(playLabel(item, ep));
        }, () => {
        });
      }
      btn.addEventListener("click", () => {
        playTitle(item);
      });
      return h("div", { class: "lfx-prime-hero__playwrap" }, [btn, progress]);
    }
    function listButton(item) {
      const btn = h("button", { type: "button", class: "lfx-prime-hero__round lfx-prime-hero__round--list", title: "Meine Liste" });
      const paint = () => {
        const on = Boolean(item.UserData && item.UserData.IsFavorite);
        btn.replaceChildren(svg7(on ? ICON_CHECK4 : ICON_PLUS4));
        btn.classList.toggle("is-on", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.setAttribute("aria-label", on ? "Aus Meine Liste entfernen" : "Zu Meine Liste hinzuf\xFCgen");
      };
      paint();
      btn.addEventListener("click", async () => {
        await toggleFavorite2(item);
        if (btn.isConnected) paint();
      });
      return btn;
    }
    function buildContent(item, myGen) {
      const logo = logoImage(item, { maxWidth: 720 });
      const rank = heroTrendLine(item, trend2);
      const info = h("a", {
        class: "lfx-prime-hero__round lfx-prime-hero__round--info",
        href: titleHref(item.Id),
        "aria-label": "Weitere Informationen",
        title: "Weitere Informationen"
      }, [svg7(ICON_INFO)]);
      const fsk = formatRating(item.OfficialRating);
      return h("div", null, [
        h("div", { class: "lfx-prime-hero__text" }, [
          logo ? h("img", { class: "lfx-prime-hero__logo", src: logo, alt: item.Name || "", decoding: "async" }) : h("h2", { class: "lfx-prime-hero__title" }, item.Name || ""),
          rank ? h("div", { class: "lfx-prime-hero__rank" }, [svg7(ICON_TREND), h("span", null, rank)]) : null,
          h("div", { class: "lfx-prime-hero__actions" }, [playButton(item, myGen), listButton(item), info])
        ]),
        fsk ? h("span", { class: "lfx-prime-chip lfx-prime-hero__fsk" }, fsk) : null
      ]);
    }
    function buildMobileParts(item, myGen) {
      const logo = logoImage(item, { maxWidth: 480 });
      const title = logo ? h("img", { class: "lfx-prime-hero__logo", src: logo, alt: item.Name || "", decoding: "async" }) : h("h2", { class: "lfx-prime-hero__title" }, item.Name || "");
      const badge3 = cardBadge(item, { newInfo, trend: trend2 });
      const fsk = formatRating(item.OfficialRating);
      const extra = item.Type === "Series" ? formatSeasons(item.ChildCount) : formatRuntime2(item.RunTimeTicks);
      const text = [extra, item.ProductionYear ? String(item.ProductionYear) : "", item.Genres && item.Genres[0]].filter(Boolean).join("  ");
      const rank = heroTrendLine(item, trend2);
      const info = h("div", { class: "lfx-prime-hero__below" }, [
        h("div", { class: "lfx-prime-hero__meta" }, [
          badge3 ? h("span", { class: "lfx-prime-badge lfx-prime-badge--inline" }, badge3) : null,
          fsk ? h("span", { class: "lfx-prime-chip lfx-prime-hero__fsk" }, fsk) : null,
          text ? h("span", { class: "lfx-prime-hero__metatext" }, text) : null
        ]),
        rank ? h("div", { class: "lfx-prime-hero__rank" }, [svg7(ICON_TREND), h("span", null, rank)]) : null,
        h("div", { class: "lfx-prime-hero__actions" }, [playButton(item, myGen)])
      ]);
      return { title, info };
    }
    function buildImage(item) {
      const bd = imageUrl(item, { type: "Backdrop", maxWidth: 1920, quality: 90 });
      return h("img", { class: "lfx-prime-hero__img", src: bd, alt: "", decoding: "async" });
    }
    function updateDots() {
      if (!dots) return;
      [...dots.children].forEach((b, i) => {
        b.classList.toggle("is-active", i === index);
        b.setAttribute("aria-current", i === index ? "true" : "false");
      });
    }
    function fillDots() {
      dots.replaceChildren(...pool.map((it, i) => {
        const b = h("button", { type: "button", class: "lfx-prime-hero__dot", "aria-label": `Empfehlung ${i + 1}: ${it.Name || ""}` });
        b.addEventListener("click", () => show2(i));
        return b;
      }));
      dots.hidden = pool.length < 2;
      updateDots();
    }
    function show2(i, immediate = false) {
      if (disposed || !pool[i]) return;
      const item = pool[i];
      index = i;
      gen3 += 1;
      const myGen = gen3;
      stopTrailer();
      updateDots();
      const pic = buildImage(item);
      const olds = [...media.querySelectorAll(".lfx-prime-hero__img")];
      media.append(pic);
      if (immediate || !olds.length) {
        olds.forEach((o) => o.remove());
        pic.classList.add("is-in");
      } else {
        requestAnimationFrame(() => pic.classList.add("is-in"));
        later(() => olds.forEach((o) => o.remove()), IMG_FADE_MS2 + 50);
      }
      const swap = () => {
        if (disposed || myGen !== gen3) return;
        if (mobile) {
          const parts = buildMobileParts(item, myGen);
          logoBox.replaceChildren(parts.title);
          content.replaceChildren(parts.info);
        } else {
          content.replaceChildren(...buildContent(item, myGen).childNodes);
        }
        content.classList.remove("is-out");
      };
      if (immediate || !content.firstChild) swap();
      else {
        content.classList.add("is-out");
        later(swap, TEXT_FADE_MS2);
      }
      putItems([item]);
      scheduleRotate();
      startTrailer(item, myGen);
    }
    function step(dir) {
      if (pool.length > 1) show2((index + dir + pool.length) % pool.length);
    }
    function onChanged2({ removed = [] }) {
      if (disposed || !hero || !removed.length || !pool.some((it) => removed.includes(it.Id))) return;
      const cur3 = pool[index];
      const curGone = cur3 && removed.includes(cur3.Id);
      pool = pool.filter((it) => !removed.includes(it.Id));
      if (!pool.length) {
        gen3 += 1;
        stopTrailer();
        clearTimeout(rotateTimer);
        slot.hidden = true;
        return;
      }
      index = curGone ? Math.min(index, pool.length - 1) : pool.indexOf(cur3);
      fillDots();
      if (curGone) show2(index);
    }
    function buildMobile2() {
      logoBox = h("div", { class: "lfx-prime-hero__mlogo" });
      fillDots();
      const frame = h("div", { class: "lfx-prime-hero__frame" }, [
        media,
        h("div", { class: "lfx-prime-hero__shade", "aria-hidden": "true" }),
        logoBox
      ]);
      hero = h("div", { class: "lfx-prime-hero lfx-prime-hero--mobile" }, [frame, content, dots]);
      slot.replaceChildren(hero);
      slot.setAttribute("aria-roledescription", "Karussell");
      let sx = 0;
      let sy = 0;
      frame.addEventListener("touchstart", (e) => {
        const t = e.touches && e.touches[0];
        if (t) {
          sx = t.clientX;
          sy = t.clientY;
        }
      }, { passive: true });
      frame.addEventListener("touchend", (e) => {
        const t = e.changedTouches && e.changedTouches[0];
        if (!t) return;
        const dx = t.clientX - sx;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(t.clientY - sy) * 1.5) step(dx < 0 ? 1 : -1);
      }, { passive: true });
      const onVis = () => {
        if (!document.hidden) scheduleRotate();
      };
      document.addEventListener("visibilitychange", onVis);
      cleanupFns.push(() => document.removeEventListener("visibilitychange", onVis));
      cleanupFns.push(onItemsChanged(onChanged2));
    }
    function build8() {
      media = h("div", { class: "lfx-prime-hero__media" });
      content = h("div", { class: "lfx-prime-hero__live", "aria-live": "off" });
      muteBtn = h("button", { type: "button", class: "lfx-prime-hero__mute", hidden: true, "aria-label": "Ton einschalten" });
      muteBtn.addEventListener("click", () => {
        if (!video) return;
        video.muted = !video.muted;
        setMuteIcon();
      });
      dots = h("div", { class: "lfx-prime-hero__dots", role: "group", "aria-label": "Empfehlung w\xE4hlen" });
      if (mobile) {
        buildMobile2();
        return;
      }
      const prev = h("button", { type: "button", class: "lfx-prime-hero__arrow lfx-prime-hero__arrow--prev", "aria-label": "Vorherige Empfehlung" });
      const next = h("button", { type: "button", class: "lfx-prime-hero__arrow lfx-prime-hero__arrow--next", "aria-label": "N\xE4chste Empfehlung" });
      prev.append(svg7(ICON_CHEV));
      next.append(svg7(ICON_CHEV));
      prev.addEventListener("click", () => step(-1));
      next.addEventListener("click", () => step(1));
      fillDots();
      hero = h("div", { class: "lfx-prime-hero" }, [
        media,
        h("div", { class: "lfx-prime-hero__shade", "aria-hidden": "true" }),
        h("div", { class: "lfx-prime-hero__shade lfx-prime-hero__shade--corner", "aria-hidden": "true" }),
        prev,
        next,
        muteBtn,
        content,
        dots
      ]);
      slot.replaceChildren(hero);
      slot.setAttribute("aria-roledescription", "Karussell");
      const onEnter = () => {
        hovering = true;
      };
      const onLeave = () => {
        hovering = false;
        scheduleRotate();
      };
      const onVis = () => {
        if (!document.hidden) scheduleRotate();
      };
      hero.addEventListener("mouseenter", onEnter);
      hero.addEventListener("mouseleave", onLeave);
      document.addEventListener("visibilitychange", onVis);
      cleanupFns.push(() => document.removeEventListener("visibilitychange", onVis));
      cleanupFns.push(onItemsChanged(onChanged2));
    }
    async function init2() {
      let items = [];
      try {
        items = await loadPool();
      } catch {
      }
      try {
        trend2 = await getTrendInfo();
      } catch {
        trend2 = null;
      }
      if (mobile) {
        try {
          newInfo = await getNewContentInfo();
        } catch {
          newInfo = null;
        }
      }
      if (disposed) return;
      if (!items || !items.length) {
        slot.classList.remove("is-loading");
        slot.hidden = true;
        return;
      }
      pool = items;
      putItems(pool);
      build8();
      slot.hidden = false;
      slot.classList.remove("is-loading");
      show2(0, true);
    }
    slot.hidden = false;
    slot.classList.add("is-loading");
    init2();
    return () => {
      disposed = true;
      gen3 += 1;
      clearTimeout(rotateTimer);
      timers.forEach(clearTimeout);
      timers.clear();
      stopTrailer();
      cleanupFns.splice(0).forEach((f) => f());
      slot.replaceChildren();
      slot.classList.remove("is-loading");
      slot.removeAttribute("aria-roledescription");
    };
  }

  // src/js/features/prime/home-route.js
  var ROOT_ID12 = "lfx-prime-home";
  var ON_CLASS10 = "lfx-prime-home-on";
  function primeHomeRoute(route) {
    if (!route || route.path !== "/home" || !route.params) return null;
    const lfx = route.params.get("lfx");
    if (lfx === "hub") {
      const lib = route.params.get("lib");
      return lib ? { key: `hub:${lib}`, kind: "hub", lib } : null;
    }
    if (lfx || route.params.get("tab") === "1") return null;
    return { key: "home", kind: "home", lib: null };
  }
  function findHomeTab5() {
    const tab2 = document.querySelector("#indexPage:not(.hide) #homeTab");
    return tab2 && tab2.isConnected ? tab2 : null;
  }

  // src/js/features/prime/card.js
  var TICKS_PER_MIN4 = 6e8;
  var DOTS = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="5" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="19" r="2" fill="currentColor"/></svg>';
  function remainingText3(item) {
    const ud = item && item.UserData;
    if (!ud || !(ud.PlaybackPositionTicks > 0) || !(item.RunTimeTicks > 0)) return "";
    const left = Math.round((item.RunTimeTicks - ud.PlaybackPositionTicks) / TICKS_PER_MIN4);
    if (left <= 0) return "";
    return left >= 60 ? `Noch ${Math.floor(left / 60)} Std. ${left % 60} Min.` : `Noch ${left} Min.`;
  }
  var displayTitle3 = (item) => item.Type === "Episode" && item.SeriesName ? item.SeriesName : item.Name || "";
  var ariaLabel2 = (item) => item.Type === "Episode" && item.SeriesName ? `${item.SeriesName} \u2013 ${item.Name || ""}`.trim() : item.Name || "";
  function createPrimeCard(item, { kind: kind2 = "landscape", badge: badge3 = null, rank = 0 } = {}) {
    const poster = kind2 === "poster";
    const wide = landscapeFor(item);
    const pUrl = poster ? posterUrl(item, 400) : null;
    const src = poster ? pUrl || wide && wide.url : wide ? wide.url : posterUrl(item, 400);
    const titled = !poster && (!wide || !wide.isThumb);
    const children = [];
    if (src) children.push(h("img", { class: "lfx-card__img", src, alt: "", loading: "lazy", decoding: "async" }));
    if (titled) {
      const logo = logoImage(item, { maxWidth: 400 });
      children.push(logo ? h("img", { class: "lfx-card__logo", src: logo, alt: "", loading: "lazy", decoding: "async" }) : h("span", { class: "lfx-card__title" }, displayTitle3(item)));
    }
    const classes = ["lfx-card", "lfx-prime-card", poster ? "lfx-prime-card--poster" : "lfx-prime-card--wide"];
    if (kind2 === "top10") classes.push("lfx-prime-card--ranked");
    const card3 = h("div", {
      class: classes.join(" "),
      dataset: { lfxId: item.Id, lfxType: item.Type || "" },
      tabindex: "-1",
      role: "listitem"
    });
    if (kind2 === "top10" && rank) {
      card3.append(h("span", { class: `lfx-prime-card__rank${rank >= 10 ? " lfx-prime-card__rank--wide" : ""}`, "aria-hidden": "true" }, String(rank)));
    }
    if (badge3) children.push(h("span", { class: "lfx-prime-badge" }, badge3));
    children.push(h("span", { class: "lfx-prime-card__mark", "aria-hidden": "true" }));
    if (kind2 === "resume") {
      const p = progressPercent2(item);
      if (p > 0) {
        children.push(h("div", { class: "lfx-prime-card__progress" }, [
          h("div", { class: "lfx-prime-card__bar", style: { width: `${Math.round(p * 10) / 10}%` } })
        ]));
      }
    }
    card3.append(h("a", {
      class: `lfx-card__link${titled ? " lfx-card__link--titled" : ""}`,
      href: detailHref2(item),
      "aria-label": ariaLabel2(item)
    }, children));
    if (kind2 === "resume") card3.append(resumeFoot(item));
    return card3;
  }
  function resumeFoot(item) {
    const menu = h("button", { type: "button", class: "lfx-prime-card__menu", "aria-label": `Weitere Optionen: ${ariaLabel2(item)}`, "aria-haspopup": "menu" });
    menu.innerHTML = DOTS;
    menu.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openTitleMenu(item, menu);
    });
    return h("div", { class: "lfx-prime-card__foot" }, [
      h("span", { class: "lfx-prime-card__remaining" }, remainingText3(item)),
      menu
    ]);
  }

  // src/js/features/prime/home-rows.js
  var CHEVRON3 = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><polyline points="8,3 17,12 8,21" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function arrow(dir, label) {
    const b = h("button", { type: "button", class: `lfx-prime-arrow lfx-prime-arrow--${dir}`, "aria-label": label, tabindex: "-1", hidden: true });
    b.innerHTML = CHEVRON3;
    return b;
  }
  function pickPosterId(defs, hub) {
    const list = defs || [];
    if (hub) {
      const d2 = list.find((x) => x.kind === "poster");
      return d2 ? d2.id : null;
    }
    for (const id of ["latest-movies", "toprated"]) if (list.some((d2) => d2.id === id)) return id;
    const d = list.find((x) => x.kind === "landscape" && !["nextup", "favorites"].includes(x.id));
    return d ? d.id : null;
  }
  function displayKind(def, posterId) {
    if (def.kind === "top10") return "top10";
    if (def.kind === "resume") return "resume";
    return def.id === posterId ? "poster" : "landscape";
  }
  function createRows(slot, { posterId = null, moreHref = () => null } = {}) {
    let disposed = false;
    let observer2 = null;
    let infoP = null;
    const disposers = [];
    const pending = /* @__PURE__ */ new Map();
    const rendered = /* @__PURE__ */ new Set();
    const info = () => {
      if (!infoP) {
        infoP = Promise.all([getNewContentInfo().catch(() => null), getTrendInfo().catch(() => null)]).then(([newInfo, trend2]) => ({ newInfo, trend: trend2 }));
      }
      return infoP;
    };
    disposers.push(onItemsChanged(({ removed }) => {
      if (disposed || !removed || !removed.length) return;
      const gone = new Set(removed);
      for (const row of [...slot.querySelectorAll(".lfx-prime-row")]) {
        const track = row.querySelector(".lfx-prime-row__track");
        if (!track) continue;
        let changed = false;
        for (const card3 of [...track.querySelectorAll(".lfx-card[data-lfx-id]")]) {
          if (gone.has(card3.dataset.lfxId)) {
            card3.remove();
            changed = true;
          }
        }
        if (!changed) continue;
        if (!track.querySelector(".lfx-card")) row.remove();
        else track.dispatchEvent(new Event("scroll"));
      }
    }));
    function skeleton3(def, kind2) {
      const skels = [];
      for (let i = 0; i < 6; i++) skels.push(h("div", { class: "lfx-prime-skel" }));
      const more = moreHref(def);
      const head = h("div", { class: "lfx-prime-row__head" }, [
        h("h2", { class: "lfx-prime-row__title" }, def.title || ""),
        more ? h("a", { class: "lfx-prime-row__more", href: more }, "Mehr ansehen \u203A") : null
      ]);
      const track = h("div", { class: "lfx-prime-row__track", role: "list", "aria-label": def.title || "" }, skels);
      return h("section", {
        class: `lfx-prime-row lfx-prime-row--${kind2} is-loading`,
        dataset: { lfxRow: def.id }
      }, [head, h("div", { class: "lfx-prime-row__viewport" }, [track])]);
    }
    async function loadRow(rowEl, def, kind2) {
      try {
        const items = (await def.load(def)).filter((i) => i && i.Id);
        if (disposed) return;
        if (!items.length) {
          rowEl.remove();
          return;
        }
        putItems(items);
        const { newInfo, trend: trend2 } = await info();
        if (disposed) return;
        const cards = items.map((it, i) => createPrimeCard(it, {
          kind: kind2,
          rank: kind2 === "top10" ? i + 1 : 0,
          badge: cardBadge(it, { newInfo, trend: trend2 })
        }));
        const track = rowEl.querySelector(".lfx-prime-row__track");
        const prev = arrow("prev", "Zur\xFCck");
        const next = arrow("next", "Weiter");
        track.replaceChildren(...cards);
        track.setAttribute("aria-label", def.title || "");
        track.before(prev);
        track.after(next);
        rowEl.querySelector(".lfx-prime-row__title").textContent = def.title || "";
        rowEl.classList.remove("is-loading");
        disposers.push(attachScroller({ track, prev, next, indicator: null }));
      } catch (e) {
        console.warn(`[LenzFlix] Zeile "${def.id}" nicht geladen`, e && e.message);
        if (!disposed) rowEl.remove();
      }
    }
    function ensureObserver() {
      if (observer2 || typeof IntersectionObserver !== "function") return;
      observer2 = new IntersectionObserver((entries) => {
        for (const en of entries) {
          const p = pending.get(en.target);
          if (!en.isIntersecting || !p) continue;
          pending.delete(en.target);
          observer2.unobserve(en.target);
          loadRow(en.target, p.def, p.kind);
        }
      }, { rootMargin: "600px 0px" });
    }
    return {
      add(defs) {
        if (disposed) return;
        ensureObserver();
        for (const def of defs || []) {
          if (!def || rendered.has(def.id)) continue;
          rendered.add(def.id);
          const kind2 = displayKind(def, posterId);
          const el = skeleton3(def, kind2);
          slot.append(el);
          pending.set(el, { def, kind: kind2 });
          if (observer2) observer2.observe(el);
          else loadRow(el, def, kind2);
        }
      },
      ids: () => [...rendered],
      destroy() {
        disposed = true;
        if (observer2) observer2.disconnect();
        observer2 = null;
        pending.clear();
        for (const d of disposers.splice(0)) d();
        slot.textContent = "";
      }
    };
  }

  // src/js/features/prime/home.js
  var MORE_STEP = 4;
  var BASE_GENRES = 6;
  var cleanups4 = [];
  var waitTimer4 = null;
  var gen2 = 0;
  var current5 = null;
  var builtMobile = false;
  function teardown7() {
    for (const fn of cleanups4.splice(0)) {
      try {
        fn && fn();
      } catch (e) {
        console.error("[LenzFlix] prime-home cleanup", e);
      }
    }
    document.getElementById(ROOT_ID12)?.remove();
    document.documentElement.classList.remove(ON_CLASS10);
  }
  var isGenreDef = (d) => /(^|-)genre-/.test(d.id);
  function moreHrefFor(def, { hub, libs, lib }) {
    if (hub) {
      if (lib && (def.id === `${lib.id}-latest` || def.id === `${lib.id}-toprated`)) return lib.href;
      return null;
    }
    const byType = (t) => libs.find((l) => l.collectionType === t && l.hubCapable);
    if (def.id === "latest-movies") {
      const l = byType("movies");
      return l ? hubHref(l.id) : null;
    }
    if (def.id === "latest-series") {
      const l = byType("tvshows");
      return l ? hubHref(l.id) : null;
    }
    if (def.id === "favorites") return "#/home?tab=1";
    if (def.kind === "top10") return "#/home?lfx=new";
    return null;
  }
  async function start3(tab2, route, myGen) {
    let libs = [];
    try {
      libs = await getLibraries();
    } catch {
      libs = [];
    }
    if (myGen !== gen2) return;
    const hub = route.kind === "hub";
    const lib = hub ? libs.find((l) => l.id === route.lib && l.hubCapable) : null;
    if (hub && !lib) return;
    teardown7();
    const heroSlot = h("section", { id: "lfx-prime-hero", class: "lfx-prime-hero-slot", "aria-label": "Empfehlung" });
    const rowsSlot = h("div", { class: "lfx-prime-rows" });
    const moreSlot = h("div", { class: "lfx-prime-moreslot" });
    const root4 = h("div", { id: ROOT_ID12, class: `lfx-prime-home lfx-prime-home--${hub ? "hub" : "home"}` }, [heroSlot, rowsSlot, moreSlot, buildFooter()]);
    tab2.prepend(root4);
    document.documentElement.classList.add(ON_CLASS10);
    current5 = route;
    builtMobile = isMobile();
    cleanups4.push(renderHero(heroSlot, { loadPool: () => hub ? getHubHeroPool(lib) : fetchHomePool() }));
    const getDefs = (genreCount2) => hub ? buildHubRowDefs(lib, { genreCount: genreCount2 }) : buildRowDefs({ genreCount: genreCount2 });
    let defs = [];
    try {
      defs = await getDefs(BASE_GENRES);
    } catch (e) {
      console.warn("[LenzFlix] Zeilen konnten nicht aufgebaut werden", e && e.message);
    }
    if (myGen !== gen2 || !isReady()) return;
    const rows = createRows(rowsSlot, {
      posterId: pickPosterId(defs, hub),
      moreHref: (def) => moreHrefFor(def, { hub, libs, lib })
    });
    cleanups4.push(() => rows.destroy());
    rows.add(defs);
    let genreCount = BASE_GENRES;
    const moreBtn = buildMoreButton(async (btn) => {
      if (btn.disabled) return;
      btn.disabled = true;
      genreCount += MORE_STEP;
      try {
        const all = await getDefs(genreCount);
        if (myGen !== gen2) return;
        const have = new Set(rows.ids());
        const fresh = all.filter((d) => isGenreDef(d) && !have.has(d.id)).slice(0, MORE_STEP);
        rows.add(fresh);
        if (fresh.length < MORE_STEP) btn.hidden = true;
      } catch (e) {
        console.warn("[LenzFlix] Weitere Zeilen nicht geladen", e && e.message);
      }
      btn.disabled = false;
    });
    if (!defs.some(isGenreDef)) moreBtn.hidden = true;
    moreSlot.append(moreBtn);
  }
  function ensure4(route) {
    clearTimeout(waitTimer4);
    const tab2 = findHomeTab5();
    const existing = document.getElementById(ROOT_ID12);
    if (tab2 && existing && tab2.contains(existing) && current5 && current5.key === route.key && builtMobile === isMobile()) return;
    gen2 += 1;
    const myGen = gen2;
    let tries = 0;
    const poll = () => {
      if (myGen !== gen2) return;
      const t = findHomeTab5();
      if (t) start3(t, route, myGen);
      else if (++tries < 30) waitTimer4 = setTimeout(poll, 200);
    };
    if (tab2) poll();
    else waitTimer4 = setTimeout(poll, 200);
  }
  var primeHome = {
    name: "prime-home",
    match: (route) => isTheme("prime") && isModern() && !isTv() && isReady() && Boolean(primeHomeRoute(route)),
    mount: (route) => ensure4(primeHomeRoute(route)),
    update: (route) => ensure4(primeHomeRoute(route)),
    unmount() {
      gen2 += 1;
      clearTimeout(waitTimer4);
      current5 = null;
      teardown7();
    }
  };
  var home_default3 = primeHome;

  // src/js/features/prime/hover-content.js
  var displayName = (item) => item.Type === "Episode" && item.SeriesName ? item.SeriesName : item.Name || "";
  function ratingLabel(item) {
    const r = Number(item && item.CommunityRating);
    return r > 0 ? r.toFixed(1).replace(".", ",") : "";
  }
  function buildMeta(item) {
    const parts = [];
    const fsk = formatRating(item.OfficialRating);
    if (fsk) parts.push(h("span", { class: "lfx-prime-chip" }, fsk));
    const rating = ratingLabel(item);
    if (rating) parts.push(h("span", { class: "lfx-prime-meta__rating" }, `\u2605 ${rating}`));
    if (item.ProductionYear) parts.push(h("span", null, String(item.ProductionYear)));
    const extra = item.Type === "Series" ? formatSeasons(item.ChildCount) : formatRuntime2(item.RunTimeTicks);
    if (extra) parts.push(h("span", null, extra));
    return h("div", { class: "lfx-prime-meta" }, parts);
  }
  function roundButton3(mod, label, icon5, onClick) {
    const b = h("button", { type: "button", class: `lfx-prime-hc__round lfx-prime-hc__round--${mod}`, title: label, "aria-label": label });
    if (icon5) b.append(icon5);
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick(b);
    });
    return b;
  }
  function htmlIcon(markup) {
    const s = h("span", { class: "lfx-prime-hc__ico", "aria-hidden": "true" });
    s.innerHTML = markup;
    return s;
  }
  function buildTitleInfo(item, variant, { trend: trend2 = null, isCurrent: isCurrent2 = () => true } = {}) {
    const popup = variant === "popup";
    const logo = !popup ? logoImage(item, { maxWidth: 400 }) : null;
    const label = h("span", { class: "lfx-prime-hc__label" });
    const play2 = h("button", { type: "button", class: "lfx-prime-hc__play" }, [svgIcon(ICON_PLAY4), label]);
    const paintPlay2 = (state16) => {
      label.replaceChildren(...[
        h("span", null, state16.line1),
        state16.line2 ? h("span", { class: "lfx-prime-hc__label2" }, state16.line2) : null
      ].filter(Boolean));
      play2.classList.toggle("is-two", Boolean(state16.line2));
    };
    paintPlay2(playLabel(item));
    if (item.Type === "Series") {
      loadNextUp(item.Id).then((ep) => {
        if (isCurrent2() && play2.isConnected) paintPlay2(playLabel(item, ep));
      }, () => {
      });
    }
    play2.addEventListener("click", (e) => {
      e.stopPropagation();
      playTitle(item);
    });
    const list = roundButton3("list", "Meine Liste", null, async (b) => {
      await toggleFavorite2(item);
      if (b.isConnected) paintList();
    });
    function paintList() {
      const on = Boolean(item.UserData && item.UserData.IsFavorite);
      list.replaceChildren(svgIcon(on ? ICON_CHECK4 : ICON_PLUS4));
      list.classList.toggle("is-on", on);
      list.setAttribute("aria-pressed", on ? "true" : "false");
      list.setAttribute("aria-label", on ? "Aus Meine Liste entfernen" : "Zu Meine Liste hinzuf\xFCgen");
      list.title = list.getAttribute("aria-label");
    }
    paintList();
    const buttons = [play2, list];
    if (popup) {
      const seen = roundButton3("seen", "Gesehen", null, async (b) => {
        await togglePlayed2(item, { anchorEl: b });
        if (b.isConnected) paintSeen();
      });
      const paintSeen = () => {
        const on = Boolean(item.UserData && item.UserData.Played);
        seen.replaceChildren(htmlIcon(on ? ICON_EYE_CHECK : ICON_EYE));
        seen.classList.toggle("is-on", on);
        seen.setAttribute("aria-pressed", on ? "true" : "false");
        seen.setAttribute("aria-label", on ? "Als ungesehen markieren" : "Als gesehen markieren");
        seen.title = seen.getAttribute("aria-label");
      };
      paintSeen();
      const more = roundButton3("more", "Mehr", htmlIcon(ICON_MORE), (b) => {
        openTitleMenu(item, b);
      });
      more.setAttribute("aria-haspopup", "menu");
      buttons.push(seen, more);
    } else {
      buttons.push(h("a", {
        class: "lfx-prime-hc__round lfx-prime-hc__round--info",
        href: titleHref(item.Id),
        title: "Weitere Informationen",
        "aria-label": "Weitere Informationen"
      }, [svgIcon(ICON_INFO)]));
    }
    const rank = heroTrendLine(item, trend2);
    const desc = item.Overview ? h("p", { class: "lfx-prime-hc__desc" }, item.Overview) : null;
    return h("div", { class: `lfx-prime-hc lfx-prime-hc--${variant}` }, [
      logo ? h("img", { class: "lfx-prime-hc__logo", src: logo, alt: displayName(item), decoding: "async" }) : h("h4", { class: "lfx-prime-hc__title" }, displayName(item)),
      h("div", { class: "lfx-prime-hc__buttons" }, buttons),
      rank ? h("div", { class: "lfx-prime-hc__rank" }, [svgIcon(ICON_TREND), h("span", null, rank)]) : null,
      buildMeta(item),
      desc
    ]);
  }

  // src/js/features/prime/hover.js
  var POPUP_ID2 = "lfx-prime-hover";
  var INTENT_WIDE_MS = 300;
  var INTENT_POSTER_MS = 420;
  var PREVIEW_MS = 1500;
  var LEAVE_MS3 = 140;
  var HOLD_POLL_MS = 300;
  var SCALE2 = 1.56;
  var MIN_WIDTH2 = 340;
  var EDGE2 = 12;
  var TOP_GUARD = 72;
  var HEADER_H = 80;
  var USER_SCROLL_QUIET_MS = 400;
  var FIELDS4 = "Overview,Genres,OfficialRating,ProductionYear,RunTimeTicks,ChildCount,CommunityRating,RemoteTrailers,LocalTrailerCount,UserData,ImageTags,BackdropImageTags";
  var hoverCapable2 = () => typeof window.matchMedia === "function" && window.matchMedia("(hover:hover) and (pointer:fine)").matches;
  var reducedMotion3 = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function popupGeometry(r, vw, vh, infoH = 0) {
    const width = Math.max(Math.round(r.width * SCALE2), MIN_WIDTH2);
    const imgH = Math.round(width * 9 / 16);
    const total = imgH + infoH;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let left = cx - width / 2;
    left = Math.max(EDGE2, Math.min(left, vw - EDGE2 - width));
    let top = cy - imgH / 2;
    top = Math.min(top, vh - EDGE2 - total);
    top = Math.max(top, Math.min(TOP_GUARD, Math.max(0, vh - EDGE2 - total)));
    return { left, top, width, imgH, originX: cx - left, originY: cy - top, scale: r.width / width };
  }
  function scrollDeltaForBottom(bottom, top, vh) {
    const dy = bottom - (vh - EDGE2);
    if (dy <= 0) return 0;
    return Math.max(0, Math.min(dy, top - HEADER_H));
  }
  var lastUserScroll = 0;
  var active3 = null;
  var intent = null;
  var leaveTimer = null;
  var pointerInside = false;
  var listeners5 = [];
  var trendP = null;
  var selfScrollUntil = 0;
  var holdOpen2 = () => Boolean(isMenuOpen() || isChooserOpen());
  var blocked = () => holdOpen2() || document.documentElement.classList.contains("lfx-modal-open") || Boolean(document.querySelector(".dialogContainer")) || document.hidden;
  function loadDetail(id) {
    return cached(`lfx:prime:hover:${id}`, async () => {
      const it = await getItem(id, { Fields: FIELDS4 });
      if (it) putItems([it]);
      return it;
    }, 5 * 6e4);
  }
  function trend() {
    if (!trendP) trendP = getTrendInfo().catch(() => null);
    return trendP;
  }
  function cardOf(target) {
    if (!target || !target.closest) return null;
    const card3 = target.closest(".lfx-prime-card");
    return card3 && card3.closest(`#${ROOT_ID12}`) ? card3 : null;
  }
  function clearIntent() {
    if (intent) clearTimeout(intent.timer);
    intent = null;
  }
  function closeNow2() {
    clearIntent();
    clearTimeout(leaveTimer);
    leaveTimer = null;
    const a = active3;
    active3 = null;
    if (!a) return;
    a.timers.forEach(clearTimeout);
    if (a.preview) a.preview.cancel();
    if (a.holding) setPreviewHold(false);
    if (a.kind === "popup") {
      unmountPoint(POPUP_ID2);
    } else {
      a.card.classList.remove("is-expanded");
      a.el.remove();
    }
  }
  function scheduleLeave() {
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(function check2() {
      leaveTimer = null;
      if (!active3 || pointerInside) return;
      if (holdOpen2()) {
        leaveTimer = setTimeout(check2, HOLD_POLL_MS);
        return;
      }
      closeNow2();
    }, LEAVE_MS3);
  }
  async function openPopup(card3) {
    const item = getStoredItem(card3.dataset.lfxId);
    const link = card3.querySelector(".lfx-card__link");
    if (!item || !link) return;
    const trendInfo = await trend();
    if (!intent || intent.card !== card3) return;
    clearIntent();
    if (active3 || blocked()) return;
    const a = { card: card3, kind: "popup", el: null, preview: null, video: null, timers: [] };
    const pic = landscapeFor(item, 900);
    const p = progressPercent2(item);
    const media = h("a", { class: "lfx-prime-hover__media", href: titleHref(item.Id), "aria-label": item.Name || "" }, [
      pic ? h("img", { class: "lfx-prime-hover__img", src: pic.url, alt: "" }) : null,
      p > 0 ? h("div", { class: "lfx-prime-card__progress" }, [h("div", { class: "lfx-prime-card__bar", style: { width: `${Math.round(p)}%` } })]) : null
    ]);
    const info = h("div", { class: "lfx-prime-hover__info" }, [
      buildTitleInfo(item, "popup", { trend: trendInfo, isCurrent: () => active3 === a })
    ]);
    const el = mountPoint(POPUP_ID2, { className: "lfx-prime-hover" });
    el.className = "lfx-prime-hover";
    el.replaceChildren(media, info);
    el.dataset.lfxId = item.Id;
    a.el = el;
    const r = link.getBoundingClientRect();
    const width = Math.max(Math.round(r.width * SCALE2), MIN_WIDTH2);
    el.style.width = `${width}px`;
    el.style.visibility = "hidden";
    el.style.left = "0px";
    el.style.top = "0px";
    const imgH = Math.round(width * 9 / 16);
    media.style.height = `${imgH}px`;
    const g = popupGeometry(r, window.innerWidth, window.innerHeight, Math.max(0, el.offsetHeight - imgH));
    el.style.left = `${g.left}px`;
    el.style.top = `${g.top}px`;
    el.style.transformOrigin = `${g.originX}px ${g.originY}px`;
    el.style.setProperty("--lfx-prime-s0", String(g.scale));
    el.style.visibility = "";
    active3 = a;
    pointerInside = true;
    const go2 = () => {
      if (active3 === a) el.classList.add("is-in");
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => requestAnimationFrame(go2));
    else go2();
    el.addEventListener("click", (e) => {
      if (e.target.closest("button, a")) return;
      closeNow2();
      window.location.hash = titleHref(item.Id);
    });
  }
  async function openPoster(card3) {
    const item = getStoredItem(card3.dataset.lfxId);
    if (!item) return;
    const trendInfo = await trend();
    if (!intent || intent.card !== card3) return;
    clearIntent();
    if (active3 || blocked()) return;
    const a = { card: card3, kind: "poster", el: null, preview: null, video: null, timers: [], t0: Date.now() };
    const pic = landscapeFor(item, 1e3);
    const mediaEl = h("div", { class: "lfx-prime-expand__media" }, [
      pic ? h("img", { class: "lfx-prime-expand__img", src: pic.url, alt: "" }) : null
    ]);
    const mute = h("button", { type: "button", class: "lfx-prime-expand__mute", hidden: true, "aria-label": "Ton einschalten" });
    mute.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!a.video) return;
      a.video.muted = !a.video.muted;
      mute.replaceChildren(svgIcon(a.video.muted ? ICON_MUTED2 : ICON_SOUND2));
      mute.setAttribute("aria-label", a.video.muted ? "Ton einschalten" : "Ton ausschalten");
    });
    const body = h("div", { class: "lfx-prime-expand__body" }, [buildTitleInfo(item, "expand", { trend: trendInfo, isCurrent: () => active3 === a })]);
    const el = h("div", { class: "lfx-prime-expand" }, [mediaEl, h("div", { class: "lfx-prime-expand__shade", "aria-hidden": "true" }), mute, body]);
    a.el = el;
    card3.append(el);
    card3.classList.add("is-expanded");
    active3 = a;
    pointerInside = true;
    a.timers.push(setTimeout(() => {
      const track = card3.closest(".lfx-prime-row__track");
      if (!track || active3 !== a) return;
      const cr = card3.getBoundingClientRect();
      const tr = track.getBoundingClientRect();
      const over = cr.right - (tr.right - EDGE2 * 2);
      if (over > 0) {
        selfScrollUntil = Date.now() + 700;
        if (typeof track.scrollBy === "function") track.scrollBy({ left: over, behavior: reducedMotion3() ? "auto" : "smooth" });
      }
      if (Date.now() - lastUserScroll < USER_SCROLL_QUIET_MS) return;
      const pr = el.getBoundingClientRect();
      const dy = scrollDeltaForBottom(Math.max(pr.bottom, cr.bottom), Math.min(pr.top, cr.top), window.innerHeight);
      if (dy > 0 && typeof window.scrollBy === "function") {
        selfScrollUntil = Date.now() + 900;
        window.scrollBy({ top: dy, behavior: reducedMotion3() ? "auto" : "smooth" });
      }
    }, 340));
    if (reducedMotion3()) return;
    loadDetail(item.Id).then((detail) => {
      if (active3 !== a || !detail) return;
      a.preview = createMutedPreview(mediaEl, detail, {
        delay: Math.max(0, PREVIEW_MS - (Date.now() - a.t0)),
        startAt: 4,
        onStart: (v) => {
          if (active3 !== a) return;
          a.video = v;
          a.holding = true;
          setPreviewHold(true);
          v.classList.add("is-in");
          el.classList.add("is-video");
          mute.hidden = false;
          mute.replaceChildren(svgIcon(ICON_MUTED2));
        },
        onEnd: () => {
          if (active3 !== a) return;
          a.preview = null;
          a.video = null;
          if (a.holding) {
            a.holding = false;
            setPreviewHold(false);
          }
          el.classList.remove("is-video");
          mute.hidden = true;
        }
      });
    }, () => {
    });
  }
  function scheduleOpen2(card3) {
    clearIntent();
    if (blocked()) return;
    const poster = card3.classList.contains("lfx-prime-card--poster");
    const timer = setTimeout(() => {
      if (!intent || intent.card !== card3) return;
      if (!card3.isConnected) {
        clearIntent();
        return;
      }
      (poster ? openPoster : openPopup)(card3);
    }, poster ? INTENT_POSTER_MS : INTENT_WIDE_MS);
    intent = { card: card3, timer };
  }
  function onOver2(e) {
    const t = e.target;
    const inPopup = Boolean(t && t.closest && t.closest(`#${POPUP_ID2}`));
    const card3 = inPopup ? null : cardOf(t);
    if (inPopup || card3 && active3 && active3.card === card3) {
      pointerInside = true;
      clearTimeout(leaveTimer);
      leaveTimer = null;
      return;
    }
    pointerInside = false;
    if (active3) {
      if (!card3 || card3 !== active3.card) {
        if (card3) closeNow2();
        else scheduleLeave();
      }
    }
    if (card3 && !active3) scheduleOpen2(card3);
    else if (!card3) clearIntent();
  }
  function onOut2(e) {
    if (e.relatedTarget) return;
    pointerInside = false;
    clearIntent();
    if (active3) scheduleLeave();
  }
  function onScroll5() {
    if (Date.now() < selfScrollUntil) return;
    lastUserScroll = Date.now();
    if (!active3 && !intent) return;
    closeNow2();
  }
  function onKey2(e) {
    if (e.key === "Escape" && active3) closeNow2();
  }
  function add(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    listeners5.push(() => target.removeEventListener(type, fn, opts));
  }
  function start4() {
    add(document, "mouseover", onOver2);
    add(document, "mouseout", onOut2);
    add(document, "keydown", onKey2);
    add(window, "scroll", onScroll5, { capture: true, passive: true });
    add(window, "hashchange", closeNow2);
    add(window, "blur", closeNow2);
  }
  function stop3() {
    closeNow2();
    for (const off of listeners5.splice(0)) off();
    unmountPoint(POPUP_ID2);
    trendP = null;
    pointerInside = false;
    selfScrollUntil = 0;
    lastUserScroll = 0;
  }
  var primeHover = {
    name: "prime-hover",
    match: (route) => isTheme("prime") && isModern() && !isTv() && !isMobile() && isReady() && hoverCapable2() && Boolean(primeHomeRoute(route)),
    mount: start4,
    unmount: stop3
  };
  var hover_default = primeHover;

  // src/js/features/prime/title-logic.js
  var TICKS_PER_MIN5 = 6e8;
  function resolveTarget4(item, id) {
    const sel = { seasonId: null, episodeId: null };
    let targetId = id;
    if (item && item.Type === "Episode") {
      targetId = item.SeriesId || item.ParentId || id;
      sel.episodeId = item.Id;
      sel.seasonId = item.SeasonId || item.ParentId || null;
    } else if (item && item.Type === "Season") {
      targetId = item.SeriesId || item.ParentId || id;
      sel.seasonId = item.Id;
    }
    return { targetId, sel };
  }
  function ratingChip(rating) {
    const r = String(rating || "").trim();
    if (!r) return null;
    const m = /(\d{1,2})/.exec(r);
    if (!m) return { text: r.slice(0, 6), tone: "16" };
    const n = Number(m[1]);
    return { text: String(n), tone: n >= 16 ? "16" : n >= 12 ? "12" : "6" };
  }
  function metaItems(item, seasonCount = 0) {
    const out = [];
    const score = Number(item && item.CommunityRating);
    if (score > 0) out.push(`\u2605 ${score.toFixed(1).replace(".", ",")}`);
    if (item && item.ProductionYear) out.push(String(item.ProductionYear));
    if (item && item.Type === "Series") {
      const n = seasonCount || Number(item.ChildCount) || 0;
      if (n > 0) out.push(`${n} ${n === 1 ? "Staffel" : "Staffeln"}`);
    } else {
      const rt = formatRuntime(item && item.RunTimeTicks);
      if (rt) out.push(rt);
    }
    return out;
  }
  function playInfo(main, nextUp) {
    const isSeries = main && main.Type === "Series";
    if (isSeries && nextUp) {
      const resume2 = hasResume(nextUp);
      const n = nextUp.IndexNumber != null ? nextUp.IndexNumber : null;
      const s = nextUp.ParentIndexNumber != null ? nextUp.ParentIndexNumber : null;
      const code = s != null && n != null ? `S${s} F${n}` : n != null ? `Folge ${n}` : "";
      return {
        label: resume2 ? "Fortsetzen" : n != null ? `Folge ${n}` : "Abspielen",
        sub: resume2 ? code : "Jetzt ansehen",
        progress: resume2 ? progressPercent(nextUp) : 0,
        target: nextUp,
        resume: resume2
      };
    }
    const resume = !isSeries && hasResume(main);
    return {
      label: resume ? "Fortsetzen" : "Abspielen",
      sub: "",
      progress: resume ? progressPercent(main) : 0,
      target: main,
      resume
    };
  }
  function remainingLabel2(ep) {
    const ud = ep && ep.UserData;
    if (!ud || !(ud.PlaybackPositionTicks > 0) || !(ep.RunTimeTicks > 0)) return "";
    const left = Math.round((ep.RunTimeTicks - ud.PlaybackPositionTicks) / TICKS_PER_MIN5);
    return left > 0 ? `Noch ${left} Min.` : "";
  }
  function episodeRuntime(ep) {
    return formatRuntime(ep && ep.RunTimeTicks);
  }
  function episodeTitle(ep) {
    const n = ep && ep.IndexNumber != null ? `${ep.IndexNumber}. ` : "";
    return `${n}${ep && ep.Name || ""}`.trim();
  }
  function seasonName(season) {
    if (!season) return "";
    if (season.IndexNumber === 0) return season.Name || "Extras";
    if (season.IndexNumber > 0) return `Staffel ${season.IndexNumber}`;
    return season.Name || "Staffel";
  }
  var uniq = (arr) => [...new Set(arr.filter(Boolean))];
  function streamsOf(item, type) {
    const out = [];
    for (const src of item && item.MediaSources || []) {
      for (const s of src.MediaStreams || []) if (s && s.Type === type) out.push(s);
    }
    return out;
  }
  function detailTiles(item, seasonCount = 0) {
    if (!item) return [];
    const tiles = [];
    const facts = [...metaItems(item, seasonCount)];
    tiles.push({ id: "info", title: item.Name || "", lines: facts.length ? [facts.join("  \xB7  ")] : [], text: item.Overview || "" });
    if (item.Genres && item.Genres.length) tiles.push({ id: "genres", title: "Genres", chips: item.Genres.slice(0, 12) });
    const actors = peopleOf(item, "Actor").slice(0, 14);
    if (actors.length) tiles.push({ id: "cast", title: "Besetzung", lines: actors.map((p) => p.Role ? `${p.Name} (${p.Role})` : p.Name) });
    const directors = peopleOf(item, "Director");
    const writers = peopleOf(item, "Writer");
    if (directors.length || writers.length) {
      const lines = [];
      if (directors.length) lines.push(`Regie: ${directors.map((p) => p.Name).join(", ")}`);
      if (writers.length) lines.push(`Drehbuch: ${writers.slice(0, 6).map((p) => p.Name).join(", ")}`);
      tiles.push({ id: "crew", title: "Kreative", lines });
    }
    const studios = uniq((item.Studios || []).map((s) => s && s.Name));
    if (studios.length) tiles.push({ id: "studio", title: "Studio", lines: [studios.join(", ")] });
    const audio = uniq(streamsOf(item, "Audio").map((s) => s.DisplayLanguage || s.Language));
    if (audio.length) tiles.push({ id: "audio", title: "Wiedergabesprachen", chips: audio });
    const subs = uniq(streamsOf(item, "Subtitle").map((s) => s.DisplayLanguage || s.Language));
    if (subs.length) tiles.push({ id: "subs", title: "Untertitel", chips: subs });
    if (item.Type !== "Series" && item.RunTimeTicks > 0) tiles.push({ id: "runtime", title: "Laufzeit", lines: [formatRuntime(item.RunTimeTicks)] });
    return tiles;
  }

  // src/js/features/prime/title-dom.js
  var svg8 = (p) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${p}</svg>`;
  var ICONS5 = {
    play: svg8('<path d="M7 4.2v15.6a1 1 0 0 0 1.5.86l13-7.8a1 1 0 0 0 0-1.72l-13-7.8A1 1 0 0 0 7 4.2z"/>'),
    plus: svg8('<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/>'),
    check: svg8('<path d="M9.2 16.6 4.9 12.3l-1.4 1.4 5.7 5.7L20.5 8.1l-1.4-1.4z"/>'),
    trailer: svg8('<path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2v10h14V7zm4.5 2.2 5 2.8-5 2.8z"/>'),
    muted: svg8('<path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z"/>'),
    sound: svg8('<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/>'),
    chevron: svg8('<path d="M6.7 9.3 12 14.6l5.3-5.3 1.4 1.4-6.7 6.7-6.7-6.7z"/>'),
    trend: svg8('<path d="M3 17.6 9.5 11l4 4 6.3-6.6L21 9.7V5h-4.7l1.4 1.4-4.2 4.4-4-4L1.6 15.8z"/>')
  };
  function iconEl2(markup, cls = "lfx-pt__ico") {
    const el = h("span", { class: cls, "aria-hidden": "true" });
    el.innerHTML = markup;
    return el;
  }
  function circleButton2({ label, icon: icon5, mod = "", onClick, hidden = false }) {
    const b = h("button", {
      type: "button",
      class: `lfx-pt__circle${mod ? ` lfx-pt__circle--${mod}` : ""}`,
      "aria-label": label,
      title: label,
      hidden: hidden || null
    });
    b.append(iconEl2(icon5));
    if (onClick) {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        onClick(b, e);
      });
    }
    return b;
  }
  function setIcon2(btn, markup) {
    const ico = btn.querySelector(".lfx-pt__ico");
    if (ico) ico.innerHTML = markup;
  }
  function ratingChipEl(rating) {
    const c = ratingChip(rating);
    return c ? h("span", { class: `lfx-pt__fsk lfx-pt__fsk--${c.tone}`, title: `Altersfreigabe ${rating}` }, c.text) : null;
  }
  function buildTile(tile2) {
    return h("section", { class: `lfx-pt__tile lfx-pt__tile--${tile2.id}` }, [
      h("h3", { class: "lfx-pt__tile-title" }, tile2.title),
      ...(tile2.lines || []).map((l) => h("p", { class: "lfx-pt__tile-line" }, l)),
      tile2.text ? h("p", { class: "lfx-pt__tile-text" }, tile2.text) : null,
      tile2.chips ? h("div", { class: "lfx-pt__chips" }, tile2.chips.map((c) => h("span", { class: "lfx-pt__chip" }, c))) : null
    ]);
  }
  function buildEpisode(ep, { onPlay, selected = false } = {}) {
    const img = landscapeFor(ep, 640);
    const p = progressPercent(ep);
    const remaining = remainingLabel2(ep);
    const media = h("button", { type: "button", class: "lfx-pt__ep-media", "aria-label": `${episodeTitle(ep)} abspielen` }, [
      img ? h("img", { class: "lfx-pt__ep-img", src: img.url, alt: "", loading: "lazy", decoding: "async" }) : null,
      h("span", { class: "lfx-pt__ep-play", "aria-hidden": "true" }, [iconEl2(ICONS5.play)]),
      remaining ? h("span", { class: "lfx-pt__ep-badge" }, remaining) : null,
      p > 0 ? h("span", { class: "lfx-pt__ep-progress", "aria-hidden": "true" }, [h("span", { style: { width: `${Math.round(p)}%` } })]) : null
    ]);
    media.addEventListener("click", () => onPlay && onPlay(ep));
    const meta = [
      ratingChipEl(ep.OfficialRating),
      episodeRuntime(ep) ? h("span", null, episodeRuntime(ep)) : null,
      ep.PremiereDate ? h("span", null, formatDate(ep.PremiereDate)) : null
    ].filter(Boolean);
    return h("article", {
      class: `lfx-pt__ep${selected ? " is-selected" : ""}`,
      dataset: { lfxId: ep.Id }
    }, [
      media,
      h("h3", { class: "lfx-pt__ep-title" }, episodeTitle(ep)),
      ep.Overview ? h("p", { class: "lfx-pt__ep-desc" }, ep.Overview) : null,
      meta.length ? h("div", { class: "lfx-pt__ep-meta" }, meta) : null
    ]);
  }
  function formatDate(iso) {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "";
    return new Date(t).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" });
  }
  function buildCardGrid(items, { trend: trend2, newInfo } = {}) {
    const make = isMobile() ? (it) => createPrimeCard(it, { kind: "poster", badge: cardBadge(it, { newInfo, trend: trend2 }) }) : (it) => createCard(it, { badge: cardBadge(it, { newInfo, trend: trend2 }) });
    return h("div", { class: "lfx-pt__grid", role: "list" }, items.map(make));
  }
  function buildSeasonSelect(seasons, seasonId, onPick) {
    const cur3 = seasons.find((s) => s.Id === seasonId) || seasons[0];
    const btn = h("button", {
      type: "button",
      class: "lfx-pt__season",
      "aria-haspopup": "menu",
      "aria-label": "Staffel w\xE4hlen"
    }, [h("span", { class: "lfx-pt__season-label" }, seasonName(cur3)), iconEl2(ICONS5.chevron, "lfx-pt__season-chev")]);
    btn.addEventListener("click", () => {
      if (isPopoverOpen()) {
        closePopover({ restoreFocus: true });
        return;
      }
      btn.setAttribute("aria-expanded", "true");
      openPopover(btn, {
        label: "Staffeln",
        align: "start",
        className: "lfx-pt-popover",
        items: seasons.map((s) => ({
          key: s.Id,
          label: seasonName(s),
          className: s.Id === (cur3 && cur3.Id) ? "is-active" : "",
          onClick: () => onPick(s.Id)
        }))
      });
    });
    return btn;
  }

  // src/js/features/prime/title.js
  var ROOT_ID13 = "lfx-prime-title";
  var ON_CLASS11 = "lfx-prime-title-on";
  var TRAILER_DELAY_MS3 = 1200;
  var HEADER_H2 = 80;
  var root3 = null;
  var session3 = null;
  var waitTimer5 = null;
  var isPlainRoute = (route) => {
    const r = parseLfxRoute(route);
    return r.kind === "title" && r.id ? r : null;
  };
  function findHomeTab6() {
    const tab2 = document.querySelector("#indexPage:not(.hide) #homeTab");
    return tab2 && tab2.isConnected ? tab2 : null;
  }
  function reducedMotion4() {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function stopVideo(s) {
    if (!s || !s.video) return;
    const v = s.video;
    s.video = null;
    if (s.gate) {
      s.gate.stop();
      s.gate = null;
    }
    try {
      v.pause();
      v.removeAttribute("src");
      if (v.load) v.load();
    } catch {
    }
    v.remove();
    if (s.stage) s.stage.classList.remove("has-video");
    if (s.muteBtn) s.muteBtn.hidden = true;
  }
  function paintMute(s) {
    if (!s.video || !s.muteBtn) return;
    setIcon2(s.muteBtn, s.video.muted ? ICONS5.muted : ICONS5.sound);
    const label = s.video.muted ? "Ton einschalten" : "Ton ausschalten";
    s.muteBtn.setAttribute("aria-label", label);
    s.muteBtn.title = label;
  }
  async function resolveTrailerSrc(item) {
    try {
      const t = await loadLocalTrailer({ ...item, LocalTrailerCount: item.LocalTrailerCount == null ? 1 : item.LocalTrailerCount });
      if (t) return trailerUrl(t.Id);
    } catch {
    }
    return directRemoteTrailerUrl(item);
  }
  function startVideo(s, { muted = true } = {}) {
    if (s.dead || !s.trailerSrc || !s.bg) return;
    if (s.video) {
      s.video.muted = muted;
      try {
        s.video.currentTime = 0;
        const p = s.video.play && s.video.play();
        if (p && p.catch) p.catch(() => {
        });
      } catch {
      }
      paintMute(s);
      return;
    }
    const v = h("video", { class: "lfx-pt__video", playsinline: true, preload: "auto", "aria-hidden": "true" });
    v.muted = muted;
    if (muted) v.setAttribute("muted", "");
    v.addEventListener("playing", () => {
      if (s.dead || s.video !== v) return;
      v.classList.add("is-in");
      s.stage.classList.add("has-video");
      s.muteBtn.hidden = false;
      paintMute(s);
    });
    const end = () => {
      if (s.video === v) stopVideo(s);
    };
    v.addEventListener("ended", end);
    v.addEventListener("error", end);
    s.video = v;
    if (muted) applyStartAt(v, 4);
    v.src = s.trailerSrc;
    s.bg.append(v);
    s.gate = autoPause(v);
    try {
      const p = v.play && v.play();
      if (p && p.catch) p.catch(end);
    } catch {
      end();
    }
  }
  function buildSkeleton2() {
    return h("div", { class: "lfx-pt__skeleton", "aria-busy": "true", "aria-label": "Wird geladen" }, [
      h("div", { class: "lfx-pt__sk-bar lfx-pt__sk-bar--title" }),
      h("div", { class: "lfx-pt__sk-bar" }),
      h("div", { class: "lfx-pt__sk-bar lfx-pt__sk-bar--btn" })
    ]);
  }
  function buildError2(message) {
    return h("div", { class: "lfx-pt__error", role: "alert" }, [
      h("p", null, message),
      h("a", { class: "lfx-pt__back", href: "#/home" }, "Zur Startseite")
    ]);
  }
  function backdropOf(main) {
    return imageUrl(main, { type: "Backdrop", maxWidth: 1920, quality: 85 }) || landscapeImage(main, { maxWidth: 1920, quality: 85 }) || imageUrl(main, { type: "Primary", maxWidth: 900, quality: 85 });
  }
  function paintPlay(s, info) {
    const btn = s.playBtn;
    if (!btn) return;
    btn.replaceChildren(
      iconEl2(ICONS5.play),
      h("span", { class: "lfx-pt__play-text" }, [
        h("span", { class: "lfx-pt__play-label" }, info.label),
        info.sub ? h("span", { class: "lfx-pt__play-sub" }, info.sub) : null
      ])
    );
    btn.classList.toggle("is-two-line", Boolean(info.sub));
    s.playInfo = info;
    const wrap = s.playWrap;
    const old = wrap.querySelector(".lfx-pt__progress");
    if (old) old.remove();
    if (info.progress > 0) {
      wrap.append(h("div", { class: "lfx-pt__progress", "aria-hidden": "true" }, [h("span", { style: { width: `${Math.round(info.progress)}%` } })]));
    }
  }
  function buildStage(s, main) {
    const bgUrl2 = backdropOf(main);
    s.bg = h("div", { class: "lfx-pt__bg", "aria-hidden": "true" }, [
      bgUrl2 ? h("img", { class: "lfx-pt__bg-img", src: bgUrl2, alt: "", decoding: "async" }) : null,
      h("div", { class: "lfx-pt__shade lfx-pt__shade--a" }),
      h("div", { class: "lfx-pt__shade lfx-pt__shade--b" })
    ]);
    s.muteBtn = circleButton2({
      label: "Ton einschalten",
      icon: ICONS5.muted,
      mod: "mute",
      hidden: true,
      onClick: () => {
        if (!s.video) return;
        s.video.muted = !s.video.muted;
        paintMute(s);
      }
    });
    s.muteBtn.classList.add("lfx-pt__mute");
    const logo = logoImage(main, { maxWidth: 720 });
    const title = logo ? h("img", { class: "lfx-pt__logo", src: logo, alt: main.Name || "", decoding: "async" }) : h("h1", { class: "lfx-pt__title" }, main.Name || "");
    s.rankEl = h("div", { class: "lfx-pt__rank", hidden: true });
    const meta = h("div", { class: "lfx-pt__meta" });
    const fill3 = (seasonCount) => {
      const parts = metaItems(main, seasonCount);
      const chip = ratingChipEl(main.OfficialRating);
      meta.replaceChildren(
        ...chip ? [chip] : [],
        ...parts.map((p) => h("span", { class: "lfx-pt__meta-item" }, p))
      );
    };
    fill3(0);
    s.fillMeta = fill3;
    s.playBtn = h("button", { type: "button", class: "lfx-pt__play" });
    s.playBtn.addEventListener("click", () => {
      const info = s.playInfo;
      if (info && info.target) play(info.target, { resume: info.resume });
    });
    s.playWrap = h("div", { class: "lfx-pt__play-wrap" }, [s.playBtn]);
    paintPlay(s, playInfo(main, null));
    const isFav = () => Boolean(main.UserData && main.UserData.IsFavorite);
    const isPlayed3 = () => Boolean(main.UserData && main.UserData.Played);
    const favLabel = () => isFav() ? "Aus Meine Liste entfernen" : "Zu Meine Liste hinzuf\xFCgen";
    s.favBtn = circleButton2({
      label: favLabel(),
      icon: isFav() ? ICONS5.check : ICONS5.plus,
      mod: "fav",
      onClick: async (b) => {
        await toggleFavorite2(main);
        if (!s.dead) syncButtons(s, main);
        b.blur();
      }
    });
    s.playedBtn = circleButton2({
      label: isPlayed3() ? "Als ungesehen markieren" : "Als gesehen markieren",
      icon: isPlayed3() ? ICON_EYE_CHECK : ICON_EYE,
      mod: "seen",
      onClick: async (b) => {
        await togglePlayed2(main, { anchorEl: b });
        if (!s.dead) syncButtons(s, main);
      }
    });
    s.trailerBtn = circleButton2({
      label: "Trailer ansehen",
      icon: ICONS5.trailer,
      mod: "trailer",
      hidden: true,
      onClick: () => startVideo(s, { muted: false })
    });
    s.dlBtn = circleButton2({
      label: main.Type === "Series" || main.Type === "Season" ? "Episoden herunterladen" : "Herunterladen",
      icon: ICON_DOWNLOAD,
      mod: "dl",
      hidden: true,
      onClick: (b) => startDownloadFor(main, { anchorEl: b })
    });
    const more = circleButton2({ label: "Mehr", icon: ICON_MORE, mod: "more", onClick: (b) => openTitleMenu(main, b) });
    more.setAttribute("aria-haspopup", "menu");
    s.circles = h("div", { class: "lfx-pt__circles" }, [s.trailerBtn, s.favBtn, s.playedBtn, s.dlBtn, more]);
    const content = h("div", { class: "lfx-pt__content" }, [
      title,
      s.rankEl,
      meta,
      main.Overview ? h("p", { class: "lfx-pt__desc" }, main.Overview) : null,
      h("div", { class: "lfx-pt__actions" }, [s.playWrap, s.circles])
    ]);
    s.stage = h("div", { class: "lfx-pt__stage" }, [s.bg, s.muteBtn, content]);
    return s.stage;
  }
  function syncButtons(s, main) {
    const fav = Boolean(main.UserData && main.UserData.IsFavorite);
    const played = Boolean(main.UserData && main.UserData.Played);
    setIcon2(s.favBtn, fav ? ICONS5.check : ICONS5.plus);
    s.favBtn.classList.toggle("is-on", fav);
    s.favBtn.setAttribute("aria-pressed", String(fav));
    const favLabel = fav ? "Aus Meine Liste entfernen" : "Zu Meine Liste hinzuf\xFCgen";
    s.favBtn.setAttribute("aria-label", favLabel);
    s.favBtn.title = favLabel;
    setIcon2(s.playedBtn, played ? ICON_EYE_CHECK : ICON_EYE);
    s.playedBtn.classList.toggle("is-on", played);
    s.playedBtn.setAttribute("aria-pressed", String(played));
    const pl = played ? "Als ungesehen markieren" : "Als gesehen markieren";
    s.playedBtn.setAttribute("aria-label", pl);
    s.playedBtn.title = pl;
  }
  function buildTabs(s, defs) {
    const bar = h("div", { class: "lfx-pt__tabs", role: "tablist" });
    const panels = h("div", { class: "lfx-pt__panels" });
    const sentinel = h("div", { class: "lfx-pt__sentinel", "aria-hidden": "true" });
    const btns = /* @__PURE__ */ new Map();
    const panelEls = /* @__PURE__ */ new Map();
    function select(id) {
      for (const [pid, b] of btns) {
        const on = pid === id;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", String(on));
        b.tabIndex = on ? 0 : -1;
        panelEls.get(pid).hidden = !on;
      }
    }
    for (const d of defs) {
      const b = h("button", {
        type: "button",
        class: "lfx-pt__tab",
        role: "tab",
        id: `lfx-pt-tab-${d.id}`,
        "aria-controls": `lfx-pt-panel-${d.id}`
      }, d.label);
      b.addEventListener("click", () => select(d.id));
      b.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const ids = defs.map((x) => x.id);
        const next = ids[(ids.indexOf(d.id) + (e.key === "ArrowRight" ? 1 : ids.length - 1)) % ids.length];
        select(next);
        btns.get(next).focus();
      });
      btns.set(d.id, b);
      bar.append(b);
      const p = h("div", {
        class: "lfx-pt__panel",
        role: "tabpanel",
        id: `lfx-pt-panel-${d.id}`,
        "aria-labelledby": `lfx-pt-tab-${d.id}`,
        hidden: true
      });
      panelEls.set(d.id, p);
      panels.append(p);
    }
    select(defs[0].id);
    if (typeof IntersectionObserver === "function") {
      const io = new IntersectionObserver(([e]) => {
        bar.classList.toggle("is-stuck", !e.isIntersecting && e.boundingClientRect.top < HEADER_H2);
      }, { rootMargin: `-${HEADER_H2}px 0px 0px 0px` });
      io.observe(sentinel);
      s.cleanups.push(() => io.disconnect());
    }
    return { bar, panels, sentinel, panel: (id) => panelEls.get(id), select };
  }
  var empty = (text) => h("p", { class: "lfx-pt__empty" }, text);
  function fillEpisodes(s, main, panel, sel) {
    let seasons = [];
    let seq3 = 0;
    let firstReveal = Boolean(sel.episodeId);
    async function showSeason2(seasonId) {
      const mine = ++seq3;
      const slot = panel.querySelector(".lfx-pt__eps");
      slot.replaceChildren(h("p", { class: "lfx-pt__empty" }, "Folgen werden geladen \u2026"));
      let eps;
      try {
        eps = await loadEpisodes2(main.Id, seasonId);
      } catch {
        if (!s.dead && mine === seq3) slot.replaceChildren(empty("Folgen konnten nicht geladen werden."));
        return;
      }
      if (s.dead || mine !== seq3) return;
      if (!eps.length) {
        slot.replaceChildren(empty("Keine Folgen vorhanden."));
        return;
      }
      const onPlay = (ep) => play(ep, { resume: hasResume(ep) });
      slot.replaceChildren(...eps.map((ep) => buildEpisode(ep, { onPlay, selected: ep.Id === sel.episodeId })));
      if (firstReveal) {
        firstReveal = false;
        const row = slot.querySelector(".is-selected");
        if (row && typeof row.scrollIntoView === "function") {
          try {
            row.scrollIntoView({ block: "center", behavior: reducedMotion4() ? "auto" : "smooth" });
          } catch {
          }
        }
      }
    }
    return (async () => {
      try {
        seasons = await loadSeasons(main.Id);
      } catch {
        if (!s.dead) panel.replaceChildren(empty("Folgen konnten nicht geladen werden."));
        return;
      }
      if (s.dead) return;
      if (!seasons.length) {
        panel.replaceChildren(empty("Keine Folgen vorhanden."));
        return;
      }
      s.fillMeta(seasons.length);
      let seasonId = pickInitialSeason(seasons, sel.seasonId);
      const head = h("div", { class: "lfx-pt__eps-head" });
      const mountSelect = () => {
        const btn = buildSeasonSelect(seasons, seasonId, (id) => {
          seasonId = id;
          mountSelect();
          showSeason2(id);
        });
        head.replaceChildren(btn);
      };
      if (seasons.length > 1) mountSelect();
      panel.replaceChildren(head, h("div", { class: "lfx-pt__eps" }));
      await showSeason2(seasonId);
    })();
  }
  function teardownSession() {
    const s = session3;
    session3 = null;
    if (!s) return;
    s.dead = true;
    stopVideo(s);
    for (const fn of s.cleanups.splice(0)) {
      try {
        fn && fn();
      } catch (e) {
        console.error("[LenzFlix] prime-title cleanup", e);
      }
    }
    closePopover();
  }
  async function load3(id) {
    teardownSession();
    const s = { id, dead: false, cleanups: [], video: null, trailerSrc: null };
    session3 = s;
    root3.replaceChildren(buildSkeleton2());
    try {
      window.scrollTo(0, 0);
    } catch {
    }
    let main;
    let sel;
    try {
      const peek = getStoredItem(id) || await loadItem(id);
      if (s.dead) return;
      if (!peek) throw new Error("Titel nicht gefunden");
      const r = resolveTarget4(peek, id);
      sel = r.sel;
      main = await loadItem(r.targetId);
      if (!main) throw new Error("Titel nicht gefunden");
    } catch {
      if (!s.dead) root3.replaceChildren(buildError2("Der Titel konnte nicht geladen werden."));
      return;
    }
    if (s.dead) return;
    s.main = main;
    const isSeries = main.Type === "Series";
    const isBox = main.Type === "BoxSet";
    const defs = [];
    if (isSeries) defs.push({ id: "episodes", label: "Folgen" });
    if (isBox) defs.push({ id: "titles", label: "Titel" });
    else defs.push({ id: "similar", label: "\xC4hnliches" });
    defs.push({ id: "details", label: "Details" });
    const stage = buildStage(s, main);
    const tabs = buildTabs(s, defs);
    root3.replaceChildren(stage, tabs.sentinel, tabs.bar, tabs.panels);
    const tilesEl = h("div", { class: "lfx-pt__tiles" }, detailTiles(main).map(buildTile));
    tabs.panel("details").append(tilesEl);
    const tasks = [];
    if (isSeries) {
      tasks.push(loadNextUp(main.Id).then((ep) => {
        if (!s.dead && ep) paintPlay(s, playInfo(main, ep));
      }).catch(() => {
      }));
      tasks.push(fillEpisodes(s, main, tabs.panel("episodes"), sel).catch(() => {
      }));
    }
    const gridPromise = Promise.all([getTrendInfo().catch(() => null), getNewContentInfo().catch(() => null)]);
    const renderGrid = (panel, items, emptyText) => gridPromise.then(([trend2, newInfo]) => {
      if (s.dead) return;
      panel.replaceChildren(items.length ? buildCardGrid(items, { trend: trend2, newInfo }) : empty(emptyText));
    });
    if (isBox) {
      tasks.push(loadCollection(main.Id).then((items) => renderGrid(tabs.panel("titles"), items, "Diese Sammlung ist leer.")).catch(() => {
        if (!s.dead) tabs.panel("titles").replaceChildren(empty("Titel konnten nicht geladen werden."));
      }));
    } else {
      tasks.push(loadSimilar(main.Id).then((items) => renderGrid(tabs.panel("similar"), items.filter((i) => i.Id !== main.Id), "Keine \xE4hnlichen Titel gefunden.")).catch(() => {
        if (!s.dead) tabs.panel("similar").replaceChildren(empty("\xC4hnliche Titel konnten nicht geladen werden."));
      }));
    }
    getTrendInfo().then((trend2) => {
      if (s.dead) return;
      const line = heroTrendLine(main, trend2);
      if (!line) return;
      s.rankEl.replaceChildren(iconEl2(ICONS5.trend, "lfx-pt__rank-ico"), h("span", null, line));
      s.rankEl.hidden = false;
    }).catch(() => {
    });
    Promise.resolve(canDownload(main)).then((ok) => {
      if (ok && !s.dead && s.dlBtn.isConnected) s.dlBtn.hidden = false;
    }, () => {
    });
    resolveTrailerSrc(main).then((src) => {
      if (s.dead || !src) return;
      s.trailerSrc = src;
      s.trailerBtn.hidden = false;
      if (reducedMotion4() || isMobile()) return;
      const t = setTimeout(() => startVideo(s, { muted: true }), TRAILER_DELAY_MS3);
      s.cleanups.push(() => clearTimeout(t));
    }).catch(() => {
    });
    const onVis = () => {
      if (!s.video) return;
      try {
        if (document.hidden) s.video.pause();
        else {
          const p = s.video.play();
          if (p && p.catch) p.catch(() => {
          });
        }
      } catch {
      }
    };
    document.addEventListener("visibilitychange", onVis);
    s.cleanups.push(() => document.removeEventListener("visibilitychange", onVis));
    s.cleanups.push(onItemsChanged(({ removed = [], updated = [] }) => {
      if (s.dead) return;
      if (removed.includes(main.Id)) {
        window.location.hash = "#/home";
        return;
      }
      if (updated.includes(main.Id)) {
        const fresh = getStoredItem(main.Id);
        if (fresh) {
          main.UserData = fresh.UserData || main.UserData;
          syncButtons(s, main);
        }
      }
    }));
    await Promise.all(tasks);
  }
  function stop4() {
    clearTimeout(waitTimer5);
    waitTimer5 = null;
    teardownSession();
    if (root3) root3.remove();
    root3 = null;
    document.getElementById(ROOT_ID13)?.remove();
    document.documentElement.classList.remove(ON_CLASS11);
  }
  function pullToTop(el) {
    el.style.marginTop = "";
    const top = el.getBoundingClientRect().top + (window.scrollY || 0);
    if (top > 2 && top < 240) el.style.marginTop = `-${Math.round(top)}px`;
  }
  function start5(route) {
    const r = isPlainRoute(route);
    if (!r) return;
    clearTimeout(waitTimer5);
    if (root3 && root3.isConnected && session3 && session3.id === r.id) return;
    const run = (tab3) => {
      if (!root3 || !root3.isConnected || !tab3.contains(root3)) {
        document.getElementById(ROOT_ID13)?.remove();
        root3 = h("div", { id: ROOT_ID13, class: "lfx-pt" });
        tab3.prepend(root3);
      }
      document.documentElement.classList.add(ON_CLASS11);
      pullToTop(root3);
      load3(r.id);
    };
    const tab2 = findHomeTab6();
    if (tab2) {
      run(tab2);
      return;
    }
    let tries = 0;
    const poll = () => {
      const t = findHomeTab6();
      if (t) run(t);
      else if (++tries < 30) waitTimer5 = setTimeout(poll, 200);
    };
    waitTimer5 = setTimeout(poll, 200);
  }
  var title_default2 = {
    name: "prime-title",
    match: (route) => isTheme("prime") && isModern() && !isTv() && isReady() && Boolean(isPlainRoute(route)),
    mount: (route) => start5(route),
    update: (route) => start5(route),
    unmount: () => stop4()
  };

  // src/js/features/prime/tabbar.js
  var ID10 = "lfx-prime-tabbar";
  var HTML_CLASS2 = "lfx-prime-tabbar-on";
  var EXCLUDED10 = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video|dashboard|queue)/;
  var HIDE_CLASSES = ["lfx-sheet-open", "lfx-themepicker-open", "lfx-popover-open", "lfx-modal-open", "lfx-prime-profilesheet-open"];
  var DIALOG_SELECTOR = [
    ".dialogContainer .dialog",
    ".MuiDialog-root:not(.MuiModal-hidden)",
    ".MuiPopover-root:not(.MuiModal-hidden)",
    ".MuiModal-root:not(.MuiModal-hidden)[role=presentation]",
    "#lfx-popover",
    "#lfx-sheet",
    "#lfx-themepicker"
  ].map((q) => `${q}:not([aria-hidden=true]):not([hidden])`).join(", ");
  var SVG_NS3 = "http://www.w3.org/2000/svg";
  var ICONS6 = {
    home: "M12 3.2 2.5 11.3l1.3 1.5L5 11.8V20a1 1 0 0 0 1 1h4.2v-6h3.6v6H18a1 1 0 0 0 1-1v-8.2l1.2 1 1.3-1.5L12 3.2Z",
    list: "M6 3h12a1 1 0 0 1 1 1v17l-7-4.6L5 21V4a1 1 0 0 1 1-1Zm1 2v12.2l5-3.3 5 3.3V5H7Z",
    search: "M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.3 4.3-1.4 1.4-4.3-4.3A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z"
  };
  function icon4(name) {
    const svg9 = document.createElementNS(SVG_NS3, "svg");
    svg9.setAttribute("viewBox", "0 0 24 24");
    svg9.setAttribute("aria-hidden", "true");
    svg9.setAttribute("focusable", "false");
    const p = document.createElementNS(SVG_NS3, "path");
    p.setAttribute("d", ICONS6[name]);
    svg9.append(p);
    return svg9;
  }
  function activeTab2(route, searchOpen = false) {
    if (searchOpen) return "search";
    const key = activeKey3(route);
    if (key === "home" || key && key.startsWith("lib:")) return "home";
    if (key === "list") return "list";
    return null;
  }
  var state15 = { el: null, route: null, observer: null, bodyObserver: null, raf: 0, cleanups: [] };
  function scheduleApply() {
    if (state15.raf) return;
    const run = () => {
      state15.raf = 0;
      applyState();
    };
    state15.raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame(run) : setTimeout(run, 0);
  }
  function inputFocused() {
    const a = document.activeElement;
    return Boolean(a && a.classList && a.classList.contains("lfx-prime-search__input"));
  }
  function shouldHide() {
    const cl2 = document.documentElement.classList;
    if (HIDE_CLASSES.some((c) => cl2.contains(c))) return true;
    if (document.querySelector("#videoOsdPage:not(.hide)")) return true;
    if (document.querySelector(DIALOG_SELECTOR)) return true;
    return inputFocused();
  }
  function applyState() {
    const el = state15.el;
    if (!el) return;
    const hide = shouldHide();
    if (el.classList.contains("is-hidden") !== hide) el.classList.toggle("is-hidden", hide);
    el.toggleAttribute("inert", hide);
    const active4 = state15.route ? activeTab2(state15.route, isPrimeSearchOpen()) : null;
    for (const t of el.querySelectorAll("[data-tab]")) {
      const on = t.dataset.tab === active4;
      t.classList.toggle("is-active", on);
      if (on) {
        if (t.getAttribute("aria-current") !== "page") t.setAttribute("aria-current", "page");
      } else if (t.hasAttribute("aria-current")) t.removeAttribute("aria-current");
    }
  }
  function tab(key, label, iconName, attrs = {}) {
    const tag = attrs.href ? "a" : "button";
    return h(tag, {
      class: "lfx-prime-tabbar__tab",
      dataset: { tab: key },
      ...tag === "button" ? { type: "button" } : {},
      ...attrs
    }, [icon4(iconName), h("span", { class: "lfx-prime-tabbar__label" }, label)]);
  }
  function build7() {
    const home = tab("home", "Startseite", "home", { href: "#/home" });
    const list = tab("list", "Meine Liste", "list", { href: "#/home?tab=1" });
    const search = tab("search", "Suche", "search", { "aria-haspopup": "dialog" });
    home.addEventListener("click", () => {
      closePrimeSearch({ restoreFocus: false });
      applyState();
    });
    list.addEventListener("click", () => {
      closePrimeSearch({ restoreFocus: false });
      applyState();
    });
    search.addEventListener("click", () => {
      if (isPrimeSearchOpen()) closePrimeSearch({ restoreFocus: false });
      else openPrimeSearch({ returnFocus: search });
      applyState();
    });
    state15.el.replaceChildren(home, list, search);
    state15.el.setAttribute("aria-label", "Hauptnavigation");
  }
  var tabbar_default2 = {
    name: "prime-tabbar",
    match(route) {
      return isTheme("prime") && isModern() && !isTv() && isMobile() && isReady() && !EXCLUDED10.test(route.path);
    },
    mount(route) {
      state15.route = route;
      state15.el = mountPoint(ID10, { tag: "nav", className: "lfx-prime-tabbar" });
      build7();
      document.documentElement.classList.add(HTML_CLASS2);
      if (typeof MutationObserver === "function") {
        state15.observer = new MutationObserver(applyState);
        state15.observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        state15.observer.observe(document.body, { childList: true });
        state15.bodyObserver = new MutationObserver((records) => {
          if (state15.el && records.every((r) => state15.el.contains(r.target))) return;
          scheduleApply();
        });
        state15.bodyObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "aria-hidden", "hidden", "open"] });
      }
      const onFocus = () => applyState();
      document.addEventListener("focusin", onFocus);
      document.addEventListener("focusout", onFocus);
      state15.cleanups.push(() => {
        document.removeEventListener("focusin", onFocus);
        document.removeEventListener("focusout", onFocus);
      });
      applyState();
    },
    update(route) {
      state15.route = route;
      applyState();
    },
    unmount() {
      if (state15.observer) state15.observer.disconnect();
      state15.observer = null;
      if (state15.bodyObserver) state15.bodyObserver.disconnect();
      state15.bodyObserver = null;
      if (state15.raf) {
        if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(state15.raf);
        clearTimeout(state15.raf);
        state15.raf = 0;
      }
      for (const fn of state15.cleanups.splice(0)) fn();
      unmountPoint(ID10);
      document.documentElement.classList.remove(HTML_CLASS2);
      state15.el = null;
      state15.route = null;
    }
  };

  // src/js/features/prime/nativedetail.js
  var nativedetail_default2 = createNativeDetail({ name: "prime-nativedetail", theme: "prime", nologoClass: "lfx-prime-nologo" }).feature;

  // src/js/features/prime/index.js
  var primeFeatures = [header_default2, home_default3, hover_default, title_default2, tabbar_default2, nativedetail_default2];

  // src/js/features/index.js
  var features2 = [themeroute_default, nav_default, mobilenav_default, home_default, hovercard_default, modal_default, newpopular_default, contextmenu_default, statshint_default, ...plusFeatures, ...primeFeatures];

  // src/js/main.js
  var WATCH_MS = 1e3;
  var FAST_MS = 100;
  var FAST_TICKS = 50;
  function init() {
    if (window.LenzFlix) return;
    let running = false;
    let destroyed = false;
    let watchTimer = null;
    let refreshTimer = null;
    function startFeatures() {
      if (running || destroyed) return;
      running = true;
      initLayout();
      for (const f of features2) registerFeature(f);
      let n = 0;
      refreshTimer = setInterval(() => {
        applyLayoutClasses();
        reevaluate();
        if (++n >= 40) clearInterval(refreshTimer);
      }, 500);
    }
    function stopFeatures() {
      running = false;
      clearInterval(refreshTimer);
      resetRouter();
      removeAllMounts();
      destroyLayout();
      stopTheme();
    }
    function sync2() {
      if (destroyed) return;
      if (cssActive()) {
        startTheme();
        syncThemeUser();
        applyFavicon(getTheme() || "flix");
        if (!running && window.ApiClient && isReady()) startFeatures();
      } else if (running || document.documentElement.classList.contains("lfx-js")) {
        stopFeatures();
        removeFavicon();
      } else {
        stopTheme();
        removeFavicon();
      }
    }
    earlyTheme();
    if (cssActive()) startTheme();
    let fastN = 0;
    watchTimer = setInterval(() => {
      if (++fastN >= FAST_TICKS) {
        clearInterval(watchTimer);
        watchTimer = setInterval(sync2, WATCH_MS);
      }
      sync2();
    }, FAST_MS);
    window.addEventListener("hashchange", sync2);
    sync2();
    function destroy() {
      destroyed = true;
      clearInterval(watchTimer);
      window.removeEventListener("hashchange", sync2);
      stopFeatures();
      destroyTheme();
      removeFavicon();
      delete window.LenzFlix;
    }
    window.LenzFlix = { version: VERSION, destroy };
  }
  init();
})();

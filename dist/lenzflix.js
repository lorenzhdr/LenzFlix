(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // src/js/core/cache.js
  var store = /* @__PURE__ */ new Map();
  var inflight = /* @__PURE__ */ new Map();
  function cached(key, loader, ttlMs = 6e4) {
    const hit = store.get(key);
    if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value);
    if (inflight.has(key)) return inflight.get(key);
    const p = Promise.resolve().then(loader).then((value) => {
      if (inflight.get(key) === p) store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    }).finally(() => {
      if (inflight.get(key) === p) inflight.delete(key);
    });
    inflight.set(key, p);
    return p;
  }
  function peekCached(key) {
    const hit = store.get(key);
    return hit && hit.expires > Date.now() ? hit.value : void 0;
  }
  var HOME_TTL = 10 * 6e4;
  var homeKey = (userId, ...parts) => ["home", userId || "anon", ...parts].join(":");
  function clearCache(prefix) {
    for (const k of [...store.keys()]) if (!prefix || k.startsWith(prefix)) store.delete(k);
    for (const k of [...inflight.keys()]) if (!prefix || k.startsWith(prefix)) inflight.delete(k);
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

  // src/js/core/api.js
  var storedMemo = { raw: void 0, server: null };
  function readStoredServer() {
    try {
      const raw = window.localStorage.getItem("jellyfin_credentials");
      if (storedMemo.raw === raw) return storedMemo.server;
      const parsed = JSON.parse(raw || "null");
      const servers = parsed && parsed.Servers || [];
      const server = servers.find((s) => s && s.AccessToken && s.UserId) || servers[0] || null;
      storedMemo = { raw, server };
      return server;
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
    const addr = call(client, "serverAddress");
    const uid = call(client, "getCurrentUserId");
    const tok = call(client, "accessToken");
    const sid = call(client, "serverId");
    const stored = addr && uid && tok && sid ? null : readStoredServer();
    const address = trimSlash(addr || stored && (stored.ManualAddress || stored.LocalAddress) || "");
    const userId = uid || stored && stored.UserId || null;
    const token2 = tok || stored && stored.AccessToken || null;
    const serverId = sid || stored && stored.Id || null;
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
  async function requestJson(method, path, { params, body, signal, keepalive } = {}) {
    const { token: token2 } = getAuth();
    const headers = { Accept: "application/json" };
    if (token2) headers.Authorization = `MediaBrowser Token="${token2}"`;
    const init2 = { method: String(method || "GET").toUpperCase(), headers, signal };
    if (keepalive) init2.keepalive = true;
    if (body !== void 0 && body !== null) {
      headers["Content-Type"] = "application/json";
      init2.body = typeof body === "string" ? body : JSON.stringify(body);
    }
    const res = await fetch(buildUrl(path, params), init2);
    if (!res.ok) throw new Error(`LenzFlix API: HTTP ${res.status} f\xFCr ${path}`);
    if (res.status === 204) return null;
    if (typeof res.text !== "function") return res.json();
    const text = await res.text();
    return text ? JSON.parse(text) : null;
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
    clearCache("home:");
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
    clearCache("home:");
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
  var imageScale = 1;
  function setImageScale(f) {
    imageScale = f > 0 && f <= 1 ? f : 1;
  }
  var scaled = (v) => v && imageScale !== 1 ? Math.max(1, Math.round(v * imageScale)) : v;
  function imageUrlFor(id, { type = "Primary", maxWidth, maxHeight, quality = 90, tag } = {}) {
    if (!id) return null;
    return buildUrl(`/Items/${id}/Images/${type}`, { maxWidth: scaled(maxWidth), maxHeight: scaled(maxHeight), quality, tag });
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
    const own2 = item.ImageTags && item.ImageTags.Logo;
    if (own2) return imageUrlFor(item.Id, { type: "Logo", tag: own2, maxWidth, quality });
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

  // src/js/core/router.js
  function parseHash(hash2) {
    let h2 = String(hash2 || "").replace(/^#!?/, "");
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
  var VERSION = "1.12.0";

  // src/js/core/themecss.js
  var CLASS = "lfx-theme-css";
  var ACTIVE_ID = "lfx-theme-css";
  var CORE_RE = /lenzflix(\.min)?\.(css|js)(?=$|[?#])/i;
  var CORE_CSS_RE = /lenzflix(\.min)?\.css(?=$|[?#])/i;
  var FILES = { plus: "lenzplus", prime: "lenzprime", retro: "lenzretro", store: "lenzstore", live: "lenzlive" };
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
      let timer2 = null;
      const finish3 = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer2);
        link.onload = link.onerror = null;
        if (inflight2.get(id) === p) inflight2.delete(id);
        if (ok) link.setAttribute("data-lfx-loaded", "1");
        else link.remove();
        resolve2(ok);
      };
      link.onload = () => finish3(true);
      link.onerror = () => finish3(false);
      timer2 = setTimeout(() => finish3(false), timeout);
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
  var STORE_HREF = "data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%20role=%22img%22%3E%3Ctitle%3EVIDEOTHEK%20LENZ%3C/title%3E%3Crect%20width=%2264%22%20height=%2264%22%20rx=%2212%22%20fill=%22%230d1330%22/%3E%3Crect%20x=%224%22%20y=%224%22%20width=%2256%22%20height=%2256%22%20rx=%229%22%20fill=%22none%22%20stroke=%22%23ff3d7f%22%20stroke-width=%222.5%22/%3E%3Cpath%20d=%22M12%2018l9%2028%209-28h-5.5L21%2033.5%2017.5%2018zM34%2018h5.5v23H52v5H34z%22%20fill=%22%23ffd23f%22/%3E%3C/svg%3E";
  var LIVE_HREF = "data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Ctitle%3ELENZ%20LIVE%3C/title%3E%3Crect%20width=%2264%22%20height=%2264%22%20rx=%2212%22%20fill=%22%230b0d12%22/%3E%3Cpath%20d=%22M22%2011l8%208M42%2011l-8%208%22%20stroke=%22%23f4f1e8%22%20stroke-width=%223%22%20stroke-linecap=%22round%22%20fill=%22none%22/%3E%3Crect%20x=%228%22%20y=%2219%22%20width=%2248%22%20height=%2234%22%20rx=%228%22%20fill=%22%23f4f1e8%22/%3E%3Crect%20x=%2213%22%20y=%2224%22%20width=%2230%22%20height=%2224%22%20rx=%226%22%20fill=%22%233a7bd5%22/%3E%3Ccircle%20cx=%2250%22%20cy=%2231%22%20r=%223.2%22%20fill=%22%23e03a2f%22/%3E%3Crect%20x=%2246.5%22%20y=%2238%22%20width=%227%22%20height=%223%22%20rx=%221.5%22%20fill=%22%230b0d12%22/%3E%3Crect%20x=%2246.5%22%20y=%2243%22%20width=%227%22%20height=%223%22%20rx=%221.5%22%20fill=%22%230b0d12%22/%3E%3C/svg%3E";
  var FAVICONS = { flix: FLIX_HREF, plus: FLIX_HREF, prime: FLIX_HREF, retro: FLIX_HREF, store: STORE_HREF, live: LIVE_HREF };
  var typeFor = (href) => href.startsWith("data:image/svg") ? "image/svg+xml" : "image/png";
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
        for (const l of [...patched, created]) {
          l.setAttribute("href", href);
          l.setAttribute("type", typeFor(href));
        }
      }
      return;
    }
    currentTheme = theme;
    patched = [...document.head.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')];
    for (const l of patched) {
      l.setAttribute(ATTR, l.getAttribute("href") ?? "");
      l.setAttribute("href", href);
      l.setAttribute("type", typeFor(href));
      l.removeAttribute("sizes");
    }
    created = document.createElement("link");
    created.id = "lfx-favicon";
    created.rel = "icon";
    created.type = typeFor(href);
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
    const el4 = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === void 0 || v === null || v === false) continue;
      if (k === "class") el4.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el4.style, v);
      else if (k === "dataset") Object.assign(el4.dataset, v);
      else if (k.startsWith("on") && typeof v === "function") el4.addEventListener(k.slice(2).toLowerCase(), v);
      else el4.setAttribute(k, v === true ? "" : String(v));
    }
    for (const c of [].concat(children ?? [])) {
      if (c === null || c === void 0 || c === false) continue;
      el4.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el4;
  }
  function badgePill(text) {
    return h("span", { class: "lfx-beta", "aria-hidden": "true" }, text);
  }
  function badgedName(label, badge3) {
    return badge3 ? `${label} (${badge3})` : void 0;
  }
  var mounts = /* @__PURE__ */ new Set();
  function mountPoint(id, { parent = document.body, before = null, className = "", tag = "div" } = {}) {
    let el4 = document.getElementById(id);
    if (!el4) {
      el4 = document.createElement(tag);
      el4.id = id;
      if (className) el4.className = className;
      if (before && before.parentNode === parent) parent.insertBefore(el4, before);
      else parent.append(el4);
    }
    mounts.add(el4);
    return el4;
  }
  function unmountPoint(elOrId) {
    const el4 = typeof elOrId === "string" ? document.getElementById(elOrId) : elOrId;
    if (el4) {
      el4.remove();
      mounts.delete(el4);
    }
  }
  function removeAllMounts() {
    for (const el4 of mounts) el4.remove();
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
    const root7 = mountPoint(ID, { className: "lfx-toast" });
    root7.classList.remove("is-leaving");
    root7.setAttribute("role", "status");
    root7.setAttribute("aria-live", "polite");
    root7.replaceChildren(h("div", { class: "lfx-toast__msg" }, [String(text)]));
    hideTimer = setTimeout(() => {
      root7.classList.add("is-leaving");
      removeTimer = setTimeout(() => {
        unmountPoint(root7);
        hideTimer = removeTimer = null;
      }, 200);
    }, duration);
  }
  function clearToast() {
    clearTimers();
    unmountPoint(ID);
  }

  // src/js/core/theme.js
  var THEMES = ["flix", "plus", "prime", "retro", "store", "live"];
  var THEME_META = {
    flix: { id: "flix", name: "LENZFLIX", tagline: "Klassisch: rote Akzente, Querformat-Karten", palette: ["#141414", "#e50914", "#ffffff", "#808080"] },
    plus: { id: "plus", name: "LENZ+", tagline: "Karussell, Poster und Marken-Hubs", palette: ["#10131f", "#050507", "#1bb3e8", "#f5f5f7"] },
    prime: { id: "prime", name: "LENZPRIME", tagline: "Vollbild-Hero, Badges und Trailer", palette: ["#0a0e17", "#1a98ff", "#ffffff", "#3a3d45"] },
    retro: { id: "retro", name: "LENZ//84", tagline: "Bernstein-Terminal, Kassetten und Neon-Gitter", palette: ["#0a0603", "#ffb000", "#ff5a1f", "#ffe2a8"] },
    store: { id: "store", name: "VIDEOTHEK LENZ", tagline: "Begehbare 3D-Videothek", palette: ["#0d1330", "#ffd23f", "#ff3d7f", "#2446a8"] },
    live: { id: "live", name: "LENZ LIVE", tagline: "Lineares Fernsehen mit 18 Sendern", palette: ["#0b0d12", "#e03a2f", "#f4f1e8", "#3a7bd5"] }
  };
  var KEY_USER = "lfx.theme.";
  var KEY_LAST = "lfx.theme.last";
  var KEY_PREV = "lfx.theme.prev.";
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
  function prevKey() {
    return KEY_PREV + (getUserId() || "last");
  }
  function strictPrev(x) {
    return THEMES.includes(x) && x !== "live" ? x : null;
  }
  function getPreviousTheme() {
    return strictPrev(lsGet(prevKey())) || "flix";
  }
  function savePrevious(id) {
    const p = strictPrev(id);
    if (p) lsSet(prevKey(), p);
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
      const hash2 = `#${r.path}${qs ? `?${qs}` : ""}`;
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${hash2}`);
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
      const prev2 = strictPrev(lsGet(KEY_PREV + uid));
      if (prev2) prefs.CustomPrefs.prevTheme = prev2;
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
    let remotePrev;
    try {
      const prefs = await fetchPrefs(uid);
      remote = strictTheme(prefs && prefs.CustomPrefs && prefs.CustomPrefs.theme);
      remotePrev = strictPrev(prefs && prefs.CustomPrefs && prefs.CustomPrefs.prevTheme);
    } catch (e) {
      console.warn("[LenzFlix] Design konnte nicht vom Server geladen werden:", e && e.message ? e.message : e);
      return;
    }
    if (!started || getUserId() !== uid) return;
    if (touched !== startTouched || unsynced) {
      scheduleUpload(chosen);
      return;
    }
    if (remotePrev) lsSet(KEY_PREV + uid, remotePrev);
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
    const el4 = document.getElementById(PREHIDE_ID);
    if (el4) el4.remove();
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
    if (id === "flix" || !THEMES.includes(id)) return;
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
    const before = effective || chosen || resolveLocalChoice();
    chosen = next;
    if (source === "user") touched++;
    if (!started) {
      saveLocal(next);
      if (source === "user") {
        if (next === "live") savePrevious(before);
        scheduleUpload(next);
      }
      return;
    }
    const ok = await transition(desired());
    if (ok && source === "user" && next === "live" && before !== "live") savePrevious(before);
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
      if (fromHash === "live") savePrevious(resolveLocalChoice());
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
  function isNarrow() {
    return window.innerWidth < 800;
  }
  function isNavCompact() {
    return window.innerWidth < 900;
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
  function layoutKey() {
    return `${isMobile()}|${isNarrow()}|${isNavCompact()}`;
  }
  function onResizeDebounced() {
    const now = layoutKey();
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
      lastMobile = layoutKey();
      resizeHandler = debounce(onResizeDebounced, RESIZE_DEBOUNCE_MS);
      window.addEventListener("resize", resizeHandler);
      window.addEventListener("orientationchange", resizeHandler);
    }
    return destroyLayout;
  }
  function destroyLayout() {
    if (observer) observer.disconnect();
    observer = null;
    if (resizeHandler) {
      window.removeEventListener("resize", resizeHandler);
      window.removeEventListener("orientationchange", resizeHandler);
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

  // src/js/core/startcover.js
  var ID2 = "lfx-startcover";
  var PAGE = '[id="videoOsdPage"]:not(.hide)';
  var SAFETY_MS = 25e3;
  var FADE_MS = 200;
  var el = null;
  var itemId = null;
  var origin = null;
  var allowed = null;
  var mo = null;
  var raf = 0;
  var safety = 0;
  var leaving = 0;
  var watching = false;
  var routePath = () => parseHash(window.location.hash).path;
  function isActive() {
    const cl2 = document.documentElement.classList;
    return !cl2.contains("layout-tv") && !isTheme("live");
  }
  function isNarrow2() {
    try {
      return typeof window.matchMedia === "function" && window.matchMedia("(max-width: 799px)").matches;
    } catch {
      return false;
    }
  }
  function backdropUrl(item) {
    const opts = { type: "Backdrop", maxWidth: isNarrow2() ? 900 : 1600, quality: 80 };
    const parentTag = item.ParentBackdropImageTags && item.ParentBackdropImageTags[0];
    if (item.Type !== "Episode") {
      const own2 = imageUrl(item, opts);
      if (own2) return own2;
    }
    if (item.ParentBackdropItemId && parentTag) return imageUrlFor(item.ParentBackdropItemId, { ...opts, tag: parentTag });
    if (item.Type === "Episode" && item.SeriesId) return imageUrlFor(item.SeriesId, opts);
    return imageUrl(item, opts) || landscapeImage(item, { maxWidth: opts.maxWidth, quality: 80 });
  }
  function labels(item) {
    if (item.Type === "Episode") {
      const parts = [];
      if (item.ParentIndexNumber != null) parts.push(`S${item.ParentIndexNumber}`);
      if (item.IndexNumber != null) parts.push(`F${item.IndexNumber}`);
      if (item.Name) parts.push(item.Name);
      return { title: item.SeriesName || item.Name || "", sub: item.SeriesName ? parts.join(" \xB7 ") : "" };
    }
    return { title: item.Name || "", sub: "" };
  }
  function div(cls, text) {
    const d = document.createElement("div");
    d.className = cls;
    if (text) d.textContent = text;
    return d;
  }
  function fill(item) {
    const url = backdropUrl(item);
    let bg = el.querySelector(".lfx-startcover__bg");
    if (!bg || bg.dataset.src !== (url || "")) {
      if (bg) bg.remove();
      bg = div("lfx-startcover__bg");
      bg.dataset.src = url || "";
      if (url) {
        const img = new Image();
        img.alt = "";
        img.decoding = "async";
        img.addEventListener("load", () => bg.classList.add("is-loaded"));
        img.addEventListener("error", () => img.remove());
        img.src = url;
        bg.append(img);
        if (img.complete && img.naturalWidth > 0) bg.classList.add("is-loaded");
      }
      el.prepend(bg);
    }
    el.querySelector(".lfx-startcover__text")?.remove();
    const { title, sub } = labels(item);
    const text = div("lfx-startcover__text");
    if (title) text.append(div("lfx-startcover__title", title));
    if (sub) text.append(div("lfx-startcover__sub", sub));
    el.append(text);
  }
  function videoPlaying() {
    if (!document.querySelector(PAGE)) return false;
    const v = document.querySelector("video.htmlvideoplayer");
    if (!v) return false;
    return !v.paused && v.currentTime > 0 || v.readyState >= 2;
  }
  function check() {
    raf = 0;
    if (!el) return;
    if (document.querySelector(".dialogContainer .dialog.opened")) {
      hide();
      return;
    }
    const path = routePath();
    if (path !== "/video" && path !== origin && !(allowed && allowed.has(path))) {
      hide();
      return;
    }
    if (videoPlaying()) hide();
  }
  function schedule() {
    if (raf || !el) return;
    raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame(check) : setTimeout(check, 0);
  }
  function onKeydown(e) {
    if (e.key !== "Escape" && e.key !== "BrowserBack") return;
    e.stopPropagation();
    e.preventDefault();
    hide();
  }
  function watch(on) {
    if (on === watching) return;
    watching = on;
    const fn = on ? "addEventListener" : "removeEventListener";
    window[fn]("popstate", schedule);
    window[fn]("hashchange", schedule);
    document[fn]("playing", schedule, true);
    document[fn]("timeupdate", schedule, true);
    document[fn]("loadeddata", schedule, true);
    document[fn]("keydown", onKeydown, true);
    if (on) {
      mo = new MutationObserver(schedule);
      mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    } else {
      if (mo) mo.disconnect();
      mo = null;
      if (raf) {
        if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
        clearTimeout(raf);
      }
      raf = 0;
    }
  }
  function cleanup() {
    clearTimeout(safety);
    clearTimeout(leaving);
    safety = 0;
    leaving = 0;
    watch(false);
    document.documentElement.classList.remove(ON_CLASS);
    unmountPoint(ID2);
    el = null;
    itemId = null;
    origin = null;
    allowed = null;
  }
  var ON_CLASS = "lfx-startcover-on";
  function show({ item } = {}) {
    if (!item || !item.Id || !isActive()) return;
    clearTimeout(leaving);
    leaving = 0;
    if (!el) {
      el = mountPoint(ID2, { className: "lfx-startcover" });
      el.setAttribute("role", "status");
      el.setAttribute("aria-label", "Wiedergabe wird geladen");
      el.append(div("lfx-startcover__spinner"));
      origin = routePath();
      allowed = /* @__PURE__ */ new Set();
      itemId = null;
    }
    el.classList.remove("is-leaving");
    document.documentElement.classList.add(ON_CLASS);
    watch(true);
    if (itemId !== item.Id) {
      itemId = item.Id;
      fill(item);
    }
    clearTimeout(safety);
    safety = setTimeout(hide, SAFETY_MS);
  }
  function allowRoute(path) {
    if (allowed) allowed.add(path);
  }
  function hide() {
    if (!el) return;
    const node = el;
    clearTimeout(safety);
    safety = 0;
    watch(false);
    document.documentElement.classList.remove(ON_CLASS);
    node.classList.add("is-leaving");
    leaving = setTimeout(() => {
      if (el === node) cleanup();
    }, FADE_MS);
  }

  // src/js/core/playback.js
  function isVisible(el4) {
    return el4.getClientRects().length > 0;
  }
  function findProxyContainer() {
    const all = [...document.querySelectorAll(".itemsContainer")].filter((c) => c.querySelector(".card"));
    return all.find(isVisible) || all[0] || null;
  }
  function buildProxy(item, resume) {
    const el4 = document.createElement("div");
    el4.className = "itemAction lfx-proxy";
    el4.style.display = "none";
    el4.setAttribute("data-action", resume ? "resume" : "play");
    el4.setAttribute("data-id", item.Id);
    el4.setAttribute("data-serverid", item.ServerId || getAuth().serverId || "");
    el4.setAttribute("data-type", item.Type || "");
    el4.setAttribute("data-mediatype", item.MediaType || "");
    el4.setAttribute("data-isfolder", String(Boolean(item.IsFolder)));
    const ticks = resume && item.UserData ? item.UserData.PlaybackPositionTicks || 0 : 0;
    if (ticks) el4.setAttribute("data-positionticks", String(ticks));
    return el4;
  }
  function playViaDetails(item, resume, timeoutMs) {
    return new Promise((resolve2) => {
      const serverId = item.ServerId || getAuth().serverId || "";
      window.location.hash = `#/details?id=${item.Id}&serverId=${serverId}`;
      const started2 = Date.now();
      const timer2 = setInterval(() => {
        const wrap = document.querySelector(".itemDetailPage:not(.hide) .mainDetailButtons");
        const visible = (sel) => wrap && [...wrap.querySelectorAll(sel)].find((b) => !b.classList.contains("hide"));
        const target = resume ? visible(".btnPlay") : visible(".btnReplay") || visible(".btnPlay");
        if (target) {
          clearInterval(timer2);
          target.click();
          resolve2(true);
        } else if (Date.now() - started2 > timeoutMs) {
          clearInterval(timer2);
          resolve2(false);
        }
      }, 150);
    });
  }
  async function play(item, { resume = false, timeoutMs = 8e3 } = {}) {
    if (!item || !item.Id) return false;
    window.dispatchEvent(new CustomEvent("lfx:play", { detail: { id: item.Id } }));
    show({ item });
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
    allowRoute("/details");
    const ok = await playViaDetails(item, resume, timeoutMs);
    if (!ok) hide();
    return ok;
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
  function scrolledAncestor(target, el4) {
    let n = target && target.nodeType === 1 ? target : target && target.parentElement;
    while (n) {
      if (n.scrollTop > 0) return true;
      if (n === el4) break;
      n = n.parentElement;
    }
    return false;
  }
  function attachSwipeClose(el4, opts = {}) {
    const onClose = opts.onClose;
    const handleZone = opts.handleZone ?? 32;
    const canStart = opts.canStart || (() => true);
    const threshold = opts.threshold ?? 0.3;
    const velocity = opts.velocity ?? 0.5;
    const backdrop = opts.backdrop || null;
    const holdBackdrop = Boolean(opts.holdBackdrop);
    const reduced = opts.reducedMotion || defaultReducedMotion;
    const now = () => Date.now();
    let state21 = "idle";
    let startX = 0;
    let startY = 0;
    let dy = 0;
    let samples = [];
    let timer2 = 0;
    let detached = false;
    let finishFn = null;
    const height = () => el4.offsetHeight || el4.getBoundingClientRect().height || 0;
    function clearTimer() {
      if (timer2) clearTimeout(timer2);
      timer2 = 0;
    }
    function resetStyles() {
      el4.classList.remove("lfx-dragging");
      el4.style.removeProperty("transform");
      el4.style.removeProperty("transition");
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
        el4.removeEventListener("transitionend", onEnd2);
        finishFn = null;
        fn();
      };
      const onEnd2 = (e) => {
        if (e.target === el4) finish3();
      };
      finishFn = () => {
        done = true;
        el4.removeEventListener("transitionend", onEnd2);
      };
      el4.addEventListener("transitionend", onEnd2);
      timer2 = setTimeout(finish3, ms);
    }
    function setBackdrop(v, animate) {
      if (!backdrop) return;
      backdrop.style.transition = animate ? "opacity 180ms linear" : "none";
      backdrop.style.opacity = String(v);
    }
    function close2() {
      state21 = "closing";
      if (reduced()) {
        onClose();
        return;
      }
      el4.style.transition = ANIM;
      el4.style.transform = "translateY(100%)";
      if (!holdBackdrop) setBackdrop(0.3, true);
      animateThen(250, () => onClose());
    }
    function springBack() {
      state21 = "closing";
      el4.style.transition = ANIM;
      el4.style.transform = "translateY(0px)";
      setBackdrop(1, true);
      animateThen(250, () => {
        resetStyles();
        state21 = "idle";
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
      if (state21 === "closing") return;
      state21 = "idle";
      const touches = e.touches || [];
      if (touches.length !== 1) {
        state21 = "ignored";
        return;
      }
      const t = touches[0];
      const rect = el4.getBoundingClientRect();
      const inHandle = t.clientY - rect.top <= handleZone;
      if (!inHandle && scrolledAncestor(e.target, el4)) {
        state21 = "ignored";
        return;
      }
      if (!canStart(e)) {
        state21 = "ignored";
        return;
      }
      state21 = "tracking";
      startX = t.clientX;
      startY = t.clientY;
      dy = 0;
      samples = [{ t: now(), y: startY }];
    }
    function onMove2(e) {
      if (state21 !== "tracking" && state21 !== "dragging") return;
      const touches = e.touches || [];
      if (touches.length !== 1) {
        if (state21 === "dragging") springBack();
        else state21 = "ignored";
        return;
      }
      const t = touches[0];
      const mx = t.clientX - startX;
      const my = t.clientY - startY;
      if (state21 === "tracking") {
        if (Math.hypot(mx, my) < DECIDE_PX) return;
        if (my > 0 && my > Math.abs(mx)) {
          state21 = "dragging";
          el4.classList.add("lfx-dragging");
          el4.style.transition = "none";
        } else {
          state21 = "ignored";
          return;
        }
      }
      if (e.cancelable) e.preventDefault();
      dy = Math.max(0, my);
      const ts = now();
      samples.push({ t: ts, y: t.clientY });
      while (samples.length > 2 && ts - samples[0].t > SAMPLE_MS) samples.shift();
      el4.style.transform = `translateY(${dy}px)`;
      const h2 = height() || 300;
      setBackdrop(1 - 0.7 * Math.min(1, dy / h2), false);
    }
    function onEnd() {
      if (state21 === "dragging") {
        const h2 = height();
        const far = h2 > 0 ? dy > threshold * h2 : dy > FALLBACK_PX;
        if (far || velocityNow() > velocity) close2();
        else springBack();
      } else if (state21 !== "closing") {
        state21 = "idle";
      }
    }
    function onCancel() {
      if (state21 === "dragging") springBack();
      else if (state21 !== "closing") state21 = "idle";
    }
    el4.addEventListener("touchstart", onStart, { passive: true });
    el4.addEventListener("touchmove", onMove2, { passive: false });
    el4.addEventListener("touchend", onEnd);
    el4.addEventListener("touchcancel", onCancel);
    return function detach() {
      if (detached) return;
      detached = true;
      clearTimer();
      if (finishFn) finishFn();
      el4.removeEventListener("touchstart", onStart);
      el4.removeEventListener("touchmove", onMove2);
      el4.removeEventListener("touchend", onEnd);
      el4.removeEventListener("touchcancel", onCancel);
      resetStyles();
      state21 = "idle";
    };
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
    const root7 = document.documentElement;
    root7.classList.remove("lfx-menu-open");
    root7.style.removeProperty("--lfx-menu-x");
    root7.style.removeProperty("--lfx-menu-y");
  }
  function setPosition(pos) {
    const root7 = document.documentElement;
    root7.style.setProperty("--lfx-menu-x", `${Math.round(pos.x)}px`);
    root7.style.setProperty("--lfx-menu-y", `${Math.round(pos.y)}px`);
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
      (el4) => !HIDDEN_FIRST.includes(el4.getAttribute("data-id")) && !el4.hidden && el4.style.display !== "none"
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
    const el4 = document.createElement("div");
    el4.className = "lfx-proxy itemAction";
    el4.setAttribute("data-action", "menu");
    el4.setAttribute("data-id", item.Id);
    el4.setAttribute("data-serverid", item.ServerId || getAuth().serverId || "");
    el4.setAttribute("data-type", item.Type || "");
    el4.setAttribute("data-isfolder", String(isFolder));
    el4.setAttribute("data-mediatype", item.MediaType || (isFolder ? "" : "Video"));
    return el4;
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

  // src/js/core/homecache.js
  var stop = null;
  function initHomeCache() {
    if (stop) return;
    const drop2 = () => clearCache("home:");
    const inPlayer = () => parseHash(window.location.hash).path.startsWith("/video");
    let wasPlayer = inPlayer();
    let uid = getUserId();
    const onRoute2 = () => {
      const now = inPlayer();
      if (now && !wasPlayer) drop2();
      wasPlayer = now;
      const u = getUserId();
      if (u !== uid) {
        uid = u;
        drop2();
      }
    };
    window.addEventListener("lfx:play", drop2);
    window.addEventListener("hashchange", onRoute2);
    window.addEventListener("popstate", onRoute2);
    document.addEventListener("viewshow", onRoute2);
    const off = onItemsChanged(drop2);
    stop = () => {
      window.removeEventListener("lfx:play", drop2);
      window.removeEventListener("hashchange", onRoute2);
      window.removeEventListener("popstate", onRoute2);
      document.removeEventListener("viewshow", onRoute2);
      off();
      stop = null;
    };
  }
  function destroyHomeCache() {
    if (stop) stop();
  }

  // src/js/core/datasaver.js
  var KEY = "lfx.datasaver.";
  var DATASAVER_EVENT = "lfx:datasaver";
  var DATASAVER_CLASS = "lfx-datasaver";
  var DATASAVER_THEMES = ["flix", "plus", "prime"];
  var DATASAVER_SCALE = 2 / 3;
  var active = false;
  var lastUid2;
  var offTheme = null;
  var storageKey = () => `${KEY}${getUserId() || "anon"}`;
  function isDataSaverOn() {
    try {
      return window.localStorage.getItem(storageKey()) === "1";
    } catch {
      return false;
    }
  }
  function dataSaverAvailable() {
    return DATASAVER_THEMES.includes(getTheme());
  }
  function isDataSaver() {
    return dataSaverAvailable() && isDataSaverOn();
  }
  function apply() {
    const next = isDataSaver();
    document.documentElement.classList.toggle(DATASAVER_CLASS, next);
    setImageScale(next ? DATASAVER_SCALE : 1);
    if (next === active) return;
    active = next;
    window.dispatchEvent(new CustomEvent(DATASAVER_EVENT, { detail: { active } }));
  }
  function setDataSaver(on) {
    try {
      window.localStorage.setItem(storageKey(), on ? "1" : "0");
    } catch {
    }
    apply();
    return isDataSaverOn();
  }
  function onDataSaverChange(cb) {
    const fn = (e) => cb(!!(e && e.detail && e.detail.active));
    window.addEventListener(DATASAVER_EVENT, fn);
    return () => window.removeEventListener(DATASAVER_EVENT, fn);
  }
  function syncDataSaver() {
    if (!offTheme) offTheme = onThemeChange(() => apply());
    const uid = getUserId() || null;
    if (uid !== lastUid2) {
      lastUid2 = uid;
      apply();
    }
  }
  function destroyDataSaver() {
    if (offTheme) offTheme();
    offTheme = null;
    lastUid2 = void 0;
    active = false;
    document.documentElement.classList.remove(DATASAVER_CLASS);
    setImageScale(1);
  }

  // src/js/shared/routes.js
  var enc = encodeURIComponent;
  var titleHref = (id) => `#/home?lfx=title&id=${enc(id)}`;
  var hubHref = (libId) => `#/home?lfx=hub&lib=${enc(libId)}`;
  var browseHref = (libId, genreId) => `#/home?lfx=browse&lib=${enc(libId)}${genreId ? `&genre=${enc(genreId)}` : ""}`;
  var searchHref = (q) => `#/home?lfx=search${q ? `&q=${enc(q)}` : ""}`;
  var KINDS = ["title", "hub", "browse", "search", "new", "tv"];
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
  var tvModeHref = "#/home?lfx=tv";
  var isTvModeRoute = (route) => parseLfxRoute(route).kind === "tv";

  // src/js/features/themeroute.js
  var REDIRECT_KINDS = ["title", "hub", "browse", "search"];
  var STORE_REDIRECT_KINDS = ["hub", "browse"];
  var tvModeUnavailable = () => isTheme("retro") || isTheme("store") || isTheme("live") || isTv();
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
  function replaceTo(hash2) {
    const { pathname, search } = window.location;
    window.location.replace(`${pathname}${search}${hash2}`);
  }
  function toLibrary(lib, key, mine) {
    const stillHere = () => mine === seq2 && window.location.hash.replace(/^#!?/, "") === key.replace(/^#!?/, "");
    const home = isTheme("store") ? "#/home?lfx=classic" : "#/home";
    Promise.resolve().then(() => getViews()).then((views) => {
      const items = views && views.Items || [];
      const v = items.find((x) => x.Id === lib);
      return v ? libraryUrl(v.Id, v.CollectionType) : home;
    }).catch(() => `#/list?parentId=${encodeURIComponent(lib)}`).then((hash2) => {
      if (stillHere()) replaceTo(hash2);
    });
  }
  function redirect(route) {
    const r = parseLfxRoute(route);
    const store3 = isTheme("store");
    const home = store3 ? "#/home?lfx=classic" : "#/home";
    const key = route.hash;
    if (key === lastKey) return;
    lastKey = key;
    const mine = ++seq2;
    if (r.kind === "tv") {
      replaceTo("#/home");
    } else if (r.kind === "title") {
      if (!r.id) return replaceTo("#/home");
      const { serverId } = getAuth();
      replaceTo(`#/details?id=${encodeURIComponent(r.id)}${serverId ? `&serverId=${encodeURIComponent(serverId)}` : ""}`);
    } else if (r.kind === "hub") {
      if (store3 && r.lib) return toLibrary(r.lib, key, mine);
      replaceTo(home);
    } else if (r.kind === "search") {
      replaceTo(r.q ? `#/search?query=${encodeURIComponent(r.q)}` : "#/search");
    } else if (r.kind === "browse") {
      if (!r.lib) return replaceTo(home);
      toLibrary(r.lib, key, mine);
    }
  }
  var themeroute = {
    name: "themeroute",
    match: (route) => {
      const kind2 = parseLfxRoute(route).kind;
      if (kind2 === "tv") return tvModeUnavailable();
      return isTheme("flix") && REDIRECT_KINDS.includes(kind2) || isTheme("store") && STORE_REDIRECT_KINDS.includes(kind2);
    },
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

  // src/js/features/rows/logic.js
  var NEW_DAYS = 14;
  var DAY_MS = 864e5;
  var ITEM_FIELDS = [
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
    Fields: ITEM_FIELDS,
    EnableUserData: true,
    ImageTypeLimit: 1,
    EnableImageTypes: "Primary,Backdrop,Thumb,Logo"
  };
  var NEW_EPISODE_AIRED_DAYS = 365;
  function newSeriesIdsFrom(episodes, now = Date.now()) {
    const ids = /* @__PURE__ */ new Set();
    for (const e of episodes || []) {
      if (!e || !e.SeriesId) continue;
      if (!isRecent(e.DateCreated, now, NEW_DAYS)) continue;
      if (!isRecent(e.PremiereDate, now, NEW_EPISODE_AIRED_DAYS)) continue;
      ids.add(e.SeriesId);
    }
    return ids;
  }
  function isRecent(dateStr, now = Date.now(), days = NEW_DAYS) {
    const t = Date.parse(dateStr);
    if (Number.isNaN(t)) return false;
    return now - t < days * DAY_MS;
  }
  function badgeFor(item, newSeriesIds, now = Date.now()) {
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
  function progressPercent(item) {
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

  // src/js/core/charts.js
  var TIMEOUT_MS = 3e3;
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
    const timer2 = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
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
      if (timer2) clearTimeout(timer2);
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

  // src/js/core/dayseed.js
  function dayKey2(date = /* @__PURE__ */ new Date()) {
    const p = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
  }
  function hashString2(str) {
    let h2 = 2166136261;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h2 ^= s.charCodeAt(i);
      h2 = Math.imul(h2, 16777619);
    }
    return h2 >>> 0;
  }
  function seededRandom(seed) {
    let a = hashString2(seed);
    return () => {
      a = a + 1831565813 >>> 0;
      let t = a;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function seededShuffle2(list, seed) {
    const out = Array.isArray(list) ? list.slice() : [];
    const rnd = seededRandom(seed);
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // src/js/core/themepicker.js
  var ID3 = "lfx-themepicker";
  var BETA = /* @__PURE__ */ new Set(["retro", "store", "live"]);
  var STORE_ROWS = [7, 6];
  var STORE_COVERS = STORE_ROWS.reduce((a, b) => a + b, 0);
  var COVER_TTL_MS = 6 * 60 * 60 * 1e3;
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
    const root7 = span(`lfx-tp__preview lfx-tp__preview--${id}`);
    root7.setAttribute("aria-hidden", "true");
    if (id === "plus") {
      root7.append(
        span("lfx-tp__bar", [span("lfx-tp__dot"), span("lfx-tp__dot"), span("lfx-tp__dot"), span("lfx-tp__dot")]),
        span("lfx-tp__hero lfx-tp__hero--side lfx-tp__hero--l"),
        span("lfx-tp__hero"),
        span("lfx-tp__hero lfx-tp__hero--side lfx-tp__hero--r"),
        span("lfx-tp__pager", [span("lfx-tp__pdot is-on"), span("lfx-tp__pdot"), span("lfx-tp__pdot")]),
        span("lfx-tp__row", tiles(5))
      );
    } else if (id === "prime") {
      root7.append(
        span("lfx-tp__hero", [span("lfx-tp__line"), span("lfx-tp__line lfx-tp__line--s"), span("lfx-tp__btn")]),
        span("lfx-tp__row", tiles(4).map((t) => {
          t.append(span("lfx-tp__badge-mini"));
          return t;
        }))
      );
    } else if (id === "retro") {
      root7.append(span("lfx-tp__sun"), span("lfx-tp__grid"), span("lfx-tp__scan"));
    } else if (id === "store") {
      let k = 0;
      const shelf = (n) => span("lfx-tp__shelf", Array.from({ length: n }, () => span(`lfx-tp__cover lfx-tp__cover--${k++ % 6}`)));
      root7.append(span("lfx-tp__shopsign", ["VIDEOTHEK LENZ"]), ...STORE_ROWS.map(shelf), span("lfx-tp__carpet"));
    } else if (id === "live") {
      const keys = Array.from({ length: 9 }, () => span("lfx-tp__rkey"));
      const colors = ["r", "g", "y", "b"].map((c) => span(`lfx-tp__rcol lfx-tp__rcol--${c}`));
      root7.append(
        span("lfx-tp__tv", [span("lfx-tp__screen", [span("lfx-tp__roll"), span("lfx-tp__chno", ["5"]), span("lfx-tp__rec")]), span("lfx-tp__ant")]),
        span("lfx-tp__remote", [
          span("lfx-tp__rtop", [span("lfx-tp__rled"), span("lfx-tp__rpower")]),
          span("lfx-tp__rkeys", keys),
          span("lfx-tp__rpad", [span("lfx-tp__rok")]),
          span("lfx-tp__rcols", colors)
        ])
      );
    } else {
      root7.append(span("lfx-tp__logo"), span("lfx-tp__hero"), span("lfx-tp__row", tiles(4)));
    }
    return root7;
  }
  function buildMark(id, name) {
    if (id === "plus") {
      return span("lfx-tp__mark lfx-tp__mark--plus", [span("lfx-tp__mark-text", ["LENZ"]), span("lfx-tp__mark-plus", ["+"])]);
    }
    if (id === "prime") {
      return span("lfx-tp__mark lfx-tp__mark--prime", [span("lfx-tp__mark-text", ["lenzprime"])]);
    }
    if (id === "retro") {
      return span("lfx-tp__mark lfx-tp__mark--retro", [name]);
    }
    if (id === "store") {
      return span("lfx-tp__mark lfx-tp__mark--store", [span("lfx-tp__mark-store-a", ["VIDEOTHEK"]), span("lfx-tp__mark-store-b", ["LENZ"])]);
    }
    if (id === "live") {
      return span("lfx-tp__mark lfx-tp__mark--live", [span("lfx-tp__mark-live-a", ["LENZ"]), span("lfx-tp__mark-live-b", [span("lfx-tp__mark-live-dot"), "LIVE"])]);
    }
    return span("lfx-tp__mark lfx-tp__mark--flix", [name]);
  }
  var normId2 = (id) => String(id || "").replace(/-/g, "").toLowerCase();
  function chartIds(charts) {
    if (!charts) return [];
    const movies = Array.isArray(charts.movies) ? charts.movies : [];
    const series = Array.isArray(charts.series) ? charts.series : [];
    const out = [];
    for (let i = 0; out.length < 20 && (i < movies.length || i < series.length); i++) {
      for (const e of [movies[i], series[i]]) if (e && e.id && out.length < 20) out.push(String(e.id));
    }
    return out;
  }
  var itemList = (res) => Array.isArray(res) ? res : res && Array.isArray(res.Items) ? res.Items : [];
  function coverUrls(items) {
    const out = [];
    for (const it of items) {
      const tag = it && it.Id && it.ImageTags && it.ImageTags.Primary;
      if (!tag) continue;
      const url = imageUrlFor(it.Id, { maxWidth: 160, quality: 80, tag });
      if (url) out.push(url);
    }
    return out;
  }
  async function loadCoverUrls(day) {
    const want = STORE_COVERS;
    const urls = [];
    const used = /* @__PURE__ */ new Set();
    const take = (items) => {
      for (const it of items) {
        if (urls.length >= want) return;
        const key = normId2(it && it.Id);
        if (!key || used.has(key)) continue;
        const u = coverUrls([it]);
        if (!u.length) continue;
        used.add(key);
        urls.push(u[0]);
      }
    };
    const charts = await getCharts().catch(() => null);
    const ids = seededShuffle2(chartIds(charts), `${day}:charts`);
    if (ids.length) {
      try {
        const res = await getItems({ Ids: ids.join(","), IncludeItemTypes: "Movie,Series", Fields: "ImageTags", EnableImageTypes: "Primary", ImageTypeLimit: 1 });
        const byId = new Map(itemList(res).filter((i) => i && i.Id).map((i) => [normId2(i.Id), i]));
        take(ids.map((id) => byId.get(normId2(id))).filter(Boolean));
      } catch {
      }
    }
    if (urls.length < want) {
      try {
        const res = await getItems({
          IncludeItemTypes: "Movie,Series",
          Recursive: true,
          SortBy: "DateCreated",
          SortOrder: "Descending",
          Limit: 30,
          Fields: "ImageTags",
          EnableImageTypes: "Primary",
          ImageTypeLimit: 1
        });
        take(seededShuffle2(itemList(res), `${day}:latest`));
      } catch {
      }
    }
    return urls;
  }
  function loadStoreCoverUrls() {
    try {
      if (!isReady()) return Promise.resolve([]);
      const day = dayKey2();
      const key = `tp-store-covers:${getUserId()}:${day}`;
      return cached(key, () => loadCoverUrls(day), COVER_TTL_MS).then((urls) => {
        if (!urls.length) clearCache(key);
        return urls;
      }, () => []);
    } catch {
      return Promise.resolve([]);
    }
  }
  function fillStoreCovers(c) {
    const card3 = c.cards.get("store");
    if (!card3) return;
    loadStoreCoverUrls().then((urls) => {
      if (current !== c || !card3.isConnected) return;
      const covers = card3.querySelectorAll(".lfx-tp__cover");
      urls.slice(0, covers.length).forEach((url, i) => {
        const img = document.createElement("img");
        img.className = "lfx-tp__coverimg";
        img.alt = "";
        img.decoding = "async";
        img.draggable = false;
        img.addEventListener("load", () => img.classList.add("is-in"));
        img.addEventListener("error", () => img.remove());
        img.src = url;
        covers[i].append(img);
      });
    }).catch(() => {
    });
  }
  function buildCard(c, id) {
    const meta2 = THEME_META[id] || { id, name: id, tagline: "", palette: [] };
    const btn3 = h("button", {
      type: "button",
      class: `lfx-tp__card lfx-tp__card--${id}`,
      "aria-pressed": "false",
      dataset: { theme: id }
    }, [
      buildPreview(id),
      span("lfx-tp__info", [
        buildMark(id, meta2.name),
        span("lfx-tp__tagline", [meta2.tagline || ""]),
        span("lfx-tp__palette", (meta2.palette || []).map((hex) => h("span", { class: "lfx-tp__swatch", style: { background: hex } })))
      ]),
      span("lfx-tp__state", [span("lfx-tp__active", ["Aktiv"]), span("lfx-tp__spin")]),
      BETA.has(id) ? span("lfx-tp__beta", ["Beta"]) : null
    ]);
    btn3.setAttribute("aria-label", `${meta2.name}${BETA.has(id) ? " (Beta)" : ""}${meta2.tagline ? `, ${meta2.tagline}` : ""}`);
    btn3.addEventListener("click", () => choose(c, id));
    return btn3;
  }
  function refresh(c) {
    const chosen2 = getChosenTheme();
    for (const [id, btn3] of c.cards) {
      const on = id === chosen2;
      btn3.setAttribute("aria-pressed", String(on));
      btn3.classList.toggle("is-active", on);
      const busy2 = c.loading === id;
      if (busy2) btn3.setAttribute("aria-busy", "true");
      else btn3.removeAttribute("aria-busy");
      btn3.classList.toggle("is-loading", busy2);
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
    const ok = () => {
      done();
      if (current === c && getChosenTheme() === id) closeThemePicker();
    };
    p.then(ok, done);
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
    const overlay = mountPoint(ID3, { className: `lfx-tp${sheet ? " lfx-tp--sheet" : ""}` });
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
    const grid2 = h("div", { class: "lfx-tp__grid" });
    for (const id of THEMES) {
      const card3 = buildCard(c, id);
      c.cards.set(id, card3);
      grid2.append(card3);
    }
    dialog.append(grid2);
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
      const active5 = document.activeElement;
      if (!dialog.contains(active5) || active5 === dialog) {
        e.preventDefault();
        (e.shiftKey ? last : first2).focus();
      } else if (e.shiftKey && active5 === first2) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active5 === last) {
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
    fillStoreCovers(c);
    const activeCard = c.cards.get(getChosenTheme()) || grid2.querySelector("button");
    if (activeCard) activeCard.focus({ preventScroll: true });
    const raf3 = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
    raf3(() => {
      if (current === c) overlay.classList.add("is-open");
    });
    return c;
  }

  // src/js/core/ambient.js
  var ID4 = "lfx-ambient";
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
    return mountPoint(ID4, { before: document.body.firstChild, className: "lfx-ambient" });
  }
  function unmountAmbient() {
    unmountPoint(ID4);
    resetAmbient();
  }

  // src/js/core/switch.js
  var switchVisual = () => h("span", { class: "lfx-switch", "aria-hidden": "true" }, [h("span", { class: "lfx-switch__knob" })]);
  function setSwitchState(btn3, on) {
    btn3.classList.toggle("is-on", Boolean(on));
    btn3.setAttribute("aria-checked", String(Boolean(on)));
  }
  function bindSwitch(btn3, item) {
    setSwitchState(btn3, item.checked);
    btn3.addEventListener("click", () => {
      const next = btn3.getAttribute("aria-checked") !== "true";
      setSwitchState(btn3, next);
      if (typeof item.onToggle === "function") item.onToggle(next);
    });
    if (typeof item.watch === "function") {
      const off = item.watch((on) => {
        if (!btn3.isConnected) off();
        else setSwitchState(btn3, on);
      });
    }
    return btn3;
  }
  function switchButton(item, { className, role = "menuitemcheckbox", labelClass } = {}) {
    const btn3 = h("button", { type: "button", class: className, role, "aria-label": item.label, dataset: { key: item.key || "" } }, [
      labelClass ? h("span", { class: labelClass }, item.label) : item.label,
      switchVisual()
    ]);
    return bindSwitch(btn3, item);
  }

  // src/js/shared/dsswitch.js
  var dataSaverItem = () => ({
    key: "datasaver",
    label: "Datensparmodus",
    switch: true,
    checked: isDataSaverOn(),
    onToggle: (next) => setDataSaver(next),
    watch: (cb) => onDataSaverChange(() => cb(isDataSaverOn()))
  });

  // src/js/features/nav.js
  var { STATS_LABEL: STATS_LABEL2 } = stats_exports;
  var statsLink = () => typeof statsHref === "function" ? statsHref() : getStatsUrl();
  var NAV_ID = "lfx-nav";
  var EXCLUDED = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video|dashboard|queue)/;
  var SCROLL_THRESHOLD = 10;
  var FOLD_ORDER = ["list", "new", "movies", "series"];
  var MENU_ORDER = ["series", "movies", "new", "list"];
  var FOLD_GAP = 16;
  var FOLD_RESERVE = 180;
  var TOOLBAR_SEL = "header.MuiAppBar-root > .MuiToolbar-root:first-child";
  var RIGHT_SEL = `${TOOLBAR_SEL} .MuiIconButton-root, ${TOOLBAR_SEL} a[href="#/search"], ${TOOLBAR_SEL} button[aria-haspopup], .lfx-tvbtn, .lfx-dsbtn`;
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
      if (params.get("lfx") === "tv") return "tv";
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
    seq: 0,
    raf: 0,
    watch: [],
    toolbar: null
  };
  function setMenu(open2) {
    state2.menuOpen = open2;
    const wrap = state2.nav && state2.nav.querySelector(".lfx-nav__more");
    if (!wrap) return;
    wrap.classList.toggle("is-open", open2);
    const btn3 = wrap.querySelector(".lfx-nav__more-btn");
    if (btn3) btn3.setAttribute("aria-expanded", String(open2));
  }
  function applyActive() {
    if (!state2.nav || !state2.route) return;
    const key = activeKey(state2.route, state2.model);
    for (const el4 of state2.nav.querySelectorAll("[data-key]")) {
      const on = el4.dataset.key === key;
      el4.classList.toggle("is-active", on);
      if (el4.tagName === "A") {
        if (on) el4.setAttribute("aria-current", "page");
        else el4.removeAttribute("aria-current");
      }
    }
    if (key && state2.nav.querySelector(`.lfx-nav__item[data-key="${key}"][hidden]`)) {
      state2.nav.querySelector(".lfx-nav__more-btn").classList.add("is-active");
    }
  }
  function rightLimit(navLeft) {
    let min = window.innerWidth - FOLD_RESERVE + FOLD_GAP;
    for (const el4 of document.querySelectorAll(RIGHT_SEL)) {
      const r = el4.getBoundingClientRect();
      if (r.width > 0 && r.left > navLeft && r.left < min) min = r.left;
    }
    return min - FOLD_GAP;
  }
  function fit() {
    const nav = state2.nav;
    const wrap = nav && nav.querySelector(".lfx-nav__more");
    if (!wrap) return;
    const items = FOLD_ORDER.map((k) => nav.querySelector(`.lfx-nav__item[data-key="${k}"]`)).filter(Boolean);
    const fold = (n2) => {
      const off = new Set(items.slice(0, n2).map((el4) => el4.dataset.key));
      for (const el4 of items) el4.hidden = off.has(el4.dataset.key);
      for (const el4 of nav.querySelectorAll(".lfx-nav__menu-item--fold")) el4.hidden = !off.has(el4.dataset.key);
    };
    fold(0);
    let n = 0;
    if (!isNavCompact()) {
      const limit = rightLimit(nav.getBoundingClientRect().left);
      while (n < items.length && wrap.getBoundingClientRect().right > limit) fold(++n);
    }
    const moreBtn = wrap.querySelector(".lfx-nav__more-btn");
    if (moreBtn) moreBtn.classList.toggle("has-fold", n > 0);
    applyActive();
  }
  function scheduleFit() {
    if (state2.raf || !state2.nav) return;
    state2.raf = requestAnimationFrame(() => {
      state2.raf = 0;
      fit();
    });
  }
  function unwatch() {
    for (const o of state2.watch.splice(0)) o.disconnect();
    state2.toolbar = null;
  }
  function watchToolbar() {
    const tb = document.querySelector(TOOLBAR_SEL);
    if (tb === state2.toolbar) return;
    unwatch();
    state2.toolbar = tb;
    if (!tb) return;
    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(scheduleFit);
      ro.observe(tb);
      state2.watch.push(ro);
    }
    if (typeof MutationObserver === "function") {
      const mo3 = new MutationObserver(scheduleFit);
      mo3.observe(tb, { childList: true, subtree: true });
      state2.watch.push(mo3);
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
      const all = navItems(state2.model);
      const entries = MENU_ORDER.map((k) => all.find((it) => it.key === k)).filter(Boolean).map((it) => h("a", { class: "lfx-nav__menu-item lfx-nav__menu-item--fold", role: "menuitem", href: it.href, hidden: true, dataset: { key: it.key } }, it.label));
      for (const m of more) entries.push(h("a", { class: "lfx-nav__menu-item", role: "menuitem", href: m.href, dataset: { id: m.id } }, m.label));
      if (statsUrl) entries.push(h("a", { class: "lfx-nav__menu-item lfx-nav__menu-item--stats", role: "menuitem", href: statsUrl }, STATS_LABEL2));
      const designBtn = h("button", { type: "button", class: "lfx-nav__menu-item lfx-nav__menu-item--design", role: "menuitem", "aria-label": badgedName("Design Einstellungen", "Beta") }, ["Design Einstellungen", badgePill("Beta")]);
      entries.push(designBtn);
      const dsBtn = dataSaverAvailable() ? switchButton(dataSaverItem(), { className: "lfx-nav__menu-item lfx-nav__menu-item--datasaver" }) : null;
      if (dsBtn) entries.push(dsBtn);
      const menu = h("div", { class: "lfx-nav__menu", role: "menu", id: "lfx-nav-menu" }, entries);
      const btn3 = h("button", {
        type: "button",
        class: "lfx-nav__item lfx-nav__more-btn",
        "aria-haspopup": "true",
        "aria-expanded": "false",
        "aria-controls": "lfx-nav-menu",
        dataset: { key: "more" }
      }, ["Mehr", h("span", { class: "lfx-nav__caret", "aria-hidden": "true" })]);
      const wrap = h("div", { class: "lfx-nav__more" }, [btn3, menu]);
      btn3.addEventListener("click", () => setMenu(!state2.menuOpen));
      wrap.addEventListener("mouseenter", () => setMenu(true));
      wrap.addEventListener("mouseleave", () => setMenu(false));
      wrap.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          setMenu(false);
          btn3.focus();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          const items = [...menu.querySelectorAll('[role="menuitem"]:not([hidden]), [role="menuitemcheckbox"]')];
          const i = items.indexOf(document.activeElement);
          const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
          setMenu(true);
          items[next].focus();
          e.preventDefault();
        }
      });
      menu.addEventListener("click", (e) => {
        if (!(dsBtn && dsBtn.contains(e.target))) setMenu(false);
      });
      designBtn.addEventListener("click", () => {
        setMenu(false);
        openThemePicker({ returnFocus: btn3 });
      });
      nav.append(wrap);
      if (state2.menuOpen) setMenu(true);
    }
    fit();
  }
  function onScroll() {
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const root7 = document.documentElement;
    const on = y > SCROLL_THRESHOLD;
    if (root7.classList.contains("lfx-scrolled") !== on) root7.classList.toggle("lfx-scrolled", on);
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
      window.addEventListener("resize", scheduleFit);
      state2.cleanups.push(() => window.removeEventListener("resize", scheduleFit));
      window.addEventListener(DATASAVER_EVENT, scheduleFit);
      state2.cleanups.push(() => window.removeEventListener(DATASAVER_EVENT, scheduleFit));
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleFit);
      watchToolbar();
      onScroll();
      loadViews(seq3);
    },
    update(route) {
      const changed = !state2.route || state2.route.hash !== route.hash;
      state2.route = route;
      if (changed) setMenu(false);
      applyActive();
      watchToolbar();
      scheduleFit();
    },
    unmount() {
      state2.seq++;
      for (const fn of state2.cleanups.splice(0)) fn();
      if (state2.raf) cancelAnimationFrame(state2.raf);
      state2.raf = 0;
      unwatch();
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
    items.push({ key: "design", label: "Design Einstellungen", badge: "Beta", action: "design" });
    if (dataSaverAvailable()) items.push({ key: "datasaver", label: "Datensparmodus", action: "datasaver" });
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
    for (const el4 of document.querySelectorAll(`#${ROOT_ID} [data-key], #${OVERLAY_ID} [data-key]`)) {
      if (el4.dataset.key === "cats") continue;
      const on = el4.dataset.key === key;
      el4.classList.toggle("is-active", on);
      if (el4.tagName === "A") {
        if (on) el4.setAttribute("aria-current", "page");
        else el4.removeAttribute("aria-current");
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
        it.action === "datasaver" ? switchButton(dataSaverItem(), { className: "lfx-mnav-overlay__link lfx-mnav-overlay__link--datasaver", role: "switch" }) : it.action ? h("button", { type: "button", class: `lfx-mnav-overlay__link lfx-mnav-overlay__link--${it.action}`, "aria-label": badgedName(it.label, it.badge), dataset: { action: it.action } }, [it.label, it.badge ? badgePill(it.badge) : null]) : (
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
      return isReady() && isModern() && !isTv() && isNavCompact() && isTheme("flix") && !EXCLUDED2.test(route.path);
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
        if (!t || t.dataset && t.dataset.key === "datasaver") return;
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
  var ICON_TVMODE = svg(
    '<path fill-rule="evenodd" d="M5 4h14a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-3.5l.8 2H17v2H7v-2h.7l.8-2H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3zm0 2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1z"/><circle cx="12" cy="11" r="2.2"/>'
  );
  var ICON_DATASAVER = svg('<path d="M5 3h14v2H5z"/><path d="M11 8h2v7.2l3.6-3.6 1.4 1.4-6 6-6-6 1.4-1.4 3.6 3.6z"/>');

  // src/js/features/tvbtn.js
  var ID5 = "lfx-tvm-btn";
  var el2 = null;
  var intent = () => window.dispatchEvent(new CustomEvent("lfx:tvmode-intent"));
  function applyActive3(route) {
    if (!el2) return;
    const on = isTvModeRoute(route);
    el2.classList.toggle("is-active", on);
    if (on) el2.setAttribute("aria-current", "page");
    else el2.removeAttribute("aria-current");
  }
  var tvbtnFeature = {
    name: "tvbtn",
    match(route) {
      return isReady() && isModern() && !isTv() && isTheme("flix") && !EXCLUDED.test(route.path);
    },
    mount(route) {
      el2 = mountPoint(ID5, { tag: "a", className: "lfx-tvbtn" });
      el2.href = tvModeHref;
      el2.setAttribute("aria-label", "TV");
      el2.title = "TV";
      el2.dataset.key = "tv";
      el2.innerHTML = ICON_TVMODE;
      el2.addEventListener("click", intent);
      document.documentElement.classList.add("lfx-tvbtn-on");
      applyActive3(route);
    },
    update(route) {
      applyActive3(route);
    },
    unmount() {
      if (el2) el2.removeEventListener("click", intent);
      unmountPoint(ID5);
      document.documentElement.classList.remove("lfx-tvbtn-on");
      el2 = null;
    }
  };
  var tvbtn_default = tvbtnFeature;

  // src/js/core/popover.js
  var ID6 = "lfx-popover";
  var GAP = 8;
  var MARGIN = 8;
  var current3 = null;
  function isPopoverOpen() {
    return current3 !== null;
  }
  function closePopover({ restoreFocus = false } = {}) {
    const c = current3;
    if (!c) return;
    current3 = null;
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
  function place(el4, anchorEl, align) {
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    const a = anchorEl.getBoundingClientRect();
    const w = el4.offsetWidth;
    const hgt = el4.offsetHeight;
    let left = align === "start" ? a.left : a.right - w;
    let top = a.bottom + GAP;
    if (vw) left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));
    if (vh && top + hgt > vh - MARGIN) top = Math.max(MARGIN, a.top - GAP - hgt);
    el4.style.left = `${Math.round(left)}px`;
    el4.style.top = `${Math.round(top)}px`;
  }
  function openPopover(anchorEl, { label, items = [], align = "end", className = "" } = {}) {
    closePopover();
    const el4 = mountPoint(ID6, { className: `lfx-popover${className ? ` ${className}` : ""}` });
    el4.className = `lfx-popover${className ? ` ${className}` : ""}`;
    el4.setAttribute("role", "menu");
    if (label) el4.setAttribute("aria-label", label);
    const list = items.filter((it) => it && !it.hidden);
    const nodes = list.map((it) => {
      if (it.note) return h("div", { class: "lfx-popover__note", role: "none", dataset: { key: it.key || "" } }, it.label);
      const cls = `lfx-popover__item${it.className ? ` ${it.className}` : ""}`;
      if (it.switch) {
        return switchButton(it, { className: `${cls} lfx-popover__item--switch`, labelClass: "lfx-popover__label" });
      }
      const kids = [];
      if (it.icon) {
        const ic = h("span", { class: "lfx-popover__icon", "aria-hidden": "true" });
        ic.innerHTML = it.icon;
        kids.push(ic);
      }
      kids.push(h("span", { class: "lfx-popover__label" }, it.label));
      if (it.badge) kids.push(badgePill(it.badge));
      const aria = badgedName(it.label, it.badge);
      const node = it.href ? h("a", { class: cls, role: "menuitem", href: it.href, "aria-label": aria, dataset: { key: it.key } }, kids) : h("button", { type: "button", class: cls, role: "menuitem", "aria-label": aria, dataset: { key: it.key } }, kids);
      node.addEventListener("click", () => {
        closePopover();
        if (typeof it.onClick === "function") it.onClick();
      });
      return node;
    });
    el4.replaceChildren(...nodes);
    const focusable = nodes.filter((n) => !n.classList.contains("lfx-popover__note"));
    const c = { el: el4, anchorEl, hadExpanded: anchorEl ? anchorEl.getAttribute("aria-expanded") : null };
    c.close = () => {
      if (current3 === c) closePopover({ restoreFocus: true });
    };
    c.onClose = () => {
      if (current3 === c) closePopover();
    };
    c.onScroll = (e) => {
      if (e.target && e.target !== document && el4.contains(e.target)) return;
      c.onClose();
    };
    c.onDocClick = (e) => {
      if (el4.contains(e.target) || anchorEl && anchorEl.contains(e.target)) return;
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
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) && focusable.length) {
        const i = focusable.indexOf(document.activeElement);
        let next;
        if (e.key === "Home") next = 0;
        else if (e.key === "End") next = focusable.length - 1;
        else if (e.key === "ArrowDown") next = i < 0 ? 0 : (i + 1) % focusable.length;
        else next = i < 0 ? focusable.length - 1 : (i - 1 + focusable.length) % focusable.length;
        e.preventDefault();
        focusable[next].focus();
      }
    };
    current3 = c;
    if (anchorEl) anchorEl.setAttribute("aria-expanded", "true");
    window.addEventListener("keydown", c.onKeydown, true);
    document.addEventListener("click", c.onDocClick, true);
    window.addEventListener("resize", c.onClose);
    window.addEventListener("scroll", c.onScroll, true);
    if (anchorEl) place(el4, anchorEl, align);
    if (focusable[0]) focusable[0].focus({ preventScroll: true });
    const raf3 = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
    raf3(() => {
      if (current3 === c) el4.classList.add("is-open");
    });
    return { el: el4, close: c.close };
  }

  // src/js/shared/dsbtn.js
  var LABEL = "Datensparmodus an";
  function createDataSaverButton({ className = "", el: el4 } = {}) {
    const btn3 = el4 || h("button", { type: "button" });
    btn3.classList.add("lfx-dsbtn");
    if (className) btn3.classList.add(...className.split(" "));
    btn3.setAttribute("aria-label", LABEL);
    btn3.setAttribute("aria-haspopup", "menu");
    btn3.title = LABEL;
    btn3.innerHTML = ICON_DATASAVER;
    btn3.addEventListener("click", () => {
      if (isPopoverOpen() && btn3.getAttribute("aria-expanded") === "true") {
        closePopover({ restoreFocus: true });
        return;
      }
      openPopover(btn3, {
        label: "Datensparmodus",
        items: [
          { note: true, key: "ds-note", label: "Datensparmodus ist an" },
          { key: "ds-off", label: "Ausschalten", onClick: () => setDataSaver(false) }
        ]
      });
    });
    return btn3;
  }

  // src/js/features/dsbtn.js
  var ID7 = "lfx-ds-btn";
  var dsbtnFeature = {
    name: "dsbtn",
    match(route) {
      return isReady() && isModern() && !isTv() && isTheme("flix") && !EXCLUDED.test(route.path);
    },
    mount() {
      const el4 = mountPoint(ID7, { tag: "button" });
      el4.type = "button";
      createDataSaverButton({ el: el4 });
      document.documentElement.classList.add("lfx-dsbtn-on");
    },
    unmount() {
      unmountPoint(ID7);
      document.documentElement.classList.remove("lfx-dsbtn-on");
    }
  };
  var dsbtn_default = dsbtnFeature;

  // src/js/features/osdcenter.js
  var ID8 = "lfx-osdc";
  var PAGE2 = '[id="videoOsdPage"]:not(.hide)';
  var svg2 = (inner) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${inner}</svg>`;
  var num = (n) => `<text x="12" y="15.2" text-anchor="middle" font-size="7.5" font-weight="700" fill="currentColor" font-family="inherit">${n}</text>`;
  var ICON = {
    back: svg2(`<path fill="currentColor" d="M12 5V2L7 6l5 4V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/>${num(10)}`),
    fwd: svg2(`<path fill="currentColor" d="M12 5V2l5 4-5 4V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z"/>${num(30)}`),
    play: svg2('<path fill="currentColor" d="M8 5v14l11-7z"/>'),
    pause: svg2('<path fill="currentColor" d="M6 5h4v14H6zM14 5h4v14h-4z"/>')
  };
  var STOP = ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "click"];
  var el3 = null;
  var mo2 = null;
  var raf2 = 0;
  var video = null;
  var paused = true;
  var btns = null;
  var page = () => document.querySelector(PAGE2);
  function setPlayIcon() {
    if (!btns) return;
    btns.play.innerHTML = paused ? ICON.play : ICON.pause;
    btns.play.setAttribute("aria-label", paused ? "Abspielen" : "Pause");
  }
  function onVideoState() {
    if (video) paused = video.paused;
    setPlayIcon();
  }
  function bindVideo() {
    const v = document.querySelector("video.htmlvideoplayer");
    if (v === video) return;
    if (video) for (const t of ["play", "pause", "emptied"]) video.removeEventListener(t, onVideoState);
    video = v;
    if (video) for (const t of ["play", "pause", "emptied"]) video.addEventListener(t, onVideoState);
    onVideoState();
  }
  function sync() {
    raf2 = 0;
    if (!el3) return;
    bindVideo();
    const p = page();
    const bar = p && p.querySelector(".videoOsdBottom");
    const up = p && p.querySelector(".upNextContainer");
    const on = Boolean(bar) && !bar.classList.contains("videoOsdBottom-hidden") && !bar.classList.contains("hide") && !(up && !up.classList.contains("hide")) && !document.querySelector(".dialogContainer .dialog.opened");
    el3.classList.toggle("is-visible", on);
    el3.setAttribute("aria-hidden", on ? "false" : "true");
    for (const [k, sel] of [["back", ".btnRewind"], ["play", ".btnPause"], ["fwd", ".btnFastForward"]]) {
      const proxy = p && p.querySelector(sel);
      btns[k].classList.toggle("is-off", !proxy || proxy.classList.contains("hide"));
    }
  }
  function schedule2() {
    if (raf2) return;
    raf2 = typeof requestAnimationFrame === "function" ? requestAnimationFrame(sync) : setTimeout(sync, 0);
  }
  function press(key, sel) {
    const proxy = page() && page().querySelector(sel);
    if (!proxy) return;
    if (key === "play") {
      paused = !paused;
      setPlayIcon();
    }
    proxy.click();
  }
  function stop2(e) {
    if (!e.target.closest || !e.target.closest("button")) return;
    e.stopPropagation();
    if (e.type === "click") e.preventDefault();
  }
  function btn(key, label, sel) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `lfx-osdc__btn lfx-osdc__btn--${key}`;
    b.setAttribute("aria-label", label);
    b.innerHTML = ICON[key] || "";
    b.addEventListener("click", () => press(key, sel));
    return b;
  }
  var osdcenterFeature = {
    name: "osdcenter",
    match(route) {
      return !isTv() && !isTheme("live") && Boolean(page() || route && route.path === "/video");
    },
    mount() {
      el3 = mountPoint(ID8, { className: "lfx-osdc" });
      btns = {
        back: btn("back", "10 Sekunden zur\xFCck", ".btnRewind"),
        play: btn("play", "Abspielen", ".btnPause"),
        fwd: btn("fwd", "30 Sekunden vor", ".btnFastForward")
      };
      el3.append(btns.back, btns.play, btns.fwd);
      for (const t of STOP) el3.addEventListener(t, stop2);
      mo2 = new MutationObserver(schedule2);
      mo2.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
      sync();
    },
    update() {
      schedule2();
    },
    unmount() {
      if (mo2) mo2.disconnect();
      mo2 = null;
      if (raf2) {
        if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf2);
        clearTimeout(raf2);
      }
      raf2 = 0;
      if (video) for (const t of ["play", "pause", "emptied"]) video.removeEventListener(t, onVideoState);
      video = null;
      unmountPoint(ID8);
      el3 = null;
      btns = null;
    }
  };
  var osdcenter_default = osdcenterFeature;

  // src/js/features/playerbg.js
  var CLASS2 = "lfx-in-player";
  var PAGE3 = '[id="videoOsdPage"]:not(.hide)';
  var OWN_ATTR = "data-lfx-playerbg";
  var meta = null;
  var prev = null;
  var own = false;
  function applyMeta() {
    meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      prev = meta.getAttribute("content");
      own = false;
    } else {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      meta.setAttribute(OWN_ATTR, "");
      document.head.appendChild(meta);
      own = true;
    }
    meta.setAttribute("content", "#000000");
  }
  function restoreMeta() {
    if (!meta) return;
    if (own) meta.remove();
    else if (prev === null) meta.removeAttribute("content");
    else meta.setAttribute("content", prev);
    meta = null;
    prev = null;
    own = false;
  }
  var playerbgFeature = {
    name: "playerbg",
    match(route) {
      return !isTv() && Boolean(document.querySelector(PAGE3) || route && route.path === "/video");
    },
    mount() {
      document.documentElement.classList.add(CLASS2);
      applyMeta();
    },
    unmount() {
      document.documentElement.classList.remove(CLASS2);
      restoreMeta();
    }
  };
  var playerbg_default = playerbgFeature;

  // src/js/features/billboard.js
  var billboard_exports = {};
  __export(billboard_exports, {
    ROTATE_MS: () => ROTATE_MS,
    ROWS_WAIT_MAX_MS: () => ROWS_WAIT_MAX_MS,
    TRAILER_BUFFER_S: () => TRAILER_BUFFER_S,
    TRAILER_MIN_IMAGE_MS: () => TRAILER_MIN_IMAGE_MS,
    TRAILER_STALL_MS: () => TRAILER_STALL_MS,
    TRAILER_WAIT_MAX_MS: () => TRAILER_WAIT_MAX_MS,
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

  // src/js/core/sheet.js
  var SHEET_ID = "lfx-sheet";
  var current4 = null;
  function isChooserOpen() {
    return current4 !== null;
  }
  function isCurrent(c) {
    return current4 !== null && current4 === c;
  }
  function closeChooser() {
    const c = current4;
    if (!c) return;
    current4 = null;
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
        ({ label, note, onClick, disabled, primary, badge: badge3, ...rest }) => rest.switch ? switchButton({ label, ...rest }, { className: "lfx-sheet__item lfx-sheet__item--switch", role: "switch" }) : h(
          "button",
          {
            type: "button",
            class: `lfx-sheet__item${primary ? " lfx-sheet__item--primary" : ""}`,
            disabled: disabled ? true : null,
            "aria-label": badgedName(label, badge3),
            onclick: onClick
          },
          [
            note ? h("span", { class: "lfx-sheet__text" }, [h("span", null, [label]), h("span", { class: "lfx-sheet__note" }, [note])]) : label,
            badge3 ? badgePill(badge3) : null
          ]
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
      const active5 = document.activeElement;
      if (!sheet.contains(active5)) {
        e.preventDefault();
        firstEl.focus();
      } else if (e.shiftKey && active5 === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active5 === lastEl) {
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
        if (current4 === c) closeChooser();
      } });
    }
    document.documentElement.classList.add("lfx-sheet-open");
    current4 = c;
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
    const timer2 = setTimeout(() => controller.abort(), PROBE_TIMEOUT);
    try {
      const res = await fetch(url, { headers: { Range: "bytes=0-0" }, signal: controller.signal });
      const result = res.ok ? { ok: true } : { ok: false, status: res.status };
      controller.abort();
      return result;
    } catch {
      return { ok: true, unknown: true };
    } finally {
      clearTimeout(timer2);
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
  var ITEM_FIELDS2 = "Overview,Genres,People,Studios,Taglines,OfficialRating,ProductionYear,RunTimeTicks,ChildCount,RemoteTrailers,MediaSources,Width,ImageTags,BackdropImageTags,UserData";
  var LIST_FIELDS = "Overview,UserData,ImageTags,RunTimeTicks,ProductionYear,OfficialRating";
  var itemsOf = (res) => res && res.Items || [];
  async function loadItem(id) {
    const item = await cached(`lfx:modal:item:${id}`, () => getItem(id, { Fields: ITEM_FIELDS2 }), TTL);
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
  function progressPercent2(item) {
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
  function logoUrl(item) {
    return logoImage(item, { maxWidth: 500 });
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
  function setFavState(btn3, on) {
    btn3.classList.toggle("is-on", on);
    btn3.setAttribute("aria-pressed", String(on));
    btn3.replaceChildren(icon(on ? "check" : "plus"));
  }
  function setLikeState(btn3, on) {
    btn3.classList.toggle("is-on", on);
    btn3.setAttribute("aria-pressed", String(on));
    btn3.replaceChildren(icon(on ? ICON_LIKE : ICON_LIKE_OUTLINE));
  }
  var PLAYED_LABELS = {
    item: ["Als gesehen markieren", "Als ungesehen markieren"],
    series: ["Ganze Serie als gesehen markieren", "Ganze Serie als ungesehen markieren"],
    season: ["Staffel als gesehen markieren", "Staffel als ungesehen markieren"]
  };
  function setPlayedState(btn3, on) {
    const labels2 = PLAYED_LABELS[btn3.dataset.scope] || PLAYED_LABELS.item;
    const label = on ? labels2[1] : labels2[0];
    btn3.classList.toggle("is-on", on);
    btn3.setAttribute("aria-pressed", String(on));
    btn3.setAttribute("aria-label", label);
    btn3.setAttribute("title", label);
    btn3.replaceChildren(icon(on ? ICON_EYE_CHECK : ICON_EYE));
  }
  function playedButton(item, { small = false, scope = null, on = null, onclick = null } = {}) {
    const sc = scope || (item.Type === "Series" ? "series" : "item");
    const btn3 = roundButton(PLAYED_LABELS[sc][0], ICON_EYE, onclick, `${small ? "lfx-modal__round--small " : ""}lfx-modal__round--played`);
    btn3.dataset.scope = sc;
    setPlayedState(btn3, on === null ? Boolean(item.UserData && item.UserData.Played === true) : on);
    return btn3;
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
    const btn3 = roundButton(text, ICON_DOWNLOAD, (e) => {
      e.stopPropagation();
      startDownload(item, btn3);
    }, `${small ? "lfx-modal__round--small " : ""}lfx-modal__round--dl`);
    btn3.hidden = true;
    Promise.resolve(canDownload(item)).then((ok) => {
      if (ok && btn3.isConnected) btn3.hidden = false;
    }).catch(() => {
    });
    return btn3;
  }
  function menuButton(item, small = false, label = "Mehr", opts = null) {
    const btn3 = roundButton(label, ICON_MORE, (e) => {
      e.stopPropagation();
      opts ? openItemMenu(item, btn3, opts) : openItemMenu(item, btn3);
    }, `${small ? "lfx-modal__round--small " : ""}lfx-modal__round--menu`);
    btn3.setAttribute("aria-haspopup", "menu");
    return btn3;
  }
  var stopKeys = (btn3) => {
    btn3.addEventListener("keydown", (e) => e.stopPropagation());
    return btn3;
  };
  function setPlayLabel(btn3, label) {
    const t = btn3.querySelector(".lfx-modal__play-text");
    if (t) t.textContent = label;
  }
  function buildDetail(item, H, { playLabel: playLabel2 = "Abspielen" } = {}) {
    const ud = item.UserData || {};
    const logo = logoUrl(item);
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
    const meta2 = h("div", { class: "lfx-modal__meta" }, [
      m.year ? h("span", { class: "lfx-modal__year" }, m.year) : null,
      m.length ? h("span", { class: "lfx-modal__length" }, m.length) : null,
      badge(m.quality),
      badge(m.rating)
    ]);
    const tagline = (item.Taglines || [])[0];
    const left = h("div", { class: "lfx-modal__main" }, [
      meta2,
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
    const el4 = h("div", { class: "lfx-modal__detail" }, [hero, body, episodesSlot, extraSlot, similarSlot, infoSlot, footer]);
    return { el: el4, playBtn, favBtn, likeBtn, dlBtn, menuBtn, playedBtn, episodesSlot, extraSlot, similarSlot, infoSlot };
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
    const pct = progressPercent2(ep);
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
        h("div", { class: "lfx-modal__ep-head" }, [h("span", { class: "lfx-modal__ep-title", "data-num": ep.IndexNumber != null ? `${ep.IndexNumber}.` : null }, ep.Name || ""), rt ? h("span", { class: "lfx-modal__ep-rt" }, rt) : null]),
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
  function renderEpisodes(slot, state21, H) {
    slot.hidden = false;
    slot.replaceChildren();
    const { seasons, seasonId, episodes, selectedEpisodeId } = state21;
    putItems(episodes);
    const current7 = seasons.find((s) => s.Id === seasonId);
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
      const btn3 = h("button", {
        type: "button",
        class: "lfx-modal__seasonbtn",
        "aria-haspopup": "listbox",
        "aria-expanded": "false",
        onclick: () => toggle(list.hidden)
      }, [h("span", {}, current7 && current7.Name || "Staffel"), icon("chevron")]);
      const toggle = (open2) => {
        list.hidden = !open2;
        btn3.setAttribute("aria-expanded", String(open2));
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
      tools.append(h("div", { class: "lfx-modal__dropdown" }, [btn3, list]));
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
    let shown3 = Math.max(EPISODES_INITIAL, selIdx + 1);
    const draw = () => {
      listEl.replaceChildren(...episodes.slice(0, shown3).map((e) => episodeRow(e, selectedEpisodeId, H, episodes)));
      if (shown3 < episodes.length) listEl.append(moreButton(() => {
        shown3 = episodes.length;
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
    const grid2 = h("div", { class: "lfx-modal__grid" });
    slot.append(grid2);
    let shown3 = initial;
    const draw = () => {
      grid2.replaceChildren(...items.slice(0, shown3).map((it) => card(it, H)));
      slot.querySelector(".lfx-modal__more")?.remove();
      if (shown3 < items.length) slot.append(moreButton(() => {
        shown3 = items.length;
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
    if (opts.overlay && state4) state4.overlayMode = true;
    if (theme && theme !== "flix" && !opts.overlay && !(state4 && state4.overlayMode)) {
      location.hash = titleHref(id);
      return Promise.resolve();
    }
    const hint = typeof itemOrId === "object" ? itemOrId : null;
    if (state4) return loadInto(id, hint, true);
    create(opts.opener || (document.activeElement !== document.body ? document.activeElement : null), Boolean(opts.overlay));
    return loadInto(id, hint, false);
  }
  function create(opener, overlayMode = false) {
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
    state4 = { overlay, modal, content, closeBtn, opener, token: 0, pushed: false, after: null, fallback: null, main: null, parts: null, scrollY: window.scrollY || 0, overlayMode, lock: null, seasons: [], episodes: [], seasonId: null, selectedEpisodeId: null, onOverlayClick, unsub: null };
    state4.unsub = onItemsChanged(onChanged);
    if (typeof window.matchMedia === "function" && window.matchMedia("(max-width: 799px)").matches) {
      lockScroll(state4);
      state4.detachSwipe = attachSwipeClose(modal, {
        backdrop: overlay,
        canStart: () => overlay.scrollTop <= 0 && !overlayOnTop(),
        holdBackdrop: true,
        // Hintergrund bleibt beim Wegwischen abgedunkelt, bis die Scrollposition der Seite wiederhergestellt ist
        onClose: () => closeModal()
      });
    }
    rootEl().classList.add("lfx-modal-open");
    document.addEventListener("keydown", onKeydown2, true);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("hashchange", onHashChange);
    try {
      history.pushState({ ...history.state || {}, lfxModal: true }, "", location.href);
      state4.pushed = true;
    } catch {
    }
    closeBtn.focus({ preventScroll: true });
  }
  function lockScroll(s) {
    const b = document.body;
    if (!b) return;
    const st = b.style;
    const y = s.scrollY;
    s.lock = { y, pos: st.position, top: st.top, left: st.left, right: st.right, width: st.width };
    st.position = "fixed";
    st.top = `-${y}px`;
    st.left = "0";
    st.right = "0";
    st.width = "100%";
  }
  function unlockScroll(s) {
    const l = s.lock;
    if (!l) return;
    s.lock = null;
    const st = document.body.style;
    st.position = l.pos;
    st.top = l.top;
    st.left = l.left;
    st.right = l.right;
    st.width = l.width;
    window.scrollTo(0, l.y);
  }
  function teardown2() {
    if (!state4) return null;
    const s = state4;
    state4 = null;
    clearTimeout(s.fallback);
    if (typeof s.unsub === "function") s.unsub();
    if (s.detachSwipe) s.detachSwipe();
    s.overlay.removeEventListener("click", s.onOverlayClick);
    document.removeEventListener("keydown", onKeydown2, true);
    window.removeEventListener("popstate", onPopState);
    window.removeEventListener("hashchange", onHashChange);
    unlockScroll(s);
    rootEl().classList.remove("lfx-modal-open");
    unmountPoint(s.overlay);
    const op = s.opener;
    if (op && op.isConnected && typeof op.focus === "function" && !overlayOnTop()) op.focus({ preventScroll: true });
    return s.after;
  }
  function closeModal(opts = {}) {
    if (!state4) return;
    if (opts.after) state4.after = opts.after;
    if (state4.closing) return;
    state4.closing = true;
    if (state4.pushed) {
      state4.fallback = setTimeout(() => finish2(), 600);
      history.back();
    } else {
      finish2();
    }
  }
  function restoreScroll(y) {
    const fix = () => {
      if (Math.abs((window.scrollY || 0) - y) > 1) window.scrollTo(0, y);
    };
    fix();
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(fix);
    setTimeout(fix, 150);
  }
  function finish2() {
    const y = state4 ? state4.scrollY : 0;
    const after = teardown2();
    if (after) after();
    else restoreScroll(y);
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
    return [...state4.modal.querySelectorAll(sel)].filter((el4) => !el4.closest("[hidden]"));
  }
  function onKeydown2(e) {
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
    const active5 = document.activeElement;
    if (!state4.modal.contains(active5)) {
      e.preventDefault();
      first2.focus();
    } else if (e.shiftKey && active5 === first2) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active5 === last) {
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
  function preloadImages(id, hint) {
    const item = hint || getStoredItem(id);
    if (!item) return;
    let target = item;
    if (item.Type === "Episode" || item.Type === "Season") {
      const tid = item.SeriesId || item.ParentId;
      target = tid ? getStoredItem(tid) : null;
      if (!target) return;
    }
    for (const url of [heroImage(target), logoUrl(target)]) {
      if (!url) continue;
      try {
        new Image().src = url;
      } catch {
      }
    }
  }
  async function loadInto(id, hint, replace, refresh2 = false) {
    const s = state4;
    const token2 = ++s.token;
    const stale = () => state4 !== s || s.token !== token2;
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
    if (!refresh2) preloadImages(id, hint);
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
      s.content.replaceChildren(buildError(err && err.message ? "Der Server hat nicht geantwortet." : "", href, (hash2) => navigate(hash2)));
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
    if (s.overlayMode && getTheme() && getTheme() !== "flix") {
      const tHref = titleHref(main.Id);
      const link = h("a", { class: "lfx-modal__link lfx-modal__link--title", href: tHref, onclick: (e) => {
        e.preventDefault();
        H.navigate(tHref);
      } }, "Zur Titelseite");
      const footer = parts.el.querySelector(".lfx-modal__footer");
      if (footer) footer.prepend(link, " \xB7 ");
    }
    s.content.replaceChildren(parts.el);
    if (!refresh2) s.overlay.scrollTop = 0;
    const tasks = [];
    if (isSeries) {
      tasks.push(loadSeriesParts(s, token2, H));
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
  async function loadSeriesParts(s, token2, H) {
    const stale = () => state4 !== s || s.token !== token2;
    try {
      s.seasons = await loadSeasons(s.main.Id);
      if (stale()) return;
      s.seasonId = pickInitialSeason(s.seasons, s.seasonId);
      if (!s.seasonId) return;
      await showSeason(s, token2, H);
    } catch {
    }
  }
  async function showSeason(s, token2, H) {
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
  function navigate(hash2) {
    closeModal({ after: () => {
      location.hash = hash2;
    } });
  }
  async function toggleFavGeneric(item, btn3) {
    item.UserData = item.UserData || {};
    const next = !item.UserData.IsFavorite;
    item.UserData.IsFavorite = next;
    setFavState(btn3, next);
    try {
      await setFavorite(item.Id, next);
      clearCache("home:");
    } catch {
      item.UserData.IsFavorite = !next;
      setFavState(btn3, !next);
    }
  }
  var isPlayed = (it) => Boolean(it && it.UserData && it.UserData.Played === true);
  var folgen = (n) => n === 1 ? "1 Folge" : `${n} Folgen`;
  var SAVE_ERROR = "Konnte nicht gespeichert werden";
  function clearPlayedCaches(itemId2, seriesId) {
    clearCache("home:");
    clearCache(`lfx:modal:item:${itemId2}`);
    if (seriesId) {
      clearCache(`lfx:modal:next:${seriesId}`);
      clearCache(`lfx:modal:eps:${seriesId}:`);
    }
  }
  function syncSeasonBtn(s) {
    const btn3 = s.parts && s.parts.episodesSlot.querySelector('.lfx-modal__round--played[data-scope="season"]');
    if (btn3) setPlayedState(btn3, s.episodes.length > 0 && s.episodes.every(isPlayed));
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
    let starting = false;
    const coverFor = (it) => {
      if (!it || it.Type !== "Episode") return it;
      const hasBd = main.Type === "Series" && (main.BackdropImageTags || []).length > 0;
      return {
        ...it,
        SeriesName: it.SeriesName || main.Name,
        SeriesId: it.SeriesId || (main.Type === "Series" ? main.Id : void 0),
        ParentBackdropItemId: it.ParentBackdropItemId || (hasBd ? main.Id : void 0),
        ParentBackdropImageTags: it.ParentBackdropImageTags || (hasBd ? main.BackdropImageTags : void 0)
      };
    };
    const startPlayback2 = (target, resume) => {
      show({ item: coverFor(target) });
      closeModal({ after: () => {
        play(target, { resume }).catch(() => {
        });
      } });
    };
    const askBulk = ({ btn: btn3, n, next, targetId, isSeries }) => {
      const verb = next ? "gesehen" : "ungesehen";
      confirmAction({
        title: n ? `${folgen(n)} als ${verb} markieren?` : `Alle Folgen als ${verb} markieren?`,
        confirmLabel: `Als ${verb} markieren`,
        anchorEl: btn3,
        onConfirm: async () => {
          if (stale()) return;
          btn3.disabled = true;
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
            btn3.disabled = false;
          }
        }
      });
    };
    const H = {
      async togglePlayed(item, btn3) {
        const prev2 = { ...item.UserData || {} };
        const next = prev2.Played !== true;
        const row = btn3.closest(".lfx-modal__ep");
        item.UserData = { ...prev2, Played: next, PlaybackPositionTicks: 0 };
        delete item.UserData.PlayedPercentage;
        setPlayedState(btn3, next);
        setEpisodeSeen(row, next);
        syncSeasonBtn(s);
        try {
          await setPlayed(item.Id, next);
        } catch {
          item.UserData = prev2;
          setPlayedState(btn3, !next);
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
      async toggleSeriesPlayed(btn3) {
        const next = !isPlayed(main);
        const n = await seriesEpisodeCount(s);
        if (stale()) return;
        askBulk({ btn: btn3, n, next, targetId: main.Id, isSeries: true });
      },
      toggleSeasonPlayed(btn3) {
        if (!s.seasonId || !s.episodes.length) return;
        askBulk({ btn: btn3, n: s.episodes.length, next: !s.episodes.every(isPlayed), targetId: s.seasonId, isSeries: false });
      },
      async play() {
        if (starting) return;
        starting = true;
        show({ item: main });
        let target = main;
        let resume = hasResume(main);
        try {
          if (main.Type === "Series") {
            target = await loadNextUp(main.Id).catch(() => null);
            if (!target && !stale()) {
              const eps = s.seasons.length ? await loadEpisodes2(main.Id, pickInitialSeason(s.seasons, null)).catch(() => []) : [];
              target = eps[0] || null;
            }
            resume = hasResume(target);
          }
        } catch {
          target = null;
        }
        if (!target || stale()) {
          starting = false;
          hide();
          return;
        }
        startPlayback2(target, resume);
      },
      toggleFav: (btn3) => toggleFavGeneric(main, btn3),
      toggleFavOf: (item, btn3) => toggleFavGeneric(item, btn3),
      async toggleLike(btn3) {
        main.UserData = main.UserData || {};
        const next = main.UserData.Likes !== true;
        main.UserData.Likes = next ? true : null;
        setLikeState(btn3, next);
        try {
          await setLike(main.Id, next);
        } catch {
          main.UserData.Likes = next ? null : true;
          setLikeState(btn3, !next);
        }
      },
      openItem: (id) => loadInto(id, null, true),
      navigate,
      scrollToInfo() {
        const el4 = s.parts && s.parts.infoSlot;
        if (el4 && el4.scrollIntoView) el4.scrollIntoView({ behavior: "smooth", block: "start" });
      },
      async season(seasonId) {
        s.seasonId = seasonId;
        s.selectedEpisodeId = null;
        await showSeason(s, token2, H).catch(() => {
        });
      },
      playItem(ep) {
        if (starting) return;
        starting = true;
        startPlayback2(ep, hasResume(ep));
      }
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
    match: (route) => !isBlockedRoute(route) && !isTv() && !isTheme("live"),
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
    const apply2 = () => {
      const d = v.duration;
      if (Number.isFinite(d) && d > 30 && d > startAt + 20) {
        try {
          v.currentTime = startAt;
        } catch {
        }
      }
    };
    if (v.readyState >= 1) apply2();
    else v.addEventListener("loadedmetadata", apply2, { once: true });
  }
  function createMutedPreview(container, item, { delay = 1500, onStart, onEnd, startAt = 0 } = {}) {
    let dead = false;
    let video2 = null;
    let started2 = false;
    const cleanup2 = () => {
      if (video2) {
        const v = video2;
        video2 = null;
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
      clearTimeout(timer2);
      const wasStarted = started2;
      cleanup2();
      if (wasStarted && typeof onEnd === "function") onEnd();
    };
    const start10 = async () => {
      timer2 = null;
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
        if (dead || video2 !== v || started2) return;
        started2 = true;
        if (typeof onStart === "function") onStart(v);
      });
      v.addEventListener("ended", finish3);
      v.addEventListener("error", finish3);
      video2 = v;
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
    let timer2 = setTimeout(start10, delay);
    return {
      cancel() {
        if (dead) return;
        dead = true;
        clearTimeout(timer2);
        timer2 = null;
        cleanup2();
      }
    };
  }

  // src/js/features/billboard/format.js
  var DAY = 864e5;
  var NEW_DAYS2 = 14;
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
  var SAVER_POOL = 5;
  function saverPool(pool, keepId = null) {
    const list = Array.isArray(pool) ? pool : [];
    if (list.length <= SAVER_POOL) return list.slice();
    const out = list.slice(0, SAVER_POOL);
    if (keepId && !out.some((it) => it.Id === keepId)) {
      const cur3 = list.find((it) => it.Id === keepId);
      if (cur3) out[SAVER_POOL - 1] = cur3;
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
  function badgeFor2(item, now = Date.now()) {
    const t = item && item.DateCreated ? Date.parse(item.DateCreated) : NaN;
    if (Number.isFinite(t) && now - t >= 0 && now - t < NEW_DAYS2 * DAY) return "Neu hinzugef\xFCgt";
    return null;
  }
  function hasProgress(item) {
    return Boolean(item && item.UserData && item.UserData.PlaybackPositionTicks > 0);
  }

  // src/js/features/billboard.js
  var ROTATE_MS = 1e4;
  var TRAILER_MIN_IMAGE_MS = 3e3;
  var TRAILER_BUFFER_S = 6;
  var TRAILER_STALL_MS = 1500;
  var TRAILER_WAIT_MAX_MS = 25e3;
  var ROWS_WAIT_MAX_MS = 8e3;
  var ROWS_READY_EVENT = "lfx:rows-ready";
  var IMG_FADE_MS = 1e3;
  var TEXT_FADE_MS = 400;
  var FIELDS = "Genres,OfficialRating,ProductionYear,RunTimeTicks,ChildCount,DateCreated,LocalTrailerCount";
  var NS = "http://www.w3.org/2000/svg";
  function svg3(html2, cls) {
    const el4 = document.createElementNS(NS, "svg");
    el4.setAttribute("viewBox", "0 0 24 24");
    el4.setAttribute("aria-hidden", "true");
    if (cls) el4.setAttribute("class", cls);
    el4.innerHTML = html2;
    return el4;
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
  var poolKey = () => homeKey(getUserId(), "billboard");
  async function fetchPool() {
    const base = {
      Recursive: true,
      IncludeItemTypes: "Movie,Series",
      ImageTypes: "Logo,Backdrop",
      Fields: FIELDS,
      EnableUserData: true,
      EnableImageTypes: "Logo,Backdrop,Primary",
      ImageTypeLimit: 1,
      Limit: 12
    };
    const [latest, random] = await Promise.all([
      getItems({ ...base, SortBy: "DateCreated", SortOrder: "Descending" }).catch(() => null),
      getItems({ ...base, SortBy: "Random" }).catch(() => null)
    ]);
    const pool = buildPool(latest && latest.Items, random && random.Items, { avoidFirstId: readLastFirst() });
    if (pool[0]) writeLastFirst(pool[0].Id);
    return pool;
  }
  function loadPool() {
    const key = poolKey();
    const p = cached(key, fetchPool, HOME_TTL);
    p.then((pool) => {
      if (!pool.length) clearCache(key);
    }, () => {
    });
    return p;
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
    let gen8 = 0;
    let hovering = false;
    let trailerActive = false;
    let rotateTimer = null;
    let slide = null;
    let rowsReady = false;
    let warm = false;
    const timers = /* @__PURE__ */ new Set();
    let video2 = null;
    let card3 = null;
    let media = null;
    let content = null;
    let muteBtn = null;
    let dots = null;
    const cleanupFns = [];
    const setTr = (v) => {
      if (v) slot.dataset.lfxTr = v;
      else delete slot.dataset.lfxTr;
    };
    const later = (fn, ms) => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
      return t;
    };
    const trailerPending = () => Boolean(slide && slide.item.LocalTrailerCount > 0 && !slide.failed && !trailerActive && !isDataSaver() && Date.now() - slide.t0 < TRAILER_WAIT_MAX_MS);
    const paused3 = () => hovering || trailerActive || trailerPending() || document.hidden || document.documentElement.classList.contains("lfx-modal-open") || isMenuOpen() || isChooserOpen();
    function stopTrailer() {
      if (slide) clearTimeout(slide.revealTimer);
      trailerActive = false;
      if (video2) {
        const v = video2;
        video2 = null;
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
        if (paused3()) scheduleRotate();
        else show3((index + 1) % pool.length);
      }, ROTATE_MS);
    }
    function buildListButton(item) {
      const btn3 = h("button", { type: "button", class: "lfx-bb__btn lfx-bb__btn--list", "aria-label": "Meine Liste" });
      const paint = () => {
        const on = Boolean(item.UserData && item.UserData.IsFavorite);
        btn3.replaceChildren(svg3(on ? ICON_CHECK : ICON_PLUS), h("span", null, "Meine Liste"));
        btn3.classList.toggle("is-on", on);
        btn3.setAttribute("aria-pressed", on ? "true" : "false");
      };
      paint();
      btn3.addEventListener("click", async () => {
        const prev2 = Boolean(item.UserData && item.UserData.IsFavorite);
        item.UserData = { ...item.UserData || {}, IsFavorite: !prev2 };
        paint();
        try {
          await setFavorite(item.Id, !prev2);
          clearCache("home:");
        } catch {
          item.UserData = { ...item.UserData || {}, IsFavorite: prev2 };
          paint();
        }
      });
      return btn3;
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
      const meta2 = h("div", { class: "lfx-bb__meta" });
      metaParts2(item).forEach((p, i) => {
        if (i) meta2.append(h("span", { class: "lfx-bb__dot", "aria-hidden": "true" }, "\u2022"));
        meta2.append(h("span", { class: p.rating ? "lfx-bb__rating" : null }, p.text));
      });
      const playBtn = h("button", { type: "button", class: "lfx-bb__btn lfx-bb__btn--play" }, [svg3(ICON_PLAY), h("span", null, "Abspielen")]);
      playBtn.addEventListener("click", () => play(item, { resume: hasProgress(item) }));
      const infoBtn = h("button", { type: "button", class: "lfx-bb__btn lfx-bb__btn--info" }, [h("span", null, "Weitere Infos")]);
      infoBtn.addEventListener("click", () => openModal(item));
      const listBtn = buildListButton(item);
      const genres = genreLine(item);
      const badgeText = badgeFor2(item);
      return h("div", null, [
        h("div", { class: "lfx-bb__text" }, [
          logo ? h("img", { class: "lfx-bb__logo", src: logo, alt: item.Name || "", decoding: warm ? null : "async" }) : h("h2", { class: "lfx-bb__title" }, item.Name || ""),
          meta2,
          genres ? h("div", { class: "lfx-bb__genres" }, genres) : null,
          item.Overview ? h("p", { class: "lfx-bb__desc" }, item.Overview) : null
        ]),
        h("div", { class: "lfx-bb__buttons" }, [playBtn, infoBtn, listBtn, ...buildRoundButtons(item)]),
        badgeText ? h("span", { class: "lfx-bb__badge" }, [svg3(ICON_BADGE), badgeText]) : null
      ]);
    }
    function buildImage(item, first2 = false) {
      const dec = warm ? null : "async";
      const bd = imageUrl(item, { type: "Backdrop", maxWidth: 1600, quality: 80 });
      const poster = imageUrl(item, { type: "Primary", maxWidth: 720, quality: 80 });
      return h("picture", { class: "lfx-bb__pic" }, [
        poster ? h("source", { media: "(max-width: 799px)", srcset: poster }) : null,
        // Erstes Bild: sofort und mit hoher Priorität laden (ohne Überblendung, siehe show()).
        h("img", { class: "lfx-bb__img", src: bd, alt: "", decoding: dec, fetchpriority: first2 ? "high" : null })
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
        b.addEventListener("click", () => show3(i));
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
          gen8 += 1;
          stopTrailer();
          clearTimeout(rotateTimer);
          timers.forEach(clearTimeout);
          timers.clear();
          content.replaceChildren();
          slot.hidden = true;
          resetAmbient();
          return;
        }
        index = curGone ? Math.min(index, pool.length - 1) : pool.indexOf(cur3);
        fillDots();
        if (curGone) show3(index);
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
      if (!video2) return;
      muteBtn.replaceChildren(svg3(video2.muted ? ICON_MUTED : ICON_SOUND));
      muteBtn.setAttribute("aria-label", video2.muted ? "Ton einschalten" : "Ton ausschalten");
    }
    function tryPreload() {
      const sl = slide;
      if (!sl || disposed || sl.gen !== gen8 || sl.started || sl.failed || isDataSaver()) return;
      if (!(sl.item.LocalTrailerCount > 0) || !sl.imgAt || !rowsReady) return;
      sl.started = true;
      startTrailer(sl);
    }
    async function startTrailer(sl) {
      try {
        const t = await loadLocalTrailer(sl.item);
        if (sl.gen !== gen8 || disposed) return;
        if (isDataSaver()) {
          sl.failed = true;
          setTr("");
          return;
        }
        if (!t) {
          sl.failed = true;
          setTr("");
          return;
        }
        const v = h("video", { class: "lfx-bb__video", playsinline: true, preload: "auto", "aria-hidden": "true" });
        v.muted = true;
        v.setAttribute("muted", "");
        v.addEventListener("playing", () => {
          if (sl.gen !== gen8 || video2 !== v) return;
          trailerActive = true;
          setTr("on");
          v.classList.add("is-in");
          card3.classList.add("is-trailer");
          muteBtn.hidden = false;
          setMuteIcon();
        });
        const end = () => {
          if (video2 !== v) return;
          sl.failed = true;
          setTr("");
          stopTrailer();
          scheduleRotate();
        };
        const buffered = () => {
          try {
            return v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0;
          } catch {
            return 0;
          }
        };
        const enough = () => v.readyState >= 4 || buffered() - (v.currentTime || 0) >= TRAILER_BUFFER_S || Number.isFinite(v.duration) && v.duration > 0 && buffered() >= v.duration - 0.3;
        const reveal = () => {
          if (video2 !== v || sl.gen !== gen8 || disposed) return;
          const p = v.play && v.play();
          if (p && p.catch) p.catch(end);
        };
        const check3 = (force = false) => {
          if (sl.ready || video2 !== v || sl.gen !== gen8 || !(force === true || enough())) return;
          sl.ready = true;
          const wait = sl.imgAt + TRAILER_MIN_IMAGE_MS - Date.now();
          if (wait > 0) sl.revealTimer = later(reveal, wait);
          else reveal();
        };
        let lastProgress = Date.now();
        const touch = () => {
          lastProgress = Date.now();
        };
        const stallCheck = () => {
          if (sl.ready || video2 !== v || sl.gen !== gen8 || disposed) return;
          if (v.readyState < 3 && Date.now() - lastProgress >= TRAILER_STALL_MS) {
            sl.ready = true;
            reveal();
            return;
          }
          later(stallCheck, 500);
        };
        v.addEventListener("ended", end);
        v.addEventListener("error", end);
        v.addEventListener("canplaythrough", () => {
          touch();
          check3(true);
        });
        for (const ev of ["canplay", "loadeddata", "loadedmetadata", "progress", "durationchange"]) {
          v.addEventListener(ev, () => {
            touch();
            check3();
          });
        }
        later(stallCheck, Math.max(0, sl.imgAt + TRAILER_MIN_IMAGE_MS - Date.now()));
        v.src = trailerUrl(t.Id);
        video2 = v;
        media.append(v);
        check3();
      } catch {
        sl.failed = true;
        setTr("");
      }
    }
    function show3(i, immediate = false) {
      if (disposed || !pool[i]) return;
      const item = pool[i];
      index = i;
      gen8 += 1;
      const myGen = gen8;
      stopTrailer();
      updateDots();
      const olds = [...media.querySelectorAll(".lfx-bb__pic")];
      const firstPic = !olds.length;
      const pic = buildImage(item, firstPic);
      media.append(pic);
      if (immediate || !olds.length) {
        olds.forEach((o) => o.remove());
        pic.classList.add("is-in");
      } else {
        requestAnimationFrame(() => pic.classList.add("is-in"));
        later(() => olds.forEach((o) => o.remove()), IMG_FADE_MS + 50);
      }
      const swap = () => {
        if (disposed || myGen !== gen8) return;
        content.replaceChildren(...buildContent(item).childNodes);
        content.classList.remove("is-out");
      };
      if (immediate || !content.firstChild) swap();
      else {
        content.classList.add("is-out");
        later(swap, TEXT_FADE_MS);
      }
      putItems([item]);
      loadAmbient(item, () => myGen === gen8 && !disposed);
      scheduleRotate();
      const sl = { item, gen: myGen, t0: Date.now(), imgAt: 0, started: false, ready: false, failed: false, revealTimer: null };
      slide = sl;
      setTr(item.LocalTrailerCount > 0 && !isDataSaver() ? "wait" : "");
      const img = pic.querySelector(".lfx-bb__img");
      const onLoaded = () => {
        if (disposed || sl.gen !== gen8 || sl.imgAt) return;
        sl.imgAt = Date.now();
        tryPreload();
      };
      if (img.complete && img.naturalWidth > 0) onLoaded();
      else {
        img.addEventListener("load", onLoaded, { once: true });
        img.addEventListener("error", onLoaded, { once: true });
      }
    }
    function build11() {
      media = h("div", { class: "lfx-bb__media" });
      content = h("div", { class: "lfx-bb__live", "aria-live": "off" });
      muteBtn = h("button", { type: "button", class: "lfx-bb__mute", hidden: true, "aria-label": "Ton einschalten" });
      muteBtn.addEventListener("click", () => {
        if (!video2) return;
        video2.muted = !video2.muted;
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
      cleanupFns.push(onDataSaverChange(onSaver));
    }
    function onSaver(active5) {
      if (disposed || !card3 || !active5) return;
      if (slide) slide.failed = true;
      stopTrailer();
      setTr("");
      const cur3 = pool[index];
      pool = saverPool(pool, cur3 && cur3.Id);
      index = Math.max(0, cur3 ? pool.indexOf(cur3) : 0);
      fillDots();
      scheduleRotate();
    }
    async function init2() {
      let items = peekCached(poolKey()) || [];
      warm = items.length > 0;
      if (!warm) {
        try {
          items = await loadPool();
        } catch {
        }
      }
      if (disposed) return;
      if (!items.length) {
        slot.replaceChildren();
        slot.hidden = true;
        resetAmbient();
        return;
      }
      pool = isDataSaver() ? saverPool(items) : items.slice();
      putItems(pool);
      build11();
      slot.hidden = false;
      show3(0, true);
    }
    slot.replaceChildren(h("div", { class: "lfx-bb lfx-bb--skel", "aria-hidden": "true" }));
    slot.hidden = false;
    const onRowsReady = () => {
      rowsReady = true;
      tryPreload();
    };
    document.addEventListener(ROWS_READY_EVENT, onRowsReady);
    cleanupFns.push(() => document.removeEventListener(ROWS_READY_EVENT, onRowsReady));
    later(onRowsReady, ROWS_WAIT_MAX_MS);
    init2();
    return () => {
      disposed = true;
      gen8 += 1;
      clearTimeout(rotateTimer);
      timers.forEach(clearTimeout);
      timers.clear();
      stopTrailer();
      setTr("");
      cleanupFns.forEach((f) => f());
      slot.replaceChildren();
      slot.removeAttribute("aria-roledescription");
      resetAmbient();
    };
  }

  // src/js/features/rows.js
  var rows_exports = {};
  __export(rows_exports, {
    ROWS_READY_EVENT: () => ROWS_READY_EVENT2,
    render: () => render4
  });

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
  function landscapeWidth() {
    return typeof matchMedia === "function" && matchMedia("(max-width: 799px)").matches ? 420 : 600;
  }
  function setCardBadge(card3, text) {
    if (!text || card3.querySelector(".lfx-badge")) return;
    const el4 = document.createElement("span");
    el4.className = "lfx-badge";
    el4.textContent = text;
    const progress = card3.querySelector(".lfx-progress");
    card3.insertBefore(el4, progress);
  }
  function landscapeFor(item, maxWidth = landscapeWidth()) {
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
    const { badge: badge3 = null, kind: kind2 = "landscape", rank = 0, eager = false } = opts;
    const lazy = eager ? {} : { loading: "lazy", decoding: "async" };
    const title = displayTitle(item);
    let link;
    if (kind2 === "top10") {
      const url = imageUrl(item, { type: "Primary", maxWidth: 300, quality: 85 }) || landscapeImage(item, { maxWidth: 300 });
      link = h("a", { class: "lfx-card__link", href: detailHref2(item), "aria-label": ariaLabel(item) }, [
        url ? h("img", { class: "lfx-card__img", src: url, alt: "", ...lazy }) : h("span", { class: "lfx-card__title" }, title)
      ]);
    } else {
      const img = landscapeFor(item);
      const poster = kind2 === "landscape" ? posterUrl(item) : null;
      const children = [];
      const src = img ? img.url : poster;
      if (src) {
        const imgEl = h("img", { class: "lfx-card__img", src, alt: "", ...lazy });
        children.push(poster ? h("picture", null, [h("source", { media: "(max-width: 799px)", srcset: poster }), imgEl]) : imgEl);
      }
      const titled = !img || !img.isThumb;
      if (titled) {
        const logo = logoImage(item, { maxWidth: 400 });
        children.push(logo ? h("img", { class: "lfx-card__logo", src: logo, alt: "", ...lazy }) : h("span", { class: "lfx-card__title" }, title));
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
      const p = progressPercent(item);
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
  var resizeSubs = /* @__PURE__ */ new Set();
  var resizeRaf = 0;
  function onResize() {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      for (const fn of [...resizeSubs]) fn();
    });
  }
  function subscribeResize(fn) {
    if (!resizeSubs.size) window.addEventListener("resize", onResize);
    resizeSubs.add(fn);
    return () => {
      resizeSubs.delete(fn);
      if (resizeSubs.size) return;
      window.removeEventListener("resize", onResize);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = 0;
    };
  }
  function attachScroller({ track, prev: prev2, next, indicator }) {
    let raf3 = 0;
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
      raf3 = 0;
      const left = track.scrollLeft;
      const max = track.scrollWidth - track.clientWidth;
      const pw = pageWidth();
      const pages = Math.max(1, Math.ceil(cards().length / visible()));
      prev2.hidden = left <= 2;
      next.hidden = !(max > 2) || left >= max - 2;
      if (indicator) {
        if (pages !== shownPages) {
          shownPages = pages;
          indicator.textContent = "";
          for (let i = 0; i < pages; i++) indicator.append(document.createElement("span"));
        }
        indicator.hidden = pages <= 1;
        const page2 = left >= max - 2 && max > 2 ? pages - 1 : Math.min(pages - 1, Math.round(left / pw));
        Array.from(indicator.children).forEach((s, i) => s.classList.toggle("is-active", i === page2));
      }
    }
    const schedule4 = () => {
      if (!raf3) raf3 = requestAnimationFrame(update);
    };
    function go3(dir) {
      const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      const left = Math.max(0, track.scrollLeft + dir * pageWidth());
      if (typeof track.scrollTo === "function") track.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
      else track.scrollLeft = left;
    }
    const onPrev = () => go3(-1);
    const onNext = () => go3(1);
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
    prev2.addEventListener("click", onPrev);
    next.addEventListener("click", onNext);
    track.addEventListener("scroll", schedule4, { passive: true });
    track.addEventListener("focusin", onFocusIn);
    track.addEventListener("keydown", onKey3);
    const unsubResize = subscribeResize(() => {
      if (raf3) cancelAnimationFrame(raf3);
      update();
    });
    const ls = links();
    ls.forEach((l, i) => {
      l.tabIndex = i === 0 ? 0 : -1;
    });
    schedule4();
    return () => {
      if (raf3) cancelAnimationFrame(raf3);
      raf3 = 0;
      prev2.removeEventListener("click", onPrev);
      next.removeEventListener("click", onNext);
      track.removeEventListener("scroll", schedule4);
      track.removeEventListener("focusin", onFocusIn);
      track.removeEventListener("keydown", onKey3);
      unsubResize();
    };
  }

  // src/js/core/net.js
  function netOk() {
    const c = typeof navigator !== "undefined" ? navigator.connection : null;
    if (!c) return true;
    return !(c.saveData || c.type === "cellular" || /^(slow-2g|2g|3g)$/.test(c.effectiveType || ""));
  }

  // src/js/features/rows/prefetch.js
  var MAX_WAIT = 15e3;
  var IMG_WAIT = 4e3;
  var POLL = 250;
  var TOP_ROWS = 3;
  var TOP_CARDS = 8;
  var RESUME_MS = 2e3;
  function allowPrefetch() {
    return netOk();
  }
  function paused2() {
    const cl2 = document.documentElement.classList;
    return document.hidden || isDataSaver() || cl2.contains("lfx-modal-open") || cl2.contains("lfx-tvm-bgplay") && !!document.querySelector("#lfx-tvm-bg video");
  }
  function heroSettled(slot) {
    if (!slot || slot.hidden) return true;
    if (slot.classList.contains("is-loading") || slot.querySelector(".lfx-bb--skel")) return false;
    if (slot.dataset.lfxTr === "wait") return false;
    return [...slot.querySelectorAll("img")].every((i) => i.getAttribute("loading") === "lazy" || i.complete);
  }
  var cardImgs = (row) => [...row.querySelectorAll(".lfx-card")].slice(0, TOP_CARDS).flatMap((c) => [...c.querySelectorAll("img")]);
  function startRowPrefetch({ slot, pending, load: load6, hero }) {
    if (!allowPrefetch()) return { stop() {
    }, notify() {
    } };
    const t0 = Date.now();
    const offs = [];
    let dead = false;
    let go3 = false;
    let busy2 = false;
    let imgSince = 0;
    let timer2 = null;
    let idleId = null;
    let rTimer = null;
    let mo3 = null;
    let wasPaused = false;
    const hold = () => {
      const p = paused2();
      if (p) wasPaused = true;
      return p;
    };
    const later = (fn, ms) => {
      clearTimeout(timer2);
      timer2 = setTimeout(fn, ms);
    };
    const idle = (fn) => {
      if (dead) return;
      if (typeof requestIdleCallback === "function") idleId = requestIdleCallback(fn, { timeout: 1e3 });
      else later(fn, 150);
    };
    function topReady() {
      const rows = [...slot.children].filter((c) => c.dataset && c.dataset.lfxRow !== void 0).slice(0, TOP_ROWS);
      if (!slot.querySelector(".lfx-card")) return !pending.size;
      const imgs = [];
      for (const r of rows) {
        if (r.classList.contains("is-loading")) {
          if (!pending.has(r)) return false;
          continue;
        }
        imgs.push(...cardImgs(r));
      }
      if (!imgSince) imgSince = Date.now();
      return Date.now() - imgSince >= IMG_WAIT || imgs.every((i) => i.complete);
    }
    function waitImgs(imgs, done) {
      let left = 0;
      let fin = false;
      const end = () => {
        if (fin) return;
        fin = true;
        clearTimeout(tm);
        done();
      };
      const tm = setTimeout(end, IMG_WAIT);
      offs.push(() => clearTimeout(tm));
      for (const i of imgs) {
        i.loading = "eager";
        if (i.complete) continue;
        left++;
        const one = () => {
          if (--left <= 0) end();
        };
        i.addEventListener("load", one, { once: true });
        i.addEventListener("error", one, { once: true });
        offs.push(() => {
          i.removeEventListener("load", one);
          i.removeEventListener("error", one);
        });
      }
      if (!left) end();
    }
    function next() {
      if (dead || busy2 || hold()) return;
      let el4 = null;
      for (const e of pending.keys()) {
        if (!e.isConnected || !e.classList.contains("is-loading")) {
          pending.delete(e);
          continue;
        }
        if (!el4 || el4.compareDocumentPosition(e) & 2) el4 = e;
      }
      if (!el4) return;
      const entry = pending.get(el4);
      pending.delete(el4);
      busy2 = true;
      Promise.resolve().then(() => load6(el4, entry)).catch(() => {
      }).then(() => {
        if (dead) return;
        waitImgs(cardImgs(el4), () => {
          busy2 = false;
          idle(next);
        });
      });
    }
    function tick() {
      if (dead || hold()) return;
      if (!go3) {
        go3 = Date.now() - t0 >= MAX_WAIT || heroSettled(hero && hero()) && topReady();
        if (!go3) {
          later(tick, POLL);
          return;
        }
      }
      next();
    }
    const onVis = () => {
      if (!paused2() && !dead && !busy2) later(tick, 0);
    };
    document.addEventListener("visibilitychange", onVis);
    const resume = () => {
      if (!dead && !busy2 && !paused2()) later(tick, 0);
    };
    if (typeof MutationObserver === "function") {
      wasPaused = paused2();
      mo3 = new MutationObserver(() => {
        const p = paused2();
        if (p === wasPaused) return;
        wasPaused = p;
        clearTimeout(rTimer);
        if (!p && !dead) rTimer = setTimeout(resume, RESUME_MS);
      });
      mo3.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    }
    offs.push(onDataSaverChange(() => {
      const p = paused2();
      wasPaused = p;
      clearTimeout(rTimer);
      if (!p && !dead) rTimer = setTimeout(resume, RESUME_MS);
    }));
    later(tick, POLL);
    return {
      stop() {
        dead = true;
        clearTimeout(timer2);
        clearTimeout(rTimer);
        if (mo3) mo3.disconnect();
        if (idleId != null && typeof cancelIdleCallback === "function") cancelIdleCallback(idleId);
        document.removeEventListener("visibilitychange", onVis);
        offs.splice(0).forEach((f) => f());
      },
      notify() {
        if (go3 && !busy2 && !dead) idle(next);
      }
    };
  }

  // src/js/features/rows/sources.js
  var MOVIE_SERIES = "Movie,Series";
  function asItems(res) {
    if (Array.isArray(res)) return res;
    return res && Array.isArray(res.Items) ? res.Items : [];
  }
  var newSeriesCache = { at: 0, promise: null, value: null };
  var TEN_MIN = 10 * 60 * 1e3;
  var NEW_SERIES_LIMIT = 200;
  function storageKey2() {
    return `lfx-newseries:${getUserId() || "anon"}`;
  }
  function readStored(now) {
    try {
      const raw = JSON.parse(sessionStorage.getItem(storageKey2()) || "null");
      if (raw && Array.isArray(raw.ids) && now - raw.at >= 0 && now - raw.at < TEN_MIN) return new Set(raw.ids);
    } catch {
    }
    return null;
  }
  function writeStored(now, set) {
    try {
      sessionStorage.setItem(storageKey2(), JSON.stringify({ at: now, ids: [...set] }));
    } catch {
    }
  }
  function peekNewSeriesIds(now = Date.now()) {
    if (newSeriesCache.value && now - newSeriesCache.at < TEN_MIN) return newSeriesCache.value;
    return readStored(now);
  }
  function getNewSeriesIds(now = Date.now()) {
    if (newSeriesCache.promise && now - newSeriesCache.at < TEN_MIN) return newSeriesCache.promise;
    const stored = readStored(now);
    if (stored) {
      newSeriesCache = { at: now, promise: Promise.resolve(stored), value: stored };
      return newSeriesCache.promise;
    }
    const promise = getItems({
      IncludeItemTypes: "Episode",
      Recursive: true,
      SortBy: "DateCreated",
      SortOrder: "Descending",
      Fields: "SeriesId,DateCreated,PremiereDate",
      EnableImages: false,
      EnableUserData: false,
      Limit: NEW_SERIES_LIMIT
    }).then((res) => {
      const set = newSeriesIdsFrom(asItems(res), now);
      if (newSeriesCache.promise === promise) newSeriesCache.value = set;
      writeStored(now, set);
      return set;
    }).catch((e) => {
      console.warn("[LenzFlix] Neue-Folgen-Abfrage fehlgeschlagen", e && e.message);
      if (newSeriesCache.promise === promise) newSeriesCache = { at: 0, promise: null, value: null };
      return /* @__PURE__ */ new Set();
    });
    newSeriesCache = { at: now, promise, value: null };
    return promise;
  }
  var MIN_CHART_ROW = 5;
  function chartSpecs() {
    return [
      { id: "top10-series", title: `Top 10 Serien auf ${brandName()}`, key: "series" },
      { id: "top10-movies", title: `Top 10 Filme auf ${brandName()}`, key: "movies" }
    ];
  }
  async function buildChartDefs() {
    try {
      const charts = await getCharts();
      if (!charts) return [];
      const specs = chartSpecs();
      const lists = await Promise.all(specs.map((s) => resolveChartItems(charts[s.key], { limit: 10 })));
      const defs = [];
      specs.forEach((s, i) => {
        const list = lists[i];
        if (list.length >= MIN_CHART_ROW) defs.push({ id: s.id, title: s.title, kind: "top10", load: () => list });
      });
      return defs;
    } catch (e) {
      console.warn("[LenzFlix] Chart-Zeilen nicht aufgebaut", e && e.message);
      return [];
    }
  }
  var VIEWS_TTL = 5 * 6e4;
  var degraded = /* @__PURE__ */ new WeakSet();
  function wrapRow(def) {
    const key = homeKey(getUserId(), "row", def.id);
    const orig = def.load;
    def.cacheKey = key;
    def.load = async (d = def) => {
      const snap = await cached(key, async () => ({ items: await orig(d), id: d.id, title: d.title }), HOME_TTL);
      d.id = snap.id;
      d.title = snap.title;
      return snap.items;
    };
    return def;
  }
  var defsKey = ({ seed = dayKey(), genreCount = 6, deferCharts = false } = {}) => homeKey(getUserId(), "defs", seed, genreCount, deferCharts ? 1 : 0);
  var peekRowDefs = (opts) => peekCached(defsKey(opts));
  function buildRowDefs(opts = {}) {
    const key = defsKey(opts);
    const p = cached(key, () => computeRowDefs(opts), HOME_TTL);
    p.then((defs) => {
      if (degraded.has(defs)) clearCache(key);
    }, () => {
    });
    return p;
  }
  async function computeRowDefs({ seed = dayKey(), genreCount = 6, deferCharts = false } = {}) {
    const [viewsRes, genresRes] = await Promise.allSettled([
      cached(`views:${getUserId()}`, getViews, VIEWS_TTL),
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
    const newTop10 = () => items({
      IncludeItemTypes: MOVIE_SERIES,
      Recursive: true,
      SortBy: "DateCreated",
      SortOrder: "Descending",
      Limit: 10
    }).then(selectTop10);
    const fallbackDef = () => ({ id: "top10", title: `Top 10: Neu auf ${brandName()}`, kind: "top10", load: newTop10 });
    if (deferCharts) {
      if (!getChartsUrl()) defs.push(fallbackDef());
      else {
        const chartDefs = buildChartDefs();
        const specs = chartSpecs();
        specs.forEach((s, i) => {
          defs.push({
            id: s.id,
            title: s.title,
            kind: "top10",
            async load(def) {
              const found = await chartDefs;
              if (found.length) {
                const hit = found.find((d) => d.id === s.id);
                return hit ? hit.load() : [];
              }
              if (i !== 0) return [];
              const fb = fallbackDef();
              def.id = fb.id;
              def.title = fb.title;
              return fb.load();
            }
          });
        });
      }
    } else {
      const chartDefs = await buildChartDefs();
      if (chartDefs.length) defs.push(...chartDefs);
      else defs.push(fallbackDef());
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
    defs.forEach(wrapRow);
    if (viewsRes.status !== "fulfilled" || genresRes.status !== "fulfilled") degraded.add(defs);
    return defs;
  }

  // src/js/features/rows.js
  var ROWS_READY_EVENT2 = "lfx:rows-ready";
  function skeleton(def) {
    const cards = [];
    for (let i = 0; i < 6; i++) cards.push(h("div", { class: "lfx-skel" }));
    return h("section", { class: `lfx-row lfx-row--${def.kind}${def.kind === "landscape" ? " lfx-row--poster" : ""} is-loading`, dataset: { lfxRow: def.id } }, [
      h("div", { class: "lfx-row__head" }, [h("h2", { class: "lfx-row__title" }, def.title || "")]),
      h("div", { class: "lfx-row__viewport" }, [h("div", { class: "lfx-row__skeleton" }, cards)])
    ]);
  }
  var EAGER_ROWS = 3;
  var EAGER_CARDS = 8;
  function fill2(rowEl, def, items, newSeries, eager = false) {
    const now = Date.now();
    const cards = items.map((it, i) => createCard(it, {
      kind: def.kind,
      rank: def.kind === "top10" ? i + 1 : 0,
      badge: badgeFor(it, newSeries, now),
      eager: eager && i < EAGER_CARDS
    }));
    const track = h("div", { class: "lfx-row__track", role: "list", "aria-label": def.title || "" }, cards);
    const prev2 = chevronButton("prev", "Zur\xFCck");
    const next = chevronButton("next", "Weiter");
    const indicator = h("div", { class: "lfx-row__pages", "aria-hidden": "true", hidden: true });
    rowEl.querySelector(".lfx-row__head").append(indicator);
    const viewport = rowEl.querySelector(".lfx-row__viewport");
    viewport.textContent = "";
    viewport.append(prev2, track, next);
    rowEl.querySelector(".lfx-row__title").textContent = def.title || "";
    rowEl.classList.remove("is-loading");
    return attachScroller({ track, prev: prev2, next, indicator });
  }
  function render4(slot) {
    let disposed = false;
    let observer2 = null;
    let prefetch = null;
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
    let newSeries = peekNewSeriesIds();
    let newSeriesStarted = false;
    const filled = [];
    let readySent = false;
    function signalReady() {
      if (readySent || disposed) return;
      readySent = true;
      document.dispatchEvent(new CustomEvent(ROWS_READY_EVENT2));
    }
    function applyNewSeries(set) {
      const now = Date.now();
      for (const { items, rowEl } of filled) {
        if (!rowEl.isConnected) continue;
        for (const card3 of rowEl.querySelectorAll(".lfx-card[data-lfx-id]")) {
          const it = items.get(card3.dataset.lfxId);
          if (it && it.Type === "Series") setCardBadge(card3, badgeFor(it, set, now));
        }
      }
    }
    function loadNewSeriesLater() {
      if (newSeries || newSeriesStarted) return;
      newSeriesStarted = true;
      getNewSeriesIds().then((set) => {
        if (disposed) return;
        newSeries = set;
        applyNewSeries(set);
      }, () => {
      });
    }
    function showRow(rowEl, def, items, eager) {
      putItems(items);
      if (rowEl.dataset.lfxRow !== def.id) rowEl.dataset.lfxRow = def.id;
      disposers.push(fill2(rowEl, def, items, newSeries, eager));
      if (items.some((i) => i.Type === "Series")) {
        filled.push({ rowEl, items: new Map(items.map((i) => [i.Id, i])) });
        loadNewSeriesLater();
      }
      signalReady();
    }
    async function loadRow(rowEl, def) {
      try {
        const items = (await def.load(def)).filter((i) => i && i.Id);
        if (disposed) return;
        if (!items.length) {
          rowEl.remove();
          return;
        }
        showRow(rowEl, def, items, false);
      } catch (e) {
        console.warn(`[LenzFlix] Zeile "${def.id}" nicht geladen`, e && e.message);
        if (!disposed) rowEl.remove();
      }
    }
    (async () => {
      if (!isReady()) {
        console.warn("[LenzFlix] Zeilen: keine Anmeldung");
        signalReady();
        return;
      }
      let defs;
      try {
        defs = peekRowDefs({ deferCharts: true }) || await buildRowDefs({ deferCharts: true });
      } catch (e) {
        console.warn("[LenzFlix] Zeilen konnten nicht aufgebaut werden", e && e.message);
        signalReady();
        return;
      }
      if (disposed) return;
      const pending = /* @__PURE__ */ new Map();
      let shown3 = 0;
      for (const def of defs) {
        const snap = def.cacheKey ? peekCached(def.cacheKey) : void 0;
        if (snap) {
          const items = snap.items.filter((i) => i && i.Id);
          if (!items.length) continue;
          def.id = snap.id;
          def.title = snap.title;
          const el5 = skeleton(def);
          slot.append(el5);
          showRow(el5, def, items, shown3++ < EAGER_ROWS);
          continue;
        }
        const el4 = skeleton(def);
        pending.set(el4, def);
        slot.append(el4);
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
        }, { rootMargin: isDataSaver() ? "100px 0px" : "600px 0px" });
        for (const el4 of pending.keys()) observer2.observe(el4);
      } else {
        for (const [el4, def] of [...pending]) {
          pending.delete(el4);
          loadRow(el4, def);
        }
      }
      prefetch = startRowPrefetch({
        slot,
        pending,
        hero: () => document.getElementById("lfx-billboard"),
        load: (el4, def) => {
          if (observer2) observer2.unobserve(el4);
          return loadRow(el4, def);
        }
      });
    })();
    return () => {
      disposed = true;
      if (prefetch) prefetch.stop();
      prefetch = null;
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
    const root7 = h("div", { id: HOME_ID, class: "lfx-home" }, [billboardSlot, rowsSlot]);
    tab2.prepend(root7);
    document.documentElement.classList.add("lfx-home-on");
    const ctx2 = { root: root7 };
    for (const [mod, slot] of [[billboard_exports, billboardSlot], [rows_exports, rowsSlot]]) {
      try {
        cleanups.push(mod.render(slot, ctx2));
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
  function resolveTarget2(el4) {
    if (!el4 || typeof el4.closest !== "function") return null;
    if (el4.closest(`#${POPUP_ID}, #lfx-modal, .lfx-modal, .vertical-wrap`)) return null;
    const own2 = el4.closest(".lfx-card[data-lfx-id]");
    if (own2) return { card: own2, id: own2.dataset.lfxId, type: own2.dataset.lfxType || "", own: true };
    const card3 = el4.closest(".emby-scroller .card[data-id]");
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
  function svg4(name) {
    return `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true" focusable="false">${ICONS2[name]}</svg>`;
  }
  var active2 = false;
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
    clearCache("home:");
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
          clearCache("home:");
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
    const btn3 = h("button", { type: "button", class: `lfx-hc__btn ${cls}`, "aria-label": label });
    const tip = h("span", { class: "lfx-hc__tip", "aria-hidden": "true" }, label);
    btn3.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return { btn: btn3, tip, wrap: h("span", { class: "lfx-hc__btnwrap" }, [btn3, tip]) };
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
    setButton(s.btns.play, "Abspielen", svg4("play"));
    setButton(
      s.btns.list,
      s.fav ? "Aus Meiner Liste entfernen" : "Zu Meiner Liste hinzuf\xFCgen",
      s.fav ? svg4("check") : svg4("plus"),
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
    setButton(s.btns.more, "Weitere Infos", svg4("chevron"));
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
    const el4 = h("div", { id: POPUP_ID, class: "lfx-hc", role: "dialog", "aria-label": "Titel" }, [media, info]);
    s.el = el4;
    s.img = img;
    s.overlay = overlay;
    s.body = body;
    return el4;
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
    const el4 = buildPopup(s);
    session2 = s;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = window.innerHeight;
    const rect = computePopupRect(cardRect, vw, SCALE, { minWidth: MIN_WIDTH, viewportH: vh });
    el4.style.left = `${rect.left}px`;
    el4.style.top = `${rect.top}px`;
    el4.style.width = `${rect.width}px`;
    render5(s);
    document.body.append(el4);
    const total = el4.offsetHeight;
    let top = rect.top;
    if (total && top + total > vh - 8) top = Math.max(8, vh - 8 - total);
    el4.style.top = `${top}px`;
    const k = cardRect.width / rect.width;
    const dx = cardRect.left - rect.left;
    const dy = cardRect.top + cardRect.height / 2 - (top + rect.imageHeight * k / 2);
    el4.style.setProperty("--lfx-hc-from", `translate(${dx}px, ${dy}px) scale(${k})`);
    void el4.offsetWidth;
    el4.classList.add("is-open");
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
  function pointerStillInside(s, el4) {
    if (el4 && el4.isConnected && (s.el.contains(el4) || s.card.contains(el4))) return true;
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
    if (active2) return;
    active2 = true;
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
  function stop3() {
    active2 = false;
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
      stop3();
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
  var ON_CLASS2 = "lfx-newpopular-on";
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
    document.documentElement.classList.remove(ON_CLASS2);
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
  function svg5(path) {
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
    b.append(svg5(icon5));
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
      btn3.setAttribute("aria-label", label);
      btn3.title = label;
      btn3.querySelector("svg").innerHTML = fav ? ICON_CHECK2 : ICON_PLUS2;
      btn3.classList.toggle("is-on", fav);
      btn3.setAttribute("aria-pressed", String(fav));
    }
    const btn3 = roundButton2("Meine Liste", ICON_PLUS2, async () => {
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
    return btn3;
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
      badge: badgeFor(it, newSeries, now)
    }));
    const track = h("div", { class: "lfx-row__track", role: "list", "aria-label": title }, cards);
    const prev2 = chevronButton("prev", "Zur\xFCck");
    const next = chevronButton("next", "Weiter");
    const indicator = h("div", { class: "lfx-row__pages", "aria-hidden": "true", hidden: true });
    const el4 = h("div", { class: "lfx-rows" }, [
      h("section", { class: `lfx-row lfx-row--${kind2}` }, [
        h("div", { class: "lfx-row__head" }, [h("h2", { class: "lfx-row__title" }, title), indicator]),
        h("div", { class: "lfx-row__viewport" }, [prev2, track, next])
      ])
    ]);
    return { el: el4, scroller: { track, prev: prev2, next, indicator } };
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
    const root7 = h("div", { id: ROOT_ID3, class: "lfx-np" }, [nav, ...sections.values()]);
    tab2.prepend(root7);
    document.documentElement.classList.add(ON_CLASS2);
    setActive("new");
    let raf3 = 0;
    const onScroll7 = () => {
      if (raf3) return;
      raf3 = requestAnimationFrame(() => {
        raf3 = 0;
        let current7 = null;
        for (const [id, sec] of sections) {
          if (sec.isConnected && sec.getBoundingClientRect().top <= 170) current7 = id;
        }
        if (current7) setActive(current7);
      });
    };
    window.addEventListener("scroll", onScroll7, { passive: true });
    function drop2(id) {
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
      const list = root7.querySelector(".lfx-np__list");
      for (const id of removed) {
        root7.querySelectorAll("[data-lfx-id]").forEach((el4) => {
          if (el4.dataset.lfxId === id) el4.remove();
        });
      }
      if (list && removed.length && !list.children.length) drop2("new");
      if (list) {
        for (const id of updated) {
          const fresh = getStoredItem(id);
          const entry = [...list.children].find((el4) => el4.dataset.lfxId === id);
          if (fresh && entry) entry.replaceWith(createNewEntry(fresh, newSeriesIds));
        }
      }
    }
    cleanups2.push(onItemsChanged(onChanged2));
    async function fill4(id, loader, renderer, fallbackLabel) {
      try {
        const res = await loader();
        const items = Array.isArray(res) ? res : res.items;
        const meta2 = Array.isArray(res) ? {} : res;
        if (disposed) return;
        if (!items.length) {
          drop2(id);
          return;
        }
        putItems(items);
        const newSeries = await getNewSeriesIds();
        if (disposed) return;
        newSeriesIds = newSeries;
        if (fallbackLabel && !meta2.charted) relabel(id, fallbackLabel);
        renderer(sections.get(id), items, newSeries, meta2);
      } catch (e) {
        console.warn(`[LenzFlix] Neu und beliebt "${id}" nicht geladen`, e && e.message);
        if (!disposed) drop2(id);
      }
    }
    const rowRenderer = (title, kind2, fallbackTitle) => (sec, items, newSeries, meta2 = {}) => {
      const row = createRow(meta2.charted || !fallbackTitle ? title : fallbackTitle, items, kind2, newSeries);
      sec.querySelector(".lfx-np__heading")?.remove();
      if (meta2.charted) {
        row.el.querySelector(".lfx-row__head").after(h("p", { class: "lfx-np__sub" }, chartSubtitle(meta2.windowDays)));
      }
      sec.append(row.el);
      scrollers.push(attachScroller(row.scroller));
    };
    if (isReady()) {
      fill4("new", loadNew, (sec, items, newSeries) => {
        sec.append(h("div", { class: "lfx-np__list" }, items.map((it) => createNewEntry(it, newSeries))));
      });
      fill4("watched", loadMostWatchedSection, rowRenderer("Am h\xE4ufigsten geschaut", "landscape"));
      fill4("top-series", () => loadTopSection("Series"), rowRenderer("Top 10 Serien", "top10", "Neueste Serien"), "Neueste Serien");
      fill4("top-movies", () => loadTopSection("Movie"), rowRenderer("Top 10 Filme", "top10", "Neueste Filme"), "Neueste Filme");
    } else {
      console.warn("[LenzFlix] Neu und beliebt: keine Anmeldung");
    }
    cleanups2.push(() => {
      disposed = true;
      window.removeEventListener("scroll", onScroll7);
      if (raf3) cancelAnimationFrame(raf3);
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
    match: (route) => isNewRoute(route) && !isTv() && !isTheme("live"),
    mount: () => ensure2(),
    update: () => ensure2(),
    unmount: () => {
      clearTimeout(waitTimer2);
      teardown4();
    }
  };
  var newpopular_default = newPopularFeature;

  // src/js/core/themejs.js
  var CLASS3 = "lfx-theme-js";
  var FILES2 = { store: "lenzstore", live: "lenzlive", tvmode: "lenztvmode" };
  var GLOBALS = { store: "LenzFlixStore3D", live: "LenzFlixLive", tvmode: "LenzFlixTvMode" };
  var inflight4 = /* @__PURE__ */ new Map();
  function themeJsUrl(id) {
    const file = FILES2[id];
    if (!file) return null;
    const { base, min, query: query2 } = resolveThemeCssBase();
    return `${base}${file}${min ? ".min" : ""}.js${query2 || ""}`;
  }
  var hasGlobal = (id) => Boolean(window[GLOBALS[id]]);
  function findTag(id) {
    for (const s of document.querySelectorAll(`script.${CLASS3}`)) {
      if (s.getAttribute("data-lfx-theme") === id) return s;
    }
    return null;
  }
  function ensureThemeJs(id, { timeout = 2e4 } = {}) {
    if (!FILES2[id]) return Promise.resolve(true);
    if (hasGlobal(id)) return Promise.resolve(true);
    if (inflight4.has(id)) return inflight4.get(id);
    findTag(id)?.remove();
    const script = document.createElement("script");
    script.className = CLASS3;
    script.setAttribute("data-lfx-theme", id);
    script.async = true;
    const p = new Promise((resolve2) => {
      let done = false;
      let timer2 = null;
      const finish3 = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer2);
        script.onload = script.onerror = null;
        if (inflight4.get(id) === p) inflight4.delete(id);
        if (!ok) script.remove();
        resolve2(ok);
      };
      script.onload = () => finish3(hasGlobal(id));
      script.onerror = () => finish3(false);
      timer2 = setTimeout(() => finish3(false), timeout);
      script.src = themeJsUrl(id);
      document.head.appendChild(script);
    });
    inflight4.set(id, p);
    return p;
  }
  function removeThemeJs() {
    for (const s of [...document.querySelectorAll(`script.${CLASS3}`)]) {
      inflight4.delete(s.getAttribute("data-lfx-theme"));
      s.remove();
    }
  }

  // src/js/core/addoncss.js
  var CLASS4 = "lfx-addon-css";
  var inflight5 = /* @__PURE__ */ new Map();
  function addonCssUrl(name) {
    const { base, min, query: query2 } = resolveThemeCssBase();
    return `${base}${name}${min ? ".min" : ""}.css${query2 || ""}`;
  }
  function findLink(name) {
    for (const l of document.querySelectorAll(`link.${CLASS4}`)) {
      if (l.getAttribute("data-lfx-addon") === name) return l;
    }
    return null;
  }
  function ensureAddonCss(name, { timeout = 8e3 } = {}) {
    const existing = findLink(name);
    if (existing && existing.getAttribute("data-lfx-loaded") === "1") return Promise.resolve(true);
    if (existing && inflight5.has(name)) return inflight5.get(name);
    existing?.remove();
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.className = CLASS4;
    link.setAttribute("data-lfx-addon", name);
    const p = new Promise((resolve2) => {
      let done = false;
      let timer2 = null;
      const finish3 = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer2);
        link.onload = link.onerror = null;
        if (inflight5.get(name) === p) inflight5.delete(name);
        if (ok) link.setAttribute("data-lfx-loaded", "1");
        else link.remove();
        resolve2(ok);
      };
      link.onload = () => finish3(true);
      link.onerror = () => finish3(false);
      timer2 = setTimeout(() => finish3(false), timeout);
      link.href = addonCssUrl(name);
      document.head.appendChild(link);
    });
    inflight5.set(name, p);
    return p;
  }
  function removeAddonCss(name) {
    for (const l of [...document.querySelectorAll(`link.${CLASS4}`)]) {
      if (name && l.getAttribute("data-lfx-addon") !== name) continue;
      inflight5.delete(l.getAttribute("data-lfx-addon"));
      l.remove();
    }
  }

  // src/js/features/live/data.js
  var PAGE_SIZE = 1e3;
  var EPISODE_PAGE_SIZE = 2e3;
  var MEM_TTL_MS = 6 * 60 * 60 * 1e3;
  var DAY_START_SHIFT_MS = 5 * 60 * 60 * 1e3;
  var DB_NAME = "lfx-live";
  var STORE = "catalog";
  var BASE_FIELDS = "Genres,OfficialRating,ProductionYear,PremiereDate,DateCreated,RunTimeTicks";
  var KEEP = {
    movies: ["Id", "Name", "RunTimeTicks", "Genres", "OfficialRating", "ProductionYear", "PremiereDate", "DateCreated", "LocalTrailerCount", "ImageTags", "BackdropImageTags"],
    series: ["Id", "Name", "Genres", "OfficialRating", "ProductionYear", "DateCreated", "ImageTags", "BackdropImageTags"],
    episodes: ["Id", "Name", "SeriesId", "SeriesName", "ParentIndexNumber", "IndexNumber", "RunTimeTicks", "PremiereDate", "DateCreated", "OfficialRating"],
    boxsets: ["Id", "Name", "ChildCount"]
  };
  var SOURCES = [
    { key: "movies", type: "Movie", fields: BASE_FIELDS, size: PAGE_SIZE, tags: true },
    { key: "series", type: "Series", fields: BASE_FIELDS, size: PAGE_SIZE, tags: true },
    { key: "episodes", type: "Episode", fields: "DateCreated,PremiereDate,RunTimeTicks,OfficialRating", size: EPISODE_PAGE_SIZE },
    { key: "boxsets", type: "BoxSet", fields: "ChildCount", size: PAGE_SIZE }
  ];
  var asItems2 = (res) => Array.isArray(res) ? res : res && Array.isArray(res.Items) ? res.Items : [];
  function compact(item, keys) {
    const out = {};
    for (const k of keys) if (item[k] !== void 0 && item[k] !== null) out[k] = item[k];
    if (out.ImageTags) {
      const t = {};
      if (out.ImageTags.Thumb) t.Thumb = out.ImageTags.Thumb;
      if (out.ImageTags.Primary) t.Primary = out.ImageTags.Primary;
      out.ImageTags = t;
    }
    if (Array.isArray(out.BackdropImageTags)) out.BackdropImageTags = out.BackdropImageTags.slice(0, 1);
    return out;
  }
  function broadcastDayKey(now = Date.now()) {
    const d = new Date(now - DAY_START_SHIFT_MS);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  var cacheKey = (uid, now) => `${uid || "anon"}:${broadcastDayKey(now)}`;
  async function fetchType(src, onPart) {
    const out = [];
    const seen = /* @__PURE__ */ new Set();
    let total = null;
    for (let start10 = 0; ; start10 += src.size) {
      const res = await getItems({
        Recursive: true,
        IncludeItemTypes: src.type,
        Fields: src.fields,
        // Filme/Serien liefern Bild-Tags (ImageTypeLimit 1); Folgen/Sammlungen ohne Bilder
        ...src.tags ? { EnableImages: true, ImageTypeLimit: 1, EnableImageTypes: "Primary,Thumb,Backdrop" } : { EnableImages: false },
        EnableUserData: false,
        StartIndex: start10,
        Limit: src.size
      });
      const page2 = asItems2(res);
      for (const it of page2) {
        if (!it || !it.Id || seen.has(it.Id)) continue;
        seen.add(it.Id);
        out.push(compact(it, KEEP[src.key]));
      }
      if (res && typeof res.TotalRecordCount === "number") total = res.TotalRecordCount;
      const done = page2.length < src.size || total !== null && start10 + src.size >= total;
      onPart(src.key, done ? 1 : total ? Math.min(0.99, (start10 + src.size) / total) : 0.5);
      if (done) break;
    }
    return out;
  }
  async function fetchCatalog({ onProgress } = {}, now = Date.now()) {
    const part = {};
    const report = () => {
      if (typeof onProgress !== "function") return;
      const f = SOURCES.reduce((s, x) => s + (part[x.key] || 0), 0) / SOURCES.length;
      try {
        onProgress(f, "Sendersuchlauf \u2026");
      } catch {
      }
    };
    const results = await Promise.all(SOURCES.map((src) => fetchType(src, (k, f) => {
      part[k] = f;
      report();
    })));
    const [movies, series, episodes, boxsets] = results;
    return { movies, series, episodes, boxsets, loadedAt: now };
  }
  function hasIdb() {
    try {
      return typeof indexedDB !== "undefined" && indexedDB !== null;
    } catch {
      return false;
    }
  }
  function openDb() {
    return new Promise((resolve2, reject) => {
      let req;
      try {
        req = indexedDB.open(DB_NAME, 1);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve2(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("IndexedDB blockiert"));
    });
  }
  var idbDone = (tx) => new Promise((resolve2, reject) => {
    tx.oncomplete = () => resolve2();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  async function idbGet(key) {
    const db = await openDb();
    try {
      return await new Promise((resolve2, reject) => {
        const r = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
        r.onsuccess = () => resolve2(r.result || null);
        r.onerror = () => reject(r.error);
      });
    } finally {
      db.close();
    }
  }
  async function idbPut(uid, key, value) {
    const db = await openDb();
    try {
      const tx = db.transaction(STORE, "readwrite");
      const os = tx.objectStore(STORE);
      const prefix = `${uid || "anon"}:`;
      const keys = await new Promise((resolve2, reject) => {
        const r = os.getAllKeys();
        r.onsuccess = () => resolve2(r.result || []);
        r.onerror = () => reject(r.error);
      });
      for (const k of keys) if (typeof k === "string" && k.startsWith(prefix) && k !== key) os.delete(k);
      os.put(value, key);
      await idbDone(tx);
    } finally {
      db.close();
    }
  }
  function validRaw(x) {
    return Boolean(x && Array.isArray(x.movies) && Array.isArray(x.series) && Array.isArray(x.episodes) && Array.isArray(x.boxsets));
  }
  function loadCatalog({ onProgress, now } = {}) {
    const t = typeof now === "function" ? now() : Number.isFinite(now) ? now : Date.now();
    const uid = getUserId();
    const key = cacheKey(uid, t);
    return cached(`live:catalog:${key}`, async () => {
      if (hasIdb()) {
        try {
          const hit = await idbGet(key);
          if (validRaw(hit)) {
            if (typeof onProgress === "function") onProgress(1, "Sendersuchlauf \u2026");
            return hit;
          }
        } catch {
        }
      }
      const raw = await fetchCatalog({ onProgress }, t);
      if (hasIdb()) {
        try {
          await idbPut(uid, key, raw);
        } catch {
        }
      }
      return raw;
    }, MEM_TTL_MS);
  }

  // src/js/features/live/config.js
  var MIN_NO = 5;
  var MAX_NO = 16;
  var stripQuotes = (s) => String(s == null ? "" : s).trim().replace(/^["'\s]+|["'\s]+$/g, "");
  function put(out, no, label) {
    const n = Number(no);
    if (!Number.isInteger(n) || n < MIN_NO || n > MAX_NO) return;
    const l = stripQuotes(label);
    if (l) out[n] = l;
  }
  function parseChannelConfig(raw) {
    const out = {};
    if (raw && typeof raw === "object") {
      for (const [k, v] of Object.entries(raw)) {
        if (typeof v === "string") put(out, k, v);
      }
      return out;
    }
    const s = stripQuotes(raw);
    if (!s) return out;
    for (const part of s.split(";")) {
      const i = part.indexOf("=");
      if (i < 0) continue;
      put(out, part.slice(0, i).trim(), part.slice(i + 1));
    }
    return out;
  }
  function getChannelConfig() {
    const cfg = window.LenzFlixConfig && window.LenzFlixConfig.liveChannels;
    if (cfg !== void 0 && cfg !== null && cfg !== "") {
      const parsed = parseChannelConfig(cfg);
      if (Object.keys(parsed).length) return parsed;
    }
    try {
      return parseChannelConfig(getComputedStyle(document.documentElement).getPropertyValue("--lfx-live-channels"));
    } catch {
      return {};
    }
  }

  // src/js/features/live/zapflag.js
  var ZAP_KEY = "lfx-zapstats";
  var ZAP_WARM_KEY = "lfx-zapwarm";
  var FORCE_HLS_KEY = "lfx-forcehls";
  try {
    window.localStorage.removeItem("lfx-zapvariant");
  } catch {
  }
  function hashParam(name) {
    try {
      return parseHash(window.location.hash).params.get(name);
    } catch {
      return null;
    }
  }
  function zapStatsEnabled() {
    let v = null;
    try {
      v = parseHash(window.location.hash).params.get("lfxdebug");
    } catch {
    }
    try {
      if (v === "1") window.localStorage.setItem(ZAP_KEY, "1");
      else if (v === "0") {
        window.localStorage.removeItem(ZAP_KEY);
        return false;
      }
      return window.localStorage.getItem(ZAP_KEY) === "1";
    } catch {
      return v === "1";
    }
  }
  function zapWarmEnabled() {
    const v = hashParam("lfxwarm");
    let off;
    try {
      if (v === "1" || v === "0") window.localStorage.setItem(ZAP_WARM_KEY, v);
      off = window.localStorage.getItem(ZAP_WARM_KEY) === "0";
    } catch {
      off = v === "0";
    }
    return !off && netOk() && !isDataSaver();
  }
  function defineZapWarm(deps) {
    Object.defineProperty(deps, "zapWarm", { get: zapWarmEnabled, enumerable: true, configurable: true });
    Object.defineProperty(deps, "zapPrefetch", { get: () => !isDataSaver(), enumerable: true, configurable: true });
    return deps;
  }
  function forceHlsEnabled() {
    const v = hashParam("lfxhls");
    let on;
    try {
      if (v === "1") window.localStorage.setItem(FORCE_HLS_KEY, "1");
      else if (v === "0") window.localStorage.removeItem(FORCE_HLS_KEY);
      on = window.localStorage.getItem(FORCE_HLS_KEY) === "1";
    } catch {
      on = v === "1";
    }
    return on && zapStatsEnabled();
  }

  // src/js/features/live/deps.js
  var asItems3 = (res) => Array.isArray(res) ? res : res && Array.isArray(res.Items) ? res.Items : [];
  function fatalText(err) {
    const m = err && err.message ? String(err.message) : "";
    return m.replace(/(api_key|ApiKey)=[^&\s]+/gi, "$1=\u2026").slice(0, 200);
  }
  async function loadUser() {
    const u = await Promise.resolve().then(() => getUser()).catch(() => null);
    const cfg = u && u.Configuration || {};
    return {
      id: u && u.Id || getUserId() || "",
      name: u && u.Name || "",
      isAdmin: Boolean(u && u.Policy && u.Policy.IsAdministrator),
      audioLang: cfg.AudioLanguagePreference || "",
      subLang: cfg.SubtitleLanguagePreference || "",
      subMode: cfg.SubtitleMode || ""
    };
  }
  function safeStorage() {
    try {
      return window.localStorage || null;
    } catch {
      return null;
    }
  }
  function deviceId() {
    try {
      const c = window.ApiClient;
      return c && typeof c.deviceId === "function" && c.deviceId() || "";
    } catch {
      return "";
    }
  }
  function imageTagMap(raw) {
    const m = /* @__PURE__ */ new Map();
    for (const list of [raw && raw.movies, raw && raw.series]) {
      for (const it of Array.isArray(list) ? list : []) {
        if (it && it.Id && (it.ImageTags || it.BackdropImageTags)) m.set(it.Id, it);
      }
    }
    return m;
  }
  function taggedImageUrl(tags, id, o = {}) {
    const it = id ? tags.get(id) : null;
    const type = o.type || "Primary";
    const tag = it && (type === "Backdrop" ? (it.BackdropImageTags || [])[0] : it.ImageTags && it.ImageTags[type]);
    return imageUrlFor(id, tag ? { ...o, tag } : o);
  }
  function buildApiDeps(raw, user) {
    const tags = imageTagMap(raw);
    return defineZapWarm({
      catalog: raw,
      user,
      server: { deviceId: deviceId() },
      request: (method, path, o = {}) => requestJson(method, path, o),
      storage: safeStorage(),
      // Player: dauerhaft gemerkte Direct-Fehler
      forceHls: forceHlsEnabled(),
      // Player: HLS erzwingen (Hash lfxhls, nur mit Messanzeige)
      streamUrl: (path, params) => buildUrl(path, { ...params || {}, ApiKey: getAuth().token }),
      imageUrl: (id, o = {}) => taggedImageUrl(tags, id, o),
      getBoxSetItems: async (id) => {
        const res = await getItems({ ParentId: id, Fields: "", EnableImages: false, EnableUserData: false });
        return asItems3(res).map((x) => x.Id).filter(Boolean);
      },
      loadTrailer: async (itemId2) => {
        try {
          const item = await getItem(itemId2);
          const t = await loadLocalTrailer(item);
          if (!t) return null;
          const ticks = Number(t.RunTimeTicks);
          return { url: trailerUrl(t.Id), durMs: ticks > 0 ? Math.round(ticks / 1e4) : null };
        } catch {
          return null;
        }
      },
      // Inhaltsangaben (Fernsehzeitung, TV-Modus): eine Anfrage, Fehler → leere Map
      itemDetails: async (ids) => {
        const out = /* @__PURE__ */ new Map();
        const list = (Array.isArray(ids) ? ids : []).filter(Boolean);
        if (!list.length) return out;
        try {
          const res = await requestJson("GET", "/Items", {
            params: { userId: getUserId(), Ids: list.join(","), Fields: "Overview", EnableImages: false, EnableUserData: false }
          });
          for (const it of asItems3(res)) if (it && it.Id) out.set(it.Id, { overview: typeof it.Overview === "string" ? it.Overview : "" });
        } catch (e) {
          console.warn("[LenzFlix] live itemDetails", fatalText(e));
        }
        return out;
      },
      setPlayed: (id, v) => setPlayed(id, v),
      channelConfig: getChannelConfig()
    });
  }

  // src/js/features/tvmode/prefs.js
  var DEFAULTS = { volume: 0.8, muted: false, lastChannel: 1 };
  var storageKey3 = (name) => `lfx.tvm.${name}.${getUserId() || "anon"}`;
  var read = (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };
  var write = (key, value) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
    }
  };
  function getVolume() {
    const raw = read(storageKey3("volume"));
    if (raw === null || raw === "") return DEFAULTS.volume;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : DEFAULTS.volume;
  }
  var getMuted = () => read(storageKey3("muted")) === "1";
  function getLastChannel() {
    const v = Number(read(storageKey3("lastChannel")));
    return Number.isInteger(v) && v >= 1 && v <= 18 ? v : DEFAULTS.lastChannel;
  }
  function savePrefs(p) {
    if (!p || typeof p !== "object") return;
    if (typeof p.volume === "number" && Number.isFinite(p.volume) && p.volume >= 0 && p.volume <= 1) write(storageKey3("volume"), String(p.volume));
    if (typeof p.muted === "boolean") write(storageKey3("muted"), p.muted ? "1" : "0");
    if (Number.isInteger(p.lastChannel) && p.lastChannel >= 1 && p.lastChannel <= 18) write(storageKey3("lastChannel"), String(p.lastChannel));
  }

  // src/js/features/tvmode/route.js
  var ROOT_ID4 = "lfx-tvm";
  var ON_CLASS3 = "lfx-tvm-on";
  var TV_THEMES = ["flix", "plus", "prime"];
  var findHomeTab3 = () => {
    const tab2 = document.querySelector("#indexPage:not(.hide) #homeTab");
    return tab2 && tab2.isConnected ? tab2 : null;
  };
  var tvModeMatch = (route) => isTvModeRoute(route) && TV_THEMES.some(isTheme) && isModern() && !isTv() && isReady();

  // src/js/features/tvmode/unlock.js
  var INTENT_TTL_MS = 3e4;
  var held = null;
  var timer = null;
  var bound = false;
  function drop() {
    clearTimeout(timer);
    timer = null;
    held = null;
  }
  function onIntent() {
    drop();
    try {
      const v = document.createElement("video");
      v.playsInline = true;
      v.setAttribute("playsinline", "");
      const p = v.play();
      if (p && p.catch) p.catch(() => {
      });
      held = v;
      timer = setTimeout(drop, INTENT_TTL_MS);
    } catch {
    }
  }
  function takeIntentVideo() {
    const v = held;
    drop();
    return v;
  }
  function initUnlock() {
    if (bound) return;
    bound = true;
    window.addEventListener("lfx:tvmode-intent", onIntent);
  }
  function destroyUnlock() {
    if (bound) window.removeEventListener("lfx:tvmode-intent", onIntent);
    bound = false;
    drop();
  }

  // src/js/features/tvmode/page.js
  var ADDON = "lenztvmode";
  var CATALOG_SHARE = 0.65;
  var BLOCK = ".lfx-modal-open,.lfx-themepicker-open,.lfx-sheet-open,.lfx-menu-open,.lfx-prime-search-open";
  var gen = 0;
  var waitTimer3 = null;
  var inst = null;
  var ui = null;
  var themeOff = null;
  var saverOff = null;
  var html = () => document.documentElement;
  var coarse = () => {
    try {
      return Boolean(window.matchMedia && window.matchMedia("(pointer:coarse)").matches);
    } catch {
      return false;
    }
  };
  initUnlock();
  function disposeInstance() {
    const cur3 = inst;
    inst = null;
    if (!cur3) return;
    try {
      cur3.instance.dispose();
    } catch (e) {
      console.warn("[LenzFlix] tvmode dispose", fatalText(e));
    }
  }
  function watchTheme() {
    if (!themeOff) themeOff = onThemeChange(onTheme);
    if (!saverOff) saverOff = onDataSaverChange((active5) => {
      if (active5 && inst) {
        try {
          inst.instance.releaseWarm();
        } catch {
        }
      }
    });
  }
  function unwatchTheme() {
    if (themeOff) themeOff();
    themeOff = null;
    if (saverOff) saverOff();
    saverOff = null;
  }
  function onTheme() {
    const mounted = Boolean(ui);
    disposeInstance();
    removeAddonCss(ADDON);
    if (!mounted) {
      unwatchTheme();
      return;
    }
    if (TV_THEMES.includes(getTheme())) restartBoot();
  }
  function setProgress(fraction, label) {
    if (!ui || !ui.fill) return;
    const v = Math.max(Number(ui.fill.dataset.v || 0), Math.max(0, Math.min(1, Number(fraction) || 0)));
    ui.fill.dataset.v = String(v);
    ui.fill.style.width = `${Math.round(v * 100)}%`;
    if (label && ui.label) ui.label.textContent = label;
  }
  function buildBoot() {
    const fill4 = h("div", { class: "lfx-tvm__boot-fill" });
    fill4.style.width = "0%";
    const label = h("p", { class: "lfx-tvm__boot-text", "aria-live": "polite" }, "TV wird vorbereitet \u2026");
    const boot4 = h("div", { class: "lfx-tvm__boot", role: "status" }, [
      h("span", { class: "lfx-tvm__boot-spin", "aria-hidden": "true" }),
      label,
      h("div", { class: "lfx-tvm__boot-bar" }, [fill4])
    ]);
    return { boot: boot4, fill: fill4, label };
  }
  function attachBoot() {
    if (!ui) return;
    ui.boot.remove();
    ui.root.querySelector(".lfx-tvm__fallback")?.remove();
    Object.assign(ui, buildBoot());
    ui.root.classList.add("is-loading");
    ui.root.append(ui.boot);
  }
  function teardownUi() {
    if (ui) ui.root.remove();
    ui = null;
    document.getElementById(ROOT_ID4)?.remove();
    html().classList.remove(ON_CLASS3);
  }
  function showFallback(err) {
    if (!ui) return;
    ui.boot.remove();
    ui.root.classList.remove("is-loading");
    ui.root.querySelector(".lfx-tvm__fallback")?.remove();
    const btn3 = (text, fn, primary) => h("button", { type: "button", class: `lfx-tvm__fallback-btn${primary ? " is-primary" : ""}`, onclick: fn }, text);
    const detail = fatalText(err);
    ui.root.append(h("div", { class: "lfx-tvm__fallback", role: "alert" }, [
      h("p", { class: "lfx-tvm__fallback-text" }, detail ? `TV konnte nicht gestartet werden: ${detail}` : "TV konnte nicht gestartet werden."),
      h("div", { class: "lfx-tvm__fallback-actions" }, [
        btn3("Erneut versuchen", () => restartBoot(), true),
        btn3("Zur Startseite", () => {
          window.location.hash = "#/home";
        })
      ])
    ]));
  }
  var ret = (f) => (...a) => {
    try {
      return f(...a);
    } catch (e) {
      console.warn("[LenzFlix] tvmode dep", fatalText(e));
      return void 0;
    }
  };
  var blocked = () => isPopoverOpen() || html().matches(BLOCK);
  async function playFromStart(id) {
    let item = null;
    try {
      item = await getItem(id);
    } catch {
    }
    let ok = false;
    try {
      ok = await play(item && item.Id ? item : { Id: id }, { resume: false }) !== false;
    } catch (e) {
      console.warn("[LenzFlix] tvmode play", fatalText(e));
    }
    if (!ok) {
      try {
        toast("Wiedergabe konnte nicht gestartet werden");
      } catch {
      }
      if (ui && inst && inst.ready) {
        try {
          if (!inst.instance.isOn() && !inst.pip) inst.instance.start();
        } catch {
        }
      }
    }
    return ok;
  }
  function buildDeps(raw, user, hooks) {
    return defineZapWarm({
      // Spread kopiert den Getter zapWarm nur als Wert: neu setzen
      ...buildApiDeps(raw, user),
      savePrefs: ret((p) => savePrefs(p)),
      // alle Designs: Detailkarte als Overlay über dem weiterlaufenden TV (plus/prime mit „Zur Titelseite“)
      openDetails: ret((id) => {
        openModal(id, { overlay: true });
      }),
      playFromStart: ret(playFromStart),
      keysBlocked: ret(blocked),
      toast: ret((text) => toast(text)),
      onProgress: ret((f, label) => setProgress(CATALOG_SHARE + (1 - CATALOG_SHARE) * (Number(f) || 0), label)),
      onReady: ret(hooks.ready),
      onFatal: ret(hooks.fatal),
      onStopped: ret(hooks.stopped),
      onPip: ret((active5) => {
        if (inst) inst.pip = Boolean(active5);
      })
    });
  }
  function buildOpts(video2) {
    return {
      video: video2,
      lastChannel: getLastChannel(),
      volume: getVolume(),
      muted: getMuted(),
      phone: isMobile(),
      touch: coarse(),
      debug: window.__lfxTvmDebug === true,
      zapStats: zapStatsEnabled()
    };
  }
  async function boot(myGen) {
    setProgress(0.03, "TV wird vorbereitet \u2026");
    let loaded;
    try {
      const [cssOk, jsOk, raw, user] = await Promise.all([
        ensureAddonCss(ADDON),
        ensureThemeJs("tvmode"),
        loadCatalog({ onProgress: (f, label) => setProgress(0.05 + (CATALOG_SHARE - 0.05) * f, label) }),
        loadUser()
      ]);
      if (!cssOk || !jsOk || !window.LenzFlixTvMode || typeof window.LenzFlixTvMode.create !== "function") throw new Error("TV-Paket nicht geladen");
      loaded = { raw, user };
    } catch (e) {
      if (myGen === gen && ui) showFallback(e);
      return;
    }
    if (myGen !== gen || !ui) return;
    setProgress(CATALOG_SHARE, "Programm wird zusammengestellt \u2026");
    let fatal = false;
    let early = false;
    let instance = null;
    const finishReady = () => {
      if (!ui || !inst || inst.instance !== instance) return;
      inst.ready = true;
      ui.boot.remove();
      ui.root.classList.remove("is-loading");
      try {
        instance.start();
      } catch (e) {
        console.warn("[LenzFlix] tvmode start", fatalText(e));
      }
    };
    const deps = buildDeps(loaded.raw, loaded.user, {
      ready: () => {
        if (instance) finishReady();
        else early = true;
      },
      fatal: (err) => {
        fatal = true;
        disposeInstance();
        if (myGen === gen) showFallback(err);
      },
      stopped: ({ reason } = {}) => {
        if (ui || !inst || reason === "leave") return;
        disposeInstance();
      }
    });
    try {
      instance = window.LenzFlixTvMode.create(ui.root, deps, buildOpts(takeIntentVideo()));
      if (!instance) throw new Error("create() lieferte keine Instanz");
      if (fatal || myGen !== gen || !ui) {
        try {
          instance.dispose();
        } catch {
        }
        return;
      }
      inst = { instance, ready: false, pip: false };
      if (early) finishReady();
    } catch (e) {
      if (myGen === gen && ui) showFallback(e);
    }
  }
  function restartBoot() {
    if (!ui) return;
    disposeInstance();
    attachBoot();
    gen += 1;
    boot(gen);
  }
  function start2(tab2, myGen) {
    teardownUi();
    const { boot: bootEl, fill: fill4, label } = buildBoot();
    ui = { root: h("div", { id: ROOT_ID4, class: "lfx-tvm is-loading" }, [bootEl]), boot: bootEl, fill: fill4, label };
    tab2.prepend(ui.root);
    html().classList.add(ON_CLASS3);
    watchTheme();
    if (inst && inst.instance) {
      if (inst.ready) {
        ui.boot.remove();
        ui.root.classList.remove("is-loading");
      }
      try {
        inst.instance.resume(ui.root);
        if (inst.ready && !inst.pip && !inst.instance.isOn()) inst.instance.start();
      } catch (e) {
        console.warn("[LenzFlix] tvmode resume", fatalText(e));
        restartBoot();
      }
      return;
    }
    boot(myGen);
  }
  function ensure3() {
    clearTimeout(waitTimer3);
    const tab2 = findHomeTab3();
    const existing = document.getElementById(ROOT_ID4);
    if (tab2 && existing && ui && tab2.contains(existing)) return;
    gen += 1;
    const myGen = gen;
    let tries = 0;
    const poll = () => {
      if (myGen !== gen) return;
      const t = findHomeTab3();
      if (t) start2(t, myGen);
      else if (++tries < 30) waitTimer3 = setTimeout(poll, 200);
    };
    if (tab2) poll();
    else waitTimer3 = setTimeout(poll, 200);
  }
  function destroyTvMode() {
    gen += 1;
    clearTimeout(waitTimer3);
    waitTimer3 = null;
    disposeInstance();
    teardownUi();
    unwatchTheme();
    removeAddonCss(ADDON);
    removeThemeJs();
    destroyUnlock();
  }
  var tvModeFeature = {
    name: "tvmode",
    match: tvModeMatch,
    mount: () => ensure3(),
    update() {
      const tab2 = findHomeTab3();
      if (!tab2 || ui && tab2.contains(ui.root)) return;
      ensure3();
    },
    unmount() {
      gen += 1;
      clearTimeout(waitTimer3);
      waitTimer3 = null;
      if (inst) {
        let kept = false;
        try {
          kept = inst.instance.suspend() === true;
        } catch (e) {
          console.warn("[LenzFlix] tvmode suspend", fatalText(e));
        }
        if (!kept) disposeInstance();
      }
      teardownUi();
      if (!inst) unwatchTheme();
    }
  };
  var page_default = tvModeFeature;

  // src/js/features/tvmode/index.js
  var tvmodeFeatures = [page_default];

  // src/js/features/contextmenu.js
  var EXCLUDED4 = /^\/(video|login|dashboard|selectserver|addserver|startup|forgotpassword|resetpassword|wizard)/;
  var TARGET = ".lfx-card[data-lfx-id], .lfx-modal__ep[data-lfx-id]";
  var LONG_PRESS_MS = 500;
  var MOVE_TOLERANCE = 10;
  var CLICK_WINDOW_MS = 700;
  var DOUBLE_OPEN_MS = 800;
  var active3 = false;
  var listeners4 = [];
  var pressTimer = null;
  var press2 = null;
  var swallowUntil = 0;
  var lastLongPressAt = -Infinity;
  function resolve(el4) {
    if (!el4 || typeof el4.closest !== "function") return null;
    return el4.closest(TARGET);
  }
  function itemFor(el4, fallbackType) {
    const id = el4.dataset.lfxId;
    return getStoredItem(id) || { Id: id, Type: el4.dataset.lfxType || fallbackType || void 0 };
  }
  function openFor(el4, x, y) {
    const item = itemFor(el4);
    const opts = {};
    if (el4.classList.contains("lfx-modal__ep") && el4.parentElement) {
      opts.siblings = [...el4.parentElement.children].filter((n) => n.matches(".lfx-modal__ep[data-lfx-id]")).map((n) => itemFor(n, "Episode"));
    }
    openItemMenu(item, { x, y }, opts);
  }
  function inNativeDialog(el4) {
    return Boolean(el4.closest && el4.closest(".dialogContainer, .dialog"));
  }
  function onContextMenu(e) {
    const el4 = resolve(e.target);
    if (!el4) return;
    if (e.shiftKey) return;
    if (isMenuOpen() && inNativeDialog(el4)) return;
    e.preventDefault();
    e.stopPropagation();
    if (Date.now() - lastLongPressAt < DOUBLE_OPEN_MS) return;
    openFor(el4, e.clientX, e.clientY);
  }
  function cancelPress() {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
    press2 = null;
  }
  function onTouchStart(e) {
    if (e.touches && e.touches.length > 1) {
      cancelPress();
      return;
    }
    cancelPress();
    const el4 = resolve(e.target);
    if (!el4) return;
    if (isMenuOpen() && inNativeDialog(el4)) return;
    const t = e.touches && e.touches[0] || e;
    const state21 = { x: t.clientX, y: t.clientY, fired: false };
    press2 = state21;
    pressTimer = setTimeout(() => {
      pressTimer = null;
      if (press2 !== state21 || !el4.isConnected) return;
      state21.fired = true;
      lastLongPressAt = Date.now();
      openFor(el4, state21.x, state21.y);
    }, LONG_PRESS_MS);
  }
  function onTouchMove(e) {
    if (!press2 || press2.fired) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    if (Math.hypot(t.clientX - press2.x, t.clientY - press2.y) > MOVE_TOLERANCE) cancelPress();
  }
  function onTouchEnd() {
    if (press2 && press2.fired) swallowUntil = Date.now() + CLICK_WINDOW_MS;
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
  function start3() {
    if (active3) return;
    active3 = true;
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
  function stop4() {
    active3 = false;
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
      start3();
      startItemWatch();
    },
    unmount() {
      stop4();
      stopItemWatch();
      closeChooser();
      cancelDownloads();
      clearToast();
    }
  };
  var contextmenu_default = contextmenuFeature;

  // src/js/features/statshint.js
  var ID9 = "lfx-statshint";
  var KEY2 = "lfx.statsHint";
  var SESSION_KEY = "lfx.statsHint.shown";
  var HINT_DURATION = 7e3;
  var HINT_DELAY = 1500;
  var HINT_DAYS = 10;
  var LEAVE_MS = 200;
  var EXCLUDED5 = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video)/;
  function readState() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY2));
      return v && typeof v === "object" ? v : {};
    } catch {
      return {};
    }
  }
  function writeState(patch) {
    try {
      localStorage.setItem(KEY2, JSON.stringify({ ...readState(), ...patch }));
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
    const el4 = state5.el;
    clearTimeout(state5.hideTimer);
    state5.hideTimer = null;
    el4.classList.add("is-leaving");
    state5.removeTimer = setTimeout(() => {
      state5.removeTimer = null;
      if (state5.el === el4) removeHint();
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
  function show2() {
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
    const root7 = mountPoint(ID9, { className: "lfx-statshint" });
    root7.classList.remove("is-leaving");
    const top = !isMobile();
    root7.classList.toggle("lfx-statshint--top", top);
    const nav = top ? document.getElementById("lfx-nav") : null;
    const navRight = nav ? Math.round(nav.getBoundingClientRect().right) : 0;
    root7.style.left = top && navRight > 0 ? `${navRight + 12}px` : "";
    root7.setAttribute("role", "status");
    root7.setAttribute("aria-live", "polite");
    root7.replaceChildren(h("div", { class: "lfx-statshint__box" }, [link, close2]));
    state5.el = root7;
    if (canHover()) {
      root7.addEventListener("mouseenter", () => {
        if (!state5.hideTimer) return;
        state5.remaining = Math.max(500, state5.deadline - Date.now());
        clearTimeout(state5.hideTimer);
        state5.hideTimer = null;
      });
      root7.addEventListener("mouseleave", () => {
        if (state5.el !== root7 || state5.hideTimer || state5.removeTimer) return;
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
  function sync2(route) {
    if (isHomeRoute2(route)) {
      if (!state5.el && !state5.showTimer && shouldShow()) state5.showTimer = setTimeout(show2, HINT_DELAY);
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
      sync2(route);
    },
    update(route) {
      sync2(route);
    },
    unmount() {
      if (state5.onClick) document.removeEventListener("click", state5.onClick, true);
      state5.onClick = null;
      removeHint();
    }
  };
  var statshint_default = statshintFeature;

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
    entries.push({ key: "design", label: "Design Einstellungen", badge: "Beta", onClick: () => openThemePicker({ returnFocus }) });
    if (DATASAVER_THEMES.includes(theme || getTheme() || "flix")) entries.push(dataSaverItem());
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
  async function getUserChip({ retries = 0, delay = 500, isAlive = () => true } = {}) {
    let user;
    for (let i = 0; ; i++) {
      try {
        user = await getUser();
      } catch {
        user = null;
      }
      if (user || i >= retries || !isAlive()) break;
      await new Promise((r) => setTimeout(r, delay));
      if (!isAlive()) break;
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
  var svg6 = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  var ICONS3 = {
    tvmode: ICON_TVMODE,
    home: svg6('<path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M5.5 10v9.5h5v-5.2h3v5.2h5V10"/>'),
    homeFill: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3.5 11.2 12 4l8.5 7.2V20h-6v-5.7h-5V20h-6z"/></svg>',
    back: svg6('<path d="m14.5 5-7 7 7 7"/>'),
    list: svg6('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M12 8.8v6.4M8.8 12h6.4"/>'),
    movies: svg6('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 4v16M16 4v16M4 8.5h4M4 15.5h4M16 8.5h4M16 15.5h4"/>'),
    tv: svg6('<rect x="3" y="6.5" width="18" height="12" rx="2.5"/><path d="m8 3 4 3.5L16 3"/>'),
    star: svg6('<path d="m12 3.8 2.5 5.1 5.6.8-4.1 4 1 5.6-5-2.7-5 2.7 1-5.6-4.1-4 5.6-.8z"/>'),
    search: svg6('<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>')
  };

  // src/js/features/plus/mobile.js
  function isPhone() {
    return isMobile() && window.innerWidth < 800;
  }

  // src/js/features/plus/header.js
  var ROOT_ID5 = "lfx-plus-header";
  var ON_CLASS4 = "lfx-plus-header-on";
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
      if (kind2 === "tv") return "tv";
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
  function applyActive4() {
    if (!state6.root) return;
    const key = state6.route ? activeKey2(state6.route, state6.libs) : null;
    for (const el4 of state6.root.querySelectorAll("[data-key]")) {
      const on = el4.dataset.key === key;
      el4.classList.toggle("is-active", on);
      if (on) el4.setAttribute("aria-current", "page");
      else el4.removeAttribute("aria-current");
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
    applyActive4();
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
      user = await getUserChip({ retries: 20, isAlive: () => mountSeq === state6.mountSeq && Boolean(state6.chip) });
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
    const root7 = state6.root;
    if (!root7) return;
    const y = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
    const dy = y - state6.lastY;
    root7.classList.toggle("is-solid", y > SOLID_AT);
    if (y <= SOLID_AT) {
      setHidden(false);
    } else if (dy >= SCROLL_DELTA && y > HIDE_AFTER) {
      if (!root7.contains(document.activeElement) && !menuOpen()) setHidden(true);
    } else if (dy <= -SCROLL_DELTA) {
      setHidden(false);
    }
    if (Math.abs(dy) >= SCROLL_DELTA || y <= SOLID_AT) state6.lastY = y;
  }
  function onScroll2() {
    if (state6.raf) return;
    const raf3 = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
    state6.raf = raf3(scrollTick);
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
      const root7 = mountPoint(ROOT_ID5, { tag: "header", className: "lfx-plus-header" });
      root7.textContent = "";
      state6.root = root7;
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
      const tv = h("a", { class: "lfx-plus-header__tv", href: tvModeHref, "aria-label": "TV", title: "TV", dataset: { key: "tv" } });
      tv.append(icon2("tvmode", "lfx-plus-header__icon"));
      tv.addEventListener("click", () => window.dispatchEvent(new CustomEvent("lfx:tvmode-intent")));
      const ds = createDataSaverButton({ className: "lfx-plus-header__ds" });
      root7.append(h("div", { class: "lfx-plus-header__left" }, [brand, chip]), nav, ds, tv, search);
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
      document.documentElement.classList.add(ON_CLASS4);
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
      applyActive4();
    },
    unmount() {
      state6.mountSeq++;
      closeMenu();
      for (const fn of state6.cleanups.splice(0)) fn();
      if (state6.raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(state6.raf);
      state6.raf = 0;
      unmountPoint(ROOT_ID5);
      document.documentElement.classList.remove(ON_CLASS4, HIDDEN_CLASS);
      state6.root = null;
      state6.nav = null;
      state6.chip = null;
      state6.libs = [];
    }
  };
  var header_default = plusHeader;

  // src/js/features/plus/mobilehead.js
  var ROOT_ID6 = "lfx-plus-mhead";
  var ON_CLASS5 = "lfx-plus-mhead-on";
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
      if (kind2 === "tv") return "TV";
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
  var state7 = { root: null, tvEl: null, backEl: null, titleEl: null, route: null, libs: [], seq: 0, raf: 0, cleanups: [] };
  function render6() {
    if (!state7.root) return;
    const back = showsBack(state7.route);
    state7.backEl.hidden = !back;
    state7.root.classList.toggle("has-back", back);
    state7.titleEl.textContent = headerTitle(state7.route, state7.libs);
    const on = isTvModeRoute(state7.route);
    state7.tvEl.classList.toggle("is-active", on);
    if (on) state7.tvEl.setAttribute("aria-current", "page");
    else state7.tvEl.removeAttribute("aria-current");
  }
  function scrollTick2() {
    state7.raf = 0;
    if (!state7.root) return;
    const y = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
    state7.root.classList.toggle("is-solid", y > SOLID_AT2);
  }
  function onScroll3() {
    if (state7.raf) return;
    const raf3 = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
    state7.raf = raf3(scrollTick2);
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
      const root7 = mountPoint(ROOT_ID6, { tag: "header", className: "lfx-plus-mhead" });
      root7.textContent = "";
      const backEl = h("button", { type: "button", class: "lfx-plus-mhead__back", "aria-label": "Zur\xFCck", hidden: true });
      backEl.innerHTML = ICONS3.back;
      backEl.addEventListener("click", () => window.history.back());
      const titleEl = h("h1", { class: "lfx-plus-mhead__title" });
      const tv = h("a", { class: "lfx-plus-mhead__tv", href: tvModeHref, "aria-label": "TV", title: "TV", dataset: { key: "tv" } });
      tv.innerHTML = ICONS3.tvmode;
      tv.addEventListener("click", () => window.dispatchEvent(new CustomEvent("lfx:tvmode-intent")));
      const ds = createDataSaverButton({ className: "lfx-plus-mhead__ds" });
      root7.append(backEl, titleEl, ds, tv);
      state7.tvEl = tv;
      state7.root = root7;
      state7.backEl = backEl;
      state7.titleEl = titleEl;
      document.documentElement.classList.add(ON_CLASS5);
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
      unmountPoint(ROOT_ID6);
      document.documentElement.classList.remove(ON_CLASS5);
      state7.root = null;
      state7.backEl = null;
      state7.titleEl = null;
      state7.tvEl = null;
      state7.libs = [];
    }
  };
  var mobilehead_default = plusMobileHead;

  // src/js/features/plus/switcher.js
  var ROOT_ID7 = "lfx-plus-switcher";
  var ON_CLASS6 = "lfx-plus-switcher-on";
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
  function applyActive5() {
    if (!state8.root || !state8.route) return;
    const key = activeTab(state8.route);
    let active5 = null;
    for (const el4 of state8.root.querySelectorAll('[role="tab"]')) {
      const on = el4.dataset.key === key;
      el4.classList.toggle("is-active", on);
      el4.setAttribute("aria-selected", String(on));
      el4.tabIndex = on ? 0 : -1;
      if (on) active5 = el4;
    }
    const list = state8.root.querySelector(".lfx-plus-switcher__list");
    if (active5 && list && list.scrollWidth > list.clientWidth) {
      list.scrollLeft = Math.max(0, active5.offsetLeft - (list.clientWidth - active5.offsetWidth) / 2);
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
    applyActive5();
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
      state8.root = mountPoint(ROOT_ID7, { className: "lfx-plus-switcher" });
      document.documentElement.classList.add(ON_CLASS6);
      render7();
      loadLibraries3(seq3);
    },
    update(route) {
      state8.route = route;
      applyActive5();
    },
    unmount() {
      state8.seq++;
      unmountPoint(ROOT_ID7);
      document.documentElement.classList.remove(ON_CLASS6);
      state8.root = null;
      state8.libs = [];
    }
  };
  var switcher_default = plusSwitcher;

  // src/js/shared/hub.js
  var asItems4 = (res) => Array.isArray(res) ? res : res && Array.isArray(res.Items) ? res.Items : [];
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
    const list = asItems4(await getResume({
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
    }).then(asItems4);
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
        }).then(asItems4)
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
      genres = asItems4(await getJson("/Genres", {
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
    }).then(asItems4);
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
  function newContentFrom(episodes, now = Date.now(), { days = NEW_DAYS } = {}) {
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
  var lz = (eager) => eager ? {} : { loading: "lazy", decoding: "async" };
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
  function createPosterCard(item, { badge: badge3 = null, eager = false } = {}) {
    const url = posterUrl(item, 400) || null;
    const media = [];
    if (url) media.push(h("img", { class: "lfx-card__img", src: url, alt: "", ...lz(eager) }));
    else media.push(h("span", { class: "lfx-card__title lfx-plus-card__fallback" }, displayTitle2(item)));
    if (badge3) {
      const logo = logoImage(item, { maxWidth: 360 });
      media.push(h("div", { class: "lfx-plus-card__new" }, [
        h("span", { class: "lfx-plus-badge" }, badge3),
        logo ? h("img", { class: "lfx-card__logo lfx-plus-card__logo", src: logo, alt: "", ...lz(eager) }) : null,
        h("span", { class: "lfx-plus-card__meta" }, yearGenres(item))
      ]));
    }
    const link = h("a", { class: "lfx-card__link", href: titleHref(item.Id), "aria-label": ariaFor(item) }, media);
    const card3 = cardShell(item, "poster", badge3 ? "lfx-plus-card--new" : "");
    card3.append(link);
    return card3;
  }
  function createResumeCard(item, { eager = false } = {}) {
    const img = landscapeFor(item, 600);
    const media = [];
    if (img) media.push(h("img", { class: "lfx-card__img", src: img.url, alt: "", ...lz(eager) }));
    else media.push(h("span", { class: "lfx-card__title lfx-plus-card__fallback" }, displayTitle2(item)));
    const p = progressPercent(item);
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
  function createPlusCard(item, { kind: kind2 = "poster", badge: badge3 = null, eager = false } = {}) {
    return kind2 === "resume" ? createResumeCard(item, { eager }) : createPosterCard(item, { badge: badge3, eager });
  }

  // src/js/features/plus/hero.js
  var HERO_INTERVAL = 7e3;
  var HERO_FIELDS2 = `${BASE_PARAMS.Fields},Taglines`;
  var asItems5 = (res) => Array.isArray(res) ? res : res && Array.isArray(res.Items) ? res.Items : [];
  var CHEVRON2 = '<svg viewBox="0 0 14 27" aria-hidden="true" focusable="false"><polyline points="1.5,1.5 12.5,13.5 1.5,25.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function taglineFor(item) {
    const t = Array.isArray(item.Taglines) ? item.Taglines.find(Boolean) : "";
    if (t) return t;
    const o = String(item.Overview || "").replace(/\s+/g, " ").trim();
    if (o.length <= 150) return o;
    const cut = o.slice(0, 150);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 100)).replace(/[\s,.;:!?-]+$/, "")}\u2026`;
  }
  var poolWarm = false;
  function loadHomeHeroPool() {
    const key = homeKey(getUserId(), "plus-hero");
    poolWarm = peekCached(key) !== void 0;
    const p = cached(key, fetchHomeHeroPool, HOME_TTL);
    p.then((pool) => {
      if (!pool.length) clearCache(key);
    }, () => {
    });
    return p;
  }
  async function fetchHomeHeroPool() {
    const q = (params) => getItems({
      ...BASE_PARAMS,
      Fields: HERO_FIELDS2,
      IncludeItemTypes: "Movie,Series",
      Recursive: true,
      ...params
    }).then(asItems5);
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
  function buildSlide(item, i, info, mobile, warm, eagerN = 3) {
    const bd = mobile && imageUrl(item, { type: "Primary", maxWidth: 900, quality: 80 }) || imageUrl(item, { type: "Backdrop", maxWidth: mobile ? 1e3 : 1920, quality: 80 });
    const logo = logoImage(item, { maxWidth: 520 });
    const badge3 = plusBadge(item, info);
    const tag = taglineFor(item);
    const meta2 = yearGenres(item);
    const rating = ratingBox(item);
    return h("a", {
      class: "lfx-plus-hero__slide",
      href: titleHref(item.Id),
      dataset: { index: String(i) },
      "aria-label": item.Name || ""
    }, [
      bd ? h("img", { class: "lfx-plus-hero__img", src: bd, alt: "", decoding: warm ? null : "async", loading: i < eagerN ? "eager" : "lazy" }) : null,
      h("div", { class: "lfx-plus-hero__shade", "aria-hidden": "true" }),
      h("div", { class: "lfx-plus-hero__content" }, [
        badge3 ? h("span", { class: "lfx-plus-badge lfx-plus-hero__badge" }, badge3) : null,
        logo ? h("img", { class: "lfx-plus-hero__logo", src: logo, alt: item.Name || "", decoding: warm ? null : "async" }) : h("span", { class: "lfx-plus-hero__title" }, item.Name || ""),
        tag ? h("p", { class: "lfx-plus-hero__tagline" }, tag) : null,
        rating || meta2 ? h("div", { class: "lfx-plus-hero__meta" }, [rating, meta2 ? h("span", null, meta2) : null]) : null
      ])
    ]);
  }
  function createHero(items, { info = null, interval = HERO_INTERVAL, mobile = isPhone(), warm = poolWarm } = {}) {
    const all = (items || []).filter((it) => it && it.Id);
    const saver = isDataSaver();
    const list = saver ? saverPool(all) : all;
    if (!list.length) return null;
    const n = list.length;
    const slides = list.map((it, i) => buildSlide(it, i, info, mobile, warm, saver ? 1 : 3));
    const track = h("div", { class: "lfx-plus-hero__track" }, slides);
    const prev2 = h("button", { type: "button", class: "lfx-plus-hero__nav lfx-plus-hero__nav--prev", "aria-label": "Vorherige Empfehlung", tabindex: "-1" });
    const next = h("button", { type: "button", class: "lfx-plus-hero__nav lfx-plus-hero__nav--next", "aria-label": "N\xE4chste Empfehlung", tabindex: "-1" });
    prev2.innerHTML = CHEVRON2;
    next.innerHTML = CHEVRON2;
    const dots = list.map((it, i) => h("button", {
      type: "button",
      class: "lfx-plus-hero__dot",
      "aria-label": `Empfehlung ${i + 1} von ${n}`,
      onclick: () => go3(i)
    }));
    const dotsEl = h("div", { class: "lfx-plus-hero__dots" }, n > 1 ? dots : []);
    const el4 = h("section", { class: `lfx-plus-hero${mobile ? " lfx-plus-hero--m" : ""}`, "aria-roledescription": "carousel", "aria-label": "Empfehlungen" }, [
      h("div", { class: "lfx-plus-hero__viewport" }, [track]),
      n > 1 && !mobile ? prev2 : null,
      n > 1 && !mobile ? next : null,
      mobile ? null : dotsEl
    ]);
    let idx = 0;
    let timer2 = null;
    let hover = false;
    let focus = false;
    const running = () => !mobile && n > 1 && !hover && !focus && !document.hidden;
    function stop7() {
      clearTimeout(timer2);
      timer2 = null;
    }
    function schedule4() {
      stop7();
      if (running()) timer2 = setTimeout(() => go3(idx + 1), interval);
    }
    function paint() {
      el4.style.setProperty("--i", String(idx));
      slides.forEach((s, i) => {
        const active5 = i === idx;
        s.classList.toggle("is-active", active5);
        s.setAttribute("aria-hidden", active5 ? "false" : "true");
        s.tabIndex = active5 ? 0 : -1;
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
    function go3(i) {
      idx = (i % n + n) % n;
      paint();
      if (mobile) scrollToSlide(idx);
      schedule4();
    }
    let scrollRaf = 0;
    function onTrackScroll() {
      if (scrollRaf) return;
      const raf3 = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
      scrollRaf = raf3(() => {
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
      go3(idx - 1);
    };
    const onNext = (e) => {
      e.preventDefault();
      go3(idx + 1);
    };
    const onSlideClick = (e) => {
      const s = e.target.closest && e.target.closest(".lfx-plus-hero__slide");
      if (!s || s.classList.contains("is-active")) return;
      e.preventDefault();
      go3(Number(s.dataset.index));
    };
    const onEnter = () => {
      hover = true;
      stop7();
    };
    const onLeave = () => {
      hover = false;
      schedule4();
    };
    const onFocusIn = () => {
      focus = true;
      stop7();
    };
    const onFocusOut = (e) => {
      if (!el4.contains(e.relatedTarget)) {
        focus = false;
        schedule4();
      }
    };
    const onVis = () => document.hidden ? stop7() : schedule4();
    const onKey3 = (e) => {
      if (e.key === "ArrowLeft") go3(idx - 1);
      else if (e.key === "ArrowRight") go3(idx + 1);
    };
    prev2.addEventListener("click", onPrev);
    next.addEventListener("click", onNext);
    track.addEventListener("click", onSlideClick);
    if (mobile) track.addEventListener("scroll", onTrackScroll, { passive: true });
    el4.addEventListener("mouseenter", onEnter);
    el4.addEventListener("mouseleave", onLeave);
    el4.addEventListener("focusin", onFocusIn);
    el4.addEventListener("focusout", onFocusOut);
    el4.addEventListener("keydown", onKey3);
    document.addEventListener("visibilitychange", onVis);
    paint();
    schedule4();
    return {
      el: el4,
      go: go3,
      index: () => idx,
      destroy() {
        stop7();
        track.removeEventListener("scroll", onTrackScroll);
        if (scrollRaf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(scrollRaf);
        scrollRaf = 0;
        prev2.removeEventListener("click", onPrev);
        next.removeEventListener("click", onNext);
        track.removeEventListener("click", onSlideClick);
        el4.removeEventListener("mouseenter", onEnter);
        el4.removeEventListener("mouseleave", onLeave);
        el4.removeEventListener("focusin", onFocusIn);
        el4.removeEventListener("focusout", onFocusOut);
        el4.removeEventListener("keydown", onKey3);
        document.removeEventListener("visibilitychange", onVis);
        el4.remove();
      }
    };
  }

  // src/js/shared/collections.js
  var asItems6 = (res) => Array.isArray(res) ? res : res && Array.isArray(res.Items) ? res.Items : [];
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
      }).then(asItems6);
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
    let el4 = buildPlaceholder();
    parent.insertBefore(el4, before && before.parentNode === parent ? before : null);
    const swap = (next) => {
      if (disposed) return;
      if (next) el4.replaceWith(next);
      else el4.remove();
      el4 = next;
    };
    getCollections().then((list) => swap(buildBrandRow(list))).catch((e) => {
      console.warn("[LenzFlix] Sammlungen nicht geladen", e && e.message);
      swap(null);
    });
    return () => {
      disposed = true;
      if (el4) el4.remove();
      el4 = null;
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
  var EAGER_ROWS2 = 3;
  var EAGER_CARDS2 = 8;
  var lastInfo = null;
  function fill3(rowEl, def, items, info, eager = false) {
    const resume = def.kind === "resume";
    const cards = items.map((it, i) => createPlusCard(it, {
      kind: resume ? "resume" : "poster",
      badge: resume ? null : plusBadge(it, info),
      eager: eager && i < EAGER_CARDS2
    }));
    const track = h("div", { class: "lfx-plus-row__track", role: "list", "aria-label": def.title || "" }, cards);
    const prev2 = chevronButton("prev", "Zur\xFCck");
    const next = chevronButton("next", "Weiter");
    prev2.classList.add("lfx-plus-row__arrow");
    next.classList.add("lfx-plus-row__arrow");
    const viewport = rowEl.querySelector(".lfx-plus-row__viewport");
    viewport.textContent = "";
    viewport.append(prev2, track, next);
    rowEl.querySelector(".lfx-plus-row__title").textContent = def.title || "";
    rowEl.classList.remove("is-loading");
    return attachScroller({ track, prev: prev2, next, indicator: null });
  }
  function renderRows(slot, getDefs, peekDefs, opts = {}) {
    let disposed = false;
    let observer2 = null;
    let prefetch = null;
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
        lastInfo = { v: info, at: Date.now() };
        disposers.push(fill3(rowEl, def, items, info));
      } catch (e) {
        console.warn(`[LenzFlix] Zeile "${def.id}" nicht geladen`, e && e.message);
        if (!disposed) rowEl.remove();
      }
    }
    (async () => {
      let defs;
      try {
        defs = peekDefs && peekDefs() || await getDefs();
      } catch (e) {
        console.warn("[LenzFlix] Zeilen konnten nicht aufgebaut werden", e && e.message);
        return;
      }
      if (disposed) return;
      const pending = /* @__PURE__ */ new Map();
      let shown3 = 0;
      const info = lastInfo && Date.now() - lastInfo.at < HOME_TTL ? lastInfo.v : null;
      for (const def of defs || []) {
        const snap = info && def.cacheKey ? peekCached(def.cacheKey) : void 0;
        if (snap) {
          const items = snap.items.filter((i) => i && i.Id);
          if (!items.length) continue;
          def.id = snap.id;
          def.title = snap.title;
          const el5 = skeleton2(def);
          slot.append(el5);
          putItems(items);
          disposers.push(fill3(el5, def, items, info, shown3++ < EAGER_ROWS2));
          continue;
        }
        const el4 = skeleton2(def);
        pending.set(el4, def);
        slot.append(el4);
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
        }, { rootMargin: isDataSaver() ? "100px 0px" : "600px 0px" });
        for (const el4 of pending.keys()) observer2.observe(el4);
      } else {
        for (const [el4, def] of [...pending]) {
          pending.delete(el4);
          loadRow(el4, def);
        }
      }
      if (opts.prefetch) {
        prefetch = startRowPrefetch({
          slot,
          pending,
          hero: opts.hero,
          load: (el4, def) => {
            if (observer2) observer2.unobserve(el4);
            return loadRow(el4, def);
          }
        });
      }
    })();
    return () => {
      disposed = true;
      if (prefetch) prefetch.stop();
      prefetch = null;
      if (observer2) observer2.disconnect();
      observer2 = null;
      for (const d of disposers.splice(0)) d();
      slot.textContent = "";
    };
  }

  // src/js/features/plus/home.js
  var ROOT_ID8 = "lfx-plus-home";
  var ON_CLASS7 = "lfx-plus-home-on";
  var cleanups3 = [];
  var waitTimer4 = null;
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
  function findHomeTab4() {
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
    document.getElementById(ROOT_ID8)?.remove();
    document.documentElement.classList.remove(ON_CLASS7);
    currentKey = null;
    currentPhone = false;
  }
  async function build3(tab2, key) {
    teardown5();
    const my = token;
    const isHub = key.startsWith("hub:");
    const heroSlot = h("div", { class: "lfx-plus-home__hero is-loading" });
    const rowsSlot = h("div", { class: "lfx-plus-rows" });
    const root7 = h("div", { id: ROOT_ID8, class: `lfx-plus-home${isHub ? " lfx-plus-home--hub" : ""}` }, [heroSlot, rowsSlot]);
    tab2.prepend(root7);
    document.documentElement.classList.add(ON_CLASS7);
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
    if (!isHub) cleanups3.push(renderBrands(root7, rowsSlot));
    cleanups3.push(renderRows(rowsSlot, () => isHub ? lib ? buildHubRowDefs(lib) : [] : buildRowDefs(), isHub ? null : () => peekRowDefs(), { prefetch: !isHub, hero: () => heroSlot }));
  }
  function ensure4(route) {
    clearTimeout(waitTimer4);
    const key = routeKey(route);
    if (!key) return;
    const existing = document.getElementById(ROOT_ID8);
    const tab2 = findHomeTab4();
    if (tab2 && existing && tab2.contains(existing) && currentKey === key && currentPhone === isPhone()) return;
    let tries = 0;
    const poll = () => {
      const t = findHomeTab4();
      if (t) build3(t, key);
      else if (++tries < 30) waitTimer4 = setTimeout(poll, 200);
    };
    if (tab2) build3(tab2, key);
    else waitTimer4 = setTimeout(poll, 200);
  }
  var home_default2 = {
    name: "plus-home",
    match: (route) => isTheme("plus") && isModern() && !isTv() && isReady() && routeKey(route) !== null,
    mount: (route) => ensure4(route),
    update: (route) => ensure4(route),
    unmount: () => {
      clearTimeout(waitTimer4);
      teardown5();
    }
  };

  // src/js/shared/titleactions.js
  var SAVE_ERROR3 = "Konnte nicht gespeichert werden";
  var isPlayed2 = (it) => Boolean(it && it.UserData && it.UserData.Played === true);
  var folgen3 = (n) => n === 1 ? "1 Folge" : `${n} Folgen`;
  function clearPlayedCaches2(itemId2, seriesId) {
    clearCache(`lfx:modal:item:${itemId2}`);
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
    const prev2 = isPlayed2(item);
    const next = isSeries ? !prev2 : !(eps.length > 0 && eps.every(isPlayed2));
    const n = eps.length;
    const verb = next ? "gesehen" : "ungesehen";
    const ok = await askConfirm({
      title: n ? `${folgen3(n)} als ${verb} markieren?` : `Alle Folgen als ${verb} markieren?`,
      confirmLabel: `Als ${verb} markieren`,
      anchorEl
    });
    if (!ok) return prev2;
    try {
      const failed = await bulkPlayed2(seriesId, item.Id, seasonIds, next);
      if (failed) {
        toast(SAVE_ERROR3);
        return prev2;
      }
      item.UserData = { ...item.UserData || {}, Played: next };
      putItems([item]);
      toast(isSeries ? `Serie als ${verb} markiert` : `${folgen3(n)} als ${verb} markiert`);
      return next;
    } catch {
      toast(SAVE_ERROR3);
      return prev2;
    }
  }
  async function togglePlayed2(item, { anchorEl } = {}) {
    if (!item || !item.Id) return false;
    if (item.Type === "Series" || item.Type === "Season") return bulkToggle(item, anchorEl);
    const prev2 = { ...item.UserData || {} };
    const next = prev2.Played !== true;
    item.UserData = { ...prev2, Played: next, PlaybackPositionTicks: 0 };
    delete item.UserData.PlayedPercentage;
    try {
      await setPlayed(item.Id, next);
    } catch {
      item.UserData = prev2;
      toast(SAVE_ERROR3);
      return prev2.Played === true;
    }
    putItems([item]);
    clearPlayedCaches2(item.Id, item.Type === "Episode" ? item.SeriesId : null);
    return next;
  }
  async function toggleFavorite2(item) {
    if (!item || !item.Id) return false;
    const prev2 = Boolean(item.UserData && item.UserData.IsFavorite);
    const next = !prev2;
    item.UserData = { ...item.UserData || {}, IsFavorite: next };
    try {
      await setFavorite(item.Id, next);
    } catch {
      item.UserData = { ...item.UserData || {}, IsFavorite: prev2 };
      return prev2;
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
  function findHomeTab5() {
    const tab2 = document.querySelector("#indexPage:not(.hide) #homeTab");
    return tab2 && tab2.isConnected ? tab2 : null;
  }
  function whenHomeTab(cb, { tries = 30, every = 200 } = {}) {
    let dead = false;
    let timer2 = null;
    let n = 0;
    const poll = () => {
      timer2 = null;
      if (dead) return;
      const t = findHomeTab5();
      if (t) cb(t);
      else if (++n < tries) timer2 = setTimeout(poll, every);
    };
    poll();
    return () => {
      dead = true;
      if (timer2) clearTimeout(timer2);
      timer2 = null;
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
      const meta2 = ep ? [item.SeriesName, code].filter(Boolean).join(" \u2022 ") : "";
      card3.append(h("div", { class: "lfx-plus-result__text" }, [
        h("div", { class: "lfx-plus-result__title" }, item.Name || ""),
        ep ? h("div", { class: "lfx-plus-meta" }, [h("span", { class: "lfx-plus-meta__text" }, meta2)]) : metaLine(item)
      ]));
    }
    return card3;
  }

  // src/js/features/plus/title.js
  var ROOT_ID9 = "lfx-plus-title";
  var TRAILER_ID = "lfx-plus-trailer";
  var ON_CLASS8 = "lfx-plus-title-on";
  var TICKS_PER_MIN3 = 6e8;
  var svg7 = (path) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${path}</svg>`;
  var ICON_PLAY3 = svg7('<path d="M7 4.5v15l12-7.5z"/>');
  var ICON_PLUS3 = svg7('<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/>');
  var ICON_CHECK3 = svg7('<path d="M9.2 16.6 4.9 12.3l1.4-1.4 2.9 2.9 8.5-8.5 1.4 1.4z"/>');
  var ICON_TRAILER = svg7('<path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2v10h14V7zm4 1.5 6 3.5-6 3.5z"/>');
  var ICON_CHEVRON = svg7('<path d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z"/>');
  var ICON_CLOSE = svg7('<path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z"/>');
  var state9 = null;
  var gen2 = 0;
  var routeId = (route) => {
    const r = parseLfxRoute(route);
    return r.kind === "title" ? r.id : null;
  };
  var stalenessOf = (g) => () => !state9 || state9.g !== g;
  function closeTrailer() {
    const el4 = document.getElementById(TRAILER_ID);
    if (!el4) return;
    const v = el4.querySelector("video");
    if (v) {
      try {
        v.pause();
        v.removeAttribute("src");
        if (v.load) v.load();
      } catch {
      }
    }
    if (typeof el4.__lfxCleanup === "function") el4.__lfxCleanup();
    unmountPoint(el4);
  }
  function dispose() {
    gen2 += 1;
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
    document.getElementById(ROOT_ID9)?.remove();
    setPageOn(ON_CLASS8, false);
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
  function setIcon(btn3, icon5) {
    const ico = btn3.querySelector(".lfx-plus-circle__ico");
    if (ico) ico.innerHTML = icon5;
  }
  function setLabel(btn3, label) {
    btn3.setAttribute("aria-label", label);
    btn3.title = label;
  }
  var remainingText2 = (it) => {
    const total = Number(it && it.RunTimeTicks) || 0;
    const pos = Number(it && it.UserData && it.UserData.PlaybackPositionTicks) || 0;
    const left = Math.round((total - pos) / TICKS_PER_MIN3);
    return total && pos && left > 0 ? `Noch ${left} Min.` : "";
  };
  function backdropUrl2(item) {
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
    const video2 = h("video", { class: "lfx-plus-trailer__video", controls: true, autoplay: true, playsinline: true });
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
    overlay.append(video2, closeBtn);
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
    video2.addEventListener("error", () => {
      toast("Trailer konnte nicht abgespielt werden");
      close2();
    });
    video2.addEventListener("ended", close2);
    video2.src = src;
    try {
      const p = video2.play && video2.play();
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
    const p = progressPercent2(ep);
    const played = ep.UserData && ep.UserData.Played === true;
    const mins = formatRuntime(ep.RunTimeTicks);
    const media = h("span", { class: "lfx-plus-ep__media" }, [
      img ? h("img", { class: "lfx-plus-ep__img", src: img, alt: "", loading: "lazy", decoding: "async" }) : null,
      played ? h("span", { class: "lfx-plus-ep__seen", "aria-label": "Gesehen", title: "Gesehen" }) : null,
      p > 0 ? h("span", { class: "lfx-plus-progress lfx-plus-ep__progress" }, [h("span", { class: "lfx-plus-progress__bar", style: { width: `${Math.round(p * 10) / 10}%` } })]) : null
    ]);
    const num2 = ep.IndexNumber != null ? `${ep.IndexNumber}. ` : "";
    const btn3 = h("button", {
      type: "button",
      class: `lfx-plus-ep${selected ? " is-selected" : ""}`,
      dataset: { id: ep.Id },
      "aria-label": `${num2}${ep.Name || ""} abspielen`,
      onclick: () => onPlay(ep)
    }, [
      media,
      h("span", { class: "lfx-plus-ep__title" }, `${num2}${ep.Name || ""}`),
      mins ? h("span", { class: "lfx-plus-ep__dur" }, mins) : null,
      ep.Overview ? h("span", { class: "lfx-plus-ep__text" }, ep.Overview) : null
    ]);
    return btn3;
  }
  async function load2(g) {
    const stale = stalenessOf(g);
    const s = state9;
    const root7 = s.root;
    let sel;
    let main;
    try {
      sel = await resolveTarget3(s.id);
      if (stale()) return;
      main = await loadItem(sel.target);
      if (!main) throw new Error("Titel nicht gefunden");
    } catch (e) {
      if (stale()) return;
      root7.replaceChildren(errorBox(e && e.message ? "Der Server hat nicht geantwortet." : ""));
      root7.classList.add("is-error");
      return;
    }
    if (stale()) return;
    const isSeries = main.Type === "Series";
    const isBox = main.Type === "BoxSet";
    const c = { main, seasons: [], seasonId: sel.seasonId, selectedEp: sel.episodeId, focusEp: null, nextUp: null, trailerSrc: null };
    const bg = backdropUrl2(main);
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
      const p = it ? progressPercent2(it) : 0;
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
    root7.classList.remove("is-loading");
    root7.replaceChildren(backdrop, h("div", { class: "lfx-plus-title__content" }, [hero, tablist, panelWrap, footer]));
    paintPlay2();
    let raf3 = 0;
    const onScroll7 = () => {
      if (raf3) return;
      raf3 = requestAnimationFrame(() => {
        raf3 = 0;
        const vh = window.innerHeight || 800;
        const v = Math.max(0, Math.min(1, (window.scrollY || document.documentElement.scrollTop || 0) / (vh * 0.55)));
        root7.style.setProperty("--lfx-plus-dim", String(Math.round(v * 100) / 100));
        tablist.classList.toggle("is-stuck", tablist.getBoundingClientRect().top <= 67);
      });
    };
    window.addEventListener("scroll", onScroll7, { passive: true });
    s.cleanups.push(() => {
      window.removeEventListener("scroll", onScroll7);
      if (raf3) cancelAnimationFrame(raf3);
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
      const btn3 = h("button", { type: "button", class: "lfx-plus-season", "aria-haspopup": "menu" }, [label, ico]);
      btn3.addEventListener("click", () => {
        openPopover(btn3, {
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
      seasonBar.append(btn3);
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
    const g = gen2;
    state9 = { g, id, root: null, cleanups: [], cancelWait: null };
    const s = state9;
    s.cancelWait = whenHomeTab((tab2) => {
      if (state9 !== s) return;
      const root7 = h("div", { id: ROOT_ID9, class: "lfx-plus-page lfx-plus-title is-loading", "aria-busy": "true" }, [
        h("div", { class: "lfx-plus-title__skeleton" })
      ]);
      s.root = root7;
      tab2.prepend(root7);
      setPageOn(ON_CLASS8, true);
      if (!keepScroll) scrollTop();
      load2(g).then(() => {
        if (state9 === s) root7.removeAttribute("aria-busy");
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
  var ROOT_ID10 = "lfx-plus-browse";
  var ON_CLASS9 = "lfx-plus-browse-on";
  var PAGE4 = 40;
  var state10 = null;
  var routeOf = (route) => {
    const r = parseLfxRoute(route);
    return r.kind === "browse" && r.lib ? { lib: r.lib, genre: r.genre } : null;
  };
  var asItems7 = (res) => Array.isArray(res) ? res : res && Array.isArray(res.Items) ? res.Items : [];
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
    document.getElementById(ROOT_ID10)?.remove();
    setPageOn(ON_CLASS9, false);
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
        Limit: PAGE4
      });
      if (stale()) return;
      const items = asItems7(res);
      putItems(items);
      s.total = res && typeof res.TotalRecordCount === "number" ? res.TotalRecordCount : null;
      s.items.push(...items);
      if (s.info === null) {
        s.info = await getNewContentInfo().catch(() => false);
        if (stale()) return;
      }
      for (const it of items) s.grid.append(gridCard(it, { badge: s.info ? plusBadge(it, s.info) : null }));
      s.done = items.length < PAGE4 || s.total != null && s.items.length >= s.total;
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
    const grid2 = h("div", { class: "lfx-plus-grid lfx-plus-grid--cards", role: "list" });
    const status = h("div", { class: "lfx-plus-browse__status" });
    const sentinel = h("div", { class: "lfx-plus-browse__sentinel", "aria-hidden": "true" });
    const root7 = h("div", { id: ROOT_ID10, class: "lfx-plus-page lfx-plus-browse" }, [title, chips, grid2, status, sentinel]);
    Object.assign(s, { root: root7, chips, grid: grid2, status });
    tab2.prepend(root7);
    setPageOn(ON_CLASS9, true);
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
      const onScroll7 = () => {
        const r = sentinel.getBoundingClientRect();
        if (r.top < (window.innerHeight || 800) + 800) loadMore(s);
      };
      window.addEventListener("scroll", onScroll7, { passive: true });
      s.cleanups.push(() => window.removeEventListener("scroll", onScroll7));
    }
    reload(s);
    try {
      const genres = asItems7(await getJson("/Genres", {
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
  var asItems8 = (res) => Array.isArray(res) ? res : res && Array.isArray(res.Items) ? res.Items : [];
  var MIN_LEN = 2;
  async function searchItems(q, { limit = 40, signal } = {}) {
    const out = { movies: [], series: [], episodes: [], people: [] };
    const term = String(q == null ? "" : q).trim();
    if (term.length < MIN_LEN) return out;
    const userId = getUserId();
    const get = (path, params) => getJson(path, { userId, ...params }, { signal }).then(asItems8);
    const soft2 = (e) => {
      if (e && e.name === "AbortError") throw e;
      return [];
    };
    const [titles, episodes, people] = await Promise.all([
      get("/Items", { ...BASE_PARAMS, searchTerm: term, IncludeItemTypes: "Movie,Series", Recursive: true, Limit: limit }),
      get("/Items", { ...BASE_PARAMS, searchTerm: term, IncludeItemTypes: "Episode", Recursive: true, Limit: 12 }).catch(soft2),
      get("/Persons", { searchTerm: term, Limit: 8, Fields: "PrimaryImageAspectRatio", ImageTypeLimit: 1 }).catch(soft2)
    ]);
    out.movies = titles.filter((i) => i.Type === "Movie");
    out.series = titles.filter((i) => i.Type === "Series");
    out.episodes = episodes;
    out.people = people;
    return out;
  }
  async function tileFor(genre, parentId) {
    const own2 = genre.ImageTags && (genre.ImageTags.Thumb ? "Thumb" : genre.ImageTags.Primary ? "Primary" : null);
    if (own2) return imageUrlFor(genre.Id, { type: own2, tag: genre.ImageTags[own2], maxWidth: 640 });
    const top = asItems8(await getItems({
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
    const genres = asItems8(res).filter((g) => g && g.Id && g.Name).slice(0, limit);
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
  var ROOT_ID11 = "lfx-plus-search";
  var ON_CLASS10 = "lfx-plus-search-on";
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
    document.getElementById(ROOT_ID11)?.remove();
    setPageOn(ON_CLASS10, false);
  }
  function tile(href, label, imageUrl2, { nameOnImage = true } = {}) {
    const hide2 = !!imageUrl2 && !nameOnImage;
    return h("a", { class: "lfx-plus-tile", href, "aria-label": label, title: label }, [
      imageUrl2 ? h("img", { class: "lfx-plus-tile__img", src: imageUrl2, alt: "", loading: "lazy", decoding: "async" }) : null,
      h("span", { class: `lfx-plus-tile__name${imageUrl2 ? hide2 ? " is-sr" : " has-img" : ""}` }, label)
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
    const root7 = h("div", { id: ROOT_ID11, class: "lfx-plus-page lfx-plus-search", role: "search" }, [field, results]);
    Object.assign(s, { root: root7, input, results });
    s.syncUi = () => {
      clear.hidden = !input.value;
    };
    tab2.prepend(root7);
    setPageOn(ON_CLASS10, true);
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
  var ROOT_ID12 = "lfx-plus-tabbar";
  var ON_CLASS11 = "lfx-plus-tabbar-on";
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
  var isVideoHash = (hash2) => /^#!?[/]video(?:[/?]|$)/.test(String(hash2 || ""));
  function sheetEntries(libs, profile2, { go: go3, close: close2 }) {
    const entries = [{ label: "Neu & beliebt", onClick: () => {
      close2();
      go3("#/home?lfx=new");
    } }];
    for (const l of Array.isArray(libs) ? libs : []) {
      const href = l.hubCapable ? hubHref(l.id) : l.href;
      if (href) entries.push({ label: l.name, onClick: () => {
        close2();
        go3(href);
      } });
    }
    for (const p of Array.isArray(profile2) ? profile2 : []) {
      if (p.switch) entries.push(p);
      else if (p.href) entries.push({ label: p.label, badge: p.badge, onClick: () => {
        close2();
        go3(p.href);
      }, stats: p.key === "stats" });
      else if (typeof p.onClick === "function") entries.push({ label: p.label, badge: p.badge, onClick: () => {
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
  function applyActive6() {
    if (!state12.root) return;
    const key = tabKey(state12.route);
    for (const el4 of state12.root.querySelectorAll("[data-key]")) {
      const on = el4.dataset.key === key;
      el4.classList.toggle("is-active", on);
      if (on) el4.setAttribute("aria-current", "page");
      else el4.removeAttribute("aria-current");
      if (el4.dataset.key === "home") el4.querySelector(".lfx-plus-tabbar__icon").innerHTML = ICONS3[on ? "homeFill" : "home"];
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
    let profile2 = [];
    let user = { name: "" };
    try {
      libs = await getLibraries() || [];
    } catch {
    }
    try {
      profile2 = await profileEntries({ theme: "plus", returnFocus: anchor });
    } catch {
    }
    try {
      user = await getUserChip();
    } catch {
    }
    if (seq3 !== state12.seq || !state12.root) return;
    const c = openSheet(anchor, "Profil");
    state12.sheet = c;
    const entries = sheetEntries(libs, profile2, { go, close: () => closeChooser() });
    renderSheet(c, user && user.name || "Profil", entries);
    const buttons = c.list ? c.list.querySelectorAll(".lfx-sheet__item") : [];
    entries.forEach((e, i) => {
      if (e.stats && buttons[i]) buttons[i].classList.add("is-stats");
    });
  }
  async function fillAvatar() {
    let user = { name: "", imageUrl: null };
    try {
      user = await getUserChip({ retries: 20, isAlive: () => Boolean(state12.profileBtn) });
    } catch {
    }
    if (!state12.profileBtn) return;
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
      state12.seq++;
      state12.route = route;
      const root7 = mountPoint(ROOT_ID12, { tag: "nav", className: "lfx-plus-tabbar" });
      root7.textContent = "";
      root7.setAttribute("aria-label", "Hauptnavigation");
      for (const t of TABS) {
        root7.append(h("a", { class: "lfx-plus-tabbar__tab", href: t.href, "aria-label": t.label, dataset: { key: t.key } }, [iconEl(t.icon)]));
      }
      const profileBtn = h("button", {
        type: "button",
        class: "lfx-plus-tabbar__tab",
        "aria-label": "Profil",
        "aria-haspopup": "dialog",
        dataset: { key: "profile" }
      }, [h("span", { class: "lfx-plus-tabbar__avatar", "aria-hidden": "true" })]);
      profileBtn.addEventListener("click", openProfile);
      root7.append(profileBtn);
      state12.root = root7;
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
      cl2.add(ON_CLASS11);
      applyActive6();
      fillAvatar();
    },
    update(route) {
      const changed = !state12.route || state12.route.hash !== route.hash;
      state12.route = route;
      if (changed) closeProfile();
      applyActive6();
    },
    unmount() {
      closeProfile();
      for (const fn of state12.cleanups.splice(0)) fn();
      unmountPoint(ROOT_ID12);
      document.documentElement.classList.remove(ON_CLASS11);
      state12.root = null;
      state12.profileBtn = null;
    }
  };
  var tabbar_default = plusTabbar;

  // src/js/features/plus/nativedetail.js
  var URL_RE = /url\(\s*["']?([^"')]+)["']?\s*\)/;
  var bgUrl = (el4) => {
    if (!el4) return null;
    const css = el4.style && el4.style.backgroundImage || (typeof getComputedStyle === "function" ? getComputedStyle(el4).backgroundImage : "");
    const m = URL_RE.exec(css || "");
    return m ? m[1] : null;
  };
  function setClass2(el4, cls, on) {
    if (el4.classList.contains(cls) !== on) el4.classList.toggle(cls, on);
  }
  function logoHidden(el4) {
    if (typeof getComputedStyle !== "function") return false;
    return getComputedStyle(el4).display === "none";
  }
  function createNativeDetail({ name, theme, nologoClass, nobdClass = null }) {
    const NOLOGO = nologoClass;
    const NOBD = nobdClass;
    const ALL = [NOLOGO, NOBD].filter(Boolean);
    const state21 = { page: null, obs: null, timer: 0, poll: 0, probes: /* @__PURE__ */ new Map(), tries: 0 };
    function probeLogo(url) {
      if (state21.probes.has(url) || typeof Image !== "function") return;
      state21.probes.set(url, "pending");
      const img = new Image();
      img.onload = () => state21.probes.set(url, "ok");
      img.onerror = () => {
        state21.probes.set(url, "bad");
        evaluate3();
      };
      img.src = url;
    }
    function evaluate3() {
      const page2 = state21.page;
      if (!page2 || !page2.isConnected) return;
      const logoEl = page2.querySelector(".detailLogo");
      const logoUrl2 = logoEl && !logoEl.classList.contains("hide") ? bgUrl(logoEl) : null;
      if (logoUrl2) probeLogo(logoUrl2);
      let noLogo = !logoUrl2 || state21.probes.get(logoUrl2) === "bad";
      if (!noLogo) {
        const had = page2.classList.contains(NOLOGO);
        if (had) page2.classList.remove(NOLOGO);
        noLogo = logoHidden(logoEl);
        if (had) page2.classList.add(NOLOGO);
      }
      setClass2(page2, NOLOGO, noLogo);
      if (NOBD) {
        const bd = page2.querySelector(".itemBackdrop");
        const own2 = bd && !bd.classList.contains("hide") && bgUrl(bd);
        const global = !!document.querySelector(".backdropContainer .displayingBackdropImage");
        const wide = typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1000px)").matches;
        setClass2(page2, NOBD, !own2 && !(wide && global));
      }
    }
    function schedule4() {
      if (state21.timer) return;
      state21.timer = setTimeout(() => {
        state21.timer = 0;
        evaluate3();
      }, 60);
    }
    function clearPage() {
      if (state21.obs) state21.obs.disconnect();
      state21.obs = null;
      clearTimeout(state21.timer);
      clearTimeout(state21.poll);
      state21.timer = 0;
      state21.poll = 0;
      if (state21.page) {
        state21.page.classList.remove(...ALL);
        state21.page = null;
      }
      for (const p of document.querySelectorAll(ALL.map((c) => `.${c}`).join(", "))) p.classList.remove(...ALL);
      state21.probes.clear();
    }
    function attach2() {
      const page2 = document.querySelector("#itemDetailPage:not(.hide)");
      if (!page2) {
        if (++state21.tries < 30) state21.poll = setTimeout(attach2, 200);
        return;
      }
      if (state21.page === page2) return;
      if (state21.obs) state21.obs.disconnect();
      state21.page = page2;
      state21.obs = new MutationObserver((records) => {
        if (records.every((r) => r.type === "attributes" && r.target === page2)) return;
        schedule4();
      });
      state21.obs.observe(page2, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style"] });
      evaluate3();
    }
    const feature = {
      name,
      match: (route) => isTheme(theme) && isModern() && !isTv() && isReady() && route.path === "/details",
      mount() {
        state21.tries = 0;
        attach2();
      },
      update() {
        state21.tries = 0;
        clearTimeout(state21.poll);
        state21.probes.clear();
        const page2 = document.querySelector("#itemDetailPage:not(.hide)");
        if (page2 && page2 !== state21.page) clearPage();
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
  var ID10 = "lfx-plus-favempty";
  var EMPTY_TEXT = "Noch nichts auf deiner Liste. F\xFCge Titel \xFCber + hinzu.";
  var SETTLE_MS = 1500;
  var state13 = { tab: null, obs: null, timer: 0, poll: 0, tries: 0 };
  var isFavRoute = (route) => route && route.path === "/home" && route.params.get("tab") === "1" && !route.params.get("lfx");
  function findTab() {
    const tab2 = document.querySelector("#indexPage:not(.hide) #favoritesTab");
    return tab2 && tab2.isConnected ? tab2 : null;
  }
  var hasCards = (tab2) => !!tab2.querySelector(".card, .listItem");
  function check2() {
    state13.timer = 0;
    const tab2 = state13.tab;
    if (!tab2 || !tab2.isConnected) return;
    const mine = document.getElementById(ID10);
    if (hasCards(tab2)) {
      if (mine) mine.remove();
    } else if (!mine) {
      tab2.prepend(h("p", { id: ID10, class: "lfx-plus-favempty" }, EMPTY_TEXT));
    }
  }
  function schedule3(delay = SETTLE_MS) {
    clearTimeout(state13.timer);
    state13.timer = setTimeout(check2, delay);
  }
  function teardown6() {
    if (state13.obs) state13.obs.disconnect();
    state13.obs = null;
    clearTimeout(state13.timer);
    clearTimeout(state13.poll);
    state13.timer = 0;
    state13.poll = 0;
    state13.tab = null;
    document.getElementById(ID10)?.remove();
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
      if (records.every((r) => [...r.addedNodes, ...r.removedNodes].every((n) => n.id === ID10))) return;
      schedule3();
    });
    state13.obs.observe(tab2, { childList: true, subtree: true });
    schedule3();
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
  var ID11 = "lfx-prime-search";
  var DEBOUNCE_MS2 = 300;
  var MAX_CARDS = 8;
  var MAX_CARDS_MOBILE = 18;
  var MAX_SUGGESTIONS = 5;
  var MIN_LEN3 = 2;
  var SVG_NS = "http://www.w3.org/2000/svg";
  var FOCUSABLE2 = "a[href], button:not([disabled]), input:not([disabled])";
  var cur = null;
  function searchIcon() {
    const svg11 = document.createElementNS(SVG_NS, "svg");
    svg11.setAttribute("viewBox", "0 0 24 24");
    svg11.setAttribute("aria-hidden", "true");
    svg11.setAttribute("class", "lfx-prime-search__icon");
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", "M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.3 4.3-1.4 1.4-4.3-4.3A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z");
    svg11.append(p);
    return svg11;
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
    const prev2 = returnFocus || (document.activeElement && document.activeElement !== document.body ? document.activeElement : null);
    const mobile = isMobile() && isNarrow();
    const root7 = mountPoint(ID11, { className: `lfx-prime-search${mobile ? " lfx-prime-search--full" : ""}` });
    root7.setAttribute("role", "dialog");
    root7.setAttribute("aria-modal", "true");
    root7.setAttribute("aria-label", "Suche");
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
    const grid2 = h("div", { class: "lfx-prime-search__grid" });
    const status = h("p", { class: "lfx-prime-search__status", role: "status" });
    const panel = h("div", { class: "lfx-prime-search__panel" }, [head, suggest, status, grid2]);
    root7.replaceChildren(panel);
    const c = { root: root7, input, panel, timer: null, ctrl: null, returnFocus: prev2, seq: 0 };
    cur = c;
    const close2 = () => closePrimeSearch();
    const reset = () => {
      suggest.replaceChildren();
      grid2.replaceChildren();
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
        grid2.replaceChildren(...items.slice(0, mobile ? MAX_CARDS_MOBILE : MAX_CARDS).map((it) => card2(it, close2, mobile)));
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
    root7.addEventListener("mousedown", (e) => {
      if (!panel.contains(e.target)) close2();
    });
    c.onKeydown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        close2();
      } else if (e.key === "Tab") {
        const list = [...panel.querySelectorAll(FOCUSABLE2)].filter((el4) => !el4.hidden);
        if (!list.length) return;
        const first2 = list[0];
        const last = list[list.length - 1];
        const active5 = document.activeElement;
        if (!panel.contains(active5)) {
          e.preventDefault();
          first2.focus();
        } else if (e.shiftKey && active5 === first2) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active5 === last) {
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
  function openMenus({ wrap, button, flyout, load: load6 }) {
    let opened = false;
    let loaded = false;
    let leaveTimer2 = null;
    let pinned = false;
    let gen8 = 0;
    const items = () => [...flyout.querySelectorAll(ITEM)];
    async function ensureLoaded() {
      if (loaded) return;
      loaded = true;
      const mine = ++gen8;
      let data;
      try {
        data = await load6();
      } catch {
        data = { libraries: [], collections: [] };
      }
      if (mine !== gen8) return;
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
    const onKeydown3 = (e) => {
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
    wrap.addEventListener("keydown", onKeydown3);
    wrap.addEventListener("focusout", onFocusOut);
    document.addEventListener("click", onDocClick2, true);
    return {
      open: open2,
      close: close2,
      isOpen: () => opened,
      destroy() {
        gen8++;
        close2();
        document.removeEventListener("click", onDocClick2, true);
        wrap.removeEventListener("mouseenter", onEnter);
        wrap.removeEventListener("mouseleave", onLeave);
        wrap.removeEventListener("keydown", onKeydown3);
        wrap.removeEventListener("focusout", onFocusOut);
      }
    };
  }

  // src/js/features/prime/profile-sheet.js
  var ID12 = "lfx-prime-profilesheet";
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
    if (it.switch) {
      return switchButton(it, { className: "lfx-prime-psheet__item lfx-prime-psheet__item--switch", role: "switch", labelClass: "lfx-prime-psheet__label" });
    }
    const kids = [h("span", { class: "lfx-prime-psheet__label" }, it.label)];
    if (it.badge) kids.push(badgePill(it.badge));
    const aria = badgedName(it.label, it.badge);
    const cls = `lfx-prime-psheet__item${it.className ? ` ${it.className}` : ""}`;
    const node = it.href ? h("a", { class: cls, href: it.href, "aria-label": aria, dataset: { key: it.key || "" } }, kids) : h("button", { type: "button", class: cls, "aria-label": aria, dataset: { key: it.key || "" } }, kids);
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
    const root7 = mountPoint(ID12, { className: "lfx-prime-psheet-overlay" });
    const who = h("div", { class: "lfx-prime-psheet__who" });
    const body = h("div", { class: "lfx-prime-psheet__body" });
    const sheet = h("div", { class: "lfx-prime-psheet", role: "dialog", "aria-modal": "true", "aria-label": "Profil", tabindex: "-1" }, [
      h("span", { class: "lfx-prime-psheet__grip", "aria-hidden": "true" }),
      who,
      body
    ]);
    root7.replaceChildren(sheet);
    const c = { root: root7, sheet, returnFocus: returnFocus || null };
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
        const active5 = document.activeElement;
        if (!sheet.contains(active5)) {
          e.preventDefault();
          first2.focus();
        } else if (e.shiftKey && active5 === first2) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active5 === last) {
          e.preventDefault();
          first2.focus();
        }
      }
    };
    c.onHash = () => close2({ restoreFocus: false });
    root7.addEventListener("click", (e) => {
      if (e.target === root7) close2();
    });
    window.addEventListener("keydown", c.onKeydown, true);
    window.addEventListener("hashchange", c.onHash);
    if (typeof attachSwipeClose === "function") {
      c.detachSwipe = attachSwipeClose(sheet, { onClose: () => close2(), backdrop: root7 });
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
  var ID13 = "lfx-prime-header";
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
    tv: "M5 4h14a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-3.5l.8 2H17v2H7v-2h.7l.8-2H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3ZM5 6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1ZM12 8.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4Z",
    bookmark: "M6 3h12a1 1 0 0 1 1 1v17l-7-4.6L5 21V4a1 1 0 0 1 1-1Zm1 2v12.2l5-3.3 5 3.3V5H7Z"
  };
  function icon3(name) {
    const svg11 = document.createElementNS(SVG_NS2, "svg");
    svg11.setAttribute("viewBox", "0 0 24 24");
    svg11.setAttribute("aria-hidden", "true");
    svg11.setAttribute("focusable", "false");
    const p = document.createElementNS(SVG_NS2, "path");
    p.setAttribute("d", ICONS4[name]);
    svg11.append(p);
    return svg11;
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
    if (lfx === "tv") return "tv";
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
    const el4 = document.querySelector(selector);
    if (!el4) return "";
    return String((attr ? el4.getAttribute(attr) : el4.textContent) || "").trim();
  }
  function mobileTitle(route, libs = []) {
    if (!route) return "";
    const p = route.params;
    if (route.path === "/home") {
      const lfx = p.get("lfx");
      if (p.get("tab") === "1") return "Meine Liste";
      if (lfx === "new") return "Neu & beliebt";
      if (lfx === "tv") return "TV";
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
  function applyActive7() {
    if (!state14.el || !state14.route) return;
    const key = activeKey3(state14.route);
    for (const el4 of state14.el.querySelectorAll("[data-key]")) {
      const on = el4.dataset.key === key;
      el4.classList.toggle("is-active", on);
      if (on) el4.setAttribute("aria-current", "page");
      else el4.removeAttribute("aria-current");
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
    applyActive7();
  }
  function profileIsOpen() {
    const el4 = document.getElementById("lfx-popover");
    return isPopoverOpen() && Boolean(el4 && el4.classList.contains("lfx-prime-profile"));
  }
  function closeProfile2() {
    if (profileIsOpen()) closePopover();
  }
  async function toggleProfile(btn3) {
    if (profileIsOpen()) {
      closePopover({ restoreFocus: true });
      return;
    }
    if (state14.profileBusy) return;
    state14.profileBusy = true;
    try {
      state14.menus.close();
      const items = await profileEntries({ theme: "prime", returnFocus: btn3 });
      if (!state14.el || !btn3.isConnected) return;
      openPopover(btn3, { label: "Profil", items, align: "end", className: "lfx-prime-profile" });
    } finally {
      state14.profileBusy = false;
    }
  }
  function tvLink() {
    const a = h("a", {
      class: "lfx-prime-header__icon",
      href: tvModeHref,
      "aria-label": "TV",
      title: "TV",
      dataset: { key: "tv" }
    }, [icon3("tv")]);
    a.addEventListener("click", () => window.dispatchEvent(new CustomEvent("lfx:tvmode-intent")));
    return a;
  }
  var dsLink = () => createDataSaverButton({ className: "lfx-prime-header__icon" });
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
    const right = h("div", { class: "lfx-prime-header__right" }, [searchBtn, tvLink(), dsLink(), gridWrap, listLink, avatar]);
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
    const bar = h("div", { class: "lfx-prime-header__bar" }, [...left, h("div", { class: "lfx-prime-header__right" }, [tvLink(), dsLink(), avatar])]);
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
    applyActive7();
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
      chip = await getUserChip({ retries: 20, isAlive: () => seq3 === state14.seq && Boolean(state14.el) });
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
    state14.mobile = isMobile() && isNarrow();
    state14.kind = null;
    const parts = state14.mobile ? buildMobile(state14.route) : build6();
    state14.el.className = `lfx-prime-header${state14.mobile ? ` lfx-prime-header--mobile lfx-prime-header--${state14.kind}` : ""}`;
    syncHtmlClasses();
    applyScroll();
    renderNav2();
    renderPills();
    applyActive7();
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
      state14.el = mountPoint(ID13, { tag: "header", className: "lfx-prime-header" });
      document.documentElement.classList.add(HTML_CLASS);
      window.addEventListener("scroll", onScroll4, { passive: true });
      state14.cleanups.push(() => window.removeEventListener("scroll", onScroll4));
      render8();
    },
    update(route) {
      const changed = !state14.route || state14.route.hash !== route.hash;
      state14.route = route;
      if (!state14.el) return;
      const mobileNow = isMobile() && isNarrow();
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
      applyActive7();
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
      unmountPoint(ID13);
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
    const btn3 = h("button", { type: "button", class: "lfx-prime-more" }, "Mehr");
    btn3.addEventListener("click", () => onClick(btn3));
    return btn3;
  }
  function buildFooter() {
    const href = statsHref("prime");
    const picker = h("button", { type: "button", class: "lfx-prime-footer__link", "aria-label": badgedName("Design Einstellungen", "Beta") }, ["Design Einstellungen", badgePill("Beta")]);
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
      return { line1: n, line2: resume2 ? "Fortsetzen" : "weiter ansehen", progress: resume2 ? progressPercent2(next) : 0 };
    }
    const resume = hasResume(item);
    return { line1: resume ? "Fortsetzen" : "Abspielen", line2: null, progress: resume ? progressPercent2(item) : 0 };
  }

  // src/js/features/prime/preview-gate.js
  var HOLD_EVENT = "lfx-prime-preview-hold";
  var VISIBLE_RATIO = 0.2;
  function setPreviewHold(on) {
    document.dispatchEvent(new CustomEvent(HOLD_EVENT, { detail: { on: Boolean(on) } }));
  }
  function autoPause(video2, { respectHold = false } = {}) {
    let visible = true;
    let held2 = false;
    let stopped = false;
    let io = null;
    const sync3 = () => {
      if (stopped || !video2) return;
      const want = visible && !held2 && !document.hidden;
      try {
        if (want && video2.paused) {
          const p = video2.play && video2.play();
          if (p && p.catch) p.catch(() => {
          });
        } else if (!want && !video2.paused) {
          video2.pause();
        }
      } catch {
      }
    };
    const onVis = () => sync3();
    const onHold = (e) => {
      held2 = Boolean(e.detail && e.detail.on);
      sync3();
    };
    if (typeof IntersectionObserver === "function") {
      io = new IntersectionObserver((entries) => {
        const e = entries[entries.length - 1];
        if (!e) return;
        visible = e.isIntersecting && e.intersectionRatio >= VISIBLE_RATIO;
        sync3();
      }, { threshold: [0, VISIBLE_RATIO, 1] });
      io.observe(video2);
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
  var TRAILER_DELAY_MS = 3e3;
  var IMG_FADE_MS2 = 1e3;
  var TEXT_FADE_MS2 = 350;
  var FIELDS3 = "Overview,Genres,OfficialRating,ProductionYear,RunTimeTicks,ChildCount,DateCreated,RemoteTrailers,LocalTrailerCount";
  var FIRST_KEY = "lfx-prime-hero-first";
  var NS2 = "http://www.w3.org/2000/svg";
  function svg8(html2, cls) {
    const el4 = document.createElementNS(NS2, "svg");
    el4.setAttribute("viewBox", "0 0 24 24");
    el4.setAttribute("aria-hidden", "true");
    if (cls) el4.setAttribute("class", cls);
    el4.innerHTML = html2;
    return el4;
  }
  var ICON_PLAY4 = '<path fill="currentColor" d="M6 3.5v17a1 1 0 0 0 1.5.86l14-8.5a1 1 0 0 0 0-1.72l-14-8.5A1 1 0 0 0 6 3.5z"/>';
  var ICON_PLUS4 = '<path fill="currentColor" d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z"/>';
  var ICON_CHECK4 = '<path fill="currentColor" d="M9.2 16.6 4.9 12.3l-1.4 1.4 5.7 5.7L20.5 8.1l-1.4-1.4z"/>';
  var ICON_INFO = '<path fill="currentColor" d="M11 10h2v8h-2zM11 6h2v2h-2z"/>';
  var ICON_MUTED2 = '<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z"/>';
  var ICON_SOUND2 = '<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/>';
  var ICON_TREND = '<path fill="currentColor" d="M3 17.6 9.5 11l4 4L21 7.5V12h2V4h-8v2h4.6l-6.1 6.1-4-4L1.6 16.2z"/>';
  var ICON_CHEV = '<polyline points="8,3 17,12 8,21" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
  function svgIcon(html2, cls) {
    return svg8(html2, cls);
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
  var poolWarm2 = false;
  function fetchHomePool() {
    const key = homeKey(getUserId(), "prime-hero");
    poolWarm2 = peekCached(key) !== void 0;
    const p = cached(key, loadHomePool, HOME_TTL);
    p.then((pool) => {
      if (!pool.length) clearCache(key);
    }, () => {
    });
    return p;
  }
  async function loadHomePool() {
    const base = { Recursive: true, IncludeItemTypes: "Movie,Series", ImageTypes: "Logo,Backdrop", Fields: FIELDS3, EnableUserData: true, Limit: 40 };
    const [latest, random] = await Promise.all([
      getItems({ ...base, SortBy: "DateCreated", SortOrder: "Descending" }).catch(() => null),
      getItems({ ...base, SortBy: "Random" }).catch(() => null)
    ]);
    const pool = buildPool(latest && latest.Items, random && random.Items, { avoidFirstId: readFirst(), newCount: 3, randomCount: 7 });
    if (pool[0]) writeFirst(pool[0].Id);
    return pool;
  }
  function renderHero(slot, { loadPool: loadPool2 }) {
    const mobile = isMobile() && isNarrow();
    let newInfo = null;
    let logoBox = null;
    let disposed = false;
    let pool = [];
    let index = 0;
    let gen8 = 0;
    let hovering = false;
    let trailerActive = false;
    let rotateTimer = null;
    let preview = null;
    let gate = null;
    let video2 = null;
    let trend2 = null;
    let media = null;
    let content = null;
    let muteBtn = null;
    let dots = null;
    let hero = null;
    const timers = /* @__PURE__ */ new Set();
    const cleanupFns = [];
    const setTr = (v) => {
      if (v) slot.dataset.lfxTr = v;
      else delete slot.dataset.lfxTr;
    };
    const later = (fn, ms) => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
      return t;
    };
    const paused3 = () => hovering || trailerActive || document.hidden || document.documentElement.classList.contains("lfx-modal-open") || isMenuOpen() || isChooserOpen();
    function stopTrailer() {
      if (gate) {
        gate.stop();
        gate = null;
      }
      if (preview) {
        preview.cancel();
        preview = null;
      }
      video2 = null;
      trailerActive = false;
      setTr("");
      if (muteBtn) muteBtn.hidden = true;
      if (hero) hero.classList.remove("is-trailer");
    }
    function scheduleRotate() {
      clearTimeout(rotateTimer);
      rotateTimer = null;
      if (disposed || pool.length < 2 || reducedMotion2()) return;
      rotateTimer = setTimeout(() => {
        rotateTimer = null;
        if (paused3()) scheduleRotate();
        else show3((index + 1) % pool.length);
      }, ROTATE_MS2);
    }
    function setMuteIcon() {
      if (!video2) return;
      muteBtn.replaceChildren(svg8(video2.muted ? ICON_MUTED2 : ICON_SOUND2));
      muteBtn.setAttribute("aria-label", video2.muted ? "Ton einschalten" : "Ton ausschalten");
    }
    function startTrailer(item, myGen) {
      if (mobile || reducedMotion2() || isDataSaver() || disposed || myGen !== gen8) return;
      preview = createMutedPreview(media, item, {
        delay: TRAILER_DELAY_MS,
        startAt: 4,
        onStart: (v) => {
          if (disposed || myGen !== gen8) return;
          video2 = v;
          gate = autoPause(v, { respectHold: true });
          trailerActive = true;
          setTr("on");
          v.classList.add("is-in");
          hero.classList.add("is-trailer");
          muteBtn.hidden = false;
          setMuteIcon();
        },
        onEnd: () => {
          if (disposed || myGen !== gen8) return;
          preview = null;
          stopTrailer();
          scheduleRotate();
        }
      });
      setTr("wait");
      later(() => {
        if (myGen === gen8 && slot.dataset.lfxTr === "wait") setTr("");
      }, TRAILER_DELAY_MS + 4e3);
    }
    function playButton(item, myGen) {
      const label = h("span", { class: "lfx-prime-hero__label" });
      const btn3 = h("button", { type: "button", class: "lfx-prime-hero__play" }, [svg8(ICON_PLAY4), label]);
      const bar = h("span", { class: "lfx-prime-hero__bar" });
      const progress = h("span", { class: "lfx-prime-hero__progress", hidden: true }, [bar]);
      const paint = (state21) => {
        label.replaceChildren(...[
          h("span", { class: "lfx-prime-hero__label1" }, state21.line1),
          state21.line2 ? h("span", { class: "lfx-prime-hero__label2" }, state21.line2) : null
        ].filter(Boolean));
        btn3.classList.toggle("is-two", Boolean(state21.line2));
        progress.hidden = !(state21.progress > 0);
        bar.style.width = `${Math.round(state21.progress)}%`;
      };
      paint(playLabel(item));
      if (item.Type === "Series") {
        loadNextUp(item.Id).then((ep) => {
          if (disposed || myGen !== gen8 || !btn3.isConnected) return;
          paint(playLabel(item, ep));
        }, () => {
        });
      }
      btn3.addEventListener("click", () => {
        playTitle(item);
      });
      return h("div", { class: "lfx-prime-hero__playwrap" }, [btn3, progress]);
    }
    function listButton(item) {
      const btn3 = h("button", { type: "button", class: "lfx-prime-hero__round lfx-prime-hero__round--list", title: "Meine Liste" });
      const paint = () => {
        const on = Boolean(item.UserData && item.UserData.IsFavorite);
        btn3.replaceChildren(svg8(on ? ICON_CHECK4 : ICON_PLUS4));
        btn3.classList.toggle("is-on", on);
        btn3.setAttribute("aria-pressed", on ? "true" : "false");
        btn3.setAttribute("aria-label", on ? "Aus Meine Liste entfernen" : "Zu Meine Liste hinzuf\xFCgen");
      };
      paint();
      btn3.addEventListener("click", async () => {
        await toggleFavorite2(item);
        if (btn3.isConnected) paint();
      });
      return btn3;
    }
    function buildContent(item, myGen) {
      const logo = logoImage(item, { maxWidth: 720 });
      const rank = heroTrendLine(item, trend2);
      const info = h("a", {
        class: "lfx-prime-hero__round lfx-prime-hero__round--info",
        href: titleHref(item.Id),
        "aria-label": "Weitere Informationen",
        title: "Weitere Informationen"
      }, [svg8(ICON_INFO)]);
      const fsk = formatRating(item.OfficialRating);
      return h("div", null, [
        h("div", { class: "lfx-prime-hero__text" }, [
          logo ? h("img", { class: "lfx-prime-hero__logo", src: logo, alt: item.Name || "", decoding: "async" }) : h("h2", { class: "lfx-prime-hero__title" }, item.Name || ""),
          rank ? h("div", { class: "lfx-prime-hero__rank" }, [svg8(ICON_TREND), h("span", null, rank)]) : null,
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
        rank ? h("div", { class: "lfx-prime-hero__rank" }, [svg8(ICON_TREND), h("span", null, rank)]) : null,
        h("div", { class: "lfx-prime-hero__actions" }, [playButton(item, myGen)])
      ]);
      return { title, info };
    }
    function buildImage(item) {
      const bd = imageUrl(item, { type: "Backdrop", maxWidth: 1920, quality: 90 });
      return h("img", { class: "lfx-prime-hero__img", src: bd, alt: "", decoding: poolWarm2 ? null : "async" });
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
        b.addEventListener("click", () => show3(i));
        return b;
      }));
      dots.hidden = pool.length < 2;
      updateDots();
    }
    function show3(i, immediate = false) {
      if (disposed || !pool[i]) return;
      const item = pool[i];
      index = i;
      gen8 += 1;
      const myGen = gen8;
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
        if (disposed || myGen !== gen8) return;
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
    function onSaver(active5) {
      if (disposed || !hero || !active5) return;
      stopTrailer();
      const cur3 = pool[index];
      pool = saverPool(pool, cur3 && cur3.Id);
      index = Math.max(0, cur3 ? pool.indexOf(cur3) : 0);
      fillDots();
      scheduleRotate();
    }
    function step(dir) {
      if (pool.length > 1) show3((index + dir + pool.length) % pool.length);
    }
    function onChanged2({ removed = [] }) {
      if (disposed || !hero || !removed.length || !pool.some((it) => removed.includes(it.Id))) return;
      const cur3 = pool[index];
      const curGone = cur3 && removed.includes(cur3.Id);
      pool = pool.filter((it) => !removed.includes(it.Id));
      if (!pool.length) {
        gen8 += 1;
        stopTrailer();
        clearTimeout(rotateTimer);
        slot.hidden = true;
        return;
      }
      index = curGone ? Math.min(index, pool.length - 1) : pool.indexOf(cur3);
      fillDots();
      if (curGone) show3(index);
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
    function build11() {
      media = h("div", { class: "lfx-prime-hero__media" });
      content = h("div", { class: "lfx-prime-hero__live", "aria-live": "off" });
      muteBtn = h("button", { type: "button", class: "lfx-prime-hero__mute", hidden: true, "aria-label": "Ton einschalten" });
      muteBtn.addEventListener("click", () => {
        if (!video2) return;
        video2.muted = !video2.muted;
        setMuteIcon();
      });
      dots = h("div", { class: "lfx-prime-hero__dots", role: "group", "aria-label": "Empfehlung w\xE4hlen" });
      if (mobile) {
        buildMobile2();
        return;
      }
      const prev2 = h("button", { type: "button", class: "lfx-prime-hero__arrow lfx-prime-hero__arrow--prev", "aria-label": "Vorherige Empfehlung" });
      const next = h("button", { type: "button", class: "lfx-prime-hero__arrow lfx-prime-hero__arrow--next", "aria-label": "N\xE4chste Empfehlung" });
      prev2.append(svg8(ICON_CHEV));
      next.append(svg8(ICON_CHEV));
      prev2.addEventListener("click", () => step(-1));
      next.addEventListener("click", () => step(1));
      fillDots();
      hero = h("div", { class: "lfx-prime-hero" }, [
        media,
        h("div", { class: "lfx-prime-hero__shade", "aria-hidden": "true" }),
        h("div", { class: "lfx-prime-hero__shade lfx-prime-hero__shade--corner", "aria-hidden": "true" }),
        prev2,
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
        items = await loadPool2();
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
      pool = isDataSaver() ? saverPool(items) : items;
      putItems(pool);
      build11();
      cleanupFns.push(onDataSaverChange(onSaver));
      slot.hidden = false;
      slot.classList.remove("is-loading");
      show3(0, true);
    }
    slot.hidden = false;
    slot.classList.add("is-loading");
    init2();
    return () => {
      disposed = true;
      gen8 += 1;
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
  var ROOT_ID13 = "lfx-prime-home";
  var ON_CLASS12 = "lfx-prime-home-on";
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
  function findHomeTab6() {
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
  function createPrimeCard(item, { kind: kind2 = "landscape", badge: badge3 = null, rank = 0, eager = false } = {}) {
    const lazy = eager ? {} : { loading: "lazy", decoding: "async" };
    const poster = kind2 === "poster";
    const wide = landscapeFor(item);
    const pUrl = poster ? posterUrl(item, 400) : null;
    const src = poster ? pUrl || wide && wide.url : wide ? wide.url : posterUrl(item, 400);
    const titled = !poster && (!wide || !wide.isThumb);
    const children = [];
    if (src) children.push(h("img", { class: "lfx-card__img", src, alt: "", ...lazy }));
    if (titled) {
      const logo = logoImage(item, { maxWidth: 400 });
      children.push(logo ? h("img", { class: "lfx-card__logo", src: logo, alt: "", ...lazy }) : h("span", { class: "lfx-card__title" }, displayTitle3(item)));
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
      const p = progressPercent(item);
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
  var EAGER_ROWS3 = 3;
  var EAGER_CARDS3 = 8;
  var lastInfo2 = null;
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
  function createRows(slot, { posterId = null, moreHref = () => null, prefetch: wantPrefetch = false, hero = null } = {}) {
    let disposed = false;
    let observer2 = null;
    let prefetch = null;
    let infoP = null;
    const disposers = [];
    const pending = /* @__PURE__ */ new Map();
    const rendered = /* @__PURE__ */ new Set();
    let shown3 = 0;
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
    function fill4(rowEl, def, kind2, items, inf, eager) {
      putItems(items);
      const cards = items.map((it, i) => createPrimeCard(it, {
        kind: kind2,
        rank: kind2 === "top10" ? i + 1 : 0,
        badge: cardBadge(it, inf),
        eager: eager && i < EAGER_CARDS3
      }));
      const track = rowEl.querySelector(".lfx-prime-row__track");
      const prev2 = arrow("prev", "Zur\xFCck");
      const next = arrow("next", "Weiter");
      track.replaceChildren(...cards);
      track.setAttribute("aria-label", def.title || "");
      track.before(prev2);
      track.after(next);
      rowEl.querySelector(".lfx-prime-row__title").textContent = def.title || "";
      rowEl.classList.remove("is-loading");
      disposers.push(attachScroller({ track, prev: prev2, next, indicator: null }));
    }
    async function loadRow(rowEl, def, kind2) {
      try {
        const items = (await def.load(def)).filter((i) => i && i.Id);
        if (disposed) return;
        if (!items.length) {
          rowEl.remove();
          return;
        }
        const inf = await info();
        if (disposed) return;
        lastInfo2 = { v: inf, at: Date.now() };
        fill4(rowEl, def, kind2, items, inf, false);
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
      }, { rootMargin: isDataSaver() ? "100px 0px" : "600px 0px" });
    }
    return {
      add(defs) {
        if (disposed) return;
        ensureObserver();
        const inf = lastInfo2 && Date.now() - lastInfo2.at < HOME_TTL ? lastInfo2.v : null;
        for (const def of defs || []) {
          if (!def || rendered.has(def.id)) continue;
          rendered.add(def.id);
          const kind2 = displayKind(def, posterId);
          const snap = inf && def.cacheKey ? peekCached(def.cacheKey) : void 0;
          if (snap) {
            const items = snap.items.filter((i) => i && i.Id);
            if (!items.length) continue;
            def.title = snap.title;
            const el5 = skeleton3(def, kind2);
            slot.append(el5);
            fill4(el5, def, kind2, items, inf, shown3++ < EAGER_ROWS3);
            continue;
          }
          const el4 = skeleton3(def, kind2);
          slot.append(el4);
          pending.set(el4, { def, kind: kind2 });
          if (observer2) observer2.observe(el4);
          else {
            pending.delete(el4);
            loadRow(el4, def, kind2);
          }
        }
        if (prefetch) prefetch.notify();
        else if (wantPrefetch) {
          prefetch = startRowPrefetch({
            slot,
            pending,
            hero,
            load: (el4, p) => {
              if (observer2) observer2.unobserve(el4);
              return loadRow(el4, p.def, p.kind);
            }
          });
        }
      },
      ids: () => [...rendered],
      destroy() {
        disposed = true;
        if (prefetch) prefetch.stop();
        prefetch = null;
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
  var waitTimer5 = null;
  var gen3 = 0;
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
    document.getElementById(ROOT_ID13)?.remove();
    document.documentElement.classList.remove(ON_CLASS12);
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
  async function start4(tab2, route, myGen) {
    let libs = [];
    try {
      libs = await getLibraries();
    } catch {
      libs = [];
    }
    if (myGen !== gen3) return;
    const hub = route.kind === "hub";
    const lib = hub ? libs.find((l) => l.id === route.lib && l.hubCapable) : null;
    if (hub && !lib) return;
    teardown7();
    const heroSlot = h("section", { id: "lfx-prime-hero", class: "lfx-prime-hero-slot", "aria-label": "Empfehlung" });
    const rowsSlot = h("div", { class: "lfx-prime-rows" });
    const moreSlot = h("div", { class: "lfx-prime-moreslot" });
    const root7 = h("div", { id: ROOT_ID13, class: `lfx-prime-home lfx-prime-home--${hub ? "hub" : "home"}` }, [heroSlot, rowsSlot, moreSlot, buildFooter()]);
    tab2.prepend(root7);
    document.documentElement.classList.add(ON_CLASS12);
    current5 = route;
    builtMobile = isMobile() && isNarrow();
    cleanups4.push(renderHero(heroSlot, { loadPool: () => hub ? getHubHeroPool(lib) : fetchHomePool() }));
    const getDefs = (genreCount2) => hub ? buildHubRowDefs(lib, { genreCount: genreCount2 }) : buildRowDefs({ genreCount: genreCount2 });
    let defs = [];
    try {
      defs = !hub && peekRowDefs({ genreCount: BASE_GENRES }) || await getDefs(BASE_GENRES);
    } catch (e) {
      console.warn("[LenzFlix] Zeilen konnten nicht aufgebaut werden", e && e.message);
    }
    if (myGen !== gen3 || !isReady()) return;
    const rows = createRows(rowsSlot, {
      posterId: pickPosterId(defs, hub),
      moreHref: (def) => moreHrefFor(def, { hub, libs, lib }),
      prefetch: !hub,
      hero: () => heroSlot
    });
    cleanups4.push(() => rows.destroy());
    rows.add(defs);
    let genreCount = BASE_GENRES;
    const moreBtn = buildMoreButton(async (btn3) => {
      if (btn3.disabled) return;
      btn3.disabled = true;
      genreCount += MORE_STEP;
      try {
        const all = await getDefs(genreCount);
        if (myGen !== gen3) return;
        const have = new Set(rows.ids());
        const fresh = all.filter((d) => isGenreDef(d) && !have.has(d.id)).slice(0, MORE_STEP);
        rows.add(fresh);
        if (fresh.length < MORE_STEP) btn3.hidden = true;
      } catch (e) {
        console.warn("[LenzFlix] Weitere Zeilen nicht geladen", e && e.message);
      }
      btn3.disabled = false;
    });
    if (!defs.some(isGenreDef)) moreBtn.hidden = true;
    moreSlot.append(moreBtn);
  }
  function ensure5(route) {
    clearTimeout(waitTimer5);
    const tab2 = findHomeTab6();
    const existing = document.getElementById(ROOT_ID13);
    if (tab2 && existing && tab2.contains(existing) && current5 && current5.key === route.key && builtMobile === (isMobile() && isNarrow())) return;
    gen3 += 1;
    const myGen = gen3;
    let tries = 0;
    const poll = () => {
      if (myGen !== gen3) return;
      const t = findHomeTab6();
      if (t) start4(t, route, myGen);
      else if (++tries < 30) waitTimer5 = setTimeout(poll, 200);
    };
    if (tab2) poll();
    else waitTimer5 = setTimeout(poll, 200);
  }
  var primeHome = {
    name: "prime-home",
    match: (route) => isTheme("prime") && isModern() && !isTv() && isReady() && Boolean(primeHomeRoute(route)),
    mount: (route) => ensure5(primeHomeRoute(route)),
    update: (route) => ensure5(primeHomeRoute(route)),
    unmount() {
      gen3 += 1;
      clearTimeout(waitTimer5);
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
    const paintPlay2 = (state21) => {
      label.replaceChildren(...[
        h("span", null, state21.line1),
        state21.line2 ? h("span", { class: "lfx-prime-hc__label2" }, state21.line2) : null
      ].filter(Boolean));
      play2.classList.toggle("is-two", Boolean(state21.line2));
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
  var active4 = null;
  var intent2 = null;
  var leaveTimer = null;
  var pointerInside = false;
  var listeners5 = [];
  var trendP = null;
  var selfScrollUntil = 0;
  var holdOpen2 = () => Boolean(isMenuOpen() || isChooserOpen());
  var blocked2 = () => holdOpen2() || document.documentElement.classList.contains("lfx-modal-open") || Boolean(document.querySelector(".dialogContainer")) || document.hidden;
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
    return card3 && card3.closest(`#${ROOT_ID13}`) ? card3 : null;
  }
  function clearIntent() {
    if (intent2) clearTimeout(intent2.timer);
    intent2 = null;
  }
  function closeNow2() {
    clearIntent();
    clearTimeout(leaveTimer);
    leaveTimer = null;
    const a = active4;
    active4 = null;
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
    leaveTimer = setTimeout(function check3() {
      leaveTimer = null;
      if (!active4 || pointerInside) return;
      if (holdOpen2()) {
        leaveTimer = setTimeout(check3, HOLD_POLL_MS);
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
    if (!intent2 || intent2.card !== card3) return;
    clearIntent();
    if (active4 || blocked2()) return;
    const a = { card: card3, kind: "popup", el: null, preview: null, video: null, timers: [] };
    const pic = landscapeFor(item, 900);
    const p = progressPercent(item);
    const media = h("a", { class: "lfx-prime-hover__media", href: titleHref(item.Id), "aria-label": item.Name || "" }, [
      pic ? h("img", { class: "lfx-prime-hover__img", src: pic.url, alt: "" }) : null,
      p > 0 ? h("div", { class: "lfx-prime-card__progress" }, [h("div", { class: "lfx-prime-card__bar", style: { width: `${Math.round(p)}%` } })]) : null
    ]);
    const info = h("div", { class: "lfx-prime-hover__info" }, [
      buildTitleInfo(item, "popup", { trend: trendInfo, isCurrent: () => active4 === a })
    ]);
    const el4 = mountPoint(POPUP_ID2, { className: "lfx-prime-hover" });
    el4.className = "lfx-prime-hover";
    el4.replaceChildren(media, info);
    el4.dataset.lfxId = item.Id;
    a.el = el4;
    const r = link.getBoundingClientRect();
    const width = Math.max(Math.round(r.width * SCALE2), MIN_WIDTH2);
    el4.style.width = `${width}px`;
    el4.style.visibility = "hidden";
    el4.style.left = "0px";
    el4.style.top = "0px";
    const imgH = Math.round(width * 9 / 16);
    media.style.height = `${imgH}px`;
    const g = popupGeometry(r, window.innerWidth, window.innerHeight, Math.max(0, el4.offsetHeight - imgH));
    el4.style.left = `${g.left}px`;
    el4.style.top = `${g.top}px`;
    el4.style.transformOrigin = `${g.originX}px ${g.originY}px`;
    el4.style.setProperty("--lfx-prime-s0", String(g.scale));
    el4.style.visibility = "";
    active4 = a;
    pointerInside = true;
    const go3 = () => {
      if (active4 === a) el4.classList.add("is-in");
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => requestAnimationFrame(go3));
    else go3();
    el4.addEventListener("click", (e) => {
      if (e.target.closest("button, a")) return;
      closeNow2();
      window.location.hash = titleHref(item.Id);
    });
  }
  async function openPoster(card3) {
    const item = getStoredItem(card3.dataset.lfxId);
    if (!item) return;
    const trendInfo = await trend();
    if (!intent2 || intent2.card !== card3) return;
    clearIntent();
    if (active4 || blocked2()) return;
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
    const body = h("div", { class: "lfx-prime-expand__body" }, [buildTitleInfo(item, "expand", { trend: trendInfo, isCurrent: () => active4 === a })]);
    const el4 = h("div", { class: "lfx-prime-expand" }, [mediaEl, h("div", { class: "lfx-prime-expand__shade", "aria-hidden": "true" }), mute, body]);
    a.el = el4;
    card3.append(el4);
    card3.classList.add("is-expanded");
    active4 = a;
    pointerInside = true;
    a.timers.push(setTimeout(() => {
      const track = card3.closest(".lfx-prime-row__track");
      if (!track || active4 !== a) return;
      const cr = card3.getBoundingClientRect();
      const tr = track.getBoundingClientRect();
      const over = cr.right - (tr.right - EDGE2 * 2);
      if (over > 0) {
        selfScrollUntil = Date.now() + 700;
        if (typeof track.scrollBy === "function") track.scrollBy({ left: over, behavior: reducedMotion3() ? "auto" : "smooth" });
      }
      if (Date.now() - lastUserScroll < USER_SCROLL_QUIET_MS) return;
      const pr = el4.getBoundingClientRect();
      const dy = scrollDeltaForBottom(Math.max(pr.bottom, cr.bottom), Math.min(pr.top, cr.top), window.innerHeight);
      if (dy > 0 && typeof window.scrollBy === "function") {
        selfScrollUntil = Date.now() + 900;
        window.scrollBy({ top: dy, behavior: reducedMotion3() ? "auto" : "smooth" });
      }
    }, 340));
    if (reducedMotion3() || isDataSaver()) return;
    loadDetail(item.Id).then((detail) => {
      if (active4 !== a || !detail) return;
      a.preview = createMutedPreview(mediaEl, detail, {
        delay: Math.max(0, PREVIEW_MS - (Date.now() - a.t0)),
        startAt: 4,
        onStart: (v) => {
          if (active4 !== a) return;
          a.video = v;
          a.holding = true;
          setPreviewHold(true);
          v.classList.add("is-in");
          el4.classList.add("is-video");
          mute.hidden = false;
          mute.replaceChildren(svgIcon(ICON_MUTED2));
        },
        onEnd: () => {
          if (active4 !== a) return;
          a.preview = null;
          a.video = null;
          if (a.holding) {
            a.holding = false;
            setPreviewHold(false);
          }
          el4.classList.remove("is-video");
          mute.hidden = true;
        }
      });
    }, () => {
    });
  }
  function scheduleOpen2(card3) {
    clearIntent();
    if (blocked2()) return;
    const poster = card3.classList.contains("lfx-prime-card--poster");
    const timer2 = setTimeout(() => {
      if (!intent2 || intent2.card !== card3) return;
      if (!card3.isConnected) {
        clearIntent();
        return;
      }
      (poster ? openPoster : openPopup)(card3);
    }, poster ? INTENT_POSTER_MS : INTENT_WIDE_MS);
    intent2 = { card: card3, timer: timer2 };
  }
  function onOver2(e) {
    const t = e.target;
    const inPopup = Boolean(t && t.closest && t.closest(`#${POPUP_ID2}`));
    const card3 = inPopup ? null : cardOf(t);
    if (inPopup || card3 && active4 && active4.card === card3) {
      pointerInside = true;
      clearTimeout(leaveTimer);
      leaveTimer = null;
      return;
    }
    pointerInside = false;
    if (active4) {
      if (!card3 || card3 !== active4.card) {
        if (card3) closeNow2();
        else scheduleLeave();
      }
    }
    if (card3 && !active4) scheduleOpen2(card3);
    else if (!card3) clearIntent();
  }
  function onOut2(e) {
    if (e.relatedTarget) return;
    pointerInside = false;
    clearIntent();
    if (active4) scheduleLeave();
  }
  function onScroll5() {
    if (Date.now() < selfScrollUntil) return;
    lastUserScroll = Date.now();
    if (!active4 && !intent2) return;
    closeNow2();
  }
  function onKey2(e) {
    if (e.key === "Escape" && active4) closeNow2();
  }
  function add(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    listeners5.push(() => target.removeEventListener(type, fn, opts));
  }
  function start5() {
    add(document, "mouseover", onOver2);
    add(document, "mouseout", onOut2);
    add(document, "keydown", onKey2);
    add(window, "scroll", onScroll5, { capture: true, passive: true });
    add(window, "hashchange", closeNow2);
    add(window, "blur", closeNow2);
  }
  function stop5() {
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
    mount: start5,
    unmount: stop5
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
        progress: resume2 ? progressPercent2(nextUp) : 0,
        target: nextUp,
        resume: resume2
      };
    }
    const resume = !isSeries && hasResume(main);
    return {
      label: resume ? "Fortsetzen" : "Abspielen",
      sub: "",
      progress: resume ? progressPercent2(main) : 0,
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
  var svg9 = (p) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${p}</svg>`;
  var ICONS5 = {
    play: svg9('<path d="M7 4.2v15.6a1 1 0 0 0 1.5.86l13-7.8a1 1 0 0 0 0-1.72l-13-7.8A1 1 0 0 0 7 4.2z"/>'),
    plus: svg9('<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/>'),
    check: svg9('<path d="M9.2 16.6 4.9 12.3l-1.4 1.4 5.7 5.7L20.5 8.1l-1.4-1.4z"/>'),
    trailer: svg9('<path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2v10h14V7zm4.5 2.2 5 2.8-5 2.8z"/>'),
    muted: svg9('<path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z"/>'),
    sound: svg9('<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/>'),
    chevron: svg9('<path d="M6.7 9.3 12 14.6l5.3-5.3 1.4 1.4-6.7 6.7-6.7-6.7z"/>'),
    trend: svg9('<path d="M3 17.6 9.5 11l4 4 6.3-6.6L21 9.7V5h-4.7l1.4 1.4-4.2 4.4-4-4L1.6 15.8z"/>')
  };
  function iconEl2(markup, cls = "lfx-pt__ico") {
    const el4 = h("span", { class: cls, "aria-hidden": "true" });
    el4.innerHTML = markup;
    return el4;
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
  function setIcon2(btn3, markup) {
    const ico = btn3.querySelector(".lfx-pt__ico");
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
    const p = progressPercent2(ep);
    const remaining = remainingLabel2(ep);
    const media = h("button", { type: "button", class: "lfx-pt__ep-media", "aria-label": `${episodeTitle(ep)} abspielen` }, [
      img ? h("img", { class: "lfx-pt__ep-img", src: img.url, alt: "", loading: "lazy", decoding: "async" }) : null,
      h("span", { class: "lfx-pt__ep-play", "aria-hidden": "true" }, [iconEl2(ICONS5.play)]),
      remaining ? h("span", { class: "lfx-pt__ep-badge" }, remaining) : null,
      p > 0 ? h("span", { class: "lfx-pt__ep-progress", "aria-hidden": "true" }, [h("span", { style: { width: `${Math.round(p)}%` } })]) : null
    ]);
    media.addEventListener("click", () => onPlay && onPlay(ep));
    const meta2 = [
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
      meta2.length ? h("div", { class: "lfx-pt__ep-meta" }, meta2) : null
    ]);
  }
  function formatDate(iso) {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "";
    return new Date(t).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" });
  }
  function buildCardGrid(items, { trend: trend2, newInfo } = {}) {
    const make = isMobile() && isNarrow() ? (it) => createPrimeCard(it, { kind: "poster", badge: cardBadge(it, { newInfo, trend: trend2 }) }) : (it) => createCard(it, { badge: cardBadge(it, { newInfo, trend: trend2 }) });
    return h("div", { class: "lfx-pt__grid", role: "list" }, items.map(make));
  }
  function buildSeasonSelect(seasons, seasonId, onPick) {
    const cur3 = seasons.find((s) => s.Id === seasonId) || seasons[0];
    const btn3 = h("button", {
      type: "button",
      class: "lfx-pt__season",
      "aria-haspopup": "menu",
      "aria-label": "Staffel w\xE4hlen"
    }, [h("span", { class: "lfx-pt__season-label" }, seasonName(cur3)), iconEl2(ICONS5.chevron, "lfx-pt__season-chev")]);
    btn3.addEventListener("click", () => {
      if (isPopoverOpen()) {
        closePopover({ restoreFocus: true });
        return;
      }
      btn3.setAttribute("aria-expanded", "true");
      openPopover(btn3, {
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
    return btn3;
  }

  // src/js/features/prime/title.js
  var ROOT_ID14 = "lfx-prime-title";
  var ON_CLASS13 = "lfx-prime-title-on";
  var TRAILER_DELAY_MS2 = 1200;
  var HEADER_H2 = 80;
  var root3 = null;
  var session3 = null;
  var waitTimer6 = null;
  var isPlainRoute = (route) => {
    const r = parseLfxRoute(route);
    return r.kind === "title" && r.id ? r : null;
  };
  function findHomeTab7() {
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
    const btn3 = s.playBtn;
    if (!btn3) return;
    btn3.replaceChildren(
      iconEl2(ICONS5.play),
      h("span", { class: "lfx-pt__play-text" }, [
        h("span", { class: "lfx-pt__play-label" }, info.label),
        info.sub ? h("span", { class: "lfx-pt__play-sub" }, info.sub) : null
      ])
    );
    btn3.classList.toggle("is-two-line", Boolean(info.sub));
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
    const meta2 = h("div", { class: "lfx-pt__meta" });
    const fill4 = (seasonCount) => {
      const parts = metaItems(main, seasonCount);
      const chip = ratingChipEl(main.OfficialRating);
      meta2.replaceChildren(
        ...chip ? [chip] : [],
        ...parts.map((p) => h("span", { class: "lfx-pt__meta-item" }, p))
      );
    };
    fill4(0);
    s.fillMeta = fill4;
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
      meta2,
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
    const btns2 = /* @__PURE__ */ new Map();
    const panelEls = /* @__PURE__ */ new Map();
    function select(id) {
      for (const [pid, b] of btns2) {
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
        btns2.get(next).focus();
      });
      btns2.set(d.id, b);
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
        const btn3 = buildSeasonSelect(seasons, seasonId, (id) => {
          seasonId = id;
          mountSelect();
          showSeason2(id);
        });
        head.replaceChildren(btn3);
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
      if (reducedMotion4() || isMobile() || isDataSaver()) return;
      const t = setTimeout(() => startVideo(s, { muted: true }), TRAILER_DELAY_MS2);
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
  function stop6() {
    clearTimeout(waitTimer6);
    waitTimer6 = null;
    teardownSession();
    if (root3) root3.remove();
    root3 = null;
    document.getElementById(ROOT_ID14)?.remove();
    document.documentElement.classList.remove(ON_CLASS13);
  }
  function pullToTop(el4) {
    el4.style.marginTop = "";
    const top = el4.getBoundingClientRect().top + (window.scrollY || 0);
    if (top > 2 && top < 240) el4.style.marginTop = `-${Math.round(top)}px`;
  }
  function start6(route) {
    const r = isPlainRoute(route);
    if (!r) return;
    clearTimeout(waitTimer6);
    if (root3 && root3.isConnected && session3 && session3.id === r.id) return;
    const run = (tab3) => {
      if (!root3 || !root3.isConnected || !tab3.contains(root3)) {
        document.getElementById(ROOT_ID14)?.remove();
        root3 = h("div", { id: ROOT_ID14, class: "lfx-pt" });
        tab3.prepend(root3);
      }
      document.documentElement.classList.add(ON_CLASS13);
      pullToTop(root3);
      load3(r.id);
    };
    const tab2 = findHomeTab7();
    if (tab2) {
      run(tab2);
      return;
    }
    let tries = 0;
    const poll = () => {
      const t = findHomeTab7();
      if (t) run(t);
      else if (++tries < 30) waitTimer6 = setTimeout(poll, 200);
    };
    waitTimer6 = setTimeout(poll, 200);
  }
  var title_default2 = {
    name: "prime-title",
    match: (route) => isTheme("prime") && isModern() && !isTv() && isReady() && Boolean(isPlainRoute(route)),
    mount: (route) => start6(route),
    update: (route) => start6(route),
    unmount: () => stop6()
  };

  // src/js/features/prime/tabbar.js
  var ID14 = "lfx-prime-tabbar";
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
    const svg11 = document.createElementNS(SVG_NS3, "svg");
    svg11.setAttribute("viewBox", "0 0 24 24");
    svg11.setAttribute("aria-hidden", "true");
    svg11.setAttribute("focusable", "false");
    const p = document.createElementNS(SVG_NS3, "path");
    p.setAttribute("d", ICONS6[name]);
    svg11.append(p);
    return svg11;
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
    const el4 = state15.el;
    if (!el4) return;
    const hide2 = shouldHide();
    if (el4.classList.contains("is-hidden") !== hide2) el4.classList.toggle("is-hidden", hide2);
    el4.toggleAttribute("inert", hide2);
    const active5 = state15.route ? activeTab2(state15.route, isPrimeSearchOpen()) : null;
    for (const t of el4.querySelectorAll("[data-tab]")) {
      const on = t.dataset.tab === active5;
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
      return isTheme("prime") && isModern() && !isTv() && isMobile() && isNarrow() && isReady() && !EXCLUDED10.test(route.path);
    },
    mount(route) {
      state15.route = route;
      state15.el = mountPoint(ID14, { tag: "nav", className: "lfx-prime-tabbar" });
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
      unmountPoint(ID14);
      document.documentElement.classList.remove(HTML_CLASS2);
      state15.el = null;
      state15.route = null;
    }
  };

  // src/js/features/prime/nativedetail.js
  var nativedetail_default2 = createNativeDetail({ name: "prime-nativedetail", theme: "prime", nologoClass: "lfx-prime-nologo" }).feature;

  // src/js/features/prime/index.js
  var primeFeatures = [header_default2, home_default3, hover_default, title_default2, tabbar_default2, nativedetail_default2];

  // src/js/features/retro/prefs.js
  var KEY3 = "lfx.retro.";
  var DEFAULTS2 = { sound: false, crt: true };
  var PREFS_EVENT = "lfx-retro-prefs";
  var FX_EVENT = "lfx-retro-fx";
  function storageKey4(name) {
    return `${KEY3}${name}.${getUserId() || "anon"}`;
  }
  function getPref(name) {
    try {
      const v = window.localStorage.getItem(storageKey4(name));
      if (v === "1") return true;
      if (v === "0") return false;
    } catch {
    }
    return Boolean(DEFAULTS2[name]);
  }
  function setPref(name, value) {
    const on = Boolean(value);
    try {
      window.localStorage.setItem(storageKey4(name), on ? "1" : "0");
    } catch {
    }
    document.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: { name, value: on } }));
    return on;
  }
  function togglePref(name) {
    return setPref(name, !getPref(name));
  }
  function emitFx(name, detail = {}) {
    try {
      document.dispatchEvent(new CustomEvent(FX_EVENT, { detail: { name, ...detail } }));
    } catch {
    }
  }
  var LOGO_ATTR = "data-lfx-retro-logo";
  var OVERDRIVE_CLASS = "lfx-retro-overdrive";
  var NO_CRT_CLASS = "lfx-retro-nocrt";

  // src/js/features/retro/header-nav.js
  var EXCLUDED11 = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video|dashboard|queue)/;
  var LIST_HREF2 = "#/home?tab=1";
  var NEW_HREF = "#/home?lfx=new";
  function isPhone2() {
    return window.innerWidth < 800;
  }
  function navItems4(libs) {
    const list = Array.isArray(libs) ? libs : [];
    const items = [{ key: "home", label: "Start", href: "#/home" }];
    const movies = list.find((l) => l.collectionType === "movies");
    const series = list.find((l) => l.collectionType === "tvshows");
    if (movies) items.push({ key: `lib:${movies.id}`, label: "Filme", href: hubHref(movies.id) });
    if (series) items.push({ key: `lib:${series.id}`, label: "Serien", href: hubHref(series.id) });
    items.push({ key: "new", label: "Neu & beliebt", href: NEW_HREF });
    items.push({ key: "list", label: "Meine Liste", href: LIST_HREF2 });
    items.push({ key: "search", label: "Suche", href: searchHref() });
    return items;
  }
  function activeKey4(route) {
    if (!route || route.path !== "/home" || !route.params) return null;
    const { kind: kind2, lib } = parseLfxRoute(route);
    if (kind2 === "new") return "new";
    if (kind2 === "search") return "search";
    if ((kind2 === "hub" || kind2 === "browse") && lib) return `lib:${lib}`;
    if (kind2 || route.params.get("lfx")) return null;
    return route.params.get("tab") === "1" ? "list" : "home";
  }
  function go2(href) {
    if (String(href).startsWith("#")) window.location.hash = href;
    else window.location.assign(href);
  }

  // src/js/features/retro/header-ui.js
  var NS3 = "http://www.w3.org/2000/svg";
  var ICONS7 = {
    sound: '<path d="M5 3H2v18h3M19 3h3v18h-3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 16.2V7.6l5-1.2v8.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><ellipse cx="8.4" cy="16.6" rx="2" ry="1.6" fill="currentColor"/><ellipse cx="13.4" cy="15" rx="2" ry="1.6" fill="currentColor"/><path class="lfx-retro-slash" d="M3.5 21 20.5 3" stroke="currentColor" stroke-width="2" fill="none"/>',
    crt: '<rect x="2.5" y="3.5" width="19" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6 8h12M6 12h12M9 20.5h6M12 16.5v4" fill="none" stroke="currentColor" stroke-width="1.6"/><path class="lfx-retro-slash" d="M3.5 21 20.5 3" stroke="currentColor" stroke-width="2" fill="none"/>',
    prev: '<polyline points="16,3 7,12 16,21" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="square"/>',
    next: '<polyline points="8,3 17,12 8,21" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="square"/>',
    play: '<path d="M6 3.5v17l14-8.5z" fill="currentColor"/>',
    info: '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.9 10.5h2.2v7h-2.2zM10.9 6.3h2.2v2.2h-2.2z" fill="currentColor"/>'
  };
  function svgIcon2(name, cls) {
    const svg11 = document.createElementNS(NS3, "svg");
    svg11.setAttribute("viewBox", "0 0 24 24");
    svg11.setAttribute("aria-hidden", "true");
    svg11.setAttribute("focusable", "false");
    if (cls) svg11.setAttribute("class", cls);
    svg11.innerHTML = ICONS7[name] || "";
    return svg11;
  }
  function createLogo(className) {
    return h("a", { class: className, href: "#/home", "aria-label": "LENZ//84 \u2013 Startseite", [LOGO_ATTR]: "" });
  }
  var pad2 = (n) => String(n).padStart(2, "0");
  function formatClock(date = /* @__PURE__ */ new Date()) {
    return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }
  function createClock() {
    const hh = h("span", { class: "lfx-retro-clock__h" });
    const mm = h("span", { class: "lfx-retro-clock__m" });
    const el4 = h("time", { class: "lfx-retro-clock", "aria-label": "Uhrzeit" }, [hh, h("span", { class: "lfx-retro-clock__c" }, ":"), mm]);
    let timer2 = 0;
    const tick = () => {
      const d = /* @__PURE__ */ new Date();
      hh.textContent = pad2(d.getHours());
      mm.textContent = pad2(d.getMinutes());
      el4.setAttribute("datetime", formatClock(d));
      timer2 = setTimeout(tick, 6e4 - (d.getSeconds() * 1e3 + d.getMilliseconds()) + 20);
    };
    tick();
    return { el: el4, destroy() {
      clearTimeout(timer2);
      timer2 = 0;
    } };
  }
  var TOGGLES = {
    sound: { icon: "sound", label: "Ton" },
    crt: { icon: "crt", label: "CRT-Effekt" }
  };
  function createToggle(pref) {
    const cfg = TOGGLES[pref];
    const el4 = h("button", {
      type: "button",
      class: `lfx-retro-switch lfx-retro-switch--${pref}`,
      "aria-label": cfg.label,
      title: cfg.label
    }, [svgIcon2(cfg.icon)]);
    const sync3 = () => {
      const on = getPref(pref);
      el4.setAttribute("aria-pressed", on ? "true" : "false");
      el4.classList.toggle("is-on", on);
    };
    const onPrefs = () => sync3();
    el4.addEventListener("click", () => {
      togglePref(pref);
    });
    document.addEventListener(PREFS_EVENT, onPrefs);
    sync3();
    return { el: el4, sync: sync3, destroy() {
      document.removeEventListener(PREFS_EVENT, onPrefs);
    } };
  }

  // src/js/features/retro/header.js
  var ID15 = "lfx-retro-header";
  var HTML_CLASS3 = "lfx-retro-header-on";
  var SCROLL_THRESHOLD3 = 10;
  var HOVER_GAP_MS = 140;
  var state16 = {
    el: null,
    route: null,
    libs: [],
    seq: 0,
    raf: 0,
    busy: false,
    lastHover: 0,
    cleanups: []
  };
  function applyActive8() {
    if (!state16.el || !state16.route) return;
    const key = activeKey4(state16.route);
    for (const el4 of state16.el.querySelectorAll("[data-key]")) {
      const on = el4.dataset.key === key;
      el4.classList.toggle("is-active", on);
      if (on) el4.setAttribute("aria-current", "page");
      else el4.removeAttribute("aria-current");
    }
  }
  function renderNav3() {
    const nav = state16.el && state16.el.querySelector(".lfx-retro-header__nav");
    if (!nav) return;
    nav.replaceChildren(...navItems4(state16.libs).map((it) => h("a", {
      class: "lfx-retro-header__link",
      href: it.href,
      dataset: { key: it.key }
    }, it.label)));
    applyActive8();
  }
  function profileIsOpen2() {
    const el4 = document.getElementById("lfx-popover");
    return isPopoverOpen() && Boolean(el4 && el4.classList.contains("lfx-retro-profile"));
  }
  async function toggleProfile2(btn3) {
    if (profileIsOpen2()) {
      closePopover({ restoreFocus: true });
      return;
    }
    if (state16.busy) return;
    state16.busy = true;
    try {
      const items = await profileEntries({ theme: "retro", returnFocus: btn3 });
      if (!state16.el || !btn3.isConnected) return;
      openPopover(btn3, { label: "Profil", items, align: "end", className: "lfx-retro-profile" });
    } finally {
      state16.busy = false;
    }
  }
  function build8() {
    const logo = createLogo("lfx-retro-header__logo");
    const nav = h("nav", { class: "lfx-retro-header__nav", "aria-label": "Hauptnavigation" });
    const clock = createClock();
    const sound = createToggle("sound");
    const crt = createToggle("crt");
    const avatar = h("button", {
      type: "button",
      class: "lfx-retro-header__avatar",
      "aria-label": "Profil",
      "aria-haspopup": "true"
    }, [h("span", { class: "lfx-retro-header__initial", "aria-hidden": "true" }, "?")]);
    avatar.addEventListener("click", () => toggleProfile2(avatar));
    const right = h("div", { class: "lfx-retro-header__right" }, [clock.el, sound.el, crt.el, avatar]);
    state16.el.replaceChildren(h("div", { class: "lfx-retro-header__bar" }, [logo, nav, right]));
    state16.cleanups.push(clock.destroy, sound.destroy, crt.destroy);
    nav.addEventListener("click", (e) => {
      if (e.target.closest && e.target.closest("a")) emitFx("nav");
    });
    nav.addEventListener("pointerover", (e) => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      if (!e.target.closest || !e.target.closest("a")) return;
      const now = Date.now();
      if (now - state16.lastHover < HOVER_GAP_MS) return;
      state16.lastHover = now;
      emitFx("hover");
    });
    return { avatar };
  }
  async function loadLibs2(seq3) {
    let libs;
    try {
      libs = await getLibraries() || [];
    } catch {
      libs = [];
    }
    if (seq3 !== state16.seq || !state16.el) return;
    state16.libs = libs;
    renderNav3();
  }
  async function loadAvatar2(seq3, avatar) {
    let chip = { name: "", imageUrl: null };
    try {
      chip = await getUserChip({ retries: 20, isAlive: () => seq3 === state16.seq && Boolean(state16.el) });
    } catch {
    }
    if (seq3 !== state16.seq || !state16.el) return;
    avatar.replaceChildren();
    if (chip.imageUrl) avatar.append(h("img", { src: chip.imageUrl, alt: "", draggable: "false" }));
    else avatar.append(h("span", { class: "lfx-retro-header__initial", "aria-hidden": "true" }, (chip.name || "?").trim().charAt(0).toUpperCase() || "?"));
    if (chip.name) avatar.setAttribute("aria-label", `Profil: ${chip.name}`);
  }
  function applyScroll2() {
    if (!state16.el) return;
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const on = y > SCROLL_THRESHOLD3;
    if (state16.el.classList.contains("is-scrolled") !== on) state16.el.classList.toggle("is-scrolled", on);
  }
  function onScroll6() {
    if (state16.raf) return;
    state16.raf = requestAnimationFrame(() => {
      state16.raf = 0;
      applyScroll2();
    });
  }
  var header_default3 = {
    name: "retro-header",
    match(route) {
      return isTheme("retro") && isModern() && !isTv() && !isPhone2() && isReady() && !EXCLUDED11.test(route.path);
    },
    mount(route) {
      const seq3 = ++state16.seq;
      state16.route = route;
      state16.el = mountPoint(ID15, { tag: "header", className: "lfx-retro-header" });
      const { avatar } = build8();
      document.documentElement.classList.add(HTML_CLASS3);
      window.addEventListener("scroll", onScroll6, { passive: true });
      state16.cleanups.push(() => window.removeEventListener("scroll", onScroll6));
      renderNav3();
      applyScroll2();
      loadLibs2(seq3);
      loadAvatar2(seq3, avatar);
    },
    update(route) {
      const changed = !state16.route || state16.route.hash !== route.hash;
      state16.route = route;
      if (!state16.el) return;
      if (changed && profileIsOpen2()) closePopover();
      applyActive8();
    },
    unmount() {
      state16.seq++;
      for (const fn of state16.cleanups.splice(0)) fn();
      if (state16.raf) cancelAnimationFrame(state16.raf);
      state16.raf = 0;
      if (profileIsOpen2()) closePopover();
      unmountPoint(ID15);
      document.documentElement.classList.remove(HTML_CLASS3);
      state16.el = null;
      state16.route = null;
      state16.libs = [];
      state16.busy = false;
    }
  };

  // src/js/features/retro/tabbar.js
  var ROOT_ID15 = "lfx-retro-tabbar";
  var TOP_ID = "lfx-retro-topbar";
  var ON_CLASS14 = "lfx-retro-tabbar-on";
  var MOBILE_CLASS2 = "lfx-retro-mobile";
  var KB_CLASS2 = "lfx-retro-kb";
  var HIDE_CLASS2 = "lfx-retro-tabbar-hide";
  var TEXT_INPUT2 = "input:not([type=button]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=range]), textarea, select";
  var KEYS = [
    { key: "home", n: "F1", label: "START", name: "Start", href: "#/home" },
    { key: "search", n: "F2", label: "SUCHE", name: "Suche", href: searchHref() },
    { key: "new", n: "F3", label: "NEU", name: "Neu und beliebt", href: NEW_HREF },
    { key: "list", n: "F4", label: "LISTE", name: "Meine Liste", href: LIST_HREF2 }
  ];
  function tabKey2(route) {
    if (!route) return null;
    const k = activeKey4(route);
    if (k === "home" || k === "search" || k === "new" || k === "list") return k;
    if (k && k.startsWith("lib:")) return "more";
    if (/^\/(mypreferences|usermenu)/.test(route.path)) return "more";
    return null;
  }
  var isVideoHash2 = (hash2) => /^#!?[/]video(?:[/?]|$)/.test(String(hash2 || ""));
  var PREF_LABEL = { sound: "Sound", crt: "CRT-Effekt" };
  function moreEntries(libs, profile2, { go: goFn, close: close2, toggle }) {
    const entries = [];
    const order = { movies: 0, tvshows: 1 };
    const sorted = (Array.isArray(libs) ? libs : []).map((l, i) => ({ l, i })).sort((a, b) => (order[a.l.collectionType] ?? 9) - (order[b.l.collectionType] ?? 9) || a.i - b.i);
    for (const { l } of sorted) {
      const href = l.hubCapable ? hubHref(l.id) : l.href;
      if (href) entries.push({ key: `lib:${l.id}`, label: l.name, onClick: () => {
        close2();
        goFn(href);
      } });
    }
    for (const p of Array.isArray(profile2) ? profile2 : []) {
      if (p.href) entries.push({ key: p.key, label: p.label, badge: p.badge, stats: p.key === "stats", onClick: () => {
        close2();
        goFn(p.href);
      } });
      else if (typeof p.onClick === "function") entries.push({ key: p.key, label: p.label, badge: p.badge, onClick: () => {
        close2();
        p.onClick();
      } });
    }
    for (const pref of ["sound", "crt"]) {
      entries.push({ key: `pref-${pref}`, label: PREF_LABEL[pref], pref, onClick: () => toggle(pref) });
    }
    return entries;
  }
  var state17 = { root: null, top: null, route: null, moreBtn: null, sheet: null, seq: 0, clock: null, cleanups: [] };
  function paintToggle(btn3, pref) {
    const on = getPref(pref);
    btn3.dataset.pref = pref;
    btn3.setAttribute("aria-pressed", on ? "true" : "false");
    btn3.textContent = `${PREF_LABEL[pref]}: ${on ? "AN" : "AUS"}`;
  }
  function syncSheetToggles() {
    const c = state17.sheet;
    if (!c || !isCurrent(c) || !c.list) return;
    for (const b of c.list.querySelectorAll("[data-pref]")) paintToggle(b, b.dataset.pref);
  }
  function applyActive9() {
    if (!state17.root) return;
    const sheetOpen = Boolean(state17.sheet && isCurrent(state17.sheet));
    const key = sheetOpen ? "more" : tabKey2(state17.route);
    for (const el4 of state17.root.querySelectorAll("[data-key]")) {
      const on = el4.dataset.key === key;
      el4.classList.toggle("is-active", on);
      if (on) el4.setAttribute("aria-current", "page");
      else el4.removeAttribute("aria-current");
    }
  }
  function closeMore() {
    state17.seq++;
    const c = state17.sheet;
    state17.sheet = null;
    if (c && isCurrent(c)) closeChooser();
    applyActive9();
  }
  async function openMore() {
    if (state17.sheet && isCurrent(state17.sheet)) {
      closeMore();
      return;
    }
    const seq3 = ++state17.seq;
    const anchor = state17.moreBtn;
    let libs = [];
    let profile2 = [];
    try {
      libs = await getLibraries() || [];
    } catch {
    }
    try {
      profile2 = await profileEntries({ theme: "retro", returnFocus: anchor });
    } catch {
    }
    if (seq3 !== state17.seq || !state17.root) return;
    emitFx("open");
    const c = openSheet(anchor, "Mehr");
    c.sheet.classList.add("lfx-retro-sheet");
    state17.sheet = c;
    const entries = moreEntries(libs, profile2, {
      go: go2,
      close: () => closeChooser(),
      toggle: (pref) => {
        togglePref(pref);
        syncSheetToggles();
      }
    });
    renderSheet(c, "Mehr", entries);
    const buttons = c.list ? c.list.querySelectorAll(".lfx-sheet__item") : [];
    entries.forEach((e, i) => {
      const b = buttons[i];
      if (!b) return;
      if (e.stats) b.classList.add("is-stats");
      if (e.pref) paintToggle(b, e.pref);
    });
    applyActive9();
  }
  function fkey(k) {
    return h("a", {
      class: "lfx-retro-fkey",
      href: k.href,
      "aria-label": k.name,
      dataset: { key: k.key }
    }, [h("span", { class: "lfx-retro-fkey__n", "aria-hidden": "true" }, k.n), h("span", { class: "lfx-retro-fkey__l", "aria-hidden": "true" }, k.label)]);
  }
  async function fillTopbar() {
    let chip = { name: "" };
    try {
      chip = await getUserChip({ retries: 20, isAlive: () => Boolean(state17.top) });
    } catch {
    }
    if (!state17.top || !chip.name) return;
    const who = state17.top.querySelector(".lfx-retro-topbar__user");
    if (who) who.textContent = chip.name;
  }
  var retroTabbar = {
    name: "retro-tabbar",
    match(route) {
      return isTheme("retro") && isModern() && !isTv() && isPhone2() && isReady() && !EXCLUDED11.test(route.path);
    },
    mount(route) {
      state17.seq++;
      state17.route = route;
      const top = mountPoint(TOP_ID, { tag: "header", className: "lfx-retro-topbar" });
      state17.clock = createClock();
      top.replaceChildren(h("div", { class: "lfx-retro-topbar__bar" }, [
        createLogo("lfx-retro-topbar__logo"),
        h("span", { class: "lfx-retro-topbar__user", "aria-hidden": "true" }),
        state17.clock.el
      ]));
      state17.top = top;
      const root7 = mountPoint(ROOT_ID15, { tag: "nav", className: "lfx-retro-tabbar" });
      root7.setAttribute("aria-label", "Hauptnavigation");
      const more = h("button", {
        type: "button",
        class: "lfx-retro-fkey",
        "aria-label": "Mehr",
        "aria-haspopup": "dialog",
        dataset: { key: "more" }
      }, [h("span", { class: "lfx-retro-fkey__n", "aria-hidden": "true" }, "F5"), h("span", { class: "lfx-retro-fkey__l", "aria-hidden": "true" }, "MEHR")]);
      more.addEventListener("click", openMore);
      root7.replaceChildren(...KEYS.map(fkey), more);
      root7.addEventListener("click", (e) => {
        if (e.target.closest && e.target.closest("a")) emitFx("nav");
      });
      state17.root = root7;
      state17.moreBtn = more;
      const cl2 = document.documentElement.classList;
      const onFocusIn = (e) => {
        if (e.target && e.target.matches && e.target.matches(TEXT_INPUT2)) cl2.add(KB_CLASS2);
      };
      const onFocusOut = () => cl2.remove(KB_CLASS2);
      const onHash2 = () => cl2.toggle(HIDE_CLASS2, isVideoHash2(window.location.hash));
      const onPrefs = () => syncSheetToggles();
      document.addEventListener("focusin", onFocusIn);
      document.addEventListener("focusout", onFocusOut);
      window.addEventListener("hashchange", onHash2);
      document.addEventListener(PREFS_EVENT, onPrefs);
      state17.cleanups.push(() => {
        document.removeEventListener("focusin", onFocusIn);
        document.removeEventListener("focusout", onFocusOut);
        window.removeEventListener("hashchange", onHash2);
        document.removeEventListener(PREFS_EVENT, onPrefs);
        cl2.remove(KB_CLASS2, HIDE_CLASS2);
      });
      cl2.remove(HIDE_CLASS2);
      cl2.add(ON_CLASS14, MOBILE_CLASS2);
      applyActive9();
      fillTopbar();
    },
    update(route) {
      const changed = !state17.route || state17.route.hash !== route.hash;
      state17.route = route;
      if (changed) closeMore();
      applyActive9();
    },
    unmount() {
      closeMore();
      for (const fn of state17.cleanups.splice(0)) fn();
      if (state17.clock) state17.clock.destroy();
      state17.clock = null;
      unmountPoint(ROOT_ID15);
      unmountPoint(TOP_ID);
      document.documentElement.classList.remove(ON_CLASS14, MOBILE_CLASS2);
      state17.root = null;
      state17.top = null;
      state17.moreBtn = null;
      state17.route = null;
    }
  };
  var tabbar_default3 = retroTabbar;

  // src/js/features/retro/home-hero.js
  var ROTATE_MS3 = 9e3;
  var TYPE_MS = 46;
  var CHANNEL_SWAP_MS = 220;
  var CHANNEL_END_MS = 520;
  var FIELDS5 = "Overview,Genres,OfficialRating,ProductionYear,RunTimeTicks,ChildCount,DateCreated";
  var FIRST_KEY2 = "lfx-retro-hero-first";
  var MAX_NAME = 22;
  var reducedMotion5 = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function setTitleText(el4, text) {
    el4.textContent = "";
    const cut = text.lastIndexOf("_") + 1;
    const head = text.slice(0, cut);
    const tail = text.slice(cut);
    head.split(/(?<=_)/).filter(Boolean).forEach((seg) => {
      el4.append(document.createTextNode(seg), document.createElement("wbr"));
    });
    if (tail) el4.append(h("span", { class: "lfx-retro-hero__seg" }, tail));
  }
  function titleSize(text) {
    const n = String(text || "").length;
    return n > 24 ? 3 : n > 20 ? 2 : n > 16 ? 1 : 0;
  }
  var pad22 = (n) => String(n).padStart(2, "0");
  function dosName(name) {
    const s = String(name || "").replace(/ä/gi, "AE").replace(/ö/gi, "OE").replace(/ü/gi, "UE").replace(/ß/g, "SS").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    return (s || "UNBEKANNT").slice(0, MAX_NAME).replace(/_+$/, "");
  }
  function fileName(item) {
    return `${dosName(item && item.Name)}.${item && item.Type === "Series" ? "SER" : "MOV"}`;
  }
  function pathLine(item) {
    return `C:\\LENZ84\\${item && item.Type === "Series" ? "SERIEN" : "FILME"}>`;
  }
  function runtimeShort(ticks) {
    const total = Math.round((Number(ticks) || 0) / 6e8);
    if (total <= 0) return "";
    const hrs = Math.floor(total / 60);
    const min = total % 60;
    return hrs ? `${hrs}H${pad22(min)}` : `${min}MIN`;
  }
  function metaLine2(item) {
    if (!item) return "";
    const rating = formatRating(item.OfficialRating);
    const extra = item.Type === "Series" ? formatSeasons(item.ChildCount) : runtimeShort(item.RunTimeTicks);
    const genre = Array.isArray(item.Genres) && item.Genres[0] ? item.Genres[0] : "";
    return [item.ProductionYear ? String(item.ProductionYear) : "", rating ? `FSK ${rating}` : "", extra, genre].filter(Boolean).join(" \xB7 ").toUpperCase();
  }
  function readFirst2() {
    try {
      return sessionStorage.getItem(FIRST_KEY2);
    } catch {
      return null;
    }
  }
  function writeFirst2(id) {
    try {
      sessionStorage.setItem(FIRST_KEY2, id);
    } catch {
    }
  }
  async function fetchHomePool2() {
    const base = { Recursive: true, IncludeItemTypes: "Movie,Series", ImageTypes: "Logo,Backdrop", Fields: FIELDS5, EnableUserData: true, Limit: 40 };
    const [latest, random] = await Promise.all([
      getItems({ ...base, SortBy: "DateCreated", SortOrder: "Descending" }).catch(() => null),
      getItems({ ...base, SortBy: "Random" }).catch(() => null)
    ]);
    const pool = buildPool(latest && latest.Items, random && random.Items, { avoidFirstId: readFirst2(), newCount: 2, randomCount: 4 });
    if (pool[0]) writeFirst2(pool[0].Id);
    return pool;
  }
  function renderHero2(slot, { loadPool: loadPool2 }) {
    const phone = isPhone2();
    let disposed = false;
    let pool = [];
    let index = 0;
    let target = 0;
    let gen8 = 0;
    let hovering = false;
    let inView = true;
    let rotateTimer = 0;
    let hero = null;
    let bd = null;
    let win = null;
    const refs = {};
    const timers = /* @__PURE__ */ new Set();
    const cleanups6 = [];
    const later = (fn, ms) => {
      const t = setTimeout(() => {
        timers.delete(t);
        fn();
      }, ms);
      timers.add(t);
      return t;
    };
    const clearLater = (t) => {
      clearTimeout(t);
      timers.delete(t);
    };
    const paused3 = () => hovering || !inView || document.hidden || document.documentElement.classList.contains("lfx-modal-open");
    function scheduleRotate() {
      if (rotateTimer) clearLater(rotateTimer);
      rotateTimer = 0;
      if (disposed || pool.length < 2 || reducedMotion5()) return;
      rotateTimer = later(() => {
        rotateTimer = 0;
        if (paused3()) scheduleRotate();
        else show3((target + 1) % pool.length);
      }, ROTATE_MS3);
    }
    function typeText(text, myGen) {
      const el4 = refs.title;
      el4.textContent = "";
      refs.heading.dataset.size = String(titleSize(text));
      if (reducedMotion5()) {
        setTitleText(el4, text);
        return;
      }
      let n = 0;
      const step2 = () => {
        if (disposed || myGen !== gen8) return;
        n += 1;
        setTitleText(el4, text.slice(0, n));
        if (n % 3 === 1) emitFx("type");
        if (n < text.length) later(step2, TYPE_MS);
      };
      later(step2, TYPE_MS * 3);
    }
    function updateCounter() {
      refs.count.textContent = `${pad22(index + 1)}/${pad22(pool.length)}`;
      refs.nav.hidden = pool.length < 2;
    }
    function apply2(i) {
      if (disposed || !pool[i]) return;
      const item = pool[i];
      index = i;
      gen8 += 1;
      const myGen = gen8;
      const src = imageUrl(item, { type: "Backdrop", maxWidth: phone ? 1280 : 1920, quality: 80 });
      bd.replaceChildren(...src ? [h("img", { class: "lfx-retro-hero__img", src, alt: "", decoding: "async" })] : []);
      refs.path.textContent = pathLine(item);
      refs.heading.setAttribute("aria-label", item.Name || "");
      refs.meta.textContent = metaLine2(item);
      refs.desc.textContent = item.Overview || "";
      refs.desc.hidden = !item.Overview;
      refs.playLabel.textContent = playLabel(item).line1;
      refs.info.setAttribute("href", titleHref(item.Id));
      refs.info.setAttribute("aria-label", `Info: ${item.Name || ""}`);
      refs.play.onclick = () => {
        playTitle(item);
      };
      updateCounter();
      putItems([item]);
      typeText(fileName(item), myGen);
      scheduleRotate();
    }
    function show3(i, { immediate = false } = {}) {
      if (disposed || !pool[i]) return;
      target = i;
      if (immediate || reducedMotion5() || !hero) {
        apply2(i);
        return;
      }
      gen8 += 1;
      const myGen = gen8;
      emitFx("nav");
      hero.classList.add("is-changing");
      later(() => {
        if (!disposed && myGen === gen8) apply2(i);
      }, CHANNEL_SWAP_MS);
      later(() => {
        hero.classList.remove("is-changing");
      }, CHANNEL_END_MS);
    }
    const step = (dir) => {
      if (pool.length > 1) show3((target + dir + pool.length) % pool.length);
    };
    function arrow3(dir, label) {
      const b = h("button", { type: "button", class: `lfx-retro-hero__arrow lfx-retro-hero__arrow--${dir}`, "aria-label": label }, [svgIcon2(dir)]);
      b.addEventListener("click", () => step(dir === "next" ? 1 : -1));
      return b;
    }
    function build11() {
      refs.path = h("span", { class: "lfx-retro-hero__path" });
      refs.title = h("span", { class: "lfx-retro-hero__typed lfx-retro-caret", "aria-hidden": "true" });
      refs.heading = h("h2", { class: "lfx-retro-hero__title" }, [refs.title]);
      refs.meta = h("p", { class: "lfx-retro-hero__meta" });
      refs.desc = h("p", { class: "lfx-retro-hero__desc" });
      refs.playLabel = h("span", null, "Abspielen");
      refs.play = h("button", { type: "button", class: "lfx-retro-btn lfx-retro-hero__play" }, [svgIcon2("play"), refs.playLabel]);
      refs.info = h("a", { class: "lfx-retro-btn lfx-retro-hero__info", href: "#/home" }, [svgIcon2("info"), h("span", null, "Info")]);
      refs.count = h("span", { class: "lfx-retro-hero__count", "aria-live": "off" });
      refs.nav = h("div", { class: "lfx-retro-hero__channel", role: "group", "aria-label": "Empfehlung w\xE4hlen" }, [
        arrow3("prev", "Vorherige Empfehlung"),
        refs.count,
        arrow3("next", "N\xE4chste Empfehlung")
      ]);
      win = h("div", { class: "lfx-retro-frame lfx-retro-hero__win" }, [
        h("div", { class: "lfx-retro-hero__bar", "aria-hidden": "true" }, [refs.path]),
        h("div", { class: "lfx-retro-hero__body" }, [
          refs.heading,
          refs.meta,
          refs.desc,
          h("div", { class: "lfx-retro-hero__actions" }, [refs.play, refs.info]),
          refs.nav
        ])
      ]);
      bd = h("div", { class: "lfx-retro-hero__bd" });
      const stage = h("div", { class: "lfx-retro-hero__stage", "aria-hidden": "true" }, [
        h("div", { class: "lfx-retro-hero__stars" }),
        bd,
        h("div", { class: "lfx-retro-hero__sun" }, [h("div", { class: "lfx-retro-hero__cuts" })]),
        h("div", { class: "lfx-retro-hero__horizon" }),
        h("div", { class: "lfx-retro-hero__grid" }, [h("div", { class: "lfx-retro-hero__plane" })]),
        h("div", { class: "lfx-retro-hero__fog" })
      ]);
      hero = h("div", { class: "lfx-retro-hero" }, [
        stage,
        h("div", { class: "lfx-retro-hero__noise", "aria-hidden": "true" }),
        win
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
      hero.addEventListener("mouseenter", onEnter);
      hero.addEventListener("mouseleave", onLeave);
      hero.addEventListener("focusin", onEnter);
      hero.addEventListener("focusout", onLeave);
      const onVis = () => {
        if (!document.hidden) scheduleRotate();
      };
      document.addEventListener("visibilitychange", onVis);
      cleanups6.push(() => document.removeEventListener("visibilitychange", onVis));
      let sx = 0;
      let sy = 0;
      hero.addEventListener("touchstart", (e) => {
        const t = e.touches && e.touches[0];
        if (t) {
          sx = t.clientX;
          sy = t.clientY;
        }
      }, { passive: true });
      hero.addEventListener("touchend", (e) => {
        const t = e.changedTouches && e.changedTouches[0];
        if (!t) return;
        const dx = t.clientX - sx;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(t.clientY - sy) * 1.5) step(dx < 0 ? 1 : -1);
      }, { passive: true });
      if (typeof IntersectionObserver === "function") {
        const io = new IntersectionObserver((entries) => {
          for (const en of entries) inView = en.isIntersecting;
          hero.classList.toggle("is-offscreen", !inView);
          if (inView) scheduleRotate();
        }, { threshold: 0.2 });
        io.observe(hero);
        cleanups6.push(() => io.disconnect());
      }
    }
    async function init2() {
      let items = [];
      try {
        items = await loadPool2();
      } catch {
      }
      if (disposed) return;
      if (!items || !items.length) {
        slot.classList.remove("is-loading");
        slot.hidden = true;
        return;
      }
      pool = items;
      putItems(pool);
      build11();
      slot.hidden = false;
      slot.classList.remove("is-loading");
      apply2(0);
    }
    slot.hidden = false;
    slot.classList.add("is-loading");
    init2();
    return () => {
      disposed = true;
      gen8 += 1;
      timers.forEach(clearTimeout);
      timers.clear();
      rotateTimer = 0;
      cleanups6.splice(0).forEach((f) => f());
      slot.replaceChildren();
      slot.classList.remove("is-loading");
      slot.removeAttribute("aria-roledescription");
    };
  }

  // src/js/features/retro/card.js
  var TAPE_VARIANTS = ["spine", "cover", "wide"];
  var TONES = 5;
  function displayTitle4(item) {
    return item.Type === "Episode" && item.SeriesName ? item.SeriesName : item.Name || "";
  }
  function ariaFor2(item) {
    if (item.Type === "Episode" && item.SeriesName) return `${item.SeriesName} \u2013 ${item.Name || ""}`.trim();
    return item.Name || "";
  }
  function toneFor(item) {
    const key = Array.isArray(item.Genres) && item.Genres[0] || item.Type || String(item.Id || "");
    let n = 0;
    for (let i = 0; i < key.length; i++) n = n * 31 + key.charCodeAt(i) >>> 0;
    return n % TONES;
  }
  function imageFor(item, variant) {
    if (variant === "wide") {
      const l = landscapeFor(item, 600);
      return l && l.url || posterUrl(item, 400);
    }
    return posterUrl(item, 400) || (landscapeFor(item, 600) || {}).url || null;
  }
  function progressOf(item, progress) {
    if (typeof progress === "number" && progress > 0) return Math.min(100, progress);
    return progress === void 0 ? progressPercent(item) : 0;
  }
  function createTapeCard(item, { variant = "spine", progress } = {}) {
    const v = TAPE_VARIANTS.includes(variant) ? variant : "spine";
    const title = displayTitle4(item);
    const src = imageFor(item, v);
    const year = item.ProductionYear ? String(item.ProductionYear) : "";
    const media = [];
    if (src) media.push(h("img", { class: "lfx-card__img lfx-retro-card__img", src, alt: "", loading: "lazy", decoding: "async" }));
    else if (v !== "spine") media.push(h("span", { class: "lfx-card__title lfx-retro-card__fallback" }, title));
    if (v === "spine") {
      media.push(h("span", { class: "lfx-retro-card__label", "aria-hidden": "true" }, [
        h("span", { class: "lfx-card__title lfx-retro-card__spine-title" }, title),
        year ? h("span", { class: "lfx-retro-card__year" }, year) : null,
        h("span", { class: "lfx-retro-card__stripe" }),
        h("span", { class: "lfx-retro-card__wear" })
      ]));
    } else {
      media.push(h("span", { class: "lfx-retro-card__cap", "aria-hidden": "true" }, [
        h("span", { class: "lfx-retro-card__cap-title" }, title),
        year ? h("span", { class: "lfx-retro-card__year" }, year) : null
      ]));
    }
    const p = progressOf(item, progress);
    if (p > 0) {
      media.push(h("span", { class: "lfx-retro-card__progress", role: "presentation" }, [
        h("span", { class: "lfx-retro-card__bar", style: { width: `${Math.round(p * 10) / 10}%` } })
      ]));
    }
    const card3 = h("div", {
      class: `lfx-card lfx-retro-card lfx-retro-card--${v}`,
      dataset: { lfxId: item.Id, lfxType: item.Type || "", tone: String(toneFor(item)) },
      tabindex: "-1",
      role: "listitem"
    });
    card3.append(h("a", { class: "lfx-card__link", href: titleHref(item.Id), "aria-label": ariaFor2(item) }, media));
    return card3;
  }

  // src/js/features/retro/home-rows.js
  function rowLabel(def) {
    const id = String(def && def.id || "");
    if (id === "resume" || id.endsWith("-resume")) return "Weiterschauen";
    if (id === "nextup") return "N\xE4chste Folgen";
    if (id === "latest-movies") return "Neu eingelegt: Filme";
    if (id === "latest-series") return "Neu eingelegt: Serien";
    if (id.endsWith("-latest")) return "Neu eingelegt";
    return def && def.title || "";
  }
  function displayKind2(def) {
    if (def.kind === "top10") return "top10";
    if (def.kind === "resume" || def.id === "nextup") return "wide";
    return "shelf";
  }
  function variantFor(kind2, phone) {
    if (kind2 === "wide") return "wide";
    return phone ? "cover" : "spine";
  }
  function arrow2(dir, label) {
    const b = h("button", { type: "button", class: `lfx-retro-arrow lfx-retro-arrow--${dir}`, "aria-label": label, tabindex: "-1", hidden: true }, [svgIcon2(dir)]);
    return b;
  }
  function createRows2(slot, { moreHref = () => null } = {}) {
    let disposed = false;
    let observer2 = null;
    const phone = isPhone2();
    const disposers = [];
    const pending = /* @__PURE__ */ new Map();
    const rendered = /* @__PURE__ */ new Set();
    disposers.push(onItemsChanged(({ removed } = {}) => {
      if (disposed || !removed || !removed.length) return;
      const gone = new Set(removed);
      for (const row of [...slot.querySelectorAll(".lfx-retro-row")]) {
        const track = row.querySelector(".lfx-retro-shelf");
        if (!track) continue;
        let changed = false;
        for (const card3 of [...track.querySelectorAll(".lfx-card[data-lfx-id]")]) {
          if (gone.has(card3.dataset.lfxId)) {
            (card3.closest(".lfx-retro-rank") || card3).remove();
            changed = true;
          }
        }
        if (!changed) continue;
        if (!track.querySelector(".lfx-card")) row.remove();
        else track.dispatchEvent(new Event("scroll"));
      }
    }));
    function skeleton3(def, kind2) {
      const more = moreHref(def);
      const head = h("div", { class: "lfx-retro-row__head" }, [
        h("h2", { class: "lfx-retro-label lfx-retro-row__title" }, rowLabel(def)),
        more ? h("a", { class: "lfx-retro-row__more", href: more }, "Alle anzeigen") : null
      ]);
      const skels = [];
      for (let i = 0; i < 7; i++) skels.push(h("div", { class: "lfx-retro-skel" }));
      const track = h("div", { class: "lfx-retro-shelf", role: "list", "aria-label": rowLabel(def) }, skels);
      return h("section", {
        class: `lfx-retro-row lfx-retro-row--${kind2} is-loading`,
        dataset: { lfxRow: def.id }
      }, [head, h("div", { class: "lfx-retro-row__viewport" }, [track])]);
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
        const variant = variantFor(kind2, phone);
        const cards = items.map((it, i) => {
          const card3 = createTapeCard(it, { variant });
          if (kind2 !== "top10") return card3;
          return h("div", { class: "lfx-retro-rank" }, [h("span", { class: "lfx-retro-rank__n", "aria-hidden": "true" }, String(i + 1)), card3]);
        });
        const track = rowEl.querySelector(".lfx-retro-shelf");
        const title = rowLabel(def);
        const prev2 = arrow2("prev", "Zur\xFCck");
        const next = arrow2("next", "Weiter");
        track.replaceChildren(...cards);
        track.setAttribute("aria-label", title);
        track.style.setProperty("--lfx-cards-visible", variant === "spine" ? "6" : "4");
        track.before(prev2);
        track.after(next);
        rowEl.querySelector(".lfx-retro-row__title").textContent = title;
        rowEl.classList.remove("is-loading");
        rowEl.dataset.variant = variant;
        disposers.push(attachScroller({ track, prev: prev2, next, indicator: null }));
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
          const kind2 = displayKind2(def);
          const el4 = skeleton3(def, kind2);
          slot.append(el4);
          pending.set(el4, { def, kind: kind2 });
          if (observer2) observer2.observe(el4);
          else loadRow(el4, def, kind2);
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

  // src/js/features/retro/home-route.js
  var ROOT_ID16 = "lfx-retro-home";
  var ON_CLASS15 = "lfx-retro-home-on";
  function retroHomeRoute(route) {
    if (!route || route.path !== "/home" || !route.params) return null;
    const lfx = route.params.get("lfx");
    if (lfx === "hub") {
      const lib = route.params.get("lib");
      return lib ? { key: `hub:${lib}`, kind: "hub", lib } : null;
    }
    if (lfx || route.params.get("tab") === "1") return null;
    return { key: "home", kind: "home", lib: null };
  }
  function findHomeTab8() {
    const tab2 = document.querySelector("#indexPage:not(.hide) #homeTab");
    return tab2 && tab2.isConnected ? tab2 : null;
  }

  // src/js/features/retro/home.js
  var MORE_STEP2 = 4;
  var BASE_GENRES2 = 6;
  var SYSTEM_LINE = "LENZ//84 BIOS v1.6 \xB7 640K OK";
  var cleanups5 = [];
  var waitTimer7 = null;
  var gen4 = 0;
  var current6 = null;
  var builtPhone = false;
  function teardown8() {
    for (const fn of cleanups5.splice(0)) {
      try {
        fn && fn();
      } catch (e) {
        console.error("[LenzFlix] retro-home cleanup", e);
      }
    }
    document.getElementById(ROOT_ID16)?.remove();
    document.documentElement.classList.remove(ON_CLASS15);
  }
  var isGenreDef2 = (d) => /(^|-)genre-/.test(d.id);
  function moreHrefFor2(def, { hub, libs, lib }) {
    if (hub) {
      if (lib && (def.id === `${lib.id}-latest` || def.id === `${lib.id}-toprated`)) return browseHref(lib.id);
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
  function buildFooter2() {
    return h("footer", { class: "lfx-retro-footer", "aria-hidden": "true" }, [
      h("p", { class: "lfx-retro-footer__ready lfx-retro-caret" }, "READY."),
      h("p", { class: "lfx-retro-footer__sys" }, SYSTEM_LINE)
    ]);
  }
  async function start7(tab2, route, myGen) {
    let libs = [];
    try {
      libs = await getLibraries();
    } catch {
      libs = [];
    }
    if (myGen !== gen4) return;
    const hub = route.kind === "hub";
    const lib = hub ? libs.find((l) => l.id === route.lib && l.hubCapable) : null;
    if (hub && !lib) return;
    teardown8();
    const heroSlot = h("section", { id: "lfx-retro-hero", class: "lfx-retro-hero-slot", "aria-label": "Empfehlung" });
    const rowsSlot = h("div", { class: "lfx-retro-rows" });
    const moreSlot = h("div", { class: "lfx-retro-moreslot" });
    const root7 = h("div", { id: ROOT_ID16, class: `lfx-retro-home lfx-retro-home--${hub ? "hub" : "home"}` }, [heroSlot, rowsSlot, moreSlot, buildFooter2()]);
    tab2.prepend(root7);
    document.documentElement.classList.add(ON_CLASS15);
    current6 = route;
    builtPhone = isPhone2();
    cleanups5.push(renderHero2(heroSlot, { loadPool: () => hub ? getHubHeroPool(lib) : fetchHomePool2() }));
    const getDefs = (genreCount2) => hub ? buildHubRowDefs(lib, { genreCount: genreCount2 }) : buildRowDefs({ genreCount: genreCount2 });
    let defs = [];
    try {
      defs = await getDefs(BASE_GENRES2);
    } catch (e) {
      console.warn("[LenzFlix] Zeilen konnten nicht aufgebaut werden", e && e.message);
    }
    if (myGen !== gen4 || !isReady()) return;
    const rows = createRows2(rowsSlot, { moreHref: (def) => moreHrefFor2(def, { hub, libs, lib }) });
    cleanups5.push(() => rows.destroy());
    rows.add(defs);
    let genreCount = BASE_GENRES2;
    const moreBtn = h("button", { type: "button", class: "lfx-retro-btn lfx-retro-more" }, "Mehr laden");
    moreBtn.addEventListener("click", async () => {
      if (moreBtn.disabled) return;
      moreBtn.disabled = true;
      genreCount += MORE_STEP2;
      try {
        const all = await getDefs(genreCount);
        if (myGen !== gen4) return;
        const have = new Set(rows.ids());
        const fresh = all.filter((d) => isGenreDef2(d) && !have.has(d.id)).slice(0, MORE_STEP2);
        rows.add(fresh);
        if (fresh.length < MORE_STEP2) moreBtn.hidden = true;
      } catch (e) {
        console.warn("[LenzFlix] Weitere Zeilen nicht geladen", e && e.message);
      }
      moreBtn.disabled = false;
    });
    if (!defs.some(isGenreDef2)) moreBtn.hidden = true;
    moreSlot.append(moreBtn);
  }
  function ensure6(route) {
    clearTimeout(waitTimer7);
    const tab2 = findHomeTab8();
    const existing = document.getElementById(ROOT_ID16);
    if (tab2 && existing && tab2.contains(existing) && current6 && current6.key === route.key && builtPhone === isPhone2()) return;
    gen4 += 1;
    const myGen = gen4;
    let tries = 0;
    const poll = () => {
      if (myGen !== gen4) return;
      const t = findHomeTab8();
      if (t) start7(t, route, myGen);
      else if (++tries < 30) waitTimer7 = setTimeout(poll, 200);
    };
    if (tab2) poll();
    else waitTimer7 = setTimeout(poll, 200);
  }
  var retroHome = {
    name: "retro-home",
    match: (route) => isTheme("retro") && isModern() && !isTv() && isReady() && Boolean(retroHomeRoute(route)),
    mount: (route) => ensure6(retroHomeRoute(route)),
    update: (route) => ensure6(retroHomeRoute(route)),
    unmount() {
      gen4 += 1;
      clearTimeout(waitTimer7);
      waitTimer7 = null;
      current6 = null;
      teardown8();
    }
  };
  var home_default4 = retroHome;

  // src/js/features/retro/title-mount.js
  var root4 = () => document.documentElement;
  var PAGE_CLASS = "lfx-retro-page-on";
  function findHomeTab9() {
    const tab2 = document.querySelector("#indexPage:not(.hide) #homeTab");
    return tab2 && tab2.isConnected ? tab2 : null;
  }
  function whenHomeTab2(cb, { tries = 30, every = 200 } = {}) {
    let dead = false;
    let timer2 = null;
    let n = 0;
    const poll = () => {
      timer2 = null;
      if (dead) return;
      const t = findHomeTab9();
      if (t) cb(t);
      else if (++n < tries) timer2 = setTimeout(poll, every);
    };
    poll();
    return () => {
      dead = true;
      if (timer2) clearTimeout(timer2);
      timer2 = null;
    };
  }
  function setPageOn2(cls, on) {
    const cl2 = root4().classList;
    cl2.toggle(PAGE_CLASS, on);
    cl2.toggle(cls, on);
  }
  function scrollTop2() {
    try {
      window.scrollTo(0, 0);
    } catch {
    }
  }
  function reducedMotion6() {
    try {
      return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  }
  function throttle(fn, ms) {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last < ms) return;
      last = now;
      fn(...args);
    };
  }

  // src/js/features/retro/title-type.js
  var TICK_MS = 28;
  var MAX_TICKS = 34;
  function createTyped(text, className = "") {
    const full = String(text || "");
    const sr = h("span", { class: "lfx-rt__sr" }, full);
    const typed = h("span", { class: "lfx-rt__typed", "aria-hidden": "true" });
    const rest = h("span", { class: "lfx-rt__rest", "aria-hidden": "true" }, full);
    const el4 = h("p", { class: `${className} lfx-retro-caret`.trim() }, [sr, typed, rest]);
    let timer2 = null;
    let pos = 0;
    const tick = throttle(() => emitFx("type"), 110);
    const paint = () => {
      typed.textContent = full.slice(0, pos);
      rest.textContent = full.slice(pos);
    };
    const stop7 = () => {
      if (timer2) clearInterval(timer2);
      timer2 = null;
    };
    const finish3 = () => {
      stop7();
      pos = full.length;
      paint();
      el4.classList.remove("lfx-retro-caret");
    };
    const start10 = () => {
      stop7();
      if (reducedMotion6() || full.length < 2) {
        finish3();
        return;
      }
      const step = Math.max(1, Math.ceil(full.length / MAX_TICKS));
      pos = 0;
      paint();
      timer2 = setInterval(() => {
        pos = Math.min(full.length, pos + step);
        paint();
        tick();
        if (pos >= full.length) finish3();
      }, TICK_MS);
    };
    return { el: el4, start: start10, finish: finish3, stop: stop7 };
  }

  // src/js/features/retro/title-dom.js
  var pad23 = (n) => String(n).padStart(2, "0");
  function episodeCode2(ep) {
    if (!ep || ep.IndexNumber == null) return "";
    return ep.ParentIndexNumber != null ? `S${pad23(ep.ParentIndexNumber)}E${pad23(ep.IndexNumber)}` : `E${pad23(ep.IndexNumber)}`;
  }
  function tapeName(season, index = 0) {
    if (season && season.IndexNumber === 0) return "EXTRAS";
    if (season && season.IndexNumber > 0) return `TAPE ${season.IndexNumber}`;
    return `TAPE ${index + 1}`;
  }
  function runtimeSticker(ticks) {
    const mins = Math.round((Number(ticks) || 0) / 6e8);
    if (mins < 1) return "";
    const hh = Math.floor(mins / 60);
    return hh ? `${hh}H${pad23(mins % 60)}` : `${mins} MIN`;
  }
  function backdropUrl3(item) {
    return imageUrl(item, { type: "Backdrop", maxWidth: 1920, quality: 70 }) || landscapeImage(item, { maxWidth: 1920, quality: 70 });
  }
  function buildStickers(main) {
    const out = [];
    out.push(h("span", { class: "lfx-rt__sticker lfx-rt__sticker--stereo" }, "STEREO"));
    if (main.Width && Number(main.Width) >= 1200) out.push(h("span", { class: "lfx-rt__sticker lfx-rt__sticker--hd" }, "HD"));
    else out.push(h("span", { class: "lfx-rt__sticker lfx-rt__sticker--color" }, "FARBE"));
    const chip = ratingChip(main.OfficialRating);
    if (chip) {
      out.push(h("span", { class: "lfx-rt__sticker lfx-rt__sticker--fsk", dataset: { tone: chip.tone }, "aria-label": `Altersfreigabe ${chip.text}` }, [
        h("span", { class: "lfx-rt__fsk-label", "aria-hidden": "true" }, "FSK"),
        h("span", { class: "lfx-rt__fsk-num", "aria-hidden": "true" }, chip.text)
      ]));
    }
    const rt = main.Type === "Series" ? "" : runtimeSticker(main.RunTimeTicks);
    if (rt) out.push(h("span", { class: "lfx-rt__sticker lfx-rt__sticker--time" }, rt));
    return out;
  }
  function buildFront(main) {
    const src = imageUrl(main, { type: "Primary", maxWidth: 700, quality: 85 });
    const media = src ? h("img", { class: "lfx-rt__poster", src, alt: main.Name || "", decoding: "async" }) : h("span", { class: "lfx-rt__poster lfx-rt__poster--none" }, main.Name || "");
    return h("div", { class: "lfx-rt__front" }, [
      h("div", { class: "lfx-rt__sleeve" }, [
        h("div", { class: "lfx-rt__art" }, [media, h("span", { class: "lfx-rt__foil", "aria-hidden": "true" })]),
        h("div", { class: "lfx-rt__stickers" }, buildStickers(main)),
        h("span", { class: "lfx-rt__hinge", "aria-hidden": "true" })
      ])
    ]);
  }
  function metaList(main) {
    const out = [];
    if (main.ProductionYear) out.push(String(main.ProductionYear));
    if (main.Type === "Series") {
      const n = Number(main.ChildCount) || 0;
      if (n > 0) out.push(`${n} ${n === 1 ? "STAFFEL" : "STAFFELN"}`);
    } else {
      const rt = formatRuntime(main.RunTimeTicks);
      if (rt) out.push(rt);
    }
    const g = (main.Genres || []).slice(0, 3).join(" / ");
    if (g) out.push(g);
    const score = Number(main.CommunityRating);
    if (score > 0) out.push(`WERTUNG ${score.toFixed(1).replace(".", ",")}`);
    return out;
  }
  function buildEpisode2(ep, { selected = false, next = false, onPlay } = {}) {
    const p = progressPercent2(ep);
    const played = Boolean(ep.UserData && ep.UserData.Played === true);
    const fill4 = played ? 1 : Math.max(0, Math.min(1, p / 100));
    const code = episodeCode2(ep);
    const src = imageUrl(ep, { type: "Primary", maxWidth: 480, quality: 80 }) || (landscapeFor(ep, 480) || {}).url || null;
    const mins = episodeRuntime(ep);
    const left = remainingLabel2(ep);
    const num2 = ep.IndexNumber != null ? pad23(ep.IndexNumber) : "--";
    const btn3 = h("button", {
      type: "button",
      class: `lfx-rt__ep${selected ? " is-selected" : ""}${next ? " is-next" : ""}${played ? " is-played" : ""}`,
      dataset: { id: ep.Id },
      "aria-label": `${code ? `${code} ` : ""}${ep.Name || ""} abspielen`,
      onclick: () => {
        if (onPlay) onPlay(ep);
      }
    }, [
      h("span", { class: "lfx-rt__ep-no", "aria-hidden": "true" }, num2),
      h("span", { class: "lfx-rt__ep-thumb", "aria-hidden": "true" }, src ? [h("img", { src, alt: "", loading: "lazy", decoding: "async" })] : []),
      h("span", { class: "lfx-rt__ep-label" }, [
        h("span", { class: "lfx-rt__ep-meta" }, [code, mins, left].filter(Boolean).join("  \xB7  ")),
        h("span", { class: "lfx-rt__ep-title" }, ep.Name || `Folge ${num2}`),
        ep.Overview ? h("span", { class: "lfx-rt__ep-text" }, ep.Overview) : null
      ]),
      h("span", { class: "lfx-rt__ep-reels", "aria-hidden": "true" }, [
        h("span", { class: "lfx-rt__reel lfx-rt__reel--l" }),
        h("span", { class: "lfx-rt__reel lfx-rt__reel--r" })
      ]),
      next ? h("span", { class: "lfx-rt__ep-next" }, "N\xC4CHSTE") : null
    ]);
    btn3.style.setProperty("--rt-fill", String(Math.round(fill4 * 100) / 100));
    return h("li", { class: "lfx-rt__ep-item" }, [btn3]);
  }

  // src/js/features/retro/title-trailer.js
  var TRAILER_ID2 = "lfx-retro-trailer";
  function closeTrailer2() {
    const el4 = document.getElementById(TRAILER_ID2);
    if (!el4) return;
    const v = el4.querySelector("video");
    if (v) {
      try {
        v.pause();
        v.removeAttribute("src");
        if (v.load) v.load();
      } catch {
      }
    }
    if (typeof el4.__lfxCleanup === "function") el4.__lfxCleanup();
    unmountPoint(el4);
  }
  function openTrailer2(src, returnFocus) {
    closeTrailer2();
    const overlay = mountPoint(TRAILER_ID2, { className: "lfx-retro-trailer" });
    overlay.replaceChildren();
    const video2 = h("video", { class: "lfx-retro-trailer__video", controls: true, autoplay: true, playsinline: true });
    const close2 = () => {
      closeTrailer2();
      emitFx("close");
      if (returnFocus && returnFocus.isConnected && returnFocus.focus) {
        try {
          returnFocus.focus({ preventScroll: true });
        } catch {
        }
      }
    };
    const closeBtn = h("button", { type: "button", class: "lfx-retro-btn lfx-retro-trailer__close", onclick: close2 }, "Schlie\xDFen");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Trailer");
    overlay.append(h("div", { class: "lfx-retro-trailer__tube" }, [h("p", { class: "lfx-retro-trailer__tag lfx-retro-label" }, "Trailer"), video2]), closeBtn);
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
    video2.addEventListener("error", () => {
      emitFx("error");
      toast("Trailer konnte nicht abgespielt werden");
      close2();
    });
    video2.addEventListener("ended", close2);
    video2.src = src;
    try {
      const p = video2.play && video2.play();
      if (p && p.catch) p.catch(() => {
      });
    } catch {
    }
    emitFx("open");
    closeBtn.focus();
  }

  // src/js/features/retro/title.js
  var ROOT_ID17 = "lfx-retro-title";
  var ON_CLASS16 = "lfx-retro-title-on";
  var state18 = null;
  var gen5 = 0;
  var routeId2 = (route) => {
    const r = parseLfxRoute(route);
    return r.kind === "title" ? r.id : null;
  };
  var stalenessOf2 = (g) => () => !state18 || state18.g !== g;
  function dispose4() {
    gen5 += 1;
    const s = state18;
    state18 = null;
    closeTrailer2();
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
          console.error("[LenzFlix] retro-title cleanup", e);
        }
      }
      if (s.root) s.root.remove();
    }
    document.getElementById(ROOT_ID17)?.remove();
    setPageOn2(ON_CLASS16, false);
  }
  function errorBox2(message) {
    return h("div", { class: "lfx-rt__error lfx-retro-frame", role: "alert" }, [
      h("h1", { class: "lfx-rt__errtitle" }, "FEHLER 404: KASSETTE NICHT GEFUNDEN"),
      h("p", null, message || "BITTE SP\xC4TER ERNEUT VERSUCHEN."),
      h("a", { class: "lfx-retro-btn", href: "#/home" }, "Zur Startseite")
    ]);
  }
  function btn2(mod, label, onClick) {
    const b = h("button", { type: "button", class: `lfx-retro-btn lfx-rt__btn lfx-rt__btn--${mod}` }, label);
    b.addEventListener("click", (e) => {
      e.preventDefault();
      emitFx("click");
      onClick(b);
    });
    return b;
  }
  function setToggle(b, on, labelOn, labelOff) {
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", String(on));
    b.textContent = on ? labelOn : labelOff;
  }
  function specRow(label, value) {
    if (!value) return null;
    return h("div", { class: "lfx-rt__spec" }, [h("dt", null, label), h("dd", null, value)]);
  }
  function buildSpecs(main) {
    const streams = main.MediaSources && main.MediaSources[0] && main.MediaSources[0].MediaStreams || [];
    const langs = (type) => [...new Set(streams.filter((x) => x.Type === type).map((x) => x.DisplayLanguage || x.Language).filter(Boolean))];
    const rows = [
      specRow("STUDIO", (main.Studios || []).map((x) => x.Name).filter(Boolean).slice(0, 3).join(", ")),
      specRow("TON", langs("Audio").slice(0, 4).join(", ")),
      specRow("UNTERTITEL", langs("Subtitle").slice(0, 5).join(", "))
    ].filter(Boolean);
    return rows.length ? h("dl", { class: "lfx-rt__specs" }, rows) : null;
  }
  function buildCast(main) {
    const actors = peopleOf(main, "Actor").map((p) => p.Name).slice(0, 6);
    const dirs = peopleOf(main, "Director").map((p) => p.Name).slice(0, 2);
    if (!actors.length && !dirs.length) return null;
    return h("dl", { class: "lfx-rt__cast" }, [
      dirs.length ? h("div", { class: "lfx-rt__spec" }, [h("dt", null, "REGIE"), h("dd", null, dirs.join(", "))]) : null,
      actors.length ? h("div", { class: "lfx-rt__spec" }, [h("dt", null, "MIT"), h("dd", null, actors.join(", "))]) : null
    ]);
  }
  async function load4(g) {
    const stale = stalenessOf2(g);
    const s = state18;
    const root7 = s.root;
    let sel;
    let main;
    try {
      const first2 = getStoredItem(s.id) || await loadItem(s.id);
      if (!first2) throw new Error("Titel nicht gefunden");
      const r = resolveTarget4(first2, s.id);
      sel = r.sel;
      main = await loadItem(r.targetId);
      if (stale()) return;
      if (!main) throw new Error("Titel nicht gefunden");
    } catch (e) {
      if (stale()) return;
      emitFx("error");
      root7.replaceChildren(errorBox2(e && e.message ? "DER SERVER HAT NICHT GEANTWORTET." : ""));
      root7.classList.add("is-error");
      root7.classList.remove("is-loading");
      return;
    }
    if (stale()) return;
    const isSeries = main.Type === "Series";
    const isBox = main.Type === "BoxSet";
    const c = { main, seasons: [], seasonId: sel.seasonId, selectedEp: sel.episodeId, nextUp: null, trailerSrc: null, episodes: [] };
    const bg = backdropUrl3(main);
    const backdrop = h("div", { class: "lfx-rt__bg", "aria-hidden": "true" }, [
      bg ? h("img", { class: "lfx-rt__bg-img", src: bg, alt: "", decoding: "async" }) : null,
      h("div", { class: "lfx-rt__bg-tint" }),
      h("div", { class: "lfx-rt__bg-scan" }),
      h("div", { class: "lfx-rt__bg-vig" })
    ]);
    const logoUrl2 = logoImage(main, { maxWidth: 720 });
    const brand = h("h1", { class: `lfx-rt__brand${logoUrl2 ? " has-logo" : ""}` });
    const textTitle = () => {
      brand.classList.remove("has-logo");
      brand.replaceChildren(h("span", { class: "lfx-rt__chrome", "data-text": main.Name || "" }, main.Name || ""));
    };
    if (logoUrl2) {
      brand.append(h("img", { class: "lfx-rt__logo", src: logoUrl2, alt: main.Name || "", onerror: textTitle }));
    } else {
      textTitle();
    }
    const tagline = main.Taglines && main.Taglines[0] || (isSeries ? "SERIE" : isBox ? "SAMMLUNG" : main.Genres && main.Genres[0] || "FILM");
    const stripes = h("div", { class: "lfx-rt__stripes", "aria-hidden": "true" }, [h("span", { class: "lfx-rt__stripes-text" }, String(tagline).toUpperCase())]);
    const meta2 = h("ul", { class: "lfx-rt__meta", "aria-label": "Eckdaten" }, metaList(main).map((m) => h("li", null, m)));
    const typed = main.Overview ? createTyped(main.Overview, "lfx-rt__text") : null;
    const cast = buildCast(main);
    const progress = h("div", { class: "lfx-rt__progress", hidden: true });
    const playBtn = btn2("play", "Abspielen", async () => {
      let t = playInfo(main, c.nextUp);
      let item = t.target;
      if (isSeries && item === main) {
        try {
          const sid = c.seasons.length ? pickInitialSeason(c.seasons, null) : null;
          const eps = sid ? await loadEpisodes2(main.Id, sid) : [];
          item = eps[0] || null;
        } catch {
          item = null;
        }
        if (stale()) return;
        t = { ...t, resume: false };
      }
      if (item) await play(item, { resume: Boolean(t.resume) });
    });
    playBtn.classList.add("lfx-rt__btn--primary");
    const restartBtn = btn2("restart", "Neu starten", async () => {
      const info = playInfo(main, c.nextUp);
      if (info.target) await play(info.target, { resume: false });
    });
    restartBtn.hidden = true;
    const paintPlay2 = () => {
      const info = playInfo(main, c.nextUp);
      const ep = isSeries ? c.nextUp : null;
      const code = ep ? episodeCode2(ep) : "";
      playBtn.textContent = info.resume ? `Fortsetzen${code ? ` ${code}` : ""}` : `Abspielen${code ? ` ${code}` : ""}`;
      restartBtn.hidden = !info.resume;
      progress.replaceChildren();
      progress.hidden = !(info.progress > 0);
      if (info.progress > 0) {
        const left = remainingLabel2(info.target);
        const pct = String(Math.round(info.progress * 10) / 10);
        const bar = h("span", { class: "lfx-rt__tapebar", role: "presentation" }, [h("span", { class: "lfx-rt__tapebar-fill" })]);
        bar.firstChild.style.width = `${pct}%`;
        progress.append(bar, h("span", { class: "lfx-rt__tapeleft" }, left || `${Math.round(info.progress)} %`));
      }
    };
    const trailerBtn = btn2("trailer", "Trailer", (b) => {
      if (c.trailerSrc) openTrailer2(c.trailerSrc, b);
    });
    trailerBtn.hidden = true;
    const favBtn = btn2("fav", "Meine Liste", async (b) => {
      b.disabled = true;
      const on = await toggleFavorite2(main);
      b.disabled = false;
      if (!stale()) setToggle(b, on, "Auf der Liste", "Meine Liste");
    });
    setToggle(favBtn, Boolean(main.UserData && main.UserData.IsFavorite), "Auf der Liste", "Meine Liste");
    const seenBtn = btn2("seen", "Gesehen", async (b) => {
      b.disabled = true;
      const on = await togglePlayed2(main, { anchorEl: b });
      b.disabled = false;
      if (stale()) return;
      setToggle(b, on, "Gesehen", "Als gesehen");
      if (isSeries) showSeason2();
    });
    setToggle(seenBtn, Boolean(main.UserData && main.UserData.Played), "Gesehen", "Als gesehen");
    const dlBtn = btn2("dl", isSeries ? "Folgen laden" : "Herunterladen", (b) => {
      startDownloadFor(main, { anchorEl: b });
    });
    dlBtn.hidden = true;
    const moreBtn = btn2("more", "Mehr", (b) => {
      openTitleMenu(main, b);
    });
    moreBtn.setAttribute("aria-haspopup", "menu");
    const actions = h("div", { class: "lfx-rt__actions", role: "group", "aria-label": "Aktionen" }, [playBtn, restartBtn, trailerBtn, favBtn, seenBtn, dlBtn, moreBtn]);
    const back = h("div", { class: "lfx-rt__back" }, [
      h("div", { class: "lfx-rt__sheet" }, [
        brand,
        stripes,
        meta2,
        typed ? typed.el : null,
        cast,
        buildSpecs(main),
        progress,
        actions
      ])
    ]);
    const kase = h("div", { class: "lfx-rt__case", role: "region", "aria-label": main.Name || "Titel" }, [buildFront(main), back]);
    const content = h("div", { class: "lfx-rt__content" }, [kase]);
    const epList = h("ul", { class: "lfx-rt__eps" });
    const tabs = h("div", { class: "lfx-rt__tabs", role: "tablist", "aria-label": "Staffeln" });
    if (isSeries) {
      content.append(h("section", { class: "lfx-rt__tapes", "aria-label": "Folgen" }, [h("h2", { class: "lfx-retro-label" }, "B\xE4nder"), tabs, epList]));
    }
    const shelfRow = h("div", { class: `lfx-rt__shelf-row${isBox || isMobile() ? " is-wrap" : ""}`, role: "list" });
    const shelf = h("section", { class: "lfx-rt__shelf", "aria-label": isBox ? "Inhalt" : "\xC4hnliche Titel", hidden: true }, [
      h("h2", { class: "lfx-retro-label" }, isBox ? "Inhalt" : "\xC4hnliche Titel"),
      shelfRow
    ]);
    content.append(shelf);
    root7.classList.remove("is-loading");
    root7.replaceChildren(backdrop, content);
    paintPlay2();
    emitFx("open");
    if (typed) {
      const t = setTimeout(() => typed.start(), isMobile() ? 200 : 420);
      s.cleanups.push(() => {
        clearTimeout(t);
        typed.stop();
      });
    }
    const playEpisode = (ep) => play(ep, { resume: hasResume(ep) });
    async function showSeason2() {
      const sid = c.seasonId;
      if (!sid) return;
      let eps;
      try {
        eps = await loadEpisodes2(main.Id, sid);
      } catch {
        if (!stale() && c.seasonId === sid) epList.replaceChildren(h("li", { class: "lfx-rt__empty" }, "FOLGEN KONNTEN NICHT GELADEN WERDEN."));
        return;
      }
      if (stale() || c.seasonId !== sid) return;
      c.episodes = eps;
      const nextId = c.nextUp ? c.nextUp.Id : null;
      epList.replaceChildren(...eps.map((e) => buildEpisode2(e, { selected: e.Id === c.selectedEp, next: e.Id === nextId, onPlay: playEpisode })));
      if (!eps.length) epList.append(h("li", { class: "lfx-rt__empty" }, "KEINE FOLGEN VORHANDEN."));
    }
    function paintTabs() {
      tabs.replaceChildren();
      c.seasons.forEach((x, i) => {
        const on = x.Id === c.seasonId;
        const b = h("button", {
          type: "button",
          role: "tab",
          class: `lfx-rt__tab${on ? " is-active" : ""}`,
          "aria-selected": String(on),
          tabindex: on ? "0" : "-1",
          dataset: { id: x.Id },
          title: x.Name || ""
        }, tapeName(x, i));
        b.addEventListener("click", () => {
          if (x.Id === c.seasonId) return;
          emitFx("click");
          c.seasonId = x.Id;
          c.selectedEp = null;
          paintTabs();
          showSeason2();
        });
        tabs.append(b);
      });
      tabs.hidden = c.seasons.length < 2;
    }
    const onTabKey = (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const list = [...tabs.querySelectorAll(".lfx-rt__tab")];
      const cur3 = list.findIndex((b) => b.classList.contains("is-active"));
      if (cur3 < 0) return;
      e.preventDefault();
      const next = list[(cur3 + (e.key === "ArrowRight" ? 1 : list.length - 1)) % list.length];
      next.click();
      const again = tabs.querySelector(".lfx-rt__tab.is-active");
      if (again) again.focus();
    };
    tabs.addEventListener("keydown", onTabKey);
    s.cleanups.push(() => tabs.removeEventListener("keydown", onTabKey));
    const tasks = [];
    if (isSeries) {
      tasks.push(loadNextUp(main.Id).then((ep) => {
        if (stale()) return;
        c.nextUp = ep;
        paintPlay2();
      }).catch(() => {
      }));
      tasks.push(loadSeasons(main.Id).then(async (list) => {
        if (stale()) return;
        c.seasons = list;
        c.seasonId = pickInitialSeason(list, c.seasonId);
        paintTabs();
        await showSeason2();
        if (stale()) return;
        const hit = epList.querySelector(".lfx-rt__ep.is-selected");
        if (hit && hit.scrollIntoView) {
          try {
            hit.scrollIntoView({ block: "center", behavior: "auto" });
          } catch {
          }
        }
      }).catch(() => {
      }));
    }
    const fillShelf = (items) => {
      if (stale() || !items.length) return;
      const variant = isBox || isMobile() ? "cover" : "spine";
      shelfRow.replaceChildren(...items.map((it) => createTapeCard(it, { variant })));
      shelf.hidden = false;
    };
    if (isBox) tasks.push(loadCollection(main.Id).then(fillShelf).catch(() => {
    }));
    else tasks.push(loadSimilar(main.Id).then((l) => fillShelf(l.filter((i) => i.Id !== main.Id))).catch(() => {
    }));
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
        begin4(s.id, { keepScroll: true });
      }
    }));
    await Promise.all(tasks);
  }
  function begin4(id, { keepScroll = false } = {}) {
    dispose4();
    const g = gen5;
    state18 = { g, id, root: null, cleanups: [], cancelWait: null };
    const s = state18;
    s.cancelWait = whenHomeTab2((tab2) => {
      if (state18 !== s) return;
      const root7 = h("div", { id: ROOT_ID17, class: "lfx-retro-page lfx-rt is-loading", "aria-busy": "true" }, [
        h("div", { class: "lfx-rt__boot lfx-retro-caret" }, "LADE KASSETTE")
      ]);
      s.root = root7;
      tab2.prepend(root7);
      setPageOn2(ON_CLASS16, true);
      if (!keepScroll) scrollTop2();
      load4(g).then(() => {
        if (state18 === s) root7.removeAttribute("aria-busy");
      }).catch((e) => console.error("[LenzFlix] retro-title", e));
    });
  }
  var title_default3 = {
    name: "retro-title",
    match: (route) => isTheme("retro") && isModern() && !isTv() && isReady() && routeId2(route) != null,
    mount(route) {
      const id = routeId2(route);
      if (id) begin4(id);
    },
    update(route) {
      const id = routeId2(route);
      if (!id) return;
      if (state18 && state18.id === id && state18.root && state18.root.isConnected) return;
      begin4(id);
    },
    unmount: dispose4
  };

  // src/js/features/retro/search.js
  var ROOT_ID18 = "lfx-retro-search";
  var ON_CLASS17 = "lfx-retro-search-on";
  var DEBOUNCE_MS3 = 300;
  var MIN_LEN4 = 2;
  var state19 = null;
  var asItems9 = (res) => Array.isArray(res) ? res : res && Array.isArray(res.Items) ? res.Items : [];
  var routeQ2 = (route) => {
    const r = parseLfxRoute(route);
    return r.kind === "search" ? r.q || "" : null;
  };
  function dispose5() {
    const s = state19;
    state19 = null;
    if (s) {
      if (s.cancelWait) s.cancelWait();
      clearTimeout(s.timer);
      if (s.abort) s.abort.abort();
      for (const fn of s.cleanups.splice(0)) {
        try {
          fn && fn();
        } catch (e) {
          console.error("[LenzFlix] retro-search cleanup", e);
        }
      }
      if (s.root) s.root.remove();
    }
    document.getElementById(ROOT_ID18)?.remove();
    setPageOn2(ON_CLASS17, false);
  }
  function group(title, body, mod = "") {
    return h("section", { class: `lfx-rs__group ${mod}`.trim() }, [h("h2", { class: "lfx-retro-label" }, title), body]);
  }
  var grid = (cards) => h("div", { class: "lfx-rs__grid", role: "list" }, cards);
  function personRow(p) {
    const url = imageUrl(p, { type: "Primary", maxWidth: 160, quality: 80 });
    return h("a", { class: "lfx-rs__person", href: `#/details?id=${encodeURIComponent(p.Id)}` }, [
      h("span", { class: "lfx-rs__person-img" }, url ? [h("img", { src: url, alt: "", loading: "lazy", decoding: "async" })] : []),
      h("span", { class: "lfx-rs__person-name" }, p.Name || "")
    ]);
  }
  async function genreLib2() {
    try {
      const libs = await getLibraries();
      return libs.find((l) => l.collectionType === "movies") || libs.find((l) => l.collectionType === "tvshows") || libs.find((l) => l.hubCapable) || null;
    } catch {
      return null;
    }
  }
  async function renderStart(s, seq3) {
    const stale = () => state19 !== s || s.seq !== seq3;
    s.results.replaceChildren(h("p", { class: "lfx-rs__hint lfx-retro-caret" }, "BEREIT"));
    s.count.textContent = "";
    const [lib, genres, colls, latest] = await Promise.all([
      genreLib2(),
      getGenreTiles({ limit: 18 }).catch(() => []),
      getCollections().catch(() => []),
      getItems({
        ...BASE_PARAMS,
        IncludeItemTypes: "Movie,Series",
        Recursive: true,
        SortBy: "DateCreated",
        SortOrder: "Descending",
        Limit: 14
      }).then(asItems9).catch(() => [])
    ]);
    if (stale()) return;
    const parts = [];
    if (genres.length) {
      parts.push(group("Vorschl\xE4ge", h("div", { class: "lfx-rs__opts" }, genres.map((g) => h("a", {
        class: "lfx-retro-btn lfx-rs__opt",
        href: lib ? browseHref(lib.id, g.id) : searchHref(g.name)
      }, g.name)))));
    }
    if (colls.length) {
      parts.push(group("Sammlungen", h("div", { class: "lfx-rs__opts" }, colls.map((c) => h("a", { class: "lfx-retro-btn lfx-rs__opt", href: titleHref(c.id) }, c.name)))));
    }
    if (latest.length) {
      putItems(latest);
      parts.push(group("Neu im Regal", grid(latest.map((it) => createTapeCard(it, { variant: "cover" }))), "lfx-rs__group--new"));
    }
    s.results.replaceChildren(...parts.length ? parts : [h("p", { class: "lfx-rs__hint lfx-retro-caret" }, "BEREIT")]);
  }
  async function runSearch2(s, term) {
    if (s.abort) s.abort.abort();
    const seq3 = ++s.seq;
    s.term = term;
    s.syncUi();
    if (term.length < MIN_LEN4) {
      s.abort = null;
      s.root.removeAttribute("aria-busy");
      await renderStart(s, seq3);
      return;
    }
    const ctl = new AbortController();
    s.abort = ctl;
    s.root.setAttribute("aria-busy", "true");
    s.count.textContent = "SUCHE L\xC4UFT\u2026";
    const stale = () => state19 !== s || s.seq !== seq3;
    try {
      const res = await searchItems(term, { signal: ctl.signal });
      if (stale()) return;
      putItems([...res.movies, ...res.series, ...res.episodes]);
      const parts = [];
      if (res.movies.length) parts.push(group("Filme", grid(res.movies.map((it) => createTapeCard(it, { variant: "cover" })))));
      if (res.series.length) parts.push(group("Serien", grid(res.series.map((it) => createTapeCard(it, { variant: "cover" })))));
      if (res.episodes.length) parts.push(group("Episoden", grid(res.episodes.map((it) => createTapeCard(it, { variant: "wide" }))), "lfx-rs__group--wide"));
      if (res.people.length) parts.push(group("Personen", h("div", { class: "lfx-rs__people" }, res.people.map(personRow))));
      const total = res.movies.length + res.series.length + res.episodes.length + res.people.length;
      if (!parts.length) {
        parts.push(h("p", { class: "lfx-rs__empty lfx-retro-caret" }, "KEINE TREFFER. VERSUCHE ES ERNEUT"));
        emitFx("error");
      }
      s.count.textContent = total ? `${total} TREFFER` : "0 TREFFER";
      s.results.replaceChildren(...parts);
      s.root.removeAttribute("aria-busy");
    } catch (e) {
      if (e && e.name === "AbortError") return;
      if (stale()) return;
      console.warn("[LenzFlix] retro-search fehlgeschlagen", e && e.message);
      emitFx("error");
      s.count.textContent = "";
      s.results.replaceChildren(h("p", { class: "lfx-rs__empty lfx-retro-caret" }, "FEHLER: DIE SUCHE IST FEHLGESCHLAGEN"));
      s.root.removeAttribute("aria-busy");
    }
  }
  function build9(tab2, s, q) {
    const input = h("input", {
      type: "text",
      class: "lfx-rs__input",
      placeholder: "TITEL, SERIE ODER GENRE",
      "aria-label": "Suche",
      autocomplete: "off",
      autocapitalize: "off",
      spellcheck: "false",
      enterkeyhint: "search",
      value: q
    });
    input.value = q;
    const caret = h("span", { class: "lfx-rs__caret", "aria-hidden": "true" });
    const clear = h("button", { type: "button", class: "lfx-rs__clear", "aria-label": "Eingabe l\xF6schen", title: "L\xF6schen", hidden: !q }, "ESC");
    const cmd = h("div", { class: "lfx-rs__cmd lfx-retro-frame" }, [
      h("span", { class: "lfx-rs__prompt", "aria-hidden": "true" }, "SUCHE>"),
      h("span", { class: "lfx-rs__field" }, [input, caret]),
      clear
    ]);
    const count = h("p", { class: "lfx-rs__count", "aria-live": "polite" });
    const results = h("div", { class: "lfx-rs__results" });
    const root7 = h("div", { id: ROOT_ID18, class: "lfx-retro-page lfx-rs", role: "search" }, [
      h("p", { class: "lfx-rs__banner", "aria-hidden": "true" }, "LENZ//84 RECHERCHE-TERMINAL  \xB7  ENTER = SUCHEN"),
      cmd,
      count,
      results
    ]);
    Object.assign(s, { root: root7, input, results, count });
    const placeCaret = () => {
      const pos = typeof input.selectionStart === "number" ? input.selectionStart : input.value.length;
      cmd.style.setProperty("--rs-pos", String(Math.min(pos, 60)));
      cmd.classList.toggle("is-empty", !input.value);
    };
    s.syncUi = () => {
      clear.hidden = !input.value;
      placeCaret();
    };
    tab2.prepend(root7);
    setPageOn2(ON_CLASS17, true);
    const writeHash = (term) => {
      try {
        history.replaceState(history.state, "", searchHref(term));
      } catch {
      }
    };
    const tick = throttle(() => emitFx("type"), 70);
    const onInput = () => {
      clearTimeout(s.timer);
      s.syncUi();
      tick();
      s.timer = setTimeout(() => {
        const term = input.value.trim();
        writeHash(term);
        runSearch2(s, term);
      }, DEBOUNCE_MS3);
    };
    const onClear = () => {
      input.value = "";
      clearTimeout(s.timer);
      writeHash("");
      runSearch2(s, "");
      input.focus();
    };
    const onKey3 = (e) => {
      if (e.key === "Enter") {
        clearTimeout(s.timer);
        emitFx("click");
        const term = input.value.trim();
        writeHash(term);
        runSearch2(s, term);
      } else if (e.key === "Escape" && input.value) {
        e.stopPropagation();
        onClear();
      }
    };
    const onCaret = () => placeCaret();
    input.addEventListener("input", onInput);
    input.addEventListener("keydown", onKey3);
    input.addEventListener("keyup", onCaret);
    input.addEventListener("click", onCaret);
    input.addEventListener("focus", onCaret);
    clear.addEventListener("click", onClear);
    s.cleanups.push(() => {
      input.removeEventListener("input", onInput);
      input.removeEventListener("keydown", onKey3);
      input.removeEventListener("keyup", onCaret);
      input.removeEventListener("click", onCaret);
      input.removeEventListener("focus", onCaret);
      clear.removeEventListener("click", onClear);
    });
    s.syncUi();
    try {
      input.focus({ preventScroll: true });
    } catch {
    }
    runSearch2(s, q.trim());
  }
  function begin5(q) {
    dispose5();
    const s = {
      root: null,
      input: null,
      results: null,
      count: null,
      term: null,
      timer: null,
      abort: null,
      seq: 0,
      cleanups: [],
      cancelWait: null,
      syncUi: () => {
      }
    };
    state19 = s;
    s.cancelWait = whenHomeTab2((tab2) => {
      if (state19 === s) build9(tab2, s, q);
    });
  }
  var search_default2 = {
    name: "retro-search",
    match: (route) => isTheme("retro") && isModern() && !isTv() && isReady() && routeQ2(route) != null,
    mount(route) {
      begin5(routeQ2(route) || "");
    },
    update(route) {
      const q = routeQ2(route);
      if (q == null) return;
      if (!state19 || !state19.root || !state19.root.isConnected) {
        begin5(q);
        return;
      }
      if (q.trim() !== (state19.term || "")) {
        state19.input.value = q;
        clearTimeout(state19.timer);
        runSearch2(state19, q.trim());
      }
      try {
        state19.input.focus({ preventScroll: true });
      } catch {
      }
    },
    unmount: dispose5
  };

  // src/js/features/retro/browse.js
  var ROOT_ID19 = "lfx-retro-browse";
  var ON_CLASS18 = "lfx-retro-browse-on";
  var PAGE5 = 40;
  var VIEW_KEY = "lfx.retro.browseview";
  var SORTS = {
    name: { label: "NAME", by: "SortName", order: "Ascending" },
    date: { label: "DATUM", by: "DateCreated", order: "Descending" },
    rating: { label: "WERTUNG", by: "CommunityRating,SortName", order: "Descending" }
  };
  var state20 = null;
  var routeOf2 = (route) => {
    const r = parseLfxRoute(route);
    return r.kind === "browse" && r.lib ? { lib: r.lib, genre: r.genre } : null;
  };
  var asItems10 = (res) => Array.isArray(res) ? res : res && Array.isArray(res.Items) ? res.Items : [];
  function fileName2(item) {
    const base = String(item.Name || "").toUpperCase().replace(/[^A-Z0-9ÄÖÜß \-_.]/g, "").trim() || "OHNE NAME";
    const ext = item.Type === "Series" ? "SER" : item.Type === "BoxSet" ? "BOX" : item.Type === "Movie" ? "MOV" : "VID";
    return `${base}.${ext}`;
  }
  function runtimeShort2(ticks) {
    const mins = Math.round((Number(ticks) || 0) / 6e8);
    if (mins < 1) return "--";
    const hh = Math.floor(mins / 60);
    return hh ? `${hh}H${String(mins % 60).padStart(2, "0")}` : `${mins}M`;
  }
  function readView() {
    try {
      return window.localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
    } catch {
      return "grid";
    }
  }
  function dispose6() {
    const s = state20;
    state20 = null;
    if (s) {
      if (s.cancelWait) s.cancelWait();
      for (const fn of s.cleanups.splice(0)) {
        try {
          fn && fn();
        } catch (e) {
          console.error("[LenzFlix] retro-browse cleanup", e);
        }
      }
      if (s.root) s.root.remove();
    }
    document.getElementById(ROOT_ID19)?.remove();
    setPageOn2(ON_CLASS18, false);
  }
  function listRow(it) {
    const genre = it.Genres && it.Genres[0] || "";
    return h("a", {
      class: "lfx-rb__row",
      href: titleHref(it.Id),
      role: "listitem",
      "aria-label": [it.Name, it.ProductionYear].filter(Boolean).join(", ")
    }, [
      h("span", { class: "lfx-rb__row-name" }, fileName2(it)),
      h("span", { class: "lfx-rb__row-year" }, it.ProductionYear ? String(it.ProductionYear) : "----"),
      h("span", { class: "lfx-rb__row-time" }, it.Type === "Series" ? it.ChildCount ? `${it.ChildCount}S` : "--" : runtimeShort2(it.RunTimeTicks)),
      h("span", { class: "lfx-rb__row-genre" }, genre.toUpperCase())
    ]);
  }
  function itemNode(s, it) {
    return s.view === "list" && !isMobile() ? listRow(it) : createTapeCard(it, { variant: "cover" });
  }
  function paintHead(s) {
    const lib = s.libName || "BIBLIOTHEK";
    const genre = s.genreName ? `${s.genreName.toUpperCase()}\\` : "";
    s.path.textContent = `DIR C:\\${lib.toUpperCase()}\\${genre}`;
    if (s.total != null) s.count.textContent = `${s.total} DATEI(EN)`;
    else s.count.textContent = s.loading ? "LESE VERZEICHNIS\u2026" : "";
    for (const b of s.opts.querySelectorAll("[data-sort]")) {
      const on = b.dataset.sort === s.sort;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", String(on));
    }
    for (const b of s.opts.querySelectorAll("[data-view]")) {
      const on = b.dataset.view === s.view;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-pressed", String(on));
    }
    s.genreBtn.classList.toggle("is-on", Boolean(s.genreId));
    s.grid.classList.toggle("is-list", s.view === "list" && !isMobile());
    s.grid.setAttribute("role", "list");
    for (const chip of s.genres.querySelectorAll(".lfx-rb__genre")) {
      const on = (chip.dataset.genre || "") === (s.genreId || "");
      chip.classList.toggle("is-active", on);
      if (on) chip.setAttribute("aria-current", "true");
      else chip.removeAttribute("aria-current");
    }
  }
  function reload2(s) {
    s.seq += 1;
    s.items = [];
    s.total = null;
    s.done = false;
    s.loading = false;
    s.grid.replaceChildren();
    s.status.replaceChildren();
    paintHead(s);
    loadMore2(s);
  }
  async function loadMore2(s) {
    if (state20 !== s || s.loading || s.done) return;
    const seq3 = s.seq;
    s.loading = true;
    s.root.setAttribute("aria-busy", "true");
    paintHead(s);
    const stale = () => state20 !== s || s.seq !== seq3;
    const sort = SORTS[s.sort] || SORTS.name;
    try {
      const res = await getItems({
        ...BASE_PARAMS,
        ParentId: s.libId,
        IncludeItemTypes: s.types,
        Recursive: true,
        SortBy: sort.by,
        SortOrder: sort.order,
        GenreIds: s.genreId || void 0,
        StartIndex: s.items.length,
        Limit: PAGE5
      });
      if (stale()) return;
      const items = asItems10(res);
      putItems(items);
      s.total = res && typeof res.TotalRecordCount === "number" ? res.TotalRecordCount : null;
      s.items.push(...items);
      for (const it of items) s.grid.append(itemNode(s, it));
      s.done = items.length < PAGE5 || s.total != null && s.items.length >= s.total;
      if (s.total == null) s.total = s.done ? s.items.length : null;
      if (!s.items.length) s.status.replaceChildren(h("p", { class: "lfx-rb__empty lfx-retro-caret" }, "DATEI NICHT GEFUNDEN"));
      else if (s.done) s.status.replaceChildren(h("p", { class: "lfx-rb__end" }, `${s.items.length} DATEI(EN)  \xB7  ENDE DES VERZEICHNISSES`));
    } catch (e) {
      if (stale()) return;
      console.warn("[LenzFlix] retro-browse konnte nicht laden", e && e.message);
      emitFx("error");
      s.done = true;
      s.status.replaceChildren(
        h("p", { class: "lfx-rb__empty" }, "LESEFEHLER IN LAUFWERK C:"),
        h("button", { type: "button", class: "lfx-retro-btn", onclick: () => {
          s.done = false;
          s.status.replaceChildren();
          loadMore2(s);
        } }, "Erneut versuchen")
      );
    } finally {
      if (!stale()) {
        s.loading = false;
        s.root.removeAttribute("aria-busy");
        paintHead(s);
      }
    }
  }
  function rerender(s) {
    s.grid.replaceChildren(...s.items.map((it) => itemNode(s, it)));
    paintHead(s);
  }
  async function build10(tab2, s) {
    const stale = () => state20 !== s;
    let lib = null;
    try {
      lib = (await getLibraries()).find((l) => l.id === s.libId) || null;
    } catch {
    }
    if (stale()) return;
    s.types = hubTypes(lib).items;
    s.libName = lib ? lib.name : "Bibliothek";
    const path = h("h1", { class: "lfx-rb__path lfx-retro-glow--strong" });
    const count = h("p", { class: "lfx-rb__count", "aria-live": "polite" });
    const optBtn = (attrs, label, onClick) => {
      const b = h("button", { type: "button", class: "lfx-rb__opt", ...attrs }, label);
      b.addEventListener("click", () => {
        emitFx("click");
        onClick(b);
      });
      return b;
    };
    const genreBtn = optBtn({ "aria-expanded": "false" }, "/F:GENRE", (b) => {
      const open2 = genres.hidden;
      genres.hidden = !open2;
      b.setAttribute("aria-expanded", String(open2));
    });
    const opts = h("div", { class: "lfx-rb__opts", role: "toolbar", "aria-label": "Anzeigeoptionen" }, [
      ...Object.entries(SORTS).map(([key, v]) => optBtn({ dataset: { sort: key } }, `/S:${v.label}`, () => {
        if (s.sort === key) return;
        s.sort = key;
        reload2(s);
      })),
      genreBtn,
      h("span", { class: "lfx-rb__opts-sep", "aria-hidden": "true" }),
      optBtn({ dataset: { view: "grid" }, class: "lfx-rb__opt lfx-rb__opt--view" }, "/V:RASTER", () => {
        if (s.view === "grid") return;
        s.view = "grid";
        try {
          window.localStorage.setItem(VIEW_KEY, "grid");
        } catch {
        }
        rerender(s);
      }),
      optBtn({ dataset: { view: "list" }, class: "lfx-rb__opt lfx-rb__opt--view" }, "/V:LISTE", () => {
        if (s.view === "list") return;
        s.view = "list";
        try {
          window.localStorage.setItem(VIEW_KEY, "list");
        } catch {
        }
        rerender(s);
      })
    ]);
    const genres = h("nav", { class: "lfx-rb__genres", "aria-label": "Genres", hidden: true });
    const grid2 = h("div", { class: "lfx-rb__grid", role: "list" });
    const status = h("div", { class: "lfx-rb__status" });
    const sentinel = h("div", { class: "lfx-rb__sentinel", "aria-hidden": "true" });
    const root7 = h("div", { id: ROOT_ID19, class: "lfx-retro-page lfx-rb" }, [
      h("header", { class: "lfx-rb__head" }, [path, count]),
      opts,
      genres,
      grid2,
      status,
      sentinel
    ]);
    Object.assign(s, { root: root7, path, count, opts, genres, genreBtn, grid: grid2, status });
    tab2.prepend(root7);
    setPageOn2(ON_CLASS18, true);
    scrollTop2();
    const addGenre = (label, genreId) => {
      genres.append(h("a", {
        class: "lfx-rb__genre",
        href: browseHref(s.libId, genreId),
        dataset: { genre: genreId || "" }
      }, label));
    };
    addGenre("ALLE", null);
    if (typeof IntersectionObserver === "function") {
      const io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore2(s);
      }, { rootMargin: "900px 0px" });
      io.observe(sentinel);
      s.cleanups.push(() => io.disconnect());
    } else {
      const onScroll7 = () => {
        const r = sentinel.getBoundingClientRect();
        if (r.top < (window.innerHeight || 800) + 900) loadMore2(s);
      };
      window.addEventListener("scroll", onScroll7, { passive: true });
      s.cleanups.push(() => window.removeEventListener("scroll", onScroll7));
    }
    reload2(s);
    try {
      const list = asItems10(await getJson("/Genres", {
        userId: getUserId(),
        ParentId: s.libId,
        IncludeItemTypes: s.types,
        Recursive: true,
        SortBy: "SortName"
      })).filter((g) => g && g.Id && g.Name);
      if (stale()) return;
      for (const g of list) addGenre(g.Name, g.Id);
      const hit = list.find((g) => g.Id === s.genreId);
      s.genreName = hit ? hit.Name : null;
      paintHead(s);
    } catch {
    }
  }
  function begin6(r) {
    dispose6();
    const s = {
      libId: r.lib,
      genreId: r.genre || null,
      genreName: null,
      libName: "",
      sort: "name",
      view: readView(),
      seq: 0,
      items: [],
      total: null,
      done: false,
      loading: false,
      cleanups: [],
      cancelWait: null,
      root: null
    };
    state20 = s;
    s.cancelWait = whenHomeTab2((tab2) => {
      if (state20 === s) build10(tab2, s);
    });
  }
  var browse_default2 = {
    name: "retro-browse",
    match: (route) => isTheme("retro") && isModern() && !isTv() && isReady() && routeOf2(route) != null,
    mount(route) {
      const r = routeOf2(route);
      if (r) begin6(r);
    },
    update(route) {
      const r = routeOf2(route);
      if (!r) return;
      if (!state20 || state20.libId !== r.lib || !state20.root || !state20.root.isConnected) {
        begin6(r);
        return;
      }
      if ((r.genre || null) !== state20.genreId) {
        state20.genreId = r.genre || null;
        const chip = state20.genres.querySelector(`.lfx-rb__genre[data-genre="${state20.genreId || ""}"]`);
        state20.genreName = chip && state20.genreId ? chip.textContent : null;
        reload2(state20);
      }
    },
    unmount: dispose6
  };

  // src/js/features/retro/nativedetail.js
  var nativedetail_default3 = createNativeDetail({
    name: "retro-nativedetail",
    theme: "retro",
    nologoClass: "lfx-retro-nologo",
    nobdClass: "lfx-retro-nobackdrop"
  }).feature;

  // src/js/features/retro/fx/crt.js
  var CRT_ID = "lfx-retro-crt";
  function createCrt() {
    let el4 = null;
    let stripTimer = 0;
    let shakeTimer = 0;
    function mount2() {
      if (el4 && el4.isConnected) return el4;
      el4 = h("div", { id: CRT_ID, class: "lfx-retro-crt", "aria-hidden": "true" }, [
        h("div", { class: "lfx-retro-crt__flicker" }),
        h("div", { class: "lfx-retro-crt__scan" }),
        h("div", { class: "lfx-retro-crt__mask" }),
        h("div", { class: "lfx-retro-crt__vignette" }),
        h("div", { class: "lfx-retro-crt__roll" }),
        h("div", { class: "lfx-retro-crt__strip" })
      ]);
      document.body.append(el4);
      return el4;
    }
    function unmount2() {
      clearTimeout(stripTimer);
      clearTimeout(shakeTimer);
      stripTimer = shakeTimer = 0;
      if (el4) el4.remove();
      el4 = null;
    }
    function sync3(on) {
      document.documentElement.classList.toggle(NO_CRT_CLASS, !on);
      if (on) mount2();
      else unmount2();
    }
    function glitchStrip(ms = 180) {
      if (!el4) return;
      const strip = el4.querySelector(".lfx-retro-crt__strip");
      if (!strip) return;
      strip.style.top = `${Math.round(8 + Math.random() * 80)}%`;
      strip.style.height = `${Math.round(2 + Math.random() * 7)}%`;
      el4.classList.add("is-strip");
      clearTimeout(stripTimer);
      stripTimer = setTimeout(() => {
        if (el4) el4.classList.remove("is-strip");
      }, ms);
    }
    function shake(ms = 700) {
      if (!el4) return;
      el4.classList.add("is-shaking");
      clearTimeout(shakeTimer);
      shakeTimer = setTimeout(() => {
        if (el4) el4.classList.remove("is-shaking");
      }, ms);
    }
    return { mount: mount2, unmount: unmount2, sync: sync3, glitchStrip, shake, get el() {
      return el4;
    } };
  }

  // src/js/features/retro/fx/util.js
  var EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';
  function isEditable(target) {
    try {
      return Boolean(target && target.closest && target.closest(EDITABLE));
    } catch {
      return false;
    }
  }
  var DIALOG_SELECTOR2 = [
    ".dialogContainer .dialog",
    ".MuiDialog-root:not(.MuiModal-hidden)",
    ".MuiPopover-root:not(.MuiModal-hidden)",
    ".MuiModal-root:not(.MuiModal-hidden)[role=presentation]",
    "#lfx-popover",
    "#lfx-sheet",
    "#lfx-themepicker"
  ].map((q) => `${q}:not([aria-hidden=true]):not([hidden])`).join(", ");
  function isDialogOpen() {
    try {
      const cl2 = document.documentElement.classList;
      if (["lfx-sheet-open", "lfx-themepicker-open", "lfx-popover-open", "lfx-modal-open"].some((c) => cl2.contains(c))) return true;
      return Boolean(document.querySelector(DIALOG_SELECTOR2));
    } catch {
      return false;
    }
  }
  function isPlayerVisible(route) {
    if (route && typeof route.path === "string" && route.path.startsWith("/video")) return true;
    return Boolean(document.querySelector("#videoOsdPage:not(.hide)"));
  }
  function isVideoPlaying() {
    try {
      return [...document.querySelectorAll("video")].some((v) => !v.paused && !v.ended && v.readyState > 2);
    } catch {
      return false;
    }
  }
  function prefersReducedMotion() {
    try {
      return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch {
      return false;
    }
  }
  function rand(min, max) {
    return min + Math.random() * (max - min);
  }
  function createTimers() {
    const set = /* @__PURE__ */ new Set();
    return {
      timeout(fn, ms) {
        const id = setTimeout(() => {
          set.delete(id);
          fn();
        }, ms);
        set.add(id);
        return id;
      },
      interval(fn, ms) {
        const id = setInterval(fn, ms);
        set.add(id);
        return id;
      },
      clear(id) {
        clearTimeout(id);
        clearInterval(id);
        set.delete(id);
      },
      clearAll() {
        for (const id of set) {
          clearTimeout(id);
          clearInterval(id);
        }
        set.clear();
      },
      get size() {
        return set.size;
      }
    };
  }

  // src/js/features/retro/fx/boot.js
  var BOOT_ID = "lfx-retro-boot";
  var BOOT_FLAG = "lfx.retro.booted";
  var BOOT_VERSION = "v1.6";
  var HARD_TIMEOUT_MS = 4500;
  var REDUCED_MS = 800;
  function hasBooted() {
    try {
      return window.sessionStorage.getItem(BOOT_FLAG) === "1";
    } catch {
      return false;
    }
  }
  function markBooted() {
    try {
      window.sessionStorage.setItem(BOOT_FLAG, "1");
    } catch {
    }
  }
  function clearBooted() {
    try {
      window.sessionStorage.removeItem(BOOT_FLAG);
    } catch {
    }
  }
  function runBoot({ getName = async () => "", reduced = false, onSound = () => {
  }, onDone = () => {
  } } = {}) {
    const timers = createTimers();
    const text = h("div", { class: "lfx-retro-boot__text" });
    const top = h("div", { class: "lfx-retro-boot__half lfx-retro-boot__half--top" });
    const bot = h("div", { class: "lfx-retro-boot__half lfx-retro-boot__half--bottom" });
    const line = h("div", { class: "lfx-retro-boot__line" });
    const hint = h("div", { class: "lfx-retro-boot__hint" }, "TASTE / TIPPEN ZUM \xDCBERSPRINGEN");
    const el4 = h("div", { id: BOOT_ID, class: `lfx-retro-boot${reduced ? " is-reduced" : ""}`, role: "presentation", "aria-hidden": "true" }, [top, bot, text, line, hint]);
    let done = false;
    let name = "";
    let nameKnown = false;
    getName().then((n) => {
      name = String(n || "");
      nameKnown = true;
    }).catch(() => {
      nameKnown = true;
    });
    const skipEvents = ["keydown", "pointerdown", "touchstart"];
    function cleanup2() {
      timers.clearAll();
      for (const ev of skipEvents) document.removeEventListener(ev, skip, true);
      el4.remove();
    }
    function finish3() {
      if (done) return;
      done = true;
      cleanup2();
      try {
        onDone();
      } catch {
      }
    }
    function skip(e) {
      if (e && e.type === "keydown" && (e.ctrlKey || e.metaKey || e.altKey)) return;
      if (e && e.cancelable && e.type !== "keydown") e.preventDefault();
      openUp(true);
    }
    function addLine() {
      const span2 = h("div", { class: "lfx-retro-boot__row" });
      text.append(span2);
      return span2;
    }
    function typeLine(str, ms, then) {
      const span2 = addLine();
      const n = str.length;
      let i = 0;
      if (!n) {
        then(span2);
        return;
      }
      const id = timers.interval(() => {
        i += 1;
        span2.textContent = str.slice(0, i);
        if (i >= n) {
          timers.clear(id);
          then(span2);
        }
      }, Math.max(8, Math.round(ms / n)));
    }
    function caret(on) {
      for (const c of text.querySelectorAll(".lfx-retro-boot__caret")) c.remove();
      if (on) text.append(h("span", { class: "lfx-retro-boot__caret" }));
    }
    let opening = false;
    function openUp(fast) {
      if (opening || done) return;
      opening = true;
      timers.clearAll();
      caret(false);
      el4.classList.add("is-open");
      timers.timeout(finish3, fast ? 420 : 640);
      timers.timeout(finish3, HARD_TIMEOUT_MS);
    }
    document.body.append(el4);
    for (const ev of skipEvents) document.addEventListener(ev, skip, { capture: true, passive: false });
    timers.timeout(finish3, HARD_TIMEOUT_MS);
    try {
      onSound("boot");
    } catch {
    }
    if (reduced) {
      for (const s of [`LENZ//84 BIOS ${BOOT_VERSION}`, "SPEICHERTEST ... 640K OK", "LADE MEDIATHEK ... OK", "BEREIT."]) addLine().textContent = s;
      timers.timeout(() => {
        caret(false);
        el4.classList.add("is-open");
      }, REDUCED_MS - 300);
      timers.timeout(finish3, REDUCED_MS);
      return { cancel() {
        done = true;
        cleanup2();
      } };
    }
    timers.timeout(() => {
      typeLine(`LENZ//84 BIOS ${BOOT_VERSION}`, 400, () => {
      });
    }, 0);
    timers.timeout(() => {
      const span2 = addLine();
      let kb = 0;
      const id = timers.interval(() => {
        kb = Math.min(640, kb + 32);
        span2.textContent = `SPEICHERTEST ... ${kb}K${kb >= 640 ? " OK" : ""}`;
        if (kb >= 640) timers.clear(id);
      }, 30);
    }, 500);
    timers.timeout(() => {
      typeLine("LADE MEDIATHEK ...", 380, (span2) => {
        span2.textContent += " OK";
      });
    }, 1200);
    timers.timeout(() => {
      const who = (nameKnown && name ? name : "GAST").toUpperCase();
      typeLine(`BENUTZER: ${who}`, 300, () => {
      });
    }, 1700);
    timers.timeout(() => {
      typeLine("BEREIT.", 160, () => caret(true));
    }, 2100);
    timers.timeout(() => openUp(false), 2450);
    return { cancel() {
      done = true;
      cleanup2();
    } };
  }

  // src/js/features/retro/fx/glitch.js
  var TARGETS = ".lfx-retro-glitch, #lfx-retro-home h1, .lfx-retro-hero__title, h1, h2.sectionTitle, .lfx-retro-label";
  function inViewport(el4) {
    const r = el4.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    return r.bottom > 0 && r.top < (window.innerHeight || 800) && r.right > 0 && r.left < (window.innerWidth || 1200);
  }
  function pickTarget(root7 = document) {
    const list = [...root7.querySelectorAll(TARGETS)].filter((el4) => !el4.closest("#videoOsdPage") && inViewport(el4));
    return list.length ? list[Math.floor(Math.random() * list.length)] : null;
  }
  function createGlitch({ crt, enabled: enabled2 = () => true, minMs = 2e4, maxMs = 4e4 }) {
    const timers = createTimers();
    let running = false;
    function fire() {
      if (!running) return;
      if (enabled2() && !document.hidden) {
        const target = pickTarget();
        if (target) {
          const addedBase = !target.classList.contains("lfx-retro-glitch");
          target.classList.add("lfx-retro-glitch", "is-glitching");
          timers.timeout(() => {
            target.classList.remove("is-glitching");
            if (addedBase) target.classList.remove("lfx-retro-glitch");
          }, 600);
        }
        crt.glitchStrip();
      }
      schedule4();
    }
    function schedule4() {
      if (running) timers.timeout(fire, rand(minMs, maxMs));
    }
    return {
      start() {
        if (running) return;
        running = true;
        schedule4();
      },
      stop() {
        running = false;
        timers.clearAll();
        for (const el4 of document.querySelectorAll(".is-glitching")) el4.classList.remove("is-glitching");
      },
      fire
    };
  }

  // src/js/features/retro/fx/sound.js
  var ctx = null;
  var master = null;
  var rainNode = null;
  var MASTER_GAIN = 0.08;
  var HOVER_GAP_MS2 = 60;
  function getCtor() {
    if (typeof window === "undefined") return null;
    return window.AudioContext || window.webkitAudioContext || null;
  }
  function ensureContext() {
    if (ctx) return ctx;
    const Ctor = getCtor();
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 6;
      master.connect(comp);
      comp.connect(ctx.destination);
    } catch {
      ctx = null;
      master = null;
    }
    return ctx;
  }
  function tone(c, { type = "square", f0, f1 = f0, t0 = 0, dur = 0.1, vol = 0.5, lp = 4e3, attack = 5e-3 }) {
    const t = c.currentTime + t0;
    const osc = c.createOscillator();
    const gain = c.createGain();
    const filter = c.createBiquadFilter();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    filter.type = "lowpass";
    filter.frequency.value = lp;
    gain.gain.setValueAtTime(1e-4, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  function noiseBuffer(c, seconds) {
    const len = Math.max(1, Math.floor(c.sampleRate * seconds));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }
  function noise(c, { t0 = 0, dur = 0.04, vol = 0.4, hp = 1500 }) {
    const t = c.currentTime + t0;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c, dur);
    const filter = c.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = hp;
    const gain = c.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
  }
  var NOTE = (n) => 440 * 2 ** ((n - 69) / 12);
  var SOUNDS = {
    blip: (c) => tone(c, { type: "square", f0: 1320, f1: 1500, dur: 0.035, vol: 0.12, lp: 3e3 }),
    click: (c) => {
      tone(c, { type: "square", f0: 880, f1: 440, dur: 0.06, vol: 0.4, lp: 2600 });
      noise(c, { dur: 0.015, vol: 0.2, hp: 3e3 });
    },
    type: (c) => noise(c, { dur: 0.022, vol: 0.28, hp: 1800 + Math.random() * 1500 }),
    open: (c) => tone(c, { type: "sawtooth", f0: 220, f1: 880, dur: 0.18, vol: 0.3, lp: 2400 }),
    close: (c) => tone(c, { type: "sawtooth", f0: 880, f1: 200, dur: 0.16, vol: 0.28, lp: 2400 }),
    nav: (c) => {
      tone(c, { type: "square", f0: 660, dur: 0.05, vol: 0.3, lp: 3e3 });
      tone(c, { type: "square", f0: 990, t0: 0.05, dur: 0.07, vol: 0.3, lp: 3e3 });
    },
    error: (c) => {
      tone(c, { type: "sawtooth", f0: 160, dur: 0.14, vol: 0.4, lp: 1200 });
      tone(c, { type: "sawtooth", f0: 120, t0: 0.15, dur: 0.22, vol: 0.4, lp: 1200 });
    },
    boot: (c) => {
      [48, 55, 60, 64, 67, 72].forEach((n, i) => tone(c, { type: i % 2 ? "square" : "sawtooth", f0: NOTE(n), t0: i * 0.11, dur: 0.5 - i * 0.04, vol: 0.28, lp: 1800 }));
      tone(c, { type: "sawtooth", f0: NOTE(36), dur: 1.1, vol: 0.3, lp: 600 });
    },
    jingle: (c) => {
      const melody = [67, 67, 72, 76, 79, 76, 79, 84, 83, 79, 76, 79, 84];
      const len = [0.1, 0.1, 0.1, 0.1, 0.2, 0.1, 0.1, 0.3, 0.1, 0.1, 0.1, 0.1, 0.5];
      let t = 0;
      melody.forEach((n, i) => {
        tone(c, { type: "square", f0: NOTE(n), t0: t, dur: len[i] * 0.95, vol: 0.3, lp: 5e3 });
        tone(c, { type: "triangle", f0: NOTE(n - 12), t0: t, dur: len[i] * 0.95, vol: 0.3, lp: 2e3 });
        t += len[i];
      });
    }
  };
  var SOUND_NAMES = Object.keys(SOUNDS).concat("rain");
  function createSound(isEnabled) {
    let lastHover = 0;
    function play2(name) {
      try {
        if (!isEnabled() || !ctx || ctx.state !== "running") return false;
        if (name === "hover") name = "blip";
        if (name === "blip") {
          const now = Date.now();
          if (now - lastHover < HOVER_GAP_MS2) return false;
          lastHover = now;
        }
        const fn = SOUNDS[name];
        if (!fn) return false;
        fn(ctx);
        return true;
      } catch {
        return false;
      }
    }
    function unlock() {
      try {
        if (!isEnabled()) return false;
        const c = ensureContext();
        if (!c) return false;
        if (c.state === "suspended" && typeof c.resume === "function") {
          const p = c.resume();
          if (p && typeof p.catch === "function") p.catch(() => {
          });
        }
        return true;
      } catch {
        return false;
      }
    }
    function stopRain() {
      try {
        if (rainNode) {
          rainNode.stop();
          rainNode.disconnect();
        }
      } catch {
      }
      rainNode = null;
    }
    function suspend() {
      stopRain();
      try {
        if (ctx && ctx.state === "running" && typeof ctx.suspend === "function") {
          const p = ctx.suspend();
          if (p && typeof p.catch === "function") p.catch(() => {
          });
        }
      } catch {
      }
    }
    function startRain() {
      try {
        if (!isEnabled() || !ctx || ctx.state !== "running" || rainNode) return;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, 2);
        src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = 700;
        const g = ctx.createGain();
        g.gain.value = 0.18;
        src.connect(f);
        f.connect(g);
        g.connect(master);
        src.start();
        rainNode = src;
      } catch {
        rainNode = null;
      }
    }
    return { play: play2, unlock, suspend, startRain, stopRain, isRunning: () => Boolean(ctx && ctx.state === "running") };
  }

  // src/js/features/retro/fx/cheat.js
  var CHEAT_SEQUENCE = ["ArrowUp", "ArrowUp", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowRight", "ArrowLeft", "ArrowRight", "b", "a"];
  function normalizeKey(key) {
    return typeof key === "string" && key.length === 1 ? key.toLowerCase() : key;
  }
  function createSequence(seq3 = CHEAT_SEQUENCE) {
    let buf = [];
    return {
      feed(key) {
        buf.push(normalizeKey(key));
        if (buf.length > seq3.length) buf = buf.slice(-seq3.length);
        if (buf.length === seq3.length && buf.every((k, i) => k === seq3[i])) {
          buf = [];
          return true;
        }
        return false;
      },
      reset() {
        buf = [];
      }
    };
  }
  function createTapCounter({ gap = 400 } = {}) {
    let count = 0;
    let last = -Infinity;
    return {
      tap(now = Date.now()) {
        count = now - last < gap ? count + 1 : 1;
        last = now;
        return count;
      },
      get count() {
        return count;
      },
      reset() {
        count = 0;
        last = -Infinity;
      }
    };
  }

  // src/js/features/retro/fx/terminal-commands.js
  var ALIASES = {
    hilfe: "hilfe",
    help: "hilfe",
    "?": "hilfe",
    whoami: "whoami",
    datum: "datum",
    date: "datum",
    uhr: "uhr",
    time: "uhr",
    ls: "ls",
    dir: "ls",
    suche: "suche",
    search: "suche",
    spiele: "spiele",
    play: "spiele",
    zufall: "zufall",
    random: "zufall",
    design: "design",
    theme: "design",
    sound: "sound",
    crt: "crt",
    regen: "regen",
    rain: "regen",
    overdrive: "overdrive",
    hack: "hack",
    reboot: "reboot",
    clear: "clear",
    cls: "clear",
    exit: "exit",
    quit: "exit",
    lenz: "lenz",
    sudo: "sudo",
    42: "42",
    hallo: "hallo",
    hello: "hallo"
  };
  var HELP_LINES = [
    ["HILFE", "DIESE LISTE"],
    ["WHOAMI", "WER BIN ICH"],
    ["DATUM / UHR", "DATUM UND UHRZEIT"],
    ["LS", "BIBLIOTHEKEN AUFLISTEN"],
    ["SUCHE <TEXT>", "MEDIATHEK DURCHSUCHEN"],
    ["SPIELE <TITEL>", "KASSETTE LADEN"],
    ["ZUFALL", "ZUF\xC4LLIGER FILM"],
    ["DESIGN <ID>", "FLIX | PLUS | PRIME | RETRO"],
    ["SOUND AN|AUS", "TON SCHALTEN"],
    ["CRT AN|AUS", "BILDSCHIRM-EFFEKT"],
    ["REGEN", "CODE-REGEN STARTEN"],
    ["OVERDRIVE", "FARBRAUSCH"],
    ["HACK", "ZUGRIFF ERZWINGEN (SPIEL)"],
    ["REBOOT", "NEU STARTEN"],
    ["LENZ", "LOGO"],
    ["CLEAR", "BILDSCHIRM LEEREN"],
    ["EXIT", "TERMINAL SCHLIESSEN"]
  ];
  var ASCII_LOGO = [
    " _     _____ _   _ __________  ___   ___  _  _ ",
    "| |   | ____| \\ | |__  /__  / / _ \\ / _ \\| || |",
    "| |   |  _| |  \\| | / /   / / | (_) | (_) | || |_",
    "| |___| |___| |\\  |/ /_  / /_  > _ < > _ <|__   _|",
    "|_____|_____|_| \\_/____|/____|\\___/ \\___/    |_|  "
  ];
  function parseCommand(input) {
    const raw = String(input == null ? "" : input).trim();
    if (!raw) return { raw, cmd: null, name: "", args: "", argv: [] };
    const [first2, ...rest] = raw.split(/\s+/);
    const name = first2.toLowerCase();
    const args = raw.slice(first2.length).trim();
    const cmd = Object.prototype.hasOwnProperty.call(ALIASES, name) ? ALIASES[name] : null;
    return { raw, cmd, name, args, argv: rest };
  }
  var COMPLETABLE = Object.keys(ALIASES).filter((k) => !["sudo", "42", "hallo", "hello", "?"].includes(k));
  function complete(prefix) {
    const p = String(prefix || "").toLowerCase();
    if (!p || /\s/.test(p)) return [];
    return COMPLETABLE.filter((k) => k.startsWith(p)).sort();
  }
  var pad24 = (n) => String(n).padStart(2, "0");
  var WEEKDAYS = ["SONNTAG", "MONTAG", "DIENSTAG", "MITTWOCH", "DONNERSTAG", "FREITAG", "SAMSTAG"];
  function formatDate2(d) {
    return `${WEEKDAYS[d.getDay()]}, ${pad24(d.getDate())}.${pad24(d.getMonth() + 1)}.${d.getFullYear()}`;
  }
  function formatTime(d) {
    return `${pad24(d.getHours())}:${pad24(d.getMinutes())}:${pad24(d.getSeconds())}`;
  }
  function hexLine(rnd = Math.random) {
    const part = (n) => Array.from({ length: n }, () => Math.floor(rnd() * 256).toString(16).padStart(2, "0")).join(" ").toUpperCase();
    const addr = Math.floor(rnd() * 65535).toString(16).padStart(4, "0").toUpperCase();
    return `0x${addr}  ${part(8)}`;
  }
  function progressBar(pct, width = 24) {
    const full = Math.round(Math.max(0, Math.min(100, pct)) / 100 * width);
    return `[${"#".repeat(full)}${".".repeat(width - full)}] ${String(Math.round(pct)).padStart(3, " ")}%`;
  }
  async function execute(line, ctx2) {
    const p = parseCommand(line);
    if (!p.raw) return p;
    const out = (s) => ctx2.print(s);
    switch (p.cmd) {
      case "hilfe":
        out("VERF\xDCGBARE BEFEHLE:");
        for (const [a, b] of HELP_LINES) out(`  ${a.padEnd(16, " ")} ${b}`);
        out("TAB = VERVOLLST\xC4NDIGEN, PFEIL AUF/AB = VERLAUF.");
        break;
      case "whoami": {
        let n;
        try {
          n = await ctx2.userName();
        } catch {
          n = "";
        }
        out(n ? String(n).toUpperCase() : "GAST");
        break;
      }
      case "datum":
        out(formatDate2(ctx2.now()));
        break;
      case "uhr":
        out(formatTime(ctx2.now()));
        break;
      case "ls": {
        let libs;
        try {
          libs = await ctx2.libraries();
        } catch {
          libs = [];
        }
        if (!libs.length) {
          out("KEINE BIBLIOTHEKEN GEFUNDEN.");
          break;
        }
        out(`${libs.length} BIBLIOTHEK${libs.length === 1 ? "" : "EN"}:`);
        for (const l of libs) out(`  <DIR>  ${String(l.name).toUpperCase()}`);
        break;
      }
      case "suche": {
        if (!p.args) {
          ctx2.error("GIB EINEN SUCHBEGRIFF AN: SUCHE <TEXT>");
          break;
        }
        out(`SUCHE NACH "${p.args}" ...`);
        ctx2.go(ctx2.searchHref(p.args));
        break;
      }
      case "spiele": {
        if (!p.args) {
          ctx2.error("WELCHE KASSETTE? SPIELE <TITEL>");
          break;
        }
        out(`SUCHE KASSETTE "${p.args}" ...`);
        let hits;
        try {
          hits = await ctx2.searchTitles(p.args);
        } catch {
          hits = [];
        }
        if (!hits.length) {
          ctx2.error(`KEINE KASSETTE GEFUNDEN: ${p.args}`);
          break;
        }
        const best = hits[0];
        out(`GEFUNDEN: ${String(best.name).toUpperCase()}${best.year ? ` (${best.year})` : ""}`);
        out("LADE KASSETTE ...");
        ctx2.go(ctx2.titleHref(best.id));
        break;
      }
      case "zufall": {
        out("ZIEHE ZUFALLSKASSETTE ...");
        let pick;
        try {
          pick = await ctx2.randomTitle();
        } catch {
          pick = null;
        }
        if (!pick) {
          ctx2.error("NICHTS GEFUNDEN. IST DIE MEDIATHEK LEER?");
          break;
        }
        out(`GEZOGEN: ${String(pick.name).toUpperCase()}`);
        out("LADE KASSETTE ...");
        ctx2.go(ctx2.titleHref(pick.id));
        break;
      }
      case "design": {
        const id = p.argv[0] ? p.argv[0].toLowerCase() : "";
        if (!id) {
          out(`AKTUELL: ${ctx2.themeName(ctx2.currentTheme())}`);
          out(`VERF\xDCGBAR: ${ctx2.themes.join(" | ").toUpperCase()}`);
          break;
        }
        if (!ctx2.themes.includes(id)) {
          ctx2.error(`UNBEKANNTES DESIGN: ${id}. VERF\xDCGBAR: ${ctx2.themes.join(", ")}`);
          break;
        }
        if (id === ctx2.currentTheme()) {
          out("DIESES DESIGN IST BEREITS AKTIV.");
          break;
        }
        out(`WECHSLE ZU ${ctx2.themeName(id)} ... DAS TERMINAL WIRD GESCHLOSSEN.`);
        await ctx2.sleep(500);
        ctx2.close();
        await ctx2.setTheme(id);
        break;
      }
      case "sound":
      case "crt": {
        const arg = (p.argv[0] || "").toLowerCase();
        const label = p.cmd === "sound" ? "SOUND" : "CRT";
        const on = ["an", "on", "1", "ein"].includes(arg);
        const off = ["aus", "off", "0"].includes(arg);
        if (!on && !off) {
          out(`${label}: ${ctx2.getPref(p.cmd) ? "AN" : "AUS"}. NUTZUNG: ${label} AN|AUS`);
          break;
        }
        ctx2.setPref(p.cmd, on);
        if (p.cmd === "sound" && on) ctx2.unlockSound();
        out(`${label}: ${on ? "AN" : "AUS"}`);
        break;
      }
      case "regen":
        out("CODE-REGEN STARTET ... TASTE ZUM BEENDEN.");
        await ctx2.sleep(400);
        ctx2.close();
        ctx2.regen();
        break;
      case "overdrive":
        out(">> OVERDRIVE <<");
        ctx2.overdrive();
        break;
      case "hack":
        await runHack(ctx2);
        break;
      case "reboot":
        out("SYSTEM WIRD NEU GESTARTET ...");
        await ctx2.sleep(500);
        ctx2.close();
        ctx2.reboot();
        break;
      case "clear":
        ctx2.clear();
        break;
      case "exit":
        ctx2.close();
        break;
      case "lenz":
        for (const l of ASCII_LOGO) out(l);
        out("LENZ//84 :: MEDIATHEK-TERMINAL");
        break;
      case "sudo":
        ctx2.error("NETTER VERSUCH.");
        break;
      case "42":
        out("DIE ANTWORT. NUR WIE LAUTET DIE FRAGE?");
        break;
      case "hallo": {
        let n;
        try {
          n = await ctx2.userName();
        } catch {
          n = "";
        }
        out(`HALLO${n ? `, ${String(n).toUpperCase()}` : ""}. SCH\xD6N, DASS DU DA BIST.`);
        break;
      }
      default:
        ctx2.error(`BEFEHL NICHT GEFUNDEN: ${p.name}. TIPPE 'HILFE'.`);
    }
    return p;
  }
  async function runHack(ctx2, { rnd = Math.random } = {}) {
    ctx2.print("VERBINDE MIT MAINFRAME ...");
    if (!await ctx2.sleep(500)) return;
    for (let i = 0; i < 14; i++) {
      ctx2.print(hexLine(rnd));
      if (!await ctx2.sleep(60)) return;
    }
    const upd = ctx2.print(progressBar(0));
    for (let pct = 0; pct <= 100; pct += 10) {
      if (typeof upd === "function") upd(progressBar(pct));
      if (!await ctx2.sleep(110)) return;
    }
    for (let i = 0; i < 8; i++) {
      ctx2.print(hexLine(rnd));
      if (!await ctx2.sleep(45)) return;
    }
    ctx2.print(">> ZUGRIFF GEW\xC4HRT <<", "ok");
    ctx2.print("(ALLES NUR SPIELERI. NIEMAND WURDE GEHACKT.)");
  }

  // src/js/features/retro/fx/terminal.js
  var TERMINAL_ID = "lfx-retro-terminal";
  var PROMPT = "LENZ84:\\>";
  var MAX_LINES = 400;
  var MAX_HISTORY = 50;
  function createTerminal(deps) {
    const timers = createTimers();
    let root7 = null;
    let out = null;
    let input = null;
    let closeBtn = null;
    let opener = null;
    let alive = false;
    let busy2 = false;
    const sleepers = /* @__PURE__ */ new Set();
    const history2 = [];
    let hIndex = 0;
    let draft = "";
    function print(text, cls) {
      if (!out) return () => {
      };
      const row = h("div", { class: `lfx-retro-term__row${cls ? ` is-${cls}` : ""}` });
      row.textContent = String(text);
      out.append(row);
      while (out.childElementCount > MAX_LINES) out.firstElementChild.remove();
      out.scrollTop = out.scrollHeight;
      return (t) => {
        row.textContent = String(t);
      };
    }
    const ctx2 = {
      ...deps,
      print,
      error(text) {
        print(text, "err");
        emitFx("error");
      },
      clear() {
        if (out) out.replaceChildren();
      },
      close() {
        close2();
      },
      go(href) {
        timers.timeout(() => {
          close2();
          try {
            window.location.hash = href;
          } catch {
          }
        }, 700);
      },
      sleep(ms) {
        return new Promise((resolve2) => {
          sleepers.add(resolve2);
          timers.timeout(() => {
            sleepers.delete(resolve2);
            resolve2(alive);
          }, ms);
        });
      }
    };
    async function run(line) {
      const raw = String(line || "").trim();
      if (!raw) return;
      print(`${PROMPT} ${raw}`, "cmd");
      if (history2[history2.length - 1] !== raw) history2.push(raw);
      if (history2.length > MAX_HISTORY) history2.shift();
      hIndex = history2.length;
      draft = "";
      busy2 = true;
      try {
        await execute(raw, ctx2);
      } catch {
        print("INTERNER FEHLER. SYSTEM L\xC4UFT WEITER.", "err");
      } finally {
        busy2 = false;
        if (input && alive) input.focus({ preventScroll: true });
      }
    }
    function onKey3(e) {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        close2();
        return;
      }
      if (e.key === "Tab") {
        if (e.target === input && input.value.trim() && !/\s/.test(input.value.trim())) {
          e.preventDefault();
          const matches = complete(input.value.trim());
          if (matches.length === 1) input.value = `${matches[0]} `;
          else if (matches.length > 1) {
            let prefix = matches[0];
            for (const m of matches) while (!m.startsWith(prefix)) prefix = prefix.slice(0, -1);
            if (prefix.length > input.value.trim().length) input.value = prefix;
            else print(matches.join("  "));
          }
          return;
        }
        const items = [input, closeBtn].filter(Boolean);
        const idx = items.indexOf(document.activeElement);
        const next = e.shiftKey ? idx <= 0 ? items.length - 1 : idx - 1 : (idx + 1) % items.length;
        e.preventDefault();
        items[next].focus();
        return;
      }
      if (e.target !== input) return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (hIndex === history2.length) draft = input.value;
        if (hIndex > 0) hIndex -= 1;
        input.value = history2[hIndex] || "";
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        if (hIndex < history2.length) hIndex += 1;
        input.value = hIndex >= history2.length ? draft : history2[hIndex];
      } else if ((e.key === "l" || e.key === "L") && e.ctrlKey) {
        e.preventDefault();
        ctx2.clear();
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        emitFx("type");
      }
    }
    function build11() {
      input = h("input", {
        class: "lfx-retro-term__input",
        type: "text",
        autocomplete: "off",
        autocapitalize: "none",
        autocorrect: "off",
        spellcheck: "false",
        enterkeyhint: "go",
        "aria-label": "Befehl eingeben",
        maxlength: "200"
      });
      closeBtn = h("button", { type: "button", class: "lfx-retro-term__close", "aria-label": "Terminal schlie\xDFen" }, "X");
      closeBtn.addEventListener("click", () => close2());
      out = h("div", { class: "lfx-retro-term__out", role: "log", "aria-live": "polite" });
      const form = h("form", { class: "lfx-retro-term__form", autocomplete: "off" }, [
        h("label", { class: "lfx-retro-term__prompt", for: "lfx-retro-term-input" }, PROMPT),
        input
      ]);
      input.id = "lfx-retro-term-input";
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (busy2) return;
        const v = input.value;
        input.value = "";
        run(v);
      });
      root7 = h("div", {
        id: TERMINAL_ID,
        class: "lfx-retro-term",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "LENZ//84 Terminal"
      }, [
        h("div", { class: "lfx-retro-term__bar" }, [h("span", { class: "lfx-retro-term__title" }, "LENZ//84 TERMINAL  [ESC = ENDE]"), closeBtn]),
        out,
        form
      ]);
      root7.addEventListener("keydown", onKey3);
      root7.addEventListener("pointerdown", (e) => {
        if (e.target === out && input) timers.timeout(() => {
          if (alive && !String(window.getSelection && window.getSelection()).length) input.focus({ preventScroll: true });
        }, 0);
      });
    }
    function open2() {
      if (alive) {
        if (input) input.focus();
        return;
      }
      opener = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
      busy2 = false;
      build11();
      document.body.append(root7);
      document.documentElement.classList.add("lfx-retro-term-open");
      alive = true;
      print("LENZ//84 TERMINAL \u2014 TIPPE 'HILFE' F\xDCR BEFEHLE.");
      emitFx("open");
      timers.timeout(() => {
        if (root7) root7.classList.add("is-open");
        input.focus({ preventScroll: true });
      }, 20);
    }
    function releaseSleepers() {
      for (const r of [...sleepers]) r(false);
      sleepers.clear();
    }
    function teardown9() {
      timers.clearAll();
      releaseSleepers();
      alive = false;
      busy2 = false;
      if (root7) root7.remove();
      root7 = out = input = closeBtn = null;
      document.documentElement.classList.remove("lfx-retro-term-open");
    }
    function close2() {
      if (!alive) return;
      const el4 = root7;
      const back = opener;
      opener = null;
      emitFx("close");
      alive = false;
      releaseSleepers();
      if (el4) el4.classList.remove("is-open");
      document.documentElement.classList.remove("lfx-retro-term-open");
      timers.clearAll();
      timers.timeout(() => {
        if (root7 === el4) teardown9();
      }, 260);
      if (back && back.isConnected && typeof back.focus === "function") {
        try {
          back.focus({ preventScroll: true });
        } catch {
        }
      }
    }
    return {
      open: open2,
      close: close2,
      toggle() {
        if (alive) close2();
        else open2();
      },
      isOpen: () => alive,
      run,
      destroy() {
        alive = false;
        opener = null;
        teardown9();
      }
    };
  }

  // src/js/features/retro/fx/screensaver.js
  var RAIN_ID = "lfx-retro-rain";
  var IDLE_MS = 3 * 60 * 1e3;
  var CHARS = "0123456789ABCDEF0123456789ABCDEFGHIJKLMNOPRSTUVWXYZ#%&$+=<>/\\|:;\u2593\u2592\u2591\u2588\u258C\u2590".split("");
  var FRAME_MS = 1e3 / 30;
  function createScreensaver({ idleMs = IDLE_MS, isBlocked = () => false, getTitles = () => [], reduced = false, onStart = () => {
  }, onStop = () => {
  } } = {}) {
    const timers = createTimers();
    let started2 = false;
    let active5 = false;
    let lastInput = Date.now();
    let el4 = null;
    let canvas = null;
    let ctx2 = null;
    let titleEl = null;
    let raf3 = 0;
    let lastFrame = 0;
    let drops = [];
    let cols = 0;
    let fontPx = 18;
    let dpr = 1;
    let swallowClickUntil = 0;
    let lastMove = null;
    let nextFlash = 0;
    const idleEvents = ["pointermove", "keydown", "touchstart", "wheel", "scroll", "pointerdown"];
    function noteInput(e) {
      if (active5) return;
      if (e && e.type === "pointermove") {
        const p = { x: e.clientX, y: e.clientY };
        if (lastMove && Math.abs(p.x - lastMove.x) + Math.abs(p.y - lastMove.y) < 3) return;
        lastMove = p;
      }
      lastInput = Date.now();
    }
    function size() {
      if (!canvas) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = window.innerWidth || 800;
      const hgt = window.innerHeight || 600;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(hgt * dpr));
      fontPx = Math.round((w < 800 ? 16 : 20) * dpr);
      const n = Math.ceil(canvas.width / fontPx);
      const old = drops;
      drops = Array.from({ length: n }, (_, i) => i < old.length ? old[i] : -Math.floor(Math.random() * 40));
      cols = n;
      if (ctx2) {
        ctx2.fillStyle = "#0a0603";
        ctx2.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
    function frame(now) {
      raf3 = 0;
      if (!active5 || !ctx2) return;
      raf3 = requestAnimationFrame(frame);
      if (document.hidden) return;
      const step = reduced ? FRAME_MS * 2 : FRAME_MS;
      if (now - lastFrame < step) return;
      lastFrame = now;
      ctx2.fillStyle = "rgba(10, 6, 3, 0.14)";
      ctx2.fillRect(0, 0, canvas.width, canvas.height);
      ctx2.font = `${fontPx}px "LenzRetro Pixel", "VT323", monospace`;
      ctx2.textBaseline = "top";
      for (let i = 0; i < cols; i++) {
        const y = drops[i];
        if (y >= 0) {
          const ch = CHARS[Math.floor(Math.random() * CHARS.length)];
          ctx2.fillStyle = "#ffe2a8";
          ctx2.fillText(ch, i * fontPx, y * fontPx);
          ctx2.fillStyle = "rgba(255, 176, 0, 0.9)";
          ctx2.fillText(CHARS[Math.floor(Math.random() * CHARS.length)], i * fontPx, (y - 1) * fontPx);
        }
        drops[i] = y * fontPx > canvas.height && Math.random() > 0.975 ? -Math.floor(Math.random() * 20) : y + (reduced ? 0.5 : 1);
      }
      flashTitle(Date.now());
    }
    function flashTitle(t) {
      if (!titleEl || t < nextFlash) return;
      const titles = (() => {
        try {
          return getTitles();
        } catch {
          return [];
        }
      })();
      const pool = ["LENZ//84", ...titles.slice(0, 20)];
      titleEl.textContent = Math.random() < 0.4 ? pool[0] : pool[Math.floor(Math.random() * pool.length)];
      titleEl.classList.remove("is-flash");
      void titleEl.offsetWidth;
      titleEl.classList.add("is-flash");
      nextFlash = t + 5e3 + Math.random() * 4e3;
    }
    function onResize2() {
      size();
    }
    function onVisibility() {
      if (!active5) return;
      if (document.hidden) {
        cancelAnimationFrame(raf3);
        raf3 = 0;
      } else if (!raf3) raf3 = requestAnimationFrame(frame);
    }
    function swallow(e) {
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }
    function onActiveInput(e) {
      if (!active5) return;
      if (e.type === "pointermove" || e.type === "mousemove") {
        const p = { x: e.clientX, y: e.clientY };
        if (!lastMove) {
          lastMove = p;
          return;
        }
        if (Math.abs(p.x - lastMove.x) + Math.abs(p.y - lastMove.y) < 12) return;
      } else if (e.type !== "wheel") {
        swallow(e);
        swallowClickUntil = Date.now() + 600;
      }
      end();
    }
    function onClickGuard(e) {
      if (Date.now() < swallowClickUntil) swallow(e);
    }
    const activeEvents = ["keydown", "pointerdown", "mousedown", "touchstart", "wheel", "pointermove"];
    function run(manual = true) {
      if (active5) return true;
      if (typeof requestAnimationFrame !== "function") return false;
      canvas = h("canvas", { class: "lfx-retro-rain__canvas" });
      let c;
      try {
        c = canvas.getContext("2d");
      } catch {
        c = null;
      }
      if (!c) {
        canvas = null;
        return false;
      }
      ctx2 = c;
      titleEl = h("div", { class: "lfx-retro-rain__title", "aria-hidden": "true" });
      el4 = h("div", { id: RAIN_ID, class: "lfx-retro-rain", role: "presentation", "aria-hidden": "true" }, [canvas, titleEl]);
      document.body.append(el4);
      active5 = true;
      lastMove = null;
      nextFlash = Date.now() + 1500;
      size();
      for (const ev of activeEvents) window.addEventListener(ev, onActiveInput, { capture: true, passive: false });
      window.addEventListener("resize", onResize2);
      document.addEventListener("visibilitychange", onVisibility);
      raf3 = requestAnimationFrame(frame);
      try {
        onStart(manual);
      } catch {
      }
      return true;
    }
    function end() {
      if (!active5) return;
      active5 = false;
      if (raf3) cancelAnimationFrame(raf3);
      raf3 = 0;
      for (const ev of activeEvents) window.removeEventListener(ev, onActiveInput, true);
      window.removeEventListener("resize", onResize2);
      document.removeEventListener("visibilitychange", onVisibility);
      if (el4) el4.remove();
      el4 = canvas = ctx2 = titleEl = null;
      drops = [];
      lastInput = Date.now();
      try {
        onStop();
      } catch {
      }
    }
    function check3() {
      if (active5 || document.hidden) return;
      if (reduced) return;
      if (Date.now() - lastInput < idleMs) return;
      if (isBlocked()) {
        lastInput = Date.now() - idleMs + 15e3;
        return;
      }
      run(false);
    }
    function start10() {
      if (started2) return;
      started2 = true;
      lastInput = Date.now();
      for (const ev of idleEvents) window.addEventListener(ev, noteInput, { capture: true, passive: true });
      window.addEventListener("click", onClickGuard, true);
      timers.interval(check3, 5e3);
    }
    function stop7() {
      end();
      if (started2) {
        for (const ev of idleEvents) window.removeEventListener(ev, noteInput, true);
        window.removeEventListener("click", onClickGuard, true);
      }
      started2 = false;
      swallowClickUntil = 0;
      timers.clearAll();
    }
    return { start: start10, stop: stop7, run, end, isActive: () => active5 };
  }

  // src/js/features/retro/fx/index.js
  var OVERDRIVE_MS = 2e4;
  var LONG_PRESS_MS2 = 700;
  var TAP_COUNT = 7;
  var TOAST_ID = "lfx-retro-od-toast";
  var S = null;
  function shouldRun(route) {
    if (!isTheme("retro") || !isModern() || isTv() || !isReady()) return false;
    if (document.body && document.body.classList.contains("dashboardDocument")) return false;
    return !isPlayerVisible(route);
  }
  function logoOf(e) {
    const t = e.target;
    return t && t.closest ? t.closest(`[${LOGO_ATTR}]`) : null;
  }
  function mount() {
    if (S) return;
    const reduced = prefersReducedMotion();
    const timers = createTimers();
    const crt = createCrt();
    const sound = createSound(() => getPref("sound"));
    const seq3 = createSequence();
    const taps = createTapCounter({ gap: 400 });
    const html2 = document.documentElement;
    S = { timers, crt, sound, reduced, boot: null, overdriveTimer: 0, pressTimer: 0, pressX: 0, pressY: 0, suppressClickUntil: 0, listeners: [] };
    const listen = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      S.listeners.push(() => target.removeEventListener(type, fn, opts));
    };
    const unlockSound = () => sound.unlock();
    function endOverdrive() {
      html2.classList.remove(OVERDRIVE_CLASS);
      const t = document.getElementById(TOAST_ID);
      if (t) t.remove();
      if (S) S.overdriveTimer = 0;
    }
    function overdrive() {
      if (!S) return;
      html2.classList.add(OVERDRIVE_CLASS);
      let toast2 = document.getElementById(TOAST_ID);
      if (toast2) toast2.remove();
      toast2 = h("div", { id: TOAST_ID, class: "lfx-retro-od-toast", role: "status" }, ">> OVERDRIVE AKTIVIERT <<");
      document.body.append(toast2);
      timers.timeout(() => {
        if (toast2.isConnected) toast2.remove();
      }, 3600);
      crt.shake();
      sound.play("jingle");
      if (S.overdriveTimer) timers.clear(S.overdriveTimer);
      S.overdriveTimer = timers.timeout(endOverdrive, OVERDRIVE_MS);
    }
    function startBoot() {
      if (S.boot) S.boot.cancel();
      markBooted();
      S.boot = runBoot({
        reduced,
        getName: async () => (await getUserChip({ retries: 0 })).name,
        onSound: (n) => sound.play(n),
        onDone: () => {
          if (S) S.boot = null;
        }
      });
    }
    const screensaver = createScreensaver({
      reduced,
      isBlocked: () => Boolean(S.boot) || terminal.isOpen() || isDialogOpen() || isVideoPlaying() || isPlayerVisible(currentRoute()),
      getTitles: () => {
        const names = [];
        for (const c of document.querySelectorAll(".lfx-card[data-lfx-id]")) {
          const it = getStoredItem(c.getAttribute("data-lfx-id"));
          if (it && it.Name) names.push(String(it.Name).toUpperCase());
          if (names.length >= 20) break;
        }
        return names;
      },
      onStart: () => sound.startRain(),
      onStop: () => sound.stopRain()
    });
    const glitch = createGlitch({ crt, enabled: () => !reduced });
    const terminal = createTerminal({
      userName: async () => (await getUserChip({ retries: 0 })).name,
      libraries: () => getLibraries(),
      searchTitles: async (q) => {
        const r = await searchItems(q, { limit: 10 });
        const all = [...r.movies, ...r.series];
        putItems(all);
        return all.map((i) => ({ id: i.Id, name: i.Name, year: i.ProductionYear || null }));
      },
      randomTitle: async () => {
        const res = await getItems({ IncludeItemTypes: "Movie", Recursive: true, SortBy: "Random", Limit: 1, EnableUserData: false });
        const it = res && Array.isArray(res.Items) ? res.Items[0] : null;
        if (!it) return null;
        putItems([it]);
        return { id: it.Id, name: it.Name };
      },
      setTheme: (id) => setTheme(id, { source: "user" }),
      themeName: (id) => brandName(id),
      themes: THEMES,
      currentTheme: () => getTheme(),
      getPref,
      setPref,
      unlockSound,
      regen: () => screensaver.run(true),
      overdrive,
      reboot: () => {
        clearBooted();
        if (S) startBoot();
      },
      now: () => /* @__PURE__ */ new Date(),
      searchHref,
      titleHref
    });
    Object.assign(S, { terminal, screensaver, glitch, endOverdrive });
    listen(document, "keydown", (e) => {
      if (!S || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditable(e.target) || S.boot || terminal.isOpen() || isDialogOpen()) return;
      if (e.code === "Backquote" && !e.repeat) {
        e.preventDefault();
        terminal.open();
        return;
      }
      if (e.repeat) return;
      if (seq3.feed(e.key)) overdrive();
    });
    const cancelPress2 = () => {
      if (S.pressTimer) {
        timers.clear(S.pressTimer);
        S.pressTimer = 0;
      }
    };
    listen(document, "pointerdown", (e) => {
      if (e.button > 0) return;
      const logo = logoOf(e);
      if (!logo) return;
      if (taps.tap() >= TAP_COUNT) {
        taps.reset();
        cancelPress2();
        S.suppressClickUntil = Date.now() + 700;
        overdrive();
        return;
      }
      S.pressX = e.clientX;
      S.pressY = e.clientY;
      cancelPress2();
      S.pressTimer = timers.timeout(() => {
        S.pressTimer = 0;
        taps.reset();
        S.suppressClickUntil = Date.now() + 1500;
        terminal.open();
      }, LONG_PRESS_MS2);
    }, true);
    listen(document, "pointermove", (e) => {
      if (S.pressTimer && Math.abs(e.clientX - S.pressX) + Math.abs(e.clientY - S.pressY) > 12) cancelPress2();
    }, { capture: true, passive: true });
    for (const type of ["pointerup", "pointercancel"]) listen(document, type, cancelPress2, true);
    listen(document, "click", (e) => {
      if (!logoOf(e)) return;
      if (Date.now() < S.suppressClickUntil || taps.count >= 2) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);
    listen(document, "contextmenu", (e) => {
      if (logoOf(e) && (S.pressTimer || Date.now() < S.suppressClickUntil)) e.preventDefault();
    }, true);
    const gesture = () => {
      if (S && getPref("sound") && !sound.isRunning()) sound.unlock();
    };
    for (const type of ["pointerdown", "keydown", "click", "touchend"]) listen(document, type, gesture, { capture: true, passive: true });
    listen(document, FX_EVENT, (e) => {
      const name = e.detail && e.detail.name;
      if (name) sound.play(name === "hover" ? "blip" : name);
    });
    listen(window, "hashchange", () => sound.play("nav"));
    listen(document, "visibilitychange", () => {
      if (document.hidden) sound.suspend();
    });
    listen(document, PREFS_EVENT, (e) => {
      const d = e.detail || {};
      if (d.name === "crt") crt.sync(d.value);
      else if (d.name === "sound") {
        if (d.value) {
          sound.unlock();
          timers.timeout(() => sound.play("click"), 80);
        } else sound.suspend();
      }
    });
    crt.sync(getPref("crt"));
    if (!hasBooted()) startBoot();
    if (!reduced) glitch.start();
    screensaver.start();
  }
  function unmount() {
    if (!S) return;
    const s = S;
    S = null;
    for (const off of s.listeners) off();
    s.timers.clearAll();
    if (s.boot) s.boot.cancel();
    s.glitch.stop();
    s.screensaver.stop();
    s.terminal.destroy();
    s.sound.suspend();
    s.crt.unmount();
    s.endOverdrive();
    const html2 = document.documentElement;
    html2.classList.remove(OVERDRIVE_CLASS, NO_CRT_CLASS, "lfx-retro-term-open");
    for (const id of ["lfx-retro-crt", "lfx-retro-boot", "lfx-retro-terminal", "lfx-retro-rain", TOAST_ID]) {
      const el4 = document.getElementById(id);
      if (el4) el4.remove();
    }
  }
  var fx_default = {
    name: "retro-fx",
    match: (route) => shouldRun(route),
    mount,
    update() {
    },
    unmount
  };

  // src/js/features/retro/index.js
  var retroFeatures = [header_default3, tabbar_default3, home_default4, title_default3, search_default2, browse_default2, nativedetail_default3, fx_default];

  // src/js/features/store/departments.js
  var NEW_DAYS3 = 14;
  var NEW_MAX = 24;
  var MIN_SERIES_GENRE = 6;
  var MIN_MOVIE_GENRE = 8;
  var HIGHLIGHT_MAX = 8;
  var HIGHLIGHT_RATING = 7.5;
  var DAY_MS2 = 864e5;
  var ADULT = /* @__PURE__ */ new Set(["FSK-18", "18", "DE-18", "NC-17", "X", "R18", "R18+", "AO"]);
  var KIDS_GENRES = /* @__PURE__ */ new Set(["animation", "familie", "kids", "kinder"]);
  var KIDS_RATINGS = /* @__PURE__ */ new Set(["FSK-0", "FSK-6", "0", "6", ""]);
  var NEON = ["#ff3d7f", "#00e5ff", "#7cff3d", "#ffa826", "#b455ff", "#3d7bff", "#ff5a3d", "#2affb2", "#ff4df0", "#e8ff3d"];
  var FIXED = { new: "#ffd23f", kids: "#4dd2ff", adult: "#ff2a3a", misc: "#c7cde8", "series-misc": "#aab4ff" };
  var norm2 = (s) => String(s == null ? "" : s).trim();
  var sortKey = (it) => norm2(it.SortName || it.Name).toLowerCase();
  var byName = (a, b) => sortKey(a).localeCompare(sortKey(b), "de");
  function isAdult(item) {
    return ADULT.has(norm2(item && item.OfficialRating).toUpperCase());
  }
  function isKids(item) {
    if (isAdult(item)) return false;
    const genres = (item && item.Genres || []).map((g) => norm2(g).toLowerCase());
    if (!genres.some((g) => KIDS_GENRES.has(g))) return false;
    return KIDS_RATINGS.has(norm2(item.OfficialRating).toUpperCase());
  }
  function mediaOf(item) {
    if (item.Type === "Series") return "box";
    const y = Number(item.ProductionYear);
    return y > 0 && y < 2e3 ? "vhs" : "dvd";
  }
  function isNewItem(item, now) {
    const t = Date.parse(item.DateCreated || "");
    if (!Number.isFinite(t)) return false;
    const age = now - t;
    return age >= 0 && age < NEW_DAYS3 * DAY_MS2;
  }
  function progressOf2(item) {
    const ud = item.UserData || {};
    if (ud.PlayedPercentage > 0) return Math.min(1, ud.PlayedPercentage / 100);
    if (ud.PlaybackPositionTicks > 0 && item.RunTimeTicks > 0) return Math.min(1, ud.PlaybackPositionTicks / item.RunTimeTicks);
    return 0;
  }
  function decorate(item, now) {
    const ud = item.UserData || {};
    return { ...item, lfx: { media: mediaOf(item), isNew: isNewItem(item, now), progress: progressOf2(item), watched: Boolean(ud.Played) } };
  }
  function hash(str) {
    let h2 = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h2 ^= str.charCodeAt(i);
      h2 = Math.imul(h2, 16777619);
    }
    return h2 >>> 0;
  }
  function departmentColor(id, kind2) {
    return FIXED[id] || FIXED[kind2] || NEON[hash(String(id)) % NEON.length];
  }
  function dept(id, label, kind2, list) {
    return { id, label, kind: kind2, color: departmentColor(id, kind2), itemIds: [...list].sort(byName).map((i) => i.Id) };
  }
  function groupByGenre(list, min) {
    const groups = /* @__PURE__ */ new Map();
    const rest = [];
    for (const it of list) {
      const g = norm2((it.Genres || [])[0]);
      if (!g) {
        rest.push(it);
        continue;
      }
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(it);
    }
    const big = [];
    for (const [g, arr] of groups) {
      if (arr.length >= min) big.push([g, arr]);
      else rest.push(...arr);
    }
    big.sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "de"));
    return { big, rest };
  }
  function buildCatalog({ items = [], resume = [], favorites = [], now = Date.now() } = {}) {
    const t = now instanceof Date ? now.getTime() : Number(now);
    const map = /* @__PURE__ */ new Map();
    for (const raw of items) {
      if (!raw || !raw.Id || raw.Type !== "Movie" && raw.Type !== "Series" || map.has(raw.Id)) continue;
      map.set(raw.Id, decorate(raw, t));
    }
    const all = [...map.values()];
    const adult = all.filter(isAdult);
    const rest = all.filter((i) => !isAdult(i));
    const kids = rest.filter(isKids);
    const normal = rest.filter((i) => !isKids(i));
    const series = normal.filter((i) => i.Type === "Series");
    const movies = normal.filter((i) => i.Type === "Movie");
    const departments = [];
    const fresh = rest.filter((i) => i.lfx.isNew).sort((a, b) => Date.parse(b.DateCreated) - Date.parse(a.DateCreated)).slice(0, NEW_MAX);
    if (fresh.length) departments.push(dept("new", "Neuheiten", "new", fresh));
    if (kids.length) departments.push(dept("kids", "Kinder", "kids", kids));
    const mg = groupByGenre(movies, MIN_MOVIE_GENRE);
    for (const [g, arr] of mg.big) departments.push(dept(`genre-${g}`, g, "genre", arr));
    if (mg.rest.length) departments.push(dept("misc", "Querbeet", "misc", mg.rest));
    const sg = groupByGenre(series, MIN_SERIES_GENRE);
    for (const [g, arr] of sg.big) departments.push(dept(`series-${g}`, `Serien \xB7 ${g}`, "series", arr));
    if (sg.rest.length) departments.push(dept("series-misc", "Serien \xB7 Mehr", "series", sg.rest));
    if (adult.length) departments.push(dept("adult", "Ab 18", "adult", adult));
    const link = (list) => (list || []).filter((i) => i && i.Id).map((i) => map.get(i.Id) || decorate(i, t));
    const highlights = rest.filter((i) => (i.lfx.isNew || i.CommunityRating >= HIGHLIGHT_RATING) && i.BackdropImageTags && i.BackdropImageTags.length).sort((a, b) => Number(b.lfx.isNew) - Number(a.lfx.isNew) || (b.CommunityRating || 0) - (a.CommunityRating || 0) || byName(a, b)).slice(0, HIGHLIGHT_MAX);
    const favMap = new Map(link(favorites).map((i) => [i.Id, i]));
    for (const i of all) if (i.UserData && i.UserData.IsFavorite && !favMap.has(i.Id)) favMap.set(i.Id, i);
    return { items: map, departments, resume: link(resume), favorites: [...favMap.values()], highlights };
  }

  // src/js/features/store/data.js
  var PAGE_SIZE2 = 500;
  var TTL_MS3 = 5 * 60 * 1e3;
  var FIELDS6 = "Overview,Genres,OfficialRating,ProductionYear,DateCreated,RunTimeTicks,CommunityRating,ChildCount,SortName,BackdropImageTags,PrimaryImageAspectRatio";
  var asItems11 = (res) => Array.isArray(res) ? res : res && Array.isArray(res.Items) ? res.Items : [];
  async function fetchAllTitles() {
    const out = [];
    for (let start10 = 0; ; start10 += PAGE_SIZE2) {
      const res = await getItems({
        Recursive: true,
        IncludeItemTypes: "Movie,Series",
        Fields: FIELDS6,
        EnableUserData: true,
        ImageTypeLimit: 1,
        SortBy: "SortName",
        SortOrder: "Ascending",
        StartIndex: start10,
        Limit: PAGE_SIZE2
      });
      const page2 = asItems11(res);
      out.push(...page2);
      const total = res && typeof res.TotalRecordCount === "number" ? res.TotalRecordCount : null;
      if (page2.length < PAGE_SIZE2 || total !== null && out.length >= total) break;
    }
    return out;
  }
  var soft = (p) => p.then(asItems11).catch(() => []);
  function loadCatalog2() {
    return cached(`store:catalog:${getUserId() || "anon"}`, load5, TTL_MS3);
  }
  async function load5() {
    const [items, resume, favorites] = await Promise.all([
      fetchAllTitles(),
      soft(getResume({ Limit: 12, MediaTypes: "Video", Fields: FIELDS6, EnableUserData: true, ImageTypeLimit: 1 })),
      soft(getItems({
        Recursive: true,
        Filters: "IsFavorite",
        IncludeItemTypes: "Movie,Series",
        Fields: FIELDS6,
        EnableUserData: true,
        ImageTypeLimit: 1,
        SortBy: "SortName"
      }))
    ]);
    putItems(items);
    putItems(resume);
    putItems(favorites);
    return buildCatalog({ items, resume, favorites, now: Date.now() });
  }

  // src/js/features/store/hud.js
  var svg10 = (p) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${p}</svg>`;
  var ICONS8 = {
    search: svg10('<path d="M10 3a7 7 0 1 0 4.2 12.6l4.6 4.6 1.4-1.4-4.6-4.6A7 7 0 0 0 10 3zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"/>'),
    classic: svg10('<path d="M3 4h8v7H3zm10 0h8v7h-8zM3 13h8v7H3zm10 0h8v7h-8z"/>'),
    enter: svg10('<path d="M4 3h9v2H6v14h7v2H4zm11.6 5.4L21.2 12l-5.6 3.6V13H9v-2h6.600z"/>')
  };
  function buttonKids(label, icon5) {
    const ic = h("span", { class: "lfx-store-btn__icon", "aria-hidden": "true" });
    ic.innerHTML = ICONS8[icon5] || "";
    return [ic, h("span", { class: "lfx-store-btn__text" }, label)];
  }
  function hudButton(cls, label, icon5) {
    return h("button", { type: "button", class: `lfx-store-btn ${cls}`, "aria-label": label, title: label }, buttonKids(label, icon5));
  }
  function hudLink(cls, label, icon5, href) {
    return h("a", { class: `lfx-store-btn ${cls}`, href, "aria-label": label, title: label }, buttonKids(label, icon5));
  }
  function wordmark(tag = "span") {
    return h(tag, { class: "lfx-store-mark" }, [
      h("span", { class: "lfx-store-mark__a" }, "VIDEOTHEK"),
      h("span", { class: "lfx-store-mark__b" }, "LENZ")
    ]);
  }
  var PROFILE_CLASS = "lfx-store-profile";
  var busy = false;
  function profileIsOpen3() {
    const el4 = document.getElementById("lfx-popover");
    return isPopoverOpen() && Boolean(el4 && el4.classList.contains(PROFILE_CLASS));
  }
  function closeProfileMenu() {
    if (profileIsOpen3()) closePopover();
  }
  async function toggleProfileMenu(anchor) {
    if (profileIsOpen3()) {
      closePopover({ restoreFocus: true });
      return;
    }
    if (busy) return;
    busy = true;
    try {
      const items = await profileEntries({ theme: "store", returnFocus: anchor });
      if (!anchor.isConnected) return;
      openPopover(anchor, { label: "Profil", items, align: "end", className: PROFILE_CLASS });
    } finally {
      busy = false;
    }
  }
  function profileButton() {
    let alive = true;
    const btn3 = h("button", { type: "button", class: "lfx-store-avatar", "aria-label": "Profil", "aria-haspopup": "true" }, [
      h("span", { class: "lfx-store-avatar__initial", "aria-hidden": "true" }, "?")
    ]);
    btn3.addEventListener("click", () => toggleProfileMenu(btn3));
    getUserChip({ retries: 20, isAlive: () => alive }).then((chip) => {
      if (!alive) return;
      btn3.replaceChildren();
      if (chip.imageUrl) btn3.append(h("img", { src: chip.imageUrl, alt: "", draggable: "false" }));
      else btn3.append(h("span", { class: "lfx-store-avatar__initial", "aria-hidden": "true" }, (chip.name || "?").trim().charAt(0).toUpperCase() || "?"));
      if (chip.name) btn3.setAttribute("aria-label", `Profil: ${chip.name}`);
    }).catch(() => {
    });
    return { el: btn3, destroy() {
      alive = false;
    } };
  }

  // src/js/features/store/home-route.js
  var ROOT_ID20 = "lfx-store-home";
  var ON_CLASS19 = "lfx-store-home-on";
  var BAR_ID = "lfx-store-bar";
  var BAR_CLASS = "lfx-store-bar-on";
  function storeHomeRoute(route) {
    if (!route || route.path !== "/home" || !route.params) return null;
    const lfx = route.params.get("lfx");
    if (!lfx) return route.params.get("tab") === "1" ? null : { kind: "home", id: null, q: null };
    const r = parseLfxRoute(route);
    if (r.kind === "new") return { kind: "home", id: null, q: null };
    if (r.kind === "title" && r.id) return { kind: "title", id: r.id, q: null };
    if (r.kind === "search") return { kind: "search", id: null, q: r.q || "" };
    return null;
  }
  function findHomeTab10() {
    const tab2 = document.querySelector("#indexPage:not(.hide) #homeTab");
    return tab2 && tab2.isConnected ? tab2 : null;
  }

  // src/js/features/store/prefs.js
  var KEY4 = "lfx.store.";
  var DEFAULTS3 = { quality: "auto", sound: true, fps: false, bigCovers: true, voiceOnline: false, voicePitch: "tief", touchControl: "touch" };
  var TOUCH_CONTROLS = ["joystick", "touch"];
  var TOUCH_SENS = ["low", "normal", "high"];
  var TUNE_FLAGS = ["holdInvertY", "holdInvertX", "lookFlipY", "lookFlipX"];
  var TOUCH_REGRIPS = ["off", "short", "long"];
  var VOICE_PITCHES = ["normal", "tief", "sehrtief"];
  var QUALITIES = ["auto", "low", "mid", "high"];
  var VR_TURNS = ["snap", "smooth"];
  var VR_HEIGHTS = ["auto", "seated"];
  var VR_QUALITIES = ["mid", "low"];
  var VR_SEATS = ["front", "mid", "back"];
  var SESSION_INTRO = "lfx.store.introSeen";
  var SESSION_STATE = "lfx.store.state";
  var storageKey5 = (name) => `${KEY4}${name}.${getUserId() || "anon"}`;
  function read2(store3, key) {
    try {
      return window[store3].getItem(key);
    } catch {
      return null;
    }
  }
  function write2(store3, key, value) {
    try {
      window[store3].setItem(key, value);
    } catch {
    }
  }
  function getQuality() {
    const v = read2("localStorage", storageKey5("quality"));
    return QUALITIES.includes(v) ? v : DEFAULTS3.quality;
  }
  function getSound() {
    try {
      window.localStorage.removeItem(storageKey5("sound"));
    } catch {
    }
    const v = read2("localStorage", storageKey5("soundOn"));
    return v === null ? DEFAULTS3.sound : v !== "0";
  }
  function getFps() {
    return read2("localStorage", storageKey5("fps")) === "1";
  }
  function getVoiceOnline() {
    return read2("localStorage", storageKey5("voiceOnline")) === "1";
  }
  function getVoiceName() {
    return read2("localStorage", storageKey5("voiceName")) || "";
  }
  function getVoicePitch() {
    const v = read2("localStorage", storageKey5("voicePitch"));
    return VOICE_PITCHES.includes(v) ? v : DEFAULTS3.voicePitch;
  }
  function getTouchControl() {
    const v = read2("localStorage", storageKey5("touchControl"));
    return TOUCH_CONTROLS.includes(v) ? v : DEFAULTS3.touchControl;
  }
  function getTouchTune() {
    for (const k of ["lookInvertY", "lookInvertX"]) {
      try {
        window.localStorage.removeItem(storageKey5(k));
      } catch {
      }
    }
    const t = { touchSens: readEnum("touchSens", TOUCH_SENS, "normal"), touchRegrip: readEnum("touchRegrip", TOUCH_REGRIPS, "short") };
    for (const k of TUNE_FLAGS) t[k] = read2("localStorage", storageKey5(k)) === "1";
    return t;
  }
  function getBigCovers() {
    const v = read2("localStorage", storageKey5("bigCovers"));
    return v === null ? DEFAULTS3.bigCovers : v !== "0";
  }
  function readEnum(name, list, def) {
    const v = read2("localStorage", storageKey5(name));
    return list.includes(v) ? v : def;
  }
  var getVrTurn = () => readEnum("vrTurn", VR_TURNS, "snap");
  var getVrVignette = () => read2("localStorage", storageKey5("vrVignette")) !== "0";
  var getVrHeight = () => readEnum("vrHeight", VR_HEIGHTS, "auto");
  var getVrQuality = () => readEnum("vrQuality", VR_QUALITIES, "mid");
  var getVrSeat = () => readEnum("vrSeat", VR_SEATS, "mid");
  function getVr() {
    return { turn: getVrTurn(), vignette: getVrVignette(), height: getVrHeight(), quality: getVrQuality(), seat: getVrSeat() };
  }
  function savePrefs2(p) {
    if (!p) return;
    if (QUALITIES.includes(p.quality)) write2("localStorage", storageKey5("quality"), p.quality);
    if (typeof p.sound === "boolean") write2("localStorage", storageKey5("soundOn"), p.sound ? "1" : "0");
    if (typeof p.fps === "boolean") write2("localStorage", storageKey5("fps"), p.fps ? "1" : "0");
    if (typeof p.voiceOnline === "boolean") write2("localStorage", storageKey5("voiceOnline"), p.voiceOnline ? "1" : "0");
    if (typeof p.voiceName === "string") write2("localStorage", storageKey5("voiceName"), p.voiceName);
    if (VOICE_PITCHES.includes(p.voicePitch)) write2("localStorage", storageKey5("voicePitch"), p.voicePitch);
    if (TOUCH_CONTROLS.includes(p.touchControl)) write2("localStorage", storageKey5("touchControl"), p.touchControl);
    for (const k of TUNE_FLAGS) if (typeof p[k] === "boolean") write2("localStorage", storageKey5(k), p[k] ? "1" : "0");
    if (TOUCH_SENS.includes(p.touchSens)) write2("localStorage", storageKey5("touchSens"), p.touchSens);
    if (TOUCH_REGRIPS.includes(p.touchRegrip)) write2("localStorage", storageKey5("touchRegrip"), p.touchRegrip);
    if (typeof p.bigCovers === "boolean") write2("localStorage", storageKey5("bigCovers"), p.bigCovers ? "1" : "0");
    const vr = p.vr;
    if (vr && typeof vr === "object") {
      if (VR_TURNS.includes(vr.turn)) write2("localStorage", storageKey5("vrTurn"), vr.turn);
      if (typeof vr.vignette === "boolean") write2("localStorage", storageKey5("vrVignette"), vr.vignette ? "1" : "0");
      if (VR_HEIGHTS.includes(vr.height)) write2("localStorage", storageKey5("vrHeight"), vr.height);
      if (VR_QUALITIES.includes(vr.quality)) write2("localStorage", storageKey5("vrQuality"), vr.quality);
      if (VR_SEATS.includes(vr.seat)) write2("localStorage", storageKey5("vrSeat"), vr.seat);
    }
  }
  var getIntroSeen = () => read2("sessionStorage", SESSION_INTRO) === "1";
  var setIntroSeen = () => write2("sessionStorage", SESSION_INTRO, "1");
  function getState() {
    const raw = read2("sessionStorage", SESSION_STATE);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      return s && [s.x, s.z, s.yaw, s.pitch].every((n) => Number.isFinite(n)) ? s : null;
    } catch {
      return null;
    }
  }
  function saveState(state21) {
    if (!state21 || typeof state21 !== "object") return;
    write2("sessionStorage", SESSION_STATE, JSON.stringify(state21));
  }

  // src/js/features/store/cinema-bridge.js
  function createCinemaBridge({ win = window, doc = document, pollMs = 250 } = {}) {
    let timer2 = null;
    let videoEl = null;
    let played = false;
    let seenVideoRoute = false;
    let lastPhase = null;
    let lastRoute = null;
    let lock = Promise.resolve();
    const videoFns = /* @__PURE__ */ new Set();
    const changeFns = /* @__PURE__ */ new Set();
    const cache = { audio: null, subtitle: null };
    const q = (sel) => {
      try {
        return doc.querySelector(sel);
      } catch {
        return null;
      }
    };
    const osd = (sel) => q(`[id="videoOsdPage"]:not(.hide) ${sel}`) || q(`#videoOsdPage ${sel}`) || q(sel);
    const find = () => q("video.htmlvideoplayer");
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const fire = (set, arg) => {
      for (const fn of [...set]) {
        try {
          fn(arg);
        } catch (e) {
          console.warn("[LenzFlix] cinema cb", e && e.message);
        }
      }
    };
    async function waitFor(cond, ms, step = 50) {
      const end = Date.now() + ms;
      for (; ; ) {
        let ok = false;
        try {
          ok = Boolean(cond());
        } catch {
        }
        if (ok) return true;
        if (Date.now() >= end) return false;
        await sleep(step);
      }
    }
    const finite = (n) => Number.isFinite(n) ? n : 0;
    const levelOf = (v) => {
      const vol = Math.max(0, Math.min(1, finite(Number(v.volume))));
      return Math.round(Math.cbrt(vol) * 100) / 100;
    };
    function routeOf3() {
      let hash2 = "";
      try {
        hash2 = String(win.location.hash || "");
      } catch {
      }
      const path = hash2.replace(/^#!?/, "").split("?")[0];
      if (path === "/video") return "video";
      if (path === "/home") return "home";
      return "other";
    }
    function errorDialogText() {
      try {
        for (const d of doc.querySelectorAll(".dialogContainer .dialog:not(.actionSheet)")) {
          if (d.hidden || d.classList.contains("hide")) continue;
          const cs = win.getComputedStyle(d);
          if (cs && (cs.display === "none" || cs.visibility === "hidden")) continue;
          const t = String(d.textContent || "").replace(/\s+/g, " ").trim();
          if (t) return t;
        }
      } catch {
      }
      return null;
    }
    function upNextState() {
      try {
        const el4 = osd(".upNextContainer");
        if (!el4 || el4.classList.contains("hide")) return null;
        const text = String(el4.textContent || "").replace(/\s+/g, " ").trim();
        const m = /(\d+)\s*Sek/i.exec(text) || /(\d+)/.exec(text);
        return { text, seconds: m ? Number(m[1]) : 0 };
      } catch {
        return null;
      }
    }
    const visibleBtn = (sel) => {
      const b = osd(sel);
      return Boolean(b) && !b.classList.contains("hide");
    };
    function compute() {
      const route = routeOf3();
      const v = videoEl && videoEl.isConnected !== false ? videoEl : find();
      let phase = "idle";
      let reloading = false;
      let error = null;
      if (!v) {
        if (route === "video") phase = "loading";
      } else {
        const rs = Number(v.readyState) || 0;
        if (rs >= 2) played = true;
        if (v.ended) phase = "ended";
        else if (rs < 2 && !played) phase = "loading";
        else if (rs === 0 && played) {
          phase = "loading";
          reloading = true;
        } else phase = v.paused ? "paused" : "playing";
      }
      if (phase === "loading" && !reloading && (route === "video" || v)) {
        const t = errorDialogText();
        if (t) {
          phase = "error";
          error = t;
        }
      }
      return {
        route,
        phase,
        time: v ? finite(v.currentTime) : 0,
        duration: v ? finite(v.duration) : 0,
        title: String(doc.title || ""),
        hasPrev: visibleBtn(".btnPreviousTrack"),
        hasNext: visibleBtn(".btnNextTrack"),
        upNext: upNextState(),
        error,
        volume: v ? levelOf(v) : 1,
        muted: v ? Boolean(v.muted) : false,
        reloading
      };
    }
    function poll() {
      const v = find();
      if (v !== videoEl) {
        videoEl = v;
        played = false;
        fire(videoFns, v);
      }
      const s = compute();
      if (s.route === "video") seenVideoRoute = true;
      else if (seenVideoRoute) {
        seenVideoRoute = false;
        if (s.route === "other") {
          try {
            win.location.hash = "#/home";
          } catch {
          }
        }
      }
      if (s.phase !== lastPhase || s.route !== lastRoute) {
        lastPhase = s.phase;
        lastRoute = s.route;
        fire(changeFns, s);
      }
    }
    function activate(on) {
      if (on) {
        if (timer2) return;
        timer2 = setInterval(() => {
          try {
            poll();
          } catch {
          }
        }, pollMs);
        try {
          poll();
        } catch {
        }
      } else {
        if (timer2) clearInterval(timer2);
        timer2 = null;
        videoEl = null;
        played = false;
        seenVideoRoute = false;
        lastPhase = null;
        lastRoute = null;
        cache.audio = null;
        cache.subtitle = null;
      }
    }
    const click = (sel) => {
      try {
        const b = osd(sel);
        if (b) b.click();
      } catch {
      }
    };
    const cur3 = () => videoEl || find();
    function seekTo(s) {
      try {
        const v = cur3();
        const slider = osd("input.osdPositionSlider");
        const d = v ? v.duration : NaN;
        if (slider && Number.isFinite(d) && d > 0) {
          const pct = Math.max(0, Math.min(100, Number(s) / d * 100));
          slider.value = String(pct);
          slider.dispatchEvent(new win.Event("change", { bubbles: true }));
        } else if (v && Number.isFinite(Number(s))) {
          v.currentTime = Math.max(0, Number(s));
        }
      } catch {
      }
    }
    function seekBy(d) {
      if (d === -10) return click(".btnRewind");
      if (d === 30) return click(".btnFastForward");
      const v = cur3();
      return seekTo((v ? finite(v.currentTime) : 0) + Number(d || 0));
    }
    function setVolume(val) {
      const f = Math.max(0, Math.min(1, Number(val) || 0));
      try {
        const v = cur3();
        if (v && v.muted && f > levelOf(v)) click(".buttonMute");
        const slider = osd("input.osdVolumeSlider");
        if (slider) {
          slider.value = String(Math.round(f * 100));
          slider.dispatchEvent(new win.Event("input", { bubbles: true }));
          slider.dispatchEvent(new win.Event("change", { bubbles: true }));
        } else if (v) {
          v.volume = f ** 3;
        }
      } catch {
      }
    }
    const sheetEl = () => q(".dialogContainer .actionSheet.opened") || q(".dialogContainer .actionSheet") || q(".actionSheet");
    const dialogDepth = () => {
      try {
        const d = win.history.state && win.history.state.usr && win.history.state.usr.dialogs;
        return d ? d.length : 0;
      } catch {
        return 0;
      }
    };
    const kindSel = (kind2) => kind2 === "audio" ? ".btnAudio" : ".btnSubtitles";
    async function openSheet2(kind2) {
      const btn3 = osd(kindSel(kind2));
      if (!btn3) return null;
      btn3.click();
      return await waitFor(sheetEl, 2e3) ? sheetEl() : null;
    }
    async function closeSheet() {
      if (!sheetEl()) return;
      if (dialogDepth() > 0) {
        try {
          win.history.back();
        } catch {
        }
        await waitFor(() => !sheetEl(), 2e3);
      }
    }
    function readItems(sheet) {
      const out = [];
      for (const it of sheet.querySelectorAll(".actionSheetMenuItem[data-id]")) {
        const id = it.getAttribute("data-id");
        if (id === "secondarysubtitle") continue;
        const lab = it.querySelector(".actionSheetItemText");
        const icon5 = it.querySelector(".actionsheetMenuItemIcon");
        let selected = false;
        try {
          selected = Boolean(icon5) && icon5.style.visibility !== "hidden" && !icon5.classList.contains("hide");
        } catch {
        }
        out.push({ id, label: String((lab || it).textContent || "").trim(), selected });
      }
      return out;
    }
    async function readTracks(kind2) {
      const sheet = await openSheet2(kind2);
      if (!sheet) return cache[kind2] || [];
      const list = readItems(sheet);
      await closeSheet();
      cache[kind2] = list;
      return list;
    }
    async function pick(kind2, id) {
      const sheet = await openSheet2(kind2);
      if (!sheet) return false;
      const item = [...sheet.querySelectorAll(".actionSheetMenuItem[data-id]")].find((it) => it.getAttribute("data-id") === String(id));
      if (!item) {
        await closeSheet();
        return false;
      }
      item.click();
      await waitFor(() => !sheetEl(), 2e3);
      if (cache[kind2]) cache[kind2] = cache[kind2].map((t) => ({ ...t, selected: t.id === String(id) }));
      return true;
    }
    async function select(kind2, id) {
      let prevSub = null;
      if (kind2 === "audio") {
        const subs = await readTracks("subtitle");
        const s = subs.find((t) => t.selected);
        if (s && s.id !== "-1") prevSub = s.id;
      }
      if (!await pick(kind2, id)) return false;
      if (kind2 === "audio") {
        const v = cur3();
        if (v) {
          await waitFor(() => (Number(v.readyState) || 0) < 2, 1e3);
          await waitFor(() => (Number(v.readyState) || 0) >= 2, 15e3, 100);
        }
        if (prevSub !== null) await pick("subtitle", prevSub);
      }
      return true;
    }
    const queued = (fn) => {
      const run = lock.then(fn, fn);
      lock = run.then(() => void 0, () => void 0);
      return run;
    };
    function subtitles() {
      try {
        const v = cur3();
        if (v && v.textTracks) {
          for (const tr of v.textTracks) {
            if (tr.mode !== "showing") continue;
            const cues = tr.activeCues ? [...tr.activeCues] : [];
            const text2 = cues.map((c) => String(c.text || "")).join("\n").replace(/‎/g, "").replace(/<[^>]+>/g, "").trim();
            return { kind: "text", text: text2 };
          }
        }
        const canvas = q(".libassjs-canvas");
        if (canvas && canvas.isConnected !== false && canvas.width > 0 && canvas.height > 0) return { kind: "canvas", canvas };
        const inner = q(".videoSubtitles .videoSubtitlesInner");
        const text = inner ? String(inner.textContent || "").replace(/‎/g, "").trim() : "";
        if (text) return { kind: "text", text };
      } catch {
      }
      return null;
    }
    async function stop7() {
      if (routeOf3() !== "video" && !find()) {
        if (routeOf3() !== "home") {
          try {
            win.location.hash = "#/home";
          } catch {
          }
        }
        return true;
      }
      try {
        const b = q(".skinHeader .headerBackButton");
        if (b) b.click();
        else win.history.back();
      } catch {
      }
      if (!await waitFor(() => routeOf3() !== "video", 5e3, 100)) return false;
      if (routeOf3() !== "home") {
        try {
          win.location.hash = "#/home";
        } catch {
        }
      }
      return true;
    }
    function dispose7() {
      activate(false);
      videoFns.clear();
      changeFns.clear();
    }
    return {
      activate,
      state: compute,
      video: cur3,
      onVideo: (fn) => {
        videoFns.add(fn);
        return () => videoFns.delete(fn);
      },
      onChange: (fn) => {
        changeFns.add(fn);
        return () => changeFns.delete(fn);
      },
      subtitles,
      togglePause: () => click(".btnPause"),
      seekBy,
      seekTo,
      next: () => click(".btnNextTrack"),
      prev: () => click(".btnPreviousTrack"),
      setVolume,
      toggleMute: () => click(".buttonMute"),
      tracks: (kind2) => queued(() => readTracks(kind2)),
      selectTrack: (kind2, id) => queued(() => select(kind2, id)),
      upNext: (action) => click(action === "start" ? ".btnStartNow" : ".btnHide"),
      stop: stop7,
      dispose: dispose7
    };
  }

  // src/js/features/store/stage-park.js
  var PARK_ID = "lfx-store-park";
  var stageEl = null;
  function parkStage(stage) {
    if (!stage) return;
    unparkStage();
    const box = document.createElement("div");
    box.id = PARK_ID;
    box.setAttribute("style", "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;z-index:-1");
    box.appendChild(stage);
    document.body.appendChild(box);
    stageEl = stage;
  }
  function unparkStage() {
    const el4 = stageEl;
    stageEl = null;
    const box = document.getElementById(PARK_ID);
    if (box) box.remove();
    return el4;
  }

  // src/js/features/store/home.js
  var SUSPEND_MS = 3 * 60 * 1e3;
  var CLASSIC_HASH = "#/home?lfx=classic";
  var FADE_MS2 = 450;
  var gen6 = 0;
  var waitTimer8 = null;
  var fadeTimer = null;
  var inst2 = null;
  var ui2 = null;
  var lastKey2 = null;
  var shown = false;
  var root5 = () => document.documentElement;
  var bridge = null;
  var xr = { presenting: false, cinema: false };
  var getBridge = () => bridge || (bridge = createCinemaBridge());
  function isPresenting() {
    if (!xr.presenting || !inst2 || !inst2.instance) return false;
    try {
      return typeof inst2.instance.isXr === "function" && Boolean(inst2.instance.isXr());
    } catch {
      return false;
    }
  }
  function releaseParked() {
    const cur3 = inst2;
    if (!cur3 || !cur3.parked) return;
    cur3.parked = false;
    try {
      cur3.instance.suspend();
    } catch (e) {
      console.warn("[LenzFlix] store suspend", e && e.message);
    }
    unparkStage();
    clearTimeout(cur3.disposeTimer);
    cur3.disposeTimer = setTimeout(disposeInstance2, SUSPEND_MS);
    if (bridge) bridge.activate(false);
  }
  function onXr(s) {
    xr.presenting = Boolean(s && s.presenting);
    xr.cinema = xr.presenting && Boolean(s.cinema);
    if (!xr.presenting && inst2 && inst2.parked) {
      releaseParked();
      return;
    }
    if (xr.cinema) getBridge().activate(true);
    else if (bridge) bridge.activate(false);
  }
  function hasWebGL() {
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") || c.getContext("webgl");
      if (!gl) return false;
      try {
        const ext = gl.getExtension && gl.getExtension("WEBGL_lose_context");
        if (ext) ext.loseContext();
      } catch {
      }
      return true;
    } catch {
      return false;
    }
  }
  var coarse2 = () => {
    try {
      return Boolean(window.matchMedia && window.matchMedia("(pointer:coarse)").matches);
    } catch {
      return false;
    }
  };
  function clearDisposeTimer() {
    if (inst2 && inst2.disposeTimer) {
      clearTimeout(inst2.disposeTimer);
      inst2.disposeTimer = null;
    }
  }
  function disposeInstance2() {
    const cur3 = inst2;
    if (!cur3) return;
    inst2 = null;
    clearTimeout(cur3.disposeTimer);
    if (cur3.unsubTheme) cur3.unsubTheme();
    try {
      cur3.instance.dispose();
    } catch (e) {
      console.warn("[LenzFlix] store dispose", e && e.message);
    }
    unparkStage();
    if (bridge) bridge.activate(false);
    xr.presenting = false;
    xr.cinema = false;
  }
  function setProgress2(fraction, label) {
    if (!ui2 || !ui2.fill) return;
    const f = Math.max(0, Math.min(1, Number(fraction) || 0));
    const prev2 = Number(ui2.fill.dataset.v || 0);
    const v = Math.max(prev2, f);
    ui2.fill.dataset.v = String(v);
    ui2.fill.style.width = `${Math.round(v * 100)}%`;
    ui2.loading.querySelector(".lfx-store-tape").setAttribute("aria-valuenow", String(Math.round(v * 100)));
    if (label && ui2.label) ui2.label.textContent = label;
  }
  function buildLoading() {
    const fill4 = h("div", { class: "lfx-store-tape__fill" });
    fill4.style.width = "0%";
    const label = h("p", { class: "lfx-store-loading__label", "aria-live": "polite" }, "Videothek wird aufgeschlossen \u2026");
    const loading = h("div", { class: "lfx-store-loading" }, [
      h("div", { class: "lfx-store-sign", role: "img", "aria-label": "VIDEOTHEK LENZ, Verleih und Verkauf" }, [
        h("span", { class: "lfx-store-sign__name" }, "VIDEOTHEK LENZ"),
        h("span", { class: "lfx-store-sign__sub" }, "Verleih & Verkauf")
      ]),
      h("div", { class: "lfx-store-tape", role: "progressbar", "aria-label": "Ladefortschritt", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" }, [
        h("div", { class: "lfx-store-tape__reel lfx-store-tape__reel--l", "aria-hidden": "true" }),
        h("div", { class: "lfx-store-tape__band" }, [fill4]),
        h("div", { class: "lfx-store-tape__reel lfx-store-tape__reel--r", "aria-hidden": "true" })
      ]),
      label
    ]);
    return { loading, fill: fill4, label };
  }
  function buildUi() {
    const stage = h("div", { class: "lfx-store-stage" });
    const { loading, fill: fill4, label } = buildLoading();
    const searchBtn = hudButton("lfx-store-btn--search", "Suche", "search");
    searchBtn.disabled = true;
    searchBtn.addEventListener("click", () => {
      if (inst2 && inst2.instance) inst2.instance.openTerminal("");
    });
    const classicBtn = hudButton("lfx-store-btn--classic", "Klassische Ansicht", "classic");
    classicBtn.addEventListener("click", () => {
      window.location.hash = CLASSIC_HASH;
    });
    const avatar = profileButton();
    const hud = h("div", { class: "lfx-store-hud", role: "toolbar", "aria-label": "Videothek" }, [
      wordmark(),
      h("span", { class: "lfx-store-hud__spacer" }),
      searchBtn,
      classicBtn,
      avatar.el
    ]);
    const el4 = h("div", { id: ROOT_ID20, class: "lfx-store-home" }, [stage, loading, hud]);
    return { root: el4, stage, loading, fill: fill4, label, hud, avatar, searchBtn };
  }
  function attachLoading() {
    if (!ui2) return;
    ui2.loading.remove();
    const { loading, fill: fill4, label } = buildLoading();
    ui2.root.insertBefore(loading, ui2.hud);
    ui2.loading = loading;
    ui2.fill = fill4;
    ui2.label = label;
    ui2.stage.classList.remove("is-ready");
  }
  function teardownUi2() {
    clearTimeout(fadeTimer);
    fadeTimer = null;
    closeProfileMenu();
    if (ui2) {
      ui2.avatar.destroy();
      ui2.root.remove();
    }
    ui2 = null;
    document.getElementById(ROOT_ID20)?.remove();
    root5().classList.remove(ON_CLASS19);
    shown = false;
  }
  function showFallback2(message, { retry = false, detail = "" } = {}) {
    if (!ui2) return;
    clearTimeout(fadeTimer);
    ui2.loading.remove();
    ui2.root.querySelector(".lfx-store-fallback")?.remove();
    const actions = [];
    if (retry) {
      const again = h("button", { type: "button", class: "lfx-store-fallback__btn lfx-store-fallback__btn--primary" }, "Erneut versuchen");
      again.addEventListener("click", () => retryBoot());
      actions.push(again);
    }
    const flix = h("button", { type: "button", class: `lfx-store-fallback__btn${retry ? "" : " lfx-store-fallback__btn--primary"}` }, "Zu LENZFLIX wechseln");
    flix.addEventListener("click", () => {
      setTheme("flix", { source: "user" });
    });
    const classic = h("button", { type: "button", class: "lfx-store-fallback__btn" }, "Klassische Ansicht");
    classic.addEventListener("click", () => {
      window.location.hash = CLASSIC_HASH;
    });
    actions.push(flix, classic);
    const panel = h("div", { class: "lfx-store-fallback", role: "alert" }, [
      h("div", { class: "lfx-store-fallback__box" }, [
        h("h2", { class: "lfx-store-fallback__title" }, "VIDEOTHEK LENZ"),
        h("p", { class: "lfx-store-fallback__text" }, message),
        detail ? h("p", { class: "lfx-store-fallback__detail" }, detail) : null,
        h("div", { class: "lfx-store-fallback__actions" }, actions)
      ])
    ]);
    ui2.root.insertBefore(panel, ui2.hud);
  }
  function fatalText2(err) {
    const m = err && err.message ? String(err.message) : "";
    return m.replace(/api_key=[^&\s]+/gi, "api_key=\u2026").slice(0, 200);
  }
  function applyRoute(r) {
    if (!inst2 || !inst2.instance || !r) return;
    try {
      if (r.kind === "title" && r.id) inst2.instance.openItem(r.id);
      else if (r.kind === "search") inst2.instance.openTerminal(r.q || "");
    } catch (e) {
      console.warn("[LenzFlix] store route", e && e.message);
    }
  }
  var routeKey2 = (route) => route && route.hash || "";
  async function userName() {
    try {
      const u = await getUser();
      return u && u.Name || "";
    } catch {
      return "";
    }
  }
  function buildDeps2(catalog, name, onFatal, onBigCovers) {
    const ret2 = (f) => (...a) => {
      try {
        return f(...a);
      } catch (e) {
        console.warn("[LenzFlix] store dep", e && e.message);
        return void 0;
      }
    };
    const items = (res) => Array.isArray(res) ? res : res && Array.isArray(res.Items) ? res.Items : [];
    return {
      catalog,
      user: { name },
      imageUrl: (id, o = {}) => imageUrlFor(id, o),
      getItem: (id) => getItem(id),
      getSeasons: (seriesId) => getSeasons(seriesId).then(items),
      getEpisodes: (seriesId, seasonId) => getEpisodes(seriesId, { SeasonId: seasonId, Fields: "Overview,RunTimeTicks", EnableUserData: true }).then(items),
      setFavorite: (id, v) => setFavorite(id, v),
      setPlayed: (id, v) => setPlayed(id, v),
      search: async (q, { signal } = {}) => {
        const r = await searchItems(q, { signal });
        return [...r.movies, ...r.series];
      },
      loadTrailer: async (item) => {
        try {
          let it = item;
          if (it && it.LocalTrailerCount === void 0 && it.Id) it = await getItem(it.Id);
          const t = await loadLocalTrailer(it);
          return t ? trailerUrl(t.Id) : null;
        } catch {
          return null;
        }
      },
      play: (item, o = {}) => play(item, { resume: Boolean(o.resume) }),
      toast: (text) => toast(text),
      classicView: () => {
        window.location.hash = CLASSIC_HASH;
      },
      openLibraries: () => {
        window.location.hash = CLASSIC_HASH;
      },
      openMenu: (anchor) => {
        const a = anchor || ui2 && ui2.avatar.el;
        if (a) toggleProfileMenu(a);
      },
      openSettings: () => {
        window.location.hash = "#/mypreferencesmenu";
      },
      openThemePicker: () => {
        openThemePicker({});
      },
      logout: () => logout(),
      onProgress: ret2((f, label) => setProgress2(f, label)),
      onReady: ret2(() => {
        if (!ui2) return;
        if (inst2) inst2.ready = true;
        setProgress2(1);
        ui2.searchBtn.disabled = false;
        ui2.stage.classList.add("is-ready");
        ui2.loading.classList.add("is-done");
        const el4 = ui2.loading;
        clearTimeout(fadeTimer);
        fadeTimer = setTimeout(() => {
          fadeTimer = null;
          el4.remove();
        }, FADE_MS2);
      }),
      onState: ret2((s) => saveState(s)),
      onPrefs: ret2((p) => savePrefs2(p)),
      onBigCovers: ret2((on) => onBigCovers(on)),
      onXr: ret2((s) => onXr(s)),
      cinema: getBridge(),
      onFatal: ret2(onFatal)
    };
  }
  function buildOpts2(r) {
    return {
      quality: getQuality(),
      sound: getSound(),
      showFps: getFps(),
      voiceOnline: getVoiceOnline(),
      voiceName: getVoiceName(),
      voicePitch: getVoicePitch(),
      bigCovers: getBigCovers(),
      touchControl: getTouchControl(),
      touchTune: getTouchTune(),
      vr: getVr(),
      skipIntro: getIntroSeen(),
      restore: getState(),
      openItemId: r && r.kind === "title" ? r.id : null,
      openTerminal: Boolean(r && r.kind === "search"),
      query: r && r.kind === "search" ? r.q || "" : "",
      phone: isMobile(),
      touch: coarse2(),
      debug: window.__lfxStoreDebug === true
    };
  }
  async function boot2(myGen, route) {
    if (!hasWebGL()) {
      showFallback2("Dein Browser kann die 3D-Videothek nicht darstellen.");
      return;
    }
    setProgress2(0.05, "Videothek wird aufgeschlossen \u2026");
    let loaded;
    try {
      const [ok, catalog, name] = await Promise.all([ensureThemeJs("store"), loadCatalog2(), userName()]);
      if (!ok || !window.LenzFlixStore3D) throw new Error("3D-Paket nicht geladen");
      loaded = { catalog, name };
    } catch (e) {
      if (myGen !== gen6 || !ui2) return;
      showFallback2("Die Videothek konnte nicht geladen werden.", { retry: true, detail: fatalText2(e) });
      return;
    }
    if (myGen !== gen6 || !ui2) return;
    setProgress2(0.1, "Regale werden einger\xE4umt \u2026");
    let fatal = false;
    const deps = buildDeps2(loaded.catalog, loaded.name, (err) => {
      fatal = true;
      disposeInstance2();
      showFallback2("Die 3D-Videothek konnte nicht gestartet werden.", { retry: true, detail: fatalText2(err) });
    }, (on) => rebuild(on));
    const opts = buildOpts2(route);
    setIntroSeen();
    try {
      const instance = window.LenzFlixStore3D.create(ui2.stage, deps, opts);
      if (!instance) throw new Error("create() lieferte keine Instanz");
      if (fatal || myGen !== gen6 || !ui2) {
        try {
          instance.dispose();
        } catch {
        }
        return;
      }
      const entry = { instance, ready: false, disposeTimer: null, unsubTheme: null };
      entry.unsubTheme = onThemeChange(({ theme }) => {
        if (theme !== "store") disposeInstance2();
      });
      inst2 = entry;
    } catch (e) {
      if (myGen === gen6 && ui2) showFallback2("Die 3D-Videothek konnte nicht gestartet werden.", { retry: true, detail: fatalText2(e) });
    }
  }
  function rebuild(on) {
    if (!ui2 || !inst2 || !shown) return;
    savePrefs2({ bigCovers: Boolean(on) });
    const g = gen6;
    setTimeout(() => {
      if (g !== gen6 || !ui2 || !inst2 || !shown) return;
      disposeInstance2();
      attachLoading();
      ui2.searchBtn.disabled = true;
      gen6 += 1;
      boot2(gen6, storeHomeRoute(parseCurrent()));
    }, 0);
  }
  function retryBoot() {
    if (!ui2) return;
    ui2.root.querySelector(".lfx-store-fallback")?.remove();
    attachLoading();
    gen6 += 1;
    boot2(gen6, storeHomeRoute(parseCurrent()));
  }
  function parseCurrent() {
    const hash2 = String(window.location.hash || "").replace(/^#!?/, "");
    const qi = hash2.indexOf("?");
    const path = (qi < 0 ? hash2 : hash2.slice(0, qi)) || "/home";
    return { path, params: new URLSearchParams(qi < 0 ? "" : hash2.slice(qi + 1)), hash: hash2 };
  }
  function reattachParked() {
    const stage = unparkStage();
    if (!stage || !ui2) return false;
    try {
      ui2.stage.replaceWith(stage);
      ui2.stage = stage;
      ui2.loading.remove();
      ui2.searchBtn.disabled = false;
      stage.classList.add("is-ready");
      inst2.parked = false;
      clearDisposeTimer();
      if (bridge) bridge.activate(false);
    } catch (e) {
      console.warn("[LenzFlix] store reattach", e && e.message);
      return false;
    }
    try {
      if (typeof inst2.instance.leaveCinema === "function") inst2.instance.leaveCinema("home");
    } catch (e) {
      console.warn("[LenzFlix] store leaveCinema", e && e.message);
    }
    return true;
  }
  function start8(tab2, route, myGen) {
    teardownUi2();
    ui2 = buildUi();
    tab2.prepend(ui2.root);
    root5().classList.add(ON_CLASS19);
    shown = true;
    const r = storeHomeRoute(route);
    if (inst2 && inst2.instance) {
      if (inst2.parked) {
        if (isPresenting() && reattachParked()) {
          applyRoute(r);
          return;
        }
        releaseParked();
      }
      clearDisposeTimer();
      ui2.loading.remove();
      ui2.searchBtn.disabled = false;
      ui2.stage.classList.add("is-ready");
      try {
        inst2.instance.resume(ui2.stage);
      } catch (e) {
        console.warn("[LenzFlix] store resume", e && e.message);
        disposeInstance2();
        attachLoading();
        boot2(myGen, r);
        return;
      }
      applyRoute(r);
      return;
    }
    boot2(myGen, r);
  }
  function ensure7(route) {
    clearTimeout(waitTimer8);
    const tab2 = findHomeTab10();
    const existing = document.getElementById(ROOT_ID20);
    if (tab2 && existing && tab2.contains(existing) && ui2 && shown) return;
    gen6 += 1;
    const myGen = gen6;
    let tries = 0;
    const poll = () => {
      if (myGen !== gen6) return;
      const t = findHomeTab10();
      if (t) start8(t, route, myGen);
      else if (++tries < 30) waitTimer8 = setTimeout(poll, 200);
    };
    if (tab2) poll();
    else waitTimer8 = setTimeout(poll, 200);
  }
  function destroyStore() {
    gen6 += 1;
    clearTimeout(waitTimer8);
    waitTimer8 = null;
    disposeInstance2();
    unparkStage();
    if (bridge) {
      bridge.dispose();
      bridge = null;
    }
    teardownUi2();
    lastKey2 = null;
    removeThemeJs();
  }
  var storeHome = {
    name: "store-home",
    match: (route) => isTheme("store") && isModern() && !isTv() && isReady() && Boolean(storeHomeRoute(route)),
    mount(route) {
      lastKey2 = routeKey2(route);
      ensure7(route);
    },
    update(route) {
      const key = routeKey2(route);
      const same = key === lastKey2;
      lastKey2 = key;
      if (same) {
        const tab2 = findHomeTab10();
        if (!tab2 || !ui2 || tab2.contains(ui2.root)) return;
        ensure7(route);
        return;
      }
      if (ui2 && inst2 && shown) applyRoute(storeHomeRoute(route));
      else ensure7(route);
    },
    unmount() {
      gen6 += 1;
      clearTimeout(waitTimer8);
      waitTimer8 = null;
      lastKey2 = null;
      if (inst2 && inst2.instance && !inst2.parked) {
        let parkedNow = false;
        if (isPresenting() && xr.cinema && ui2 && ui2.stage) {
          try {
            parkStage(ui2.stage);
            inst2.parked = true;
            parkedNow = true;
            clearDisposeTimer();
            getBridge().activate(true);
          } catch (e) {
            console.warn("[LenzFlix] store park", e && e.message);
            inst2.parked = false;
          }
        }
        if (!parkedNow) {
          try {
            inst2.instance.suspend();
          } catch (e) {
            console.warn("[LenzFlix] store suspend", e && e.message);
          }
          clearDisposeTimer();
          inst2.disposeTimer = setTimeout(disposeInstance2, SUSPEND_MS);
        }
      }
      teardownUi2();
    }
  };
  var home_default5 = storeHome;

  // src/js/features/store/bar.js
  var EXCLUDED12 = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video|dashboard|queue)/;
  var profile = null;
  function blocked3(route) {
    if (EXCLUDED12.test(route.path)) return true;
    if (document.body && document.body.classList.contains("dashboardDocument")) return true;
    return Boolean(document.querySelector("#videoOsdPage:not(.hide)"));
  }
  var bar_default = {
    name: "store-bar",
    match: (route) => isTheme("store") && isModern() && !isTv() && isReady() && !storeHomeRoute(route) && !blocked3(route),
    mount() {
      const el4 = mountPoint(BAR_ID, { tag: "header", className: "lfx-store-bar" });
      profile = profileButton();
      const enter = hudLink("lfx-store-btn--enter", "Videothek betreten", "enter", "#/home");
      const search = hudLink("lfx-store-btn--search", "Suche", "search", searchHref());
      const brand = h("a", { class: "lfx-store-bar__brand", href: "#/home", "aria-label": "VIDEOTHEK LENZ: Videothek betreten" }, [wordmark()]);
      el4.replaceChildren(h("div", { class: "lfx-store-bar__inner" }, [brand, h("span", { class: "lfx-store-bar__spacer" }), enter, search, profile.el]));
      document.documentElement.classList.add(BAR_CLASS);
    },
    update() {
    },
    unmount() {
      closeProfileMenu();
      if (profile) profile.destroy();
      profile = null;
      unmountPoint(BAR_ID);
      document.documentElement.classList.remove(BAR_CLASS);
    }
  };

  // src/js/features/store/index.js
  var storeFeatures = [home_default5, bar_default];

  // src/js/features/live/home-route.js
  var ROOT_ID21 = "lfx-live-home";
  var ON_CLASS20 = "lfx-live-home-on";
  function liveHomeRoute(route) {
    if (!route || route.path !== "/home" || !route.params) return false;
    if (route.params.get("lfx")) return false;
    return route.params.get("tab") !== "1";
  }
  function findHomeTab11() {
    const tab2 = document.querySelector("#indexPage:not(.hide) #homeTab");
    return tab2 && tab2.isConnected ? tab2 : null;
  }

  // src/js/features/live/leave.js
  var THEME_WAIT_MS = 3e3;
  function waitForTheme(target, ms = THEME_WAIT_MS) {
    if (getTheme() === target) return Promise.resolve(true);
    return new Promise((resolve2) => {
      let done = false;
      let off = () => {
      };
      let timer2 = null;
      const finish3 = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer2);
        off();
        resolve2(ok);
      };
      off = onThemeChange(({ theme }) => {
        if (theme === target) finish3(true);
      });
      timer2 = setTimeout(() => finish3(getTheme() === target), ms);
    });
  }
  function targetHash(theme, itemId2, { seriesId } = {}) {
    if (!itemId2) return "#/home";
    if (theme === "flix") {
      const { serverId } = getAuth();
      return `#/details?id=${encodeURIComponent(itemId2)}${serverId ? `&serverId=${encodeURIComponent(serverId)}` : ""}`;
    }
    if (theme === "plus") return titleHref(itemId2);
    return titleHref(seriesId || itemId2);
  }
  async function leaveToLibrary(itemId2, { seriesId } = {}) {
    const target = getPreviousTheme();
    try {
      await setTheme(target, { source: "user" });
    } catch (e) {
      console.warn("[LenzFlix] live leave", e && e.message ? e.message : e);
      return false;
    }
    if (!await waitForTheme(target)) return false;
    window.location.hash = targetHash(target, itemId2 || null, { seriesId });
    return true;
  }

  // src/js/features/live/prefs.js
  var KEY5 = "lfx.live.";
  var STYLES = ["flat", "crt80", "silver", "plain"];
  var DEFAULTS4 = { style: "flat", volume: 0.8, muted: false, lastChannel: 1, music: true, fx: true };
  var storageKey6 = (name) => `${KEY5}${name}.${getUserId() || "anon"}`;
  function read3(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  function write3(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
    }
  }
  function getStyle() {
    const v = read3(storageKey6("tvstyle"));
    return STYLES.includes(v) ? v : DEFAULTS4.style;
  }
  function getVolume2() {
    const raw = read3(storageKey6("volume"));
    if (raw === null || raw === "") return DEFAULTS4.volume;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : DEFAULTS4.volume;
  }
  function getMuted2() {
    return read3(storageKey6("muted")) === "1";
  }
  function getMusic() {
    return read3(storageKey6("music")) !== "0";
  }
  function getFx() {
    return read3(storageKey6("fx")) !== "0";
  }
  function getLastChannel2() {
    const v = Number(read3(storageKey6("lastChannel")));
    return Number.isInteger(v) && v >= 1 && v <= 18 ? v : DEFAULTS4.lastChannel;
  }
  function savePrefs3(p) {
    if (!p || typeof p !== "object") return;
    if (STYLES.includes(p.style)) write3(storageKey6("tvstyle"), p.style);
    if (typeof p.volume === "number" && Number.isFinite(p.volume) && p.volume >= 0 && p.volume <= 1) write3(storageKey6("volume"), String(p.volume));
    if (typeof p.muted === "boolean") write3(storageKey6("muted"), p.muted ? "1" : "0");
    if (typeof p.music === "boolean") write3(storageKey6("music"), p.music ? "1" : "0");
    if (typeof p.fx === "boolean") write3(storageKey6("fx"), p.fx ? "1" : "0");
    if (Number.isInteger(p.lastChannel) && p.lastChannel >= 1 && p.lastChannel <= 18) write3(storageKey6("lastChannel"), String(p.lastChannel));
  }

  // src/js/features/live/home.js
  var SUSPEND_MS2 = 3 * 60 * 1e3;
  var FADE_MS3 = 450;
  var CATALOG_SHARE2 = 0.65;
  var gen7 = 0;
  var waitTimer9 = null;
  var fadeTimer2 = null;
  var inst3 = null;
  var ui3 = null;
  var shown2 = false;
  var root6 = () => document.documentElement;
  var coarse3 = () => {
    try {
      return Boolean(window.matchMedia && window.matchMedia("(pointer:coarse)").matches);
    } catch {
      return false;
    }
  };
  function clearDisposeTimer2() {
    if (inst3 && inst3.disposeTimer) {
      clearTimeout(inst3.disposeTimer);
      inst3.disposeTimer = null;
    }
  }
  function disposeInstance3() {
    const cur3 = inst3;
    if (!cur3) return;
    inst3 = null;
    clearTimeout(cur3.disposeTimer);
    if (cur3.unsubTheme) cur3.unsubTheme();
    try {
      cur3.instance.dispose();
    } catch (e) {
      console.warn("[LenzFlix] live dispose", e && e.message);
    }
  }
  var pad25 = (n) => String(n).padStart(2, "0");
  function setProgress3(fraction, label) {
    if (!ui3 || !ui3.fill) return;
    const f = Math.max(0, Math.min(1, Number(fraction) || 0));
    const prev2 = Number(ui3.fill.dataset.v || 0);
    const v = Math.max(prev2, f);
    ui3.fill.dataset.v = String(v);
    ui3.fill.style.width = `${Math.round(v * 100)}%`;
    ui3.bar.setAttribute("aria-valuenow", String(Math.round(v * 100)));
    if (ui3.ch) ui3.ch.textContent = pad25(Math.max(1, Math.min(18, Math.ceil(v * 18))));
    if (label && ui3.label) ui3.label.textContent = label;
  }
  function buildLoading2() {
    const ch = h("span", { class: "lfx-live-loading__ch", "aria-hidden": "true" }, "01");
    const fill4 = h("div", { class: "lfx-live-loading__fill" });
    fill4.style.width = "0%";
    const bar = h("div", { class: "lfx-live-loading__bar", role: "progressbar", "aria-label": "Ladefortschritt", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" }, [fill4]);
    const label = h("p", { class: "lfx-live-loading__label", "aria-live": "polite" }, "Sendersuchlauf \u2026");
    const loading = h("div", { class: "lfx-live-loading" }, [
      h("div", { class: "lfx-live-loading__screen" }, [
        h("span", { class: "lfx-live-loading__tag", "aria-hidden": "true" }, "PR"),
        ch,
        h("span", { class: "lfx-live-loading__brand" }, "LENZ LIVE")
      ]),
      h("p", { class: "lfx-live-loading__title" }, "Sendersuchlauf \u2026"),
      bar,
      label
    ]);
    return { loading, fill: fill4, label, ch, bar };
  }
  function buildUi2() {
    const stage = h("div", { class: "lfx-live-stage" });
    const { loading, fill: fill4, label, ch, bar } = buildLoading2();
    const el4 = h("div", { id: ROOT_ID21, class: "lfx-live-home" }, [stage, loading]);
    return { root: el4, stage, loading, fill: fill4, label, ch, bar };
  }
  function attachLoading2() {
    if (!ui3) return;
    ui3.loading.remove();
    const { loading, fill: fill4, label, ch, bar } = buildLoading2();
    ui3.root.append(loading);
    Object.assign(ui3, { loading, fill: fill4, label, ch, bar });
  }
  function teardownUi3() {
    clearTimeout(fadeTimer2);
    fadeTimer2 = null;
    if (ui3) ui3.root.remove();
    ui3 = null;
    document.getElementById(ROOT_ID21)?.remove();
    root6().classList.remove(ON_CLASS20);
    shown2 = false;
  }
  function openDashboard() {
    window.location.hash = "#/dashboard";
  }
  function prevName() {
    const t = THEME_META[getPreviousTheme()];
    return t ? t.name : "LENZFLIX";
  }
  function showFallback3(message, { retry = false, detail = "" } = {}) {
    if (!ui3) return;
    clearTimeout(fadeTimer2);
    ui3.loading.remove();
    ui3.root.querySelector(".lfx-live-fallback")?.remove();
    const btn3 = (text, onClick, primary = false) => {
      const b = h("button", { type: "button", class: `lfx-live-fallback__btn${primary ? " lfx-live-fallback__btn--primary" : ""}` }, text);
      b.addEventListener("click", onClick);
      return b;
    };
    const actions = [];
    if (retry) actions.push(btn3("Erneut versuchen", () => retryBoot2(), true));
    actions.push(btn3("Design wechseln", () => {
      openThemePicker({});
    }, !retry));
    actions.push(btn3(`Zu ${prevName()}`, () => {
      leaveToLibrary(null);
    }));
    actions.push(btn3("Abmelden", () => logout()));
    const panel = h("div", { class: "lfx-live-fallback", role: "alert" }, [
      h("div", { class: "lfx-live-fallback__box" }, [
        h("h2", { class: "lfx-live-fallback__title" }, "LENZ LIVE"),
        h("p", { class: "lfx-live-fallback__text" }, message),
        detail ? h("p", { class: "lfx-live-fallback__detail" }, detail) : null,
        h("div", { class: "lfx-live-fallback__actions" }, actions)
      ])
    ]);
    ui3.root.append(panel);
  }
  function buildDeps3(raw, user, onFatal) {
    const ret2 = (f) => (...a) => {
      try {
        return f(...a);
      } catch (e) {
        console.warn("[LenzFlix] live dep", e && e.message);
        return void 0;
      }
    };
    return defineZapWarm({
      // Spread kopiert den Getter zapWarm nur als Wert: neu setzen
      ...buildApiDeps(raw, user),
      savePrefs: ret2((p) => savePrefs3(p)),
      leaveToLibrary: (id, meta2) => leaveToLibrary(id, meta2 || {}),
      previousThemeName: prevName(),
      openThemePicker: () => {
        openThemePicker({});
      },
      openDashboard,
      logout: () => logout(),
      toast: (text) => toast(text),
      onProgress: ret2((f, label) => setProgress3(CATALOG_SHARE2 + (1 - CATALOG_SHARE2) * (Number(f) || 0), label)),
      onReady: ret2(() => {
        if (!ui3) return;
        if (inst3) inst3.ready = true;
        setProgress3(1);
        ui3.stage.classList.add("is-ready");
        ui3.loading.classList.add("is-done");
        const el4 = ui3.loading;
        clearTimeout(fadeTimer2);
        fadeTimer2 = setTimeout(() => {
          fadeTimer2 = null;
          el4.remove();
        }, FADE_MS3);
      }),
      onFatal: ret2(onFatal)
    });
  }
  function buildOpts3() {
    return {
      style: getStyle(),
      volume: getVolume2(),
      muted: getMuted2(),
      lastChannel: getLastChannel2(),
      music: getMusic(),
      fx: getFx(),
      audioPref: null,
      phone: isMobile(),
      touch: coarse3(),
      debug: window.__lfxLiveDebug === true,
      zapStats: zapStatsEnabled(),
      now: null,
      fakePlayer: false
    };
  }
  async function boot3(myGen) {
    setProgress3(0.03, "Sendersuchlauf \u2026");
    let loaded;
    try {
      const [ok, raw, user] = await Promise.all([
        ensureThemeJs("live"),
        loadCatalog({ onProgress: (f, label) => setProgress3(0.05 + (CATALOG_SHARE2 - 0.05) * f, label) }),
        loadUser()
      ]);
      if (!ok || !window.LenzFlixLive || typeof window.LenzFlixLive.create !== "function") throw new Error("Engine-Paket nicht geladen");
      loaded = { raw, user };
    } catch (e) {
      if (myGen !== gen7 || !ui3) return;
      showFallback3("LENZ LIVE konnte nicht geladen werden.", { retry: true, detail: fatalText(e) });
      return;
    }
    if (myGen !== gen7 || !ui3) return;
    setProgress3(CATALOG_SHARE2, "Programm wird zusammengestellt \u2026");
    let fatal = false;
    const deps = buildDeps3(loaded.raw, loaded.user, (err) => {
      fatal = true;
      disposeInstance3();
      showFallback3("LENZ LIVE konnte nicht gestartet werden.", { retry: true, detail: fatalText(err) });
    });
    try {
      const instance = window.LenzFlixLive.create(ui3.stage, deps, buildOpts3());
      if (!instance) throw new Error("create() lieferte keine Instanz");
      if (fatal || myGen !== gen7 || !ui3) {
        try {
          instance.dispose();
        } catch {
        }
        return;
      }
      const entry = { instance, ready: false, disposeTimer: null, unsubTheme: null };
      entry.unsubTheme = onThemeChange(({ theme }) => {
        if (theme !== "live") disposeInstance3();
      });
      inst3 = entry;
    } catch (e) {
      if (myGen === gen7 && ui3) showFallback3("LENZ LIVE konnte nicht gestartet werden.", { retry: true, detail: fatalText(e) });
    }
  }
  function retryBoot2() {
    if (!ui3) return;
    ui3.root.querySelector(".lfx-live-fallback")?.remove();
    attachLoading2();
    gen7 += 1;
    boot3(gen7);
  }
  function start9(tab2, myGen) {
    teardownUi3();
    ui3 = buildUi2();
    tab2.prepend(ui3.root);
    root6().classList.add(ON_CLASS20);
    shown2 = true;
    if (inst3 && inst3.instance) {
      clearDisposeTimer2();
      ui3.loading.remove();
      ui3.stage.classList.add("is-ready");
      try {
        inst3.instance.resume(ui3.stage);
      } catch (e) {
        console.warn("[LenzFlix] live resume", e && e.message);
        disposeInstance3();
        attachLoading2();
        boot3(myGen);
      }
      return;
    }
    boot3(myGen);
  }
  function ensure8() {
    clearTimeout(waitTimer9);
    const tab2 = findHomeTab11();
    const existing = document.getElementById(ROOT_ID21);
    if (tab2 && existing && tab2.contains(existing) && ui3 && shown2) return;
    gen7 += 1;
    const myGen = gen7;
    let tries = 0;
    const poll = () => {
      if (myGen !== gen7) return;
      const t = findHomeTab11();
      if (t) start9(t, myGen);
      else if (++tries < 30) waitTimer9 = setTimeout(poll, 200);
    };
    if (tab2) poll();
    else waitTimer9 = setTimeout(poll, 200);
  }
  function destroyLive() {
    gen7 += 1;
    clearTimeout(waitTimer9);
    waitTimer9 = null;
    disposeInstance3();
    teardownUi3();
    removeThemeJs();
  }
  var liveHome = {
    name: "live-home",
    match: (route) => isTheme("live") && isModern() && !isTv() && isReady() && liveHomeRoute(route),
    mount() {
      ensure8();
    },
    update() {
      const tab2 = findHomeTab11();
      if (!tab2 || !ui3 || tab2.contains(ui3.root)) return;
      ensure8();
    },
    unmount() {
      gen7 += 1;
      clearTimeout(waitTimer9);
      waitTimer9 = null;
      if (inst3 && inst3.instance) {
        try {
          inst3.instance.suspend();
        } catch (e) {
          console.warn("[LenzFlix] live suspend", e && e.message);
        }
        clearDisposeTimer2();
        inst3.disposeTimer = setTimeout(disposeInstance3, SUSPEND_MS2);
      }
      teardownUi3();
    }
  };
  var home_default6 = liveHome;

  // src/js/features/live/guard.js
  var ALLOWED = ["/login", "/selectserver", "/addserver", "/startup", "/wizard", "/forgotpassword", "/resetpassword", "/video", "/queue"];
  var ALLOWED_PREFIX = ["/dashboard", "/mypreferences", "/userprofile"];
  var lastKey3 = null;
  function isAllowedRoute(route) {
    const path = route && route.path || "";
    if (path === "/home") return liveHomeRoute(route);
    if (ALLOWED.some((p) => path === p || path.startsWith(`${p}/`))) return true;
    if (ALLOWED_PREFIX.some((p) => path.startsWith(p))) return true;
    return Boolean(document.body && document.body.classList.contains("dashboardDocument"));
  }
  function replaceHome() {
    const { pathname, search } = window.location;
    window.location.replace(`${pathname}${search}#/home`);
  }
  function redirect2(route) {
    const key = route.hash;
    if (key === lastKey3) return;
    lastKey3 = key;
    replaceHome();
  }
  var liveGuard = {
    name: "live-guard",
    match: (route) => isTheme("live") && isModern() && !isTv() && isReady() && !isAllowedRoute(route),
    mount: (route) => redirect2(route),
    update: (route) => redirect2(route),
    unmount: () => {
      lastKey3 = null;
    }
  };
  var guard_default = liveGuard;

  // src/js/features/live/index.js
  var liveFeatures = [home_default6, guard_default];

  // src/js/features/index.js
  var features2 = [themeroute_default, nav_default, mobilenav_default, tvbtn_default, dsbtn_default, osdcenter_default, playerbg_default, home_default, hovercard_default, modal_default, newpopular_default, ...tvmodeFeatures, contextmenu_default, statshint_default, ...plusFeatures, ...primeFeatures, ...retroFeatures, ...storeFeatures, ...liveFeatures];

  // src/js/main.js
  var WATCH_MS = 3e3;
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
      initHomeCache();
      initUnlock();
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
      destroyHomeCache();
      destroyStore();
      destroyLive();
      destroyTvMode();
      removeAllMounts();
      destroyLayout();
      stopTheme();
    }
    function sync3() {
      if (destroyed) return;
      if (cssActive()) {
        startTheme();
        syncThemeUser();
        syncDataSaver();
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
        watchTimer = setInterval(sync3, WATCH_MS);
      }
      sync3();
    }, FAST_MS);
    window.addEventListener("hashchange", sync3);
    window.addEventListener("popstate", sync3);
    document.addEventListener("viewshow", sync3);
    sync3();
    function destroy() {
      destroyed = true;
      clearInterval(watchTimer);
      window.removeEventListener("hashchange", sync3);
      window.removeEventListener("popstate", sync3);
      document.removeEventListener("viewshow", sync3);
      stopFeatures();
      destroyDataSaver();
      destroyTheme();
      removeFavicon();
      delete window.LenzFlix;
    }
    window.LenzFlix = { version: VERSION, destroy };
  }
  init();
})();

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
    const token = call(client, "accessToken") || stored && stored.AccessToken || null;
    const serverId = call(client, "serverId") || stored && stored.Id || null;
    return { address, userId, token, serverId };
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
    const { token, address } = getAuth();
    if (token && typeof fetch === "function") {
      const res = await fetch(buildUrl(path, params), {
        headers: { Authorization: `MediaBrowser Token="${token}"`, Accept: "application/json" },
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
    const { token } = getAuth();
    const res = await fetch(buildUrl(`/Users/${userId}/FavoriteItems/${id}`), {
      method: isFavorite ? "POST" : "DELETE",
      headers: { Authorization: `MediaBrowser Token="${token}"` }
    });
    if (!res.ok) throw new Error(`LenzFlix API: HTTP ${res.status} (Favorit)`);
    return res.json();
  }
  async function setPlayed(id, played) {
    const userId = getUserId();
    const { token } = getAuth();
    const res = await fetch(buildUrl(`/Users/${userId}/PlayedItems/${id}`), {
      method: played ? "POST" : "DELETE",
      headers: { Authorization: `MediaBrowser Token="${token}"` }
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
  function evaluate(route) {
    for (const entry of [...features.values()]) {
      const { feature } = entry;
      let matched = false;
      try {
        matched = Boolean(feature.match(route));
      } catch (e) {
        console.error(`[LenzFlix] ${feature.name}.match`, e);
      }
      try {
        if (matched && !entry.mounted) {
          entry.mounted = true;
          feature.mount(route);
        } else if (matched && typeof feature.update === "function") {
          feature.update(route);
        } else if (!matched && entry.mounted) {
          entry.mounted = false;
          feature.unmount();
        }
      } catch (e) {
        console.error(`[LenzFlix] Feature ${feature.name}`, e);
      }
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

  // src/js/core/layout.js
  var root = () => document.documentElement;
  function isModern() {
    return Boolean(document.querySelector("header.MuiAppBar-root"));
  }
  function isTv() {
    return root().classList.contains("layout-tv");
  }
  function isMobile() {
    return root().classList.contains("layout-mobile") || window.innerWidth < 800;
  }
  function setClass(name, on) {
    const cl2 = root().classList;
    if (cl2.contains(name) !== on) cl2.toggle(name, on);
  }
  function applyLayoutClasses() {
    setClass("lfx-js", true);
    setClass("lfx-modern", isModern());
    setClass("lfx-tv", isTv());
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
      observer.observe(root(), { attributes: true, attributeFilter: ["class"] });
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
    root().classList.remove("lfx-js", "lfx-modern", "lfx-tv", "lfx-scrolled", "lfx-nav-on");
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

  // src/js/core/favicon.js
  var HREF = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAACKElEQVR42u3az2oTQQDH8V801SY2LUoOwryCF1/Ji4+lL+HVJ2hToo2xHqXRy0IPha40Ch6cQgjJRSo07ucLc1kYdpf5sH9getmRFoPxWZLLJJMkx0lOk8xL2/yK/rreDgG4SFLWDl8lma6gmCeZlrZZWtpuANjUzyTnFcVJHcelbX5Y7m4A2NQyyZc1FJPSNtcAdAPANhTn9VvibWmb910E0O8w/r0kL+pYJOkkgAfegt0OAAAEgAAQAAJAAAgAASAABIAAEAACQAAIAAEgAASAABAAAkAACAABIAAEgAAQAAJAAAgAASAABIAAEAACQAAIAAEgAASAABAAAkAACAABIAAEgAAQAAJAAAgAASAABIAAEAACQAAIAAEgAASAABAAAkAACAABIAAEgAAQAAJAAAgAASAABIAAEAACQAAAIAAEgAAQAAJAAAiArvV8MRg/6+KN93blQheD8UWS8o9Pc5lkluRTHSdJpqVtrgDoBoBtfa8gZitAJqVtrgHoBoBNLZN8TfI5yVmFMU/yobTNDQD/P4Bt3aw8KWZJPiY5LW3z7T5ebN/33533KMnLOm57k+SVvwABIAAEgAAQAAJAAAgAASAABIAAEAACQAAIAAEgABR7ApPkdZJRksMke0kOkjxOMkwySLKf5Ek9Nqr3dlSRH9U5o5W52iUApW3e5W53Ge9XOMOKZ1jxHObPbumnSR5WPP2KZx3c7dyDCmsVXH8F673tN5bcY1gLzpx6AAAAAElFTkSuQmCC";
  var ATTR = "data-lfx-orig";
  var created = null;
  var patched = [];
  function applyFavicon() {
    if (!document.head || created) return;
    patched = [...document.head.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')];
    for (const l of patched) {
      l.setAttribute(ATTR, l.getAttribute("href") ?? "");
      l.setAttribute("href", HREF);
      l.setAttribute("type", "image/png");
      l.removeAttribute("sizes");
    }
    created = document.createElement("link");
    created.id = "lfx-favicon";
    created.rel = "icon";
    created.type = "image/png";
    created.href = HREF;
    document.head.append(created);
  }
  function removeFavicon() {
    created?.remove();
    created = null;
    for (const l of patched) {
      if (l.hasAttribute(ATTR)) {
        l.setAttribute("href", l.getAttribute(ATTR));
        l.removeAttribute(ATTR);
      }
    }
    patched = [];
  }

  // src/js/core/csscheck.js
  function cssActive() {
    try {
      return getComputedStyle(document.documentElement).getPropertyValue("--lfx-css").trim() === "1";
    } catch {
      return false;
    }
  }

  // src/js/core/stats.js
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

  // src/js/core/ambient.js
  var ID = "lfx-ambient";
  var clamp = (n) => Math.max(0, Math.min(255, Math.round(Number(n) || 0)));
  var current = null;
  function setAmbient(r, g, b) {
    const [R, G, B] = [clamp(r), clamp(g), clamp(b)];
    current = [R, G, B];
    const s = document.documentElement.style;
    s.setProperty("--lfx-ambient-r", String(R));
    s.setProperty("--lfx-ambient-g", String(G));
    s.setProperty("--lfx-ambient-b", String(B));
    s.setProperty("--lfx-ambient", `${R} ${G} ${B}`);
  }
  function resetAmbient() {
    current = null;
    const s = document.documentElement.style;
    for (const p of ["--lfx-ambient-r", "--lfx-ambient-g", "--lfx-ambient-b", "--lfx-ambient"]) s.removeProperty(p);
  }
  function mountAmbient() {
    return mountPoint(ID, { before: document.body.firstChild, className: "lfx-ambient" });
  }
  function unmountAmbient() {
    unmountPoint(ID);
    resetAmbient();
  }

  // src/js/features/nav.js
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
  var state = {
    nav: null,
    model: { series: null, movies: null, more: [] },
    route: null,
    cleanups: [],
    menuOpen: false,
    seq: 0
  };
  function setMenu(open2) {
    state.menuOpen = open2;
    const wrap = state.nav && state.nav.querySelector(".lfx-nav__more");
    if (!wrap) return;
    wrap.classList.toggle("is-open", open2);
    const btn = wrap.querySelector(".lfx-nav__more-btn");
    if (btn) btn.setAttribute("aria-expanded", String(open2));
  }
  function applyActive() {
    if (!state.nav || !state.route) return;
    const key = activeKey(state.route, state.model);
    for (const el of state.nav.querySelectorAll("[data-key]")) {
      const on = el.dataset.key === key;
      el.classList.toggle("is-active", on);
      if (el.tagName === "A") {
        if (on) el.setAttribute("aria-current", "page");
        else el.removeAttribute("aria-current");
      }
    }
  }
  function render() {
    const nav = state.nav;
    if (!nav) return;
    nav.textContent = "";
    for (const it of navItems(state.model)) {
      nav.append(h("a", { class: "lfx-nav__item", href: it.href, dataset: { key: it.key } }, it.label));
    }
    const more = state.model.more;
    const statsUrl = getStatsUrl();
    if (more.length || statsUrl) {
      const entries = more.map((m) => h("a", { class: "lfx-nav__menu-item", role: "menuitem", href: m.href, dataset: { id: m.id } }, m.label));
      if (statsUrl) entries.push(h("a", { class: "lfx-nav__menu-item lfx-nav__menu-item--stats", role: "menuitem", href: statsUrl }, STATS_LABEL));
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
      btn.addEventListener("click", () => setMenu(!state.menuOpen));
      wrap.addEventListener("mouseenter", () => setMenu(true));
      wrap.addEventListener("mouseleave", () => setMenu(false));
      wrap.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          setMenu(false);
          btn.focus();
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          const items = [...menu.querySelectorAll("a")];
          const i = items.indexOf(document.activeElement);
          const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
          setMenu(true);
          items[next].focus();
          e.preventDefault();
        }
      });
      menu.addEventListener("click", () => setMenu(false));
      nav.append(wrap);
      if (state.menuOpen) setMenu(true);
    } else {
      state.menuOpen = false;
    }
    applyActive();
  }
  function onScroll() {
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const root2 = document.documentElement;
    const on = y > SCROLL_THRESHOLD;
    if (root2.classList.contains("lfx-scrolled") !== on) root2.classList.toggle("lfx-scrolled", on);
  }
  function onDocClick(e) {
    if (state.menuOpen && state.nav && !state.nav.contains(e.target)) setMenu(false);
  }
  async function loadViews(seq) {
    try {
      const views = await cached(`views:${getUserId()}`, getViews, 5 * 6e4);
      if (seq !== state.seq || !state.nav) return;
      state.model = buildNavModel(views);
    } catch {
      if (seq !== state.seq || !state.nav) return;
      state.model = { series: null, movies: null, more: [] };
    }
    render();
  }
  var navFeature = {
    name: "nav",
    match(route) {
      return isReady() && isModern() && !isTv() && !EXCLUDED.test(route.path);
    },
    mount(route) {
      const seq = ++state.seq;
      state.route = route;
      state.nav = mountPoint(NAV_ID, { tag: "nav", className: "lfx-nav" });
      state.nav.setAttribute("aria-label", "Hauptnavigation");
      mountAmbient();
      document.documentElement.classList.add("lfx-nav-on");
      render();
      window.addEventListener("scroll", onScroll, { passive: true });
      document.addEventListener("click", onDocClick, true);
      state.cleanups.push(
        () => window.removeEventListener("scroll", onScroll),
        () => document.removeEventListener("click", onDocClick, true)
      );
      onScroll();
      loadViews(seq);
    },
    update(route) {
      const changed = !state.route || state.route.hash !== route.hash;
      state.route = route;
      if (changed) setMenu(false);
      applyActive();
    },
    unmount() {
      state.seq++;
      for (const fn of state.cleanups.splice(0)) fn();
      unmountPoint(NAV_ID);
      unmountAmbient();
      const cl2 = document.documentElement.classList;
      cl2.remove("lfx-nav-on", "lfx-scrolled");
      state.nav = null;
      state.menuOpen = false;
    }
  };
  var nav_default = navFeature;

  // src/js/features/mobilenav.js
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
    const statsUrl = getStatsUrl();
    if (statsUrl) items.push({ key: "stats", label: STATS_LABEL, href: statsUrl, external: true });
    return items;
  }
  var state2 = {
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
    return Boolean(state2.overlay && !state2.overlay.hidden);
  }
  function openOverlay() {
    if (!state2.overlay || isOpen()) return;
    state2.returnFocus = document.activeElement;
    state2.overlay.hidden = false;
    cl().add("lfx-mnav-open");
    if (state2.catBtn) state2.catBtn.setAttribute("aria-expanded", "true");
    const close2 = state2.overlay.querySelector(".lfx-mnav-overlay__close");
    if (close2) close2.focus();
  }
  function closeOverlay({ restoreFocus = true } = {}) {
    if (!state2.overlay || !isOpen()) return;
    state2.overlay.hidden = true;
    cl().remove("lfx-mnav-open");
    if (state2.catBtn) state2.catBtn.setAttribute("aria-expanded", "false");
    const back = state2.returnFocus;
    state2.returnFocus = null;
    if (restoreFocus && back && typeof back.focus === "function" && back.isConnected) back.focus();
  }
  function onOverlayKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      closeOverlay();
      return;
    }
    if (e.key !== "Tab") return;
    const nodes = [...state2.overlay.querySelectorAll(FOCUSABLE)];
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
    if (!state2.route) return;
    const key = activeKey(state2.route, state2.model);
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
    const on = Boolean(state2.route && showsPills(state2.route));
    if (state2.pills) state2.pills.hidden = !on;
    if (cl().contains("lfx-mnav-pills") !== on) cl().toggle("lfx-mnav-pills", on);
  }
  function render2() {
    if (!state2.pills || !state2.overlay) return;
    state2.pills.textContent = "";
    for (const it of pillItems(state2.model)) {
      state2.pills.append(h("a", { class: "lfx-mnav__pill", href: it.href, dataset: { key: it.key } }, it.label));
    }
    state2.catBtn = h("button", {
      type: "button",
      class: "lfx-mnav__pill lfx-mnav__pill--cats",
      "aria-haspopup": "dialog",
      "aria-expanded": String(isOpen()),
      "aria-controls": OVERLAY_ID,
      dataset: { key: "cats" }
    }, ["Mehr", h("span", { class: "lfx-mnav__caret", "aria-hidden": "true" })]);
    state2.catBtn.addEventListener("click", () => isOpen() ? closeOverlay() : openOverlay());
    state2.pills.append(state2.catBtn);
    const list = h(
      "ul",
      { class: "lfx-mnav-overlay__list" },
      overlayItems(state2.model).map((it) => h("li", null, [
        // Externe Seite (Statistik): kein data-key, damit sie nie als aktiver Tab markiert wird
        h("a", { class: `lfx-mnav-overlay__link${it.external ? " lfx-mnav-overlay__link--stats" : ""}`, href: it.href, ...it.external ? {} : { dataset: { key: it.key } } }, it.label)
      ]))
    );
    const close2 = h("button", { type: "button", class: "lfx-mnav-overlay__close", "aria-label": "Schlie\xDFen" }, "\xD7");
    close2.addEventListener("click", () => closeOverlay());
    state2.overlay.textContent = "";
    state2.overlay.append(list, close2);
    applyActive2();
    applyPillsVisibility();
  }
  async function loadViews2(seq) {
    try {
      const views = await cached(`views:${getUserId()}`, getViews, 5 * 6e4);
      if (seq !== state2.seq || !state2.root) return;
      state2.model = buildNavModel(views);
    } catch {
      if (seq !== state2.seq || !state2.root) return;
      state2.model = { series: null, movies: null, more: [] };
    }
    render2();
  }
  var mobilenavFeature = {
    name: "mobilenav",
    match(route) {
      return isReady() && isModern() && !isTv() && isMobile() && !EXCLUDED2.test(route.path);
    },
    mount(route) {
      const seq = ++state2.seq;
      state2.route = route;
      state2.root = mountPoint(ROOT_ID, { className: "lfx-mnav" });
      state2.root.textContent = "";
      state2.pills = h("div", { class: "lfx-mnav__pills", role: "navigation", "aria-label": "Filter", hidden: true });
      state2.root.append(
        h("a", { class: "lfx-mnav__logo", href: "#/home", "aria-label": "LenzFlix Startseite" }),
        state2.pills
      );
      state2.overlay = mountPoint(OVERLAY_ID, { className: "lfx-mnav-overlay" });
      state2.overlay.setAttribute("role", "dialog");
      state2.overlay.setAttribute("aria-modal", "true");
      state2.overlay.setAttribute("aria-label", "Mehr");
      state2.overlay.hidden = true;
      state2.overlay.addEventListener("keydown", onOverlayKey);
      const onOverlayClick = (e) => {
        if (e.target.closest && e.target.closest("a")) closeOverlay({ restoreFocus: false });
      };
      state2.overlay.addEventListener("click", onOverlayClick);
      state2.cleanups.push(
        () => state2.overlay && state2.overlay.removeEventListener("keydown", onOverlayKey),
        () => state2.overlay && state2.overlay.removeEventListener("click", onOverlayClick)
      );
      cl().add("lfx-mnav-on");
      render2();
      loadViews2(seq);
    },
    update(route) {
      const changed = !state2.route || state2.route.hash !== route.hash;
      state2.route = route;
      if (changed) closeOverlay({ restoreFocus: false });
      applyActive2();
      applyPillsVisibility();
    },
    unmount() {
      state2.seq++;
      closeOverlay({ restoreFocus: false });
      for (const fn of state2.cleanups.splice(0)) fn();
      unmountPoint(ROOT_ID);
      unmountPoint(OVERLAY_ID);
      cl().remove("lfx-mnav-on", "lfx-mnav-pills", "lfx-mnav-open");
      state2.root = null;
      state2.pills = null;
      state2.overlay = null;
      state2.catBtn = null;
      state2.returnFocus = null;
      state2.model = { series: null, movies: null, more: [] };
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

  // src/js/core/toast.js
  var ID2 = "lfx-toast";
  var hideTimer = null;
  var removeTimer = null;
  function clearTimers() {
    clearTimeout(hideTimer);
    clearTimeout(removeTimer);
    hideTimer = removeTimer = null;
  }
  function toast(text, { duration = 3e3 } = {}) {
    clearTimers();
    const root2 = mountPoint(ID2, { className: "lfx-toast" });
    root2.classList.remove("is-leaving");
    root2.setAttribute("role", "status");
    root2.setAttribute("aria-live", "polite");
    root2.replaceChildren(h("div", { class: "lfx-toast__msg" }, [String(text)]));
    hideTimer = setTimeout(() => {
      root2.classList.add("is-leaving");
      removeTimer = setTimeout(() => {
        unmountPoint(root2);
        hideTimer = removeTimer = null;
      }, 200);
    }, duration);
  }
  function clearToast() {
    clearTimers();
    unmountPoint(ID2);
  }

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
      const started = Date.now();
      const timer = setInterval(() => {
        const wrap = document.querySelector(".itemDetailPage:not(.hide) .mainDetailButtons");
        const visible = (sel) => wrap && [...wrap.querySelectorAll(sel)].find((b) => !b.classList.contains("hide"));
        const target = resume ? visible(".btnPlay") : visible(".btnReplay") || visible(".btnPlay");
        if (target) {
          clearInterval(timer);
          target.click();
          resolve2(true);
        } else if (Date.now() - started > timeoutMs) {
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
    let state5 = "idle";
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
      state5 = "closing";
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
      state5 = "closing";
      el.style.transition = ANIM;
      el.style.transform = "translateY(0px)";
      setBackdrop(1, true);
      animateThen(250, () => {
        resetStyles();
        state5 = "idle";
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
      if (state5 === "closing") return;
      state5 = "idle";
      const touches = e.touches || [];
      if (touches.length !== 1) {
        state5 = "ignored";
        return;
      }
      const t = touches[0];
      const rect = el.getBoundingClientRect();
      const inHandle = t.clientY - rect.top <= handleZone;
      if (!inHandle && scrolledAncestor(e.target, el)) {
        state5 = "ignored";
        return;
      }
      if (!canStart(e)) {
        state5 = "ignored";
        return;
      }
      state5 = "tracking";
      startX = t.clientX;
      startY = t.clientY;
      dy = 0;
      samples = [{ t: now(), y: startY }];
    }
    function onMove2(e) {
      if (state5 !== "tracking" && state5 !== "dragging") return;
      const touches = e.touches || [];
      if (touches.length !== 1) {
        if (state5 === "dragging") springBack();
        else state5 = "ignored";
        return;
      }
      const t = touches[0];
      const mx = t.clientX - startX;
      const my = t.clientY - startY;
      if (state5 === "tracking") {
        if (Math.hypot(mx, my) < DECIDE_PX) return;
        if (my > 0 && my > Math.abs(mx)) {
          state5 = "dragging";
          el.classList.add("lfx-dragging");
          el.style.transition = "none";
        } else {
          state5 = "ignored";
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
      if (state5 === "dragging") {
        const h2 = height();
        const far = h2 > 0 ? dy > threshold * h2 : dy > FALLBACK_PX;
        if (far || velocityNow() > velocity) close2();
        else springBack();
      } else if (state5 !== "closing") {
        state5 = "idle";
      }
    }
    function onCancel() {
      if (state5 === "dragging") springBack();
      else if (state5 !== "closing") state5 = "idle";
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
      state5 = "idle";
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
  var listeners = /* @__PURE__ */ new Set();
  var ownDeletes = /* @__PURE__ */ new Set();
  function onItemsChanged(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function emit({ removed = [], updated = [] }) {
    if (!removed.length && !updated.length) return;
    if (removed.some((id) => ownDeletes.has(id))) {
      for (const id of removed) ownDeletes.delete(id);
      toast("Gel\xF6scht");
    }
    for (const fn of [...listeners]) {
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
      emit({ removed: [id], updated: [] });
      return true;
    }
    if (!item || !item.Id) {
      emit({ removed: [id], updated: [] });
      return true;
    }
    if (removalOnly) return false;
    putItems([item]);
    emit({ removed: [], updated: [id] });
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
    const root2 = document.documentElement;
    root2.classList.remove("lfx-menu-open");
    root2.style.removeProperty("--lfx-menu-x");
    root2.style.removeProperty("--lfx-menu-y");
  }
  function setPosition(pos) {
    const root2 = document.documentElement;
    root2.style.setProperty("--lfx-menu-x", `${Math.round(pos.x)}px`);
    root2.style.setProperty("--lfx-menu-y", `${Math.round(pos.y)}px`);
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
    emit({ removed, updated });
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
  var current2 = null;
  function isChooserOpen() {
    return current2 !== null;
  }
  function isCurrent(c) {
    return current2 !== null && current2 === c;
  }
  function closeChooser() {
    const c = current2;
    if (!c) return;
    current2 = null;
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
      const active3 = document.activeElement;
      if (!sheet.contains(active3)) {
        e.preventDefault();
        firstEl.focus();
      } else if (e.shiftKey && active3 === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active3 === lastEl) {
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
        if (current2 === c) closeChooser();
      } });
    }
    document.documentElement.classList.add("lfx-sheet-open");
    current2 = c;
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
    const { address, token } = getAuth();
    if (!token) return null;
    return `${address || ""}/Items/${id}/Download?ApiKey=${encodeURIComponent(token)}`;
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
    const { token, userId } = getAuth();
    const res = await fetch(buildUrl(`/Users/${userId}/Items/${id}/Rating`, likes ? { likes: true } : void 0), {
      method: likes ? "POST" : "DELETE",
      headers: { Authorization: `MediaBrowser Token="${token}"` }
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
  function buildDetail(item, H, { playLabel = "Abspielen" } = {}) {
    const ud = item.UserData || {};
    const logo = logoImage(item, { maxWidth: 500 });
    const img = heroImage(item);
    const playBtn = h("button", { type: "button", class: "lfx-modal__play", onclick: () => H.play() }, [
      icon("play"),
      h("span", { class: "lfx-modal__play-text" }, playLabel)
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
    const span = h("span", { class: "lfx-modal__value" });
    people.forEach((p, i) => {
      if (i) span.append(", ");
      const href = detailHref(p.Id, null);
      span.append(h("a", { class: "lfx-modal__person", href, onclick: (e) => {
        e.preventDefault();
        H.navigate(href);
      } }, p.Name));
    });
    return span;
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
  function renderEpisodes(slot, state5, H) {
    slot.hidden = false;
    slot.replaceChildren();
    const { seasons, seasonId, episodes, selectedEpisodeId } = state5;
    putItems(episodes);
    const current3 = seasons.find((s) => s.Id === seasonId);
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
      }, [h("span", {}, current3 && current3.Name || "Staffel"), icon("chevron")]);
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
  var state3 = null;
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
    const card2 = t.closest(".lfx-card[data-lfx-id], .card[data-id]");
    if (!card2) return null;
    if (document.querySelector(".selectionCommandsPanel, .itemSelectionPanel")) return null;
    const skip = t.closest(SKIP_IN_CARD);
    if (skip && card2.contains(skip) && !skip.matches(IMAGE_LINK)) return null;
    const id = card2.dataset.lfxId || card2.dataset.id;
    const type = card2.dataset.lfxType || card2.dataset.type;
    if (!id || !ALLOWED_TYPES.has(type)) return null;
    return { card: card2, id, type, opener: t.closest("a, button") || card2 };
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
    const hint = typeof itemOrId === "object" ? itemOrId : null;
    if (state3) return loadInto(id, hint, true);
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
    state3 = { overlay, modal, content, closeBtn, opener, token: 0, pushed: false, after: null, fallback: null, main: null, parts: null, autoScroll: null, seasons: [], episodes: [], seasonId: null, selectedEpisodeId: null, onOverlayClick, unsub: null };
    state3.unsub = onItemsChanged(onChanged);
    if (typeof window.matchMedia === "function" && window.matchMedia("(max-width: 799px)").matches) {
      state3.detachSwipe = attachSwipeClose(modal, {
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
      state3.pushed = true;
    } catch {
    }
    closeBtn.focus({ preventScroll: true });
  }
  function teardown2() {
    if (!state3) return null;
    const s = state3;
    state3 = null;
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
    if (!state3) return;
    if (opts.after) state3.after = opts.after;
    if (state3.pushed) {
      state3.fallback = setTimeout(() => finish2(), 600);
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
    if (!state3) return;
    const st = history.state;
    if (st && st.lfxModal) return;
    state3.pushed = false;
    finish2();
  }
  function onHashChange() {
    if (!state3) return;
    state3.pushed = false;
    const after = state3.after;
    teardown2();
    if (after) after();
  }
  function focusables() {
    if (!state3) return [];
    const sel = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]';
    return [...state3.modal.querySelectorAll(sel)].filter((el) => !el.closest("[hidden]"));
  }
  function onKeydown(e) {
    if (!state3) return;
    if (overlayOnTop()) return;
    if (e.key === "Escape") {
      const open2 = state3.modal.querySelector('.lfx-modal__seasonbtn[aria-expanded="true"]');
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
    const active3 = document.activeElement;
    if (!state3.modal.contains(active3)) {
      e.preventDefault();
      first2.focus();
    } else if (e.shiftKey && active3 === first2) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active3 === last) {
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
  async function loadInto(id, hint, replace, refresh = false) {
    const s = state3;
    const token = ++s.token;
    const stale = () => state3 !== s || s.token !== token;
    if (!refresh) cancelAutoScroll(s);
    if (refresh) {
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
      sel = refresh ? { seasonId: s.seasonId, episodeId: s.selectedEpisodeId } : r.sel;
      main = await loadItem(r.targetId);
      if (!main) throw new Error("Titel nicht gefunden");
    } catch (err) {
      if (stale()) return;
      if (refresh) return;
      const href = detailHref(id, null);
      s.content.replaceChildren(buildError(err && err.message ? "Der Server hat nicht geantwortet." : "", href, (hash) => navigate(hash)));
      return;
    }
    if (stale()) return;
    s.main = main;
    s.seasonId = sel.seasonId;
    s.selectedEpisodeId = sel.episodeId;
    const H = makeHandlers(s, token);
    const isSeries = main.Type === "Series";
    const parts = buildDetail(main, H, { playLabel: !isSeries && hasResume(main) ? "Fortsetzen" : "Abspielen" });
    s.parts = parts;
    s.content.replaceChildren(parts.el);
    if (!refresh) s.overlay.scrollTop = 0;
    const tasks = [];
    if (isSeries) {
      tasks.push(loadSeriesParts(s, token, H, refresh));
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
  async function loadSeriesParts(s, token, H, refresh = false) {
    const stale = () => state3 !== s || s.token !== token;
    try {
      s.seasons = await loadSeasons(s.main.Id);
      if (stale()) return;
      s.seasonId = pickInitialSeason(s.seasons, s.seasonId);
      if (!s.seasonId) return;
      await showSeason(s, token, H, { reveal: !refresh });
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
  function scheduleRevealScroll(s, token, row) {
    cancelAutoScroll(s);
    const a = { cancelled: false, raf: null, onUser: null };
    a.onUser = () => cancelAutoScroll(s);
    s.autoScroll = a;
    for (const t of USER_SCROLL_EVENTS) s.overlay.addEventListener(t, a.onUser, { passive: true });
    const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
    a.raf = raf(() => {
      a.raf = null;
      if (a.cancelled || state3 !== s || s.token !== token || s.autoScroll !== a || !row.isConnected) {
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
  async function showSeason(s, token, H, opts = {}) {
    const episodes = await loadEpisodes2(s.main.Id, s.seasonId);
    if (state3 !== s || s.token !== token) return;
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
    if (opts.reveal && s.selectedEpisodeId) scheduleRevealScroll(s, token, row);
  }
  function onChanged({ removed = [], updated = [] } = {}) {
    const s = state3;
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
  function makeHandlers(s, token) {
    const main = s.main;
    const stale = () => state3 !== s || s.token !== token;
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
            await showSeason(s, token, H).catch(() => {
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
        await showSeason(s, token, H).catch(() => {
        });
      },
      playItem: (ep) => play(ep, { resume: hasResume(ep) })
    };
    return H;
  }
  function destroyAll() {
    if (state3) {
      state3.pushed = false;
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
    const uniq = (list, skip) => {
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
    const a = shuffled(uniq(latest, []).slice(0, newCount), rng);
    const b = uniq(random, a.map((it) => it.Id)).slice(0, randomCount);
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
  function trailerUrl(trailerId) {
    const c = window.ApiClient;
    if (c && typeof c.getUrl === "function") {
      return c.getUrl(`Videos/${trailerId}/stream.mp4`, { static: true, api_key: c.accessToken() });
    }
    const { address, token } = getAuth();
    return `${address}/Videos/${trailerId}/stream.mp4?static=true&api_key=${encodeURIComponent(token || "")}`;
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
    let gen = 0;
    let hovering = false;
    let trailerActive = false;
    let rotateTimer = null;
    let trailerTimer = null;
    const timers = /* @__PURE__ */ new Set();
    let video = null;
    let card2 = null;
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
      if (card2) card2.classList.remove("is-trailer");
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
      if (disposed || !card2) return;
      const cur = pool[index];
      if (removed.length && pool.some((it) => removed.includes(it.Id))) {
        const curGone = cur && removed.includes(cur.Id);
        pool = pool.filter((it) => !removed.includes(it.Id));
        if (!pool.length) {
          gen += 1;
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
        index = curGone ? Math.min(index, pool.length - 1) : pool.indexOf(cur);
        fillDots();
        if (curGone) show2(index);
        return;
      }
      if (cur && updated.includes(cur.Id)) {
        const fresh = getStoredItem(cur.Id);
        if (!fresh) return;
        const merged = { ...cur, ...fresh };
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
      if (!(item.LocalTrailerCount > 0) || disposed || myGen !== gen) return;
      try {
        const list = await getJson(`/Users/${getUserId()}/Items/${item.Id}/LocalTrailers`);
        if (myGen !== gen || disposed) return;
        const t = Array.isArray(list) ? list[0] : null;
        if (!t || !t.Id) return;
        const v = h("video", { class: "lfx-bb__video", playsinline: true, preload: "auto", "aria-hidden": "true" });
        v.muted = true;
        v.setAttribute("muted", "");
        v.addEventListener("playing", () => {
          if (myGen !== gen || video !== v) return;
          trailerActive = true;
          v.classList.add("is-in");
          card2.classList.add("is-trailer");
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
      gen += 1;
      const myGen = gen;
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
        if (disposed || myGen !== gen) return;
        content.replaceChildren(...buildContent(item).childNodes);
        content.classList.remove("is-out");
      };
      if (immediate || !content.firstChild) swap();
      else {
        content.classList.add("is-out");
        later(swap, TEXT_FADE_MS);
      }
      putItems([item]);
      loadAmbient(item, () => myGen === gen && !disposed);
      scheduleRotate();
      clearTimeout(trailerTimer);
      trailerTimer = setTimeout(() => startTrailer(item, myGen), TRAILER_DELAY_MS);
    }
    function build3() {
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
      card2 = h("div", { class: "lfx-bb" }, [
        media,
        h("div", { class: "lfx-bb__shade", "aria-hidden": "true" }),
        h("span", { class: "lfx-bb__mark", "aria-hidden": "true" }),
        muteBtn,
        content,
        dots
      ]);
      slot.replaceChildren(card2);
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
      card2.addEventListener("click", onCardClick);
      card2.addEventListener("mouseenter", onEnter);
      card2.addEventListener("mouseleave", onLeave);
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
      build3();
      slot.hidden = false;
      show2(0, true);
    }
    slot.hidden = true;
    init2();
    return () => {
      disposed = true;
      gen += 1;
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
    const { badge: badge3 = null, kind = "landscape", rank = 0 } = opts;
    const title = displayTitle(item);
    let link;
    if (kind === "top10") {
      const url = imageUrl(item, { type: "Primary", maxWidth: 300, quality: 85 }) || landscapeImage(item, { maxWidth: 300 });
      link = h("a", { class: "lfx-card__link", href: detailHref2(item), "aria-label": ariaLabel(item) }, [
        url ? h("img", { class: "lfx-card__img", src: url, alt: "", loading: "lazy", decoding: "async" }) : h("span", { class: "lfx-card__title" }, title)
      ]);
    } else {
      const img = landscapeFor(item);
      const poster = kind === "landscape" ? posterUrl(item) : null;
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
    const card2 = h("div", {
      class: `lfx-card${kind === "top10" ? " lfx-card--top10" : ""}`,
      dataset: { lfxId: item.Id, lfxType: item.Type || "" },
      tabindex: "-1",
      role: "listitem"
    });
    if (kind === "top10" && rank) {
      card2.append(h("span", { class: `lfx-card__rank${rank >= 10 ? " lfx-card__rank--wide" : ""}`, "aria-hidden": "true" }, String(rank)));
    }
    card2.append(link);
    if (badge3) card2.append(h("span", { class: "lfx-badge" }, badge3));
    if (kind === "resume") {
      const p = progressPercent2(item);
      if (p > 0) {
        card2.append(h("div", { class: "lfx-progress" }, [
          h("div", { class: "lfx-progress__bar", style: { width: `${Math.round(p * 10) / 10}%` } })
        ]));
      }
    }
    return card2;
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
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    function go(dir) {
      const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      const left = Math.max(0, track.scrollLeft + dir * pageWidth());
      if (typeof track.scrollTo === "function") track.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
      else track.scrollLeft = left;
    }
    const onPrev = () => go(-1);
    const onNext = () => go(1);
    function links() {
      return Array.from(track.querySelectorAll(".lfx-card__link"));
    }
    function onFocusIn(e) {
      const a = e.target.closest && e.target.closest(".lfx-card__link");
      if (!a) return;
      for (const l of links()) l.tabIndex = l === a ? 0 : -1;
    }
    function onKey2(e) {
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
    track.addEventListener("scroll", schedule, { passive: true });
    track.addEventListener("focusin", onFocusIn);
    track.addEventListener("keydown", onKey2);
    window.addEventListener("resize", schedule);
    const ls = links();
    ls.forEach((l, i) => {
      l.tabIndex = i === 0 ? 0 : -1;
    });
    schedule();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      prev.removeEventListener("click", onPrev);
      next.removeEventListener("click", onNext);
      track.removeEventListener("scroll", schedule);
      track.removeEventListener("focusin", onFocusIn);
      track.removeEventListener("keydown", onKey2);
      window.removeEventListener("resize", schedule);
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
    const { token } = getAuth();
    if (!token) return null;
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
    try {
      const res = await fetch(`${base}/charts`, {
        headers: { "X-Emby-Token": token, Accept: "application/json" },
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
        { id: "top10-series", title: "Top 10 Serien auf LENZFLIX", key: "series" },
        { id: "top10-movies", title: "Top 10 Filme auf LENZFLIX", key: "movies" }
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
        title: "Top 10: Neu auf LENZFLIX",
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
        for (const card2 of [...track.querySelectorAll(".lfx-card[data-lfx-id]")]) {
          if (gone.has(card2.dataset.lfxId)) {
            card2.remove();
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
    const tab = document.querySelector("#indexPage:not(.hide) #homeTab");
    return tab && tab.isConnected ? tab : null;
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
  function build(tab) {
    teardown3();
    const billboardSlot = h("section", { id: "lfx-billboard", class: "lfx-billboard", "aria-label": "Empfehlung" });
    const rowsSlot = h("div", { id: "lfx-rows", class: "lfx-rows" });
    const root2 = h("div", { id: HOME_ID, class: "lfx-home" }, [billboardSlot, rowsSlot]);
    tab.prepend(root2);
    document.documentElement.classList.add("lfx-home-on");
    const ctx = { root: root2 };
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
    const tab = findHomeTab();
    if (tab && existing && tab.contains(existing)) return;
    if (tab) {
      build(tab);
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
    match: (route) => isHomeRoute(route) && !isTv(),
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
    const card2 = el.closest(".emby-scroller .card[data-id]");
    if (!card2 || !NATIVE_TYPES.has(card2.dataset.type)) return null;
    return { card: card2, id: card2.dataset.id, type: card2.dataset.type, own: false };
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
  function cardImageUrl(card2) {
    const img = card2.querySelector("img.lfx-card__img, img.cardImage");
    const src = img && (img.getAttribute("src") || img.getAttribute("data-src"));
    if (src) return src;
    const bg = card2.querySelector(".cardImageContainer");
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
  var listeners2 = [];
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
    const { token, userId } = getAuth();
    const res = await fetch(buildUrl(`/Users/${userId}/Items/${id}/Rating`, likes ? { likes: true } : void 0), {
      method: likes ? "POST" : "DELETE",
      headers: { Authorization: `MediaBrowser Token="${token}"` }
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
    const add = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      listeners2.push(() => target.removeEventListener(type, fn, opts));
    };
    add(document, "pointerover", onOver, { passive: true });
    add(document, "pointerout", onOut, { passive: true });
    add(document, "pointermove", onMove, { passive: true });
    add(document, "keydown", onKey);
    add(document, "click", onClickCapture, true);
    add(window, "scroll", onAbort, { capture: true, passive: true });
    add(window, "resize", onAbort, { passive: true });
    add(window, "hashchange", onHash);
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
    for (const off of listeners2.splice(0)) off();
  }
  var hovercardFeature = {
    name: "hovercard",
    match(route) {
      return !EXCLUDED3.test(route.path) && isReady() && !isTv() && !isMobile() && hoverCapable();
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
  var SECTIONS = [
    { id: "new", label: "Neu bei LENZFLIX", icon: "\u{1F37F}" },
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
    const tab = document.querySelector("#indexPage:not(.hide) #homeTab");
    return tab && tab.isConnected ? tab : null;
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
  var chartSubtitle = (days) => `Meistgesehen auf LENZFLIX \xB7 letzte ${days || 30} Tage`;
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
  function roundButton2(label, icon2, onClick, extra = "") {
    const b = h("button", { type: "button", class: `lfx-np__btn ${extra}`.trim(), "aria-label": label, title: label, onclick: onClick });
    b.append(svg4(icon2));
    return b;
  }
  function iconButton(mod, label, icon2, onClick) {
    const b = h("button", { type: "button", class: `lfx-np__btn lfx-np__btn--${mod}`, "aria-label": label, title: label });
    b.append(h("span", { class: "lfx-np__ico", "aria-hidden": "true" }));
    b.firstChild.innerHTML = icon2;
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
  function createRow(title, items, kind, newSeries) {
    const now = Date.now();
    const cards = items.map((it, i) => createCard(it, {
      kind,
      rank: kind === "top10" ? i + 1 : 0,
      badge: badgeFor2(it, newSeries, now)
    }));
    const track = h("div", { class: "lfx-row__track", role: "list", "aria-label": title }, cards);
    const prev = chevronButton("prev", "Zur\xFCck");
    const next = chevronButton("next", "Weiter");
    const indicator = h("div", { class: "lfx-row__pages", "aria-hidden": "true", hidden: true });
    const el = h("div", { class: "lfx-rows" }, [
      h("section", { class: `lfx-row lfx-row--${kind}` }, [
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
  function build2(tab) {
    teardown4();
    let disposed = false;
    const scrollers = [];
    const sections = new Map(SECTIONS.map((d) => [d.id, sectionShell(d)]));
    const pills = /* @__PURE__ */ new Map();
    const nav = h("nav", { class: "lfx-np__tabs", "aria-label": "Neu und beliebt" });
    function setActive(id) {
      for (const [pid, pill] of pills) pill.classList.toggle("is-active", pid === id);
    }
    for (const d of SECTIONS) {
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
    const root2 = h("div", { id: ROOT_ID3, class: "lfx-np" }, [nav, ...sections.values()]);
    tab.prepend(root2);
    document.documentElement.classList.add(ON_CLASS);
    setActive("new");
    let raf = 0;
    const onScroll2 = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        let current3 = null;
        for (const [id, sec] of sections) {
          if (sec.isConnected && sec.getBoundingClientRect().top <= 170) current3 = id;
        }
        if (current3) setActive(current3);
      });
    };
    window.addEventListener("scroll", onScroll2, { passive: true });
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
      const list = root2.querySelector(".lfx-np__list");
      for (const id of removed) {
        root2.querySelectorAll("[data-lfx-id]").forEach((el) => {
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
    async function fill2(id, loader, renderer, fallbackLabel) {
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
    const rowRenderer = (title, kind, fallbackTitle) => (sec, items, newSeries, meta = {}) => {
      const row = createRow(meta.charted || !fallbackTitle ? title : fallbackTitle, items, kind, newSeries);
      sec.querySelector(".lfx-np__heading")?.remove();
      if (meta.charted) {
        row.el.querySelector(".lfx-row__head").after(h("p", { class: "lfx-np__sub" }, chartSubtitle(meta.windowDays)));
      }
      sec.append(row.el);
      scrollers.push(attachScroller(row.scroller));
    };
    if (isReady()) {
      fill2("new", loadNew, (sec, items, newSeries) => {
        sec.append(h("div", { class: "lfx-np__list" }, items.map((it) => createNewEntry(it, newSeries))));
      });
      fill2("watched", loadMostWatchedSection, rowRenderer("Am h\xE4ufigsten geschaut", "landscape"));
      fill2("top-series", () => loadTopSection("Series"), rowRenderer("Top 10 Serien", "top10", "Neueste Serien"), "Neueste Serien");
      fill2("top-movies", () => loadTopSection("Movie"), rowRenderer("Top 10 Filme", "top10", "Neueste Filme"), "Neueste Filme");
    } else {
      console.warn("[LenzFlix] Neu und beliebt: keine Anmeldung");
    }
    cleanups2.push(() => {
      disposed = true;
      window.removeEventListener("scroll", onScroll2);
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
    const tab = findHomeTab2();
    if (tab && existing && tab.contains(existing)) return;
    if (tab) {
      build2(tab);
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
  var listeners3 = [];
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
    const state5 = { x: t.clientX, y: t.clientY, fired: false };
    press = state5;
    pressTimer = setTimeout(() => {
      pressTimer = null;
      if (press !== state5 || !el.isConnected) return;
      state5.fired = true;
      lastLongPressAt = Date.now();
      openFor(el, state5.x, state5.y);
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
    const add = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      listeners3.push(() => target.removeEventListener(type, fn, opts));
    };
    add(document, "contextmenu", onContextMenu, true);
    add(document, "touchstart", onTouchStart, { passive: true });
    add(document, "touchmove", onTouchMove, { passive: true });
    add(document, "touchend", onTouchEnd, { passive: true });
    add(document, "touchcancel", cancelPress, { passive: true });
    add(window, "scroll", cancelPress, { capture: true, passive: true });
    add(window, "click", onClickCapture2, true);
  }
  function stop2() {
    active2 = false;
    cancelPress();
    swallowUntil = 0;
    lastLongPressAt = -Infinity;
    for (const off of listeners3.splice(0)) off();
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
  var ID3 = "lfx-statshint";
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
  var state4 = { el: null, showTimer: null, hideTimer: null, removeTimer: null, deadline: 0, remaining: 0, onClick: null };
  function clearTimers2() {
    clearTimeout(state4.showTimer);
    clearTimeout(state4.hideTimer);
    clearTimeout(state4.removeTimer);
    state4.showTimer = state4.hideTimer = state4.removeTimer = null;
  }
  function removeHint() {
    clearTimers2();
    if (state4.el) unmountPoint(state4.el);
    state4.el = null;
  }
  function leave2() {
    if (!state4.el) return;
    const el = state4.el;
    clearTimeout(state4.hideTimer);
    state4.hideTimer = null;
    el.classList.add("is-leaving");
    state4.removeTimer = setTimeout(() => {
      state4.removeTimer = null;
      if (state4.el === el) removeHint();
    }, LEAVE_MS);
  }
  function startHideTimer(ms) {
    clearTimeout(state4.hideTimer);
    state4.deadline = Date.now() + ms;
    state4.hideTimer = setTimeout(leave2, ms);
  }
  function canHover() {
    return typeof window.matchMedia === "function" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }
  function show() {
    state4.showTimer = null;
    const url = getStatsUrl();
    if (!url || state4.el || !shouldShow()) return;
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
    const root2 = mountPoint(ID3, { className: "lfx-statshint" });
    root2.classList.remove("is-leaving");
    const top = !isMobile();
    root2.classList.toggle("lfx-statshint--top", top);
    const nav = top ? document.getElementById("lfx-nav") : null;
    const navRight = nav ? Math.round(nav.getBoundingClientRect().right) : 0;
    root2.style.left = top && navRight > 0 ? `${navRight + 12}px` : "";
    root2.setAttribute("role", "status");
    root2.setAttribute("aria-live", "polite");
    root2.replaceChildren(h("div", { class: "lfx-statshint__box" }, [link, close2]));
    state4.el = root2;
    if (canHover()) {
      root2.addEventListener("mouseenter", () => {
        if (!state4.hideTimer) return;
        state4.remaining = Math.max(500, state4.deadline - Date.now());
        clearTimeout(state4.hideTimer);
        state4.hideTimer = null;
      });
      root2.addEventListener("mouseleave", () => {
        if (state4.el !== root2 || state4.hideTimer || state4.removeTimer) return;
        startHideTimer(state4.remaining || HINT_DURATION);
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
      if (!state4.el && !state4.showTimer && shouldShow()) state4.showTimer = setTimeout(show, HINT_DELAY);
    } else {
      removeHint();
    }
  }
  var statshintFeature = {
    name: "statshint",
    match(route) {
      return isModern() && !isTv() && Boolean(getStatsUrl()) && !EXCLUDED5.test(route.path);
    },
    mount(route) {
      state4.onClick = (e) => {
        const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
        if (a && isStatsHref(a.getAttribute("href"))) {
          markSeen();
          removeHint();
        }
      };
      document.addEventListener("click", state4.onClick, true);
      sync(route);
    },
    update(route) {
      sync(route);
    },
    unmount() {
      if (state4.onClick) document.removeEventListener("click", state4.onClick, true);
      state4.onClick = null;
      removeHint();
    }
  };
  var statshint_default = statshintFeature;

  // src/js/features/index.js
  var features2 = [nav_default, mobilenav_default, home_default, hovercard_default, modal_default, newpopular_default, contextmenu_default, statshint_default];

  // src/js/main.js
  var VERSION = "1.4.10";
  var WATCH_MS = 1e3;
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
    }
    function sync2() {
      if (destroyed) return;
      if (cssActive()) {
        applyFavicon();
        if (!running && window.ApiClient && isReady()) startFeatures();
      } else if (running || document.documentElement.classList.contains("lfx-js")) {
        stopFeatures();
        removeFavicon();
      } else {
        removeFavicon();
      }
    }
    watchTimer = setInterval(sync2, WATCH_MS);
    window.addEventListener("hashchange", sync2);
    sync2();
    function destroy() {
      destroyed = true;
      clearInterval(watchTimer);
      window.removeEventListener("hashchange", sync2);
      stopFeatures();
      removeFavicon();
      delete window.LenzFlix;
    }
    window.LenzFlix = { version: VERSION, destroy };
  }
  init();
})();

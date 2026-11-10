// LenzFlix: Hash-Router-Hooks + Feature-Registry (mount/unmount nach Route).

/** '#/home?tab=1' -> {path:'/home', params, hash} */
export function parseHash(hash) {
  let h = String(hash || '').replace(/^#!?/, '');
  if (!h.startsWith('/')) h = `/${h}`;
  const qi = h.indexOf('?');
  const raw = qi < 0 ? h : h.slice(0, qi);
  const params = new URLSearchParams(qi < 0 ? '' : h.slice(qi + 1));
  const path = raw.replace(/\/+$/, '') || '/';
  return { path: path === '/' ? '/home' : path, params, hash: h };
}

export function currentRoute(reason = 'initial') {
  const r = parseHash(window.location.hash);
  r.reason = reason;
  return r;
}

const handlers = new Set();
let listening = false;

function dispatch(reason) {
  const route = currentRoute(reason);
  for (const fn of [...handlers]) {
    try {
      fn(route);
    } catch (e) {
      console.error('[LenzFlix] route handler', e);
    }
  }
}

const listener = (e) => dispatch(e.type);

function startListening() {
  if (listening) return;
  listening = true;
  window.addEventListener('hashchange', listener);
  document.addEventListener('viewshow', listener);
}

function stopListening() {
  if (!listening) return;
  listening = false;
  window.removeEventListener('hashchange', listener);
  document.removeEventListener('viewshow', listener);
}

/** Feuert initial (synchron) und bei hashchange/viewshow. Rückgabe: unsubscribe. */
export function onRoute(handler) {
  handlers.add(handler);
  startListening();
  try {
    handler(currentRoute('initial'));
  } catch (e) {
    console.error('[LenzFlix] route handler', e);
  }
  return () => {
    handlers.delete(handler);
    if (!handlers.size) stopListening();
  };
}

// ---------------------------------------------------------------- Features

const features = new Map(); // name -> {feature, mounted}
let featureSub = null;

let evaluating = false;
let rerun = null;

function runPass(route) {
  // 1. alle match() auswerten (Stand vor jeder Aktion)
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
  // 2. Phase 1: alle nötigen Unmounts
  for (const { entry, matched } of plan) {
    if (matched || !entry.mounted || !alive(entry)) continue;
    entry.mounted = false;
    try {
      entry.feature.unmount();
    } catch (e) {
      console.error(`[LenzFlix] Feature ${entry.feature.name}`, e);
    }
  }
  // 3. Phase 2: Mounts/Updates in Registrierungsreihenfolge
  for (const { entry, matched } of plan) {
    if (!matched || !alive(entry)) continue;
    const { feature } = entry;
    try {
      if (!entry.mounted) {
        entry.mounted = true;
        feature.mount(route);
      } else if (typeof feature.update === 'function') {
        feature.update(route);
      }
    } catch (e) {
      console.error(`[LenzFlix] Feature ${feature.name}`, e);
    }
  }
}

function evaluate(route) {
  if (evaluating) {
    rerun = route; // Wiedereintritt (z. B. mount löst reevaluate aus): nach Abschluss mit neuester Route wiederholen
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

/** feature: {name, match(route)->bool, mount(ctx), unmount(), update?(ctx)}. Rückgabe: unregister. Idempotent pro Name. */
export function registerFeature(feature) {
  if (!feature || !feature.name) throw new Error('Feature braucht einen Namen');
  if (features.has(feature.name)) return () => unregisterFeature(feature.name);
  features.set(feature.name, { feature, mounted: false });
  if (!featureSub) featureSub = onRoute(evaluate);
  else evaluate(currentRoute('register'));
  return () => unregisterFeature(feature.name);
}

export function unregisterFeature(name) {
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

/** Features sofort gegen die aktuelle Route neu auswerten (z. B. nachdem React den Header gerendert hat). */
export function reevaluate() {
  if (features.size) evaluate(currentRoute('refresh'));
}

export function isFeatureMounted(name) {
  const e = features.get(name);
  return Boolean(e && e.mounted);
}

/** Alle Features abmelden (unmount) und Listener lösen. */
export function resetRouter() {
  for (const name of [...features.keys()]) unregisterFeature(name);
  handlers.clear();
  featureSub = null;
  stopListening();
}

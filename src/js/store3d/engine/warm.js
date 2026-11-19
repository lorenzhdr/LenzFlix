// VIDEOTHEK LENZ · Vorab-Kompilierung (1.19.0): Shader-Programme und Texturen eines noch unsichtbaren Objekts vor dem ersten Zeichnen anlegen,
// damit der erste Blick darauf keinen Einzel-Hänger (Programm-Link, Textur-Upload) erzeugt. Rein, ohne three-Import (nur Duck-Typing).
const TEX_KEYS = ['map', 'alphaMap', 'emissiveMap', 'lightMap', 'aoMap', 'bumpMap', 'normalMap', 'specularMap', 'envMap', 'gradientMap', 'displacementMap', 'roughnessMap', 'metalnessMap'];

/** Alle Texturen der Materialien unter `object` (jede Instanz einmal) plus `extra` (Array von Texturen). */
export function collectTextures(object, extra) {
  const out = new Set();
  const add = (t) => { if (t && t.isTexture) out.add(t); };
  if (object && typeof object.traverse === 'function') {
    object.traverse((o) => {
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
        for (const k of TEX_KEYS) add(m[k]);
        if (m.uniforms) for (const k of Object.keys(m.uniforms)) add(m.uniforms[k] && m.uniforms[k].value);
      }
    });
  }
  if (Array.isArray(extra)) extra.forEach(add);
  return [...out];
}

/** Setzt `visible` des Objekts und aller Kinder kurz auf true; liefert eine Funktion, die den Zustand exakt wiederherstellt. */
function showAll(object) {
  const saved = [];
  if (object && typeof object.traverse === 'function') object.traverse((o) => { saved.push([o, o.visible]); o.visible = true; });
  else if (object) { saved.push([object, object.visible]); object.visible = true; }
  return () => { for (const [o, v] of saved) o.visible = v; };
}

/**
 * Kompiliert die Programme von `object` und lädt seine Texturen hoch. Sichtbarkeit wird synchron wiederhergestellt
 * (vor dem nächsten Frame). Fehler werden geschluckt (warn nur mit opts.debug). Liefert ein Promise<boolean> (true = etwas getan).
 * @param {object} renderer WebGLRenderer
 * @param {object} object Objekt (oder null, dann nur `opts.textures`)
 * @param {object} camera
 * @param {object} scene Ziel-Szene (Nebel/Lichter)
 * @param {{textures?: object[], debug?: boolean}} [opts]
 */
export function warmObject(renderer, object, camera, scene, opts = {}) {
  const warn = (e) => { if (opts.debug) { try { console.warn('[LenzFlix Store3D] warm', e); } catch { /* egal */ } } };
  let did = false;
  let pending = null;
  if (renderer && object && camera) {
    const restore = showAll(object);
    try {
      if (typeof renderer.compileAsync === 'function') { pending = renderer.compileAsync(object, camera, scene || object); did = true; }
      else if (typeof renderer.compile === 'function') { renderer.compile(object, camera, scene || object); did = true; }
    } catch (e) { warn(e); pending = null; } finally { restore(); }
  }
  if (renderer && typeof renderer.initTexture === 'function') {
    for (const t of collectTextures(object, opts.textures)) {
      try { renderer.initTexture(t); did = true; } catch (e) { warn(e); }
    }
  }
  return Promise.resolve(pending).then(() => did, (e) => { warn(e); return did; });
}

/**
 * Wärmt einmalige Objekte (Blitz, Atem, Niederschlag …) im Leerlauf NACH dem Start vor: erst nach `delayMs`, dann ein Objekt je
 * Leerlauf-Häppchen. `getList()` wird erst dann gerufen (Objekte dürfen später entstehen) und liefert [{ object, textures?, ok? }].
 * `ok()` (optional) sagt, ob das Objekt auf der AKTUELLEN Stufe überhaupt gezeichnet werden kann (vor dem Wärmen erneut geprüft):
 * nicht erlaubte Objekte bleiben ungewärmt (kein Programm-Link für nie gezeichnete Programme) und kommen bei `cancel.retry()`
 * (z. B. nach Stufenwechsel oder gesetzter Textur) erneut an die Reihe. Jedes Objekt wird höchstens einmal gewärmt.
 * Liefert cancel() mit cancel.retry(). Ohne ctx.renderer/ctx.camera passiert nichts.
 */
export function scheduleWarm(ctx, getList, { delayMs = 2500, sched } = {}) {
  let cancelled = false;
  let timer = null;
  let idle = null;
  let started = false;
  let dirty = false;
  const done = new Set();
  const later = sched || ((fn) => {
    if (typeof requestIdleCallback === 'function') { const id = requestIdleCallback(() => fn(), { timeout: 2000 }); return () => { if (typeof cancelIdleCallback === 'function') cancelIdleCallback(id); }; }
    const id = setTimeout(fn, 32);
    return () => clearTimeout(id);
  });
  const allowed = (x) => { try { return !x.ok || !!x.ok(); } catch { return false; } };
  const run = (list) => {
    idle = null;
    if (cancelled) return;
    const it = list.shift();
    if (it && it.object && !done.has(it.object) && allowed(it)) {
      done.add(it.object);
      warmObject(ctx.renderer, it.object, ctx.camera, ctx.scene, { textures: it.textures, debug: !!(ctx.opts && ctx.opts.debug) });
    }
    if (list.length) idle = later(() => run(list));
    else if (dirty) { dirty = false; collect(); }
  };
  const collect = () => {
    let list = [];
    try { list = (getList() || []).filter((x) => x && x.object && !done.has(x.object) && allowed(x)); } catch { list = []; }
    if (list.length) idle = later(() => run(list));
  };
  timer = setTimeout(() => {
    timer = null;
    if (cancelled || !ctx || !ctx.renderer || !ctx.camera) return;
    started = true;
    collect();
  }, delayMs);
  const cancel = () => {
    cancelled = true;
    if (timer) { clearTimeout(timer); timer = null; }
    if (typeof idle === 'function') { try { idle(); } catch { /* egal */ } }
    idle = null;
  };
  cancel.retry = () => { if (cancelled || !started) return; if (idle === null) collect(); else dirty = true; };
  return cancel;
}

// ------------------------------------------------------------------ Warm-Zeichnen (1.19.0): Programme der Basisszene vor dem ersten Blick anlegen
/** Bit der Hilfsebene, auf der ein Häppchen (und die Lichter) für die Warm-Kamera sichtbar gemacht wird. */
export const WARM_LAYER = 30;
const WARM_BIT = 1 << WARM_LAYER;

const isRenderable = (o) => !!(o && o.material && (o.isMesh || o.isLine || o.isPoints || o.isSprite));

/** Programm-Schlüssel eines Objekts: gleiche Schlüssel brauchen (bis auf Zustand der Szene) dasselbe Programm, ein Vertreter genügt. */
export function warmKey(o) {
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  const g = o.geometry;
  const attrs = g && g.attributes ? Object.keys(g.attributes).sort().join(',') : '';
  const morph = g && g.morphAttributes ? Object.keys(g.morphAttributes).sort().join(',') : '';
  const flags = (o.isInstancedMesh ? 'i' : '') + (o.instanceColor ? 'c' : '') + (o.isSkinnedMesh ? 's' : '') + (o.isBatchedMesh ? 'b' : '')
    + (o.isPoints ? 'p' : '') + (o.isLine ? 'l' : '') + (o.isSprite ? 'x' : '') + (o.receiveShadow ? 'r' : '');
  return `${mats.map((m) => (m ? m.uuid : '-')).join('+')}|${flags}|${attrs}|${morph}`;
}

/**
 * Zeichnet die sichtbare Szene einmal reihum in Häppchen (je Programm-Schlüssel ein Vertreter), damit alle Programme der aktuellen Stufe
 * existieren, bevor der Spieler sie erstmals sieht. Je Häppchen zwei Pässe: in ein kleines Render-Target gleichen Typs wie die Spiegel-Ziele
 * (Spiegelvariante der Programme) und ins Hauptbild (wird im selben Frame vom normalen Render überzeichnet, deshalb nur vor diesem rufen).
 * Technik: Häppchen-Objekte und Lichter bekommen vorübergehend eine Hilfsebene (WARM_LAYER), die Kamera sieht nur diese, Culling aus; alles wird
 * im selben Aufruf exakt zurückgesetzt. Nur sichtbare Objekte (nie ein Programm für etwas, das auf der Stufe nicht gezeichnet wird).
 * Ohne three-Import; alles per ctx (Attrappen im Test).
 * ctx: { renderer, scene(), camera, makeRt(size), level(), xr(), canDraw(), boost(), now(), shadowsReady(), roots() (optional: Gruppen, die nach Bereich ausgeblendet sein dürfen und trotzdem vorgewärmt werden), budgetMs, boostMs, rescanMs, debug }
 */
export function createWarmDraw(ctx) {
  const now = ctx.now || (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const budgetMs = ctx.budgetMs || 8;
  const boostMs = ctx.boostMs || 40;
  const rescanMs = ctx.rescanMs || 4000;
  const done = new Set();
  let queue = [];
  let lights = [];
  let rt = null;
  let chunk = 1;
  let lastScan = -Infinity;
  let lastLevel = null;
  let disposed = false;
  let failed = false;
  let drawn = 0;
  let chunks = 0;
  let totalMs = 0;
  let maxChunkMs = 0;
  let finished = false;
  let scanned = false;
  const warn = (e) => { if (ctx.debug) { try { console.warn('[LenzFlix Store3D] warmDraw', e); } catch { /* egal */ } } };

  const levelOk = (l) => l === 'high' || l === 'ultra';

  function scan(scene) {
    const seen = new Set(queue.map((q) => q.key));
    lights = [];
    let roots;
    try { roots = (ctx.roots && ctx.roots()) || []; } catch { roots = []; }
    const rootSet = new Set(roots);
    // reveal: nach Bereich ausgeblendete Wurzelgruppen (ctx.roots), die für den Zeichenpass kurz sichtbar sein müssen
    const walk = (o, reveal) => {
      if (!o) return;
      if (o.visible === false) {
        if (!rootSet.has(o)) return;
        reveal = reveal.concat(o);
      }
      if (o.isLight && !reveal.length) lights.push(o);
      if (isRenderable(o)) {
        const k = warmKey(o);
        if (!done.has(k) && !seen.has(k)) { seen.add(k); queue.push({ o, key: k, reveal }); }
      }
      const ch = o.children;
      if (ch) for (let i = 0; i < ch.length; i++) walk(ch[i], reveal);
    };
    walk(scene, []);
  }

  /** Zeichnet die Objekte `objs` in beiden Pässen; Zustand wird im finally exakt zurückgesetzt. */
  function drawChunk(scene, items) {
    const r = ctx.renderer;
    const cam = ctx.camera;
    const objs = items.map((i) => i.o);
    const reveal = new Set();
    for (const i of items) for (const g of i.reveal) reveal.add(g);
    const savedReveal = [...reveal].map((g) => [g, g.visible]);
    const savedObjs = objs.map((o) => [o, o.layers.mask, o.frustumCulled]);
    const savedLights = lights.map((l) => [l, l.layers.mask]);
    const camMask = cam.layers.mask;
    const info = r.info;
    const prevAuto = info ? info.autoReset : undefined;
    const sm = r.shadowMap;
    const prevShadow = sm ? sm.autoUpdate : undefined;
    const prevRt = r.getRenderTarget();
    try {
      for (const g of reveal) g.visible = true;
      for (const o of objs) { o.layers.mask |= WARM_BIT; o.frustumCulled = false; }
      for (const l of lights) l.layers.mask |= WARM_BIT;
      cam.layers.mask = WARM_BIT;
      if (info) info.autoReset = false;
      if (sm) sm.autoUpdate = false;
      if (!rt) rt = ctx.makeRt(16);
      r.setRenderTarget(rt);
      r.render(scene, cam);
      r.setRenderTarget(prevRt);
      r.render(scene, cam);
    } finally {
      for (const [g, v] of savedReveal) g.visible = v;
      for (const [o, m, f] of savedObjs) { o.layers.mask = m; o.frustumCulled = f; }
      for (const [l, m] of savedLights) l.layers.mask = m;
      cam.layers.mask = camMask;
      r.setRenderTarget(prevRt);
      if (info) info.autoReset = prevAuto;
      if (sm) sm.autoUpdate = prevShadow;
    }
  }

  function step() {
    if (disposed || failed || !ctx.renderer || !ctx.camera) return;
    const level = ctx.level();
    if (!levelOk(level) || (ctx.xr && ctx.xr()) || (ctx.canDraw && !ctx.canDraw())) return;
    const scene = ctx.scene();
    if (!scene) return;
    if (ctx.shadowsReady && !ctx.shadowsReady()) return;
    const t = now();
    if (level !== lastLevel || (!queue.length && t - lastScan >= rescanMs)) {
      lastLevel = level;
      lastScan = t;
      scanned = true;
      scan(scene);
      if (queue.length) finished = false;
    }
    if (!queue.length) { finished = true; return; }
    const boost = !!(ctx.boost && ctx.boost());
    const budget = boost ? boostMs : budgetMs;
    const cap = boost ? 12 : 2; // im Spiel höchstens 2 Vertreter je Zeichenpass: jeder neue Vertreter kann ~10-50 ms Programmbau kosten
    const progs = () => (ctx.renderer.info && ctx.renderer.info.programs ? ctx.renderer.info.programs.length : 0);
    const t0 = now();
    try {
      while (queue.length) {
        const c0 = now();
        const p0 = progs();
        const take = queue.splice(0, Math.min(chunk, cap));
        for (const q of take) done.add(q.key);
        drawChunk(scene, take);
        const dt = now() - c0;
        drawn += take.length;
        chunks++;
        if (dt > maxChunkMs) maxChunkMs = dt;
        // Häppchengröße adaptiv: wächst nur, solange keine neuen Programme entstehen (schnell), schrumpft bei langsamen Häppchen
        if (progs() === p0 && dt < budget / 4) chunk = Math.min(chunk * 2, 12);
        else if (dt > budget / 2) chunk = Math.max(1, chunk >> 1);
        if (now() - t0 >= budget) break;
      }
    } catch (e) { failed = true; queue = []; warn(e); }
    totalMs += now() - t0;
    if (!queue.length) finished = true;
  }

  return {
    step,
    /** Gibt es (auf der aktuellen Stufe, außerhalb XR) noch etwas zu tun, oder steht der erste Durchlauf noch aus? */
    busy: () => !disposed && !failed && levelOk(ctx.level()) && !(ctx.xr && ctx.xr()) && (!scanned || queue.length > 0),
    /** Fortschritt für das Debug-Fenster. */
    state: () => ({ done: finished && !failed, pending: queue.length, drawn, chunks, ms: +totalMs.toFixed(1), maxChunkMs: +maxChunkMs.toFixed(1), keys: done.size, failed }),
    dispose() {
      disposed = true;
      queue = [];
      lights = [];
      if (rt) { try { rt.dispose(); } catch { /* egal */ } rt = null; }
    },
  };
}

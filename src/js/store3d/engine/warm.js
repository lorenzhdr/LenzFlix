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

// VIDEOTHEK LENZ: Bühne parken. Während einer XR-Session im Kino (unsichtbar) bzw. beim 2D-Kino im LENZ PALAST (sichtbar) wird
// #homeTab abgebaut; die Bühne (mit der Canvas der laufenden Instanz) bleibt in einem Container an body, damit der Renderer weiterläuft.
const PARK_ID = 'lfx-store-park';
let stageEl = null;

/** visible: kein Clipping, kein Stapelkontext – die Bühne (position:fixed, z-index per CSS) liegt vollflächig über Jellyfins Player. */
export function parkStage(stage, { visible = false } = {}) {
  if (!stage) return;
  unparkStage();
  const box = document.createElement('div');
  box.id = PARK_ID;
  box.setAttribute('style', visible ? 'display:block;height:0;overflow:visible' : 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;z-index:-1');
  box.appendChild(stage);
  document.body.appendChild(box);
  stageEl = stage;
}

/** Container entfernen und die Bühne zurückgeben (oder null). */
export function unparkStage() {
  const el = stageEl;
  stageEl = null;
  const box = document.getElementById(PARK_ID);
  if (box) box.remove();
  return el;
}

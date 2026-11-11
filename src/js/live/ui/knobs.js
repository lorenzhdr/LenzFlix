// LENZ LIVE · Drehknöpfe der Röhre 80er (.lfx-live-tv__knob--a Sender, --b Lautstärke), nur bei aktivem Stil wirksam.
//
// createKnobs({ tv, getState, onChannel, onVolume, onSound, onPreview, win }) → { setChannel(n), setVolume(v), sync(), dispose() }
//   getState() → { active, channel, count, volume }  (active = Stil crt80; sonst keine Wirkung; volume 0–100, bleibt bei Stumm erhalten)
//   onChannel(n): Sender endgültig wechseln · onVolume(v): Lautstärke absolut (0–100, 5-%-Stufen), live beim Drehen
//   onSound('detent'): Rastgeräusch pro Stufe · onPreview(n): Sendernummer während des Drehens (Anzeige)
//   Winkel stehen in CSS-Variablen --lfx-live-knob-a / --lfx-live-knob-b (deg) am Knopf; das Mitdrehen übernimmt CSS (transition).
//   Sender: count Raststufen (18 × 20°), endlos; Wechsel erst beim Loslassen bzw. 400 ms nach der letzten Stufe.
//   Lautstärke: −135° … +135° mit Anschlägen, 5-%-Stufen.
//   Bedienung: Ziehen (Pointer Events, auch Touch; Winkel um die Knopfmitte, nahe der Mitte senkrecht), Klick links/rechts der Mitte = −/+1 Stufe
//   (nicht nach einem Zug, Schwelle 4 px), Mausrad (100 Einheiten = 1 Stufe).
const COMMIT_MS = 400;
const DRAG_PX = 4;
const VOL_STEP = 5;
const VOL_MIN = -135;
const VOL_RANGE = 270;
const WHEEL_UNIT = 100;

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const norm180 = (a) => ((((a + 180) % 360) + 360) % 360) - 180;

export function createKnobs({ tv, getState, onChannel, onVolume, onSound, onPreview, win = globalThis.window }) {
  const elA = tv.querySelector('.lfx-live-tv__knob--a');
  const elB = tv.querySelector('.lfx-live-tv__knob--b');
  const st = () => {
    const s = (getState && getState()) || {};
    return { active: !!s.active, channel: s.channel || 1, count: Math.max(2, s.count || 18), volume: clamp(Number(s.volume) || 0, 0, 100) };
  };
  const stepDeg = () => 360 / st().count;
  const sound = (k) => { if (onSound) try { onSound(k); } catch { /* Ton ist optional */ } };

  let angA = 0;
  let angB = 0;
  let angStart = 0;
  let busy = false; // Zug oder wartender Sender-Wechsel: Sync von außen darf den Winkel nicht zurücksetzen
  let commitTimer = null;
  let pending = null; // Sender-Ziel, wartet auf Loslassen/Timer
  let drag = null;
  let wheelAcc = 0;
  let wheelDir = 0;

  const write = (el, name, deg) => { if (el) el.style.setProperty(name, `${deg}deg`); };
  const volAngle = (v) => VOL_MIN + (clamp(v, 0, 100) / 100) * VOL_RANGE;
  const wrapCh = (n, count) => ((((n - 1) % count) + count) % count) + 1;

  // Winkel des Senderknopfs auf den kürzesten Weg zum Sender stellen
  function setChannel(n) {
    if (busy) return;
    const target = (wrapCh(n, st().count) - 1) * stepDeg();
    const diff = norm180(target - angA);
    if (Math.abs(diff) < 0.001) return;
    angA += diff;
    write(elA, '--lfx-live-knob-a', angA);
  }
  function setVolume(v) {
    if (drag && drag.which === 'b') return;
    angB = volAngle(v);
    write(elB, '--lfx-live-knob-b', angB);
  }
  function sync() {
    const s = st();
    setChannel(s.channel);
    setVolume(s.volume);
  }

  function flush() {
    clearTimeout(commitTimer);
    commitTimer = null;
    const p = pending;
    pending = null;
    busy = !!drag && drag.which === 'a';
    if (p != null && onChannel) onChannel(p);
    if (!busy) { const s = st(); setChannel(s.channel); }
  }
  // 400 ms nach der letzten Stufe wechseln (auch bei gehaltenem Zug; der Zug baut dann auf dem neuen Sender auf)
  function armCommit() {
    clearTimeout(commitTimer);
    commitTimer = setTimeout(() => {
      commitTimer = null;
      const p = pending;
      flush();
      if (drag && drag.which === 'a') {
        drag.baseCh = p != null ? p : drag.baseCh;
        drag.steps = 0;
        drag.cum = 0;
        angStart = angA;
        busy = true;
      }
    }, COMMIT_MS);
  }

  // Stufen relativ zum Ausgangswinkel (Sender) bzw. absolut (Lautstärke) anwenden
  function stepChannel(base, steps) {
    const s = st();
    const next = wrapCh(base + steps, s.count);
    angA = angStart + steps * stepDeg();
    write(elA, '--lfx-live-knob-a', angA);
    if (pending !== next) {
      pending = next;
      sound('detent');
      if (onPreview) try { onPreview(next); } catch { /* Anzeige ist optional */ }
    }
  }
  function applyVolumeAngle(ang) {
    angB = clamp(ang, VOL_MIN, VOL_MIN + VOL_RANGE);
    const v = clamp(Math.round(((angB - VOL_MIN) / VOL_RANGE) * 100 / VOL_STEP) * VOL_STEP, 0, 100);
    angB = volAngle(v);
    write(elB, '--lfx-live-knob-b', angB);
    return v;
  }
  function volStep(dir) {
    const cur = Math.round(((angB - VOL_MIN) / VOL_RANGE) * 100 / VOL_STEP) * VOL_STEP;
    const v = clamp(cur + dir * VOL_STEP, 0, 100);
    if (v === cur) return;
    applyVolumeAngle(volAngle(v));
    sound('detent');
    if (onVolume) onVolume(v);
  }
  function chanSteps(dir) {
    // Klick/Rad: ab dem wartenden Ziel (oder aktuellen Sender) um dir Stufen weiter, Wechsel nach 400 ms
    const s = st();
    const base = pending != null ? pending : s.channel;
    busy = true;
    angStart = angA;
    const next = wrapCh(base + dir, s.count);
    angA += dir * stepDeg();
    write(elA, '--lfx-live-knob-a', angA);
    pending = next;
    sound('detent');
    if (onPreview) try { onPreview(next); } catch { /* ignorieren */ }
    armCommit();
  }
  function chanImmediate(dir) {
    chanSteps(dir);
    flush();
  }

  // ---------- Zeiger ----------
  function center(el) {
    const r = el.getBoundingClientRect();
    // Radius aus der Layoutgröße (die Rahmenbox eines gedrehten Knopfs wäre größer)
    const w = el.offsetWidth || Math.min(r.width, r.height);
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: w / 2 };
  }

  function onDown(which, e) {
    if (!st().active) return;
    if (e.button != null && e.button > 0) return;
    if (drag) return;
    const el = which === 'a' ? elA : elB;
    const c = center(el);
    drag = {
      which, el, c, id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY,
      moved: false, cum: 0, start: angB, baseCh: pending != null ? pending : st().channel, steps: 0,
    };
    if (which === 'a') { busy = true; angStart = angA; }
    el.classList.add('is-drag');
    try { if (e.pointerId != null && el.setPointerCapture) el.setPointerCapture(e.pointerId); } catch { /* ohne Capture weiter */ }
    win.addEventListener('pointermove', onMove);
    win.addEventListener('pointerup', onUp);
    win.addEventListener('pointercancel', onCancel);
    if (e.cancelable && e.preventDefault) e.preventDefault();
  }

  function onMove(e) {
    const d = drag;
    if (!d || (d.id != null && e.pointerId != null && e.pointerId !== d.id)) return;
    const dx = e.clientX - d.c.x;
    const dy = e.clientY - d.c.y;
    const px = d.lx - d.c.x;
    const py = d.ly - d.c.y;
    let delta;
    if (Math.hypot(dx, dy) >= d.c.r * 0.4 && Math.hypot(px, py) >= d.c.r * 0.4) {
      delta = norm180((Math.atan2(dy, dx) - Math.atan2(py, px)) * 180 / Math.PI);
    } else {
      delta = (d.ly - e.clientY) * 1.5; // nahe der Mitte: aufwärts = rechtsherum
    }
    d.lx = e.clientX;
    d.ly = e.clientY;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) <= DRAG_PX) return;
      d.moved = true;
    }
    if (d.which === 'a') {
      d.cum += delta;
      const steps = Math.round(d.cum / stepDeg());
      if (steps !== d.steps) {
        d.steps = steps;
        stepChannel(d.baseCh, steps);
        armCommit();
      }
    } else {
      d.cum = clamp(d.cum + delta, VOL_MIN - d.start, VOL_MIN + VOL_RANGE - d.start);
      const before = Math.round(((angB - VOL_MIN) / VOL_RANGE) * 100 / VOL_STEP) * VOL_STEP;
      const v = applyVolumeAngle(d.start + d.cum);
      if (v !== before) { sound('detent'); if (onVolume) onVolume(v); }
    }
  }

  function end() {
    const d = drag;
    drag = null;
    win.removeEventListener('pointermove', onMove);
    win.removeEventListener('pointerup', onUp);
    win.removeEventListener('pointercancel', onCancel);
    if (d) {
      d.el.classList.remove('is-drag');
      try { if (d.id != null && d.el.releasePointerCapture) d.el.releasePointerCapture(d.id); } catch { /* ignorieren */ }
    }
    return d;
  }
  function onUp(e) {
    const d = drag;
    if (!d || (d.id != null && e.pointerId != null && e.pointerId !== d.id)) return;
    end();
    if (d.moved) {
      if (d.which === 'a') flush();
      return;
    }
    // Klick: linke Hälfte −1, rechte Hälfte +1
    const dir = e.clientX < d.c.x ? -1 : 1;
    if (d.which === 'a') chanImmediate(dir); else volStep(dir);
  }
  function onCancel() {
    const d = end();
    if (d && d.which === 'a') flush();
  }

  function onWheel(which, e) {
    if (!st().active) return;
    e.preventDefault();
    const dy = Number(e.deltaY) || 0;
    if (!dy) return;
    const dir = dy < 0 ? 1 : -1; // nach oben = mehr
    if (dir !== wheelDir) { wheelAcc = 0; wheelDir = dir; }
    wheelAcc += Math.abs(dy);
    while (wheelAcc >= WHEEL_UNIT) {
      wheelAcc -= WHEEL_UNIT;
      if (which === 'a') chanSteps(dir); else volStep(dir);
    }
  }

  const hs = [];
  for (const [which, el, tip] of [['a', elA, 'Sender wählen'], ['b', elB, 'Lautstärke']]) {
    if (!el) continue;
    el.title = tip;
    const down = (e) => onDown(which, e);
    const wheel = (e) => onWheel(which, e);
    el.addEventListener('pointerdown', down);
    el.addEventListener('wheel', wheel, { passive: false });
    hs.push(() => { el.removeEventListener('pointerdown', down); el.removeEventListener('wheel', wheel); });
  }
  write(elA, '--lfx-live-knob-a', 0);
  write(elB, '--lfx-live-knob-b', 0);
  sync();

  return {
    setChannel,
    setVolume,
    sync,
    dispose() {
      end();
      clearTimeout(commitTimer);
      commitTimer = null;
      pending = null;
      for (const off of hs) off();
    },
  };
}

// VIDEOTHEK LENZ · VR-Eingabe: Gamepad (xr-standard) lesen, Totzone, Flanken. Rein, ohne three und ohne DOM.
// Belegung: buttons [0] Trigger, [1] Grip, [3] Stick-Klick, [4] A/X, [5] B/Y; axes [2] Stick x, [3] Stick y (oben = negativ).
// Hände haben ein anderes Layout (nur Pinch) und liefern keine Stick-Werte.

export const DEADZONE = 0.15;
const ON = 0.5;

/** Totzone mit Umskalierung: |v| <= dz → 0, darüber linear auf 0..1 gedehnt (Vorzeichen bleibt). */
export function deadzone(v, dz = DEADZONE) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  const a = Math.abs(n);
  if (a <= dz) return 0;
  return Math.sign(n) * Math.min(1, (a - dz) / (1 - dz));
}

function button(gp, i) {
  const b = gp && gp.buttons ? gp.buttons[i] : null;
  if (!b) return 0;
  const v = Number.isFinite(b.value) ? b.value : 0;
  return v > 0 ? v : (b.pressed ? 1 : 0);
}

function axis(gp, i) {
  const a = gp && gp.axes ? gp.axes[i] : 0;
  return Number.isFinite(a) ? a : 0;
}

/** Leerer Zustand (keine Taste, Stick in der Mitte). */
export function emptyPad() {
  return {
    trigger: 0, grip: 0, stick: { x: 0, y: 0 }, stickClick: false, a: false, b: false,
    edges: { triggerDown: false, triggerUp: false, gripDown: false, gripUp: false, stickClickDown: false, aDown: false, bDown: false },
  };
}

/**
 * Gamepad lesen. prev = Ergebnis des letzten Aufrufs (oder null) für die Flanken.
 * @returns {{ trigger, grip, stick:{x,y}, stickClick, a, b, edges:{ triggerDown, triggerUp, gripDown, gripUp, stickClickDown, aDown, bDown } }}
 */
export function readPad(gamepad, prev) {
  const pv = prev || emptyPad();
  const trigger = button(gamepad, 0);
  const grip = button(gamepad, 1);
  const stickClick = button(gamepad, 3) >= ON;
  const a = button(gamepad, 4) >= ON;
  const b = button(gamepad, 5) >= ON;
  const hasStick = !!(gamepad && gamepad.axes && gamepad.axes.length >= 4);
  const stick = hasStick ? { x: deadzone(axis(gamepad, 2)), y: deadzone(axis(gamepad, 3)) } : { x: 0, y: 0 };
  const tOn = trigger >= ON;
  const tWas = pv.trigger >= ON;
  const gOn = grip >= ON;
  const gWas = pv.grip >= ON;
  return {
    trigger,
    grip,
    stick,
    stickClick,
    a,
    b,
    edges: {
      triggerDown: tOn && !tWas,
      triggerUp: !tOn && tWas,
      gripDown: gOn && !gWas,
      gripUp: !gOn && gWas,
      stickClickDown: stickClick && !pv.stickClick,
      aDown: a && !pv.a,
      bDown: b && !pv.b,
    },
  };
}

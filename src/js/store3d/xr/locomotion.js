// VIDEOTHEK LENZ · VR-Fortbewegung (rein): linker Stick = gleiten, rechter Stick = drehen (Ruck oder weich).
// Richtung ist der Kopf-Yaw (player.yaw in XR); hier entstehen nur Eingabewerte und der Drehwinkel dieses Frames.

export const SNAP_ANGLE = Math.PI / 4; // 45°
export const SNAP_ON = 0.7;
export const SNAP_OFF = 0.3;
export const SMOOTH_RATE = Math.PI / 2; // 90°/s

export function createLoco() {
  return { running: false, snapArmed: true };
}

const NONE = { x: 0, y: 0 };

/**
 * Ein Schritt. st wird verändert (Rennen, Re-Arm).
 * @param {{running:boolean, snapArmed:boolean}} st
 * @param {{ left?:object|null, right?:object|null, dt:number, turnMode?:'snap'|'smooth', locked?:boolean, blockLeft?:boolean, blockRight?:boolean }} o
 *   left/right = Ergebnis von readPad (stick, edges); locked = Gehen gesperrt (Kino, Couch, Blende); block* = Stick wird anderweitig benutzt (Panel scrollen)
 * @returns {{ fwd:number, strafe:number, run:boolean, scale:number, turn:number }} turn = Drehwinkel in rad (positiv = nach links)
 */
export function stepLoco(st, { left, right, dt = 0, turnMode = 'snap', locked = false, blockLeft = false, blockRight = false } = {}) {
  const ls = left && !blockLeft && left.stick ? left.stick : NONE;
  const rs = right && !blockRight && right.stick ? right.stick : NONE;
  const mag = Math.min(1, Math.hypot(ls.x, ls.y));

  // Rennen: Stick-Klick links schaltet um, bis der Stick wieder in der Mitte ist
  if (locked || mag === 0) st.running = false;
  if (!locked && !blockLeft && left && left.edges && left.edges.stickClickDown && mag > 0) st.running = !st.running;

  let fwd = 0;
  let strafe = 0;
  let scale = 1;
  if (!locked && mag > 0) { fwd = -ls.y; strafe = ls.x; scale = mag; }

  // Drehen (bleibt bei locked erlaubt)
  let turn = 0;
  const x = rs.x;
  if (turnMode === 'smooth') {
    turn = -x * SMOOTH_RATE * Math.max(0, dt);
    st.snapArmed = true;
  } else {
    if (Math.abs(x) < SNAP_OFF) st.snapArmed = true;
    else if (st.snapArmed && Math.abs(x) > SNAP_ON) { turn = -Math.sign(x) * SNAP_ANGLE; st.snapArmed = false; }
  }
  return { fwd, strafe, run: !!st.running, scale, turn };
}

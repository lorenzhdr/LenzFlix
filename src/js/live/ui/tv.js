// LENZ LIVE · Fernseher: Stile, DOM-Gerüst, Rauschen / Schwarzbild beim Umschalten. Reines DOM, keine Abhängigkeiten.

export const STYLES = [
  { id: 'flat', name: 'Flachbild' },
  { id: 'crt80', name: 'Röhre 80er' },
  { id: 'silver', name: 'Silber-Röhre' },
  { id: 'plain', name: 'Schlicht' },
];

export const DEFAULT_STYLE = 'flat';

export function normStyle(id) {
  return STYLES.some((s) => s.id === id) ? id : DEFAULT_STYLE;
}

/** Kleiner DOM-Helfer: Element mit Klasse und optionalem Text. */
export function h(doc, tag, cls, text) {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/**
 * Baut das Gerüst aus docs/live.md („UI“) ohne Fernbedienung.
 * @returns {object} Referenzen { app, room, tv, screen, video, noise, fake, card…(leer), osd…(leer), overlay, led }
 */
export function buildTv({ style, fakePlayer = false, doc = document }) {
  const app = h(doc, 'div', `lfx-live-app lfx-live--style-${normStyle(style)}`);
  const room = h(doc, 'div', 'lfx-live-room');
  room.append(h(doc, 'span', 'lfx-live-room__lamp'), h(doc, 'span', 'lfx-live-room__shelf'));
  const tv = h(doc, 'div', 'lfx-live-tv');
  const screen = h(doc, 'div', 'lfx-live-screen');

  const video = doc.createElement('video');
  video.className = 'lfx-live-video';
  video.setAttribute('playsinline', '');
  video.playsInline = true;
  video.setAttribute('disablepictureinpicture', '');
  video.setAttribute('x-webkit-airplay', 'deny');
  video.removeAttribute('controls');

  const noise = h(doc, 'canvas', 'lfx-live-noise');
  noise.width = 160;
  noise.height = 90;
  let fake = null;
  screen.append(video, noise);
  if (fakePlayer) {
    fake = h(doc, 'canvas', 'lfx-live-fake');
    fake.width = 640;
    fake.height = 360;
    screen.append(fake);
  }
  const overlay = h(doc, 'div', 'lfx-live-overlay');

  const led = h(doc, 'span', 'lfx-live-tv__led');
  led.setAttribute('aria-hidden', 'true');
  const panel = h(doc, 'div', 'lfx-live-tv__panel');
  panel.setAttribute('aria-hidden', 'true');
  panel.append(
    h(doc, 'span', 'lfx-live-tv__knob lfx-live-tv__knob--a'),
    h(doc, 'span', 'lfx-live-tv__knob lfx-live-tv__knob--b'),
    h(doc, 'span', 'lfx-live-tv__grille'),
  );
  const brand = h(doc, 'span', 'lfx-live-tv__brand', 'LENZ LIVE');
  brand.setAttribute('aria-hidden', 'true');
  const stand = h(doc, 'span', 'lfx-live-tv__stand');
  stand.setAttribute('aria-hidden', 'true');

  // screen hängt das Overlay mit ein (Contract: .lfx-live-overlay in .lfx-live-screen; OSD/Karte ergänzt app.js)
  screen.append(overlay);
  tv.append(screen, panel, brand, led, stand);
  room.append(tv);
  app.append(room);
  return { app, room, tv, screen, video, noise, fake, overlay, led };
}

/**
 * Rauschen (crt80/silver: kleines 160×90-Canvas, hochskaliert) bzw. Schwarzbild (flat/plain) beim Umschalten.
 * @returns {{ flash(styleId, ms?), stop(), dispose() }}
 */
export function createNoise(canvas, { win = window } = {}) {
  let ctx = null;
  try { ctx = canvas.getContext && canvas.getContext('2d'); } catch { ctx = null; }
  let iv = null;
  let off = null;
  let img = null;

  function draw() {
    if (!ctx) return;
    if (!img) img = ctx.createImageData(canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = d[i + 1] = d[i + 2] = v;
      d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  function stop() {
    if (iv) { win.clearInterval(iv); iv = null; }
    if (off) { win.clearTimeout(off); off = null; }
    canvas.classList.remove('is-active', 'is-black');
  }

  return {
    flash(styleId, ms) {
      stop();
      const black = styleId === 'flat' || styleId === 'plain';
      canvas.classList.add('is-active');
      if (black) canvas.classList.add('is-black');
      else { draw(); iv = win.setInterval(draw, 60); }
      off = win.setTimeout(stop, ms || (black ? 250 : 500));
    },
    stop,
    dispose() { stop(); },
  };
}

// VIDEOTHEK LENZ · Energie-Anzeige und Treffer-Effekte (1.18.0). Vertrag .tmp/v118/contracts.md §1. Reine DOM-Ansicht, kein three.
// Der Balken erscheint bei Schaden und blendet nach voller Regeneration aus (Farbe grün → rot). Dazu: Sterne-Effekt mit
// Kamerawackel-Hook, K.O.-Schwarzblende mit Sternen, dezente Schutz-Anzeige. Alle Texte per textContent.
//   createEnergyHud(host, { touch, reduced() → bool, onShake(stärke 0..1, ms) }) →
//     { set(0..100), show(on), hit(stärke 0..1), knockout({ hold, onBlack, onDone }) → bool, shield(ms), isVisible(), dispose(), el }
// Wackeln nur, wenn nicht prefers-reduced-motion; die Sterne bleiben dann ohne Bewegung stehen.

export const REGEN_HIDE_MS = 1400; // nach voller Energie noch kurz sichtbar
export const SHIELD_MS = 10000;
const KO_FADE_MS = 700;
export const KO_HOLD_MS = 1600;

/** Farbe zu Energie 0..100: grün (120°) → rot (0°). */
export function energyColor(v) {
  const k = Math.max(0, Math.min(100, Number(v) || 0)) / 100;
  return 'hsl(' + Math.round(k * 120) + ', 72%, ' + Math.round(46 + (1 - k) * 4) + '%)';
}

const reducedDefault = () => {
  try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};
const div = (cls, parent) => {
  const d = document.createElement('div');
  d.className = cls;
  if (parent) parent.appendChild(d);
  return d;
};
const STAR = ['★', '✦', '✶'];

export function createEnergyHud(host, opts = {}) {
  const reduced = typeof opts.reduced === 'function' ? opts.reduced : reducedDefault;
  const root = div('lfx-store-fight-energy' + (opts.touch ? ' is-touch' : ' is-desk'));
  root.setAttribute('role', 'progressbar');
  root.setAttribute('aria-label', 'Energie');
  root.setAttribute('aria-valuemin', '0');
  root.setAttribute('aria-valuemax', '100');
  root.hidden = true;
  const label = div('lfx-store-fight-energy-label', root);
  label.textContent = 'Energie';
  const track = div('lfx-store-fight-energy-track', root);
  const fill = div('lfx-store-fight-energy-fill', track);
  const shieldEl = div('lfx-store-fight-shield', null);
  shieldEl.hidden = true;
  shieldEl.textContent = 'Schutz';
  const stars = div('lfx-store-fight-stars', null);
  stars.setAttribute('aria-hidden', 'true');
  const ko = div('lfx-store-fight-ko', null);
  ko.setAttribute('aria-hidden', 'true');
  ko.hidden = true;
  const koStars = div('lfx-store-fight-ko-stars', ko);
  for (let i = 0; i < 6; i++) { const s = div('lfx-store-fight-ko-star', koStars); s.textContent = STAR[i % 3]; s.style.setProperty('--i', String(i)); }
  const koText = div('lfx-store-fight-ko-text', ko);
  koText.textContent = 'K.O.';
  if (host) for (const e of [root, shieldEl, stars, ko]) host.appendChild(e);

  let value = 100;
  let visible = false;
  let forced = false;
  let disposed = false;
  let hideTimer = 0;
  let shieldTimer = 0;
  let koTimers = [];
  let koBusy = false;

  const clear = (t) => { if (t) clearTimeout(t); return 0; };

  function paint() {
    fill.style.width = value.toFixed(1) + '%';
    fill.style.background = energyColor(value);
    root.setAttribute('aria-valuenow', String(Math.round(value)));
  }
  function setVisible(on) {
    visible = !!on;
    root.hidden = !visible;
    root.classList.toggle('is-low', visible && value <= 30);
  }

  function set(v) {
    if (disposed) return;
    const n = Math.max(0, Math.min(100, Number(v)));
    if (!Number.isFinite(n)) return;
    const was = value;
    value = n;
    paint();
    if (n < 100) {
      hideTimer = clear(hideTimer);
      setVisible(true);
    } else if (was < 100 && visible && !forced) {
      // volle Regeneration: kurz stehen lassen, dann ausblenden
      hideTimer = clear(hideTimer);
      root.classList.remove('is-low');
      hideTimer = setTimeout(() => { hideTimer = 0; if (value >= 100 && !forced) setVisible(false); }, REGEN_HIDE_MS);
    } else root.classList.toggle('is-low', visible && n <= 30);
  }

  function show(on) {
    if (disposed) return;
    forced = !!on;
    hideTimer = clear(hideTimer);
    if (forced) setVisible(true);
    else setVisible(value < 100);
  }

  /** Treffer: Sterne, Wackeln (nicht bei reduzierter Bewegung). stärke 0..1. */
  function hit(strength = 0.5) {
    if (disposed) return;
    const k = Math.max(0, Math.min(1, Number(strength) || 0));
    const calm = reduced();
    const n = calm ? 2 : 3 + Math.round(k * 3);
    for (let i = 0; i < n; i++) {
      const s = div('lfx-store-fight-star' + (calm ? ' is-calm' : ''), stars);
      s.textContent = STAR[i % 3];
      const a = (i / n) * Math.PI * 2 + k;
      s.style.setProperty('--dx', (Math.cos(a) * 54).toFixed(0) + 'px');
      s.style.setProperty('--dy', (Math.sin(a) * 36 - 10).toFixed(0) + 'px');
      s.style.left = (42 + (i * 37) % 16) + '%';
      s.style.top = (40 + (i * 23) % 14) + '%';
      setTimeout(() => { if (s.parentNode) s.parentNode.removeChild(s); }, 900);
    }
    if (!calm && typeof opts.onShake === 'function') { try { opts.onShake(0.3 + k * 0.7, 260); } catch { /* Wackeln ist optional */ } }
  }

  /** K.O.: Schwarzblende mit Sternen. onBlack() bei vollem Schwarz (hier Drop und Umsetzen), danach Aufblenden, onDone() am Ende. */
  function knockout(o = {}) {
    if (disposed || koBusy) return false;
    koBusy = true;
    const hold = o.hold > 0 ? o.hold : KO_HOLD_MS;
    const fade = reduced() ? 0 : KO_FADE_MS;
    ko.hidden = false;
    ko.style.setProperty('--lfx-fight-ko-fade', fade + 'ms');
    ko.classList.remove('is-out');
    void ko.offsetWidth;
    ko.classList.add('is-in');
    const later = (fn, ms) => { koTimers.push(setTimeout(fn, ms)); };
    later(() => { if (typeof o.onBlack === 'function') { try { o.onBlack(); } catch { /* egal */ } } }, fade);
    later(() => { ko.classList.remove('is-in'); ko.classList.add('is-out'); }, fade + hold);
    later(() => {
      ko.classList.remove('is-out');
      ko.hidden = true;
      koTimers = [];
      koBusy = false;
      if (typeof o.onDone === 'function') { try { o.onDone(); } catch { /* egal */ } }
    }, fade * 2 + hold);
    return true;
  }

  /** Schutz-Anzeige (Standard 10 s), dezent. */
  function shield(ms = SHIELD_MS) {
    if (disposed) return;
    shieldTimer = clear(shieldTimer);
    if (!(ms > 0)) { shieldEl.hidden = true; return; }
    shieldEl.hidden = false;
    shieldTimer = setTimeout(() => { shieldTimer = 0; shieldEl.hidden = true; }, ms);
  }

  paint();
  return {
    el: root,
    set,
    show,
    hit,
    knockout,
    shield,
    isVisible: () => visible,
    dispose() {
      if (disposed) return;
      disposed = true;
      hideTimer = clear(hideTimer);
      shieldTimer = clear(shieldTimer);
      koTimers.forEach(clearTimeout);
      koTimers = [];
      for (const e of [root, shieldEl, stars, ko]) if (e.parentNode) e.parentNode.removeChild(e);
    },
  };
}

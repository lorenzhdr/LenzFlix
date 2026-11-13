// LENZ LIVE · Karten im Bild: Pausenbild („Gleich: …“ mit Countdown), Testbild, Störbild und Hinweis-Banner (Füllprogramm).
import { h } from './tv.js';
import { createLogo } from './logos.js';

export const ERROR_TEXTS = {
  video: { title: 'Kein Empfang auf diesem Gerät', sub: 'Dieses Gerät kann den Sender nicht empfangen' },
  browser: { title: 'Kein Empfang auf diesem Gerät', sub: 'Bitte einen anderen Browser verwenden' },
  audio: { title: 'Ton auf diesem Gerät nicht empfangbar', sub: 'Dem Konto fehlt die Berechtigung zur Ton-Umwandlung' },
  gesture: { title: 'Zum Starten tippen', sub: 'Der Browser braucht einmal ein Tippen' },
  network: { title: 'Empfangsstörung – erneuter Versuch …', sub: '' },
};

export function errorText(reason) {
  return ERROR_TEXTS[reason] || ERROR_TEXTS.network;
}

function mmss(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * @param {HTMLElement} container  .lfx-live-screen
 * @param {object} o { formatClock(t), doc?, win? }
 */
export function createCard(container, { formatClock = (t) => new Date(t).toTimeString().slice(0, 5), doc = document, win = window, onKind } = {}) {
  const el = h(doc, 'div', 'lfx-live-card');
  el.hidden = true;
  const banner = h(doc, 'div', 'lfx-live-banner');
  banner.hidden = true;
  container.append(el, banner);

  let kind = null;
  let until = 0;
  let clockEl = null;
  let countEl = null;
  let bannerT = null;

  // Kartenwechsel melden: onKind(kind|null, reason|null) – die App steuert damit die Pausenmusik.
  function notify() {
    if (typeof onKind === 'function') { try { onKind(kind, kind === 'error' ? el.dataset.reason || null : null); } catch { /* egal */ } }
  }

  function reset(k) {
    el.textContent = '';
    el.hidden = false;
    el.dataset.kind = k;
    delete el.dataset.code;
    kind = k;
    clockEl = null;
    countEl = null;
  }

  return {
    el,
    banner,
    kind: () => kind,

    /** { channel, title, at (ms), until (ms), now } */
    showPause({ channel, title, at, until: end, now }) {
      reset('pause');
      until = end || 0;
      el.append(createLogo(channel, { doc, number: true }));
      el.append(h(doc, 'div', 'lfx-live-card__kicker', 'Kurze Pause'));
      const line = title && at ? `Gleich: ${title} um ${formatClock(at)}` : 'Gleich geht es weiter';
      el.append(h(doc, 'div', 'lfx-live-card__title', line));
      countEl = h(doc, 'div', 'lfx-live-card__count');
      el.append(countEl);
      this.tick(now == null ? Date.now() : now);
      notify();
    },

    /** { channel, text, sub, now } – eigenes Testbild: Farbbalken, Kreis, Logo, Uhrzeit. */
    showTest({ channel, text, sub, now }) {
      reset('test');
      const bars = h(doc, 'div', 'lfx-live-card__bars');
      for (let i = 0; i < 7; i++) bars.append(h(doc, 'span', `lfx-live-card__bar lfx-live-card__bar--${i}`));
      const mid = h(doc, 'div', 'lfx-live-card__mid');
      mid.append(h(doc, 'span', 'lfx-live-card__circle'), createLogo(channel, { doc, number: true }));
      clockEl = h(doc, 'div', 'lfx-live-card__clock');
      const grey = h(doc, 'div', 'lfx-live-card__grey');
      for (let i = 0; i < 8; i++) grey.append(h(doc, 'span', `lfx-live-card__step lfx-live-card__step--${i}`));
      el.append(bars, mid, grey, h(doc, 'div', 'lfx-live-card__title', text || ''));
      if (sub) el.append(h(doc, 'div', 'lfx-live-card__sub', sub));
      el.append(clockEl);
      this.tick(now == null ? Date.now() : now);
      notify();
    },

    /** Störbild je Grund (video|browser|audio|network); code (optional): Kurzcode („Code: X“); hint (optional): Grund, z. B. „Bildformat h264 HDR“. */
    showError(reason, channel, code, hint) {
      reset('error');
      const t = errorText(reason);
      el.dataset.reason = ERROR_TEXTS[reason] ? reason : 'network';
      if (code) el.dataset.code = String(code);
      el.append(h(doc, 'div', 'lfx-live-card__snow'));
      if (channel) el.append(createLogo(channel, { doc, number: true }));
      el.append(h(doc, 'div', 'lfx-live-card__title', t.title));
      if (t.sub) el.append(h(doc, 'div', 'lfx-live-card__sub', t.sub));
      if (hint) {
        const x = h(doc, 'div', 'lfx-live-card__hint', `${hint} wird von diesem Gerät nicht unterstützt`);
        x.style.fontSize = '0.85em';
        x.style.opacity = '0.8';
        el.append(x);
      }
      if (code) {
        const c = h(doc, 'div', 'lfx-live-card__code', `Code: ${code}`);
        c.style.fontSize = '0.7em';
        c.style.opacity = '0.7';
        el.append(c);
      }
      notify();
    },

    showBanner(text, ms = 10000) {
      banner.textContent = text;
      banner.hidden = false;
      win.clearTimeout(bannerT);
      if (ms) bannerT = win.setTimeout(() => { banner.hidden = true; }, ms);
    },
    hideBanner() { win.clearTimeout(bannerT); banner.hidden = true; },

    hide() {
      const was = kind;
      el.hidden = true;
      el.textContent = '';
      delete el.dataset.kind;
      delete el.dataset.code;
      kind = null;
      clockEl = null;
      countEl = null;
      if (was) notify();
    },

    /** Jede Sekunde: Countdown bzw. Uhr im Testbild. */
    tick(now) {
      if (countEl) countEl.textContent = until ? `in ${mmss(until - now)}` : '';
      if (clockEl) clockEl.textContent = formatClock(now);
    },

    dispose() { win.clearTimeout(bannerT); el.remove(); banner.remove(); },
  };
}

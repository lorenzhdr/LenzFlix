// LENZ LIVE · OSD: Kanalnummer + Logo (oben rechts), Jetzt/Danach-Leiste mit Fortschritt (unten), Lautstärke, Eingabe, Hinweise, Info.
import { h } from './tv.js';
import { createLogo } from './logos.js';

const SHOW_MS = 5000;
const INFO_MS = 8000;

/**
 * @param {HTMLElement} container  .lfx-live-screen (OSD wird angehängt)
 * @param {object} o { doc? }
 */
export function createOsd(container, { doc = document, win = window } = {}) {
  const el = h(doc, 'div', 'lfx-live-osd');
  el.setAttribute('aria-live', 'polite');
  const chBox = h(doc, 'div', 'lfx-live-osd__ch');
  const chNo = h(doc, 'span', 'lfx-live-osd__no');
  const logoHost = h(doc, 'span', 'lfx-live-osd__logo');
  chBox.append(chNo, logoHost);

  const input = h(doc, 'div', 'lfx-live-osd__input');
  const msg = h(doc, 'div', 'lfx-live-osd__msg');

  const vol = h(doc, 'div', 'lfx-live-osd__vol');
  const volLabel = h(doc, 'span', 'lfx-live-osd__vol-label', 'Lautstärke');
  const volRail = h(doc, 'span', 'lfx-live-osd__vol-rail');
  const volFill = h(doc, 'span', 'lfx-live-osd__vol-fill');
  volRail.append(volFill);
  const volNum = h(doc, 'span', 'lfx-live-osd__vol-num');
  const volHint = h(doc, 'span', 'lfx-live-osd__vol-hint');
  vol.append(volLabel, volRail, volNum, volHint);

  const bar = h(doc, 'div', 'lfx-live-osd__bar');
  const nowRow = h(doc, 'div', 'lfx-live-osd__row lfx-live-osd__row--now');
  const nowTime = h(doc, 'span', 'lfx-live-osd__time');
  const nowTitle = h(doc, 'span', 'lfx-live-osd__title');
  const nowBadges = h(doc, 'span', 'lfx-live-osd__badges');
  nowRow.append(nowTime, nowTitle, nowBadges);
  const rail = h(doc, 'div', 'lfx-live-osd__progress');
  const fill = h(doc, 'span', 'lfx-live-osd__progress-fill');
  rail.append(fill);
  const nextRow = h(doc, 'div', 'lfx-live-osd__row lfx-live-osd__row--next');
  const nextTime = h(doc, 'span', 'lfx-live-osd__time');
  const nextTitle = h(doc, 'span', 'lfx-live-osd__title');
  nextRow.append(nextTime, nextTitle);
  bar.append(nowRow, rail, nextRow);

  const info = h(doc, 'div', 'lfx-live-osd__info');
  const infoTitle = h(doc, 'div', 'lfx-live-osd__info-title');
  const infoSub = h(doc, 'div', 'lfx-live-osd__info-sub');
  const infoMeta = h(doc, 'div', 'lfx-live-osd__info-meta');
  const infoBadges = h(doc, 'div', 'lfx-live-osd__badges');
  const infoTime = h(doc, 'div', 'lfx-live-osd__info-time');
  const infoNext = h(doc, 'div', 'lfx-live-osd__info-next');
  info.append(infoTitle, infoSub, infoMeta, infoBadges, infoTime, infoNext);

  el.append(chBox, input, msg, vol, bar, info);
  container.append(el);

  const T = {};
  function timer(name, cls, ms) {
    el.classList.add(cls);
    win.clearTimeout(T[name]);
    if (ms) T[name] = win.setTimeout(() => el.classList.remove(cls), ms);
  }

  function badges(host, list) {
    host.textContent = '';
    for (const b of list || []) host.append(h(doc, 'span', 'lfx-live-osd__badge', b));
  }

  let lastLogoNo = null;

  return {
    el,

    /** data: { no, channel, title, sub, from, to, badges[], progress, next: { title, from } | null } */
    showChannel(data, ms = SHOW_MS) {
      chNo.textContent = String(data.no);
      if (lastLogoNo !== data.no) {
        logoHost.textContent = '';
        logoHost.append(createLogo(data.channel, { doc }));
        lastLogoNo = data.no;
      }
      nowTime.textContent = data.from && data.to ? `${data.from} – ${data.to}` : '';
      nowTitle.textContent = data.sub ? `${data.title} · ${data.sub}` : (data.title || '');
      badges(nowBadges, data.badges);
      fill.style.width = `${Math.round(Math.max(0, Math.min(1, data.progress || 0)) * 100)}%`;
      rail.classList.toggle('is-empty', data.progress == null);
      nextTime.textContent = data.next ? `Danach ${data.next.from}` : '';
      nextTitle.textContent = data.next ? data.next.title : '';
      nextRow.hidden = !data.next;
      timer('ch', 'is-ch', ms);
    },

    setProgress(f) {
      if (f == null) return;
      fill.style.width = `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`;
    },

    /** Erweitertes OSD; erneuter Aufruf bei sichtbarem Info schließt es. */
    showInfo(data) {
      if (el.classList.contains('is-info')) { this.hideInfo(); return; }
      infoTitle.textContent = data.title || '';
      infoSub.textContent = data.sub || '';
      infoMeta.textContent = (data.meta || []).join(' · ');
      badges(infoBadges, data.badges);
      infoTime.textContent = data.from && data.to ? `${data.from} – ${data.to}` : '';
      infoNext.textContent = data.next ? `Danach ${data.next.from}: ${data.next.title}` : '';
      this.showChannel(data, INFO_MS);
      timer('info', 'is-info', INFO_MS);
    },
    hideInfo() { win.clearTimeout(T.info); el.classList.remove('is-info'); },

    showInput(text) {
      input.textContent = text;
      timer('input', 'is-input', 0);
    },
    clearInput() { win.clearTimeout(T.input); el.classList.remove('is-input'); },

    /** { percent, muted, hint } */
    showVolume({ percent, muted, hint, hintOnly }) {
      volFill.style.width = `${muted ? 0 : percent}%`;
      volNum.textContent = muted ? 'Stumm' : `${percent}`;
      volHint.textContent = hint || '';
      // hintOnly (feste Gerätelautstärke): kein Balken/Pegel, nur Stumm/Ton an + Hinweis
      volLabel.textContent = hintOnly ? (muted ? 'Stumm' : 'Ton an') : 'Lautstärke';
      vol.classList.toggle('is-hint-only', !!hintOnly);
      el.classList.toggle('is-muted', !!muted);
      timer('vol', 'is-vol', hint ? 4000 : 2000);
    },

    showMessage(text, ms = 3000) {
      msg.textContent = text;
      timer('msg', 'is-msg', ms);
    },
    hideMessage() { win.clearTimeout(T.msg); el.classList.remove('is-msg'); },

    hide() {
      for (const k of Object.keys(T)) win.clearTimeout(T[k]);
      el.classList.remove('is-ch', 'is-vol', 'is-msg', 'is-info', 'is-input', 'is-muted');
    },
    dispose() {
      for (const k of Object.keys(T)) win.clearTimeout(T[k]);
      el.remove();
    },
  };
}

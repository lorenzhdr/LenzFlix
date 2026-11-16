// LenzFlix: eigener Toast (eine Meldung gleichzeitig).
// Screenreader: Die sichtbare Meldung ist aria-hidden; angesagt wird über eine eigene, schon eingehängte
// (leere) Live-Region, deren Text erst kurz danach gesetzt wird (frisch eingefügte Regionen werden oft nicht vorgelesen).
import { mountPoint, unmountPoint, h } from './dom.js';

const ID = 'lfx-toast';
const LIVE_ID = 'lfx-toast-live';
const ANNOUNCE_DELAY_MS = 100;
let hideTimer = null;
let removeTimer = null;
let liveTimer = null;

function clearTimers() {
  clearTimeout(hideTimer);
  clearTimeout(removeTimer);
  clearTimeout(liveTimer);
  hideTimer = removeTimer = liveTimer = null;
}

function announce(text) {
  const fresh = !document.getElementById(LIVE_ID);
  const live = mountPoint(LIVE_ID);
  if (fresh) {
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
  }
  live.textContent = '';
  liveTimer = setTimeout(() => {
    liveTimer = null;
    live.textContent = text;
  }, ANNOUNCE_DELAY_MS);
}

export function toast(text, { duration = 3000 } = {}) {
  clearTimers();
  const msg = String(text);
  announce(msg);
  const root = mountPoint(ID, { className: 'lfx-toast' });
  root.classList.remove('is-leaving');
  root.setAttribute('aria-hidden', 'true');
  root.replaceChildren(h('div', { class: 'lfx-toast__msg' }, [msg]));
  hideTimer = setTimeout(() => {
    root.classList.add('is-leaving');
    removeTimer = setTimeout(() => {
      unmountPoint(root);
      const live = document.getElementById(LIVE_ID);
      if (live) live.textContent = '';
      hideTimer = removeTimer = null;
    }, 200);
  }, duration);
}

export function clearToast() {
  clearTimers();
  unmountPoint(ID);
  unmountPoint(LIVE_ID);
}

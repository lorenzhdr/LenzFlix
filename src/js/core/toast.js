// LenzFlix: eigener Toast (eine Meldung gleichzeitig).
import { mountPoint, unmountPoint, h } from './dom.js';

const ID = 'lfx-toast';
let hideTimer = null;
let removeTimer = null;

function clearTimers() {
  clearTimeout(hideTimer);
  clearTimeout(removeTimer);
  hideTimer = removeTimer = null;
}

export function toast(text, { duration = 3000 } = {}) {
  clearTimers();
  const root = mountPoint(ID, { className: 'lfx-toast' });
  root.classList.remove('is-leaving');
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.replaceChildren(h('div', { class: 'lfx-toast__msg' }, [String(text)]));
  hideTimer = setTimeout(() => {
    root.classList.add('is-leaving');
    removeTimer = setTimeout(() => {
      unmountPoint(root);
      hideTimer = removeTimer = null;
    }, 200);
  }, duration);
}

export function clearToast() {
  clearTimers();
  unmountPoint(ID);
}

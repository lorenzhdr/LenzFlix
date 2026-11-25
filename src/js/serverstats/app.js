// Server-Statistik: Hülle der Unteransicht (Reiter, Sichtbarkeit, Aufräumen).
import { h } from './dom.js';
import { createMonthTab } from './tab-month.js';
import { createNowTab } from './tab-now.js';
import { createServerTab } from './tab-server.js';

const DEFS = {
  now: ['Jetzt', createNowTab],
  month: ['Monat', createMonthTab],
  server: ['Server', createServerTab],
};
const ORDER = ['now', 'month', 'server'];

let uid = 0;

export function create(deps) {
  const d = deps && typeof deps === 'object' ? deps : {};
  const given = Array.isArray(d.tabs) ? d.tabs : [];
  let ids = ORDER.filter((id) => given.includes(id));
  if (!ids.length) ids = ['now'];
  const base = 'lfx-srv-' + ++uid;

  const status = h('p', {
    class: 'lfx-srv__sr',
    role: 'status',
    'aria-live': 'polite',
  });
  let lastSay = '';
  const ctx = {
    say(t) {
      if (t && t !== lastSay) status.textContent = t;
      lastSay = t;
    },
  };
  const bar = h('div', {
    class: 'lfx-srv__tabs',
    role: 'tablist',
    'aria-label': 'Server-Statistik',
  });
  const panels = h('div', { class: 'lfx-srv__panels' });
  const el = h('div', { class: 'lfx-srv' }, [bar, panels, status]);
  const tabs = {};
  let active = '';
  let disposed = false;

  function tabOf(id) {
    if (!tabs[id]) {
      const t = DEFS[id][1](d, ctx);
      t.panel = h(
        'div',
        {
          class: 'lfx-srv__panel',
          role: 'tabpanel',
          id: `${base}-p-${id}`,
          'aria-labelledby': `${base}-t-${id}`,
          hidden: true,
        },
        t.el,
      );
      panels.append(t.panel);
      tabs[id] = t;
    }
    return tabs[id];
  }

  function select(id, focus) {
    if (disposed) return;
    if (active && tabs[active]) {
      tabs[active].stop();
      tabs[active].panel.hidden = true;
    }
    active = id;
    for (const b of bar.children) {
      const on = b.dataset.id === id;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle('is-on', on);
      if (on && focus) b.focus();
    }
    const t = tabOf(id);
    t.panel.hidden = false;
    if (!document.hidden) t.start();
  }

  function onKey(e) {
    const i = ids.indexOf(active);
    let n = -1;
    if (e.key === 'ArrowRight') n = (i + 1) % ids.length;
    else if (e.key === 'ArrowLeft') n = (i - 1 + ids.length) % ids.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = ids.length - 1;
    if (n < 0) return;
    e.preventDefault();
    select(ids[n], true);
  }
  bar.addEventListener('keydown', onKey);

  for (const id of ids) {
    bar.append(
      h(
        'button',
        {
          type: 'button',
          class: 'lfx-srv__tab',
          role: 'tab',
          id: `${base}-t-${id}`,
          'aria-controls': `${base}-p-${id}`,
          'aria-selected': 'false',
          tabindex: '-1',
          'data-id': id,
          onclick: () => select(id),
        },
        DEFS[id][0],
      ),
    );
  }

  function onVis() {
    const t = tabs[active];
    if (disposed || !t) return;
    if (document.hidden) t.stop();
    else t.start();
  }
  document.addEventListener('visibilitychange', onVis);

  select(ids[0]);

  return {
    el,
    dispose() {
      if (disposed) return;
      disposed = true;
      document.removeEventListener('visibilitychange', onVis);
      bar.removeEventListener('keydown', onKey);
      for (const id of Object.keys(tabs)) {
        try {
          tabs[id].dispose();
        } catch {
          // bewusst still
        }
      }
    },
  };
}

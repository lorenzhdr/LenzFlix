// TV-OSD-Menü: TV-Stil, Senderliste, Senderbelegung (Admin), Mediathek, Design, Dashboard (Admin), Abmelden.
import { h, flag, labelOk, buildChannelLine, shortName } from './overlay-util.js';

const FIRST = 5;
const LAST = 16;

export function createMenu(ctx) {
  const el = h('div', 'lfx-live-menu');
  el.hidden = true;
  const panel = h('div', 'lfx-live-menu__panel');
  el.append(panel);

  let opened = false;
  let stack = []; // [{ id, arg?, focus }]
  let current = []; // Einträge der sichtbaren Ansicht
  let sel = {}; // Senderbelegung { no: label }
  let lineEl = null;

  const isAdmin = () => flag(ctx.isAdmin);
  const prev = () => ctx.previousThemeName || 'Mediathek';
  const chans = () => {
    const l = ctx.channels ? ctx.channels() : ctx.scheduler.channels();
    return Array.isArray(l) ? l : [];
  };
  const top = () => stack[stack.length - 1];

  function loadSel() {
    sel = {};
    const cfg = ctx.channelConfig || {};
    for (let no = FIRST; no <= LAST; no++) {
      const v = cfg[no];
      if (labelOk(v)) sel[no] = v.trim();
    }
  }

  const push = (id, arg, focus) => {
    stack.push({ id, arg, focus: focus || 0 });
    render();
  };
  const pop = () => {
    stack.pop();
    render();
  };
  const closeThen = (fn) => {
    ctx.closeOverlay();
    fn();
  };

  // ---- Ansichten: { title, items:[{label, value, check, act, cls}], extra?: Node[] }
  function viewMain() {
    const items = [
      { label: 'TV-Stil', value: (ctx.styles.find((s) => s.id === ctx.style()) || {}).name || '', act: () => push('style') },
      { label: 'Senderliste', act: () => push('channels') },
    ];
    if (isAdmin()) items.push({ label: 'Senderbelegung', act: () => { loadSel(); push('assign'); } });
    items.push({ label: `Mediathek (${prev()})`, act: () => closeThen(() => ctx.leaveToLibrary(null)) });
    items.push({ label: 'Design wechseln', act: () => closeThen(() => ctx.openThemePicker()) });
    if (isAdmin()) items.push({ label: 'Dashboard', act: () => closeThen(() => ctx.openDashboard()) });
    items.push({ label: 'Abmelden', act: () => push('logout', null, 1) });
    return { title: 'Menü', items };
  }

  function viewStyle() {
    const cur = ctx.style();
    return {
      title: 'TV-Stil',
      items: ctx.styles.map((s) => ({
        label: s.name,
        check: s.id === cur,
        act: () => {
          ctx.setStyle(s.id);
          render();
        },
      })),
    };
  }

  function viewChannels() {
    const cur = ctx.currentChannel();
    return {
      title: 'Senderliste',
      items: chans().map((c) => ({
        label: `${c.no}  ${shortName(c) || c.name}`,
        check: c.no === cur,
        act: () => closeThen(() => ctx.tune(c.no)),
      })),
    };
  }

  function viewAssign() {
    const cs = chans();
    const items = [];
    for (let no = FIRST; no <= LAST; no++) {
      const c = cs.find((x) => x.no === no) || {};
      const cur = c.genreLabel || shortName(c);
      items.push({
        label: `Platz ${no}`,
        value: sel[no] ? sel[no] : `Automatisch${cur ? ' (derzeit ' + cur + ')' : ''}`,
        cls: sel[no] ? 'is-set' : '',
        act: () => push('pick', no),
      });
    }
    items.push({ label: 'Zeile kopieren', cls: 'is-primary', act: copyLine });
    items.push({ label: 'Zurück', act: pop });
    const line = buildChannelLine(sel);
    const extra = [];
    const used = {};
    Object.keys(sel).forEach((no) => {
      (used[sel[no]] = used[sel[no]] || []).push(no);
    });
    const dup = Object.keys(used).filter((l) => used[l].length > 1);
    if (dup.length) extra.push(h('p', 'lfx-live-menu__warn', 'Hinweis: ' + dup.map((l) => `„${l}“ ist mehrfach belegt (Plätze ${used[l].join(', ')})`).join('; ') + '.'));
    if (line) {
      lineEl = h('code', 'lfx-live-menu__line', line);
      extra.push(lineEl);
    } else {
      lineEl = null;
      extra.push(h('p', 'lfx-live-menu__note', 'Alles automatisch – keine Zeile nötig.'));
    }
    extra.push(h('p', 'lfx-live-menu__note', 'Im Jellyfin-Dashboard unter Branding → Benutzerdefiniertes CSS unterhalb der @import-Zeile einfügen (nie davor, sonst lädt das Theme nicht) und speichern. Die Belegung gilt nach dem Neuladen für alle Nutzer.'));
    return { title: 'Senderbelegung', items, extra, wide: true };
  }

  function viewPick(no) {
    const items = [
      {
        label: 'Automatisch',
        check: !sel[no],
        act: () => {
          delete sel[no];
          pop();
        },
      },
    ];
    let gs;
    try {
      gs = ctx.scheduler.genres() || [];
    } catch {
      gs = [];
    }
    gs.filter((g) => labelOk(g.label)).forEach((g) =>
      items.push({
        label: g.label,
        value: String(g.count),
        check: sel[no] === g.label,
        act: () => {
          sel[no] = g.label;
          pop();
        },
      })
    );
    return { title: `Platz ${no}: Genre wählen`, items };
  }

  function viewLogout() {
    return {
      title: 'Wirklich abmelden?',
      items: [
        { label: 'OK', act: () => closeThen(() => ctx.logout()) },
        { label: 'Zurück', act: pop },
      ],
    };
  }

  function view(s) {
    switch (s.id) {
      case 'style':
        return viewStyle();
      case 'channels':
        return viewChannels();
      case 'assign':
        return viewAssign();
      case 'pick':
        return viewPick(s.arg);
      case 'logout':
        return viewLogout();
      default:
        return viewMain();
    }
  }

  // ---- Senderbelegung kopieren
  function copyLine() {
    const line = buildChannelLine(sel);
    if (!line) {
      ctx.toast('Alles automatisch – keine Zeile nötig.');
      return;
    }
    const fallback = () => {
      if (lineEl) {
        try {
          const r = document.createRange();
          r.selectNodeContents(lineEl);
          const sl = window.getSelection();
          sl.removeAllRanges();
          sl.addRange(r);
        } catch {
          /* ignore */
        }
      }
      ctx.toast('Zeile markiert – bitte mit Strg+C kopieren.');
    };
    const cb = typeof navigator !== 'undefined' && navigator.clipboard;
    if (cb && typeof cb.writeText === 'function') {
      let p;
      try {
        p = cb.writeText(line);
      } catch {
        fallback();
        return;
      }
      Promise.resolve(p).then(() => ctx.toast('Zeile kopiert.'), fallback);
    } else fallback();
  }

  // ---- Rendern
  function render() {
    const s = top();
    if (!s) return;
    const v = view(s);
    current = v.items;
    s.focus = Math.max(0, Math.min(s.focus, current.length - 1));
    panel.textContent = '';
    panel.classList.toggle('is-wide', !!v.wide);
    panel.dataset.view = s.id;
    panel.append(h('h2', 'lfx-live-menu__title', v.title));
    const list = h('div', 'lfx-live-menu__list');
    list.setAttribute('role', 'menu');
    list.setAttribute('aria-label', v.title);
    current.forEach((it, i) => {
      const b = h('button', 'lfx-live-menu__item' + (it.cls ? ' ' + it.cls : ''));
      b.type = 'button';
      b.tabIndex = i === s.focus ? 0 : -1;
      if (it.check !== undefined) {
        b.setAttribute('role', 'menuitemradio');
        b.setAttribute('aria-checked', it.check ? 'true' : 'false');
        if (it.check) b.classList.add('is-checked');
      } else b.setAttribute('role', 'menuitem');
      if (i === s.focus) b.classList.add('is-focus');
      b.append(h('span', 'lfx-live-menu__label', it.label));
      if (it.value) b.append(h('span', 'lfx-live-menu__value', it.value));
      b.addEventListener('click', () => {
        s.focus = i;
        it.act();
      });
      list.append(b);
    });
    panel.append(list);
    (v.extra || []).forEach((n) => panel.append(n));
    const f = list.children[s.focus];
    if (opened && f) {
      try {
        f.focus({ preventScroll: true });
      } catch {
        /* ignore */
      }
      if (typeof f.scrollIntoView === 'function') f.scrollIntoView({ block: 'nearest' });
    }
  }

  function onKey(key) {
    if (!opened) return false;
    const s = top();
    switch (key) {
      case 'up':
      case 'down': {
        const n = current.length;
        if (n) {
          s.focus = (s.focus + (key === 'down' ? 1 : -1) + n) % n;
          render();
        }
        return true;
      }
      case 'ok':
        if (current[s.focus]) current[s.focus].act();
        return true;
      case 'left':
      case 'back':
        if (stack.length > 1) {
          pop();
          return true;
        }
        return key === 'left';
      case 'right':
        return true;
      default:
        return false;
    }
  }

  function open() {
    opened = true;
    el.hidden = false;
    el.classList.add('is-open');
    stack = [{ id: 'main', focus: 0 }];
    loadSel();
    render();
  }

  function close() {
    opened = false;
    el.hidden = true;
    el.classList.remove('is-open');
    stack = [];
  }

  return { el, open, close, isOpen: () => opened, onKey };
}

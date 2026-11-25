// Server-Statistik: Reiter „Jetzt“ (laufende Wiedergaben, 10-s-Kette nur bei sichtbarem Reiter).
import { createFetcher } from './api.js';
import { clear, errorBox, h } from './dom.js';
import { T, fmtClock, fmtMbps, isNum, num } from './format.js';

const POLL = 10000;
const DEV = { tv: 'TV', phone: 'Handy', web: 'Browser' };
const back = (n) => Math.min(60000, POLL * Math.pow(2, n));

export function createNowTab(deps, ctx) {
  const fetcher = createFetcher(deps.get);
  const head = h('p', { class: 'lfx-srv-now__head' });
  const hint = h('p', { class: 'lfx-srv-note', hidden: true }, T.down);
  const list = h('ul', { class: 'lfx-srv-list' });
  const errHost = h('div', { hidden: true });
  const el = h('div', { class: 'lfx-srv-now' }, [head, hint, list, errHost]);

  let running = false;
  let loaded = false;
  let down = false;
  let err = false;
  let fails = 0;
  let downN = 0;
  let data = { n: 0, mbps: null, rows: [] };
  let timer = 0;
  let tick = 0;
  let live = [];

  function stopTick() {
    if (tick) clearInterval(tick);
    tick = 0;
  }
  function onTick() {
    const now = Date.now();
    for (const it of live) {
      const pos = Math.min(it.dur, it.pos + (now - it.t0) / 1000);
      it.time.textContent = `${fmtClock(pos, it.dur >= 3600)} / ${fmtClock(it.dur, it.dur >= 3600)}`;
      it.fill.style.width = (pos / it.dur) * 100 + '%';
    }
  }

  function meta(r) {
    const bits = [];
    if (r.paused)
      bits.push(
        h(
          'span',
          {
            class: 'lfx-srv-pause',
            role: 'img',
            'aria-label': 'Pausiert',
          },
          '❚❚',
        ),
      );
    bits.push(h('span', { class: 'lfx-srv-chip' + (r.tc ? ' is-tc' : '') }, r.tc ? 'Umwandlung' : 'Direkt'));
    const mb = fmtMbps(r.mbps);
    if (mb) bits.push(h('span', { class: 'lfx-srv-chip' }, mb));
    if (DEV[r.dev]) bits.push(h('span', { class: 'lfx-srv-chip' }, DEV[r.dev]));
    return h('span', { class: 'lfx-srv-row__meta' }, bits);
  }

  function bar(frac) {
    const fill = h('span', {
      class: 'lfx-srv-bar__fill',
      style: { width: Math.max(0, Math.min(1, frac)) * 100 + '%' },
    });
    return { fill, el: h('span', { class: 'lfx-srv-bar' }, fill) };
  }

  function rowEl(r) {
    if (!r || typeof r !== 'object') return null;
    if (r.hidden) {
      const p = isNum(r.p) ? r.p : 0;
      return h(
        'li',
        {},
        h('div', { class: 'lfx-srv-row is-hidden' }, [
          h('span', { class: 'lfx-srv-row__cover is-empty' }),
          h('span', { class: 'lfx-srv-row__main' }, [
            h('span', { class: 'lfx-srv-row__title' }, 'Verborgener Titel'),
            bar(p).el,
            meta(r),
          ]),
        ]),
      );
    }
    const title = typeof r.title === 'string' && r.title ? r.title : 'Unbekannter Titel';
    const sub =
      r.t === 'episode'
        ? [isNum(r.s) ? 'S' + r.s : '', isNum(r.e) ? 'F' + r.e : '', r.ep || ''].filter(Boolean).join(' · ')
        : '';
    const dur = isNum(r.dur) && r.dur > 0 ? r.dur : 0;
    const pos = isNum(r.pos) && r.pos > 0 ? Math.min(r.pos, dur || r.pos) : 0;
    const src = r.img && deps.img ? deps.img(r.img.id, r.img.tag, 96) : null;
    const b = dur ? bar(pos / dur) : null;
    const time = dur
      ? h('span', { class: 'lfx-srv-row__time' }, `${fmtClock(pos, dur >= 3600)} / ${fmtClock(dur, dur >= 3600)}`)
      : null;
    if (dur && !r.paused) live.push({ fill: b.fill, time, pos, dur, t0: Date.now() });
    const label = [title, sub, r.paused ? 'pausiert' : 'läuft', r.me ? 'deine Wiedergabe' : '', 'Details öffnen']
      .filter(Boolean)
      .join(', ');
    return h(
      'li',
      {},
      h(
        'button',
        {
          type: 'button',
          class: 'lfx-srv-row',
          'aria-label': label,
          onclick: () => r.id != null && deps.openItem(r.id),
        },
        [
          src
            ? h('img', {
                class: 'lfx-srv-row__cover',
                src,
                alt: '',
                decoding: 'async',
                loading: 'lazy',
              })
            : h('span', { class: 'lfx-srv-row__cover is-empty' }),
          h('span', { class: 'lfx-srv-row__main' }, [
            h('span', { class: 'lfx-srv-row__title' }, [
              title,
              r.me ? h('span', { class: 'lfx-srv-badge' }, 'Du') : null,
            ]),
            sub ? h('span', { class: 'lfx-srv-row__sub' }, sub) : null,
            b ? b.el : null,
            time,
            meta(r),
          ]),
        ],
      ),
    );
  }

  function render() {
    stopTick();
    live = [];
    clear(list);
    clear(errHost);
    errHost.hidden = !err;
    hint.hidden = !down;
    if (err) {
      head.textContent = '';
      list.hidden = true;
      errHost.append(errorBox(retry));
      return;
    }
    list.hidden = false;
    if (!loaded) {
      head.textContent = down ? '' : T.loading;
      return;
    }
    const rows = data.rows;
    const n = isNum(data.n) ? data.n : rows.length;
    const mb = fmtMbps(data.mbps);
    head.textContent = n > 0 ? `${n === 1 ? '1 läuft' : num(n) + ' laufen'} gerade${mb ? ' · ' + mb : ''}` : T.idle;
    for (const r of rows) {
      const li = rowEl(r);
      if (li) list.append(li);
    }
    if (live.length && running) tick = setInterval(onTick, 1000);
  }

  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(poll, delay);
  }

  function onRes(r) {
    if (!running) return;
    const d = r && r.ok ? r.data : null;
    let delay = POLL;
    const wasErr = err;
    if (d && typeof d === 'object' && d.down) {
      down = true;
      fails = 0;
      err = false;
      delay = back(++downN);
    } else if (d && typeof d === 'object') {
      down = false;
      err = false;
      fails = 0;
      downN = 0;
      loaded = true;
      data = {
        n: d.n,
        mbps: d.mbps,
        rows: Array.isArray(d.rows) ? d.rows : [],
      };
    } else if (r && r.status === 429) {
      delay = 30000;
    } else {
      fails++;
      delay = back(fails);
      if (fails >= 2) err = true;
    }
    if (err && !wasErr) ctx.say(T.error);
    render();
    schedule(delay);
  }

  function poll() {
    if (!running) return;
    fetcher.run('/srv/now', onRes);
  }

  function retry() {
    fails = 0;
    err = false;
    loaded = false;
    render();
    clearTimeout(timer);
    poll();
  }

  function stop() {
    running = false;
    clearTimeout(timer);
    fetcher.abort();
    stopTick();
  }

  render();
  return {
    el,
    stop,
    dispose: stop,
    start() {
      if (running) return;
      running = true;
      render();
      poll();
    },
  };
}

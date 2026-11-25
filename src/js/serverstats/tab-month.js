// Server-Statistik: Reiter „Monat“ (Blättern, Antworten je Monat für die Lebensdauer der Instanz gemerkt).
import { createFetcher } from './api.js';
import { dayBars, heatmap, splitBar } from './charts.js';
import { clear, errorBox, h, note } from './dom.js';
import { T, fmtBytes, fmtDayShort, fmtDelta, fmtHm, isNum, monthName, num, pos0 } from './format.js';

export function createMonthTab(deps, ctx) {
  const fetcher = createFetcher(deps.get);
  let maxM = isNum(deps.maxM) && deps.maxM > 0 ? Math.floor(deps.maxM) : 0;
  let m = 0;
  let fails = 0;
  let retryT = 0;
  let running = false;
  let inflight = false;
  const cache = new Map();

  const prev = h(
    'button',
    {
      type: 'button',
      class: 'lfx-srv-nav',
      'aria-label': 'Vorheriger Monat',
      onclick: () => go(m + 1),
    },
    '‹',
  );
  const next = h(
    'button',
    {
      type: 'button',
      class: 'lfx-srv-nav',
      'aria-label': 'Nächster Monat',
      onclick: () => go(m - 1),
    },
    '›',
  );
  const label = h('span', { class: 'lfx-srv-monthnav__l' }, '…');
  const body = h('div', { class: 'lfx-srv-month__body' });
  const el = h('div', { class: 'lfx-srv-month' }, [h('div', { class: 'lfx-srv-monthnav' }, [prev, label, next]), body]);

  function buttons() {
    prev.disabled = m >= maxM;
    next.disabled = m <= 0;
  }

  function kpi(l, v) {
    return h('div', { class: 'lfx-srv-kpi' }, [
      h('span', { class: 'lfx-srv-kpi__v' }, v),
      h('span', { class: 'lfx-srv-kpi__l' }, l),
    ]);
  }

  function section(title, node) {
    return node ? h('section', { class: 'lfx-srv-sec' }, [h('h3', { class: 'lfx-srv-h' }, title), node]) : null;
  }

  function mixSection(d) {
    const mix = d && typeof d.mix === 'object' && d.mix ? d.mix : {};
    const dev = mix.dev || {};
    const method = mix.method || {};
    const type = mix.type || {};
    const groups = [
      [
        'Geräte',
        [
          { label: 'TV', value: dev.tv },
          { label: 'Handy', value: dev.phone },
          { label: 'Browser', value: dev.web },
          { label: 'Sonstige', value: dev.other },
        ],
      ],
      [
        'Wiedergabe',
        [
          { label: 'Direkt', value: method.direct },
          { label: 'Umwandlung', value: method.transcode },
        ],
      ],
      [
        'Inhalte',
        [
          { label: 'Filme', value: type.movie },
          { label: 'Folgen', value: type.episode },
        ],
      ],
    ];
    const nodes = [];
    for (const [t, parts] of groups) {
      const sb = splitBar(parts);
      if (sb) nodes.push(h('div', { class: 'lfx-srv-mixg' }, [h('span', { class: 'lfx-srv-mixg__t' }, t), sb]));
    }
    return nodes.length ? h('div', {}, nodes) : null;
  }

  function render(d, stale) {
    clear(body);
    if (!d) return;
    const t = d.totals || {};
    const secs = pos0(t.secs);
    const ps = d.prev ? pos0(d.prev.secs) : 0;
    const tx = d.tx && isNum(d.tx.tx) ? fmtBytes(d.tx.tx) : '–';
    if (stale) body.append(note(T.downStale));
    if (d.partial) body.append(note('Der Monat läuft noch, die Werte wachsen weiter.'));
    body.append(
      h('div', { class: 'lfx-srv-kpis' }, [
        kpi('Schauzeit', fmtHm(secs)),
        kpi('Upload', tx),
        kpi('ggü. Vormonat', fmtDelta(secs, ps)),
        kpi('Aktive Konten', isNum(t.users) ? num(t.users) : '–'),
      ]),
    );
    const days = Array.isArray(d.days) ? d.days : [];
    if (days.length) {
      const top = d.top && typeof d.top.d === 'string' ? d.top : null;
      const wrap = h('div', {}, [dayBars(days, top && top.d)]);
      if (top) wrap.append(h('p', { class: 'lfx-srv-note' }, `Rekordtag: ${fmtDayShort(top.d)} · ${fmtHm(top.secs)}`));
      body.append(section('Schauzeit pro Tag', wrap));
    }
    if (Array.isArray(d.heat) && d.heat.length) body.append(section('Stoßzeiten', heatmap(d.heat)));
    body.append(section('Mix', mixSection(d)));
  }

  function show(d, stale) {
    const name = d ? monthName(d.ym) : '';
    label.textContent = name || '…';
    buttons();
    render(d, stale);
    if (name) ctx.say(name);
  }

  function load() {
    clearTimeout(retryT);
    buttons();
    const want = m;
    if (cache.has(want)) {
      show(cache.get(want), false);
      return;
    }
    label.textContent = '…';
    clear(body).append(h('p', { class: 'lfx-srv-note' }, T.loading));
    inflight = true;
    fetcher.run('/srv/month?m=' + want, (r) => {
      inflight = false;
      if (!running || want !== m) return;
      const d = r && r.ok && r.data && typeof r.data === 'object' ? r.data : null;
      if (d && !d.error) {
        fails = 0;
        if (isNum(d.maxM)) maxM = Math.max(0, Math.floor(d.maxM));
        if (!d.stale) cache.set(want, d);
        show(d, !!d.stale);
        return;
      }
      if (r && r.status === 503) {
        fails = 0;
        label.textContent = '…';
        clear(body).append(note(T.down));
        return;
      }
      if (++fails < 2) {
        retryT = setTimeout(load, 3000);
        return;
      }
      clear(body).append(
        errorBox(() => {
          fails = 0;
          load();
        }),
      );
      ctx.say(T.error);
    });
  }

  function go(to) {
    const n = Math.max(0, Math.min(maxM, to));
    if (n === m) return;
    m = n;
    fails = 0;
    if (running) load();
  }

  function stop() {
    running = false;
    inflight = false;
    clearTimeout(retryT);
    fetcher.abort();
  }

  buttons();
  return {
    el,
    stop,
    dispose: stop,
    start() {
      if (running) return;
      running = true;
      if (!inflight) load();
    },
  };
}

// Server-Statistik: kleine Diagramme (DOM/SVG). Fehlende oder kaputte Werte werden weggelassen.
import { h, s } from './dom.js';
import { WEEKDAYS, fmtBytes, fmtDayShort, fmtHm, isNum, monthName, num, pos0 } from './format.js';

const pct = (v, max) => (max > 0 ? Math.max(0, Math.min(100, (v / max) * 100)) : 0);

/** Messbalken: frac 0..1, level '', 'warn' oder 'hot'. */
export function meter(frac, level, label) {
  const f = isNum(frac) ? Math.max(0, Math.min(1, frac)) : 0;
  return h(
    'span',
    {
      class: 'lfx-srv-meter' + (level ? ' is-' + level : ''),
      role: 'meter',
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-valuenow': Math.round(f * 100),
      'aria-label': label,
    },
    [
      h('span', {
        class: 'lfx-srv-meter__fill',
        style: { width: f * 100 + '%' },
      }),
    ],
  );
}

/** Tagesbalken des Monats; der Rekordtag ist hervorgehoben. */
export function dayBars(days, topD) {
  const list = (Array.isArray(days) ? days : []).filter((d) => d && typeof d.d === 'string');
  const max = list.reduce((a, d) => Math.max(a, pos0(d.secs)), 0);
  const wrap = h('div', {
    class: 'lfx-srv-days',
    role: 'img',
    'aria-label': 'Schauzeit pro Tag',
  });
  for (const d of list) {
    const secs = pos0(d.secs);
    wrap.append(
      h(
        'span',
        {
          class: 'lfx-srv-day' + (d.d === topD ? ' is-top' : ''),
          title: `${fmtDayShort(d.d)}: ${fmtHm(secs)}`,
        },
        [
          h('span', {
            class: 'lfx-srv-day__fill',
            style: { height: pct(secs, max) + '%' },
          }),
        ],
      ),
    );
  }
  return wrap;
}

/** Heatmap Mo–So × 0–23 Uhr. heat = [[dow(0=So), stunde, secs]]. */
export function heatmap(heat) {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const e of Array.isArray(heat) ? heat : []) {
    if (!Array.isArray(e)) continue;
    const dow = Math.floor(e[0]);
    const hr = Math.floor(e[1]);
    if (!(dow >= 0 && dow <= 6 && hr >= 0 && hr <= 23)) continue;
    grid[(dow + 6) % 7][hr] += pos0(e[2]);
  }
  let max = 0;
  for (const r of grid) for (const v of r) max = Math.max(max, v);
  const LW = 18;
  const C = 13;
  const svg = s('svg', {
    class: 'lfx-srv-heat',
    viewBox: `0 0 ${LW + 24 * C} ${7 * C + 12}`,
    role: 'img',
    'aria-label': 'Stoßzeiten nach Wochentag und Uhrzeit',
    preserveAspectRatio: 'xMidYMid meet',
  });
  const order = [1, 2, 3, 4, 5, 6, 0];
  grid.forEach((row, r) => {
    svg.append(s('text', { class: 'lfx-srv-heat__l', x: 0, y: r * C + 10 }, WEEKDAYS[order[r]].replace('.', '')));
    row.forEach((v, hr) => {
      const rect = s(
        'rect',
        {
          class: 'lfx-srv-heat__c' + (v > 0 ? '' : ' is-0'),
          x: LW + hr * C,
          y: r * C,
          width: C - 1.5,
          height: C - 1.5,
          rx: 2,
        },
        [s('title', {}, `${WEEKDAYS[order[r]]} ${hr} Uhr: ${fmtHm(v)}`)],
      );
      if (v > 0) rect.setAttribute('fill-opacity', (0.18 + 0.82 * (v / max)).toFixed(2));
      svg.append(rect);
    });
  });
  for (const hr of [0, 6, 12, 18])
    svg.append(s('text', { class: 'lfx-srv-heat__l', x: LW + hr * C, y: 7 * C + 10 }, String(hr)));
  return svg;
}

/** Geteilter Balken mit Legende. parts = [{label, value}]; Summe 0 → null. */
export function splitBar(parts) {
  const list = parts.filter((p) => pos0(p.value) > 0);
  const total = list.reduce((a, p) => a + p.value, 0);
  if (!total) return null;
  const bar = h('span', { class: 'lfx-srv-split__bar' });
  const legend = h('ul', { class: 'lfx-srv-split__legend' });
  list.forEach((p, i) => {
    bar.append(
      h('span', {
        class: 'lfx-srv-split__seg c' + i,
        style: { flexGrow: String(p.value) },
      }),
    );
    legend.append(
      h('li', {}, [
        h('i', { class: 'lfx-srv-split__dot c' + i }),
        `${p.label} ${Math.round((p.value / total) * 100) < 1 ? '< 1' : num(Math.round((p.value / total) * 100))} %`,
      ]),
    );
  });
  return h('div', { class: 'lfx-srv-split' }, [bar, legend]);
}

/** Traffic je Tag: pro Tag zwei schmale Säulen (Up = tx, Down = rx). */
export function trafficDays(days) {
  const list = (Array.isArray(days) ? days : []).filter((d) => d && typeof d.d === 'string');
  if (!list.length) return null;
  const max = list.reduce((a, d) => Math.max(a, pos0(d.tx), pos0(d.rx)), 0);
  const wrap = h('div', {
    class: 'lfx-srv-days is-traffic',
    role: 'img',
    'aria-label': 'Traffic pro Tag',
  });
  for (const d of list) {
    wrap.append(
      h(
        'span',
        {
          class: 'lfx-srv-day',
          title: `${fmtDayShort(d.d)}: Up ${fmtBytes(pos0(d.tx))}, Down ${fmtBytes(pos0(d.rx))}`,
        },
        [
          h('span', {
            class: 'lfx-srv-day__fill is-up',
            style: { height: pct(pos0(d.tx), max) + '%' },
          }),
          h('span', {
            class: 'lfx-srv-day__fill is-down',
            style: { height: pct(pos0(d.rx), max) + '%' },
          }),
        ],
      ),
    );
  }
  return wrap;
}

/** Traffic der letzten Monate als Balkenliste (neueste zuerst). */
export function trafficMonths(months) {
  const list = (Array.isArray(months) ? months : [])
    .filter((m) => m && monthName(m.ym))
    .slice(-12)
    .reverse();
  if (!list.length) return null;
  const max = list.reduce((a, m) => Math.max(a, pos0(m.tx) + pos0(m.rx)), 0);
  const ul = h('ul', { class: 'lfx-srv-months' });
  for (const m of list) {
    ul.append(
      h('li', { class: 'lfx-srv-months__row' }, [
        h('span', { class: 'lfx-srv-months__l' }, monthName(m.ym)),
        h('span', { class: 'lfx-srv-months__track' }, [
          h(
            'span',
            {
              class: 'lfx-srv-months__fill',
              style: {
                width: pct(pos0(m.tx) + pos0(m.rx), max) + '%',
              },
            },
            [
              h('span', {
                class: 'lfx-srv-months__up',
                style: { flexGrow: String(pos0(m.tx)) },
              }),
              h('span', {
                class: 'lfx-srv-months__down',
                style: { flexGrow: String(pos0(m.rx)) },
              }),
            ],
          ),
        ]),
        h('span', { class: 'lfx-srv-months__v' }, `↑ ${fmtBytes(pos0(m.tx))} · ↓ ${fmtBytes(pos0(m.rx))}`),
      ]),
    );
  }
  return ul;
}

export function legendUpDown() {
  return h('p', { class: 'lfx-srv-split__legend lfx-srv-legend' }, [
    h('span', {}, [h('i', { class: 'lfx-srv-split__dot c0' }), 'Up']),
    h('span', {}, [h('i', { class: 'lfx-srv-split__dot c1' }), 'Down']),
  ]);
}

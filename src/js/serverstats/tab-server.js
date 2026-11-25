// Server-Statistik: Reiter „Server“ (Zustand, Platten, Traffic, Bibliothek, Rekorde). Fehlende Abschnitte entfallen.
import { createFetcher } from './api.js';
import { legendUpDown, meter, trafficDays, trafficMonths } from './charts.js';
import { clear, errorBox, h, note } from './dom.js';
import { T, fmtAgo, fmtBytes, fmtDate, fmtHm, fmtUptime, isNum, monthName, num, plural, pos0 } from './format.js';

const REFRESH = 60000;

export function createServerTab(deps, ctx) {
  const fetcher = createFetcher(deps.get);
  const el = h('div', { class: 'lfx-srv-server' });
  let running = false;
  let loadedAt = 0;
  let fails = 0;
  let retryT = 0;

  const sec = (title, kids) => {
    const list = [].concat(kids).filter(Boolean);
    return list.length
      ? h('section', { class: 'lfx-srv-sec' }, [h('h3', { class: 'lfx-srv-h' }, title), ...list])
      : null;
  };
  const line = (l, v, extra) =>
    h('div', { class: 'lfx-srv-line' }, [
      h('span', { class: 'lfx-srv-line__l' }, l),
      h('span', { class: 'lfx-srv-line__v' }, v),
      extra || null,
    ]);
  const gauge = (l, v, frac, level) =>
    h('div', { class: 'lfx-srv-gauge' }, [
      h('div', { class: 'lfx-srv-line' }, [
        h('span', { class: 'lfx-srv-line__l' }, l),
        h('span', { class: 'lfx-srv-line__v' }, v),
      ]),
      meter(frac, level, l),
    ]);

  function health(hl) {
    if (!hl || typeof hl !== 'object') return null;
    const kids = [];
    if (hl.stale) kids.push(note(`Letzte Meldung des Servers vor ${fmtAgo(hl.ageS)}`));
    if (isNum(hl.tempC))
      kids.push(
        gauge(
          'Temperatur',
          `${num(hl.tempC, 0)} °C`,
          hl.tempC / 100,
          hl.tempC >= 80 ? 'hot' : hl.tempC >= 70 ? 'warn' : '',
        ),
      );
    if (isNum(hl.cpuPct)) kids.push(gauge('CPU', `${num(hl.cpuPct, 0)} %`, hl.cpuPct / 100, ''));
    const mem = hl.mem;
    if (mem && mem.total > 0 && isNum(mem.avail)) {
      const used = Math.max(0, mem.total - mem.avail);
      kids.push(gauge('Arbeitsspeicher', `${fmtBytes(used, 1)} von ${fmtBytes(mem.total, 1)}`, used / mem.total, ''));
    }
    const up = fmtUptime(hl.uptimeS);
    if (up) kids.push(line('Laufzeit', up));
    return sec('Zustand', kids);
  }

  function disks(d) {
    const list = d && Array.isArray(d.list) ? d.list.filter((x) => x && x.size > 0) : [];
    return sec(
      'Speicherplatz',
      list.map((x) =>
        h('div', { class: 'lfx-srv-gauge' }, [
          h('div', { class: 'lfx-srv-line' }, [
            h('span', { class: 'lfx-srv-line__l' }, String(x.l || 'Platte')),
            h('span', { class: 'lfx-srv-line__v' }, `${fmtBytes(pos0(x.used), 1)} von ${fmtBytes(x.size, 1)} belegt`),
          ]),
          meter(
            pos0(x.used) / x.size,
            x.used / x.size >= 0.9 ? 'hot' : x.used / x.size >= 0.8 ? 'warn' : '',
            String(x.l || 'Platte'),
          ),
        ]),
      ),
    );
  }

  function traffic(t) {
    if (!t || typeof t !== 'object') return null;
    const days = Array.isArray(t.days) ? t.days.filter((d) => d && typeof d.d === 'string') : [];
    const ym = days.length ? days[days.length - 1].d.slice(0, 7) : '';
    const cur = days.filter((d) => d.d.startsWith(ym));
    const kids = [];
    if (cur.length) kids.push(h('p', { class: 'lfx-srv-sub' }, monthName(ym)), trafficDays(cur));
    const months = trafficMonths(t.months);
    if (months) kids.push(h('p', { class: 'lfx-srv-sub' }, 'Letzte 12 Monate'), months);
    if (kids.length) kids.unshift(legendUpDown());
    return sec('Traffic', kids);
  }

  function library(l) {
    if (!l || typeof l !== 'object') return null;
    const kids = [];
    if (isNum(l.movies) && isNum(l.series) && isNum(l.episodes))
      kids.push(
        h(
          'p',
          { class: 'lfx-srv-p' },
          `${plural(l.movies, 'Film', 'Filme')} · ${num(l.series)} ${l.series === 1 ? 'Serie' : 'Serien'} · ${plural(l.episodes, 'Folge', 'Folgen')}`,
        ),
      );
    if (isNum(l.runtimeS) && l.runtimeS > 0)
      kids.push(line('Alles am Stück', plural(Math.round(l.runtimeS / 86400), 'Tag', 'Tage')));
    const cap = (n, one, many) => (l.newCapped && n >= 600 ? `600+ ${many}` : plural(n, one, many));
    if (isNum(l.newMovies) && isNum(l.newEpisodes)) {
      const mn = monthName(l.ym, true);
      kids.push(
        line(
          mn ? `Neu im ${mn}` : 'Neu',
          `${cap(l.newMovies, 'Film', 'Filme')} · ${cap(l.newEpisodes, 'Folge', 'Folgen')}`,
        ),
      );
    }
    return sec('Bibliothek', kids);
  }

  function records(r) {
    if (!r || typeof r !== 'object') return null;
    const kids = [];
    if (r.day && r.day.secs > 0) kids.push(line('Rekordtag', `${fmtHm(r.day.secs)} · ${fmtDate(r.day.d)}`));
    if (r.month && r.month.secs > 0)
      kids.push(line('Rekordmonat', `${fmtHm(r.month.secs)} · ${monthName(r.month.ym)}`));
    if (r.conc && r.conc.n > 0)
      kids.push(line('Meiste gleichzeitig', `${plural(r.conc.n, 'Stream', 'Streams')} · ${fmtDate(r.conc.date)}`));
    if (r.binge && r.binge.n > 0)
      kids.push(
        line(
          'Längster Serien-Marathon',
          `${plural(r.binge.n, 'Folge', 'Folgen')} an einem Tag · ${fmtDate(r.binge.date)}`,
        ),
      );
    if (r.tx && r.tx.bytes > 0) kids.push(line('Upload-Rekord', `${fmtBytes(r.tx.bytes)} · ${monthName(r.tx.ym)}`));
    if (kids.length && r.approx) kids.push(note('Ältere Werte sind Näherungen.'));
    return sec('Rekorde', kids);
  }

  function render(d) {
    clear(el);
    const parts = [health(d.health), disks(d.disks), traffic(d.traffic), library(d.library), records(d.records)].filter(
      Boolean,
    );
    if (parts.length) el.append(...parts);
    else el.append(note(T.noData));
  }

  function load() {
    clearTimeout(retryT);
    if (!loadedAt) clear(el).append(note(T.loading));
    fetcher.run('/srv/server', (r) => {
      if (!running) return;
      const d = r && r.ok && r.data && typeof r.data === 'object' ? r.data : null;
      if (d) {
        fails = 0;
        loadedAt = Date.now();
        render(d);
        return;
      }
      if (loadedAt) return;
      if (++fails < 2) {
        retryT = setTimeout(load, 3000);
        return;
      }
      clear(el).append(
        errorBox(() => {
          fails = 0;
          load();
        }),
      );
      ctx.say(T.error);
    });
  }

  function stop() {
    running = false;
    clearTimeout(retryT);
    fetcher.abort();
  }

  return {
    el,
    stop,
    dispose: stop,
    start() {
      if (running) return;
      running = true;
      if (!loadedAt || Date.now() - loadedAt > REFRESH) load();
    },
  };
}

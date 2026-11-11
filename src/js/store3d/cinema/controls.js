// VIDEOTHEK LENZ · VR-Kino: Bedienpanel (Fortschritt, Knöpfe, Tonspur/Untertitel, Platz, Up-Next).
// controlsSpec/trackSpec sind rein; createControls verwaltet die Panels (app.xr.openPanel) und die Sichtbarkeit.

export const SEAT_ORDER = ['front', 'mid', 'back'];
export const SEAT_LABEL = { front: 'vorn', mid: 'Mitte', back: 'hinten' };
export const AUTO_HIDE_MS = 6000;

/** m:ss bzw. h:mm:ss */
export function fmtTime(s) {
  const t = Math.max(0, Math.floor(Number.isFinite(s) ? s : 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

const clip = (s, n) => { const t = String(s == null ? '' : s); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/**
 * Spec des Hauptpanels. st = deps.cinema.state(); h = Handler { onTogglePause, onSeekBy(d), onSeekFrac(f), onPrev, onNext,
 * onTracks(kind), onVolume(delta), onSeat(name), onBack, onUpNext(action), onClose, seat }.
 */
export function controlsSpec(st, h) {
  const s = st || {};
  const dur = s.duration > 0 ? s.duration : 0;
  const t = dur ? Math.min(s.time || 0, dur) : (s.time || 0);
  const playing = s.phase === 'playing';
  const buttons = [];
  // Zeilen: 0 Up-Next, 1 Wiedergabe, 2 Ton/Lautstärke, 3 Platz, 4 Zurück (volle Breite, Text nicht abgeschnitten)
  if (s.upNext) {
    buttons.push({ row: 0, label: 'Jetzt starten', primary: true, onSelect: () => h.onUpNext('start') });
    buttons.push({ row: 0, label: 'Verbergen', onSelect: () => h.onUpNext('hide') });
  }
  buttons.push({ row: 1, label: playing ? 'Pause' : 'Weiter', primary: !s.upNext, onSelect: () => h.onTogglePause() });
  buttons.push({ row: 1, label: '−10 s', onSelect: () => h.onSeekBy(-10) });
  buttons.push({ row: 1, label: '+30 s', onSelect: () => h.onSeekBy(30) });
  if (s.hasPrev) buttons.push({ row: 1, label: '◀ Folge', onSelect: () => h.onPrev() });
  if (s.hasNext) buttons.push({ row: 1, label: 'Folge ▶', onSelect: () => h.onNext() });
  buttons.push({ row: 2, label: 'Tonspur', onSelect: () => h.onTracks('audio') });
  buttons.push({ row: 2, label: 'Untertitel', onSelect: () => h.onTracks('subtitle') });
  buttons.push({ row: 2, label: 'Leiser', onSelect: () => h.onVolume(-0.1) });
  buttons.push({ row: 2, label: 'Lauter', onSelect: () => h.onVolume(0.1) });
  for (const name of SEAT_ORDER) buttons.push({ row: 3, label: `Platz ${SEAT_LABEL[name]}`, on: h.seat === name, onSelect: () => h.onSeat(name) });
  buttons.push({ row: 4, label: 'Zurück in die Videothek', onSelect: () => h.onBack() });
  const pct = Math.round((Number.isFinite(s.volume) ? s.volume : 1) * 100);
  const vol = s.muted ? 'stumm' : pct >= 100 ? '100 % (max.)' : `${pct} %`;
  const spec = {
    title: clip(s.title || 'Kino', 70),
    lines: [`Lautstärke ${vol}`],
    progress: { value: dur ? t / dur : 0, label: `${fmtTime(t)} / ${fmtTime(dur)}`, onSeek: dur ? (f) => h.onSeekFrac(f) : undefined },
    buttons,
    width: 0.95,
    anchor: 'low',
    onClose: h.onClose,
  };
  if (s.upNext) spec.text = s.upNext.seconds > 0 ? `Nächste Folge in ${s.upNext.seconds} s` : 'Nächste Folge startet gleich';
  return spec;
}

/** Spec des Spurauswahl-Panels. rows = null (lädt) oder [{ id, label, selected }]. */
export function trackSpec(kind, rows, { busy = false, onPick, onBack, onClose } = {}) {
  const spec = {
    title: kind === 'audio' ? 'Tonspur' : 'Untertitel',
    buttons: [{ label: 'Zurück', onSelect: () => onBack() }],
    width: 0.9,
    anchor: 'front',
    onClose,
  };
  if (busy) spec.text = 'Wechsel läuft … das kann einige Sekunden dauern.';
  else if (!rows) spec.text = 'Lade …';
  else if (!rows.length) spec.text = 'Keine Einträge vorhanden.';
  else spec.list = { rows: rows.map((r) => ({ label: clip(r.label, 48), selected: !!r.selected, onSelect: () => onPick(r) })), visible: 6 };
  return spec;
}

/**
 * Panels und Sichtbarkeit. opts: { openPanel(spec), cinema (deps.cinema), getState(), getSeat(), onSeat(name), onBack(), toast(text) }.
 * Spielt das Video, blendet sich das Panel nach AUTO_HIDE_MS ohne Bedienung aus (nicht bei Up-Next/Spurauswahl).
 */
export function createControls({ openPanel, cinema, getState, getSeat, onSeat, onBack, toast }) {
  let main = null;
  let tracks = null;
  let trackToken = 0;
  let selfClose = false;
  let lastKey = '';
  let lastTouch = 0;
  let now = 0;
  let disposed = false;

  const state = () => (getState && getState()) || {};
  const closeHandle = (h) => { if (!h) return; selfClose = true; try { if (h.open !== false) h.close(); } catch { /* egal */ } selfClose = false; };

  const handlers = {
    get seat() { return getSeat(); },
    onTogglePause: () => { api.touch(); cinema.togglePause(); },
    onSeekBy: (d) => { api.touch(); cinema.seekBy(d); },
    onSeekFrac: (f) => { api.touch(); const d = state().duration; if (d > 0) cinema.seekTo(Math.max(0, Math.min(1, f)) * d); },
    onPrev: () => { api.touch(); cinema.prev(); },
    onNext: () => { api.touch(); cinema.next(); },
    onTracks: (kind) => { api.touch(); api.openTracks(kind); },
    onVolume: (d) => {
      api.touch();
      const st = state();
      const pct = Math.round((Number.isFinite(st.volume) ? st.volume : 1) * 100);
      if (d > 0) {
        if (pct >= 100) {
          if (st.muted) cinema.toggleMute();
          else if (toast) toast('Schon volle Lautstärke');
          return;
        }
        cinema.setVolume((Math.min(100, (Math.floor(pct / 10) + 1) * 10)) / 100);
      } else {
        if (pct <= 0) { if (toast) toast('Schon ganz leise'); return; }
        cinema.setVolume((Math.max(0, (Math.ceil(pct / 10) - 1) * 10)) / 100);
      }
    },
    onSeat: (name) => { api.touch(); onSeat(name); },
    onBack: () => onBack(),
    onUpNext: (a) => { api.touch(); cinema.upNext(a); },
    onClose: () => { if (selfClose) return; main = null; lastKey = ''; },
  };

  const keyOf = (st) => [st.title, Math.floor(st.time || 0), Math.floor(st.duration || 0), st.phase, st.hasPrev, st.hasNext,
    st.upNext ? `${st.upNext.seconds}|${st.upNext.text ? 1 : 0}` : '-', Math.round((Number.isFinite(st.volume) ? st.volume : 1) * 100), st.muted, getSeat()].join('~');

  const api = {
    get visible() { return Boolean(main && main.open); },
    get tracksOpen() { return Boolean(tracks && tracks.open); },
    touch() { lastTouch = now; },
    show() {
      if (disposed) return;
      api.touch();
      if (main && main.open) return;
      const st = state();
      main = openPanel(controlsSpec(st, handlers));
      lastKey = keyOf(st);
    },
    hide() {
      const h = main;
      main = null;
      lastKey = '';
      closeHandle(h);
      api.closeTracks();
    },
    toggle() {
      if (api.tracksOpen) { api.closeTracks(); return; }
      if (api.visible) api.hide(); else api.show();
    },
    /** Spec nur bei Änderungen neu zeichnen. */
    refresh() {
      if (!main || !main.open) return;
      const st = state();
      const k = keyOf(st);
      if (k === lastKey) return;
      lastKey = k;
      main.update(controlsSpec(st, handlers));
    },
    /** Pro Frame: Zeit merken, Panel aktualisieren, bei Spiel ohne Bedienung ausblenden. */
    tick(t) {
      now = t;
      if (disposed) return;
      if (main && !main.open) { main = null; lastKey = ''; }
      if (tracks && !tracks.open) { tracks = null; }
      if (!main) return;
      api.refresh();
      const st = state();
      if (st.phase === 'playing' && !st.upNext && !api.tracksOpen && now - lastTouch > AUTO_HIDE_MS) api.hide();
    },
    openTracks(kind) {
      if (disposed) return;
      api.closeTracks();
      const token = ++trackToken;
      const common = {
        onBack: () => api.closeTracks(),
        onClose: () => { if (selfClose) return; if (token === trackToken) { tracks = null; } },
      };
      let rows = null;
      let busy = false;
      const spec = () => trackSpec(kind, rows, { busy, onPick, ...common });
      const onPick = (r) => {
        if (busy) return;
        busy = true;
        api.touch();
        if (tracks && tracks.open) tracks.update(spec());
        Promise.resolve(cinema.selectTrack(kind, r.id)).then((ok) => {
          if (token !== trackToken) return;
          busy = false;
          if (ok === false && toast) toast('Auswahl nicht möglich');
          api.closeTracks();
        }, () => { if (token === trackToken) { busy = false; api.closeTracks(); } });
      };
      tracks = openPanel(spec());
      Promise.resolve(cinema.tracks(kind)).then((list) => {
        if (token !== trackToken) return;
        rows = Array.isArray(list) ? list : [];
        if (tracks && tracks.open) tracks.update(spec());
      }, () => {
        if (token !== trackToken) return;
        rows = [];
        if (tracks && tracks.open) tracks.update(spec());
      });
    },
    closeTracks() {
      trackToken++;
      const h = tracks;
      tracks = null;
      closeHandle(h);
    },
    dispose() {
      if (disposed) return;
      api.hide();
      disposed = true;
    },
  };
  return api;
}

// VIDEOTHEK LENZ (VR-Kino): Brücke zum Jellyfin-Player. Reines DOM, keine Imports (läuft auch im Dev-Harness als Modul).
// Liest Zustand per Polling, steuert den Player über die (auch ausgeblendeten) OSD-Knöpfe. Siehe docs/store3d.md.
// Nichts hier loggt URLs oder Titel.

export function createCinemaBridge({ win = window, doc = document, pollMs = 250 } = {}) {
  let timer = null;
  let videoEl = null;
  let played = false; // aktuelles <video> hat schon Bild geliefert (readyState 0 danach = Spurwechsel, kein Fehler)
  let seenVideoRoute = false;
  let lastPhase = null;
  let lastRoute = null;
  let lock = Promise.resolve();
  const videoFns = new Set();
  const changeFns = new Set();
  const cache = { audio: null, subtitle: null };

  const q = (sel) => { try { return doc.querySelector(sel); } catch { return null; } };
  // Jellyfin behält alte Player-Seiten versteckt (.hide) mit derselben ID im DOM: immer die sichtbare nehmen (live geprüft)
  // Attribut-Selektor statt #id: bei doppelten IDs nehmen manche Engines sonst nur das erste Element
  const osd = (sel) => q(`[id="videoOsdPage"]:not(.hide) ${sel}`) || q(`#videoOsdPage ${sel}`) || q(sel);
  const find = () => q('video.htmlvideoplayer');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fire = (set, arg) => {
    for (const fn of [...set]) {
      try { fn(arg); } catch (e) { console.warn('[LenzFlix] cinema cb', e && e.message); }
    }
  };
  async function waitFor(cond, ms, step = 50) {
    const end = Date.now() + ms;
    for (;;) {
      let ok = false;
      try { ok = Boolean(cond()); } catch { /* egal */ }
      if (ok) return true;
      if (Date.now() >= end) return false;
      await sleep(step);
    }
  }
  const finite = (n) => (Number.isFinite(n) ? n : 0);
  // Jellyfin rechnet kubisch: video.volume = (Regler/100)^3. Pegel = Kubikwurzel (0..1, auf 0,01 gerundet) = Jellyfins eigene Anzeige.
  const levelOf = (v) => {
    const vol = Math.max(0, Math.min(1, finite(Number(v.volume))));
    return Math.round(Math.cbrt(vol) * 100) / 100;
  };

  function routeOf() {
    let hash = '';
    try { hash = String(win.location.hash || ''); } catch { /* egal */ }
    const path = hash.replace(/^#!?/, '').split('?')[0];
    if (path === '/video') return 'video';
    if (path === '/home') return 'home';
    return 'other';
  }

  function errorDialogText() {
    try {
      for (const d of doc.querySelectorAll('.dialogContainer .dialog:not(.actionSheet)')) {
        if (d.hidden || d.classList.contains('hide')) continue;
        const cs = win.getComputedStyle(d);
        if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) continue;
        const t = String(d.textContent || '').replace(/\s+/g, ' ').trim();
        if (t) return t;
      }
    } catch { /* egal */ }
    return null;
  }

  function upNextState() {
    try {
      const el = osd('.upNextContainer');
      if (!el || el.classList.contains('hide')) return null;
      const text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
      const m = /(\d+)\s*Sek/i.exec(text) || /(\d+)/.exec(text);
      return { text, seconds: m ? Number(m[1]) : 0 };
    } catch {
      return null;
    }
  }

  const visibleBtn = (sel) => { const b = osd(sel); return Boolean(b) && !b.classList.contains('hide'); };

  /** Zustand frisch aus dem DOM (merkt sich nur, ob schon gespielt wurde). */
  function compute() {
    const route = routeOf();
    const v = videoEl && videoEl.isConnected !== false ? videoEl : find();
    let phase = 'idle';
    let reloading = false;
    let error = null;
    if (!v) {
      if (route === 'video') phase = 'loading';
    } else {
      const rs = Number(v.readyState) || 0;
      if (rs >= 2) played = true;
      if (v.ended) phase = 'ended';
      else if (rs < 2 && !played) phase = 'loading';
      else if (rs === 0 && played) { phase = 'loading'; reloading = true; }
      else phase = v.paused ? 'paused' : 'playing';
    }
    if (phase === 'loading' && !reloading && (route === 'video' || v)) {
      const t = errorDialogText();
      if (t) { phase = 'error'; error = t; }
    }
    return {
      route,
      phase,
      time: v ? finite(v.currentTime) : 0,
      duration: v ? finite(v.duration) : 0,
      title: String(doc.title || ''),
      hasPrev: visibleBtn('.btnPreviousTrack'),
      hasNext: visibleBtn('.btnNextTrack'),
      upNext: upNextState(),
      error,
      volume: v ? levelOf(v) : 1,
      muted: v ? Boolean(v.muted) : false,
      reloading,
    };
  }

  function poll() {
    const v = find();
    if (v !== videoEl) {
      videoEl = v;
      played = false;
      fire(videoFns, v);
    }
    const s = compute();
    if (s.route === 'video') seenVideoRoute = true;
    else if (seenVideoRoute) {
      seenVideoRoute = false;
      // Zeilen 7/4: Player verlassen, aber nicht Richtung Startseite -> zurück in die Videothek
      if (s.route === 'other') {
        try { win.location.hash = '#/home'; } catch { /* egal */ }
      }
    }
    if (s.phase !== lastPhase || s.route !== lastRoute) {
      lastPhase = s.phase;
      lastRoute = s.route;
      fire(changeFns, s);
    }
  }

  function activate(on) {
    if (on) {
      if (timer) return;
      timer = setInterval(() => { try { poll(); } catch { /* egal */ } }, pollMs);
      try { poll(); } catch { /* egal */ }
    } else {
      if (timer) clearInterval(timer);
      timer = null;
      videoEl = null;
      played = false;
      seenVideoRoute = false;
      lastPhase = null;
      lastRoute = null;
      cache.audio = null;
      cache.subtitle = null;
    }
  }

  // ---------------------------------------------------------------- Proxy

  const click = (sel) => { try { const b = osd(sel); if (b) b.click(); } catch { /* egal */ } };
  const cur = () => videoEl || find();

  function seekTo(s) {
    try {
      const v = cur();
      const slider = osd('input.osdPositionSlider');
      const d = v ? v.duration : NaN;
      if (slider && Number.isFinite(d) && d > 0) {
        const pct = Math.max(0, Math.min(100, (Number(s) / d) * 100));
        slider.value = String(pct);
        slider.dispatchEvent(new win.Event('change', { bubbles: true }));
      } else if (v && Number.isFinite(Number(s))) {
        v.currentTime = Math.max(0, Number(s));
      }
    } catch { /* egal */ }
  }

  function seekBy(d) {
    if (d === -10) return click('.btnRewind');
    if (d === 30) return click('.btnFastForward');
    const v = cur();
    return seekTo((v ? finite(v.currentTime) : 0) + Number(d || 0));
  }

  function setVolume(val) {
    const f = Math.max(0, Math.min(1, Number(val) || 0));
    try {
      const v = cur();
      // Lauter bei Stummschaltung: erst Stumm aufheben (sonst bleibt die Änderung unhörbar)
      if (v && v.muted && f > levelOf(v)) click('.buttonMute');
      const slider = osd('input.osdVolumeSlider');
      if (slider) {
        slider.value = String(Math.round(f * 100));
        slider.dispatchEvent(new win.Event('input', { bubbles: true }));
        slider.dispatchEvent(new win.Event('change', { bubbles: true }));
      } else if (v) {
        v.volume = f ** 3;
      }
    } catch { /* egal */ }
  }

  // ---------------------------------------------------------------- Spuren

  const sheetEl = () => q('.dialogContainer .actionSheet.opened') || q('.dialogContainer .actionSheet') || q('.actionSheet');
  const dialogDepth = () => {
    try { const d = win.history.state && win.history.state.usr && win.history.state.usr.dialogs; return d ? d.length : 0; } catch { return 0; }
  };
  const kindSel = (kind) => (kind === 'audio' ? '.btnAudio' : '.btnSubtitles');

  async function openSheet(kind) {
    const btn = osd(kindSel(kind));
    if (!btn) return null;
    btn.click();
    return (await waitFor(sheetEl, 2000)) ? sheetEl() : null;
  }

  async function closeSheet() {
    if (!sheetEl()) return;
    if (dialogDepth() > 0) {
      try { win.history.back(); } catch { /* egal */ }
      await waitFor(() => !sheetEl(), 2000);
    }
  }

  function readItems(sheet) {
    const out = [];
    for (const it of sheet.querySelectorAll('.actionSheetMenuItem[data-id]')) {
      const id = it.getAttribute('data-id');
      if (id === 'secondarysubtitle') continue;
      const lab = it.querySelector('.actionSheetItemText');
      const icon = it.querySelector('.actionsheetMenuItemIcon');
      let selected = false;
      // Jellyfin setzt bei nicht gewählten Einträgen inline visibility:hidden; die berechnete Sichtbarkeit taugt nicht,
      // weil das Sheet beim Einblenden noch selbst unsichtbar ist (live geprüft)
      try { selected = Boolean(icon) && icon.style.visibility !== 'hidden' && !icon.classList.contains('hide'); } catch { /* egal */ }
      out.push({ id, label: String((lab || it).textContent || '').trim(), selected });
    }
    return out;
  }

  async function readTracks(kind) {
    const sheet = await openSheet(kind);
    if (!sheet) return cache[kind] || [];
    const list = readItems(sheet);
    await closeSheet();
    cache[kind] = list;
    return list;
  }

  async function pick(kind, id) {
    const sheet = await openSheet(kind);
    if (!sheet) return false;
    const item = [...sheet.querySelectorAll('.actionSheetMenuItem[data-id]')].find((it) => it.getAttribute('data-id') === String(id));
    if (!item) { await closeSheet(); return false; }
    item.click();
    await waitFor(() => !sheetEl(), 2000);
    if (cache[kind]) cache[kind] = cache[kind].map((t) => ({ ...t, selected: t.id === String(id) }));
    return true;
  }

  async function select(kind, id) {
    let prevSub = null;
    if (kind === 'audio') {
      const subs = await readTracks('subtitle');
      const s = subs.find((t) => t.selected);
      if (s && s.id !== '-1') prevSub = s.id;
    }
    if (!(await pick(kind, id))) return false;
    if (kind === 'audio') {
      const v = cur();
      if (v) {
        await waitFor(() => (Number(v.readyState) || 0) < 2, 1000);
        await waitFor(() => (Number(v.readyState) || 0) >= 2, 15000, 100);
      }
      if (prevSub !== null) await pick('subtitle', prevSub);
    }
    return true;
  }

  const queued = (fn) => {
    const run = lock.then(fn, fn);
    lock = run.then(() => undefined, () => undefined);
    return run;
  };

  function subtitles() {
    try {
      const v = cur();
      if (v && v.textTracks) {
        for (const tr of v.textTracks) {
          if (tr.mode !== 'showing') continue;
          const cues = tr.activeCues ? [...tr.activeCues] : [];
          const text = cues.map((c) => String(c.text || '')).join('\n').replace(/‎/g, '').replace(/<[^>]+>/g, '').trim();
          return { kind: 'text', text };
        }
      }
      const canvas = q('.libassjs-canvas');
      if (canvas && canvas.isConnected !== false && canvas.width > 0 && canvas.height > 0) return { kind: 'canvas', canvas };
      const inner = q('.videoSubtitles .videoSubtitlesInner');
      const text = inner ? String(inner.textContent || '').replace(/‎/g, '').trim() : '';
      if (text) return { kind: 'text', text };
    } catch { /* egal */ }
    return null;
  }

  async function stop() {
    // Nur zurücknavigieren, wenn wirklich ein Player offen ist; sonst ist #/home sicherzustellen und nichts zu klicken
    if (routeOf() !== 'video' && !find()) {
      if (routeOf() !== 'home') {
        try { win.location.hash = '#/home'; } catch { /* egal */ }
      }
      return true;
    }
    try {
      const b = q('.skinHeader .headerBackButton');
      if (b) b.click();
      else win.history.back();
    } catch { /* egal */ }
    if (!(await waitFor(() => routeOf() !== 'video', 5000, 100))) return false;
    if (routeOf() !== 'home') {
      try { win.location.hash = '#/home'; } catch { /* egal */ }
    }
    return true;
  }

  function dispose() {
    activate(false);
    videoFns.clear();
    changeFns.clear();
  }

  return {
    activate,
    state: compute,
    video: cur,
    onVideo: (fn) => { videoFns.add(fn); return () => videoFns.delete(fn); },
    onChange: (fn) => { changeFns.add(fn); return () => changeFns.delete(fn); },
    subtitles,
    togglePause: () => click('.btnPause'),
    seekBy,
    seekTo,
    next: () => click('.btnNextTrack'),
    prev: () => click('.btnPreviousTrack'),
    setVolume,
    toggleMute: () => click('.buttonMute'),
    tracks: (kind) => queued(() => readTracks(kind)),
    selectTrack: (kind, id) => queued(() => select(kind, id)),
    upNext: (action) => click(action === 'start' ? '.btnStartNow' : '.btnHide'),
    stop,
    dispose,
  };
}

// LENZ LIVE · Controller. Alles Zustandsbehaftete und alle Module kommen per Injektion (testbar ohne echte Module).
// createApp(host, { scheduler, player, watch, pickFiller, overlays, music, pdf, deps, opts, time }) → instance
//   player: Objekt ODER Fabrik ({ video, canvas }) → Player (das <video> entsteht hier im DOM-Gerüst).
//   sfx: createSfx()-Instanz (optional; Standard: eigene, Klickgeräusche der Gerätetasten/Drehknöpfe).
//   overlays: { epg, ttx, menu, guide } – Fabriken createX(ctx) → Overlay.   music: createMusic()-Instanz (optional, Pausenmusik).
//   pdf: { downloadPdf(magazine, style, onProgress) } (optional, Fernsehzeitung als PDF).   time: { formatClock, formatDay, broadcastDayOf, dayBounds }.
import { buildTv, createNoise, STYLES, normStyle, h } from './tv.js';
import { createRemote } from './remote.js';
import { createDecor } from './decor.js';
import { createKnobs } from './knobs.js';
import { createSfx } from '../player/sfx.js';
import { createKeys } from './keys.js';
import { createOsd } from './osd.js';
import { createCard } from './card.js';
import { createFullscreen } from './fullscreen.js';
import { genreLabels } from './overlay-util.js';
import { buildMagazine as buildMagazineModel, collectTipIds, loadOverviews } from '../magazine/model.js';
import { createMagazineProp, PROP_MIN_PX } from '../magazine/prop.js';

export const DEBOUNCE_MS = 400;
export const DIGIT_WAIT_MS = 1500;
export const RETRY_MS = 10000;
export const SYNC_MS = 30000;
const MAX_TIMEOUT = 2147483647;
const VOL_STEP = 5;
const PLAYABLE = ['program', 'fill', 'nightfill'];
const OVERLAY_FACTORY = { epg: 'epg', txt: 'ttx', menu: 'menu', guide: 'guide' };
const OVERLAY_CLASS = { epg: 'has-epg', txt: 'has-ttx', menu: 'has-menu', guide: 'has-guide' };
const IDLE_KINDS = ['pause', 'test', 'error'];

const p2 = (n) => String(n).padStart(2, '0');
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function defaultClock(t) {
  const d = new Date(t);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

function pick(it, ...keys) {
  for (const k of keys) if (it[k] != null && it[k] !== '') return it[k];
  return null;
}

/** Liest die normalisierten CatalogItem-Felder (schedule/catalog.js). Unbekannte Staffel/Folge (9999) → null. */
export function itemFields(it, scheduler) {
  if (!it) return { genres: [] };
  const known = (n) => (n != null && n !== 9999 ? n : null);
  const g = Array.isArray(it.genres) ? it.genres : [];
  return {
    title: pick(it, 'title'),
    seriesName: pick(it, 'seriesTitle'),
    season: known(pick(it, 'season')),
    episode: known(pick(it, 'episode')),
    year: pick(it, 'year'),
    genres: scheduler ? genreLabels(scheduler, g) : g,
    runtimeMs: pick(it, 'durMs'),
    age: pick(it, 'age'),
    seriesId: pick(it, 'seriesId'),
    type: pick(it, 'kind'),
  };
}

export function createApp(host, { scheduler, player: playerArg, watch, pickFiller, overlays = {}, music = null, sfx: sfxArg, pdf = null, deps = {}, opts = {}, time = {} }) {
  const doc = host.ownerDocument || document;
  const win = typeof window !== 'undefined' ? window : doc.defaultView;
  const clock = typeof opts.now === 'function' ? opts.now : () => Date.now();
  const formatClock = time.formatClock || defaultClock;
  const NCH = () => ((scheduler.channels && scheduler.channels().length) || 18);

  // ---------- DOM ----------
  const refs = buildTv({ style: opts.style, fakePlayer: !!opts.fakePlayer, doc });
  const { app, room, screen, video, overlay: overlayEl } = refs;
  const noise = createNoise(refs.noise, { win });
  let knobs = null;
  const sfx = sfxArg === undefined ? createSfx() : sfxArg; // Klickgeräusche (AudioContext entsteht erst im ersten Klick)
  // Raum-/Gehäuse-/Glas-Dekor der Röhren-Stile; bedienbare Gerätetasten rufen onDeviceAction
  const decor = createDecor({ room, tv: refs.tv, screen, doc, onAction: (a) => onDeviceAction(a) });
  decor.setStyle(normStyle(opts.style));
  const card = createCard(screen, { formatClock, doc, win, onKind: () => syncMusic() });
  const osd = createOsd(screen, { doc, win });
  screen.append(overlayEl); // Overlays liegen über OSD/Karte
  const remote = createRemote({ onKey: (k) => press(k), doc });
  // Seitenspalte: Heft-Objekt (Prop) im freien Raum über der Fernbedienung; Handy-/Vollbild-/Spalten-Layouts lösen sie per CSS auf.
  const side = h(doc, 'div', 'lfx-live-side');
  const slot = h(doc, 'div', 'lfx-live-side__slot');
  const propSlot = h(doc, 'div', 'lfx-live-room__prop'); // Lowboard-Slot (Röhre/Silber), per CSS absolut
  side.append(slot, remote.el);
  room.append(side, propSlot);
  host.append(app);
  let prop = null;
  if (overlays.guide) {
    prop = createMagazineProp({ doc, onOpen: () => press('guide'), imageUrl: deps.imageUrl });
    slot.append(prop.el);
    prop.setStyle(normStyle(opts.style));
  }
  if (opts.phone) app.classList.add('is-phone');
  if (opts.touch) app.classList.add('is-touch');
  app.classList.toggle('no-tubefx', opts.fx === false);

  // ---------- Zustand ----------
  let style = normStyle(opts.style);
  let on = false;
  let suspended = false;
  let disposed = false;
  let channel = clamp(Math.round(Number(opts.lastChannel) || 1), 1, 18);
  let entry = null;
  let gen = 0;
  let playing = false; // Hauptstream (Programm) läuft
  let vol = clamp(Math.round((opts.volume == null ? 1 : Number(opts.volume)) * 100), 0, 100);
  let muted = !!opts.muted;
  let digitBuf = '';
  let pendingRestart = null;
  let mutedByPolicy = false; // Autoplay-Sperre: Start nur stumm gelungen (Prefs-`muted` bleibt unberührt)
  let needsTap = false;      // Autoplay-Sperre: auch stumm abgelehnt → „Zum Starten tippen“
  let stallArmed = false;
  let tickCount = 0;
  let lastDay = null;
  let musicOn = opts.music !== false;
  let fxOn = opts.fx !== false;
  let magCache = null; // { D, base, full: Promise<Magazine>|null }
  const T = {};
  let tickIv = null;
  const made = {}; // name → Overlay-Instanz

  const later = (name, fn, ms) => { clearTimeout(T[name]); T[name] = setTimeout(fn, ms); };
  const unlater = (name) => { clearTimeout(T[name]); T[name] = null; };
  const safe = (fn) => { try { return fn(); } catch { return undefined; } };

  const player = typeof playerArg === 'function'
    ? playerArg({
      video,
      canvas: refs.fake,
      getInfo: () => ({ channel: channelOf(channel).name, title: entry ? titleOf(entry).title : '' }),
    })
    : playerArg;

  // ---------- Beschreibung von Einträgen ----------
  function channelOf(no) {
    const list = (scheduler.channels && scheduler.channels()) || [];
    return list.find((c) => c.no === no) || { no, key: '', name: `LIVE ${no}` };
  }

  function titleOf(e) {
    if (!e) return { title: '', sub: null };
    if (e.type === 'closedown') return { title: e.reason === 'empty' ? 'Kein Programm' : 'Sendeschluss', sub: null };
    if (e.type === 'filler') return { title: 'Kurze Pause', sub: null };
    const f = itemFields(e.itemId ? scheduler.item(e.itemId) : null, scheduler);
    if (f.seriesName) {
      const code = f.season != null && f.episode != null ? `S${p2(f.season)}E${p2(f.episode)}` : null;
      const sub = [code, f.title && f.title !== f.seriesName ? f.title : null].filter(Boolean).join(' · ');
      return { title: f.seriesName, sub: sub || null };
    }
    return { title: f.title || 'Unbekannter Titel', sub: null };
  }

  function badgesOf(e) {
    const b = [];
    if (e.rerun) b.push('Wdh.');
    if (e.premiere === 'film') b.push('Premiere');
    else if (e.premiere === 'episode') b.push('Neue Folge');
    if (e.theme) b.push(`Thementag: ${e.theme}`);
    if (e.type === 'fill') b.push('Füllprogramm');
    else if (e.type === 'nightfill') b.push(e.label || 'Füllprogramm');
    return b;
  }

  function nextProgram(no, e) {
    let cur = e;
    let first = null;
    for (let i = 0; i < 4; i++) {
      let n;
      try { n = scheduler.nowOn(no, cur.end).entry; } catch { return first; }
      if (!n || n.start <= cur.start) return first;
      if (!first) first = n;
      if (n.type !== 'filler') return n;
      cur = n;
    }
    return first;
  }

  function describe(no, e, t) {
    const { title, sub } = titleOf(e);
    const nx = nextProgram(no, e);
    const data = {
      no,
      channel: channelOf(no),
      title,
      sub,
      from: formatClock(e.start),
      to: formatClock(e.end),
      badges: badgesOf(e),
      progress: clamp((t - e.start) / Math.max(1, e.end - e.start), 0, 1),
      next: nx ? { title: titleOf(nx).title, from: formatClock(nx.start) } : null,
      meta: [],
    };
    const f = itemFields(e.itemId ? scheduler.item(e.itemId) : null, scheduler);
    const age = e.age != null ? e.age : f.age;
    const ageText = typeof age === 'number' && age > 0 ? `ab ${age}` : null;
    const mins = f.runtimeMs ? Math.round(Number(f.runtimeMs) / 60000) : null;
    data.meta = [f.year, f.genres.length ? f.genres.slice(0, 3).join(', ') : null, mins ? `${mins} Min.` : null, ageText].filter((x) => x != null && x !== '');
    return data;
  }

  // ---------- Overlays ----------
  const ctx = {
    scheduler,
    now: clock,
    channels: () => scheduler.channels(),
    currentChannel: () => channel,
    // Senderliste im Standby-Menü: direkt auf diesem Sender einschalten
    tune: (no) => {
      if (on) { tune(no); return; }
      if (no >= 1 && no <= NCH()) channel = Math.round(no);
      powerOn();
    },
    closeOverlay: () => closeOverlays(),
    formatClock,
    formatDay: time.formatDay,
    broadcastDayOf: time.broadcastDayOf,
    dayBounds: time.dayBounds,
    style: () => style,
    setStyle: (id) => setStyle(id),
    styles: STYLES,
    user: deps.user,
    isAdmin: !!(deps.user && deps.user.isAdmin),
    channelConfig: deps.channelConfig || {},
    previousThemeName: deps.previousThemeName,
    leaveToLibrary: (...a) => deps.leaveToLibrary && deps.leaveToLibrary(...a),
    openThemePicker: () => deps.openThemePicker && deps.openThemePicker(),
    openDashboard: () => deps.openDashboard && deps.openDashboard(),
    logout: () => deps.logout && deps.logout(),
    imageUrl: deps.imageUrl,
    toast: (t) => deps.toast && deps.toast(t),
    buildMagazine: () => buildFullMagazine(),
    downloadPdf: (mag, onProgress) => {
      if (!pdf || typeof pdf.downloadPdf !== 'function') return Promise.reject(new Error('kein PDF-Export'));
      return pdf.downloadPdf(mag, style, onProgress);
    },
    openOverlay: (name, o) => openOverlay(name, o),
    musicEnabled: () => musicOn,
    toggleMusic: () => toggleMusic(),
    fxEnabled: () => fxOn,
    toggleFx: () => toggleFx(),
  };

  function overlayInst(name) {
    if (made[name]) return made[name];
    const factory = overlays[OVERLAY_FACTORY[name]];
    if (!factory) return null;
    const inst = factory(ctx);
    made[name] = inst;
    // Die Fernsehzeitung liegt über der ganzen Szene (Wurzel), die übrigen Overlays im Fernsehbild
    if (inst && inst.el) (name === 'guide' ? app : overlayEl).append(inst.el);
    return inst;
  }

  function syncOverlayClasses() {
    for (const n of Object.keys(OVERLAY_CLASS)) {
      app.classList.toggle(OVERLAY_CLASS[n], !!(made[n] && made[n].isOpen()));
    }
  }

  function openName() {
    for (const n of Object.keys(made)) if (made[n] && made[n].isOpen()) return n;
    return null;
  }

  function closeOverlays() {
    for (const n of Object.keys(made)) if (made[n] && made[n].isOpen()) safe(() => made[n].close());
    syncOverlayClasses();
  }

  function openOverlay(name, o) {
    const inst = overlayInst(name);
    if (!inst) return;
    for (const n of Object.keys(made)) if (n !== name && made[n] && made[n].isOpen()) made[n].close();
    if (o === undefined) inst.open(); else inst.open(o);
    syncOverlayClasses();
  }

  // ---------- Fernsehzeitung (Heftmodell, Cache pro Sendetag) ----------
  function magInput(overviews) {
    const D = time.broadcastDayOf(clock());
    return { scheduler, today: D, formatClock, formatDay: time.formatDay, dayBounds: time.dayBounds, overviews };
  }

  // Heft ohne Inhaltsangaben (Titelbild des Hefts im Raum, kein Netzwerk); pro Sendetag gecacht.
  function baseMagazine() {
    if (!time.broadcastDayOf || !time.formatDay || !time.dayBounds) return null;
    const D = time.broadcastDayOf(clock());
    if (magCache && magCache.D === D) return magCache.base;
    const base = buildMagazineModel(magInput(undefined));
    magCache = { D, base, full: null };
    return base;
  }

  // Mit Inhaltsangaben (eine Anfrage beim ersten Öffnen); erneuter Aufruf am selben Sendetag liefert den Cache.
  function buildFullMagazine() {
    let base;
    try { base = baseMagazine(); } catch (e) { return Promise.reject(e); }
    if (!base) return Promise.reject(new Error('kein Zeitmodul'));
    const cache = magCache;
    if (cache.full) return cache.full;
    const full = (async () => {
      const overviews = await loadOverviews(collectTipIds(base), deps.itemDetails);
      return buildMagazineModel(magInput(overviews));
    })();
    cache.full = full;
    full.catch(() => { if (cache.full === full) cache.full = null; });
    return full;
  }

  function refreshPropCover() {
    if (!prop) return;
    try {
      const m = baseMagazine();
      prop.setCover(m && m.cover ? m.cover.hero : null);
    } catch { /* Titelbild bleibt leer */ }
  }

  // ---------- Heft-Objekt: der Slot, der passt ----------
  // Reihenfolge je Stil; app[data-prop] schaltet die CSS-Lage. Passt keiner, bleibt nur die Heft-Taste (is-guide-key).
  //   Röhre/Silber: Lowboard links neben dem TV, sonst über der Fernbedienung. Flat: über der Fernbedienung.
  //   Schlicht: über der Fernbedienung (mittig), sonst mit unten sitzender Fernbedienung (above-low).
  function propCandidates() {
    if (style === 'crt80' || style === 'silver') return [['lowboard', propSlot], ['above', slot]];
    if (style === 'plain') return [['above', slot], ['above-low', slot]];
    return [['above', slot]];
  }
  function placeProp() {
    if (!prop || disposed) return;
    let found = null;
    for (const [name, el] of propCandidates()) {
      app.dataset.prop = name;
      if (el.clientHeight >= PROP_MIN_PX) { found = [name, el]; break; }
    }
    if (found) {
      app.dataset.prop = found[0];
      if (prop.el.parentNode !== found[1]) found[1].append(prop.el);
      prop.el.hidden = false;
      app.classList.remove('is-guide-key');
    } else {
      delete app.dataset.prop;
      prop.el.hidden = true;
      app.classList.add('is-guide-key');
    }
  }
  let propRo = null;
  let propRaf = 0;
  function schedulePlace() {
    if (propRaf) return;
    const raf = win.requestAnimationFrame ? (f) => win.requestAnimationFrame(f) : (f) => setTimeout(f, 16);
    propRaf = raf(() => { propRaf = 0; placeProp(); }) || 1;
  }

  // ---------- Pausenmusik ----------
  function syncMusic() {
    if (!music) return;
    const kind = card.kind();
    const reason = card.el && card.el.dataset ? card.el.dataset.reason : null;
    const idle = on && !suspended && !disposed && IDLE_KINDS.includes(kind) && !needsTap && !(kind === 'error' && reason === 'gesture');
    safe(() => music.setIdle(idle ? kind : null));
  }

  function toggleMusic() {
    musicOn = !musicOn;
    if (music) safe(() => music.setEnabled(musicOn));
    savePrefs({ music: musicOn });
    return musicOn;
  }

  function toggleFx() {
    fxOn = !fxOn;
    app.classList.toggle('no-tubefx', !fxOn);
    savePrefs({ fx: fxOn });
    return fxOn;
  }

  // ---------- Dekor-Anzeigen (Videorecorder, DVD, Receiver, Wanduhr) ----------
  // Zustandsänderungen (Ein/Aus, Sender) rufen syncDecor direkt; die Uhrzeit läuft über einen Minuten-Timer (auch im Standby).
  function syncDecor() {
    safe(() => decor.setDisplays({ on, clock: formatClock(clock()), ch: channel }));
    safe(() => knobs.sync());
  }
  function scheduleClock() {
    later('clock', () => { syncDecor(); scheduleClock(); }, 60000 - (clock() % 60000) + 50);
  }

  // ---------- Lautstärke ----------
  function applyVolume() {
    safe(() => player.setVolume && player.setVolume(vol / 100));
    safe(() => player.setMuted && player.setMuted(muted));
    if (music) safe(() => music.setLevel(player.volumeSupported === false ? 1 : vol / 100, muted || mutedByPolicy));
    if (sfx) safe(() => sfx.setLevel(player.volumeSupported === false ? 1 : vol / 100, muted));
    safe(() => knobs.setVolume(vol));
  }

  function savePrefs(partial) { if (deps.savePrefs) safe(() => deps.savePrefs(partial)); }

  function changeVolume(key) {
    if (player.volumeSupported === false) {
      muted = key === 'vol+' ? false : key === 'vol-' ? true : !muted;
      applyVolume();
      if (on) osd.showVolume({ percent: vol, muted, hint: 'Lautstärke bitte am Gerät einstellen' });
      savePrefs({ muted });
      return;
    }
    if (key === 'mute') muted = !muted;
    else {
      vol = clamp(vol + (key === 'vol+' ? VOL_STEP : -VOL_STEP), 0, 100);
      muted = false;
    }
    applyVolume();
    if (on) osd.showVolume({ percent: vol, muted });
    savePrefs({ volume: vol / 100, muted });
  }

  // Absolute Lautstärke (Drehknopf, 0–100); bei fester Gerätelautstärke (iOS) nur Richtung
  function setVolumeAbs(v) {
    if (disposed || suspended) return;
    v = clamp(Math.round(Number(v) || 0), 0, 100);
    if (player.volumeSupported === false) { if (v !== vol) changeVolume(v > vol ? 'vol+' : 'vol-'); return; }
    vol = v;
    muted = false;
    applyVolume();
    if (on) osd.showVolume({ percent: vol, muted });
    savePrefs({ volume: vol / 100, muted });
  }

  // Gerätetasten (Dekor am Fernseher): nur sie schalten aus dem Standby heraus; die Fernbedienung bleibt unverändert.
  //   power → Ein/Aus · ch:N → Sender N (schaltet ein) · key:ch± → ein, nächster/vorheriger Sender ab dem zuletzt gesehenen
  //   key:epg → ein und Programmübersicht · key:vol± → nur Lautstärke (TV bleibt aus)
  function onDeviceAction(action) {
    if (disposed || suspended || !action) return;
    const N = NCH();
    const wrap = (n) => ((((n - 1) % N) + N) % N) + 1;
    safe(() => sfx && sfx.click(action === 'power' ? 'power' : 'press'));
    const m = /^ch:(\d+)$/.exec(action);
    if (m) {
      const no = Number(m[1]);
      if (no >= 1 && no <= N) ctx.tune(no);
      return;
    }
    if (action === 'power') { press('power'); return; }
    const key = action.startsWith('key:') ? action.slice(4) : '';
    if (key === 'ch+' || key === 'ch-') {
      if (on) press(key); else ctx.tune(wrap(channel + (key === 'ch+' ? 1 : -1)));
    } else if (key === 'vol+' || key === 'vol-') {
      if (on) press(key); else changeVolume(key);
    } else if (key === 'epg') {
      if (on) press('epg');
      else { powerOn(); openOverlay('epg'); }
    }
  }

  // ---------- Abspielen ----------
  // Gesehen-Regel: nur zählen, was wirklich läuft. Offset aus der Uhr zum Zeitpunkt des Starts (10-min-Grenze).
  function watchTune() {
    if (!watch || !entry) return;
    const off = Math.max(0, clock() - entry.start);
    safe(() => watch.tune(entry, off));
  }
  function watchLeave(silent) { if (watch) safe(() => watch.leave(silent)); }
  function clearStall() { stallArmed = false; unlater('stall'); }

  function showError(reason, g) {
    playing = false;
    clearStall();
    watchLeave(true); // Störbild/Ausfall: nie als gesehen werten
    needsTap = reason === 'gesture';
    card.showError(reason, channelOf(channel));
    unlater('retry');
    if (reason === 'network') later('retry', () => { if (g === gen && on) start(g, false); }, RETRY_MS);
  }

  function handleResult(res, g, e) {
    if (g !== gen) return false;
    if (res && res.ok === false) {
      if (res.reason === 'aborted') return false;
      showError(res.reason || 'network', g);
      return false;
    }
    card.hide();
    playing = true;
    if (e === entry) watchTune();
    return true;
  }

  // Nutzer-Geste (Tippen/Taste) nach Autoplay-Sperre. true = Eingabe verbraucht.
  function userGesture(key) {
    if (needsTap) {
      if (key === 'power' || key === 'fullscreen') return false;
      needsTap = false;
      safe(() => player.unlock && player.unlock()); // SYNCHRON in der Geste
      if (music) safe(() => music.unlock());
      mutedByPolicy = false;
      applyVolume(); // Nutzer-Stumm-Zustand wiederherstellen (der Versuch hat video.muted gesetzt)
      card.hide();
      start(++gen, false);
      return true;
    }
    if (mutedByPolicy) {
      mutedByPolicy = false;
      if (music) safe(() => music.unlock());
      osd.hideMessage();
      applyVolume(); // Ton wieder an, sofern der Nutzer nicht selbst stumm geschaltet hatte
      return key === 'mute' && !muted;
    }
    return false;
  }

  function armAdvance(e, g) {
    const delay = clamp(e.end - clock() + 30, 50, MAX_TIMEOUT);
    later('advance', () => advance(g), delay);
  }

  function advance(g) {
    if (g !== gen || !on) return;
    const t = clock();
    let n;
    try { n = scheduler.nowOn(channel, t); } catch { later('advance', () => advance(g), 1000); return; }
    if (entry && n.entry.start === entry.start && t < entry.end) { armAdvance(entry, g); return; }
    const ng = ++gen;
    watchLeave();
    playEntry(n.entry, n.offsetMs, ng, { blend: true });
  }

  async function playEntry(e, offsetMs, g, { blend = false } = {}) {
    entry = e;
    playing = false;
    unlater('retry');
    unlater('trailer');
    armAdvance(e, g);
    needsTap = false;
    clearStall();
    watchLeave(true); // erst nach erfolgreichem Start wieder tune (handleResult)
    app.classList.toggle('is-blend', blend);
    if (blend) later('blend', () => app.classList.remove('is-blend'), 500);
    const t = clock();
    osd.showChannel(describe(channel, e, t));
    card.hideBanner();
    if (e.type === 'fill') card.showBanner('Füllprogramm');
    else if (e.type === 'nightfill') card.showBanner(e.label || 'Füllprogramm – reguläres Programm ab 5:00');

    if (PLAYABLE.includes(e.type) && e.itemId) {
      let res;
      try { res = await player.play({ itemId: e.itemId, offsetMs }); } catch { res = { ok: false, reason: 'network' }; }
      handleResult(res, g, e);
      return;
    }

    if (e.type === 'filler') { await runFiller(e, g); return; }
    if (e.type === 'fill' || e.type === 'nightfill') {
      // Füllprogramm ohne Titel: Pausenbild mit Banner
      safe(() => player.stop());
      const nx = nextProgram(channel, e);
      const nt = nx && PLAYABLE.includes(nx.type) ? titleOf(nx).title : null;
      card.showPause({ channel: channelOf(channel), title: nt, at: nx ? nx.start : 0, until: e.end, now: clock() });
      return;
    }

    // closedown (oder Eintrag ohne itemId)
    safe(() => player.stop());
    card.showTest({
      channel: channelOf(channel),
      text: e.type === 'closedown' && e.reason === 'empty' ? 'Auf diesem Sender läuft gerade nichts' : 'Sendeschluss',
      now: clock(),
    });
  }

  async function runFiller(e, g) {
    let next;
    try { next = scheduler.nowOn(channel, e.end).entry; } catch { next = null; }
    let pickRes = { kind: 'card' };
    if (pickFiller) { try { pickRes = await pickFiller(e, next, deps, clock); } catch { pickRes = { kind: 'card' }; } }
    if (g !== gen) return;
    if (pickRes && pickRes.kind === 'trailer') {
      let res;
      try { res = await player.playUrl(pickRes.url, pickRes.offsetMs || 0); } catch { res = { ok: false, reason: 'network' }; }
      if (g !== gen) return;
      if (res && res.ok !== false) { card.hide(); return; }
    }
    safe(() => player.stop());
    const nt = next && PLAYABLE.includes(next.type) ? titleOf(next).title : null;
    card.showPause({ channel: channelOf(channel), title: nt, at: next ? next.start : 0, until: e.end, now: clock() });
    const ts = pickRes && pickRes.trailerStartMs;
    if (ts && ts > clock()) later('trailer', () => { if (g === gen && on) runFiller(e, g); }, clamp(ts - clock() + 20, 20, MAX_TIMEOUT));
  }

  async function start(g, save = true) {
    if (g !== gen || !on) return;
    if (save) savePrefs({ lastChannel: channel });
    let n;
    try { n = scheduler.nowOn(channel, clock()); } catch { showError('network', g); return; }
    await playEntry(n.entry, n.offsetMs, g);
  }

  function tune(no, { immediate = false } = {}) {
    if (!on) return;
    no = ((((Math.round(no) - 1) % NCH()) + NCH()) % NCH()) + 1;
    if (no === channel && entry) { osd.showChannel(describe(channel, entry, clock())); return; }
    channel = no;
    const g = ++gen;
    unlater('zap'); unlater('advance'); unlater('retry'); unlater('trailer');
    cancelRestart();
    clearStall();
    needsTap = false;
    watchLeave();
    if (!immediate) safe(() => player.stop());
    playing = false;
    entry = null;
    card.hide();
    card.hideBanner();
    syncDecor();
    noise.flash(style);
    const t = clock();
    try { osd.showChannel(describe(no, scheduler.nowOn(no, t).entry, t)); } catch { /* OSD ohne Daten */ }
    if (immediate) start(g);
    else later('zap', () => start(g), DEBOUNCE_MS);
  }

  // ---------- Ein/Aus ----------
  function startIntervals() {
    if (tickIv) return;
    tickIv = setInterval(onTick, 1000);
  }
  function stopIntervals() { if (tickIv) { clearInterval(tickIv); tickIv = null; } }

  function onTick() {
    if (!on) return;
    const t = clock();
    card.tick(t);
    if (entry) osd.setProgress(clamp((t - entry.start) / Math.max(1, entry.end - entry.start), 0, 1));
    for (const n of Object.keys(made)) if (made[n] && made[n].isOpen() && made[n].tick) safe(() => made[n].tick(t));
    if (watch) safe(() => watch.tick());
    tickCount++;
    if (tickCount % (SYNC_MS / 1000) === 0 && playing && entry && PLAYABLE.includes(entry.type) && entry.itemId) {
      safe(() => player.syncTo(t - entry.start));
    }
    if (time.broadcastDayOf) {
      const D = time.broadcastDayOf(t);
      if (lastDay != null && D !== lastDay && scheduler.prepare) {
        const ds = [0, 1, 2, 3, 4, 5, 6].map((i) => D + i);
        Promise.resolve(safe(() => scheduler.prepare(ds))).catch(() => {});
      }
      if (lastDay != null && D !== lastDay) refreshPropCover();
      lastDay = D;
    }
    syncOverlayClasses();
  }

  function powerOn() {
    if (on) return;
    // SYNCHRON im Klick-Handler: Autoplay-Freigabe für das eine <video> (iOS).
    safe(() => player.unlock && player.unlock());
    if (music) safe(() => music.unlock());
    on = true;
    syncDecor();
    app.classList.add('is-on', 'is-powering-on');
    app.classList.remove('is-powering-off');
    remote.setOn(true);
    later('pw', () => app.classList.remove('is-powering-on'), 700);
    applyVolume();
    startIntervals();
    tune(channel, { immediate: true });
  }

  function stopAll() {
    gen++;
    for (const k of ['zap', 'advance', 'retry', 'trailer', 'digit', 'restart', 'blend']) unlater(k);
    digitBuf = '';
    pendingRestart = null;
    clearStall();
    needsTap = false;
    mutedByPolicy = false;
    watchLeave();
    safe(() => player.stop());
    noise.stop();
    card.hide();
    card.hideBanner();
    osd.hide();
    closeOverlays();
    playing = false;
    entry = null;
    if (music) safe(() => music.setIdle(null));
  }

  function powerOff() {
    if (!on) return;
    stopAll();
    on = false;
    syncDecor();
    stopIntervals();
    app.classList.remove('is-on', 'is-powering-on', 'is-blend', 'is-loading');
    app.classList.add('is-powering-off');
    remote.setOn(false);
    later('pw', () => app.classList.remove('is-powering-off'), 600);
  }

  // ---------- Tasten ----------
  function digit(d) {
    const n = Number(d);
    if (digitBuf === '') {
      if (n === 0) { digitBuf = '0'; osd.showInput('0_'); later('digit', cancelDigits, DIGIT_WAIT_MS); return; }
      if (n === 1) { digitBuf = '1'; osd.showInput('1_'); later('digit', commitDigits, DIGIT_WAIT_MS); return; }
      osd.clearInput();
      tune(n);
      return;
    }
    const first = digitBuf;
    digitBuf = '';
    unlater('digit');
    osd.clearInput();
    const no = Number(first + d);
    if (no >= 1 && no <= NCH()) tune(no);
    else osd.showMessage('Dieser Sender existiert nicht');
  }
  function commitDigits() {
    const no = Number(digitBuf);
    digitBuf = '';
    osd.clearInput();
    if (no >= 1) tune(no);
  }
  function cancelDigits() { digitBuf = ''; osd.clearInput(); }

  function cancelRestart() {
    pendingRestart = null;
    unlater('restart');
  }

  function restart() {
    const e = entry;
    if (!e || !e.itemId || !PLAYABLE.includes(e.type)) { osd.showMessage('Von vorne ansehen ist hier nicht möglich'); return; }
    const f = itemFields(scheduler.item(e.itemId), scheduler);
    const seriesId = e.seriesId || f.seriesId || null;
    const type = f.type ? String(f.type).toLowerCase() : (seriesId ? 'episode' : 'movie');
    pendingRestart = { itemId: e.itemId, meta: { type, seriesId } };
    osd.showMessage(`In ${deps.previousThemeName || 'der Mediathek'} von vorne ansehen? OK drücken`, 8000);
    later('restart', cancelRestart, 8000);
  }

  async function confirmRestart() {
    const r = pendingRestart;
    cancelRestart();
    osd.hideMessage();
    if (!r || !deps.leaveToLibrary) return;
    try { await deps.leaveToLibrary(r.itemId, r.meta); } catch { if (deps.toast) deps.toast('Der Wechsel hat nicht geklappt.'); }
  }

  function resultFailed(res) { return !!res && res.ok === false; }

  async function cycleAudio() {
    const tr = safe(() => player.tracks && player.tracks());
    const list = (tr && tr.audio) || [];
    if (list.length < 2) { osd.showMessage('Keine weiteren Tonspuren'); return; }
    const pos = list.findIndex((x) => x.index === tr.audioIndex);
    const nx = list[(pos + 1) % list.length];
    osd.showMessage(`Ton: ${nx.label || nx.lang || 'Spur'}`);
    let res;
    try { res = await player.setAudio(nx.index); } catch { res = { ok: false }; }
    if (resultFailed(res)) osd.showMessage('Diese Tonspur ist nicht verfügbar');
  }

  async function cycleSubs() {
    const tr = safe(() => player.tracks && player.tracks());
    const subs = (tr && tr.subs) || [];
    if (!subs.length) { osd.showMessage('Keine Untertitel verfügbar'); return; }
    const list = [{ index: -1, label: 'aus' }].concat(subs);
    const cur = tr.subtitleIndex == null ? -1 : tr.subtitleIndex;
    const pos = Math.max(0, list.findIndex((x) => x.index === cur));
    const nx = list[(pos + 1) % list.length];
    osd.showMessage(`Untertitel: ${nx.index === -1 ? 'aus' : (nx.label || nx.lang || 'an')}`);
    try { await player.setSubtitle(nx.index); } catch { osd.showMessage('Untertitel nicht verfügbar'); }
  }

  function setStyle(id) {
    const s = normStyle(id);
    if (s === style) { savePrefs({ style }); return; }   // nur bei aktiver Wahl im Menü speichern
    app.classList.remove(`lfx-live--style-${style}`);
    style = s;
    app.classList.add(`lfx-live--style-${style}`);
    if (music) safe(() => music.setStyle(style));
    decor.setStyle(style);
    safe(() => knobs.sync());
    if (prop) { prop.setStyle(style); placeProp(); }
    savePrefs({ style });
  }

  // Overlay-Tastenweitergabe (an und aus): true = erledigt
  function routeOverlay(open, key) {
    const consumed = safe(() => made[open].onKey(key));
    syncOverlayClasses();
    if (consumed) return true;
    if (key === 'back') { closeOverlays(); return true; }
    if (OVERLAY_CLASS[key]) { if (key === open) closeOverlays(); else openOverlay(key); return true; }
    return false;
  }

  function press(key) {
    if (disposed || suspended) return;
    if (key === 'fullscreen') { fs.toggle(); return; }
    // Esc: bei offenem Overlay oder im Vollbild wie Zurück (Vollbild beendet der Browser selbst), sonst Menü
    if (key === 'esc') key = openName() || fs.isOn() ? 'back' : 'menu';
    if (!on) {
      // Standby: Menü und Fernsehzeitung gehen auch bei ausgeschaltetem Fernseher
      if (key === 'power') { powerOn(); return; }
      const openOff = openName();
      if (openOff) { routeOverlay(openOff, key); return; }
      if (key === 'menu' || key === 'guide') { openOverlay(key); return; }
      if (key === 'ok') powerOn();
      else if (key === 'back' && fs.isOn()) fs.exit();
      return;
    }
    if ((needsTap || mutedByPolicy) && userGesture(key)) return;
    if (key === 'power') { powerOff(); return; }
    if (pendingRestart && key !== 'ok') cancelRestart();

    const open = openName();
    if (open && routeOverlay(open, key)) return;
    if (key !== 'back' && digitBuf && !/^[0-9]$/.test(key)) { unlater('digit'); cancelDigits(); }

    if (/^[0-9]$/.test(key)) { digit(key); return; }
    switch (key) {
      case 'ch+': case 'up': tune(channel + 1); break;
      case 'ch-': case 'down': tune(channel - 1); break;
      case 'vol+': case 'right': changeVolume('vol+'); break;
      case 'vol-': case 'left': changeVolume('vol-'); break;
      case 'mute': changeVolume('mute'); break;
      case 'epg': case 'txt': case 'menu': case 'guide': openOverlay(key); break;
      case 'info': if (entry) osd.showInfo(describe(channel, entry, clock())); break;
      case 'audio': cycleAudio(); break;
      case 'subs': cycleSubs(); break;
      case 'restart': restart(); break;
      case 'ok':
        if (pendingRestart) confirmRestart();
        else if (entry) osd.showChannel(describe(channel, entry, clock()));
        break;
      case 'back': if (fs.isOn()) fs.exit(); else osd.hide(); break;
      default: break;
    }
  }

  // ---------- Vollbild, Handy, Fernbedienungsleiste ----------
  const fs = createFullscreen({ target: app, doc, onChange: () => revealRemote(3000) });

  function revealRemote(ms) {
    app.classList.add('show-remote');
    later('reveal', () => app.classList.remove('show-remote'), ms);
  }
  const onPointer = (e) => {
    if (e.target && e.target.closest && e.target.closest('.lfx-live-remote')) { revealRemote(4000); return; }
    const landscape = app.classList.contains('is-landscape');
    if (landscape && e.type === 'pointerdown') revealRemote(4000);
    else if (app.classList.contains('is-fullscreen')) revealRemote(3000);
  };
  app.addEventListener('pointermove', onPointer);
  app.addEventListener('pointerdown', onPointer);
  const onDbl = () => press('fullscreen');
  const onScreenClick = () => {
    if (!on) { if (!openName()) press('power'); }   // Klick ins Standby-Menü schaltet nicht ein
    else if (!suspended && !disposed && (needsTap || mutedByPolicy)) userGesture(null);
  };
  const onCtx = (e) => e.preventDefault();
  screen.addEventListener('dblclick', onDbl);
  screen.addEventListener('click', onScreenClick);
  video.addEventListener('contextmenu', onCtx);

  const mq = win.matchMedia ? safe(() => win.matchMedia('(orientation: landscape)')) : null;
  const applyOrient = () => app.classList.toggle('is-landscape', !!(opts.phone && mq && mq.matches));
  applyOrient();
  if (mq) {
    if (mq.addEventListener) mq.addEventListener('change', applyOrient);
    else if (mq.addListener) mq.addListener(applyOrient);
  }

  // ---------- Player-Ereignisse ----------
  const offs = [];
  if (player && typeof player.on === 'function') {
    offs.push(player.on('state', (s) => {
      const phase = s && s.phase;
      app.classList.toggle('is-loading', phase === 'loading' || phase === 'stalled');
      if (phase === 'stalled') {
        // Stillstand > 60 s: Ausstrahlung gilt als unterbrochen (ohne Prüfung verlassen).
        if (!stallArmed && on && entry) { stallArmed = true; later('stall', () => watchLeave(true), 60000); }
      } else if (phase === 'playing') {
        if (stallArmed) clearStall();
        if (on && playing) watchTune(); // idempotent; nach Stillstand/Unterbrechung wieder aufnehmen
      } else if (phase === 'error') {
        clearStall();
        watchLeave(true);
      }
      if (phase === 'ended' && on && entry && entry.type === 'filler' && !card.kind()) {
        const nx = nextProgram(channel, entry);
        card.showPause({ channel: channelOf(channel), title: nx ? titleOf(nx).title : null, at: nx ? nx.start : 0, until: entry.end, now: clock() });
      }
    }));
    // Autoplay-Sperre: Start nur stumm gelungen. Prefs-`muted` bleibt; erstes Tippen/Taste schaltet den Ton wieder ein.
    offs.push(player.on('autoplay-muted', () => {
      if (!on) return;
      mutedByPolicy = true;
      if (music) safe(() => music.setLevel(player.volumeSupported === false ? 1 : vol / 100, true));
      if (!muted) osd.showMessage('Ton aus – zum Einschalten tippen oder Stumm-Taste drücken', 8000);
    }));
    offs.push(player.on('error', (err) => {
      if (!on || !entry || entry.type === 'filler' || card.kind() === 'error') return;
      showError((err && err.reason) || 'network', gen);
    }));
  }

  // ---------- Tastatur ----------
  const keys = createKeys({
    onKey: press,
    isActive: () => !suspended && !disposed && app.isConnected,
    isOverlayOpen: () => !!openName(),
    win,
  });
  keys.attach();

  // ---------- Dekor / Musik / Heft initial ----------
  // Drehknöpfe der Röhre 80er (lesen den Zustand per getState; erst hier, weil sie sofort synchronisieren)
  knobs = createKnobs({
    tv: refs.tv,
    getState: () => ({ active: style === 'crt80' && !disposed && !suspended, channel, count: NCH(), volume: vol }),
    onChannel: (n) => { if (!disposed && !suspended) ctx.tune(n); },
    onVolume: (v) => setVolumeAbs(v),
    onSound: (k) => safe(() => sfx && sfx.click(k)),
    onPreview: (n) => { if (on) safe(() => osd.showMessage(`Sender ${n}`, 1200)); },
    win,
  });
  syncDecor();
  scheduleClock();
  if (music) {
    safe(() => music.setStyle(style));
    safe(() => music.setEnabled(musicOn));
  }
  if (prop) {
    placeProp();
    if (typeof ResizeObserver === 'function') { propRo = new ResizeObserver(() => schedulePlace()); propRo.observe(room); }
    // Titelbild erst nach dem Aufbau (kein Netz außer dem Cover-Bild; Inhaltsangaben erst beim Öffnen des Hefts)
    later('propcover', refreshPropCover, 0);
  }

  // ---------- Debug ----------
  const instance = {
    el: app,
    press,
    tune: (no) => tune(no),
    isOn: () => on,
    /** Nur Harness/Debug: zeigt eine Leerlaufkarte zur Ansicht (pause|test|error); Musik folgt wie im Betrieb. */
    debugCard(kind) {
      if (!on) return;
      const t = clock();
      const ch = channelOf(channel);
      safe(() => player.stop());
      if (kind === 'pause') card.showPause({ channel: ch, title: 'Platzhalter-Film', at: t + 300000, until: t + 300000, now: t });
      else if (kind === 'test') card.showTest({ channel: ch, text: 'Sendeschluss', now: t });
      else if (kind === 'error') card.showError('network', ch);
    },
    channel: () => channel,
    style: () => style,
    suspend() {
      if (disposed) return;
      powerOff();
      closeOverlays();
      app.classList.remove('is-powering-off');
      suspended = true;
      keys.detach();
      fs.exit();
    },
    resume(newHost) {
      if (disposed) return;
      if (newHost) host = newHost;
      if (!app.isConnected || app.parentNode !== host) host.append(app);
      suspended = false;
      keys.attach();
    },
    dispose() {
      if (disposed) return;
      powerOff();
      stopAll();
      disposed = true;
      stopIntervals();
      for (const k of Object.keys(T)) clearTimeout(T[k]);
      keys.destroy();
      fs.destroy();
      app.removeEventListener('pointermove', onPointer);
      app.removeEventListener('pointerdown', onPointer);
      screen.removeEventListener('dblclick', onDbl);
      screen.removeEventListener('click', onScreenClick);
      video.removeEventListener('contextmenu', onCtx);
      if (mq) {
        if (mq.removeEventListener) mq.removeEventListener('change', applyOrient);
        else if (mq.removeListener) mq.removeListener(applyOrient);
      }
      for (const off of offs) if (typeof off === 'function') safe(off);
      for (const n of Object.keys(made)) { const o = made[n]; if (o) { safe(() => o.close()); if (o.el) o.el.remove(); } }
      noise.dispose();
      knobs.dispose();
      decor.dispose();
      if (sfx && sfxArg === undefined) safe(() => sfx.dispose());
      osd.dispose();
      card.dispose();
      remote.destroy();
      if (propRo) propRo.disconnect();
      if (prop) prop.destroy();
      propSlot.remove();
      side.remove();
      if (music) safe(() => music.dispose());
      if (watch) safe(() => watch.dispose && watch.dispose());
      if (player) safe(() => player.dispose && player.dispose());
      app.remove();
      if (win.__lfxLive && win.__lfxLive.app === instance) delete win.__lfxLive;
    },
  };

  if (opts.debug) {
    win.__lfxLive = {
      scheduler,
      tune: (no) => tune(no),
      now: clock,
      plan: (no, D) => scheduler.planDay(no, D),
      app: instance,
    };
  }

  return instance;
}

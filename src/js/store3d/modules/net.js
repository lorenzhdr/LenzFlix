// VIDEOTHEK LENZ · Modul net: Mehrspieler (lfx-mp.1, Welle a: Transport, Präsenz, Fremdfiguren). Vertrag: docs/mp-api.md §11.2.
// Ohne deps.mp gibt es nichts (kein Provider, kein DOM, keine Listener). init wartet nie aufs Netz; die Verbindung entsteht erst nach 'enter'.
// Jede Störung (Ticket 404/503/401, CSP, Kontingent, Abbruch, Fehler) führt zu 1.15-Verhalten: Figuren, Anzeige und Teile weg, nur das Panel nennt den Grund.
// Lebenszyklus: onSuspend (echt ausgesetzt) schließt mit 1000, onResume verbindet neu; VR-Kino (ctx.suspended() false) hält die Verbindung, verbirgt nur Figuren (W9).
// Das Jellyfin-Token gelangt nie hierher; deps.mp.ticket() liefert nur das kurzlebige Ticket.
//   Provider 'net': { active(), me(), has(cap), count(), serverNow(), peers(), peerName(c), on(ev), send(msg), physGate(body), menu(), renderMenu(el),
//                     onChange(fn), emote(code), openEmotes(), say(text), openChat(), setKino(on) }   ev = 'state' | 'peers' | 'msg:<t>'
import { createTransport } from '../net/transport.js';
import { createFrame } from '../net/frame.js';
import { createPose } from '../net/pose.js';
import { createPeers } from '../net/peers.js';
import { createSeatNet } from '../palast/seatnet.js';
import { joinOffers } from '../palast/choice.js';
import { F, build, bodyAnimToNet } from '../net/proto.js';
import { createHud } from '../net/hud.js';
import { createPanel } from '../net/panel.js';
import { PART_FACTORIES } from '../net/parts.js';

const warn = (what, err) => { try { console.warn('[LenzFlix Store3D] mp', what, err && err.message ? err.message : ''); } catch { /* egal */ } };
const HINT = 'Andere auf diesem Server sehen dich hier. Abschalten im Menü unter Mehrspieler.';
const HINT_MS = 7000;
const DEFAULTS = { on: true, name: true, card: true, film: false, chat: true, mute: [], hint: false };
const PART_ERR_MAX = 5;
const PART_ERR_WINDOW_MS = 60000;

export default {
  name: 'net',
  init(ctx) {
    const mp = ctx.deps && ctx.deps.mp;
    if (!mp || typeof mp.ticket !== 'function') return null;
    const opts = ctx.opts || {};
    const WS = (opts.debug && opts.mpTransport) || (typeof WebSocket !== 'undefined' ? WebSocket : null);

    const bus = new Map(); // Ereignis → Set<fn>
    const emit = (ev, ...a) => {
      const l = bus.get(ev);
      if (!l) return;
      for (const fn of [...l]) { try { fn(...a); } catch (err) { warn('Hörer ' + ev, err); } }
    };
    const on = (ev, fn) => {
      if (typeof fn !== 'function') return () => {};
      const l = bus.get(ev) || new Set();
      l.add(fn);
      bus.set(ev, l);
      return () => l.delete(fn);
    };
    const changeFns = new Set();
    const change = () => { emit('state'); for (const fn of [...changeFns]) { try { fn(); } catch (err) { warn('onChange', err); } } };

    const prefs = () => {
      let p = null;
      try { p = mp.prefs(); } catch { /* Standard */ }
      return { ...DEFAULTS, ...(p && typeof p === 'object' ? p : {}) };
    };
    const writePrefs = (p) => { try { if (ctx.deps.onPrefs) ctx.deps.onPrefs({ mp: p }); } catch (err) { warn('prefs', err); } };

    let disposed = false;
    let entered = false;
    let live = false;
    let failed = null; // 'err' | 'nows': Modul selbst abgeschaltet (Panel nennt den Grund)
    let suspendedClosed = false; // echte Aussetzung hat die Verbindung geschlossen
    let cinemaVr = false; // VR-Kino: Figuren/DOM verborgen, Verbindung bleibt
    let heldId = null;
    let hudText = '';
    let sigPeers = '';

    const frame = createFrame(ctx.layout);
    const pose = createPose({ frame, rate: () => (transport ? transport.info().cf.pr : 8) });
    const hud = createHud(ctx, { onChat: () => openChat(), onEmote: () => openEmotes() });
    let transport = null;
    let peers = null;
    let seatnet = null;
    const parts = [];
    const offs = [];

    const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
    const flags = () => {
      const p = prefs();
      return (p.name ? F.NAME : 0) | (p.film ? F.FILM : 0) | (p.chat ? F.CHAT : 0) | (ctx.xr && ctx.xr.presenting() ? F.VR : 0);
    };
    const send = (msg, o) => (transport && live && !disposed ? transport.send(msg, o) : false);
    const toast = (text) => { try { ctx.xr.toast(text, HINT_MS); } catch { /* egal */ } };

    // ---------------------------------------------------------------- Teile (Stubs der Wellen b bis d)
    const core = {
      ctx, frame, send: (m) => send(m), me: () => (transport ? transport.me() : null), cap: (n) => !!transport && transport.has(n),
      active: () => live && !disposed, serverNow: () => (transport ? transport.serverNow() : null), peers: null, prefs, setPref: (p) => setPref(p), toast, on: (t, fn) => on('msg:' + t, fn),
    };
    let partErrs = [];
    const callParts = (name, ...a) => {
      for (const p of parts) {
        if (typeof p[name] !== 'function') continue;
        try { p[name](...a); } catch (err) {
          warn('Teil ' + name, err);
          const t = nowMs();
          partErrs = partErrs.filter((x) => t - x < PART_ERR_WINDOW_MS);
          partErrs.push(t);
          if (partErrs.length > PART_ERR_MAX) { stopAll('err'); return; }
        }
      }
    };

    // ---------------------------------------------------------------- Sitzung
    function endSession() {
      live = false;
      sentHd = null;
      pose.reset();
      if (peers) peers.clear();
      callParts('stop');
      hud.set(null);
      hudText = '';
      sigPeers = '';
    }

    /** Still-aus: alles auf 1.15 zurück (Verbindung zu, Figuren/Anzeige/Teile weg). */
    function stopAll(reason) {
      if (reason) failed = failed || reason;
      if (transport) transport.stop(1000);
      endSession();
      change();
    }

    function maybeStart() {
      if (disposed || failed || !entered || suspendedClosed || !transport) return;
      if (!prefs().on) return;
      if (!WS) { failed = 'nows'; change(); return; }
      if (transport.state() === 'dead') transport.reset();
      transport.setHidden(typeof document !== 'undefined' && document.hidden === true);
      transport.start();
    }

    let sentFlags = -1;
    function sendFlags() { const f = flags(); if (send(build.f(f))) sentFlags = f; }
    let sentHd = null; // zuletzt gesendete Hülle in der Hand (nur mit Film-Flag; sonst geht nie eine ID über die Leitung)
    function syncHeld() {
      const want = prefs().film ? heldId : null;
      if (want === sentHd) return;
      if (send(build.hd(want))) sentHd = want;
    }

    function onState(s) {
      if (disposed) return;
      if (s === 'live') {
        live = true;
        pose.reset();
      } else if (live) {
        endSession();
      }
      change();
    }

    function peersSig() {
      const list = peers ? peers.list() : [];
      return list.map((p) => `${p.c}:${p.k}:${p.f}:${p.n}:${p.card ? 1 : 0}`).join('|');
    }

    function onMsg(m) {
      if (disposed || !m) return;
      if (m.t === 'wl') {
        peers.welcome(m);
        callParts('welcome', m);
        sentFlags = flags(); // das hi trug die Flags schon
        syncHeld();
        const pr = prefs();
        if (!pr.hint) { toast(HINT); writePrefs({ hint: true }); }
      } else if (m.t === 'b' || m.t === 'j' || m.t === 'l' || m.t === 'pf') {
        peers.ev(m);
        if (m.t === 'b') callParts('ev', m);
      } else if (m.t === 'x') {
        callParts('x', m);
        // sendTo-Ereignisse (Fähigkeit look: lk/mc anderer) kommen als x-Frame
        if (Array.isArray(m.ev)) for (const e of m.ev) if (e && (e.t === 'lk' || e.t === 'mc')) peers.ev(e);
      }
      emit('msg:' + m.t, m);
      if ((m.t === 'b' || m.t === 'x') && Array.isArray(m.ev)) for (const e of m.ev) if (e && typeof e.t === 'string') emit('msg:' + e.t, e, m);
      if (m.t === 'wl' || m.t === 'j' || m.t === 'l' || m.t === 'pf' || m.t === 'b' || m.t === 'x') {
        const sig = peersSig();
        if (sig !== sigPeers) { sigPeers = sig; emit('peers'); change(); }
      }
    }

    transport = createTransport({
      ticket: () => mp.ticket(),
      env: {
        WebSocket: WS,
        now: () => Date.now(),
        setTimeout: (f, ms) => setTimeout(f, ms),
        clearTimeout: (h) => clearTimeout(h),
        random: Math.random,
      },
      hello: () => ({ cap: ['pres', 'chat', 'emote', 'push', 'phys', 'rich', 'wx', 'kino', 'admin', 'look'], f: flags(), cv: mp.cv }),
      onMsg,
      onState,
    });
    peers = createPeers({ ctx, frame, serverNow: () => transport.serverNow(), me: () => transport.me(), cap: (n) => transport.has(n) });
    core.peers = peers;
    for (const k of Object.keys(PART_FACTORIES)) {
      try { const h = PART_FACTORIES[k](core); if (h) parts.push(h); } catch (err) { warn('Teil ' + k, err); }
    }

    // ---------------------------------------------------------------- Chat, Emotes, Liste (Welle b)
    const chatPart = () => parts.find((p) => typeof p.sayResult === 'function') || null;
    const emotePart = () => parts.find((p) => typeof p.emote === 'function') || null;
    const chatOn = () => { const c = chatPart(); return !!(c && live && c.enabled() && core.cap('chat') && !(ctx.xr && ctx.xr.presenting())); };
    const emoteOn = () => !!(emotePart() && live && prefs().on !== false && core.cap('emote') && !(ctx.xr && ctx.xr.presenting()));
    function openChat() { const c = chatPart(); return !!c && chatOn() ? !!c.open() : false; }
    function openEmotes() { const e = emotePart(); return !!e && emoteOn() ? !!e.open() : false; }
    const isMuted = (k) => { const c = chatPart(); return c ? c.isMuted(k) : prefs().mute.includes(k); };
    /** Eine Zeile je Person (k): Name, grober Ort, Geräteanzahl, Admin; ohne mich. */
    function players() {
      const me = transport.me();
      const by = new Map();
      for (const p of peers.list()) {
        if (me && (p.c === me.c || p.k === me.k)) continue;
        let r = by.get(p.k);
        if (!r) { r = { k: p.k, c: p.c, name: 'Jemand', area: '', devs: p.devs || 1, admin: false, card: false, cs: [] }; by.set(p.k, r); }
        if (p.card) r.card = true;
        r.cs.push(p.c);
        const nm = peers.name(p.c);
        if (nm !== 'Jemand') r.name = nm;
        if (p.ad) r.admin = true;
        if (p.area && !r.area) r.area = p.area;
      }
      return [...by.values()];
    }
    /** Filmtitel je Zeile: nur aus öffentlichen Kino-Sitzungen (Gastgeber oder Mitglied) UND nur aus dem eigenen Katalog, sonst ''. */
    function filmTitle(row) {
      try {
        const c2 = ctx.use('cinema2d');
        const pt = c2 && c2.party;
        const cs = row && Array.isArray(row.cs) ? row.cs : (row && row.c ? [row.c] : []);
        if (!pt || typeof pt.offers !== 'function' || !cs.length) return '';
        const cat = ctx.catalog && ctx.catalog.items;
        if (!cat) return '';
        const items = cat instanceof Map ? cat : new Map(Object.entries(cat));
        for (const e of pt.offers() || []) {
          if (!e || !(cs.includes(e.host) || (Array.isArray(e.m) && e.m.some((c) => cs.includes(c))))) continue;
          const o = joinOffers([e], items, null, 0, null)[0];
          if (o && o.title) return o.title;
        }
      } catch { /* kein Titel */ }
      return '';
    }
    function kickPlayer(k) {
      const me = transport.me();
      if (!me || !me.admin || !live) return false;
      const r = players().find((x) => x.k === k);
      if (!r || r.admin) return false;
      return send(build.ki(r.c));
    }
    /** Ausweis einer Person (Zeile der Spielerliste) ansehen: member.showCard mit dem Ausweis des ersten Geräts, das einen zeigt. */
    function showPlayerCard(k) {
      const p = peers.list().find((x) => x.k === k && x.card);
      return !!p && peers.showCard(p.c);
    }
    offs.push(on('msg:er', (e) => { if (e && e.y === 'ki') toast('Entfernen nicht möglich.'); }));

    // ---------------------------------------------------------------- Anzeige und Zählung
    function others() {
      const me = transport.me();
      return peers.list().filter((p) => !me || p.c !== me.c);
    }
    function count() {
      const me = transport.me();
      const ks = new Set(others().map((p) => p.k));
      if (me) ks.add(me.k);
      return ks.size;
    }
    function hudLabel() {
      const n = count();
      const conn = others().length + 1;
      return conn > n ? `${n} hier · ${conn} Geräte` : `${n} hier`;
    }

    function seats() {
      if (seatnet) return seatnet;
      const pal = ctx.use('palast');
      const list = pal && pal.plan && pal.plan.seats;
      if (list && list.length) seatnet = createSeatNet(list);
      return seatnet;
    }

    function samplePose(ms) {
      const n = ctx.player.getNet();
      if (!n) return;
      const s = { x: n.x, y: n.y, z: n.z, yaw: n.yaw, pitch: n.pitch, a: bodyAnimToNet(n.a) };
      const c2 = ctx.use('cinema2d');
      if (c2 && c2.seated && c2.seatId != null && c2.active !== false) {
        const sn = seats();
        const se = sn ? sn.encode(c2.seatId) : null;
        if (se) { s.a = 7; s.se = se; }
      }
      // Friseurstuhl im Salon (1.17.0): a=7 ohne se; r bleibt der Bereich (peers.js nutzt Kinositze nur bei r===1, sonst sitzt die Figur an der Körperposition)
      if (s.a !== 7) { try { const sa = ctx.use('salon'); if (sa && typeof sa.sitting === 'function' && sa.sitting()) s.a = 7; } catch { /* egal */ } }
      const m = pose.update(s, ms);
      if (m) transport.send(m);
    }

    // ---------------------------------------------------------------- Panel
    function statusText() {
      if (failed === 'nows') return 'Mehrspieler: vom Browser nicht unterstützt.';
      if (failed) return 'Mehrspieler wegen eines Fehlers vorübergehend aus.';
      if (!prefs().on) return 'Mehrspieler ist aus.';
      const i = transport.info();
      const wait = () => {
        const s = Math.max(1, Math.round((i.until - Date.now()) / 1000));
        return s >= 90 ? `${Math.round(s / 60)} min` : `${s} s`;
      };
      switch (i.state) {
        case 'live': return `Verbunden · ${hudLabel()}`;
        case 'ticket': case 'open': case 'hello': return 'Verbindung wird aufgebaut …';
        case 'idle': return i.why === 'hidden' ? 'Pausiert, solange die Seite im Hintergrund ist.' : 'Noch nicht verbunden.';
        case 'banned': {
          const d = new Date(i.until);
          return `Ausgeschlossen bis ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} Uhr.`;
        }
        case 'backoff':
          if (i.why === 'full') return `Server voll, neuer Versuch in ${wait()}.`;
          if (i.why === 'quota') return 'Tageslimit des Servers erreicht, später erneut.';
          if (i.why === 'limit') return 'Verbindung gestört, nächster Versuch in 30 min.';
          return `Verbindung unterbrochen, neuer Versuch in ${wait()}.`;
        case 'dead':
          if (i.why === 'nourl' || i.why === 'gone') return 'Mehrspieler ist auf diesem Server nicht eingerichtet.';
          if (i.why === 'off') return 'Mehrspieler ist vorübergehend aus.';
          if (i.why === 'pv') return i.hint || 'Update nötig.';
          if (i.why === 'cap') return 'Der Server unterstützt Mehrspieler nicht. Update nötig.';
          if (i.why === 'dup') return 'Zu viele Verbindungen mit diesem Konto.';
          if (i.why === 'auth' || i.why === 'user') return 'Anmeldung abgelaufen. Seite neu laden.';
          if (i.why === 'err') return 'Mehrspieler wegen eines Fehlers vorübergehend aus.';
          return 'Der Mehrspieler-Dienst ist nicht erreichbar.';
        default: return entered ? 'Noch nicht verbunden.' : '';
      }
    }

    function setPref(p) {
      const before = prefs();
      writePrefs(p);
      const now = prefs();
      if (now.on !== before.on) {
        if (now.on) {
          failed = failed === 'nows' ? failed : null;
          partErrs = [];
          maybeStart();
        } else {
          if (transport) transport.stop(1000);
          endSession();
        }
      } else if (live) {
        if (flags() !== sentFlags) sendFlags();
        if (now.film !== before.film) syncHeld();
        if (now.card !== before.card) callParts('prefs');
      }
      change();
    }
    const panel = createPanel({
      prefs, set: setPref, status: statusText, players, isMuted,
      setMute: (k, v) => { const c = chatPart(); if (c) return c.setMuted(k, v); setPref({ mute: v ? [...new Set([...prefs().mute, k])].slice(0, 50) : prefs().mute.filter((x) => x !== k) }); return isMuted(k); },
      canKick: () => { const me = transport.me(); return !!(live && me && me.admin && core.cap('admin')); },
      kick: kickPlayer, filmTitle, showCard: showPlayerCard,
    });

    // ---------------------------------------------------------------- Provider
    const removeProvider = ctx.provide('net', {
      active: () => live && !disposed,
      prefs,
      /** Diagnose (Debug/Panel): Sitzung, Ausschaltgrund, Transportzustand. */
      diag: () => ({ live, failed: failed || null, entered, suspendedClosed, transport: transport && transport.info ? transport.info() : null }),
      me: () => (transport ? transport.me() : null),
      has: (cap) => !!transport && transport.has(cap),
      count,
      serverNow: () => (transport ? transport.serverNow() : null),
      peers: () => others().map((p) => ({ ...p })),
      peerName: (c) => peers.name(c),
      on,
      send: (msg) => send(msg),
      physGate: (b) => { const p = parts.find((x) => typeof x.gate === 'function'); try { return p ? p.gate(b) : true; } catch { return true; } },
      menu: () => ({ label: 'Mehrspieler …' }),
      renderMenu: (el) => panel.render(el),
      onChange: (fn) => { if (typeof fn !== 'function') return () => {}; changeFns.add(fn); return () => changeFns.delete(fn); },
      /** Emote auslösen (Code 1..8 oder Name); false bei Cooldown/ohne Verbindung. */
      emote: (x) => { const e = emotePart(); return !!e && emoteOn() ? !!e.emote(x) : false; },
      openEmotes,
      say: (t) => { const c = chatPart(); return !!c && c.say(t); },
      openChat,
      /** Kino-Sitzung aktiv: Verbindung bleibt auch im verborgenen Tab offen (W9). */
      setKino: (v) => { if (transport) transport.setKino(!!v); },
    });

    // ---------------------------------------------------------------- Ereignisse
    const onVis = () => { if (transport && entered) transport.setHidden(document.hidden === true); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
    offs.push(ctx.on('enter', () => { entered = true; maybeStart(); }));
    offs.push(ctx.on('xr', () => { if (live) sendFlags(); hud.set(null); }));
    offs.push(ctx.on('carry', (c) => { heldId = c && c.id ? c.id : null; if (live) syncHeld(); }));

    return {
      update(dt, t) {
        if (disposed) return;
        if (!live) return;
        if (cinemaVr || ctx.suspended()) return;
        peers.tick(dt);
        callParts('tick', dt, t);
        if (!live) return;
        samplePose(nowMs());
        hudText = ctx.playing() && !(ctx.xr && ctx.xr.presenting()) ? hudLabel() : '';
        hud.set(hudText, { chat: chatOn(), emote: emoteOn() });
      },
      onSuspend() {
        if (disposed) return;
        if (ctx.suspended()) {
          // echte Aussetzung: Verbindung zu, Figuren und Anzeige weg
          suspendedClosed = true;
          if (transport) transport.stop(1000);
          endSession();
          change();
        } else {
          // VR-Kino: Verbindung bleibt offen (W9), keine Posen, Figuren und Anzeige verborgen
          cinemaVr = true;
          peers.setActive(false);
          hud.set(null);
        }
      },
      onResume() {
        if (disposed) return;
        cinemaVr = false;
        if (peers) peers.setActive(true);
        if (suspendedClosed) { suspendedClosed = false; maybeStart(); }
      },
      onQuality() { if (peers) peers.onQuality(); },
      dispose() {
        if (disposed) return;
        disposed = true;
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
        for (const off of offs) { try { off(); } catch { /* egal */ } }
        offs.length = 0;
        try { if (transport) transport.stop(1000); } catch { /* egal */ }
        for (const p of parts) { try { if (p.dispose) p.dispose(); } catch { /* egal */ } }
        parts.length = 0;
        try { peers.dispose(); } catch { /* egal */ }
        hud.dispose();
        removeProvider();
        bus.clear();
        changeFns.clear();
        live = false;
      },
    };
  },
};

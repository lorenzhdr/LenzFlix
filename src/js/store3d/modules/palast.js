// VIDEOTHEK LENZ · Modul `palast`: Innenausbau des Kinos LENZ PALAST (Foyer, Saal, Programm, Filmauswahl, Hinsetzen).
// Hängt Foyer und Saal in city.groups.palastInterior (Sichtbarkeit steuert modules/city.js), meldet den Saal bei PalastCinema
// (ctx.use('cinema2d')) an und stellt den Provider 'palast' bereit:
//   { plan, stations, program(), ticket(), ticketBook, nowMin(), openSelection(), sit(seatId), test(o) }
// Fremde Provider (npc, discover, sound, weather) werden erst beim Aufruf geholt und mit Guard benutzt.
import { Mesh, MeshBasicMaterial, DoubleSide } from 'three';
import { quad, merge } from '../util/geo.js';
import { buildPlan, outerPosterSlots, inRect } from '../palast/plan.js';
import { buildProgram, dayKeyOf, minutesOf, clockText } from '../palast/program.js';
import {
  createTicketBook, showRows, tapeOf, seatGate, ticketToast, tearLine, joinOffers,
} from '../palast/choice.js';
import { renderJoin, joinSpec } from '../palast/joinpanel.js';
import { buildHall } from '../palast/hall.js';
import { buildFoyer } from '../palast/foyer.js';
import { renderPanel } from '../palast/panel.js';
import { openPanel, coverBoard } from './m3-gfx.js';
import { coverRef } from './m3-util.js';
import { debugHook } from './m3-debug.js';

const warn = (...a) => { try { console.warn('[LenzFlix Store3D]', ...a); } catch { /* egal */ } };

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export function dayLabel(dayKey) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dayKey || ''));
  return m ? `Heute, ${Number(m[3])}. ${MONTHS[Number(m[2]) - 1]}` : 'Heute im Programm';
}

/** Abstand der Außenplakate vor der Kastenmitte (Fläche des Kastens: Tiefe 0,05 bei z−0,04 → Vorderseite 0,065 davor). */
const POSTER_LIFT = 0.1;

export default {
  name: 'palast',
  init(ctx) {
    const L = ctx.layout;
    const pd = L.city && L.city.palast;
    if (!pd || !pd.hall || !pd.seatBlock) return {};
    const plan = buildPlan(pd);
    const city = ctx.use('city');
    const groups = city && city.groups;
    const parent = groups ? groups.palastInterior : null;
    if (!parent) return {};

    const removers = [];
    const rects = [];
    const cleanup = [];
    for (const c of plan.colliders) rects.push(ctx.addCollider({ ...c }));

    // ---------------------------------------------------------------- Programm
    const catItems = () => {
      const it = ctx.catalog && ctx.catalog.items;
      return it instanceof Map ? it : new Map(Object.entries(it || {}));
    };
    const itemOf = (show) => (show ? catItems().get(show.itemId) || null : null);
    const nowDate = () => new Date();
    const nowMin = () => {
      const w = ctx.use('weather');
      if (w && Number.isFinite(w.hour)) return minutesOf(w.hour);
      return minutesOf(nowDate());
    };
    let dayKey = dayKeyOf(nowDate()) || '';
    let program = buildProgram(ctx.catalog, dayKey);
    const book = createTicketBook();

    // ---------------------------------------------------------------- Meshes
    let atlas = null;
    if (program.shows.length) {
      const entries = program.shows.map((s) => {
        const it = itemOf(s);
        const ref = it ? coverRef(it) : { id: s.itemId, tag: undefined };
        return { url: ctx.deps.imageUrl(ref.id, { maxWidth: 300, tag: ref.tag }), title: s.title };
      });
      atlas = coverBoard(ctx, entries, { cols: 2, cw: 200, ch: 300, maxWidth: 300 });
    }
    const foyer = buildFoyer(plan, { atlas, posterCount: program.shows.length });
    const hall = buildHall(plan, pd);
    parent.add(foyer.root, hall.root);

    // Außenplakate in den Schaukasten-Rahmen (Paket A liefert pd.posterSlots; fehlt es, bleibt es leer)
    let outer = null;
    const outerSlots = atlas ? outerPosterSlots(pd) : [];
    if (outerSlots.length && groups.palast) {
      const geos = outerSlots.map((s, i) => quad({
        w: s.w, h: s.h, uv: atlas.uv(i % program.shows.length), x: s.x + Math.sin(s.yaw) * POSTER_LIFT, y: s.y, z: s.z + Math.cos(s.yaw) * POSTER_LIFT, ry: s.yaw,
      }));
      outer = new Mesh(merge(geos), new MeshBasicMaterial({ map: atlas.texture, toneMapped: false, side: DoubleSide }));
      outer.name = 'palast-outer-posters';
      groups.palast.add(outer);
      cleanup.push(() => { outer.removeFromParent(); outer.geometry.dispose(); outer.material.dispose(); });
    }

    const refreshBoard = () => foyer.setBoard({ program, nowMin: nowMin() });
    refreshBoard();

    // ---------------------------------------------------------------- Hilfen
    const xr = () => Boolean(ctx.xr && ctx.xr.presenting && ctx.xr.presenting());
    const toast = (t) => { if (!t) return; try { if (ctx.xr && ctx.xr.toast && xr()) ctx.xr.toast(t); else ctx.deps.toast(t); } catch { /* egal */ } };
    const sfx = (name) => { const s = ctx.use('sound'); if (s && typeof s.play === 'function') { try { s.play(name); } catch { /* egal */ } } };
    const say = (role, text) => {
      const n = ctx.use('npc');
      const h = n && typeof n.staff === 'function' ? n.staff(role) : null;
      if (h && typeof h.say === 'function') { try { h.say(text, 3200); } catch { /* egal */ } }
    };
    const inHall = () => { const p = ctx.player.getPose(); return inRect(plan.bounds, p.x, p.z); };
    const cinema = () => ctx.use('cinema2d') || null;

    // ---------------------------------------------------------------- Saal anmelden
    let offSaal = null;
    function attach() {
      if (offSaal) return true;
      const c = cinema();
      if (!c || typeof c.attachSaal !== 'function') return false;
      offSaal = c.attachSaal(hall);
      return true;
    }
    attach();

    // ---------------------------------------------------------------- Filmauswahl
    function openSelection() {
      if (xr()) { toast('In der Brille: einfach in den Saal setzen – das Programm läuft von allein.'); return null; }
      if (ctx.overlay.isOpen()) return null;
      const tape = tapeOf(ctx.items.carried());
      const model = {
        rows: showRows(program, nowMin(), book.get()),
        ticket: book.get(),
        tape,
        footer: program.footer,
        dayLabel: dayLabel(dayKey),
        imageUrl: (it) => {
          if (!it) return '';
          const ref = coverRef(it);
          try { return ctx.deps.imageUrl(ref.id, { maxWidth: 160, tag: ref.tag }); } catch { return ''; }
        },
        itemOf,
        onBuy(row) { buy(row.show); },
        onHandIn() { handIn(tape); },
        onClear() { book.clear(); },
      };
      return openPanel(ctx, {
        cls: 'lfx-store-palast-pick', label: 'LENZ PALAST Kasse',
        build(panel, close) { renderPanel(panel, close, model); },
      });
    }

    function buy(show) {
      const it = itemOf(show);
      if (!it) { toast('Dieser Film ist gerade nicht im Haus.'); return; }
      const t = book.buyShow(show, it, dayKey);
      if (!t) return;
      sfx('clack');
      toast(ticketToast(t));
      say('ticket', `Einmal „${show.title}“, ${show.time} Uhr! Saal 1, bitte.`);
    }

    function handIn(item) {
      if (!item) { toast('Du hast keine Kassette in der Hand.'); return; }
      const t = book.handIn(item);
      if (!t) return;
      try { ctx.items.drop(); } catch { /* egal */ }
      sfx('beep2');
      toast(ticketToast(t));
      say('ticket', `„${t.title}“? Eigene Ware! Der Vorführer freut sich. Saal 1.`);
    }

    // ---------------------------------------------------------------- Sitzen
    let startedFor = null; // Ticket, für das schon gemeldet wurde
    let wasActive = false;
    // Mitschauen (1.16): öffentliche Sitzungen anderer, deren Film im eigenen Katalog steht (Rechte-Filter in joinOffers)
    function offersNow() {
      const c = cinema();
      const pt = c && c.party;
      if (!pt || typeof pt.offers !== 'function') return [];
      const n = ctx.use('net');
      try {
        const me = n && typeof n.me === 'function' ? n.me() : null;
        return joinOffers(pt.offers(), catItems(), n && n.peerName ? (x) => n.peerName(x) : null, me && me.c, n && n.serverNow ? n.serverNow() : null);
      } catch { return []; }
    }
    function openJoin(seatId, offers) {
      const t = book.get();
      const n = ctx.use('net');
      const pr = n && typeof n.prefs === 'function' ? n.prefs() : null;
      const later = (fn) => queueMicrotask(fn); // c.sit lehnt bei offenem Overlay ab: erst nach dem Schließen
      const model = {
        offers, own: t && t.source !== 'join' ? { title: t.title } : null, isPrivate: Boolean(pr && pr.film === false),
        onOwn: () => later(() => sitOwn(seatId)),
        onJoin: (o) => later(() => {
          const pt = (cinema() || {}).party;
          book.join(o);
          sitOwn(seatId, () => { try { if (pt && typeof pt.join === 'function') pt.join(o.sid, o.item); } catch (err) { warn('palast join', err); } });
        }),
      };
      return openPanel(ctx, { cls: 'lfx-store-palast-pick', label: 'LENZ PALAST Platzwahl', build(panel, close) { renderJoin(panel, close, model); }, vr: (close) => joinSpec(model, close) });
    }
    function sit(seatId) {
      const c = cinema();
      if (!(c && c.active) && !ctx.overlay.isOpen() && (xr() || inHall())) {
        const offers = offersNow();
        if (offers.length) { openJoin(seatId, offers); return false; }
      }
      return sitOwn(seatId);
    }
    /** 1.17.0: Kinobesuch am Ausweis (je Titel einmal pro Tag; Guard, wenn `member` fehlt). */
    function countCine(item) {
      const id = item && (item.Id || item.id);
      const m = ctx.use('member');
      if (id && m && typeof m.count === 'function') { try { m.count('cine', String(id)); } catch { /* egal */ } }
    }
    function sitOwn(seatId, pre) {
      const c = cinema();
      if (xr()) {
        const t = book.get();
        const show = program.shows[0];
        const it = t ? t.item : itemOf(show);
        if (it) { if (pre) pre(); countCine(it); ctx.deps.play(it, { resume: t ? t.resume : Boolean(show && show.resume) }); }
        else toast('Heute läuft nichts im Palast.');
        return false;
      }
      if (!c || !attach()) { toast('Der Saal ist gerade geschlossen.'); return false; }
      const gate = seatGate(book.get(), inHall());
      if (!gate.ok) { if (gate.msg) toast(gate.msg); return false; }
      const wasSeated = c.seated === true && c.active === true;
      const again = !wasSeated && typeof c.sameFilm === 'function' && c.sameFilm(book.get().item); // aufgestanden, Film läuft noch
      if (!c.sit(seatId)) return false;
      if (again) { if (typeof c.resumeAfterStand === 'function') c.resumeAfterStand(); return true; } // kein Neustart
      if (wasSeated) return true; // Platzwechsel bei laufendem Film: Kamera zieht um, der Stream läuft ohne Neustart weiter
      const t = book.get();
      startedFor = null;
      if (pre) pre();
      Promise.resolve(c.play(t.item, { resume: t.resume })).then((ok) => { if (ok === false && c.seated) { toast('Der Film startet gerade nicht.'); } }).catch((err) => warn('palast play', err));
      return true;
    }

    // ---------------------------------------------------------------- Interaktionen (Foyer)
    const bx = (x0, z0, x1, z1, y0, y1) => ({ min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } });
    const st = plan.stations;
    const pad = 0.15;
    removers.push(ctx.addInteractable({
      box: bx(st.kasse.x0 - pad, st.kasse.z0 - pad, st.kasse.x1 + pad, st.kasse.z1 + pad, 0, 1.6),
      label: 'Kasse', hint: 'E / Klick: Programm und Tickets', onUse: () => { say('ticket', 'Willkommen im LENZ PALAST!'); openSelection(); },
    }));
    removers.push(ctx.addInteractable({
      box: bx(st.board.x - st.board.w / 2, st.board.z - 0.3, st.board.x + st.board.w / 2, st.board.z + 0.1, st.board.y - st.board.h / 2, st.board.y + st.board.h / 2),
      label: 'Anzeigetafel', hint: 'E / Klick: Programm ansehen', onUse: () => openSelection(),
    }));
    plan.posters.forEach((q) => {
      const hx = Math.abs(Math.sin(q.yaw)) > 0.5 ? 0.3 : q.w / 2;
      const hz = Math.abs(Math.sin(q.yaw)) > 0.5 ? q.w / 2 : 0.3;
      removers.push(ctx.addInteractable({
        box: bx(q.x - hx, q.z - hz, q.x + hx, q.z + hz, q.y - q.h / 2, q.y + q.h / 2),
        label: 'Plakat', hint: 'E / Klick: Programm ansehen', onUse: () => openSelection(),
      }));
    });
    removers.push(ctx.addInteractable({
      box: bx(st.ticketDesk.x0 - 0.3, st.ticketDesk.z0 - 0.4, st.ticketDesk.x1 + 0.3, st.ticketDesk.z1 + 0.8, 0, 1.8),
      label: 'Kartenabreißer', hint: 'E / Klick: Karte abreißen oder Kassette abgeben',
      onUse: () => {
        if (xr()) { toast('In der Brille: einfach in den Saal setzen.'); return; }
        const tape = tapeOf(ctx.items.carried());
        if (tape) { handIn(tape); return; }
        const t = book.get();
        sfx('clack');
        const line = tearLine(t, t ? t.no : 0);
        toast(line);
        say('ticket', line);
      },
    }));
    removers.push(ctx.addInteractable({
      box: bx(st.popcorn.x0 - pad, st.popcorn.z0 - pad, st.popcorn.x1 + pad, st.popcorn.z1 + pad, 0, 2.0),
      label: 'Popcorn', hint: 'E / Klick: Popcorn bestellen',
      onUse: () => { sfx('beep'); toast('Popcorn: 2,50 DM. Salz oder Zucker? Der Schaden ist gleich.'); say('popcorn', 'Frisch gepoppt! Salzig oder süß?'); },
    }));

    // ---------------------------------------------------------------- Sitz-Interaktionen (nur im Saal)
    let seatRemovers = [];
    const addSeats = () => {
      if (seatRemovers.length) return;
      for (const s of plan.seats) {
        seatRemovers.push(ctx.addInteractable({
          box: bx(s.x - 0.27, s.z - 0.26, s.x + 0.27, s.z + 0.26, s.base + 0.1, s.base + 1.0),
          label: `Platz ${s.id}`, hint: 'E / Klick: Hinsetzen', anyHeight: true, onUse: () => sit(s.id),
        }));
      }
    };
    const dropSeats = () => { for (const r of seatRemovers) r(); seatRemovers = []; };
    const areas = ctx.use('areas');
    const syncSeats = (area) => { if (area === 'palastHall') addSeats(); else dropSeats(); };
    if (areas) {
      syncSeats(areas.current());
      const off = areas.on((a) => syncSeats(a));
      cleanup.push(off);
    } else addSeats();

    // ---------------------------------------------------------------- Provider
    function test(o = {}) {
      const c = cinema();
      if (!c || !attach()) return null;
      const first = o.item || itemOf(program.shows[0]) || (catItems().values().next().value || null);
      if (o.item) book.handIn(o.item);
      else if (program.shows.length) book.buyShow(program.shows[0], itemOf(program.shows[0]) || first, dayKey);
      else if (first) book.handIn(first);
      ctx.player.teleport(plan.aisle.x, plan.aisle.z, plan.aisle.yaw, 0);
      const h = {
        saal: hall,
        sit: () => c.sit(plan.seats[Math.floor(plan.seats.length / 2)].id),
        play: (it) => { const t = book.get(); return c.play(it || (t && t.item) || first, { resume: Boolean(t && t.resume) }); },
        stand: () => c.stand(),
        full: (on) => c.setFull(on !== false),
        stop: () => c.stopAndRelease(),
        diag: () => c.diag(),
        dispose() {},
      };
      if (o.autostart) { h.sit(); h.play(); }
      return h;
    }
    const prov = ctx.provide('palast', {
      plan, stations: plan.stations, hall, foyer,
      program: () => program, ticket: () => book.get(), ticketBook: book, nowMin, openSelection, sit, test,
      clockText: () => clockText(nowMin()),
    });

    const offDbg = debugHook(ctx, 'palast', { open: openSelection, sit, test, ticket: () => book.get(), program: () => program, plan });

    // ---------------------------------------------------------------- Schleife
    let acc = 0;
    return {
      update(dt) {
        if (!parent.visible) return;
        const ar = ctx.use('areas');
        const here = ar ? ar.current() : 'palastHall';
        // Saalinhalt nur zeichnen, wenn man drinnen ist (Foyer/Saal) oder in VR (alles sichtbar)
        hall.root.visible = here === 'palastHall' || here === 'palastFoyer' || xr();
        if (hall.root.visible) hall.update(dt);
        const c = cinema();
        if (c) {
          if (!offSaal) attach();
          if (c.active && c.phase === 'playing' && book.get() && startedFor !== book.get()) {
            startedFor = book.get();
            countCine(startedFor.item);
            const d = ctx.use('discover');
            if (d && typeof d.found === 'function') {
              try { d.found('palast-film'); if (startedFor.source === 'tape') d.found('palast-tape'); } catch { /* egal */ }
            }
          }
          if (wasActive && !c.active) { book.clear(); startedFor = null; }
          wasActive = c.active;
        }
        acc += dt;
        if (acc >= 1) {
          acc = 0;
          const dk = dayKeyOf(nowDate()) || dayKey;
          if (dk !== dayKey) { dayKey = dk; program = buildProgram(ctx.catalog, dayKey); }
          refreshBoard();
        }
      },
      dispose() {
        if (offSaal) { offSaal(); offSaal = null; }
        dropSeats();
        for (const r of removers) r();
        for (const r of rects) ctx.removeCollider(r);
        for (const f of cleanup) f();
        offDbg();
        if (prov) prov();
        hall.dispose();
        foyer.dispose();
      },
    };
  },
};

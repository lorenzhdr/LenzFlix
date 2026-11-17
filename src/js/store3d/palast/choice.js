// VIDEOTHEK LENZ · LENZ PALAST: Filmauswahl (rein: kein three, kein DOM). Ticket-Zustand (netzwerkfähig: getNetState/applyRemote),
// Auswahl-Zeilen für das Overlay, Sitz-Freigabe und Spruch-Texte.
import { hashStr, rng, showState } from './program.js';

const TICKET_GAGS = [
  'Ein Ticket, handgerissen und mindestens halb echt.',
  'Gültig für einen Platz, ein Popcorn und beliebig viele Tränen.',
  'Das Ticket riecht nach Karamell. Frisch gedruckt, versprochen.',
  'Bitte nicht knicken, nicht waschen, nicht verschlucken.',
  'Der Kassierer hat es persönlich abgestempelt (mit dem Daumen).',
];

const TEAR_LINES = ['Abgerissen! Saal 1, immer der Nase nach.', 'Schön gerissen. Viel Vergnügen!', 'Ritsch! Saal 1, die Tür mit dem Vorhang.'];

/** Titel einer Hülle/eines Items. */
const titleOf = (it) => String((it && (it.Name || it.name)) || '');

/** Kleiner Ticket-Speicher. ticket = { itemId, title, item, resume, source: 'program'|'tape', slot, time, no }. */
export function createTicketBook() {
  let ticket = null;
  const subs = new Set();
  const emit = () => { for (const fn of [...subs]) { try { fn(ticket); } catch { /* egal */ } } };
  return {
    get: () => ticket,
    has: () => !!ticket,
    /** show aus buildProgram → Ticket. item = Katalog-Item (zum Starten). */
    buyShow(show, item, dayKey) {
      if (!show || !item) return null;
      ticket = {
        itemId: show.itemId, title: show.title, item, resume: !!show.resume, source: 'program', slot: show.slot, time: show.time,
        no: 100 + (hashStr(`${dayKey}|${show.itemId}|${show.slot}`) % 900),
      };
      emit();
      return ticket;
    },
    /** Mitgebrachte Kassette (Hülle in der Hand) → Ticket „Eigenes Programm“. */
    handIn(item) {
      if (!item) return null;
      ticket = { itemId: item.Id || item.id || null, title: titleOf(item), item, resume: false, source: 'tape', slot: -1, time: '', no: 1 };
      emit();
      return ticket;
    },
    /** Mitschauen (1.16): Ticket der Quelle „join“, immer von vorn (resume=false), die Position holt die Party per Seek. */
    join(o) {
      if (!o || !o.item) return null;
      ticket = { itemId: o.itemId || o.item.Id || null, title: titleOf(o.item), item: o.item, resume: false, source: 'join', slot: -1, time: '', no: 0, sid: o.sid };
      emit();
      return ticket;
    },
    clear() { if (ticket) { ticket = null; emit(); } },
    onChange(fn) { subs.add(fn); return () => subs.delete(fn); },
    /** Mehrspieler (1.16): nur Ids, kein Item. */
    getNetState() { return ticket ? { itemId: ticket.itemId, source: ticket.source, slot: ticket.slot, resume: ticket.resume, no: ticket.no } : null; },
    /** Platzhalter für 1.16: Fremdzustand wird noch nicht übernommen. */
    applyRemote() { return false; },
  };
}

/** Abgabe an der Kasse/am Kartenabreißer: nur eine getragene Hülle (egal ob ausgeliehen). */
export function tapeOf(carried) {
  return carried && carried.item && (carried.item.Id || carried.id) ? carried.item : null;
}

/** Zeilen fürs Overlay. nowMin = Minuten seit Mitternacht (oder null). */
export function showRows(program, nowMin, ticket) {
  return ((program && program.shows) || []).map((s) => {
    const st = showState(s, nowMin);
    return {
      show: s,
      title: s.title,
      time: s.time,
      sub: [s.tag, s.runtimeMin > 0 ? `${s.runtimeMin} min` : '', s.year ? String(s.year) : ''].filter(Boolean).join(' · '),
      line: s.line,
      badge: s.resume ? 'Weiterschauen' : st === 'running' ? 'läuft schon – du startest von vorn' : st === 'done' ? 'läuft gerade nicht – startet für dich von vorn' : '',
      mine: Boolean(ticket && ticket.source === 'program' && ticket.slot === s.slot && ticket.itemId === s.itemId),
    };
  });
}

/** Darf man sich setzen? Ohne Ticket: Hinweis. */
export function seatGate(ticket, inHall, offer) {
  if (!inHall) return { ok: false, msg: '' };
  if (!ticket && offer) return { ok: true, msg: '' };
  if (!ticket) return { ok: false, msg: 'Erst ein Ticket an der Kasse holen' };
  return { ok: true, msg: '' };
}

/** Text nach dem Kauf (deterministisch pro Ticketnummer). */
export function ticketText(ticket) {
  if (!ticket) return '';
  if (ticket.source === 'tape') return `Eigene Kassette „${ticket.title}“ abgegeben. Der Vorführer nickt ehrfürchtig. Saal 1 – bitte Platz nehmen.`;
  const gag = TICKET_GAGS[Math.floor(rng(hashStr(`gag|${ticket.no}`))() * TICKET_GAGS.length)];
  return `Ticket Nr. ${ticket.no}: „${ticket.title}“, ${ticket.time} Uhr. ${gag} Saal 1 – bitte Platz nehmen.`;
}

/** Kurzer Toast. */
export function ticketToast(ticket) {
  if (!ticket) return '';
  if (ticket.source === 'join') return 'Du schaust mit – Saal 1, bitte Platz nehmen';
  return ticket.source === 'tape' ? 'Kassette abgegeben – Saal 1, bitte Platz nehmen' : `Ticket Nr. ${ticket.no} – Saal 1, bitte Platz nehmen`;
}

/** Spruch des Kartenabreißers; n = laufende Nummer (deterministisch). */
export function tearLine(ticket, n = 0) {
  if (!ticket) return 'Ohne Ticket? Mutig. Aber erst zur Kasse!';
  return TEAR_LINES[Math.abs(Math.floor(n)) % TEAR_LINES.length];
}

/** Mitschauen-Angebote (rein). raw = kh-Einträge ({sid,host,itemId,n,st,m,p,at} (Form von party.offers()) oder [sid,host,i,n,st,m,p,at]) aus party.offers();
 *  items = eigener Katalog (Map). Rechte-Filter: nur Filme aus dem eigenen Katalog, sonst kein Eintrag und nie ein Titel.
 *  nameOf(c) → Anzeigename, selfC = eigenes c, now = Server-ms (optional, für die Laufzeit). */
export function joinOffers(raw, items, nameOf, selfC, now) {
  const out = [];
  for (const x of raw || []) {
    const e = Array.isArray(x) ? { sid: x[0], host: x[1], itemId: x[2], n: x[3], st: x[4], m: x[5], p: x[6], at: x[7] } : x;
    const iid = e && (e.itemId || e.i);
    const it = iid && items && typeof items.get === 'function' ? items.get(iid) : null;
    if (!it || (it.Type && it.Type !== 'Movie')) continue;
    out.push({ sid: e.sid, itemId: iid, item: it, title: titleOf(it), sub: joinSub(e, nameOf, selfC, now) });
  }
  return out;
}

const hms = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s % 60).padStart(2, '0')}`;
};

/** Unterzeile: Zustand und Mitschauer (Namen nur, wenn bekannt; sonst „mit 3 Zuschauern“). */
export function joinSub(e, nameOf, selfC, now) {
  const m = Array.isArray(e.m) ? e.m.filter((c) => c !== selfC) : [];
  const n = Number.isFinite(e.n) ? e.n : m.length;
  const names = m.map((c) => (nameOf ? nameOf(c) : 'Jemand')).filter((x) => x && x !== 'Jemand');
  let who = '';
  if (names.length) who = ` · mit ${names[0]}${n > 1 ? ` und ${n - 1 === 1 ? '1 weiteren' : `${n - 1} weiteren`}` : ''}`;
  else if (n > 0) who = ` · mit ${n} Zuschauer${n === 1 ? '' : 'n'}`;
  if (e.st === 2) return `pausiert${who}`;
  if (e.st === 0) return `startet gerade${who}`;
  const pos = Number.isFinite(now) && Number.isFinite(e.p) && Number.isFinite(e.at) ? ` bei ${hms(e.p + (now - e.at))}` : '';
  return `läuft${pos}${who}`;
}

export const JOIN_FOOT = 'Beim Mitschauen kann jeder pausieren und spulen. Du schaust über dein eigenes Konto – Weiterschauen wird für dich gespeichert.';
export const JOIN_PRIVATE = 'Dein Film ist privat – andere sehen nur, dass du sitzt.';

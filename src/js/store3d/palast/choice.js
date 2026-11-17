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
export const titleOf = (it) => String((it && (it.Name || it.name)) || '');

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
      badge: s.resume ? 'Weiterschauen' : st === 'running' ? 'läuft schon – du startest von vorn' : '',
      mine: Boolean(ticket && ticket.source === 'program' && ticket.slot === s.slot && ticket.itemId === s.itemId),
    };
  });
}

/** Darf man sich setzen? Ohne Ticket: Hinweis. */
export function seatGate(ticket, inHall) {
  if (!inHall) return { ok: false, msg: '' };
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
  return ticket.source === 'tape' ? 'Kassette abgegeben – Saal 1, bitte Platz nehmen' : `Ticket Nr. ${ticket.no} – Saal 1, bitte Platz nehmen`;
}

/** Spruch des Kartenabreißers; n = laufende Nummer (deterministisch). */
export function tearLine(ticket, n = 0) {
  if (!ticket) return 'Ohne Ticket? Mutig. Aber erst zur Kasse!';
  return TEAR_LINES[Math.abs(Math.floor(n)) % TEAR_LINES.length];
}

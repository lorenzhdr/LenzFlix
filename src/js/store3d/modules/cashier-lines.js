// VIDEOTHEK LENZ · Sprüche des Kassen-Personals (rein, three-frei, testbar). Platzhalter: {name}, {title}, {dept}.
// Ton: locker, freundlich, jugendfrei; keine Marken, keine realen Ketten.

export const LINES = {
  greetDay: [
    'Moin, {name}! Frisch eingetroffen: Kaffee und Kassetten.',
    'Hallo {name}! Heute schon was gesehen oder noch Vorfreude?',
    'Willkommen, {name}! Der Teppich freut sich auch.',
  ],
  greetDusk: [
    'Guten Abend, {name}! Die beste Zeit für einen Filmabend.',
    'Hey {name}! Das Neonlicht wartet schon auf dich.',
    'Schön, dass du da bist, {name}. Gleich wird es gemütlich.',
  ],
  greetNight: [
    'Na {name}, noch wach? Die besten Filme laufen nachts.',
    'Nachtschicht! Hallo {name}, such dir was Schönes aus.',
    'Hallo {name}! Die Regale schlafen nie.',
  ],
  late: [
    'Wir haben eigentlich schon zu … aber für dich, {name}, drücke ich ein Auge zu.',
    'Es ist verdächtig spät, {name}. Ich schließe nur ganz langsam ab.',
  ],
  horror: [
    'Horror, {name}? Bitte danach das Licht anlassen.',
    '{title}? Mutig! Ich schaue nur durch die Finger.',
    'Gruselig. Ich leihe dir dazu gern eine Kuscheldecke.',
  ],
  comedy: [
    'Eine Komödie! Lachen ist gesund, sagt mein Arzt.',
    '{title} – damit kann der Abend nur gut werden.',
    'Gute Wahl, {name}. Bitte nicht beim Lachen verschlucken.',
  ],
  kids: [
    'Für die Kleinen? Die Popcorn-Pflicht gilt auch dort.',
    'Ein Klassiker für die Kinder-Ecke. Gute Wahl!',
    '{title}? Das schaue ich heimlich auch.',
  ],
  adult: [
    'Ab 18, aha. Ich sage nichts, {name}. Ich sehe gar nichts.',
    'Hinter dem Vorhang, ja? Diskretion ist unser zweiter Vorname.',
    'Der Vorhang ist dicker als er aussieht, {name}.',
  ],
  series: [
    'Eine ganze Staffel? Mutig!',
    'Serien-Box! Plane lieber ein verlängertes Wochenende ein.',
    '{title}: Nur noch eine Folge, ich kenne das.',
  ],
  vhs: [
    'Kassette! Echte Handarbeit, bitte zurückspulen.',
    'Ein Klassiker aus der Kassettenzeit. Respekt, {name}.',
  ],
  generic: [
    '{title}? Gute Wahl, {name}.',
    'Davon habe ich schon viel gehört. Nur Gutes, versprochen.',
    'Passt perfekt zu {dept}, würde ich sagen.',
    'Ich wette, das wird heute Abend dein Favorit.',
  ],
  play: [
    'Viel Spaß! Und bitte zurückspulen.',
    'Licht aus, Ton an. Viel Spaß, {name}!',
    'Gute Unterhaltung, {name}! Popcorn nicht vergessen.',
  ],
  idle: [
    'Suchst du was Bestimmtes, {name}? Frag ruhig.',
    'Keine Eile. Die Regale laufen nicht weg.',
    'Kleiner Tipp: Der Tresen beißt nicht.',
  ],
  resume: [
    'Du hast noch was offen: {title}. Weiterschauen?',
    '{title} wartet noch auf dich, {name}.',
  ],
};

/** Ersetzt {name}/{title}/{dept}; fehlende Werte fallen auf freundliche Standards zurück. */
export function fillTemplate(text, vars = {}) {
  const v = { name: 'Stammkunde', title: 'der Film', dept: 'den Regalen', ...vars };
  if (!v.name) v.name = 'Stammkunde';
  return String(text).replace(/\{(name|title|dept)\}/g, (_, k) => String(v[k] || '').slice(0, 40));
}

/** Zufällige Zeile aus `list`; `last` (Index) wird vermieden. Gibt { text, index } zurück. */
export function pickLine(list, rnd, vars, last = -1) {
  if (!list || !list.length) return null;
  let i = Math.floor(rnd() * list.length);
  if (list.length > 1 && i === last) i = (i + 1) % list.length;
  return { text: fillTemplate(list[i], vars), index: i };
}

const HORROR = /horror|grusel|gruselfilm/i;
const COMEDY = /kom[oö]die|comedy/i;

/** Kategorie für einen Titel: dept = Abteilungs-Objekt (kind/id) oder null. */
export function categoryFor(item, dept) {
  if (!item) return 'generic';
  const kind = dept && dept.kind;
  if (kind === 'adult') return 'adult';
  if (kind === 'kids') return 'kids';
  if (item.Type === 'Series' || (item.lfx && item.lfx.media === 'box') || kind === 'series') return 'series';
  const genres = (item.Genres || []).join(' ');
  if (HORROR.test(genres)) return 'horror';
  if (COMEDY.test(genres)) return 'comedy';
  if (item.lfx && item.lfx.media === 'vhs') return 'vhs';
  return 'generic';
}

/** Begrüßungskategorie: spät nachts > Tageszeit. */
export function greetingCategory(tod, late) {
  if (late) return 'late';
  return tod === 'night' ? 'greetNight' : tod === 'dusk' ? 'greetDusk' : 'greetDay';
}

/** Tipp-Text für „Mit dem Personal reden“. */
export function tipText(title, deptLabel) {
  return `Mein Tipp: ${title} – steht bei ${deptLabel || 'den Neuheiten'}.`;
}

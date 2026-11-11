// VIDEOTHEK LENZ · Sprüche des Kassierers Richard (rein, three-frei, testbar). Platzhalter: {name}, {title}, {dept}.
// Richard duzt den Kunden. Ton: locker, freundlich, jugendfrei; keine Marken, keine realen Ketten, keine Auslassungspunkte
// (Vorlesbarkeit mit Gerätestimme).

export const LINES = {
  greetDay: [
    'Moin, {name}! Frisch eingetroffen: Kaffee und Kassetten.',
    'Hallo {name}! Heute schon was gesehen oder noch Vorfreude?',
    'Willkommen, {name}! Der Teppich freut sich auch.',
    'Schön, dass du da bist, {name}. Die Regale sind frisch abgestaubt.',
    'Hey {name}! Heute ist ein guter Tag für einen guten Film.',
    'Tag, {name}! Nimm dir Zeit, hier drängelt keiner.',
  ],
  greetDusk: [
    'Guten Abend, {name}! Die beste Zeit für einen Filmabend.',
    'Hey {name}! Das Neonlicht wartet schon auf dich.',
    'Schön, dass du da bist, {name}. Gleich wird es gemütlich.',
    'Abend, {name}! Jetzt passt jeder Film besser als tagsüber.',
    'Hallo {name}! Das Popcorn ist so gut wie fertig.',
  ],
  greetNight: [
    'Na {name}, noch wach? Die besten Filme laufen nachts.',
    'Nachtschicht! Hallo {name}, such dir was Schönes aus.',
    'Hallo {name}! Die Regale schlafen nie.',
    'Mitternachtskunde! Willkommen, {name}.',
    'Hey {name}, um diese Zeit gehört die Videothek uns allein.',
  ],
  late: [
    'Wir haben eigentlich schon zu, aber für dich, {name}, drücke ich ein Auge zu.',
    'Es ist verdächtig spät, {name}. Ich schließe nur ganz langsam ab.',
    'Eigentlich ist Feierabend, {name}. Aber ein Film geht noch.',
    'So spät noch unterwegs, {name}? Dann bitte nur gute Filme.',
    'Letzte Runde, {name}! Such dir etwas aus, ich bleibe wach.',
  ],
  intro: [
    'Ich bin Richard und passe hier auf die Kassetten auf. Frag mich einfach, wenn du einen Tipp brauchst.',
    'Ich bin Richard, der Mann an der Kasse. Wenn du nicht weiter weißt, red mit mir.',
    'Mein Name ist Richard. Ich kenne hier jedes Regal und jeden Film, also sprich mich ruhig an.',
  ],
  rain: [
    'Bei dem Wetter bleibst du am besten gleich hier, {name}.',
    'Regen draußen, Film drinnen. Besser geht es nicht.',
    'Schönes Schmuddelwetter, {name}. Perfekt für einen Filmabend.',
    'Hör mal, der Regen trommelt aufs Dach. Fehlt nur noch das Popcorn.',
  ],
  horror: [
    'Horror, {name}? Bitte danach das Licht anlassen.',
    '{title}? Mutig! Ich schaue nur durch die Finger.',
    'Gruselig. Ich leihe dir dazu gern eine Kuscheldecke.',
    'Da schläft heute keiner gut. Viel Spaß, {name}!',
    'Ein Gruselfilm, ja? Ich gehe lieber nicht allein ins Lager.',
  ],
  comedy: [
    'Eine Komödie! Lachen ist gesund, sagt mein Arzt.',
    '{title} – damit kann der Abend nur gut werden.',
    'Gute Wahl, {name}. Bitte nicht beim Lachen verschlucken.',
    'Den habe ich auch schon zweimal gesehen. Und zweimal gelacht.',
    'Das ist ein Film für gute Laune, {name}.',
  ],
  kids: [
    'Für die Kleinen? Die Popcorn-Pflicht gilt auch dort.',
    'Ein Klassiker für die Kinder-Ecke. Gute Wahl!',
    '{title}? Das schaue ich heimlich auch.',
    'Kinderfilme sind die ehrlichsten, finde ich.',
    'Prima, {name}! Der Film ist ein Dauerbrenner bei den Kleinen.',
  ],
  adult: [
    'Ab 18, aha. Ich sage nichts, {name}. Ich sehe gar nichts.',
    'Hinter dem Vorhang, ja? Diskretion ist unser zweiter Vorname.',
    'Der Vorhang ist dicker als er aussieht, {name}.',
    'Ich habe nichts gesehen und nichts gehört, {name}.',
    'Ab 18 braucht keine Erklärung. Viel Vergnügen.',
  ],
  series: [
    'Eine ganze Staffel? Mutig!',
    'Serien-Box! Plane lieber ein verlängertes Wochenende ein.',
    '{title}: Nur noch eine Folge, ich kenne das.',
    'Das ist kein Film, das ist ein Lebensabschnitt, {name}.',
    'Eine Serie, ja? Dann hol dir gleich Vorräte.',
  ],
  vhs: [
    'Kassette! Echte Handarbeit, bitte zurückspulen.',
    'Ein Klassiker aus der Kassettenzeit. Respekt, {name}.',
    'Die gute alte Kassette. Das Knacken beim Einlegen gehört dazu.',
    'Zurückspulen nicht vergessen, sonst gibt es einen bösen Blick von mir.',
  ],
  generic: [
    '{title}? Gute Wahl, {name}.',
    'Davon habe ich schon viel gehört. Nur Gutes, versprochen.',
    'Passt perfekt zu {dept}, würde ich sagen.',
    'Ich wette, das wird heute Abend dein Favorit.',
    'Den hat neulich jemand dreimal hintereinander ausgeliehen.',
    'Du hast Geschmack, {name}.',
  ],
  play: [
    'Viel Spaß! Und bitte zurückspulen.',
    'Licht aus, Ton an. Viel Spaß, {name}!',
    'Gute Unterhaltung, {name}! Popcorn nicht vergessen.',
    'Und Action! Viel Vergnügen, {name}.',
    'Ich drücke die Daumen, dass er dir gefällt.',
  ],
  idle: [
    'Suchst du was Bestimmtes, {name}? Frag ruhig.',
    'Keine Eile. Die Regale laufen nicht weg.',
    'Kleiner Tipp: Der Tresen beißt nicht.',
    'Wenn du nicht weiterweißt, red einfach mit mir.',
    'Stöbern ist die halbe Miete, {name}.',
    'Ich habe hier alle Zeit der Welt, {name}.',
  ],
  resume: [
    'Du hast noch was offen: {title}. Weiterschauen?',
    '{title} wartet noch auf dich, {name}.',
    'Wolltest du nicht {title} zu Ende schauen?',
    'Dein angefangener Film {title} liegt noch bereit.',
  ],
  put: [
    'Nicht gefunden? Kein Problem, stell ihn einfach zurück.',
    'Wieder einsortiert. Vorbildlich, {name}.',
    'Ordnung muss sein, danke dir.',
    'Zurück ins Regal, wo er hingehört.',
  ],
  couchSit: [
    'Mach es dir gemütlich, {name}.',
    'Viel Spaß auf dem Sofa. Fernsehen ist hier Ehrensache.',
    'Das Sofa ist der beste Platz im Laden.',
    'Bequem sitzen, Trailer gucken, besser geht es nicht.',
  ],
  couchStand: [
    'Und, was Schönes gesehen?',
    'Wieder da, {name}? Dann such dir was aus.',
    'Bereit für den nächsten Film?',
    'Das Sofa läuft nicht weg, du kannst jederzeit wiederkommen.',
  ],
  adultLong: [
    'Alles in Ordnung hinter dem Vorhang, {name}?',
    'Lass dir ruhig Zeit, {name}. Ich sage nichts.',
    'Du bist ganz schön lange da hinten. Brauchst du Hilfe bei der Auswahl?',
    'Keine Eile, {name}. Es gibt viel zu entdecken.',
  ],
  kidsEnter: [
    'Die Kinder-Ecke! Hier wird es bunt.',
    'Willkommen bei den Kleinen, {name}.',
    'Hier stehen die echten Klassiker, glaub mir.',
    'Vorsicht, hier liegt vielleicht noch ein Kuscheltier.',
  ],
  dialogHello: [
    'Hallo {name}! Ich bin Richard. Wobei kann ich dir helfen?',
    'Na, {name}? Suchst du einen Tipp für heute Abend?',
    'Schön, dass du vorbeikommst, {name}. Was darf es sein?',
    'Hey {name}, ich höre. Wonach ist dir heute?',
  ],
  dialogBye: [
    'Bis gleich, {name}. Viel Spaß beim Stöbern!',
    'Tschüss, {name}! Und bitte zurückspulen.',
    'Mach es gut, {name}. Ich bin hier, wenn du mich brauchst.',
    'Bis später, {name}!',
  ],
  tipComedy: [
    'Wenn du lachen willst: {title}. Das steht bei {dept}.',
    'Probier mal {title}. Der bringt jeden zum Lachen, steht bei {dept}.',
    'Für gute Laune empfehle ich {title}. Du findest ihn bei {dept}.',
  ],
  tipHorror: [
    'Du willst gruseln? Dann nimm {title}. Der steht bei {dept}.',
    'Für Mutige: {title}. Zu finden bei {dept}. Licht anlassen!',
    'Mein Gruseltipp ist {title}. Du findest ihn bei {dept}.',
  ],
  tipKids: [
    'Für die Kleinen passt {title} richtig gut. Das steht bei {dept}.',
    'Wie wäre es mit {title}? Der kommt bei Kindern immer gut an, steht bei {dept}.',
    'Probier {title} aus, den lieben die Kleinen. Zu finden bei {dept}.',
  ],
  tipNew: [
    'Ganz frisch eingetroffen: {title}. Das liegt bei {dept}.',
    'Schau dir mal {title} an. Der ist neu bei {dept}.',
    'Brandneu im Regal: {title}. Zu finden bei {dept}.',
  ],
  tipRandom: [
    'Mein Tipp heute: {title}. Der steht bei {dept}.',
    'Ich würde {title} nehmen. Du findest ihn bei {dept}.',
    'Wie wäre es mit {title}? Das ist mein Favorit, steht bei {dept}.',
  ],
  tipResume: [
    'Du hast {title} angefangen. Willst du nicht weiterschauen?',
    'Mach doch mit {title} weiter, {name}. Der wartet auf dich.',
    'Dein angefangener Film {title} liegt noch bereit. Weiterschauen?',
  ],
  noTip: [
    'Gerade fällt mir nichts ein, {name}. Stöbere ruhig selbst.',
    'Heute habe ich leider keinen Tipp. Schau dich einfach um.',
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

/** Tipp-Text (Kompatibilität, nicht mehr im Dialog benutzt). */
export function tipText(title, deptLabel) {
  return `Mein Tipp: ${title} – steht bei ${deptLabel || 'den Neuheiten'}.`;
}

/** Kandidaten für die Dialog-Antworten (ohne Ab-18, ohne Dubletten je Liste). deptOf: Map id → Abteilung. */
export function dialogPicks(catalog, deptOf) {
  const out = { comedy: [], horror: [], kids: [], new: [], random: [], resume: [] };
  const cat = catalog || {};
  const adult = new Set();
  for (const d of cat.departments || []) if (d && d.kind === 'adult') for (const id of d.itemIds || []) adult.add(id);
  const items = cat.items;
  const byId = (id) => (items && typeof items.get === 'function' ? items.get(id) : null);
  const ok = (it) => {
    if (!it || !it.Id || adult.has(it.Id)) return false;
    const d = deptOf && typeof deptOf.get === 'function' ? deptOf.get(it.Id) : null;
    return !(d && d.kind === 'adult');
  };
  const add = (list, it) => { if (ok(it) && !list.some((x) => x.Id === it.Id)) list.push(it); };
  if (items && typeof items.values === 'function') {
    for (const it of items.values()) {
      const genres = ((it && it.Genres) || []).join(' ');
      if (COMEDY.test(genres)) add(out.comedy, it);
      if (HORROR.test(genres)) add(out.horror, it);
    }
  }
  for (const d of cat.departments || []) {
    if (!d || (d.kind !== 'kids' && d.kind !== 'new')) continue;
    for (const id of d.itemIds || []) add(d.kind === 'kids' ? out.kids : out.new, byId(id));
  }
  for (const it of cat.highlights || []) add(out.random, it);
  const r = cat.resume && cat.resume[0];
  if (r) add(out.resume, r);
  return out;
}

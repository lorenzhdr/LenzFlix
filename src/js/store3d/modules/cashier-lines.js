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
  snow: [
    'Es schneit, {name}. Mütze auf, Film an.',
    'Schnee draußen, Kassette drinnen. So muss das.',
    'Pass auf, {name}, draußen ist es glatt. Such dir drinnen was Warmes zum Schauen aus.',
    'Weiße Straße, warmer Laden. Ich finde, das passt.',
  ],
  cold: [
    'Brr, {name}, ist das kalt da draußen. Hier drin läuft zum Glück die Heizung.',
    'Du bist ja ganz durchgefroren. Komm rein, such dir einen Film aus.',
    'Bei der Kälte kommt kein Mensch freiwillig vor die Tür. Außer dir, {name}.',
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
  // --- Welle 2: Richard wehrt sich (Schlagabtausch), Hausverbot, Ausleihen, Diebstahlsicherung ---
  hit1: [
    'Hoppla! Das war jetzt aber keine Begrüßung, {name}.',
    'Autsch. Wir sagen hier eigentlich Hallo mit Worten.',
    'Hey! Das war mein Lieblingsohr.',
    'Moment mal, {name}. Ich bin Kassierer, kein Sandsack.',
    'Na, so war das aber nicht gemeint, oder? Ich nehme das als Versehen.',
    'Huch! Ich tue einfach so, als hätte ich nichts gespürt.',
    'Vorsicht, {name}. Meine Kassenbrille ist neu.',
  ],
  hit2: [
    'Jetzt reicht es aber, {name}! Gleich gibt es Ärger.',
    'Ein Mal ist ein Versehen, zwei Mal ist ein Hobby. Lass das.',
    'Pass auf! Ich habe einen Tresen und ich weiß, wie man ihn benutzt.',
    'Ich zähle bis drei, {name}. Eins war schon.',
    'Mein Geduldsfaden ist ein sehr dünner Faden.',
    'Hör auf damit, sonst gibt es einen Schubs mit Ansage!',
  ],
  shove: [
    'Und jetzt schön Abstand halten!',
    'Das war die freundliche Variante, {name}.',
    'Zack! Kassenschubser, Modell Standard.',
    'Wer boxt, der fliegt. So steht es in der Hausordnung.',
    'Und bitte nicht wiederkommen. Also doch, aber ohne Fäuste.',
  ],
  hit3: [
    'Das war einmal zu viel, {name}! Jetzt bekommst du Kassetten zu spüren!',
    'Jetzt reicht es endgültig! Volle Ladung Videotheksbestand!',
    'Du wolltest es so! Achtung, Rückspulgeschoss!',
    'Der Kassierer schlägt zurück, und zwar mit Filmkultur!',
  ],
  // 1.18.0: Spieler wird K.O. geschlagen und vor die Tür gesetzt, Richard wird geblendet oder mit Gürtel/Peitsche getroffen
  playerKO: [
    'Na, aufgewacht, {name}? Ich habe dich vorsichtshalber vor die Tür gestellt.',
    'Frische Luft hilft bei Kopfweh. Ruh dich auf der Bank aus.',
    'Du hast dich übernommen, {name}. Die Bank draußen ist kostenlos.',
    'Ich habe dir einen Sitzplatz besorgt. Draußen. Mit Aussicht.',
    'Das war ein Nickerchen auf Kosten des Hauses.',
    'Sternchen gesehen? Die gibt es bei uns nur bei Bewertungen.',
    'Rausgetragen habe ich dich nicht gern, aber ich hatte Übung.',
    'Eine kleine Pause hat noch keinem geschadet, {name}.',
    'Zehn Sekunden Ruhe, dann gehen wir wieder freundlich miteinander um.',
    'Ich sage nur: Fäuste sind kein Ausleihmodell.',
    'Siehst du, so endet das, wenn man sich mit der Kundschaft anlegt. Oder mit dem Gehweg.',
    'Tief durchatmen, {name}. Der Film läuft ohne dich weiter.',
  ],
  laserHit: [
    'Hey! Mein Auge! Das ist kein Zeigestock!',
    'Ich sehe Punkte. Rote. Das ist keine Werbung.',
    'Wer blendet hier den Kassierer? Das Licht gehört in den Saal!',
    'Aua, ich sehe nichts mehr! Ist das der neue Filmprojektor?',
    'Mach das aus, {name}! Ich habe nur zwei Augen und beide brauche ich.',
    'Ein Laserpointer im Laden. So weit ist es schon gekommen.',
    'Das ist wirklich grell. Ich schreibe es in die Hausordnung.',
    'Mein Blick ist gerade im Urlaub. Danke dafür.',
  ],
  whipHit: [
    'Autsch! Wir sind hier nicht im Zirkus, {name}!',
    'Die Peitsche gehört in den Abenteuerfilm, nicht an meinen Tresen.',
    'Das hat geknallt! Und zwar nicht das Popcorn.',
    'Aua, das hat gebrannt! Ich verlange Schmerzensgeld in Kassetten.',
    'Hey, mit solchem Werkzeug schlägt man keine Kassierer!',
    'Zack, und weg ist die Laune. Das war ein Fehler, {name}.',
    'Das wird dir noch leidtun. Mindestens ein bisschen.',
    'Hast du dir das aus einem Film abgeguckt? Dort ist es auch verboten.',
  ],
  beltHit: [
    'Mit dem Gürtel? Der gehört an die Hose, {name}!',
    'Autsch! Das war ein Treffer unter dem Gürtel. Also mit dem Gürtel.',
    'Mein Rücken! Das war kein Leihgegenstand!',
    'Hey, wer schlägt hier mit Kleidung zu?',
    'Das tut weh, {name}. Und die Hose rutscht dir gleich.',
    'Gürtel sind zum Halten da, nicht zum Hauen.',
    'Das gibt eine Mahnung. Mit Stempel.',
    'Aua! So schnell habe ich meinen Tresen noch nie vermisst.',
  ],
  throwLine: [
    'Hier, ein Klassiker!',
    'Fang! Beziehungsweise nicht.',
    'Die waren eh schon durchgesehen!',
    'Bitte zurückspulen!',
    'Flieg, kleine Kassette!',
    'Das ist ein Wurf, kein Verleih!',
  ],
  throwHit: [
    'Treffer! Und das ohne Leihgebühr.',
    'Volltreffer, {name}. Die Kassette war unschuldig.',
    'Na bitte. Kopfkino in Echtzeit.',
    'Das nennt man Direktvertrieb.',
  ],
  hitObject: [
    'Wer wirft hier mit Sachen? Ich bin kein Zielscheibenverleih!',
    'Autsch! Das Ding hatte nicht mal einen Strichcode.',
    'Hey, {name}! Mit Sachen wirft man nicht, die muss man zurückbringen.',
    'Das gibt Ärger. Und eine Mahngebühr.',
  ],
  chase: [
    'Komm sofort her, {name}!',
    'Hiergeblieben! Wir müssen über Umgangsformen reden!',
    'Du kannst rennen, aber ich habe den Hausschlüssel!',
    'Raus hier, {name}! Aber bitte durch die Tür, nicht durch das Regal!',
    'Ich bin schneller, als ich aussehe!',
    'Der Tresen war nur das Aufwärmprogramm!',
    'Keine Sorge, ich will nur reden. Mit Nachdruck.',
    'Tür ist da hinten, {name}! Ich zeige sie dir auch gern persönlich.',
  ],
  expel: [
    'So, Abflug! Ich habe da einen Kollegen, der heißt Schwung.',
    'Kurzer Nachhilfeunterricht in Türenkunde, {name}: Raus ist da draußen.',
    'Ich trage dich nicht gern, aber ich trage dich auch nicht lange.',
    'Zack und raus! Das war jetzt wirklich nicht persönlich.',
  ],
  ban: [
    'Hausverbot! Dreißig Sekunden, und zwar ohne Verhandlung.',
    'Raus! Und denk in Ruhe über dein Verhalten nach.',
    'Das war es für heute, {name}. Die Tür ist jetzt zu.',
    'Hausverbot! Die Kassette bleibt im Regal und du draußen.',
    'So. Jetzt gibt es eine Pause für alle. Besonders für dich.',
  ],
  banGlass: [
    'Ich sehe dich, {name}. Durch die Scheibe geht das ganz gut.',
    'Nein, auch Winken hilft nicht.',
    'Hausverbot ist Hausverbot. Genieß die frische Luft.',
    'Ich kann das den ganzen Tag. Du ja nur noch ein paar Sekunden.',
    'Klopf ruhig. Die Scheibe hält das aus.',
    'Schau mal auf die Uhr, {name}. Gleich ist es vorbei.',
    'Ich habe die Arme verschränkt. Das ist mein ernstester Gesichtsausdruck.',
    'Draußen gibt es auch schöne Dinge. Zum Beispiel einen Kiosk.',
  ],
  banEnd: [
    'Na gut, die Tür ist wieder auf. Aber ich beobachte dich.',
    'Zeit abgelaufen. Benimm dich, dann bleiben wir Freunde.',
  ],
  backHome: [
    'So, zurück an die Arbeit. Wo war ich?',
    'Zurück hinterm Tresen. Hier fühle ich mich sicher.',
    'Alles wieder sauber. Fast.',
  ],
  grudgeGreet: [
    'Ach, du wieder. Mit sauberen Händen, hoffe ich.',
    'Ich habe nichts vergessen, {name}. Aber ich bin ja professionell.',
    'Willkommen zurück. Fäuste bitte an der Garderobe abgeben.',
    'Na, wieder friedlich? Ich notiere mir das im Kassenbuch.',
    'Du darfst rein. Aber ich schaue dir auf die Finger.',
  ],
  grudgeIdle: [
    'Ich habe dich übrigens nicht vergessen.',
    'Alles gut hier? Ich frage nur, weil ich dich im Blick behalte.',
    'Mein Auge zuckt noch ein bisschen. Nur so nebenbei.',
    'Wenn du etwas brauchst, frag. Wenn du schlägst, frage ich nicht mehr.',
    'Kassetten werden hier mit Respekt behandelt. Und Kassierer auch.',
    'Ich bin nicht nachtragend. Ich schreibe nur alles auf.',
  ],
  rentOk: [
    'Piep! Ausgeliehen. Bitte bis Sonntag zurückspulen.',
    'Eingescannt, {name}. Viel Spaß mit {title}!',
    'Das macht null Euro, weil ich heute großzügig bin.',
    'Piep! Hülle erfasst. Du darfst durch die Tür, ohne dass es klingelt.',
    'Ausleihe bestätigt. Und nicht vergessen, nett zur Kassette zu sein.',
    'Gute Wahl. {title} ist jetzt offiziell dein Film.',
  ],
  cardAsk: [
    'Ausweis, bitte.',
  ],
  // 1.17.0: Richard bemerkt ein neues Outfit bzw. eine neue Frisur (trocken, frech, nie über Körper oder Hautfarbe)
  outfitNew: [
    'Ach, neues Outfit, {name}? Mutig. Ich meine das als Kompliment. Fast.',
    'Du bist heute in einer anderen Verkleidung unterwegs. Steht dir.',
    'Neue Sachen, {name}? Dann bitte nicht an den Regalen reiben.',
    'Hat da jemand eingekauft? Ich habe nur Kassetten im Angebot.',
    'Sieht aus, als hättest du dich im Schrank vertan. Positiv gemeint.',
    'Chic, {name}. Schade, dass die Kasse keine Fotos macht.',
    'Wow, so viel Aufwand für eine Kassette. Ich bin gerührt.',
    'Das Outfit ist neu, oder? Ich merke mir sowas. Berufskrankheit.',
    'Du hast dich umgezogen. Ich habe nichts gesagt. Ich habe nur geschaut.',
    'Stilwechsel, {name}? Ich bleibe bei meiner Weste. Seit 1989.',
    'Na, wer hat denn hier die Garderobe gewechselt?',
    'Das ist ein Auftritt. Hoffentlich passt der Film dazu.',
  ],
  hairNew: [
    'Neue Frisur, {name}? Ich tue so, als wäre ich nicht beeindruckt.',
    'Beim Friseur gewesen? Ich hoffe, der Laden hat Treuepunkte.',
    'Da hat sich oben etwas getan, {name}. Gefällt mir. Sag es nicht weiter.',
    'Frisch frisiert! Ich habe es gleich gesehen. Ich sehe alles. Außer Diebe.',
    'Ein neuer Look obenrum. Mutig, {name}, aber es klappt.',
    'Die Haare sind anders. Ich schreibe das mal in mein Heft.',
    'Schöne Frisur. Meine Weste ist neidisch.',
    'Na so was, {name}. Heute mit Schwung auf dem Kopf.',
    'Jemand war beim Friseur. Ich frage nicht nach dem Preis.',
    'Das nenne ich einen Auftritt. Fehlt nur noch das Popcorn.',
  ],
  rentAlready: [
    'Die hast du schon, {name}. Die klebt quasi an dir.',
    'Die ist schon auf dich eingetragen. Doppelt hält nicht besser.',
    'Schon erledigt. Du musst nur noch zur Tür gehen.',
  ],
  theftShout: [
    'Hey, {name}! Die Kassette ist noch nicht ausgeliehen!',
    'Alarm! Du hast da etwas in der Hand, das nicht dir gehört. Noch nicht.',
    'Halt! Erst an der Kasse scannen, dann nach draußen.',
    'Das war der Diebstahlsicherungs-Pfosten, nicht die Türglocke!',
    'Kassette ohne Kasse? Komm kurz zurück, ich scanne gern.',
    'Piep! Piep! Das bin nicht ich, das ist die Tür.',
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

// --- Dialogmodell „Mit Richard reden“ (rein; DOM und VR-Panel nutzen dasselbe) ---
const ANSWERS = [
  { key: 'comedy', label: 'Was Lustiges?', cat: 'tipComedy' },
  { key: 'horror', label: 'Was Gruseliges?', cat: 'tipHorror' },
  { key: 'kids', label: 'Was für Kinder?', cat: 'tipKids' },
  { key: 'new', label: 'Was ist neu?', cat: 'tipNew' },
  { key: 'random', label: 'Überrasch mich!', cat: 'tipRandom' },
  { key: 'resume', label: 'Weiterschauen?', cat: 'tipResume' },
];

/** Einstieg: Antwortknöpfe nur für Kategorien mit Kandidaten (picks aus dialogPicks, nie Ab-18). line(cat, vars) → Text. */
export function dialogStart(picks, line) {
  const avail = ANSWERS.filter((a) => picks[a.key] && picks[a.key].length);
  if (!avail.length) return { text: line('noTip'), choices: false, buttons: [{ id: 'bye', label: 'Tschüss', primary: true }] };
  return {
    text: line('dialogHello'),
    choices: true,
    buttons: [...avail.map((a) => ({ id: `a:${a.key}`, label: a.label })), { id: 'bye', label: 'Tschüss' }],
  };
}

/** Antwort auf eine Kategorie: wählt einen Titel (nicht zweimal derselbe in Folge) und liefert Text + Folgeknöpfe. */
export function dialogAnswer(picks, key, { rand = Math.random, lastId = null, line, deptOf } = {}) {
  const a = ANSWERS.find((x) => x.key === key);
  const list = picks && picks[key];
  if (!a || !list || !list.length) return null;
  let pool = list.filter((i) => i.Id !== lastId);
  if (!pool.length) pool = list;
  const item = pool[Math.floor(rand() * pool.length)];
  const dept = deptOf && typeof deptOf.get === 'function' ? deptOf.get(item.Id) : null;
  return {
    item,
    text: line(a.cat, { title: item.Name, dept: dept && dept.label }),
    buttons: [
      { id: 'show', label: 'Zeig mal', primary: true },
      { id: 'more', label: 'Was anderes' },
      { id: 'bye', label: 'Tschüss' },
    ],
  };
}

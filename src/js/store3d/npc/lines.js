// VIDEOTHEK LENZ · NPC-Sprüche (rein): Deutsche Zeilen für Passanten, Personal, Verkäuferin. Keine fremden Marken, keine Gewalt-Details.
// 1.18.0: Passanten-Kategorien (Reaktionen, Alltag, Ereignisse, Provokation je Temperament, Treffer) und Rowdys (rowdy*): derber, schwarzer
// Humor und Schimpfwörter, aber nie diskriminierend (Herkunft, Hautfarbe, Religion, Geschlecht, Sexualität, Behinderung), keine sexuelle Gewalt, keine echten Personen.
// pickLine(cat, rand, last?) → { text, index }; Kategorien in LINES.

export const LINES = {
  // Schlag auf einen Passanten
  bumped: [
    'Hey! Ich hab einen Termin mit meinem Sofa!', 'Autsch! Das war mein Lieblings-Ellbogen!', 'Na hör mal! Ich wollte nur Brötchen holen!',
    'Wie unhöflich! Ich bin hier nur zu Besuch!', 'Hoppla! Gehört der Gehweg jetzt dir?', 'He! Ich hab dich nicht bestellt!',
    'Mein Kaffee! ... ach nein, der war ja schon leer.', 'Pass doch auf, du Wirbelwind!', 'Das gibt eine Strafarbeit: Zehnmal „Bitte“ sagen!',
    'Ich sag es meiner Oma! Die hat einen Regenschirm!', 'Hui! Eben noch Sonntag, jetzt Montag!', 'Aua-Aua-Aua! Nein, im Ernst, aua.',
  ],
  // Schlag, danach beim Weglaufen
  flee: [
    'Ich bin dann mal weg!', 'Tschüss, du Rabauke!', 'Ich lauf nur zufällig so schnell!', 'Das war nicht mein Tag!', 'Hilfe, ein Kampfkünstler!',
  ],
  // Anrempeln im Lauf
  rammed: [
    'Hoppla, der Herr hat es eilig!', 'Eine Klingel hättest du wohl nicht?', 'Rennen ist auch eine Sportart, aber bitte woanders!',
    'Huch! Zebrastreifen-Weltmeister!', 'Langsam, die Gehwege laufen nicht davon!', 'Flitzer! Ich hab dein Gesicht gesehen!',
  ],
  // Stehen am Schaufenster
  window: [
    'Ob die noch „Der Zauberschuh“ da haben?', 'Schon wieder ausgeliehen, immer das Gleiche.', 'Hübsche Auslage. Die Kassette mit dem Hund will ich.',
    'Eine Videothek! Das ist ja wie früher, nur mit mehr Neon.', 'Man müsste mal wieder einen Filmabend machen ...',
  ],
  poster: [
    'Das Kino hat heute Programm? Na sowas!', 'Was läuft denn im Palast? Hoffentlich mit Popcorn!', 'Plakat-Qualität: Eins plus mit Sternchen.',
    'Zwei Karten, bitte! ... oh, ich bin allein.',
  ],
  // Eilig bei Regen
  rain: ['Brr, nass! Wer hat das bestellt?', 'Regen! Mein Schirm ist stolz auf mich.', 'Wenigstens ist die Straße jetzt sauber.', 'Pfützen-Alarm!'],
  // Plaudern im Vorbeigehen (Spieler < 2 m, ruhig)
  hello: ['Na?', 'Moin!', 'Tolles Wetter für Kino, oder?', 'Hallo, Fremde!', 'Auch auf dem Weg zum nächsten Film?'],
  night: ['Schönen Abend noch!', 'Ganz schön dunkel hier.', 'Nachts sieht alles aus wie ein Film.', 'Die Laternen leuchten so schön ... filmreif.'],
  // Kartenabreißer
  ticket: [
    'Karte bitte! ... Spaß, ist alles frei, nimm Platz!', 'Der Saal ist rechts. Oder links. Ich zeig es nie.', 'Abreißen ist mein Beruf. Meine Hände sind Profis.',
    'Pünktlich sein ist Pflicht, Popcorn ist Kür.',
  ],
  ticketHit: ['Vorsicht, ich bin hier nur das Abriss-Kommando!', 'Autsch! Meine Karten!', 'Nicht den Mitarbeiter, nimm den Sessel!'],
  // Popcornverkäufer
  popcorn: [
    'Frisch gepoppt! Süß, salzig oder beides.', 'Popcorn: Das einzige Gemüse, das knallt.', 'Zu laut? Das ist der Mais, nicht ich.',
    'Ein Eimer? Du siehst nach Eimer aus.',
  ],
  popcornHit: ['Hey! Das ist Kernarbeit!', 'Nicht schütteln, ich popp schon!', 'Meine Maschine kocht gleich über!'],
  // Kiosk-Verkäuferin
  kiosk: [
    'Frisch, knusprig, nur heute besonders knusprig!', 'Na, Hunger? Ich seh es dir an der Nasenspitze an.', 'Zeitung gibt es nicht, aber Zuckerzeug bis zum Abwinken.',
    'Ein Snack in Ehren kann niemand verwehren!',
  ],
  kioskHit: ['Hände weg vom Sortiment!', 'Aua! Ich bin kein Gummibärchen!', 'Wer so zuschlägt, braucht dringend eine Brezel.'],
  // Passanten kommentieren das neue Outfit (1.17.0; eher frech, nie über Körper oder Hautfarbe, keine Beleidigungen; selten, siehe char/react-logic.js)
  outfitNew: [
    'Na, neues Outfit? Mutig. Gefällt mir.', 'Sieht aus, als hätte der Kleiderschrank heute Streik gehabt, aber im guten Sinn!',
    'Dieses Outfit hat Charakter. Und Meinung.', 'Hat dich jemand angezogen oder bist du in die Auslage gefallen?',
    'Respekt! Das trägt sonst keiner. Aus gutem Grund, aber Respekt!', 'Moment, das Outfit kenn ich noch nicht. Läuft das als Neuheit?',
    'Schick, schick! Wie ein Filmplakat zum Anziehen.', 'Da hat jemand Stil bewiesen. Oder Mut. Beides passt!',
    'Das ist ein Auftritt! Fehlt nur der rote Teppich.', 'Gestern noch Alltag, heute Hauptrolle. Steht dir.',
    'Ist das Absicht? Egal, ich nehm es als Kunst.', 'Du siehst aus, als würdest du gleich einen Filmpreis abholen. Oder Brötchen.',
    'Neue Sachen? Die Straße hat es sofort bemerkt.', 'Ich würd das nie anziehen. Deshalb gefällt es mir so.',
    'Deine Garderobe hat heute die Hauptrolle. Der Rest ist Komparserie.', 'Oha, Farbe! Hier gibt es sonst nur Grau und Neon.',
  ],
  hairNew: [
    'Neue Frisur? Der Wind hat schon abgestimmt.', 'Frisch frisiert! Hat der Spiegel genickt?', 'Da hat jemand beim Haar-Termin Mut bewiesen!',
    'Die Frisur hat Persönlichkeit. Ich geb ihr eine Hauptrolle.', 'Wow, die Haare haben heute Premiere!', 'Neuer Schnitt? Sitzt. Oder fliegt. Beides gut!',
    'Das ist keine Frisur, das ist ein Statement.', 'Kompliment an deinen Friseur. Oder an den Zufall.', 'Frisur sitzt! Zumindest solange es nicht regnet.',
    'Neue Haare, neues Glück. Läuft bei dir.', 'Ich wollte auch mal so mutig sein. Dann kam der Föhn.', 'Haare wie aus dem Film. Welcher, verrate ich nicht.',
    'Spiegel, Spiegel, an der Wand ... das war eine gute Entscheidung!', 'Hui, da ist was passiert! Steht dir!',
  ],
  // --- 1.18.0: Passanten (Reaktionen, Alltag, Ereignisse, Provokation je Temperament, Treffer) ---
  emoteDance: [
    'Oh, Tanzstunde! Warte, ich mach mit!', 'Das gefällt mir! Zeig mir den Schritt nochmal!', 'Musik hab ich keine, aber Rhythmus schon!',
    'Na los, die Straße ist die Tanzfläche!', 'Ich hab zwei linke Füße, aber heute ist es egal!', 'Gleich fliegt hier das Parkett! Also der Gehweg.',
    'Tanz, tanz, tanz! Der Asphalt hält das aus!', 'Hui, das steckt an! Ich wackle einfach mit!', 'Das war doch mal ein Auftritt! Ich tanze mit!',
    'Mein Rücken sagt nein, mein Herz sagt ja!', 'Ein Tänzer! Dann bin ich eben die Backgroundtruppe!', 'Los, noch eine Runde! Ich bin gleich warm!',
  ],
  emoteWave: [
    'Hallo! Ich winke zurück!', 'Na, du Winker! Hallo, hallo!', 'Oh, wie nett! Winke, winke!', 'Ich hab es gesehen! Hallo auch!',
    'Moin, Fremder! Der Gruß kommt an!', 'Hey, jemand winkt mir! Das passiert selten!', 'Winken ist die Sprache der Freundlichen!',
    'Ja, ja, ich seh dich! Hallo!', 'Schön, dass du winkst! Ich bin ganz gerührt!', 'Zurückgewunken! Das ist Ehrensache!',
    'Hallo du! Hand hoch, Laune hoch!', 'Na, wen haben wir denn da? Hallo!',
  ],
  emoteBow: [
    'Bravo! Das war eine Verbeugung wie im Theater!', 'Ich applaudiere! Applaus, Applaus!', 'Zugabe, Zugabe!', 'Welch ein Auftritt! Die Menge tobt!',
    'So viel Anstand! Da klatsche ich doch gern!', 'Ein Künstler! Ich gebe Standing Ovations im Stehen!', 'Danke, danke! Ich bin auch ganz gerührt!',
    'Verbeugung angenommen! Ich verbeuge mich zurück!', 'Das war formvollendet! Klatsch, klatsch!', 'Zugegeben, das war stilvoll!',
    'Hut ab! Auch wenn ich keinen Hut trage!', 'Das verdient einen Applaus! Hier ist er!',
  ],
  greetKnown: [
    'Ach, du schon wieder! Schön, dich zu sehen!', 'Na, wen sieht man denn da? Lange nicht gesehen!', 'Hallo, alter Bekannter! Alles gut bei dir?',
    'Mensch, dich kenne ich doch! Wie geht es dir?', 'Hey, du bist es! Ich hab dich schon vermisst!', 'Guten Abend, schön, dass man sich trifft!',
    'Da ist ja unser Stammgast! Schön, dich zu treffen!', 'Na, auch noch unterwegs? Dir geht es gut, oder?', 'Ach, das Gesicht kenne ich! Hallo!',
    'Tag, Nachbar! Wieder auf Streifzug?', 'Schön, dass man sich hier immer wieder trifft!', 'Hallo, hallo! Die Straße ist ein Dorf!',
  ],
  trafficLight: [
    'Rot! Da warte ich lieber, wegen der Vorbilder.', 'Grün! Wenn ich wüsste, dass keiner kommt, würde ich rennen.', 'Die Ampel dauert immer genau eine Ewigkeit.',
    'Ich warte, ich warte, ich warte. Und warte.', 'Brav an der Ampel stehen, das ist Bürgerpflicht!', 'Rot ist rot, auch wenn die Straße leer ist.',
    'Gleich wird es grün, ich spür es im Bein!', 'Fußgängerampel, du Meisterwerk der Geduld.', 'Wer bei Rot geht, hat meistens Eile. Oder keinen Anstand.',
    'Grün, endlich! Wer zuerst kommt, geht zuerst!', 'Noch zwei Sekunden, dann geht es los!', 'So eine Ampel prüft einem den Charakter.',
  ],
  cheerBasket: [
    'Korb! Jawoll, das war ein Treffer!', 'Drin! Der Wurf war Weltklasse!', 'Zwei Punkte! Das nenne ich Treffsicherheit!', 'Der Ball ist drin! Tosender Applaus!',
    'Das war ein Korb wie aus dem Lehrbuch!', 'Super Wurf! Den will ich nochmal sehen!', 'Treffer! Da kann die Profiliga einpacken!',
    'Nur Netz, kein Rand! Spektakulär!', 'Das gibt Punkte und Respekt!', 'Wahnsinn, wie der reingefallen ist!', 'Bravo! Die Straße hat einen neuen Star!',
    'Korb, Korb, Korb! Jetzt wird gefeiert!',
  ],
  cheerCans: [
    'Alle Dosen auf einmal! Das ist Kunst!', 'Volltreffer! Die Dosen haben es nicht kommen sehen!', 'Scheppern kann man das nennen, und zwar laut!',
    'Strike! Das hätte ich nicht besser gekonnt!', 'Die Dosen sind erledigt! Applaus für den Werfer!', 'Das war ein sauberer Wurf! Ich bin beeindruckt!',
    'Dosenwerfen auf Profi-Niveau!', 'Klirr und klapper, alle Dosen runter!', 'Der Jahrmarkt hat sich verirrt, aber ich bin dabei!',
    'Da haben wir einen Meisterschützen!', 'Ein Dosen-Wunder! Zugabe!', 'Alles umgekippt! Hat jemand gezählt?',
  ],
  cheerDiscover: [
    'Oh, was hast du denn da gefunden? Toll!', 'Eine Entdeckung! Gratulation, das freut mich!', 'Na so was! Das hätte ich dir nicht zugetraut!',
    'Gut gemacht! Hier gibt es mehr zu finden, als man denkt!', 'Bravo, Entdecker! Weiter so!', 'Das ist ja ein Fund! Ich bin ganz aus dem Häuschen!',
    'Respekt! Du hast ein Auge für Geheimnisse!', 'Hast du das gesehen? Der hat es geschafft!', 'Jetzt gibt es einen Grund zum Feiern!',
    'Toll! Und wir waren dabei!', 'Ein Entdeckergeist! Das gefällt mir!', 'Glückwunsch! Das war nicht leicht zu finden!',
  ],
  headAlarm: [
    'Oje, schon wieder Alarm! Das gibt Ärger.', 'Da ging was los! Tsss, tsss, tsss.', 'Dass die Leute nie lernen, mit dem Alarm zu leben.',
    'Alarm im Laden! Das hat sich keiner gewünscht.', 'So eine Aufregung, und das am Abend!', 'Kopfschütteln! Das hätte nicht sein müssen.',
    'Naja, wer klaut, der fliegt. Das ist Naturgesetz.', 'Hoffentlich hat Richard die Nerven behalten.', 'So viel Lärm für so wenig Beute.',
    'Ein Alarm weckt wirklich jeden auf.', 'Das war bestimmt ein Missverständnis. Hoffentlich.', 'Immer diese Unruhe. Früher war es ruhiger.',
  ],
  headBan: [
    'Hausverbot! Das ist hart, aber gerecht.', 'Na, das hat er sich wohl verdient.', 'Hausverbot, das hört man selten. Autsch.',
    'Da hat Richard wohl die Geduld verloren.', 'Tja, wer nicht hören will, muss draußen bleiben.', 'Das war es dann wohl mit dem Laden.',
    'Das hätte nicht sein müssen. Aber Regeln sind Regeln.', 'Ein Hausverbot! Das macht keinen Spaß.', 'Kopf hoch, es gibt andere Läden. Naja, fast.',
    'Jetzt aber schnell weg, bevor es noch schlimmer wird!', 'Ach du meine Güte, das ist ein harter Abend.', 'Ich sag nichts. Ich schüttel nur den Kopf.',
  ],
  // Provokation je Temperament: shy flieht, normal schimpft (ohne Beleidigung), hot droht
  provokeShy: [
    'Bitte nicht! Ich will keinen Ärger!', 'Hilfe! Lass mich in Ruhe!', 'Nein, nein, ich geh ja schon!', 'Ich hab nichts getan! Wirklich nicht!',
    'Nicht schlagen! Ich bin ganz friedlich!', 'Au weia, bloß weg hier!', 'Ich will nur nach Hause!', 'Bitte, ich hab doch nichts gesagt!',
    'Hilfe, Hilfe! Der ist verrückt!', 'Ich bin schon weg, ich bin schon weg!', 'Ach du Schreck, lauf, lauf!', 'Ich tu keiner Fliege was! Bitte!',
  ],
  provokeNormal: [
    'Na hör mal, was fällt dir ein?', 'So geht man nicht miteinander um!', 'Du hast wohl den Knigge verloren!', 'Ich verlange eine Entschuldigung, und zwar sofort!',
    'Unglaublich, wie unverschämt du bist!', 'Benimm dich, hier gibt es Zeugen!', 'Das lass ich mir nicht bieten!', 'So ein ungezogenes Verhalten, ehrlich!',
    'Das schreibe ich mir auf, mein Lieber!', 'Ich gebe dir gleich eine Lektion in Anstand!', 'Frechheit! Mit mir nicht!', 'Du solltest dich was schämen!',
  ],
  provokeHot: [
    'Willst du Ärger? Den kannst du haben!', 'Das war ein Fehler, mein Freund!', 'Gleich knallt es, pass auf!', 'Komm her, wenn du dich traust!',
    'Jetzt reicht es! Ich zeig dir, was ich kann!', 'Du hast mich an der falschen Stelle erwischt!', 'Ich werd dir Manieren beibringen!',
    'Noch ein Wort und du kriegst es zu spüren!', 'Na warte, das gibt Rache!', 'Ich bin nicht aus Zucker, das wirst du merken!',
    'Schlag mich und du bist dran!', 'Das hast du nicht umsonst gemacht!',
  ],
  attackHot: [
    'Jetzt gibt es was auf die Mütze!', 'Nimm das, du Frechdachs!', 'Ich hab gewarnt!', 'Bämm, so geht das!', 'Da hast du es!', 'Los, Fäuste hoch!',
    'Das war nur der Anfang!', 'Jetzt wirst du zittern!', 'Gleich ist Schluss mit lustig!', 'Auf in den Kampf!', 'Das hast du dir selbst eingebrockt!',
    'Aus dem Weg, jetzt komme ich!',
  ],
  struck: [
    'Autsch! Das hat gesessen!', 'Au, mein Kopf!', 'Ouh, das tut weh!', 'Hey, das reicht jetzt!', 'Aua, ich spür meine Zähne!', 'Uff, das war hart!',
    'Mein Rücken, mein Rücken!', 'Ach, das hat gebrannt!', 'Das war ein Treffer, ich geb es zu!', 'Ich seh Sternchen!', 'Ohh, die Knie werden weich!',
    'Das geht auf deine Rechnung!',
  ],
  blinded: [
    'Mein Auge! Ich seh nichts mehr!', 'Was war das? Ich bin geblendet!', 'Hilfe, alles ist weiß!', 'Aua, das Licht! Mach das aus!',
    'Ich seh nur noch Punkte!', 'Wer hat das Licht angemacht? Meine Augen!', 'Ich bin blind wie ein Maulwurf!', 'Au, die Augen! Das war grell!',
    'Alles tanzt, alles flimmert!', 'Das Licht brennt! Hör auf damit!', 'Ich tapse nur noch herum!', 'Mein Gott, wie hell war das denn?',
  ],
  koSeen: [
    'Oh nein, der liegt da! Ist da jemand Arzt?', 'Das sieht übel aus! Alles in Ordnung?', 'Der Arme hat es erwischt!', 'Das war ein K.O.! Ob der wieder aufsteht?',
    'Da liegt einer und rührt sich nicht!', 'Jemand sollte nach dem Rechten sehen!', 'Au weia, das war ein Schlag!', 'Der ist hinüber! Hoffentlich nicht lange!',
    'Das war ein Niederschlag, wie im Film!', 'Ach du liebe Güte, der ist umgefallen!', 'So ein Ende hat keiner gewollt!', 'Ruft doch jemand einen Sani, aber schnell!',
  ],
  // --- Rowdys: derber, schwarzer Humor, Schimpfwörter; nie diskriminierend, nie sexuelle Gewalt, keine echten Personen ---
  rowdyAccost: [
    'Na, wen haben wir denn da? Verlaufen, du Vollidiot?', 'Hey, du! Ja, du, du Arschloch! Komm mal her!', 'Schau an, frisches Fleisch in meiner Gasse!',
    'Du siehst aus wie jemand, der gleich Ärger kriegt.', 'Hast du dich verirrt, oder bist du nur blöd?', 'Na, Kleiner? Wolltest du heute noch heil nach Hause?',
    'Du stehst auf meinem Gehweg, du Dreckskerl!', 'Hast du Feuer? Nein? Schade, dann brauchst du Verbandszeug!', 'Nettes Gesicht. Wäre schade drum.',
    'He, Pisser! Taschen leeren, oder ist das hier ein Spaziergang?', 'Du riechst nach Streber. Streber mag ich nicht.',
    'Willkommen in der Gasse! Hier zahlt man Eintritt in Zähnen.', 'Na, kein Anschluss unter dieser Hose, oder was?',
    'Lauf nicht weg, ich will nur dein Gesicht kennenlernen. Mit der Faust.',
  ],
  rowdyThreat: [
    'Noch ein Schritt und du siehst deinen Zahnarzt öfter als deine Familie!', 'Ich zähle bis drei, dann tut es weh. Eins!', 'Mach dein Testament, du Wichser!',
    'Gleich liegst du so flach, dass man dich als Fußmatte verkauft!', 'Dich zerlege ich in Einzelteile, und zwar alphabetisch!',
    'Hau ab oder ich helf nach, du Arschgeige!', 'Dein Gesicht gefällt mir nicht. Gleich hat es eine neue Form!', 'Du hast Mut oder keinen Verstand. Ich tippe auf Zweiteres!',
    'Die Hölle hat dir schon ein Zimmer reserviert, du Vollidiot!', 'Ich brech dir was, und du darfst dir aussuchen, was!',
    'Mein Messer ist zu Hause, aber meine Fäuste kommen mit!', 'Letzte Warnung, Arschloch. Ich bin kein Freund von Warnungen!',
    'Du bist ein toter Mann! Also fast. Mit blauen Flecken!', 'Gleich wirst du dich fühlen wie ein Kuchen unter einer Walze!',
  ],
  rowdyAttack: [
    'Jetzt gibt es auf die Fresse!', 'Gleich knallt es, du Wichser!', 'Ich polier dir die Visage!', 'Komm her, Arschloch!', 'Los, Jungs, macht ihn fertig!',
    'Du wolltest es so, du Vollidiot!', 'Nimm das, du Dreckskerl!', 'Zahn um Zahn, mein Freund!', 'Gleich bist du Matsch!', 'Zeit für einen Ausflug ins Krankenhaus!',
    'Heute gibt es keine Gnade!', 'Jetzt kriegst du, was du verdienst, du Pisser!', 'Schlaf schön, du Arschgeige!', 'Das ist für meine schlechte Laune!',
  ],
  rowdyHit: [
    'Du Arschloch, das zahlst du mir heim!', 'Au, du Wichser! Das war ein Fehler!', 'Das hat gesessen, aber ich hab schon Schlimmeres überlebt!',
    'Ich blute, na und? Dich erwischt es gleich noch härter!', 'Autsch, verdammt! Jetzt bin ich richtig sauer!', 'Aua! Das gibt es doch nicht!',
    'Der hat Fäuste! Das hätte ich nicht gedacht!', 'Mein Kiefer! Du Dreckskerl!', 'Verdammt, das ist kein Spaß mehr!', 'Ha, das kitzelt nur! Nochmal!',
    'Das merk ich mir, du Vollidiot!', 'Scheiße, das hat wehgetan!', 'Na warte, du Arschgeige!', 'Ich hab Blut geleckt, und es ist meins!',
  ],
  rowdyFlee: [
    'Scheiße, der ist stärker als gedacht! Weg hier!', 'Ich bin raus, das war es nicht wert!', 'Verdammt, nichts wie weg!',
    'Das ist nicht vorbei, du Arschloch! Aber jetzt muss ich gehen!', 'Ich hab noch einen Termin. Bei der Flucht!', 'Rückzug, Jungs! Der ist ein Irrer!',
    'Ich hau ab, aber ich komme wieder, du Wichser!', 'Lauf, lauf, lauf!', 'Das war mir zu heiß, ich bin weg!', 'Ich muss dringend weit weg von hier!',
    'Mein Anwalt kommt gleich. Also ich laufe zu ihm!', 'Leb wohl, du Vollidiot! Ich lebe auch lieber!', 'Der hat mich fertiggemacht, ich geb auf!',
    'Soll er die Gasse haben! Mir egal!',
  ],
  rowdyWin: [
    'Haha, das war wohl nichts, du Loser!', 'Wer liegt jetzt am Boden, du Arschloch?', 'Ruh dich aus, du Wichser, dein Gesicht hat es nötig!',
    'Das hast du davon, Vollidiot!', 'Und der Gewinner steht, der Verlierer liegt!', 'Das war fast schon zu leicht!', 'Schlaf gut, du Dreckskerl, und träum von mir!',
    'Ich hab dir gesagt, du kommst nicht an mir vorbei!', 'Ha, und das ohne ins Schwitzen zu kommen!', 'Nächstes Mal bringst du einen Helm mit, du Pisser!',
    'Du bist die beste Fußmatte, die ich je hatte!', 'Jetzt hast du Platz für die Zahnfee!', 'Der Nächste, bitte! Oder auch nicht!', 'Das war ein Spaß! Danke, du Arschgeige!',
  ],
  kioskBuy: ['Macht dann nix, geht aufs Haus – du siehst hungrig aus.', 'Zack, bitte sehr! Wohl bekomms!', 'Guter Griff! Den nehmen alle.'],
};

/** Zufällige Zeile aus Kategorie; vermeidet `last` (Index der vorigen Zeile). */
export function pickLine(cat, rand = Math.random, last = -1) {
  const l = LINES[cat];
  if (!l || !l.length) return null;
  let i = Math.min(l.length - 1, Math.floor(rand() * l.length));
  if (l.length > 1 && i === last) i = (i + 1) % l.length;
  return { text: l[i], index: i };
}

// VIDEOTHEK LENZ · NPC-Sprüche (rein): Deutsche Zeilen für Passanten, Personal, Verkäuferin. Keine fremden Marken, keine Gewalt-Details.
// pickLine(cat, rand, last?) → { text, index }; Kategorien in LINES.

const LINES = {
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
  hello: ['Na?', 'Schönen Abend noch!', 'Moin!', 'Tolles Wetter für Kino, oder?', 'Hallo, Fremde!', 'Auch auf dem Weg zum nächsten Film?'],
  night: ['Ganz schön dunkel hier.', 'Nachts sieht alles aus wie ein Film.', 'Die Laternen leuchten so schön ... filmreif.'],
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

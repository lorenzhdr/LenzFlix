// VIDEOTHEK LENZ · Friseursalon „FRISEUR HAARSCHARF“ (1.17.0): Sprüche und feste Looks von Gabi (Haare) und Ronny (Mode). Rein, ohne three/DOM.
// Regeln: eher frech, nie über Körper oder Hautfarbe, keine Beleidigungen, keine fremden Marken. Zufall nur über die übergebene Funktion.
import { defaultCode, F } from './look2.js';
import {
  HAIR_STYLES, EYES, BROWS, BEARDS, SHAPES, TOP_CUTS, TOP_PATTERNS, BOTTOM_CUTS, SHOE_MODELS, GLASSES, HATS, BAGS,
} from './ids.js';

const idx = (list, id) => Math.max(0, list.indexOf(id));

/** Feste v2-Look-Codes (Länge 26) der beiden Angestellten. Gabi: Dauerwelle in Kupferrot; Ronny: Vokuhila und Lederjacke. */
export function npcCodes() {
  const gabi = defaultCode();
  gabi[F.skin] = 2;
  gabi[F.height] = 9;
  gabi[F.build] = 9;
  gabi[F.shape] = idx(SHAPES, 'hips');
  gabi[F.hairStyle] = idx(HAIR_STYLES, 'curls');
  gabi[F.hairColor] = 7; // Kupferrot
  gabi[F.eyes] = idx(EYES, 'wide');
  gabi[F.brows] = idx(BROWS, 'arched');
  gabi[F.beard] = idx(BEARDS, 'none');
  gabi[F.topCut] = idx(TOP_CUTS, 'dress');
  gabi[F.topColor] = 8; // Rosa
  gabi[F.topPattern] = idx(TOP_PATTERNS, 'plain');
  gabi[F.topColor2] = 6;
  gabi[F.botCut] = idx(BOTTOM_CUTS, 'jeans');
  gabi[F.botColor] = 7;
  gabi[F.shoeModel] = idx(SHOE_MODELS, 'high');
  gabi[F.shoeColor] = 2;
  gabi[F.sole] = 0;
  gabi[F.glasses] = idx(GLASSES, 'round');
  gabi[F.hat] = idx(HATS, 'none');
  gabi[F.bag] = idx(BAGS, 'none');

  const ronny = defaultCode();
  ronny[F.skin] = 5;
  ronny[F.height] = 12;
  ronny[F.build] = 11;
  ronny[F.shape] = idx(SHAPES, 'shoulders');
  ronny[F.hairStyle] = idx(HAIR_STYLES, 'mullet');
  ronny[F.hairColor] = 2; // Braun
  ronny[F.eyes] = idx(EYES, 'sleepy');
  ronny[F.brows] = idx(BROWS, 'thick');
  ronny[F.beard] = idx(BEARDS, 'moustache');
  ronny[F.topCut] = idx(TOP_CUTS, 'jacket');
  ronny[F.topColor] = 10; // Schwarz
  ronny[F.topPattern] = idx(TOP_PATTERNS, 'plain');
  ronny[F.topColor2] = 11;
  ronny[F.botCut] = idx(BOTTOM_CUTS, 'jeans');
  ronny[F.botColor] = 13;
  ronny[F.botPattern] = 0;
  ronny[F.shoeModel] = idx(SHOE_MODELS, 'boot');
  ronny[F.shoeColor] = 0;
  ronny[F.sole] = 5;
  ronny[F.glasses] = idx(GLASSES, 'sun');
  ronny[F.hat] = idx(HATS, 'none');
  ronny[F.bag] = idx(BAGS, 'none');
  return { gabi, ronny };
}

/** Stimme je Person (Seed, Tonlage, Tempo) für `cashier.speaker`. */
export const VOICES = {
  gabi: { voiceSeed: 'gabi-haarscharf', pitch: 1.25, rate: 1.05, prio: 50 },
  ronny: { voiceSeed: 'ronny-haarscharf', pitch: 0.85, rate: 0.98, prio: 50 },
};

export const LINES = {
  gabi: {
    greet: [
      'Na, Kundschaft! Setz dich, ich bin gleich so weit – haarscharf!',
      'Willkommen bei Haarscharf! Wir machen aus Frisuren Ereignisse.',
      'Ah, Besuch! Kaffee gibt es keinen, dafür ehrliche Meinungen.',
      'Schön, dass du da bist. Heute schon etwas vor? Ich hätte da eine Idee.',
      'Hereinspaziert! Hier wird nicht gefönt, hier wird inszeniert.',
      'Moin! Wer zu mir kommt, geht anders raus – meistens besser.',
      'Psst, der Stuhl wartet schon. Er ist nicht nachtragend.',
    ],
    idle: [
      'Dauerwelle ist kein Hobby, das ist eine Lebenseinstellung.',
      'Spliss ist wie schlechte Nachrichten: Je früher weg, desto besser.',
      'Ich schneide nur, was ich auch selbst tragen würde. Meistens.',
      'Haarspray ist eigentlich Mut zum Sprühen.',
      'Der Föhn läuft, die Welt dreht sich. Alles gut.',
      'Früher hatte ich einen Pony. Wir reden nicht darüber.',
      'Wer schön sein will, muss warten. Ich warte mit.',
      'Der Ronny sagt, Vokuhila kommt wieder. Der Ronny sagt viel.',
    ],
    chair: [
      'So, Spiegel an, Mut an. Wir schauen mal, was geht.',
      'Entspannen! Ich verspreche nichts, aber ich gebe mein Bestes.',
      'Locker bleiben, ich beiße nicht. Nur die Schere ein bisschen.',
      'Na, was darf es sein – ein Hauch Veränderung oder gleich der große Auftritt?',
      'Kopf gerade, Blick nach vorn. Ab hier wird es stilvoll.',
      'Hier siehst du dich, wie wir dich sehen. Nur schöner.',
    ],
    chairDone: [
      'Fertig! Haarscharf getroffen, wie immer.',
      'Das ist die Frisur, die du verdienst. Und die, die ich kann.',
      'So, jetzt darfst du wieder unter Leute.',
      'Sitzt, wackelt und hat Luft. Beste Frisur des Tages.',
      'Geschafft! Wenn es nicht gefällt: Ich war es nicht.',
    ],
    hairNew: [
      'Oho, neue Frisur! Das hat Stil – oder zumindest Mut.',
      'Frisch vom Stuhl? Steht dir, das sage ich nicht jedem.',
      'Moment, da war doch was mit den Haaren. Hab ich das gemacht? Sieht gut aus!',
      'Nicht schlecht. Jetzt noch ein Foto, dann ist es amtlich.',
      'Da hat jemand Haare gewagt. Respekt!',
    ],
    outfitNew: [
      'Neues Outfit? Der Ronny wird neidisch.',
      'Schick siehst du aus! Passt zur Frisur. Fast.',
      'Alles neu? Ich habe nichts gesehen, aber es gefällt mir.',
      'Hübsch, hübsch. Kleider machen Leute, Haare machen Auftritte.',
    ],
    leave: [
      'Tschüss, und komm bald wieder – deine Spitzen rufen schon.',
      'Bis bald! Und nicht vergessen: Haarscharf, nicht haarig.',
      'Mach es gut. Die Tür klemmt nicht, sie hat nur Charakter.',
      'Danke fürs Vorbeischauen. Ich bleibe hier, wie immer.',
    ],
    hit: [
      'Hey! Die Schere liegt gleich neben mir, nur zur Info.',
      'Autsch! Dafür gibt es keine Treuepunkte.',
      'Na hör mal, ich arbeite hier!',
      'So wird das nichts mit dem Trinkgeld.',
      'Aua! Ich verlange eine Kurzhaarfrisur auf Kosten des Hauses. Deiner.',
    ],
    // 1.18.0: Föhn als Waffe (frech, keine Beleidigung)
    threat: [
      'Siehst du den Föhn? Der hat Stufe drei und schlechte Laune.',
      'Noch ein Schritt und ich föhne dir die Frisur auf links!',
      'Ich warne dich nur einmal: Heißluft!',
      'Mit mir legt man sich nicht an. Ich habe einen Föhn und keine Skrupel.',
      'Gleich gibt es Dauerwelle im Schnelldurchlauf!',
      'Rück ab, sonst blase ich dir den Marsch!',
      'Ich bin Friseurin. Ich kann Haare und Drohungen.',
      'Zurück! Der Föhn ist geladen.',
    ],
    attack: [
      'Heißluft-Attacke!',
      'Das ist für die Trockenhaube!',
      'Föhn-Schlag, Modell Meisterin!',
      'Nimm das, du Zottelkopf!',
      'Gleich knistert es!',
      'So frisiert man Unruhestifter!',
    ],
    struck: [
      'Aua! Meine Dauerwelle ist ganz platt!',
      'Autsch! Das gibt Spliss im Selbstbewusstsein.',
      'Hey! Ich bin nur die Haarfachkraft!',
      'Das war nicht im Terminkalender!',
      'Mein Haarspray! Ich bin ganz durcheinander!',
      'Na super, jetzt muss ich mich neu frisieren.',
    ],
    blinded: [
      'Mein Auge! Ich sehe nur noch Weiß wie Haarfarbe!',
      'Wer macht das Licht an? Ich bin ganz geblendet!',
      'Hilfe, alles flimmert! Das ist schlimmer als Blondierung!',
      'Ich sehe nichts, aber ich schneide trotzdem!',
      'Aua, das ist heller als der Spiegel!',
      'Mach das aus, ich brauche meine Augen für Spitzen!',
    ],
  },
  ronny: {
    greet: [
      'Na, Chef! Fesch siehst du heute aus. Fast.',
      'Willkommen im Laden für Leute mit Geschmack. Oder solche, die ihn suchen.',
      'Umkleide ist hinten, Spiegel auch. Ehrlich bin ich gratis.',
      'Mode ist, wenn man trotzdem lacht. Komm rein!',
      'Ah, Laufkundschaft! Das sind die besten. Die kaufen aus Versehen.',
      'Moin! Hier gibt es Lederjacken, die älter sind als manche Regeln.',
    ],
    idle: [
      'Vokuhila hat nie aufgehört. Es hat nur kurz Urlaub gemacht.',
      'Schulterpolster sind die Airbags der Mode.',
      'Wer schwarz trägt, hat immer recht. Oder Schwarz.',
      'Sonnenbrille drinnen? Das ist keine Mode, das ist Haltung.',
      'Zu eng gibt es nicht. Nur zu früh gekauft.',
      'Die Gabi macht die Haare, ich mache den Rest. Arbeitsteilung.',
      'Neon war nie weg. Es war nur im Keller.',
      'Hose hoch, Kinn hoch, Stimmung hoch. Läuft.',
    ],
    booth: [
      'Vorhang zu, Show an. Ich warte draußen und tu so, als hörte ich nichts.',
      'Probieren geht über Studieren. Los, kleiner Laufsteg!',
      'Nimm dir Zeit. Die Spiegel hier sind ehrlich, aber freundlich.',
      'Wenn es zwickt, ist es wahrscheinlich Mode.',
      'Umziehen ist eine Kunst. Du bist in guten Händen. Also: in deinen.',
    ],
    boothDone: [
      'Boah, das hat was! Da dreht sich sogar die Gabi um.',
      'Sitzt! Fehlt nur noch ein Foto für die Nachwelt.',
      'Das Outfit ist mutig. Ich mag mutig.',
      'So gehst du durch jede Tür. Auch durch Drehtüren.',
      'Perfekt. Nur die Schuhe ... nein, die sind auch gut.',
    ],
    outfitNew: [
      'Neues Outfit! Hab ich gleich gesehen. Ich sehe sowas.',
      'Na also, geht doch! Das hat Klasse. Und Kragen.',
      'Moment, das kenne ich nicht. Gefällt mir, bleib dabei!',
      'Frisch umgezogen? Du siehst aus wie ein Katalog. Ein guter.',
      'Stylish! Aber die Jacke hätte ich dir verkauft.',
    ],
    hairNew: [
      'Neue Haare? Die Gabi war fleißig. Steht dir.',
      'Frisur nach Maß, Outfit passt dazu. Läuft bei dir.',
      'Mhm, mit der Frisur bräuchtest du glatt noch eine Sonnenbrille.',
      'Respekt, das ist ein Auftritt!',
    ],
    leave: [
      'Mach es gut, Chef. Und bring Freunde mit, wir haben Kleiderbügel.',
      'Tschüss! Wenn dir was fehlt: Du weißt, wo der Ständer steht.',
      'Bis demnächst. Und denk dran: Stil ist keine Frage des Geldes, sondern der Jacke.',
      'Ciao! Ich räume schon mal um.',
    ],
    hit: [
      'Hoppla! Das war nicht im Katalog.',
      'Hey, die Jacke ist Vintage! Vorsicht.',
      'Autsch! Das geht auf Rechnung des Hauses. Deines.',
      'Ey, ich bin Verkäufer, kein Boxsack.',
      'Na toll, jetzt ist die Frisur im Eimer. Naja, war sie vorher auch nicht.',
    ],
    // 1.18.0: Kleiderbügel als Waffe (frech, keine Beleidigung)
    threat: [
      'Siehst du den Bügel? Der ist aus Draht und hat Haltung.',
      'Noch ein Schritt und du hängst gleich im Schrank!',
      'Ich habe einen Kleiderbügel und ich weiß, wie man ihn benutzt.',
      'Zurück, sonst gibt es Nachhilfe in Anstand, Marke Ronny!',
      'Bügel hoch, Stimmung runter. Verschwinde!',
      'Das hier ist ein Laden, kein Ring. Aber ich kann beides.',
      'Ich warne dich, ich habe Schulterpolster und Willen!',
      'Gleich sitzt du auf dem Kleiderständer!',
    ],
    attack: [
      'Bügel-Schlag!',
      'Das ist für den Kragen!',
      'Zack, Kleiderbügel-Spezial!',
      'Aufgehängt wird jetzt!',
      'Mode tut weh, wenn man sie ignoriert!',
      'Nimm das, du Stilmuffel!',
    ],
    struck: [
      'Autsch! Meine Lederjacke, mein Rücken!',
      'Ey, das war Vintage-Haut!',
      'Hey! Ich bin hier das Model!',
      'Aua! So behandelt man keinen Verkäufer.',
      'Das gibt einen blauen Fleck mit Karomuster.',
      'Mein Vokuhila ist zerzaust, du Rüpel!',
    ],
    blinded: [
      'Meine Sonnenbrille! Wo ist meine Sonnenbrille?',
      'Ich sehe nur noch Neon, und zwar im falschen Ton!',
      'Hilfe, alles ist weiß! Das passt zu keiner Saison!',
      'Aua, das ist heller als jeder Schlussverkauf!',
      'Ich taste mich zum Kleiderständer. Gleich bin ich da.',
      'Mach das aus! Ich kann die Etiketten nicht lesen!',
    ],
  },
};

/** Zeile aus Kategorie `cat` der Person `who` wählen. `rand` in [0,1); `lastIndex` (oder −1) vermeidet Wiederholungen. → { text, index } | null */
export function pickSalonLine(who, cat, rand = Math.random, lastIndex = -1) {
  const list = LINES[who] && LINES[who][cat];
  if (!list || !list.length) return null;
  let i = Math.min(list.length - 1, Math.floor(rand() * list.length));
  if (list.length > 1 && i === lastIndex) i = (i + 1) % list.length;
  return { text: list[i], index: i };
}

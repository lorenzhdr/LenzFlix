// VIDEOTHEK LENZ · Entdeckungen: Katalog (rein, ohne three/DOM). IDs sind verbindlich (andere Pakete rufen discover.found(id) auf).
// Jeder Eintrag: id, title, desc (witzig, erst nach dem Fund sichtbar), hint (rätselhaft, ohne Spoiler), by (Paket, nur Doku).

export const CATALOG = [
  { id: 'golden-tape', title: 'Goldene Kassette', desc: 'Auf dem Dach liegt sie, glänzend und völlig unnütz. Genau deshalb will sie jeder.', hint: 'Manche Schätze liegen dort, wo niemand zum Einkaufen hinkommt. Nimm Anlauf.', by: 'F' },
  { id: 'graffiti', title: 'Kunst am Bau', desc: 'Jemand hat „LENZ“ an die Wand gesprüht. Die Kassette daneben hat sogar Augen.', hint: 'Hinter dem Laden hängt Kunst, die keiner bestellt hat. Schau ihr in Ruhe zu.', by: 'F' },
  { id: 'secret-door', title: 'Lose Wandplatte', desc: 'Hinter der Platte wartet ein Fundus, den Richard seit 1989 hütet. Und ein Poster von sich selbst.', hint: 'Neben der Tür für Personal wackelt etwas, das nicht wackeln sollte.', by: 'F' },
  { id: 'roof-rain', title: 'Dachterrasse bei Regenwetter', desc: 'Nachts im Regen auf dem Dach. Nass, einsam, trotzdem irgendwie filmreif.', hint: 'Manche Szenen brauchen schlechtes Wetter und späte Stunde. Und eine hohe Aussicht.', by: 'F' },
  { id: 'roof', title: 'Über den Dächern', desc: 'Die Aussicht ist toll, das Sortiment dünn. Zurück geht es zum Glück auch ohne Flügel.', hint: 'Die Feuertreppe führt weiter hinauf, als man denkt.', by: 'F' },
  { id: 'cat-pet', title: 'Katzenfreund', desc: 'Sie lässt sich streicheln, aber nur zu ihren Bedingungen. Wie bei jedem guten Film.', hint: 'Auf der Straße schleicht jemand mit Samtpfoten. Er mag Aufmerksamkeit, aber nur vorsichtig.', by: 'E' },
  { id: 'kiosk-snack', title: 'Kioskkunde', desc: 'Ein Snack vom Kiosk. Die Verkäuferin schaut, als hätte sie dich schon erwartet.', hint: 'Wer Hunger hat, findet an der Ecke eine kleine Hütte.', by: 'E' },
  { id: 'hoop-3', title: 'Dreier aus der Kreisliga', desc: 'Drei Körbe hintereinander. Die Gegner hießen Pfosten, Wind und Selbstzweifel.', hint: 'Ein Korb, ein Ball und erstaunlich viel Ehrgeiz. Dreimal hintereinander wäre schön.', by: 'D' },
  { id: 'can-pyramid', title: 'Dosen-Pyramide', desc: 'Die Pyramide steht. Hoffentlich schaut der Ladeninhaber nicht aus dem Fenster.', hint: 'Mit ein bisschen Geduld lässt sich aus Dosen ein Bauwerk stapeln.', by: 'D' },
  { id: 'richard-ban', title: 'Hausverbot', desc: 'Richard hat dich rausgeworfen. Nimm es nicht persönlich, er mag niemanden. Dich eben besonders.', hint: 'Man kann es sich mit dem Mann an der Kasse verderben. Ernsthaft.', by: 'C' },
  { id: 'richard-rent', title: 'Ordentlich ausgeliehen', desc: 'Ein Film zum Mitnehmen, mit Quittung und Richards stillem Misstrauen.', hint: 'Manche Dinge verlassen den Laden mit Erlaubnis. Das ist neu.', by: 'C' },
  { id: 'palast-film', title: 'Kinogänger', desc: 'Du hast im LENZ PALAST einen Film gesehen. Popcorn hast du bestimmt trotzdem vergessen.', hint: 'Gegenüber läuft etwas auf großer Leinwand. Setz dich hin.', by: 'B' },
  { id: 'palast-tape', title: 'Kassette im Gepäck', desc: 'Du hast deine eigene Kassette mit ins Kino genommen. Das Personal tut so, als wäre das normal.', hint: 'Das Kino spielt auch Filme von zu Hause. Wenn man sie mitbringt.', by: 'B' },
  { id: 'zebra', title: 'Verkehrsvorbild', desc: 'Du hast bei Grün die Straße überquert. Ein Wunder, dass sich das herumspricht.', hint: 'Auf der Straße gibt es eine Regel, an die sich fast niemand hält. Sei dieser eine.', by: 'E' },
  { id: 'car-honk', title: 'Hupkonzert', desc: 'Du hast dich einem Auto in den Weg gestellt. Es hat gehupt. Ein klassischer Dialog.', hint: 'Auf der Fahrbahn wird mit Lautstärke diskutiert.', by: 'E' },
  { id: 'cat-laser', title: 'Jagdfieber', desc: 'Du hast der Katze einen roten Punkt spendiert. Sie hat dir ihre volle Aufmerksamkeit geschenkt. Kurz.', hint: 'Manche Katzen jagen etwas, das gar nicht da ist. Gib ihr etwas Leuchtendes.', by: 'G' },
  { id: 'gang-flee', title: 'Haltung bewahrt', desc: 'Die Bande hat die Flucht ergriffen. Du warst es, auch wenn du es nicht zugeben willst.', hint: 'Wer sich auf der Straße nicht einschüchtern lässt, wird bald allein sein.', by: 'G' },
  { id: 'salon-first', title: 'Neuer Schnitt', desc: 'Frisch aus dem Salon. Der Spiegel und du, ihr seid euch einig.', hint: 'Gegenüber dreht sich ein Stuhl. Setz dich, die Schere wartet.', by: 'G' },
  { id: 'knockout', title: 'Lichter aus', desc: 'Du bist umgefallen und im Laden wieder aufgewacht. Richard hat es natürlich kommentiert.', hint: 'Nicht jede Rauferei endet mit einem Handschlag. Manche enden auf dem Boden.', by: 'G' },
];

export const TOTAL = CATALOG.length;
const BY_ID = new Map(CATALOG.map((e) => [e.id, e]));

export const isKnownId = (id) => typeof id === 'string' && BY_ID.has(id);
export const entryOf = (id) => BY_ID.get(id) || null;
export const titleOf = (id) => { const e = BY_ID.get(id); return e ? e.title : ''; };

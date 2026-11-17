// VIDEOTHEK LENZ · Plätze der NPC (rein): Anker für Kino-Personal und Kiosk-Verkäuferin (Fallbacks aus den Stadtdaten, falls Paket A/B
// keine Anker anlegen), Katzenplätze im Hinterhof, Taubenplätze. Alle Funktionen nehmen layout.city (buildCity-Ergebnis).
// Anker-Vertrag (Vorrang, wenn vorhanden): city.palast.staff.ticket|popcorn = { x, z, yaw } · city.kiosk.vendor = { x, z, yaw }.
// yaw: 0 blickt nach −z (Norden), π nach +z (Süden), +π/2 nach −x (Westen).

const PI = Math.PI;

/** Kinopersonal im Palast-Foyer (Fallback: Kartenabreißer neben der rechten Saaltür, Popcorn an der Ostwand). */
export function staffAnchors(city) {
  const p = city.palast;
  const given = (p && p.staff) || {};
  const f = p.foyer;
  const cx = (p.doorX0 + p.doorX1) / 2;
  const d0 = p.hallDoors[0];
  return {
    ticket: given.ticket || { x: cx - 4.5 + 1.7, z: f.z1 - 0.7, yaw: 0, anchor: false },
    popcorn: given.popcorn || { x: f.x1 - 1.3, z: f.z0 + 2.4, yaw: PI / 2, anchor: false },
    _hallDoor: d0,
  };
}

/** Verkäuferin am Kiosk (Fallback: am Ostende des Tresens, blickt zur Straße). */
export function vendorAnchor(city) {
  const k = city.kiosk;
  if (k && k.vendor) return { ...k.vendor, anchor: true };
  const c = k.counter;
  return { x: c.x1 + 0.45, z: c.z1 - 0.05, yaw: PI, anchor: false };
}

/** Plätze der Katze im Hinterhof: Kistendeckel, Mülltonnen, Boden. [{ id, x, z, y }] */
export function catSpots(city) {
  const by = (id) => (city.colliders || []).find((c) => c.id === id);
  const out = [];
  const top = (id, label) => {
    const c = by(id);
    if (c && Number.isFinite(c.y1)) out.push({ id: label || id, x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2, y: c.y1 });
  };
  top('crateB', 'crateB');
  top('crateC', 'crateC');
  top('yardBin1', 'bin1');
  const y = city.yard;
  const w = city.frame.W;
  out.push({ id: 'corner', x: -2.4, z: y.z0 + 1.3, y: 0 });
  out.push({ id: 'mid', x: -1.0, z: -8.0, y: 0 });
  out.push({ id: 'door', x: w * 0.5, z: -3.0, y: 0 });
  out.push({ id: 'east', x: w * 0.78, z: -6.5, y: 0 });
  out.push({ id: 'far', x: w + 4.5, z: -5.5, y: 0 });
  return out;
}

/** Heimatplätze der Tauben { x, z, r }: Gehweg am Kiosk und am Palast-Vorplatz. Jeder Platz rückt entlang x bis zum nächsten freien Fleck (keine Kollider im Radius). */
export function pigeonHomes(city) {
  const f = city.frame;
  const free = (h) => !(city.colliders || []).some((q) => !q.dynamic && h.x > q.x0 - h.r && h.x < q.x1 + h.r && h.z > q.z0 - h.r && h.z < q.z1 + h.r);
  const base = [
    { id: 'kiosk', x: f.W + 8.0, z: f.D + 1.4, r: 0.8 },
    { id: 'plaza', x: f.W / 2 + 6.5, z: f.D + 9.6, r: 1.0 },
    { id: 'plaza2', x: f.W / 2 - 3.2, z: f.D + 9.6, r: 0.9 },
    { id: 'kiosk2', x: f.W + 12.6, z: f.D + 1.4, r: 1.0 },
  ];
  return base.map((h) => {
    for (let k = 0; k <= 24; k++) {
      for (const sg of k ? [1, -1] : [1]) {
        const c = { ...h, x: h.x + sg * k * 0.5 };
        if (free(c)) return c;
      }
    }
    return h;
  });
}

// VIDEOTHEK LENZ · Mehrspieler: Teil-Register des Moduls net (modules/net.js). Spätere Wellen ersetzen hier nur ihren Stub
// (Import + Eintrag), modules/net.js bleibt unberührt. Jede Fabrik: createX(core) → Handle oder null; alle Methoden optional:
//   { welcome(wl), ev(e) /* Frame b */, x(e) /* Frame x */, tick(dt, t), stop() /* Verbindung weg: auf 1.15 zurück */, dispose() }
// core = { ctx, frame, send(msg) → bool, me() → {c,k,admin}|null, cap(name) → bool, active() → bool, serverNow() → ms|null,
//          peers /* net/peers.js */, prefs() → {...}, toast(text), on(t, fn) → off /* Nachrichtentyp, z. B. 'kx' */ }
import { createEmotes } from './emote-ui.js';
import { createChatPart } from './chat-ui.js';
import { createPhys } from './phys.js';
import { createPush } from './push.js';
import { createRichard } from './richard.js';
import { createWeather } from './weather.js';
import { createLook } from './look.js';
import { createFightNet } from './fight.js';

const stub = () => ({});

export const PART_FACTORIES = {
  chat: createChatPart, // Welle b (B1)
  emotes: createEmotes,
  phys: createPhys, // Welle c (C1)
  push: createPush, // Welle c (C1)
  richard: createRichard, // Welle c (C2)
  weather: createWeather, // Welle c (C2)
  kino: stub, // Welle d
  look: createLook, // 1.17.0: eigener Look und Ausweis (Fähigkeit look)
  fight: createFightNet, // 1.18.0: Waffenwahl, Treffer, Laser, Bandenführung (Fähigkeit fight); Provider-Anteil net.fight
};

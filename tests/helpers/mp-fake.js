// Vitest-Zugang zur Fake-Welt des Mehrspieler-Harness (Quelle: build/mp-dev/fake.js, läuft auf dem echten Reducer charts-worker/src/mp/room.js).
// Typisch: createFakeWorld({ virtual: true, bots: 3 }) → advance(ms) treibt Server, Latenz, Alarm und Bots; socketFactory in den Transport (env.WebSocket).
export { createFakeWorld } from '../../build/mp-dev/fake.js';
export { createBots, ROUTES } from '../../build/mp-dev/bots.js';

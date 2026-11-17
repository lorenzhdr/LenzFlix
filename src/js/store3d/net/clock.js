// VIDEOTHEK LENZ · Mehrspieler: Zeitabgleich (rein). `ck`-Proben: der Client schickt seine Wanduhr `a`, der Server echot `a` und
// liefert seine Zeit `s`. Genommen wird die Probe mit der kleinsten RTT aus den letzten 8 (jünger als 15 min).
// serverNow() = Wanduhr + Offset (null, solange keine Probe vorliegt). Vertrag: docs/mp-api.md §7.2.

const KEEP = 8;
const MAX_AGE_MS = 15 * 60 * 1000;

export function createClock({ now = Date.now } = {}) {
  let probes = []; // { rtt, off, at }
  let seedOff = null;

  const best = () => {
    let b = null;
    for (const p of probes) if (!b || p.rtt < b.rtt) b = p;
    return b;
  };

  return {
    /** Grobe Startprobe (z. B. `wl.s`/`ticket.s`): nur gültig, bis eine echte Probe vorliegt. */
    seed(serverMs) {
      if (Number.isFinite(serverMs)) seedOff = serverMs - now();
    },
    /** Echo von `ck {a, s}` verarbeiten. Rückgabe: RTT in ms oder null (ungültig). */
    sample(a, serverMs) {
      const t = now();
      if (!Number.isFinite(a) || !Number.isFinite(serverMs)) return null;
      const rtt = t - a;
      if (rtt < 0 || rtt > 60000) return null;
      probes.push({ rtt, off: serverMs + rtt / 2 - t, at: t });
      probes = probes.filter((p) => t - p.at <= MAX_AGE_MS).slice(-KEEP);
      return rtt;
    },
    offset() { const b = best(); return b ? b.off : seedOff; },
    rtt() { const b = best(); return b ? b.rtt : null; },
    serverNow() { const o = best() ? best().off : seedOff; return o === null ? null : now() + o; },
    /** Server-ms -> lokale Wanduhr (null ohne Probe). */
    toLocal(serverMs) { const o = this.offset(); return o === null || !Number.isFinite(serverMs) ? null : serverMs - o; },
    reset() { probes = []; seedOff = null; },
    probeCount() { return probes.length; },
  };
}

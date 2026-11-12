// LENZ LIVE Player: Fake-Player für das Harness. Kein Netzwerk; zeichnet ein Testbild auf das Canvas.
import { createEmitter } from './events.js';

const BARS = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
const FAKE_TRACKS = {
  audio: [{ index: 1, label: 'Deutsch (Test)', lang: 'ger', isDefault: true }],
  subs: [{ index: 2, label: 'Deutsch (Test)', lang: 'ger', isDefault: false }],
};

export function formatTimecode(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export function createFakePlayer({ canvas, now = Date.now, getInfo } = {}) {
  const em = createEmitter();
  let playing = false;
  let base = { off: 0, at: 0 };
  let raf = null;
  let audioIndex = 1;
  let subtitleIndex = -1;
  let volume = 1;
  let muted = false;
  let lastTiming = null;
  let zapNo = 0;

  const position = () => base.off + (now() - base.at);

  function draw() {
    if (!canvas) return;
    const ctx = typeof canvas.getContext === 'function' ? canvas.getContext('2d') : null;
    if (!ctx) return;
    const w = canvas.width || 640;
    const h = canvas.height || 360;
    const bw = w / BARS.length;
    BARS.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * bw, 0, bw + 1, h * 0.7); });
    // Unterer Streifen: Graustufen-Treppe (das OSD liegt hier, daher keine Schrift)
    for (let i = 0; i < 8; i++) {
      const g = Math.round((i / 7) * 255);
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.fillRect((i * w) / 8, h * 0.7, w / 8 + 1, h * 0.3);
    }
    // Beschriftung klein in einer schwarzen Leiste oben in der Mitte
    const info = (typeof getInfo === 'function' ? getInfo() : null) || {};
    const bx = w * 0.2;
    const by = h * 0.04;
    ctx.fillStyle = '#000000';
    ctx.fillRect(bx, by, w * 0.6, h * 0.17);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    const small = Math.round(h / 26);
    ctx.font = `bold ${small}px sans-serif`;
    ctx.fillText(String(info.channel || info.channelName || 'TESTBILD'), w * 0.36, by + h * 0.075);
    ctx.font = `${small}px monospace`;
    ctx.fillText(formatTimecode(position()), w * 0.66, by + h * 0.075);
    ctx.font = `${small}px sans-serif`;
    ctx.fillText(String(info.title || ''), w / 2, by + h * 0.14);
  }

  function loop() {
    if (!playing) return;
    draw();
    raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(loop) : setTimeout(loop, 33);
  }
  function cancelLoop() {
    if (raf == null) return;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    clearTimeout(raf);
    raf = null;
  }
  function begin(offsetMs) {
    cancelLoop();
    base = { off: Math.max(0, Number(offsetMs) || 0), at: now() };
    playing = true;
    em.emit('state', { phase: 'loading' });
    loop();
    em.emit('state', { phase: 'playing' });
    // Attrappe der Messwerte (Harness): plausible, leicht schwankende Zeiten
    zapNo += 1;
    const info = 200 + ((zapNo * 37) % 5) * 100;
    const load = 700 + ((zapNo * 53) % 7) * 150;
    const start = 150 + ((zapNo * 29) % 4) * 50;
    lastTiming = { totalMs: info + load + start, infoMs: info, loadMs: load, startMs: start, chain: 'D', cached: zapNo % 3 === 0, mode: 'direct' };
    return { ok: true, mode: 'direct', timing: { ...lastTiming } };
  }

  return {
    volumeSupported: true,
    volumeMode: () => 'native',
    lastTiming: () => (lastTiming ? { ...lastTiming } : null),
    prefetch: async () => ({ ok: true }),
    unlock() {},
    async play({ offsetMs = 0, audioIndex: a, subtitleIndex: s } = {}) {
      audioIndex = typeof a === 'number' ? a : 1;
      subtitleIndex = typeof s === 'number' ? s : -1;
      return begin(offsetMs);
    },
    async playUrl(_url, offsetMs = 0) { return begin(offsetMs); },
    async stop() { playing = false; cancelLoop(); },
    syncTo(offsetMs) { base = { off: Math.max(0, Number(offsetMs) || 0), at: now() }; },
    setVolume(v) { const n = Number(v); if (Number.isFinite(n)) volume = Math.min(1, Math.max(0, n)); },
    setMuted(b) { muted = !!b; },
    get volume() { return volume; },
    get muted() { return muted; },
    tracks() {
      return { audio: FAKE_TRACKS.audio.map((t) => ({ ...t })), subs: FAKE_TRACKS.subs.map((t) => ({ ...t })), audioIndex, subtitleIndex };
    },
    async setAudio(index) { audioIndex = index; return { ok: true, mode: 'direct' }; },
    async setSubtitle(index) { subtitleIndex = typeof index === 'number' ? index : -1; },
    on: em.on,
    dispose() { playing = false; cancelLoop(); em.clear(); },
  };
}

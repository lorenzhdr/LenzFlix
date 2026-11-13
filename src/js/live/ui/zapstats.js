// Messanzeige für das Umschalten (geteilt: LENZ LIVE und TV-Modus, docs/live.md „Messanzeige“). Reines DOM mit Inline-Styles,
// kein CSS-Bundle. Nur zum Diagnostizieren am iPhone (ohne Konsole): Hash-Parameter lfxdebug=1 in der Hülle.
// Zeile 3 (detailLine): Quelle mkv·hevc·eac3 · High 10 L5.1 10 Bit 3840×1600 · Grund Container · Sprung nein · Abw +0,3 · Seek 0,0/0,3 · canplay 0,5 · Puffer +0,0…+2,0 → +0,0…+12,0 · Warten 2× 1,8 s
// Zeile 4 (warmLine, nur mit timing.warm): Vorwärmen an · genutzt ja · Alter 12 s · Liste 0,3 · Init 0,2 · Seg 1. Byte 4,8 · Res 3/5,1 s
// createZapStats(parent, { getVideo, doc }) → { update(zapInfo), updateAudio(info), destroy() }
//   zapInfo: { channel, keyMs?, timing?, ok?, code?, reason? }   timing laut player.lastTiming()
//   info: { mode, level } (Ton-Modus des Players, Reglerwert 0–100); muted/volume kommen direkt vom <video>.
// Nie URLs/Token/Item-IDs anzeigen. Importiert nichts.

const AVG_MAX = 10;
const STYLE = [
  'position:absolute', 'top:6px', 'left:6px', 'z-index:50', 'max-width:calc(100% - 12px)', 'box-sizing:border-box',
  'padding:4px 6px', 'border-radius:4px', 'background:rgba(0,0,0,.62)', 'color:#e8e8e8',
  'font:11px/1.35 ui-monospace,Menlo,Consolas,monospace', 'white-space:pre-wrap', 'overflow-wrap:anywhere', 'pointer-events:none',
].join(';');

/** 1234 → „1,2“ (Sekunden, ein Dezimalkomma). */
export const sec = (ms) => (Math.max(0, Number(ms) || 0) / 1000).toFixed(1).replace('.', ',');
const num2 = (n) => (Number.isFinite(n) ? n.toFixed(2).replace('.', ',') : '–');
const sec1 = (ms) => (ms == null ? '–' : sec(ms));
const sgn = (s) => (Number.isFinite(s) ? `${s < 0 ? '-' : '+'}${Math.abs(s).toFixed(1).replace('.', ',')}` : '–');
const range = (r) => (Array.isArray(r) ? `${sgn(r[0])}…${sgn(r[1])}` : '–');

/** Zeile 3 aus timing (Quelle, Grund, Sprung, Puffer, Warten); leer, wenn timing keine Zusatzfelder trägt. Nur Kürzel, nie URL/Token. */
export function detailLine(t) {
  if (!t || t.jumped === undefined) return '';
  const p = [];
  const s = t.src;
  if (s) {
    const q = [s.container, s.v, s.a].filter(Boolean).join('·');
    if (q) p.push(`Quelle ${q}${s.fmt ? ` · ${s.fmt}` : ''}`);
    if (s.reasons && s.reasons.length) p.push(`Grund ${s.reasons.join(',')}`);
  }
  if (t.forced) p.push('HLS erzwungen');
  if (t.jumped != null) {
    p.push(`Sprung ${t.jumped ? 'ja' : 'nein'}`);
    if (Number.isFinite(t.devS)) p.push(`Abw ${sgn(t.devS)}`);
    p.push(`Seek ${sec1(t.seekingMs)}/${sec1(t.seekedMs)}`, `canplay ${sec1(t.canplayMs)}`);
    p.push(`Puffer ${range(t.bufSeeked)} → ${range(t.bufPlaying)}`);
    p.push(`Warten ${t.waitCount || 0}×${t.waitCount ? ` ${sec(t.waitMs)} s` : ''}`);
  }
  return p.join(' · ');
}

/** Zeile 4 (Vorwärmen-Test): nur wenn timing.warm vorhanden. Nur Zahlen/Kürzel, nie URL/Token. */
export function warmLine(t) {
  const w = t && t.warm;
  if (!w) return '';
  const r = t.res;
  const res = r ? `Res ${r.n}/${r.firstSegMs == null ? '–' : `${sec(r.firstSegMs)} s`}` : 'Res –';
  if (!w.on) return `Vorwärmen aus · ${res}`;
  const vw = w.started == null ? [] : [`Vw ${w.done || 0}/${w.started}`];
  if (!w.used) return ['Vorwärmen an', 'genutzt nein', ...vw, `Grund ${w.skip || '–'}`, res].join(' · ');
  return [
    'Vorwärmen an', w.partial ? 'genutzt teilweise' : 'genutzt ja', `Alter ${w.ageMs == null ? '–' : `${Math.round(w.ageMs / 1000)} s`}`,
    `Liste ${sec1(w.playlistMs)}`, `Init ${sec1(w.initMs)}`, `Seg 1. Byte ${sec1(w.segFirstByteMs)}`, ...vw, res,
  ].join(' · ');
}

export function createZapStats(parent, { getVideo = null, doc = null } = {}) {
  const d = doc || (parent && parent.ownerDocument) || document;
  const el = d.createElement('div');
  el.className = 'lfx-zapstats';
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = STYLE;
  const l1 = d.createElement('div');
  const l2 = d.createElement('div');
  const l3 = d.createElement('div');
  const l4 = d.createElement('div');
  el.append(l1, l2, l3, l4);
  parent.append(el);

  const hist = []; // Gesamtzeiten (ms) der letzten erfolgreichen Starts
  let audio = { mode: '', level: null };
  let destroyed = false;

  function renderAudio() {
    const v = typeof getVideo === 'function' ? getVideo() : null;
    const mode = audio.mode || '?';
    const muted = v ? (v.muted ? 'ja' : 'nein') : '?';
    const vol = v ? num2(Number(v.volume)) : '?';
    const level = audio.level == null ? '?' : String(Math.round(Number(audio.level)));
    l2.textContent = `Ton: ${mode} · muted ${muted} · vol ${vol} · Regler ${level}`;
  }
  renderAudio();

  return {
    el,
    update(z) {
      if (destroyed || !z) return;
      const t = z.timing || null;
      const parts = [`Sender ${z.channel == null ? '?' : z.channel}`];
      if (z.ok === false) {
        // Der Code trägt bei M<n>/B-PLAY die Kette schon („M3·F>T>T“): nicht doppelt anhängen.
        const ch = t && t.chain && !String(z.code || '').includes(t.chain) ? t.chain : '';
        parts.push('FEHLER', [z.code, ch].filter(Boolean).join(' ') || z.reason || '?');
        if (z.hint || (t && t.hint)) parts.push(z.hint || t.hint);
        if (t) parts.push(`${sec(t.totalMs)} s`);
      } else {
        const total = t ? t.totalMs : z.totalMs;
        if (total != null) {
          hist.push(total);
          if (hist.length > AVG_MAX) hist.shift();
        }
        parts.push(`${total != null ? sec(total) : '?'} s`);
        if (t) {
          if (t.chain) parts.push(t.chain);
          parts.push(`Info ${sec(t.infoMs)}${t.cached ? ' Cache' : ''}`);
          if (t.loadMs != null) parts.push(`Laden ${sec(t.loadMs)}`);
          if (t.startMs != null) parts.push(`Start ${sec(t.startMs)}`);
        }
        if (z.keyMs != null) parts.push(`ab Taste ${sec(z.keyMs)} s`);
        if (hist.length) parts.push(`Ø ${sec(hist.reduce((a, b) => a + b, 0) / hist.length)} s (${hist.length})`);
      }
      l1.textContent = parts.join(' · ');
      l3.textContent = detailLine(t);
      l4.textContent = warmLine(t);
      renderAudio();
    },
    updateAudio(info) {
      if (destroyed) return;
      if (info) audio = { mode: info.mode || audio.mode, level: info.level == null ? audio.level : info.level };
      renderAudio();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      el.remove();
    },
  };
}

// Messanzeige für das Umschalten (geteilt: LENZ LIVE und TV-Modus, docs/live.md „Messanzeige“). Reines DOM mit Inline-Styles,
// kein CSS-Bundle. Nur zum Diagnostizieren am iPhone (ohne Konsole): Hash-Parameter lfxdebug=1 in der Hülle.
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

export function createZapStats(parent, { getVideo = null, doc = null } = {}) {
  const d = doc || (parent && parent.ownerDocument) || document;
  const el = d.createElement('div');
  el.className = 'lfx-zapstats';
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = STYLE;
  const l1 = d.createElement('div');
  const l2 = d.createElement('div');
  el.append(l1, l2);
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
        parts.push('FEHLER', [z.code, t && t.chain].filter(Boolean).join(' ') || z.reason || '?');
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

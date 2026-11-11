// LENZ TV-Modus · Ziffern-Eingabe (Sendernummer 1–18), Verhalten wie live/ui/app.js (digit/commitDigits).
//   0 → wartet auf die zweite Ziffer (Timeout verwirft) · 1 → wartet (Timeout schaltet Sender 1) · 2–9 → sofort.
//   Zweite Ziffer: 1–18 gültig, sonst onInvalid. onPreview(text|null): Anzeige der Eingabe ('1_'), null = leer.
// Keine Importe, kein DOM.
const MAX_CHANNEL = 18;

export function createDigits({ onCommit, onPreview, onInvalid, now = Date.now, timeoutMs = 1500 } = {}) {
  let buf = '';
  let at = 0;
  let timer = null;
  let disposed = false;

  const call = (fn, arg) => { if (typeof fn === 'function') { try { fn(arg); } catch { /* Hörerfehler egal */ } } };
  const unarm = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const reset = () => { unarm(); const had = buf !== ''; buf = ''; if (had) call(onPreview, null); };
  const arm = (fn) => { unarm(); at = now(); timer = setTimeout(() => { timer = null; fn(); }, timeoutMs); };

  function commitPending() {
    const no = Number(buf);
    reset();
    if (no >= 1 && no <= MAX_CHANNEL) call(onCommit, no);
  }

  return {
    /** Nimmt eine Ziffer 0–9 entgegen; gibt den offenen Puffer zurück ('' wenn die Eingabe abgeschlossen ist). */
    push(d) {
      if (disposed) return '';
      const s = String(d);
      if (!/^[0-9]$/.test(s)) return buf;
      if (buf !== '' && now() - at > timeoutMs) { // Timer wurde gedrosselt: Eingabe ist abgelaufen
        if (buf === '1') commitPending(); else reset();
      }
      if (buf === '') {
        if (s === '0') { buf = '0'; call(onPreview, '0_'); arm(reset); return buf; }
        if (s === '1') { buf = '1'; call(onPreview, '1_'); arm(commitPending); return buf; }
        call(onCommit, Number(s));
        return '';
      }
      const no = Number(buf + s);
      reset();
      if (no >= 1 && no <= MAX_CHANNEL) call(onCommit, no);
      else call(onInvalid, 'Dieser Sender existiert nicht');
      return '';
    },
    clear() { if (!disposed) reset(); },
    pending: () => buf,
    dispose() { if (disposed) return; disposed = true; unarm(); buf = ''; },
  };
}

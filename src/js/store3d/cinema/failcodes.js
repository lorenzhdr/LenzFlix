// VIDEOTHEK LENZ · Kino: Fehlercodes des Starts (gemeinsam für das VR-Kino und das 2D-Kino im LENZ PALAST).
// P  play() lieferte false/Fehler        T1 kein Player (<video> nie erreicht)
// T2 Stillstand oder Zeitlimit            D  Fehlerdialog des Jellyfin-Players        B  Bau-Fehler (Szene/Leinwand)
export const FAIL = Object.freeze({ P: 'P', T1: 'T1', T2: 'T2', D: 'D', B: 'B' });

export const FAIL_TEXT = Object.freeze({
  P: 'Der Film konnte nicht gestartet werden',
  T1: 'Kein Player gefunden',
  T2: 'Der Film startet nicht (Stillstand)',
  D: 'Der Player meldet einen Fehler',
  B: 'Die Leinwand konnte nicht aufgebaut werden',
});

/** Kurztext für Toast und Statusbild: „Kino konnte nicht starten (T2)“. */
export const failToast = (code) => (code ? `Kino konnte nicht starten (${code})` : 'Kino konnte nicht starten');

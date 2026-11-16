// Globales Setup: schließt jsdom-Lücken ("Not implemented"-Rauschen).
// Nur unter jsdom (window vorhanden); Node-Umgebungen bleiben unberührt.
// Lokale Stubs/Spies in einzelnen Tests überschreiben diese Defaults weiterhin.
if (typeof window !== 'undefined') {
  // jsdom meldet window.scrollTo als "Not implemented": still durch No-op ersetzen.
  window.scrollTo = () => {};
  if (typeof HTMLCanvasElement !== 'undefined') {
    // Kein 2D-/WebGL-Kontext in jsdom: null entspricht "nicht unterstützt".
    HTMLCanvasElement.prototype.getContext = () => null;
  }
  if (typeof HTMLMediaElement !== 'undefined') {
    HTMLMediaElement.prototype.play = () => Promise.resolve();
    HTMLMediaElement.prototype.pause = () => {};
    HTMLMediaElement.prototype.load = () => {};
  }
}

// VIDEOTHEK LENZ · Modul `selfview` (1.17.0, Stub aus Welle 0): Außenansicht der eigenen Figur (Taste V). Die Welle „Selbstansicht“ füllt diese Datei.
// Provider 'selfview' (Vertrag .tmp/v117/contracts.md §5):
//   mode() → 'ego'|'third' · setMode(m) · toggle() · eye(out: Vector3) → Vector3 (Augenposition) · figure() → Handle | null · playAnim(name)
// Nähte: ctx.player.camera.setRig(fn) (Kamera der Außenansicht), store.js `aimRay`/`actionEvent` lesen eye() nur im Modus 'third'.
// Stub: immer 'ego'; eye() liefert die Kamera-Position.
export default {
  name: 'selfview',
  init(ctx) {
    const provider = {
      mode: () => 'ego',
      setMode() {},
      toggle() {},
      eye(out) { return out.copy(ctx.camera.position); },
      figure: () => null,
      playAnim() {},
    };
    const off = ctx.provide('selfview', provider);
    return { dispose() { off(); } };
  },
};

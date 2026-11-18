// VIDEOTHEK LENZ · Modul `avatar` (1.17.0, Stub aus Welle 0): Provider der eigenen Figur. Die Welle „Figur-Kern/Editor“ füllt diese Datei.
// Provider 'avatar' (Vertrag .tmp/v117/contracts.md §5):
//   look() → RenderLook v2 | null · code() → int[26] | null · slots() → (int[26]|null)[3] · active() → 0..2 · setSlot(i)
//   needsGate() → boolean · gate() → Promise<void>      (Boot: erstes Bild, dann needsGate() → await gate(), danach Intro)
//   openEditor(where: 'pause'|'chair'|'booth'|'gate', focus?: 'body'|'hair'|'face'|'top'|'bottom'|'shoes'|'extras'|'slots') → Promise<boolean>
//   onChange(fn(look, code)) → off · hash() → string · changedFor('richard'|'gabi'|'ronny') → boolean · markSeen(npc) · lastChange() → ms | 0
// Stub: harmlose No-op-Werte; ohne echte Figur (code() === null) blendet die Hülle „Figur …“ im Pause-Menü aus.
export default {
  name: 'avatar',
  init(ctx) {
    const provider = {
      look: () => null,
      code: () => null,
      slots: () => [null, null, null],
      active: () => 0,
      setSlot() {},
      needsGate: () => false,
      gate: () => Promise.resolve(),
      openEditor: () => Promise.resolve(false),
      onChange: () => () => {},
      hash: () => '',
      changedFor: () => false,
      markSeen() {},
      lastChange: () => 0,
    };
    const off = ctx.provide('avatar', provider);
    return { dispose() { off(); } };
  },
};

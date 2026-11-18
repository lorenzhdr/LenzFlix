// VIDEOTHEK LENZ · Modul `member` (1.17.0, Stub aus Welle 0): Mitgliedsausweis. Die Welle „Ausweis“ füllt diese Datei.
// Provider 'member' (Vertrag .tmp/v117/contracts.md §5):
//   cardData() → CardData | null   CardData = { name: string|null, no: string, since: dayNumber, rent: n, cine: n, stamps: bitmask, total, tier: 'bronze'|'silver'|'gold', code: int[26] }
//   showCard(data, { mode: 'self'|'peer'|'rent'|'gate', ms? }) → Promise<void>
//   count(kind: 'rent'|'cine', itemId: string) → boolean   (true = gezählt; Sperre je Titel einmal pro Tag)
// Stub: cardData() liefert null, daher blendet die Hülle „Mitgliedsausweis“ im Pause-Menü aus.
export default {
  name: 'member',
  init(ctx) {
    const provider = {
      cardData: () => null,
      showCard: () => Promise.resolve(),
      count: () => false,
    };
    const off = ctx.provide('member', provider);
    return { dispose() { off(); } };
  },
};

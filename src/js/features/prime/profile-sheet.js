// LENZPRIME (Handy): Profil-Blatt als Bottom-Sheet (kein eigenes Feature; wird vom Avatar der Handy-Kopfzeile geöffnet).
// Dünner Wrapper um shared/profilesheet.js. Einträge: Nutzer-Chip, „Neu & beliebt“, Bibliotheken, dann profileEntries().
import { openProfileSheet as openShared, closeProfileSheet, isProfileSheetOpen } from '../../shared/profilesheet.js';
import { getLibraries } from '../../shared/libraries.js';
import { profileEntries, getUserChip } from '../../shared/profile.js';
import { hubHref } from '../../shared/routes.js';

export { closeProfileSheet, isProfileSheetOpen };

/** opts.returnFocus: Element, das beim Schließen den Fokus zurückbekommt. */
export function openProfileSheet({ returnFocus } = {}) {
  return openShared({
    id: 'lfx-prime-profilesheet',
    prefix: 'lfx-prime-psheet',
    openClass: 'lfx-prime-profilesheet-open',
    label: 'Profil',
    returnFocus,
    load: async () => {
      const [chip, libs, entries] = await Promise.all([
        getUserChip().catch(() => ({ name: '', imageUrl: null })),
        getLibraries().catch(() => []),
        profileEntries({ theme: 'prime', returnFocus }).catch(() => []),
      ]);
      const nav = [{ key: 'new', label: 'Neu & beliebt', href: '#/home?lfx=new' }];
      const libItems = (libs || []).map((l) => ({ key: `lib:${l.id}`, label: l.name, href: l.hubCapable ? hubHref(l.id) : l.href }));
      return {
        chip,
        sections: [{ items: nav }, { title: 'Bibliotheken', items: libItems }, { items: entries }],
      };
    },
  });
}

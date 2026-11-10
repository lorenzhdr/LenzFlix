// LenzFlix: neue Icons (eigene, generische Pfade).
const svg = (path) =>
  `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${path}</svg>`;

/** Drei vertikale Punkte. */
export const ICON_MORE = svg('<circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>');

/** Pfeil nach unten auf Linie. */
export const ICON_DOWNLOAD = svg('<path d="M11 3h2v9.2l3.6-3.6 1.4 1.4-6 6-6-6 1.4-1.4 3.6 3.6z"/><path d="M5 19h14v2H5z"/>');

/** Daumen hoch, gefüllt. */
export const ICON_LIKE = svg(
  '<path d="M2 10h4v11H2z"/><path d="M8 21V10l4.3-7.2c.4-.6 1.1-.9 1.8-.7 1 .3 1.6 1.3 1.4 2.3L14.8 9H20.5c1.2 0 2.1 1.1 1.9 2.3l-1.3 8.5c-.2 1.2-1.2 2.2-2.4 2.2z"/>',
);

/** Daumen hoch, nur Umriss. */
export const ICON_LIKE_OUTLINE = svg(
  '<path fill-rule="evenodd" d="M2 10h4v11H2zm1.5 1.5v8h1v-8z"/><path fill-rule="evenodd" d="M8 10l4.3-7.2c.4-.6 1.1-.9 1.8-.7 1 .3 1.6 1.3 1.4 2.3L14.8 9H20.5c1.2 0 2.1 1.1 1.9 2.3l-1.3 8.5c-.2 1.2-1.2 2.2-2.4 2.2H8zm2 1.1V19h8.7l1.2-7.4h-7.3l1.2-5.6z"/>',
);

/** Auge, nur Umriss. */
export const ICON_EYE = svg(
  '<path fill-rule="evenodd" d="M12 5c4.6 0 8.6 2.9 10.5 7-1.9 4.1-5.9 7-10.5 7S3.4 16.100 1.500 12C3.400 7.900 7.400 5 12 5zm0 2c-3.500 0-6.600 2-8.200 5 1.600 3 4.700 5 8.200 5s6.600-2 8.200-5C18.600 9 15.500 7 12 7zm0 1.500a3.500 3.500 0 110 7 3.500 3.500 0 010-7zm0 2a1.500 1.500 0 100 3 1.500 1.500 0 000-3z"/>',
);

/** Auge mit Haken (aktiv/gesehen). */
export const ICON_EYE_CHECK = svg(
  '<path fill-rule="evenodd" d="M12 5c4.600 0 8.600 2.900 10.500 7-1.900 4.100-5.900 7-10.500 7S3.400 16.100 1.500 12C3.400 7.900 7.400 5 12 5zm0 2c-3.500 0-6.600 2-8.200 5 1.600 3 4.700 5 8.200 5s6.600-2 8.200-5C18.600 9 15.500 7 12 7z"/><path d="M10.500 14.600L8.400 12.500l1-1 1.100 1.100 3.100-3.100 1 1z"/>',
);

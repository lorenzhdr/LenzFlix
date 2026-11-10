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

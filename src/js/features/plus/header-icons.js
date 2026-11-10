// LENZ+: Inline-SVG-Icons der Kopfzeile (eigene einfache Formen, currentColor).
const svg = (body) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICONS = {
  home: svg('<path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M5.5 10v9.5h5v-5.2h3v5.2h5V10"/>'),
  list: svg('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><path d="M12 8.8v6.4M8.8 12h6.4"/>'),
  movies: svg('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 4v16M16 4v16M4 8.5h4M4 15.5h4M16 8.5h4M16 15.5h4"/>'),
  tv: svg('<rect x="3" y="6.5" width="18" height="12" rx="2.5"/><path d="m8 3 4 3.5L16 3"/>'),
  star: svg('<path d="m12 3.8 2.5 5.1 5.6.8-4.1 4 1 5.6-5-2.7-5 2.7 1-5.6-4.1-4 5.6-.8z"/>'),
  search: svg('<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>'),
};

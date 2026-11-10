// LenzFlix: Tab-Icon (Favicon) ersetzt das Jellyfin-Logo. Als data-URI eingebettet (Quelle: assets/logo/favicon.png),
// damit kein weiterer Netzwerkzugriff nötig ist. destroy stellt die Original-Icons wieder her.
const FLIX_HREF = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAACKElEQVR42u3az2oTQQDH8V801SY2LUoOwryCF1/Ji4+lL+HVJ2hToo2xHqXRy0IPha40Ch6cQgjJRSo07ucLc1kYdpf5sH9getmRFoPxWZLLJJMkx0lOk8xL2/yK/rreDgG4SFLWDl8lma6gmCeZlrZZWtpuANjUzyTnFcVJHcelbX5Y7m4A2NQyyZc1FJPSNtcAdAPANhTn9VvibWmb910E0O8w/r0kL+pYJOkkgAfegt0OAAAEgAAQAAJAAAgAASAABIAAEAACQAAIAAEgAASAABAAAkAACAABIAAEgAAQAAJAAAgAASAABIAAEAACQAAIAAEgAASAABAAAkAACAABIAAEgAAQAAJAAAgAASAABIAAEAACQAAIAAEgAASAABAAAkAACAABIAAEgAAQAAJAAAgAASAABIAAEAACQAAAIAAEgAAQAAJAAAiArvV8MRg/6+KN93blQheD8UWS8o9Pc5lkluRTHSdJpqVtrgDoBoBtfa8gZitAJqVtrgHoBoBNLZN8TfI5yVmFMU/yobTNDQD/P4Bt3aw8KWZJPiY5LW3z7T5ebN/33533KMnLOm57k+SVvwABIAAEgAAQAAJAAAgAASAABIAAEAACQAAIAAEgABR7ApPkdZJRksMke0kOkjxOMkwySLKf5Ek9Nqr3dlSRH9U5o5W52iUApW3e5W53Ge9XOMOKZ1jxHObPbumnSR5WPP2KZx3c7dyDCmsVXH8F673tN5bcY1gLzpx6AAAAAElFTkSuQmCC';
// Echte Icons für LENZ+ und LENZPRIME folgen; bis dahin dasselbe Icon.
const FAVICONS = { flix: FLIX_HREF, plus: FLIX_HREF, prime: FLIX_HREF };
const ATTR = 'data-lfx-orig';

let created = null;
let patched = [];
let currentTheme = null;

function hrefFor(theme) {
  return FAVICONS[theme] || FAVICONS.flix;
}

export function applyFavicon(theme = 'flix') {
  if (!document.head) return;
  const href = hrefFor(theme);
  if (created) {
    // Design gewechselt: Icons umstellen
    if (theme !== currentTheme) {
      currentTheme = theme;
      for (const l of [...patched, created]) l.setAttribute('href', href);
    }
    return;
  }
  currentTheme = theme;
  // Vorhandene Icon-Links (rel="icon", "shortcut icon", "apple-touch-icon") umbiegen und Original merken.
  patched = [...document.head.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')];
  for (const l of patched) {
    l.setAttribute(ATTR, l.getAttribute('href') ?? '');
    l.setAttribute('href', href);
    l.setAttribute('type', 'image/png');
    l.removeAttribute('sizes');
  }
  created = document.createElement('link');
  created.id = 'lfx-favicon';
  created.rel = 'icon';
  created.type = 'image/png';
  created.href = href;
  document.head.append(created);
}

export function removeFavicon() {
  created?.remove();
  created = null;
  currentTheme = null;
  for (const l of patched) {
    if (l.hasAttribute(ATTR)) {
      l.setAttribute('href', l.getAttribute(ATTR));
      l.removeAttribute(ATTR);
    }
  }
  patched = [];
}

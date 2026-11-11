// LenzFlix: Tab-Icon (Favicon) ersetzt das Jellyfin-Logo. Als data-URI eingebettet (Quelle: assets/logo/favicon.png),
// damit kein weiterer Netzwerkzugriff nötig ist. destroy stellt die Original-Icons wieder her.
const FLIX_HREF = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAACKElEQVR42u3az2oTQQDH8V801SY2LUoOwryCF1/Ji4+lL+HVJ2hToo2xHqXRy0IPha40Ch6cQgjJRSo07ucLc1kYdpf5sH9getmRFoPxWZLLJJMkx0lOk8xL2/yK/rreDgG4SFLWDl8lma6gmCeZlrZZWtpuANjUzyTnFcVJHcelbX5Y7m4A2NQyyZc1FJPSNtcAdAPANhTn9VvibWmb910E0O8w/r0kL+pYJOkkgAfegt0OAAAEgAAQAAJAAAgAASAABIAAEAACQAAIAAEgAASAABAAAkAACAABIAAEgAAQAAJAAAgAASAABIAAEAACQAAIAAEgAASAABAAAkAACAABIAAEgAAQAAJAAAgAASAABIAAEAACQAAIAAEgAASAABAAAkAACAABIAAEgAAQAAJAAAgAASAABIAAEAACQAAAIAAEgAAQAAJAAAiArvV8MRg/6+KN93blQheD8UWS8o9Pc5lkluRTHSdJpqVtrgDoBoBtfa8gZitAJqVtrgHoBoBNLZN8TfI5yVmFMU/yobTNDQD/P4Bt3aw8KWZJPiY5LW3z7T5ebN/33533KMnLOm57k+SVvwABIAAEgAAQAAJAAAgAASAABIAAEAACQAAIAAEgABR7ApPkdZJRksMke0kOkjxOMkwySLKf5Ek9Nqr3dlSRH9U5o5W52iUApW3e5W53Ge9XOMOKZ1jxHObPbumnSR5WPP2KZx3c7dyDCmsVXH8F673tN5bcY1gLzpx6AAAAAElFTkSuQmCC';
// Echte Icons für LENZ+, LENZPRIME und LENZ//84 folgen; bis dahin dasselbe Icon. VIDEOTHEK LENZ: SVG (Quelle: assets/logo/lenzstore-mark.svg).
const STORE_HREF = 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%20role=%22img%22%3E%3Ctitle%3EVIDEOTHEK%20LENZ%3C/title%3E%3Crect%20width=%2264%22%20height=%2264%22%20rx=%2212%22%20fill=%22%230d1330%22/%3E%3Crect%20x=%224%22%20y=%224%22%20width=%2256%22%20height=%2256%22%20rx=%229%22%20fill=%22none%22%20stroke=%22%23ff3d7f%22%20stroke-width=%222.5%22/%3E%3Cpath%20d=%22M12%2018l9%2028%209-28h-5.5L21%2033.5%2017.5%2018zM34%2018h5.5v23H52v5H34z%22%20fill=%22%23ffd23f%22/%3E%3C/svg%3E';
const FAVICONS = { flix: FLIX_HREF, plus: FLIX_HREF, prime: FLIX_HREF, retro: FLIX_HREF, store: STORE_HREF };

const typeFor = (href) => (href.startsWith('data:image/svg') ? 'image/svg+xml' : 'image/png');
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
      for (const l of [...patched, created]) {
        l.setAttribute('href', href);
        l.setAttribute('type', typeFor(href));
      }
    }
    return;
  }
  currentTheme = theme;
  // Vorhandene Icon-Links (rel="icon", "shortcut icon", "apple-touch-icon") umbiegen und Original merken.
  patched = [...document.head.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')];
  for (const l of patched) {
    l.setAttribute(ATTR, l.getAttribute('href') ?? '');
    l.setAttribute('href', href);
    l.setAttribute('type', typeFor(href));
    l.removeAttribute('sizes');
  }
  created = document.createElement('link');
  created.id = 'lfx-favicon';
  created.rel = 'icon';
  created.type = typeFor(href);
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

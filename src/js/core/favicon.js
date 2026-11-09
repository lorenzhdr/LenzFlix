// LenzFlix: Tab-Icon (Favicon) ersetzt das Jellyfin-Logo. Als data-URI eingebettet (Quelle: assets/logo/favicon.png),
// damit kein weiterer Netzwerkzugriff nötig ist. destroy stellt die Original-Icons wieder her.
const HREF = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAIAAABMXPacAAAABmJLR0QA/wD/AP+gvaeTAAAC3ElEQVR4nO3av06TYRiG8ef9V9pScGBkEWIYOzl5BIYDc/A4PAU9BDf30oCtOBlxIqFQvu99HKoGy2BCkIuW+xqavF/S9P7yS9MmbXi+98K43p2dn0c7ynlU0rikaU4VXEOU2ZcfVN9r6nDeLo4XMRznuPCY5nScYxMCu/B/BwMs1a8+nLd/PNoQTlM8KumopFHOo5Lma8fxuACWSu57TbvXtK9nZmZNCF9veIxLulx9j0cNsFS+5XGa4rikD93Op41VupGbreruhcd+0+437fcUVxcg0gOeegKAEwCcAOAEACcAOAHACQBOAHACgBMAnADgBAAnADgBwAkATgBwAoATAJwA4AQAJwA4AcAJAE4AcAKAEwCcAOAEACcAOAHACQBOAHACgBMAnADgBAAnADgBwAkATgBwAoATAJwA4AQAJwA4AcAJAE4AcAKAEwCcAOAEACcAOAHACQBOAHACgBMAnADgBAAnADgBwAkATgBwAoATAJwA4AQAJwA4AcAJAE4AcAKAEwCcAOAEACcAOAHACQBOAHACgBMAnADgBAAnADgBwAkATgBwAoATAJwA4AQAJwA4AcCtA8BOW7e90ivuWKYH3EOHs/nhbH4ewqTESUrTkkY5H+d4EQM97d+tA8CiLffhvB1aa7NfV37EOClpkhaPaVzS5eMTWR+A2+3UunNVX/4+NiF8i+FLTp9zmuQ4zekkp2uaZJ0Blsruu63vtvXV1fXiynWwSUqLd8lJSeOSzuJDfyg+IYDbFbeDpj1o2sXxfb/zZrv/wBvW4VvQSicAOAHACQBOAHACgBMAnADgBAAnADgBwAkATgBwAoATAJwA4AQAJwA4AcDBvwm/fdbru226Z/eee3Hrum24d9x7ZsW9Xz2FMKg1uA3cs1m/ejbrubPL7ysY4ONGufNzO24b5l33jlvXrbhvVg/mW27RbOCe3Pt/o3bNOu696vkGajLbrJ6h/6f8BHjLwMLsw05oAAAAAElFTkSuQmCC';
const ATTR = 'data-lfx-orig';

let created = null;
let patched = [];

export function applyFavicon() {
  if (!document.head || created) return;
  // Vorhandene Icon-Links (rel="icon", "shortcut icon", "apple-touch-icon") umbiegen und Original merken.
  patched = [...document.head.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')];
  for (const l of patched) {
    l.setAttribute(ATTR, l.getAttribute('href') ?? '');
    l.setAttribute('href', HREF);
    l.setAttribute('type', 'image/png');
    l.removeAttribute('sizes');
  }
  created = document.createElement('link');
  created.id = 'lfx-favicon';
  created.rel = 'icon';
  created.type = 'image/png';
  created.href = HREF;
  document.head.append(created);
}

export function removeFavicon() {
  created?.remove();
  created = null;
  for (const l of patched) {
    if (l.hasAttribute(ATTR)) {
      l.setAttribute('href', l.getAttribute(ATTR));
      l.removeAttribute(ATTR);
    }
  }
  patched = [];
}

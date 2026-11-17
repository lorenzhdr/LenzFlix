// VIDEOTHEK LENZ: „Zurück ins Kino“ (2D-Kino im LENZ PALAST, Vollbild). Hüllen-DOM an body, liegt über Jellyfins OSD und der
// ausgeblendeten Bühne. Blendet sich nach 3 s ohne Bewegung aus und kehrt bei Maus/Touch zurück. CSS: themes/store/palast.css.
export const IDLE_MS = 3000;

export function mountBackButton({ onBack }) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'lfx-palast-back';
  b.textContent = 'Zurück ins Kino';
  let t = 0;
  const wake = () => { b.classList.remove('is-idle'); clearTimeout(t); t = setTimeout(() => b.classList.add('is-idle'), IDLE_MS); };
  const evs = ['mousemove', 'pointerdown', 'touchstart'];
  b.addEventListener('click', () => { try { onBack(); } catch (e) { console.warn('[LenzFlix] palast back', e && e.message); } });
  for (const n of evs) window.addEventListener(n, wake, { passive: true, capture: true });
  document.body.appendChild(b);
  wake();
  return {
    el: b,
    destroy() {
      clearTimeout(t);
      for (const n of evs) window.removeEventListener(n, wake, true);
      b.remove();
    },
  };
}

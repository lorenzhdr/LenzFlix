// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { createCinemaBridge } from '../src/js/features/store/cinema-bridge.js';

// Jellyfin behält alte Player-Seiten versteckt (.hide) mit derselben ID im DOM (live geprüft):
// die Bridge muss die Knöpfe der sichtbaren Seite bedienen.
function osdPage(hidden, log, tag) {
  const page = document.createElement('div');
  page.id = 'videoOsdPage';
  page.className = `page libraryPage mainAnimatedPage${hidden ? ' hide' : ''}`;
  for (const cls of ['btnPause', 'btnRewind', 'btnFastForward']) {
    const b = document.createElement('button');
    b.className = cls;
    b.addEventListener('click', () => log.push(`${tag}:${cls}`));
    page.appendChild(b);
  }
  const up = document.createElement('div');
  up.className = `upNextContainer${hidden ? '' : ' hide'}`;
  up.textContent = 'Nächste Folge beginnt in 12 Sekunden';
  page.appendChild(up);
  document.body.appendChild(page);
}

describe('cinema-bridge mit veralteten Player-Seiten', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('klickt die Knöpfe der sichtbaren Seite, nicht der versteckten', () => {
    const log = [];
    osdPage(true, log, 'alt');
    osdPage(true, log, 'alt2');
    osdPage(false, log, 'neu');
    const br = createCinemaBridge();
    br.togglePause();
    br.seekBy(-10);
    br.seekBy(30);
    expect(log).toEqual(['neu:btnPause', 'neu:btnRewind', 'neu:btnFastForward']);
    br.dispose();
  });

  it('liest Up-Next aus der sichtbaren Seite', () => {
    osdPage(true, [], 'alt');
    osdPage(false, [], 'neu');
    const br = createCinemaBridge();
    expect(br.state().upNext).toBeNull();
    br.dispose();
  });
});

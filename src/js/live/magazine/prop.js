// Heft-Objekt („Prop“) für die Szene: kleine Titelseite, die perspektivisch auf einer Fläche liegt. Klick/Enter → onOpen().
//
// Einbau durch den Integrator:
//   const prop = createMagazineProp({ doc: document, onOpen: () => guide.open(), imageUrl: ctx.imageUrl, onFit: (ok) => side.classList.toggle('is-guide-key', !ok) });
//   slot.append(prop.el);        // slot = Wrapper .lfx-live-side über der Fernbedienung; Breite des Hefts = 100 % des Slots
//   prop.watch(slot);            // optional: Slot explizit beobachten (Standard: el.parentElement beim ersten measure())
//   prop.setStyle(ctx.style()); prop.setCover(heroTip /* magazine.cover.hero oder null */);
// Platzwächter: ist der Slot niedriger als PROP_MIN_PX, passt das Heft nicht (fits() === false, onFit(false)); der Integrator blendet
// dann das Heft aus (prop.el.hidden = true) und zeigt stattdessen einen Hinweis/Knopf „Guide“ (Klasse .is-guide-key). Wird der Slot
// wieder größer, kommt onFit(true). Nach Änderungen am Layout ohne Größenänderung: prop.measure().
// Aufräumen: prop.destroy() entfernt Beobachter, Listener und das Element.

export const PROP_MIN_PX = 110;

export function createMagazineProp({ doc = document, onOpen, imageUrl, onFit, slot } = {}) {
  const el = doc.createElement('button');
  el.type = 'button';
  el.className = 'lfx-live-mag-prop';
  el.setAttribute('aria-label', 'Fernsehzeitung öffnen');
  el.dataset.style = 'flat';

  const sheet = doc.createElement('span');
  sheet.className = 'lfx-live-mag-prop__sheet';
  const mast = doc.createElement('span');
  mast.className = 'lfx-live-mag-prop__mast';
  mast.textContent = 'LIVE Programm';
  const pic = doc.createElement('span');
  pic.className = 'lfx-live-mag-prop__pic';
  const week = doc.createElement('span');
  week.className = 'lfx-live-mag-prop__week';
  week.textContent = 'Mo Di Mi Do Fr Sa So';
  sheet.append(mast, pic, week);
  el.append(sheet);

  let cover = null;
  let imgEl = null;
  let fit = true;
  let ro = null;
  let watched = null;
  let dead = false;

  function setCover(tip) {
    cover = tip || null;
    if (imgEl) {
      imgEl.remove();
      imgEl = null;
    }
    pic.classList.toggle('has-img', false);
    if (!cover || !cover.imageId || typeof imageUrl !== 'function') return;
    const im = doc.createElement('img');
    im.loading = 'lazy';
    im.decoding = 'async';
    im.alt = '';
    im.src = imageUrl(cover.imageId, { maxWidth: 200 });
    im.addEventListener('error', () => {
      im.remove();
      if (imgEl === im) imgEl = null;
      pic.classList.remove('has-img');
    });
    imgEl = im;
    pic.append(im);
    pic.classList.add('has-img');
  }

  function setStyle(id) {
    el.dataset.style = id || 'flat';
  }

  function measure() {
    if (dead) return fit;
    const s = watched || slot || el.parentElement;
    if (!s) return fit;
    const next = s.clientHeight >= PROP_MIN_PX;
    if (next !== fit) {
      fit = next;
      if (typeof onFit === 'function') onFit(fit);
    }
    return fit;
  }

  function watch(s) {
    if (dead || !s || s === watched) return;
    if (ro) ro.disconnect();
    watched = s;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(() => measure());
      ro.observe(s);
    }
    measure();
  }

  const click = () => {
    if (typeof onOpen === 'function') onOpen();
  };
  el.addEventListener('click', click);

  if (slot) watch(slot);

  return {
    el,
    setCover,
    setStyle,
    fits: () => fit,
    measure,
    watch,
    destroy() {
      dead = true;
      if (ro) ro.disconnect();
      ro = null;
      el.removeEventListener('click', click);
      el.remove();
      imgEl = null;
    }
  };
}

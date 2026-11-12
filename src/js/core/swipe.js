// Swipe-nach-unten-zum-Schliessen fuer Bottom-Sheets/Modals (Touch).
// Eigenstaendig: keine Jellyfin-DOM-Referenzen, keine globalen Seiteneffekte.

const DECIDE_PX = 8;
const SAMPLE_MS = 100;
const FALLBACK_PX = 80;
const EASE = 'cubic-bezier(0.2,0,0,1)';
const ANIM = `transform 180ms ${EASE}`;

function defaultReducedMotion() {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function scrolledAncestor(target, el) {
  let n = target && target.nodeType === 1 ? target : target && target.parentElement;
  while (n) {
    if (n.scrollTop > 0) return true;
    if (n === el) break;
    n = n.parentElement;
  }
  return false;
}

export function attachSwipeClose(el, opts = {}) {
  const onClose = opts.onClose;
  const handleZone = opts.handleZone ?? 32;
  const canStart = opts.canStart || (() => true);
  const threshold = opts.threshold ?? 0.3;
  const velocity = opts.velocity ?? 0.5;
  const backdrop = opts.backdrop || null;
  const holdBackdrop = Boolean(opts.holdBackdrop); // beim Schließen den Hintergrund nicht aufdecken (Seite dahinter kann noch springen)
  const reduced = opts.reducedMotion || defaultReducedMotion;
  const now = () => Date.now();

  let state = 'idle'; // idle | tracking | dragging | ignored | closing
  let startX = 0;
  let startY = 0;
  let dy = 0;
  let samples = [];
  let timer = 0;
  let detached = false;
  let finishFn = null;

  const height = () => el.offsetHeight || el.getBoundingClientRect().height || 0;

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = 0;
  }

  function resetStyles() {
    el.classList.remove('lfx-dragging');
    el.style.removeProperty('transform');
    el.style.removeProperty('transition');
    if (backdrop) {
      backdrop.style.removeProperty('opacity');
      backdrop.style.removeProperty('transition');
    }
  }

  function animateThen(ms, fn) {
    clearTimer();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimer();
      el.removeEventListener('transitionend', onEnd);
      finishFn = null;
      fn();
    };
    const onEnd = (e) => {
      if (e.target === el) finish();
    };
    finishFn = () => {
      done = true;
      el.removeEventListener('transitionend', onEnd);
    };
    el.addEventListener('transitionend', onEnd);
    timer = setTimeout(finish, ms);
  }

  function setBackdrop(v, animate) {
    if (!backdrop) return;
    backdrop.style.transition = animate ? 'opacity 180ms linear' : 'none';
    backdrop.style.opacity = String(v);
  }

  function close() {
    state = 'closing';
    if (reduced()) {
      onClose();
      return;
    }
    el.style.transition = ANIM;
    el.style.transform = 'translateY(100%)';
    if (!holdBackdrop) setBackdrop(0.3, true);
    animateThen(250, () => onClose());
  }

  function springBack() {
    state = 'closing';
    el.style.transition = ANIM;
    el.style.transform = 'translateY(0px)';
    setBackdrop(1, true);
    animateThen(250, () => {
      resetStyles();
      state = 'idle';
    });
  }

  function velocityNow() {
    if (samples.length < 2) return 0;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const dt = last.t - first.t;
    return dt > 0 ? (last.y - first.y) / dt : 0;
  }

  function onStart(e) {
    if (state === 'closing') return;
    state = 'idle';
    const touches = e.touches || [];
    if (touches.length !== 1) {
      state = 'ignored';
      return;
    }
    const t = touches[0];
    const rect = el.getBoundingClientRect();
    const inHandle = t.clientY - rect.top <= handleZone;
    if (!inHandle && scrolledAncestor(e.target, el)) {
      state = 'ignored';
      return;
    }
    if (!canStart(e)) {
      state = 'ignored';
      return;
    }
    state = 'tracking';
    startX = t.clientX;
    startY = t.clientY;
    dy = 0;
    samples = [{ t: now(), y: startY }];
  }

  function onMove(e) {
    if (state !== 'tracking' && state !== 'dragging') return;
    const touches = e.touches || [];
    if (touches.length !== 1) {
      if (state === 'dragging') springBack();
      else state = 'ignored';
      return;
    }
    const t = touches[0];
    const mx = t.clientX - startX;
    const my = t.clientY - startY;
    if (state === 'tracking') {
      if (Math.hypot(mx, my) < DECIDE_PX) return;
      if (my > 0 && my > Math.abs(mx)) {
        state = 'dragging';
        el.classList.add('lfx-dragging');
        el.style.transition = 'none';
      } else {
        state = 'ignored';
        return;
      }
    }
    if (e.cancelable) e.preventDefault();
    dy = Math.max(0, my);
    const ts = now();
    samples.push({ t: ts, y: t.clientY });
    while (samples.length > 2 && ts - samples[0].t > SAMPLE_MS) samples.shift();
    el.style.transform = `translateY(${dy}px)`;
    const h = height() || 300;
    setBackdrop(1 - 0.7 * Math.min(1, dy / h), false);
  }

  function onEnd() {
    if (state === 'dragging') {
      const h = height();
      const far = h > 0 ? dy > threshold * h : dy > FALLBACK_PX;
      if (far || velocityNow() > velocity) close();
      else springBack();
    } else if (state !== 'closing') {
      state = 'idle';
    }
  }

  function onCancel() {
    if (state === 'dragging') springBack();
    else if (state !== 'closing') state = 'idle';
  }

  el.addEventListener('touchstart', onStart, { passive: true });
  el.addEventListener('touchmove', onMove, { passive: false });
  el.addEventListener('touchend', onEnd);
  el.addEventListener('touchcancel', onCancel);

  return function detach() {
    if (detached) return;
    detached = true;
    clearTimer();
    if (finishFn) finishFn();
    el.removeEventListener('touchstart', onStart);
    el.removeEventListener('touchmove', onMove);
    el.removeEventListener('touchend', onEnd);
    el.removeEventListener('touchcancel', onCancel);
    resetStyles();
    state = 'idle';
  };
}

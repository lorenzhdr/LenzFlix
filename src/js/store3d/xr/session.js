// VIDEOTHEK LENZ · WebXR-Sitzung: Erkennung, Betreten (synchron im Klick), Verlassen, Sichtbarkeit.
// Erkennung nur über navigator.xr.isSessionSupported('immersive-vr') – kein UA-Sniffing.

let probed = null;

/** Wird immersive-vr unterstützt? Ergebnis wird gecacht, Fehler zählen als nein. */
export function probeXr() {
  if (probed) return probed;
  probed = (async () => {
    try {
      const xr = typeof navigator !== 'undefined' ? navigator.xr : null;
      if (!xr || typeof xr.isSessionSupported !== 'function') return false;
      return !!(await xr.isSessionSupported('immersive-vr'));
    } catch { return false; }
  })();
  return probed;
}

/** Nur für Tests: Cache leeren. */
export function resetProbe() { probed = null; }

export class XrSession {
  /** @param {{ renderer, onStart(info), onEnd(), onVisibility(state) }} o */
  constructor({ renderer, onStart, onEnd, onVisibility }) {
    this.renderer = renderer;
    this.onStart = onStart || (() => {});
    this.onEnd = onEnd || (() => {});
    this.onVisibility = onVisibility || (() => {});
    this._session = null;
    this._presenting = false;
    this._busy = false;
    this.floor = true;
    this.visibility = 'visible';
    this._ended = () => this.handleEnd();
    this._vis = () => {
      const s = this._session;
      this.visibility = (s && s.visibilityState) || 'visible';
      this.onVisibility(this.visibility);
    };
  }

  get presenting() { return this._presenting; }

  get session() { return this._session; }

  /** Muss synchron aus einem Klick-Handler laufen (Nutzeraktivierung). Löst mit true/false auf. */
  enter() {
    const xr = typeof navigator !== 'undefined' ? navigator.xr : null;
    if (this._busy || this._presenting || !xr) return Promise.resolve(false);
    this._busy = true;
    let req;
    try {
      req = xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
    } catch {
      this._busy = false;
      return Promise.resolve(false);
    }
    return Promise.resolve(req).then(async (session) => {
      const r = this.renderer;
      try {
        let type = 'local-floor';
        this.floor = true;
        try { await session.requestReferenceSpace('local-floor'); } catch { type = 'local'; this.floor = false; }
        this._session = session;
        r.xr.enabled = true;
        r.xr.setReferenceSpaceType(type);
        session.addEventListener('visibilitychange', this._vis);
        r.xr.addEventListener('sessionend', this._ended);
        await r.xr.setSession(session);
        if (this._session !== session) return false; // zwischenzeitlich beendet
        this._presenting = true;
        this._busy = false;
        this.visibility = session.visibilityState || 'visible';
        this.onStart({ floor: this.floor });
        return true;
      } catch {
        try { console.warn('[LenzFlix Store3D] XR-Start fehlgeschlagen'); } catch { /* egal */ }
        this.cleanup();
        try { session.end(); } catch { /* egal */ }
        return false;
      }
    }, () => { this._busy = false; return false; });
  }

  /** Sitzung beenden (Ende meldet sich über onEnd). */
  exit() {
    const s = this._session;
    if (!s) return Promise.resolve();
    try { return Promise.resolve(s.end()).catch(() => {}); } catch { return Promise.resolve(); }
  }

  cleanup() {
    const s = this._session;
    if (s) { try { s.removeEventListener('visibilitychange', this._vis); } catch { /* egal */ } }
    try { this.renderer.xr.removeEventListener('sessionend', this._ended); } catch { /* egal */ }
    this._session = null;
    this._presenting = false;
    this._busy = false;
    this.renderer.xr.enabled = false;
  }

  handleEnd() {
    const was = this._presenting;
    this.cleanup();
    if (was) this.onEnd();
  }

  dispose() {
    const s = this._session;
    this.onStart = () => {};
    this.onEnd = () => {};
    this.onVisibility = () => {};
    this.cleanup();
    if (s) { try { Promise.resolve(s.end()).catch(() => {}); } catch { /* egal */ } }
  }
}

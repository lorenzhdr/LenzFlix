// VIDEOTHEK LENZ · Modul `member` (1.17.0): Mitgliedsausweis und Zähler. Vertrag .tmp/v117/contracts.md §5/§9.
// Provider 'member':
//   cardData() → CardData | null   (null, solange es keine Figur gibt; Name nur bei „Name zeigen“)
//   ensure() → vergibt Nummer (6-stellig) und „seit“, falls fehlend (nach dem Gate)
//   showCard(data, { mode: 'self'|'peer'|'rent'|'gate', ms? }) → Promise<void> (löst beim Schließen auf)
//   count(kind: 'rent'|'cine', itemId) → boolean   (true = gezählt; je Titel und Art einmal pro Tag)
// Profil: deps.profile (Hülle). Ohne Profil zählt nichts, cardData() liefert trotzdem eine Karte, sobald es eine Figur gibt.
import { cardData as buildCardData, countOnce, dayNumber, memberSince } from '../char/card.js';
import { buildCard } from '../ui/membercard.js';
import { prefersReducedMotion } from './m4-util.js';

const RENT_MS = 1200;

function randomNo() {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return String(100000 + (a[0] % 900000));
  } catch {
    return String(100000 + Math.floor(Math.random() * 900000));
  }
}

export default {
  name: 'member',
  init(ctx) {
    const deps = ctx.deps || {};
    const profile = () => (deps.profile && typeof deps.profile.get === 'function' ? deps.profile : null);
    const xr = () => !!(ctx.xr && ctx.xr.presenting && ctx.xr.presenting());
    const timers = new Set();
    let disposed = false;
    let rentEl = null;
    let open = null; // { ui, done }

    const showName = () => {
      if (!deps.mp || typeof deps.mp.prefs !== 'function') return true; // ohne Mehrspieler gibt es keinen Schalter: eigene Karte mit eigenem Namen
      try { return deps.mp.prefs().name !== false; } catch { return true; }
    };
    const foundIds = () => {
      const d = ctx.use('discover');
      const ids = new Set();
      try { if (d && d.getNetState) for (const id of d.getNetState().found || []) ids.add(id); } catch { /* egal */ }
      const p = profile();
      if (p) for (const id of Object.keys((p.get() && p.get().disc) || {})) ids.add(id);
      return [...ids];
    };

    function cardData() {
      const av = ctx.use('avatar');
      const code = av && av.code ? av.code() : null;
      if (!code) return null;
      const p = profile();
      const name = deps.user && deps.user.name ? String(deps.user.name) : null;
      return buildCardData(p ? p.get() : {}, { name, showName: showName(), code, foundIds: foundIds(), now: Date.now() });
    }

    function ensure() {
      const p = profile();
      if (!p || typeof p.update !== 'function') return;
      const cur = p.get() || {};
      if (cur.mem && cur.mem.no && cur.mem.since) return;
      p.update((d) => {
        d.mem = d.mem && typeof d.mem === 'object' ? d.mem : {};
        if (!d.mem.no) d.mem.no = randomNo();
        if (!d.mem.since) d.mem.since = memberSince(d, Date.now());
      });
    }

    function count(kind, itemId) {
      const p = profile();
      if (!p || typeof p.update !== 'function' || (kind !== 'rent' && kind !== 'cine') || !itemId) return false;
      const dev = String(p.dev || '_');
      let counted = false;
      p.update((d) => {
        d.cnt = d.cnt && typeof d.cnt === 'object' ? d.cnt : {};
        const r = countOnce(d.cnt.last, `${kind}:${itemId}`, dayNumber(Date.now()));
        if (!r.ok) return;
        counted = true;
        d.cnt.last = r.last;
        d.cnt[kind] = d.cnt[kind] && typeof d.cnt[kind] === 'object' ? d.cnt[kind] : {};
        d.cnt[kind][dev] = (Number(d.cnt[kind][dev]) || 0) + 1;
      });
      return counted;
    }

    function closeOpen() { if (open) { const o = open; open = null; try { if (ctx.overlay.isOpen()) ctx.overlay.close(); } catch { /* egal */ } o.ui.destroy(); o.done(); } }

    function clearRent() { if (rentEl) { rentEl.destroy(); rentEl = null; } }

    function showCard(data, o = {}) {
      if (disposed || !data) return Promise.resolve();
      const mode = ['self', 'peer', 'rent', 'gate'].includes(o.mode) ? o.mode : 'self';
      const av = ctx.use('avatar');
      const reduced = prefersReducedMotion();
      if (mode === 'rent') {
        if (xr()) return Promise.resolve(); // in VR nur der Spruch
        clearRent();
        const host = ctx.renderer && ctx.renderer.domElement && ctx.renderer.domElement.parentNode;
        if (!host) return Promise.resolve();
        const code = data.code;
        const ui = buildCard(data, { mode: 'rent', reduced, portrait: av && av.portrait && code ? av.portrait(code) : null });
        host.appendChild(ui.el);
        rentEl = ui;
        const ms = Number.isFinite(o.ms) && o.ms > 0 ? o.ms : RENT_MS;
        return new Promise((resolve) => {
          const t = setTimeout(() => { timers.delete(t); if (rentEl === ui) clearRent(); resolve(); }, ms);
          timers.add(t);
        });
      }
      if (xr()) {
        try { ctx.xr.toast(`Ausweis Nr. ${data.no}: ${data.rent} Ausleihen, ${data.cine} Kinobesuche`, 3500); } catch { /* egal */ }
        return Promise.resolve();
      }
      closeOpen();
      clearRent();
      return new Promise((resolve) => {
        const title = mode === 'peer' && data.name ? `Ausweis von ${data.name}` : 'Mitgliedsausweis';
        const ui = buildCard(data, {
          mode, reduced, title,
          portrait: av && av.portrait && data.code ? av.portrait(data.code) : null,
          onClose: () => { if (open && open.ui === ui) closeOpen(); },
        });
        open = { ui, done: resolve };
        // Gate: Esc-fest (modal). Schließt das Overlay von außen (anderes Overlay, Moduswechsel), bleibt die Karte bis „Weiter“ stehen und kommt zurück.
        const gate = mode === 'gate';
        let tries = 0;
        const openOv = () => {
          ctx.overlay.open(ui.el, {
            modal: gate,
            onClose: () => {
              if (!open || open.ui !== ui) return;
              if (gate && !disposed) { reopen(); return; }
              open = null; ui.destroy(); resolve();
            },
          });
        };
        const reopen = () => {
          const t = setTimeout(() => {
            timers.delete(t);
            if (disposed || !open || open.ui !== ui) return;
            if (ctx.overlay.isOpen() && ++tries > 20) { open = null; ui.destroy(); resolve(); return; } // fremdes Overlay hält sich dauerhaft: nicht ewig kämpfen
            if (ctx.overlay.isOpen()) { reopen(); return; }
            openOv();
          }, 0);
          timers.add(t);
        };
        openOv();
        if (!ctx.isTouch) ui.focus();
      });
    }

    const off = ctx.provide('member', { cardData, ensure, showCard, count });
    return {
      onSuspend() { clearRent(); },
      dispose() {
        disposed = true;
        timers.forEach(clearTimeout);
        timers.clear();
        clearRent();
        closeOpen();
        off();
      },
    };
  },
};

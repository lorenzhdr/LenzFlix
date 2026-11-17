// VIDEOTHEK LENZ · Mehrspieler: Inhalt der Unterebene „Mehrspieler …“ im Pause-Menü (Welle a: Schalter und Status).
// createPanel(api) → { render(el) }; api = { prefs() → {on,name,chat,film}, set(partial), status() → string,
//   players() → [{ k, name, area, devs, admin }] (eine Zeile je Person, ohne mich), isMuted(k), setMute(k, on) → bool,
//   canKick() → bool (ich bin Admin), kick(k) → bool, filmTitle(row) → string (optional, Welle d: Titel nur bei Film-Flag des anderen UND im eigenen Katalog, sonst '') }.
// Spielerliste: Name (sonst „Jemand“), grober Ort, Geräteanzahl, Stumm/Laut je Person; „10 min entfernen“ nur für Admins (nie bei Admins), mit Bestätigung.
// render(el) baut den Inhalt je Element einmal auf und aktualisiert danach nur Texte/Zustände (Fokus bleibt beim Umschalten erhalten).
const SWITCHES = [
  { key: 'on', label: 'Mehrspieler', note: 'Andere auf diesem Server sehen dich in der VIDEOTHEK.' },
  { key: 'name', label: 'Name zeigen', note: 'Dein Jellyfin-Benutzername über deiner Figur. Aus: andere sehen „Jemand“.' },
  { key: 'chat', label: 'Chat', note: '' },
  { key: 'film', label: 'Mein Film für andere sichtbar', note: 'Gilt auch für die Hülle in deiner Hand.' },
];

const AREAS = {
  shop: 'Laden', doorway: 'Ladentür', outside: 'Draußen', street: 'Straße', crossing: 'Kreuzung', sideN: 'Straße', sideS: 'Straße',
  yard: 'Hof', alley: 'Gasse', roof: 'Dach', escape: 'Feuertreppe', kiosk: 'Kiosk', palastEntrance: 'Palast-Eingang',
  palastFoyer: 'Palast-Foyer', palastHall: 'Palast-Saal',
};
/** Grober Ort für einen Bereichsnamen (unbekannt/leer → „Unterwegs“). */
export const areaLabel = (a) => AREAS[a] || 'Unterwegs';

export function createPanel(api) {
  const views = new WeakMap();
  const players = () => { try { return (api.players && api.players()) || []; } catch { return []; } };
  const call = (n, ...a) => { try { return api[n] ? api[n](...a) : false; } catch { return false; } };

  function mkBtn(text, cls, fn, fk) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lfx-store-act ' + cls;
    b.textContent = text;
    if (fk) b.dataset.fk = fk;
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  }

  /** Liste je Aufruf nur neu bauen, wenn sich etwas geändert hat (Fokus bleibt sonst erhalten). */
  function updateList(el, v) {
    const on = !!api.prefs().on;
    v.head.hidden = !on;
    v.list.hidden = !on;
    if (!on) return;
    const rows = players();
    const kick = !!call('canKick');
    if (v.confirm && !rows.some((r) => r.k === v.confirm && !r.admin)) v.confirm = null;
    const film = (r) => { const t = call('filmTitle', r); return typeof t === 'string' ? t : ''; };
    const sig = JSON.stringify([kick, v.confirm, rows.map((r) => [r.k, r.name, r.area, r.devs, !!r.admin, !!call('isMuted', r.k), film(r)])]);
    if (sig === v.sig) return;
    v.sig = sig;
    const doc = el.ownerDocument || document;
    const active = doc.activeElement;
    const fk = active && v.list.contains(active) && active.dataset ? active.dataset.fk : null;
    v.list.textContent = '';
    v.head.textContent = rows.length ? `Gerade hier (${rows.length})` : 'Gerade hier';
    if (!rows.length) {
      const e = document.createElement('div');
      e.className = 'lfx-store-pause-note lfx-mp-empty';
      e.textContent = 'Gerade ist niemand sonst hier.';
      v.list.appendChild(e);
    }
    for (const r of rows) {
      const row = document.createElement('div');
      row.className = 'lfx-mp-player';
      const info = document.createElement('div');
      info.className = 'lfx-mp-pinfo';
      const nm = document.createElement('span');
      nm.className = 'lfx-mp-pname';
      nm.textContent = r.name || 'Jemand';
      const meta = document.createElement('span');
      meta.className = 'lfx-mp-pmeta';
      meta.textContent = `${areaLabel(r.area)}${r.devs > 1 ? ` · ${r.devs} Geräte` : ''}${r.admin ? ' · Admin' : ''}${film(r) ? ` · Film: ${film(r)}` : ''}`;
      info.append(nm, meta);
      row.appendChild(info);
      const acts = document.createElement('div');
      acts.className = 'lfx-mp-pacts';
      const muted = !!call('isMuted', r.k);
      const mb = mkBtn(muted ? 'Laut' : 'Stumm', 'lfx-mp-mute' + (muted ? ' is-on' : ''), () => {
        call('setMute', r.k, !call('isMuted', r.k));
        v.sig = '';
        update(el, v);
      }, 'm:' + r.k);
      mb.setAttribute('aria-pressed', muted ? 'true' : 'false');
      mb.setAttribute('aria-label', `${r.name || 'Jemand'} ${muted ? 'wieder hören' : 'stummschalten'}`);
      acts.appendChild(mb);
      if (kick && !r.admin) {
        if (v.confirm === r.k) {
          acts.appendChild(mkBtn('Wirklich entfernen', 'lfx-mp-kick is-confirm', () => {
            v.confirm = null;
            call('kick', r.k);
            v.sig = '';
            update(el, v);
          }, 'kc:' + r.k));
          acts.appendChild(mkBtn('Abbrechen', 'lfx-mp-kickno', () => { v.confirm = null; v.sig = ''; update(el, v); }, 'kn:' + r.k));
        } else {
          acts.appendChild(mkBtn('10 min entfernen', 'lfx-mp-kick', () => { v.confirm = r.k; v.sig = ''; update(el, v); }, 'k:' + r.k));
        }
      }
      row.appendChild(acts);
      v.list.appendChild(row);
    }
    if (fk) {
      const again = [...v.list.querySelectorAll('[data-fk]')].find((b) => b.dataset.fk === fk);
      if (again) { try { again.focus({ preventScroll: true }); } catch { /* egal */ } }
    }
  }

  function update(el, v) {
    const pr = api.prefs();
    for (const r of v.rows) {
      const on = !!pr[r.sw.key];
      r.b.textContent = `${r.sw.label}: ${on ? 'An' : 'Aus'}`;
      r.b.setAttribute('aria-pressed', on ? 'true' : 'false');
      r.b.classList.toggle('is-on', on);
      r.b.disabled = r.sw.key !== 'on' && !pr.on;
      if (r.note) r.note.hidden = r.sw.key !== 'on' && !pr.on;
    }
    v.status.textContent = api.status() || '';
    v.status.hidden = !v.status.textContent;
    updateList(el, v);
  }

  function build(el) {
    el.textContent = '';
    const v = { rows: [], status: null, head: null, list: null, sig: '', confirm: null };
    for (const sw of SWITCHES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lfx-store-act lfx-mp-switch';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        api.set({ [sw.key]: !api.prefs()[sw.key] });
        update(el, v); // sofort nachziehen (net meldet zusätzlich per onChange)
      });
      el.appendChild(b);
      let note = null;
      if (sw.note) {
        note = document.createElement('div');
        note.className = 'lfx-store-pause-note lfx-mp-note';
        note.textContent = sw.note;
        el.appendChild(note);
      }
      v.rows.push({ sw, b, note });
    }
    v.status = document.createElement('div');
    v.status.className = 'lfx-store-pause-note lfx-mp-status';
    v.status.setAttribute('role', 'status');
    el.appendChild(v.status);
    v.head = document.createElement('div');
    v.head.className = 'lfx-store-pause-title lfx-mp-listhead';
    el.appendChild(v.head);
    v.list = document.createElement('div');
    v.list.className = 'lfx-mp-list';
    el.appendChild(v.list);
    views.set(el, v);
    return v;
  }

  return {
    render(el) {
      if (!el) return;
      update(el, views.get(el) || build(el));
    },
  };
}

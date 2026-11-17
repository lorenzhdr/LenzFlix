// VIDEOTHEK LENZ · Mehrspieler: Inhalt der Unterebene „Mehrspieler …“ im Pause-Menü (Welle a: Schalter und Status).
// createPanel(api) → { render(el) }; api = { prefs() → {on,name,chat,film}, set(partial), status() → string }.
// render(el) baut den Inhalt je Element einmal auf und aktualisiert danach nur Texte/Zustände (Fokus bleibt beim Umschalten erhalten).
const SWITCHES = [
  { key: 'on', label: 'Mehrspieler', note: 'Andere auf diesem Server sehen dich in der VIDEOTHEK.' },
  { key: 'name', label: 'Name zeigen', note: 'Dein Jellyfin-Benutzername über deiner Figur. Aus: andere sehen „Jemand“.' },
  { key: 'chat', label: 'Chat', note: '' },
  { key: 'film', label: 'Mein Film für andere sichtbar', note: 'Gilt auch für die Hülle in deiner Hand.' },
];

export function createPanel(api) {
  const views = new WeakMap();

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
  }

  function build(el) {
    el.textContent = '';
    const v = { rows: [], status: null };
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

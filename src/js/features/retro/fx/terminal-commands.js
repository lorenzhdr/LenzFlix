// LENZ//84 retro-fx: Befehle des geheimen Terminals. Parser und Ausführung sind unabhängig vom DOM:
// execute(line, ctx) arbeitet nur über ctx (print, clear, close, go, …) und ist daher testbar.
// Ausgaben sind reiner Text (der Aufrufer setzt ihn per textContent). Nie Tokens/IDs/URLs mit api_key ausgeben.

/** Befehlsname -> kanonischer Name. */
export const ALIASES = {
  hilfe: 'hilfe', help: 'hilfe', '?': 'hilfe',
  whoami: 'whoami',
  datum: 'datum', date: 'datum',
  uhr: 'uhr', time: 'uhr',
  ls: 'ls', dir: 'ls',
  suche: 'suche', search: 'suche',
  spiele: 'spiele', play: 'spiele',
  zufall: 'zufall', random: 'zufall',
  design: 'design', theme: 'design',
  sound: 'sound',
  crt: 'crt',
  regen: 'regen', rain: 'regen',
  overdrive: 'overdrive',
  hack: 'hack',
  reboot: 'reboot',
  clear: 'clear', cls: 'clear',
  exit: 'exit', quit: 'exit',
  lenz: 'lenz',
  sudo: 'sudo',
  42: '42',
  hallo: 'hallo', hello: 'hallo',
};

/** Befehle, die in der Hilfe stehen (versteckte fehlen absichtlich). */
export const HELP_LINES = [
  ['HILFE', 'DIESE LISTE'],
  ['WHOAMI', 'WER BIN ICH'],
  ['DATUM / UHR', 'DATUM UND UHRZEIT'],
  ['LS', 'BIBLIOTHEKEN AUFLISTEN'],
  ['SUCHE <TEXT>', 'MEDIATHEK DURCHSUCHEN'],
  ['SPIELE <TITEL>', 'KASSETTE LADEN'],
  ['ZUFALL', 'ZUFÄLLIGER FILM'],
  ['DESIGN <ID>', 'FLIX | PLUS | PRIME | RETRO'],
  ['SOUND AN|AUS', 'TON SCHALTEN'],
  ['CRT AN|AUS', 'BILDSCHIRM-EFFEKT'],
  ['REGEN', 'CODE-REGEN STARTEN'],
  ['OVERDRIVE', 'FARBRAUSCH'],
  ['HACK', 'ZUGRIFF ERZWINGEN (SPIEL)'],
  ['REBOOT', 'NEU STARTEN'],
  ['LENZ', 'LOGO'],
  ['CLEAR', 'BILDSCHIRM LEEREN'],
  ['EXIT', 'TERMINAL SCHLIESSEN'],
];

export const ASCII_LOGO = [
  ' _     _____ _   _ __________  ___   ___  _  _ ',
  '| |   | ____| \\ | |__  /__  / / _ \\ / _ \\| || |',
  '| |   |  _| |  \\| | / /   / / | (_) | (_) | || |_',
  '| |___| |___| |\\  |/ /_  / /_  > _ < > _ <|__   _|',
  '|_____|_____|_| \\_/____|/____|\\___/ \\___/    |_|  ',
];

/** Zeile in { cmd (kanonisch|null), name (Eingabe, klein), args (Text), argv } zerlegen. */
export function parseCommand(input) {
  const raw = String(input == null ? '' : input).trim();
  if (!raw) return { raw, cmd: null, name: '', args: '', argv: [] };
  const [first, ...rest] = raw.split(/\s+/);
  const name = first.toLowerCase();
  const args = raw.slice(first.length).trim();
  const cmd = Object.prototype.hasOwnProperty.call(ALIASES, name) ? ALIASES[name] : null;
  return { raw, cmd, name, args, argv: rest };
}

/** Tab-Vervollständigung: eindeutige Befehle, die mit prefix beginnen (alle Aliase außer versteckten). */
const COMPLETABLE = Object.keys(ALIASES).filter((k) => !['sudo', '42', 'hallo', 'hello', '?'].includes(k));
export function complete(prefix) {
  const p = String(prefix || '').toLowerCase();
  if (!p || /\s/.test(p)) return [];
  return COMPLETABLE.filter((k) => k.startsWith(p)).sort();
}

const pad2 = (n) => String(n).padStart(2, '0');
const WEEKDAYS = ['SONNTAG', 'MONTAG', 'DIENSTAG', 'MITTWOCH', 'DONNERSTAG', 'FREITAG', 'SAMSTAG'];

export function formatDate(d) {
  return `${WEEKDAYS[d.getDay()]}, ${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
}
export function formatTime(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** Hex-Zeile für den Hack-Effekt. rnd: () => [0,1). */
export function hexLine(rnd = Math.random) {
  const part = (n) => Array.from({ length: n }, () => Math.floor(rnd() * 256).toString(16).padStart(2, '0')).join(' ').toUpperCase();
  const addr = Math.floor(rnd() * 0xffff).toString(16).padStart(4, '0').toUpperCase();
  return `0x${addr}  ${part(8)}`;
}

export function progressBar(pct, width = 24) {
  const full = Math.round((Math.max(0, Math.min(100, pct)) / 100) * width);
  return `[${'#'.repeat(full)}${'.'.repeat(width - full)}] ${String(Math.round(pct)).padStart(3, ' ')}%`;
}

/**
 * ctx-Schnittstelle (alles optional außer print/error):
 *   print(text), error(text) (feuert error-Effekt), clear(), close(), go(href) (navigiert, schließt),
 *   sleep(ms) -> Promise<boolean> (false = Terminal wurde geschlossen), update(text) (letzte Zeile ersetzen, Rückgabe: Handle-Funktion),
 *   userName() -> Promise<string>, libraries() -> Promise<[{name}]>, searchTitles(q) -> Promise<[{id,name,year}]>,
 *   randomTitle() -> Promise<{id,name}|null>, setTheme(id), themeName(id), themes: string[], currentTheme(),
 *   getPref(name), setPref(name, v), unlockSound(), regen(), overdrive(), reboot(), now() -> Date, fx(name)
 *   searchHref(q), titleHref(id)
 */
export async function execute(line, ctx) {
  const p = parseCommand(line);
  if (!p.raw) return p;
  const out = (s) => ctx.print(s);

  switch (p.cmd) {
    case 'hilfe':
      out('VERFÜGBARE BEFEHLE:');
      for (const [a, b] of HELP_LINES) out(`  ${a.padEnd(16, ' ')} ${b}`);
      out('TAB = VERVOLLSTÄNDIGEN, PFEIL AUF/AB = VERLAUF.');
      break;
    case 'whoami': {
      let n;
      try { n = await ctx.userName(); } catch { n = ''; }
      out(n ? String(n).toUpperCase() : 'GAST');
      break;
    }
    case 'datum': out(formatDate(ctx.now())); break;
    case 'uhr': out(formatTime(ctx.now())); break;
    case 'ls': {
      let libs;
      try { libs = await ctx.libraries(); } catch { libs = []; }
      if (!libs.length) { out('KEINE BIBLIOTHEKEN GEFUNDEN.'); break; }
      out(`${libs.length} BIBLIOTHEK${libs.length === 1 ? '' : 'EN'}:`);
      for (const l of libs) out(`  <DIR>  ${String(l.name).toUpperCase()}`);
      break;
    }
    case 'suche': {
      if (!p.args) { ctx.error('GIB EINEN SUCHBEGRIFF AN: SUCHE <TEXT>'); break; }
      out(`SUCHE NACH "${p.args}" ...`);
      ctx.go(ctx.searchHref(p.args));
      break;
    }
    case 'spiele': {
      if (!p.args) { ctx.error('WELCHE KASSETTE? SPIELE <TITEL>'); break; }
      out(`SUCHE KASSETTE "${p.args}" ...`);
      let hits;
      try { hits = await ctx.searchTitles(p.args); } catch { hits = []; }
      if (!hits.length) { ctx.error(`KEINE KASSETTE GEFUNDEN: ${p.args}`); break; }
      const best = hits[0];
      out(`GEFUNDEN: ${String(best.name).toUpperCase()}${best.year ? ` (${best.year})` : ''}`);
      out('LADE KASSETTE ...');
      ctx.go(ctx.titleHref(best.id));
      break;
    }
    case 'zufall': {
      out('ZIEHE ZUFALLSKASSETTE ...');
      let pick;
      try { pick = await ctx.randomTitle(); } catch { pick = null; }
      if (!pick) { ctx.error('NICHTS GEFUNDEN. IST DIE MEDIATHEK LEER?'); break; }
      out(`GEZOGEN: ${String(pick.name).toUpperCase()}`);
      out('LADE KASSETTE ...');
      ctx.go(ctx.titleHref(pick.id));
      break;
    }
    case 'design': {
      const id = p.argv[0] ? p.argv[0].toLowerCase() : '';
      if (!id) {
        out(`AKTUELL: ${ctx.themeName(ctx.currentTheme())}`);
        out(`VERFÜGBAR: ${ctx.themes.join(' | ').toUpperCase()}`);
        break;
      }
      if (!ctx.themes.includes(id)) { ctx.error(`UNBEKANNTES DESIGN: ${id}. VERFÜGBAR: ${ctx.themes.join(', ')}`); break; }
      if (id === ctx.currentTheme()) { out('DIESES DESIGN IST BEREITS AKTIV.'); break; }
      out(`WECHSLE ZU ${ctx.themeName(id)} ... DAS TERMINAL WIRD GESCHLOSSEN.`);
      await ctx.sleep(500);
      ctx.close();
      await ctx.setTheme(id);
      break;
    }
    case 'sound':
    case 'crt': {
      const arg = (p.argv[0] || '').toLowerCase();
      const label = p.cmd === 'sound' ? 'SOUND' : 'CRT';
      const on = ['an', 'on', '1', 'ein'].includes(arg);
      const off = ['aus', 'off', '0'].includes(arg);
      if (!on && !off) {
        out(`${label}: ${ctx.getPref(p.cmd) ? 'AN' : 'AUS'}. NUTZUNG: ${label} AN|AUS`);
        break;
      }
      ctx.setPref(p.cmd, on);
      if (p.cmd === 'sound' && on) ctx.unlockSound();
      out(`${label}: ${on ? 'AN' : 'AUS'}`);
      break;
    }
    case 'regen':
      out('CODE-REGEN STARTET ... TASTE ZUM BEENDEN.');
      await ctx.sleep(400);
      ctx.close();
      ctx.regen();
      break;
    case 'overdrive':
      out('>> OVERDRIVE <<');
      ctx.overdrive();
      break;
    case 'hack': await runHack(ctx); break;
    case 'reboot':
      out('SYSTEM WIRD NEU GESTARTET ...');
      await ctx.sleep(500);
      ctx.close();
      ctx.reboot();
      break;
    case 'clear': ctx.clear(); break;
    case 'exit': ctx.close(); break;
    case 'lenz':
      for (const l of ASCII_LOGO) out(l);
      out('LENZ//84 :: MEDIATHEK-TERMINAL');
      break;
    case 'sudo': ctx.error('NETTER VERSUCH.'); break;
    case '42': out('DIE ANTWORT. NUR WIE LAUTET DIE FRAGE?'); break;
    case 'hallo': {
      let n;
      try { n = await ctx.userName(); } catch { n = ''; }
      out(`HALLO${n ? `, ${String(n).toUpperCase()}` : ''}. SCHÖN, DASS DU DA BIST.`);
      break;
    }
    default:
      ctx.error(`BEFEHL NICHT GEFUNDEN: ${p.name}. TIPPE 'HILFE'.`);
  }
  return p;
}

/** Rein kosmetische Fake-Hacking-Animation. */
export async function runHack(ctx, { rnd = Math.random } = {}) {
  ctx.print('VERBINDE MIT MAINFRAME ...');
  if (!(await ctx.sleep(500))) return;
  for (let i = 0; i < 14; i++) {
    ctx.print(hexLine(rnd));
    if (!(await ctx.sleep(60))) return;
  }
  const upd = ctx.print(progressBar(0));
  for (let pct = 0; pct <= 100; pct += 10) {
    if (typeof upd === 'function') upd(progressBar(pct));
    if (!(await ctx.sleep(110))) return;
  }
  for (let i = 0; i < 8; i++) {
    ctx.print(hexLine(rnd));
    if (!(await ctx.sleep(45))) return;
  }
  ctx.print('>> ZUGRIFF GEWÄHRT <<', 'ok');
  ctx.print('(ALLES NUR SPIELERI. NIEMAND WURDE GEHACKT.)');
}

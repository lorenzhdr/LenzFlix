// LenzFlix build: CSS via lightningcss, JS via esbuild -> dist/
import { bundleAsync } from 'lightningcss';
import { build, context } from 'esbuild';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const watch = process.argv.includes('--watch');
// Explizite Targets (browserslistToTargets erwartet aufgelöste Browserslist-Ergebnisse, keine Query-Strings)
// chrome/android 53 = LG webOS 4.x (Jellyfin-App): sonst minifiziert lightningcss Farben zu #rrggbbaa/#rgba
// (erst ab Chrome 62), und alte TV-Engines verwerfen ganze Deklarationen (z. B. Fokusring, Tab-Pillen).
// Für moderne Browser ist die Ausgabe gleichwertig (rgba() statt Hex-Alpha, top/right/bottom/left statt inset).
const targets = { chrome: 53 << 16, safari: 15 << 16, firefox: 100 << 16, android: 53 << 16, ios_saf: 15 << 16 };

// Font/asset URLs in src/css/*.css are written relative to dist/ (../assets/fonts/x.woff2),
// so that they stay valid in the bundled output without rewriting.
// Kern-CSS + Design-CSS (LENZ+ / LENZPRIME werden per JS nachgeladen, siehe core/themecss.js).
const cssEntries = [
  ['src/css/index.css', 'lenzflix'],
  ['src/css/themes/plus/index.css', 'lenzplus'],
  ['src/css/themes/prime/index.css', 'lenzprime'],
  ['src/css/themes/retro/index.css', 'lenzretro'],
  ['src/css/themes/store/index.css', 'lenzstore'],
  ['src/css/tvmode/index.css', 'lenztvmode'], // TV-Modus (flix/plus/prime/retro, lazy über core/addoncss.js, docs/tvmode.md)
];

// Zeilenenden normalisieren: lightningcss übernimmt unaufgelöste Werte (z. B. mehrzeilige var()-Listen) roh.
// Bei CRLF-Arbeitskopien (Windows, core.autocrlf) landete sonst ein CR in dist/ (Build nicht reproduzierbar).
const resolver = { read: (file) => readFileSync(file, 'utf8').replace(/\r\n?/g, '\n') };

async function buildCss() {
  for (const [file, name] of cssEntries) {
    const entry = resolve(root, file);
    for (const minify of [false, true]) {
      const { code } = await bundleAsync({ filename: entry, minify, targets, resolver });
      writeFileSync(resolve(dist, minify ? `${name}.min.css` : `${name}.css`), code);
    }
  }
}

// JS-Bundles: Hauptbundle (immer geladen) + 3D-Bundle der VIDEOTHEK LENZ und TV-Modus-Engine (lazy, siehe core/themejs.js, docs/store3d.md, docs/tvmode.md).
const jsEntries = [
  ['src/js/main.js', 'lenzflix'],
  ['src/js/store3d/entry.js', 'lenzstore'],
  ['src/js/tv/tvmode/entry.js', 'lenztvmode'], // TV-Modus: Engine (lazy, docs/tvmode.md)
];

async function buildJs() {
  const common = { bundle: true, format: 'iife', target: 'es2020', logLevel: 'info' };
  if (watch) {
    for (const [file, name] of jsEntries) {
      const c = await context({ ...common, entryPoints: [resolve(root, file)], outfile: resolve(dist, `${name}.js`) });
      await c.watch();
    }
    return;
  }
  for (const [file, name] of jsEntries) {
    await build({ ...common, entryPoints: [resolve(root, file)], outfile: resolve(dist, `${name}.js`) });
    await build({ ...common, entryPoints: [resolve(root, file)], minify: true, outfile: resolve(dist, `${name}.min.js`) });
  }
}

// Wächter: das Hauptbundle darf three.js nie enthalten (3D nur im lazy Bundle).
// 1.11.0: 420 → 440 KiB (Ladebild, Player-Hintergrund, Startseiten-Umbau; die Startseite spart dafür Netzwerk-Sekunden).
// 1.13.0: 440 → 496 KiB (Serien-/Filme-Seite, Meine Liste, Geheimmenü).
const MAIN_MIN_BUDGET = 496 * 1024;
function checkMainBundle() {
  const code = readFileSync(resolve(dist, 'lenzflix.min.js'), 'utf8');
  if (/WebGLRenderer|THREE\.REVISION|three\.module/.test(code)) {
    throw new Error('dist/lenzflix.min.js enthält three.js – das 3D-Bundle darf nur lazy geladen werden');
  }
  if (code.includes('__LFX_TVMODE_ENGINE__')) {
    throw new Error('dist/lenzflix.min.js enthält die TV-Modus-Engine – sie darf nur lazy (lenztvmode.min.js) geladen werden');
  }
  if (code.length > MAIN_MIN_BUDGET) console.warn(`WARNUNG: lenzflix.min.js ist ${code.length} B (Budget ${MAIN_MIN_BUDGET} B)`);
}

// Wächter: die TV-Modus-Engine enthält keine Klassen des entfernten LENZ-LIVE-Designs (lfx-live-) und bleibt unter 128 KiB.
const TVMODE_MIN_BUDGET = 128 * 1024; // 1.11.5: +Vorwärmen (lazy Engine); 1.11.6: +fMP4 pro Titel, Gründe, Formatprüfung (Nutzer-OK bis 128 KiB)
function checkTvModeBundle() {
  const code = readFileSync(resolve(dist, 'lenztvmode.min.js'), 'utf8');
  if (code.includes('lfx-live-')) {
    throw new Error('dist/lenztvmode.min.js enthält lfx-live-Klassen des entfernten LENZ-LIVE-Designs – der TV-Modus darf diese nie ausliefern');
  }
  if (code.length > TVMODE_MIN_BUDGET) console.warn(`WARNUNG: lenztvmode.min.js ist ${code.length} B (Budget ${TVMODE_MIN_BUDGET} B)`);
}

// Soft-Budget des 3D-Bundles (VIDEOTHEK LENZ, lazy): nur eine Warnung, kein Abbruch.
// 1.15.0: Open World (Stadt, LENZ PALAST, Richard, Physik, Figuren, Autos, Entdeckungen) → 1,16 MB (vorher ca. 0,90 MB); Richtwert 1,25 MB.
const STORE_MIN_BUDGET = 1250 * 1000;
function checkStoreBundle() {
  const code = readFileSync(resolve(dist, 'lenzstore.min.js'), 'utf8');
  if (code.length > STORE_MIN_BUDGET) console.warn(`WARNUNG: lenzstore.min.js ist ${code.length} B (Budget ${STORE_MIN_BUDGET} B)`);
}

mkdirSync(dist, { recursive: true });
await buildCss();
await buildJs();
if (watch) {
  const { watch: fsWatch } = await import('node:fs');
  // Entprellt und serialisiert: ein laufender Build wird nie ueberlappt, Ereignisse waehrenddessen merken genau einen Folgelauf vor.
  let timer = null;
  let running = false;
  let again = false;
  const run = async () => {
    if (running) { again = true; return; }
    running = true;
    try {
      await buildCss();
      console.log('css rebuilt');
    } catch (e) {
      console.error(e.message);
    }
    running = false;
    if (again) { again = false; run(); }
  };
  fsWatch(resolve(root, 'src/css'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(run, 100);
  });
  console.log('watching…');
} else {
  checkMainBundle();
  checkTvModeBundle();
  checkStoreBundle();
  console.log(`built dist/ (${readFileSync(resolve(dist, 'lenzflix.min.css')).length} B css min)`);
}

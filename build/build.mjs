// LenzFlix build: CSS via lightningcss, JS via esbuild -> dist/
import { bundle } from 'lightningcss';
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
];

function buildCss() {
  for (const [file, name] of cssEntries) {
    const entry = resolve(root, file);
    for (const minify of [false, true]) {
      const { code } = bundle({ filename: entry, minify, targets });
      writeFileSync(resolve(dist, minify ? `${name}.min.css` : `${name}.css`), code);
    }
  }
}

// JS-Bundles: Hauptbundle (immer geladen) + 3D-Bundle der VIDEOTHEK LENZ (lazy, siehe core/themejs.js, docs/store3d.md).
const jsEntries = [
  ['src/js/main.js', 'lenzflix'],
  ['src/js/store3d/entry.js', 'lenzstore'],
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
const MAIN_MIN_BUDGET = 420 * 1024;
function checkMainBundle() {
  const code = readFileSync(resolve(dist, 'lenzflix.min.js'), 'utf8');
  if (/WebGLRenderer|THREE\.REVISION|three\.module/.test(code)) {
    throw new Error('dist/lenzflix.min.js enthält three.js – das 3D-Bundle darf nur lazy geladen werden');
  }
  if (code.length > MAIN_MIN_BUDGET) console.warn(`WARNUNG: lenzflix.min.js ist ${code.length} B (Budget ${MAIN_MIN_BUDGET} B)`);
}

mkdirSync(dist, { recursive: true });
buildCss();
await buildJs();
if (watch) {
  const { watch: fsWatch } = await import('node:fs');
  fsWatch(resolve(root, 'src/css'), { recursive: true }, () => {
    try { buildCss(); console.log('css rebuilt'); } catch (e) { console.error(e.message); }
  });
  console.log('watching…');
} else {
  checkMainBundle();
  console.log(`built dist/ (${readFileSync(resolve(dist, 'lenzflix.min.css')).length} B css min)`);
}

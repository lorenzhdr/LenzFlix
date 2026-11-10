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

async function buildJs() {
  const common = {
    entryPoints: [resolve(root, 'src/js/main.js')],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    logLevel: 'info',
  };
  if (watch) {
    const c1 = await context({ ...common, outfile: resolve(dist, 'lenzflix.js') });
    await c1.watch();
    return;
  }
  await build({ ...common, outfile: resolve(dist, 'lenzflix.js') });
  await build({ ...common, minify: true, outfile: resolve(dist, 'lenzflix.min.js') });
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
  console.log(`built dist/ (${readFileSync(resolve(dist, 'lenzflix.min.css')).length} B css min)`);
}

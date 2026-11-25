// Importgrenze der Server-Statistik: src/js/serverstats/ importiert nur relativ und bleibt im Ordner; außen importiert niemand hinein.
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srvDir = join(root, 'src', 'js', 'serverstats');
const hasDir = existsSync(srvDir);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Alle Importziele einer Datei (static import/export from, dynamic import(), side-effect import). */
function specifiers(code) {
  const out = [];
  const re = /(?:\bimport\s*(?:[^'"()]*?\bfrom\s*)?|\bexport\s[^'"();]*?\bfrom\s*|\bimport\s*\(\s*)(['"])([^'"]+)\1/g;
  let m;
  while ((m = re.exec(code))) out.push(m[2]);
  return out;
}

const inside = (file) => {
  const rel = relative(srvDir, file);
  return !rel.startsWith('..') && !isAbsolute(rel);
};

describe.skipIf(!hasDir)('Server-Statistik: Importgrenze', () => {
  it('Dateien in src/js/serverstats/ importieren nur relativ und innerhalb des Ordners', () => {
    const bad = [];
    for (const f of walk(srvDir)) {
      for (const spec of specifiers(readFileSync(f, 'utf8'))) {
        if (!spec.startsWith('./') && !spec.startsWith('../')) { bad.push(`${relative(root, f)}: ${spec} (nicht relativ)`); continue; }
        const target = resolve(dirname(f), spec);
        if (!inside(target)) bad.push(`${relative(root, f)}: ${spec} (außerhalb)`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('kein Modul außerhalb importiert aus src/js/serverstats/', () => {
    const bad = [];
    const dirs = [join(root, 'src', 'js'), join(root, 'build')];
    for (const base of dirs) {
      if (!existsSync(base)) continue;
      for (const f of walk(base)) {
        if (inside(f)) continue;
        for (const spec of specifiers(readFileSync(f, 'utf8'))) {
          if (!spec.startsWith('.')) continue;
          const target = resolve(dirname(f), spec);
          if (inside(target) || target.split(sep).join('/').includes('/serverstats/')) bad.push(`${relative(root, f)}: ${spec}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('Server-Statistik: Hülle', () => {
  it('die Hülle im Hauptbundle importiert nichts aus src/js/serverstats/', () => {
    const f = join(root, 'src', 'js', 'features', 'secretmenu', 'serverstats.js');
    const bad = specifiers(readFileSync(f, 'utf8')).filter((s) => s.includes('serverstats/'));
    expect(bad).toEqual([]);
  });
});

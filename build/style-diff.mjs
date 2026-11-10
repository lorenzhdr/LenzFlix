/*
 * LENZFLIX Style-Diff
 *
 * Vergleicht zwei Snapshots aus build/style-snapshot.js (gleiche Seite, gleiche Fensterbreite).
 *
 *   node build/style-diff.mjs <alt.json> <neu.json> [--ignore=prop1,prop2]
 *
 * Gibt geänderte/neue/fehlende Selektoren und Properties tabellarisch aus.
 * Exit-Code 0 = identisch, 1 = Unterschiede, 2 = Aufruf-/Lesefehler.
 * --ignore: Property-Namen (z. B. width,height) oder Variablennamen (--lfx-foo), die ausgeklammert werden.
 */
import { readFileSync } from 'node:fs';
import { diffSnapshots, formatDiff } from './style-diff-lib.mjs';

function load(file) {
  let txt = readFileSync(file, 'utf8');
  if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
  let data = JSON.parse(txt);
  if (typeof data === 'string') data = JSON.parse(data); // doppelt kodierter String vom javascript_tool
  return data;
}

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith('--'));
const ignoreArg = args.find((a) => a.startsWith('--ignore='));
const ignore = ignoreArg ? ignoreArg.slice('--ignore='.length).split(',') : [];

if (files.length !== 2) {
  console.error('Aufruf: node build/style-diff.mjs <alt.json> <neu.json> [--ignore=prop1,prop2]');
  process.exit(2);
}

let diffs;
try {
  diffs = diffSnapshots(load(files[0]), load(files[1]), { ignore });
} catch (e) {
  console.error('Fehler beim Lesen der Snapshots:', e.message);
  process.exit(2);
}
console.log(formatDiff(diffs));
process.exit(diffs.length ? 1 : 0);

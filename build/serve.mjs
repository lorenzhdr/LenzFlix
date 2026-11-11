// Dev-Server: liefert das Projekt (dist/, assets/) mit CORS + Local-Network-Access-Headern aus,
// damit der Jellyfin-Test-Tab (https) die Dateien per <link>/<script> von http://localhost laden kann.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 5179);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const allowed = ['dist', 'assets'];
// Nur diese Dateien aus build/ (Dev-Harness der VIDEOTHEK LENZ, docs/store3d.md; Kurz-Loader für Konsole/Lesezeichen)
// – sonst wird aus build/ nichts ausgeliefert.
const extra = { '/store-dev.html': 'build/store-dev.html', '/store-dev.js': 'build/store-dev.js', '/boot.js': 'build/dev-boot.js',
  // VR-Kino-Harness: echte Bridge der Hülle (Modul) und der lokale Emulator (nur .tmp/, nie im Repo; fehlt er, gibt es 404)
  '/cinema-bridge.js': 'src/js/features/store/cinema-bridge.js', '/xr-emu.js': '.tmp/xr-emu.js' };

createServer(async (req, res) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Private-Network': 'true',
    'Cache-Control': 'no-store',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, headers); return res.end(); }
  const rawPath = new URL(req.url, 'http://x').pathname;
  const path = extra[rawPath] || normalize(decodeURIComponent(rawPath)).replace(/^[\\/]+/, '');
  const top = path.split(/[\\/]/)[0];
  if (!extra[rawPath] && (!allowed.includes(top) || path.includes('..'))) {
    res.writeHead(404, headers); return res.end('not found');
  }
  try {
    const body = await readFile(resolve(root, path));
    res.writeHead(200, { ...headers, 'Content-Type': types[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404, headers); res.end('not found'); }
}).listen(port, '127.0.0.1', () => console.log(`LenzFlix dev server: http://localhost:${port}/dist/`));

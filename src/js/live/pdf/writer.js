// Minimaler PDF-1.4-Schreiber (keine Fremdbibliothek): Seiten, Text (Standard-14-Schriften, WinAnsi), Linien, Rechtecke, JPEG-Bilder.
// API-Koordinaten: Ursprung oben links, y nach unten, Einheit pt. Farben als 0–255 (oder '#rrggbb').
// Die Basisschrift-Namen stehen nur in dieser Datei.
import { encodeWinAnsi } from './winansi.js';

const BASE = {
  'sans': 'Helvetica',
  'sans-bold': 'Helvetica-Bold',
  'serif': 'Times-Roman',
  'serif-bold': 'Times-Bold',
  'mono': 'Courier',
};
const FONT_KEYS = Object.keys(BASE);

/** Zahl für Content-Streams: höchstens 3 Nachkommastellen, kein Exponent. */
function num(n) {
  n = Number(n);
  if (!Number.isFinite(n)) return '0';
  const s = (Math.round(n * 1000) / 1000).toFixed(3).replace(/\.?0+$/, '');
  return s === '-0' || s === '' ? '0' : s;
}

function color(r, g, b) {
  if (typeof r === 'string') {
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(r);
    if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)].map((v) => num(v / 255)).join(' ');
    return '0 0 0';
  }
  const c = (v) => num(Math.max(0, Math.min(255, Number(v) || 0)) / 255);
  return c(r) + ' ' + c(g) + ' ' + c(b);
}

/** WinAnsi-Bytes als PDF-Literalstring; ( ) \ und alles außerhalb 0x20–0x7E werden maskiert (Ergebnis rein ASCII). */
function pdfString(str) {
  const b = encodeWinAnsi(str);
  let s = '(';
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c === 0x28 || c === 0x29 || c === 0x5c) s += '\\' + String.fromCharCode(c);
    else if (c < 0x20 || c > 0x7e) s += '\\' + c.toString(8).padStart(3, '0');
    else s += String.fromCharCode(c);
  }
  return s + ')';
}

/** Breite, Höhe, Komponenten aus dem ersten SOF-Marker; ungültig → null. */
export function parseJpeg(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue; }
    let m = bytes[i + 1];
    if (m === 0xff) { i++; continue; } // Füllbytes
    i += 2;
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) continue; // ohne Länge
    if (m === 0xd9 || m === 0xda) return null; // EOI/SOS vor SOF
    const len = (bytes[i] << 8) | bytes[i + 1];
    if (len < 2 || i + len > bytes.length) return null;
    if (m === 0xc0 || m === 0xc1 || m === 0xc2) {
      if (len < 8) return null;
      const precision = bytes[i + 2];
      const height = (bytes[i + 3] << 8) | bytes[i + 4];
      const width = (bytes[i + 5] << 8) | bytes[i + 6];
      const comps = bytes[i + 7];
      if (precision !== 8 || !width || !height || (comps !== 1 && comps !== 3 && comps !== 4)) return null;
      return { width, height, comps };
    }
    i += len;
  }
  return null;
}

const ascii = (s) => {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
};

/** createPdf({ title? }) → { addPage(w,h) → Page, addJpeg(bytes) → imgRef|null, toBytes() → Uint8Array } */
export function createPdf(opts = {}) {
  const pages = [];
  const images = [];
  const title = opts && opts.title ? String(opts.title) : '';

  function addJpeg(bytes) {
    const info = parseJpeg(bytes);
    if (!info) return null;
    const ref = { index: images.length, name: 'Im' + (images.length + 1), ...info, bytes };
    images.push(ref);
    return ref;
  }

  function addPage(w, h) {
    const W = Number(w) || 595;
    const H = Number(h) || 842;
    const ops = [];
    const used = new Set();
    const usedImgs = new Set();
    const page = {
      width: W,
      height: H,
      setFill(r, g, b) { ops.push(color(r, g, b) + ' rg'); },
      setStroke(r, g, b) { ops.push(color(r, g, b) + ' RG'); },
      rect(x, y, rw, rh, o = {}) {
        const stroke = !!o.stroke;
        const fill = o.fill === undefined ? !stroke : !!o.fill;
        if (!fill && !stroke) return;
        if (stroke && o.lineWidth) ops.push(num(o.lineWidth) + ' w');
        ops.push(num(x) + ' ' + num(H - y - rh) + ' ' + num(rw) + ' ' + num(rh) + ' re ' + (fill && stroke ? 'B' : fill ? 'f' : 'S'));
      },
      line(x1, y1, x2, y2, lw = 1) {
        ops.push(num(lw) + ' w ' + num(x1) + ' ' + num(H - y1) + ' m ' + num(x2) + ' ' + num(H - y2) + ' l S');
      },
      text(str, x, y, o = {}) {
        const font = FONT_KEYS.includes(o.font) ? o.font : 'sans';
        const size = Number(o.size) || 10;
        used.add(font);
        ops.push('BT /F' + (FONT_KEYS.indexOf(font) + 1) + ' ' + num(size) + ' Tf ' + num(x) + ' ' + num(H - y) + ' Td ' + pdfString(str) + ' Tj ET');
      },
      image(ref, x, y, iw, ih) {
        if (!ref || !ref.name) return;
        usedImgs.add(ref.index);
        ops.push('q ' + num(iw) + ' 0 0 ' + num(ih) + ' ' + num(x) + ' ' + num(H - y - ih) + ' cm /' + ref.name + ' Do Q');
      },
      _ops: ops,
      _imgs: usedImgs,
    };
    pages.push(page);
    return page;
  }

  function toBytes() {
    // Nummern: 1 Catalog, 2 Pages, 3 Info, 4..8 Schriften, dann Bilder, dann je Seite (Seite, Inhalt).
    const fontNo = (k) => 4 + k;
    const imgNo = (i) => 4 + FONT_KEYS.length + i;
    const pageBase = 4 + FONT_KEYS.length + images.length;
    const pageNo = (p) => pageBase + p * 2;

    const chunks = [];
    const offsets = [];
    let pos = 0;
    const push = (b) => { chunks.push(b); pos += b.length; };
    const pushStr = (s) => push(ascii(s));
    const beginObj = (n) => { offsets[n] = pos; pushStr(n + ' 0 obj\n'); };
    const endObj = () => pushStr('\nendobj\n');

    pushStr('%PDF-1.4\n');
    push(Uint8Array.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // Binärkommentar

    beginObj(1);
    pushStr('<< /Type /Catalog /Pages 2 0 R >>');
    endObj();

    beginObj(2);
    pushStr('<< /Type /Pages /Count ' + pages.length + ' /Kids [' + pages.map((_, i) => pageNo(i) + ' 0 R').join(' ') + '] >>');
    endObj();

    beginObj(3);
    pushStr('<< /Producer ' + pdfString('LENZ LIVE') + (title ? ' /Title ' + pdfString(title) : '') + ' >>');
    endObj();

    FONT_KEYS.forEach((k, i) => {
      beginObj(fontNo(i));
      pushStr('<< /Type /Font /Subtype /Type1 /BaseFont /' + BASE[k] + ' /Encoding /WinAnsiEncoding >>');
      endObj();
    });

    images.forEach((im, i) => {
      beginObj(imgNo(i));
      const cs = im.comps === 1 ? '/DeviceGray' : im.comps === 4 ? '/DeviceCMYK' : '/DeviceRGB';
      const dec = im.comps === 4 ? ' /Decode [1 0 1 0 1 0 1 0]' : '';
      pushStr('<< /Type /XObject /Subtype /Image /Width ' + im.width + ' /Height ' + im.height + ' /ColorSpace ' + cs + dec +
        ' /BitsPerComponent 8 /Filter /DCTDecode /Length ' + im.bytes.length + ' >>\nstream\n');
      push(im.bytes);
      pushStr('\nendstream');
      endObj();
    });

    pages.forEach((p, i) => {
      const fonts = FONT_KEYS.map((_, k) => '/F' + (k + 1) + ' ' + fontNo(k) + ' 0 R').join(' ');
      const xo = [...p._imgs].sort((a, b) => a - b).map((idx) => '/' + images[idx].name + ' ' + imgNo(idx) + ' 0 R').join(' ');
      beginObj(pageNo(i));
      pushStr('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + num(p.width) + ' ' + num(p.height) + '] /Resources << /Font << ' + fonts + ' >>' +
        (xo ? ' /XObject << ' + xo + ' >>' : '') + ' >> /Contents ' + (pageNo(i) + 1) + ' 0 R >>');
      endObj();
      const content = p._ops.join('\n');
      beginObj(pageNo(i) + 1);
      pushStr('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
      endObj();
    });

    const size = pageBase + pages.length * 2;
    const xrefPos = pos;
    let x = 'xref\n0 ' + size + '\n0000000000 65535 f \n';
    for (let n = 1; n < size; n++) x += String(offsets[n]).padStart(10, '0') + ' 00000 n \n';
    pushStr(x);
    pushStr('trailer\n<< /Size ' + size + ' /Root 1 0 R /Info 3 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF\n');

    const out = new Uint8Array(pos);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  return { addPage, addJpeg, toBytes };
}

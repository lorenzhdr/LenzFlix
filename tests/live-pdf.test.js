// LENZ LIVE Fernsehzeitung: PDF-Schreiber, WinAnsi, Metriken, Renderer (ohne DOM/Netzwerk).
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createPdf, parseJpeg } from '../src/js/live/pdf/writer.js';
import { encodeWinAnsi } from '../src/js/live/pdf/winansi.js';
import { textWidth, wrap, ellipsize } from '../src/js/live/pdf/metrics.js';
import { renderMagazinePdf } from '../src/js/live/pdf/render.js';

const latin1 = (b) => {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
};

/** Kleinstes gültiges JPEG-Gerüst (SOI, SOF, EOI); der Schreiber prüft nur den Rahmen. */
function jpegBytes({ marker = 0xc0, w = 3, h = 2, comps = 3, precision = 8 } = {}) {
  const sof = [0xff, marker, 0, 8 + comps * 3, precision, h >> 8, h & 255, w >> 8, w & 255, comps];
  for (let i = 0; i < comps; i++) sof.push(i + 1, 0x11, 0);
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0x4a, 0x46, ...sof, 0xff, 0xd9]);
}

describe('winansi', () => {
  it('ASCII und Latin-1 direkt, cp1252-Sonderzeichen', () => {
    expect([...encodeWinAnsi('Az')]).toEqual([0x41, 0x7a]);
    expect([...encodeWinAnsi('äöüßÄÖÜ')]).toEqual([0xe4, 0xf6, 0xfc, 0xdf, 0xc4, 0xd6, 0xdc]);
    expect([...encodeWinAnsi('é')]).toEqual([0xe9]);
    expect([...encodeWinAnsi('„“–—…•€™')]).toEqual([0x84, 0x93, 0x96, 0x97, 0x85, 0x95, 0x80, 0x99]);
    expect([...encodeWinAnsi('‚‘’”š›œžŸ')]).toEqual([0x82, 0x91, 0x92, 0x94, 0x9a, 0x9b, 0x9c, 0x9e, 0x9f]);
  });
  it('Unbekanntes: Akzent entfernen, sonst ?, Steuerzeichen → Leerzeichen', () => {
    expect([...encodeWinAnsi('ő')]).toEqual([0x6f]);
    expect([...encodeWinAnsi('ł')]).toEqual([0x3f]); // keine Zerlegung möglich → ?
    expect([...encodeWinAnsi('★')]).toEqual([0x3f]);
    expect([...encodeWinAnsi('😀')]).toEqual([0x3f]);
    expect([...encodeWinAnsi('a\tb\nc')]).toEqual([0x61, 0x20, 0x62, 0x20, 0x63]);
    expect(encodeWinAnsi(null)).toHaveLength(0);
  });
});

describe('metrics (Werte aus den Adobe-Core-14-AFM)', () => {
  it('Helvetica', () => {
    expect(textWidth('A', 'sans', 1000)).toBe(667);
    expect(textWidth('a', 'sans', 1000)).toBe(556);
    expect(textWidth(' ', 'sans', 1000)).toBe(278);
    expect(textWidth('ä', 'sans', 1000)).toBe(556);
    expect(textWidth('ß', 'sans', 1000)).toBe(611);
    expect(textWidth('A', 'sans', 10)).toBeCloseTo(6.67, 5);
  });
  it('Helvetica-Bold, Times, Courier', () => {
    expect(textWidth('A', 'sans-bold', 1000)).toBe(722);
    expect(textWidth('A', 'serif', 1000)).toBe(722);
    expect(textWidth(' ', 'serif', 1000)).toBe(250);
    expect(textWidth('ä', 'serif-bold', 1000)).toBe(500);
    expect(textWidth('ß', 'serif-bold', 1000)).toBe(556);
    expect(textWidth('abc', 'mono', 10)).toBe(18);
  });
  it('wrap: Wortumbruch, überlange Wörter hart, leer → []', () => {
    const w = textWidth('Hallo Welt', 'sans', 10);
    expect(wrap('Hallo Welt wie geht', 'sans', 10, w + 1)).toEqual(['Hallo Welt', 'wie geht']);
    expect(wrap('', 'sans', 10, 100)).toEqual([]);
    const lines = wrap('Donaudampfschifffahrtsgesellschaft', 'sans', 10, 60);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('Donaudampfschifffahrtsgesellschaft');
    for (const l of lines) expect(textWidth(l, 'sans', 10)).toBeLessThanOrEqual(60);
  });
  it('ellipsize', () => {
    expect(ellipsize('Kurz', 'sans', 10, 100)).toBe('Kurz');
    const e = ellipsize('Ein sehr langer Titel der nicht passt', 'sans', 10, 60);
    expect(e.endsWith('…')).toBe(true);
    expect(textWidth(e, 'sans', 10)).toBeLessThanOrEqual(60);
  });
});

describe('writer', () => {
  function sample() {
    const pdf = createPdf({ title: 'Test (1)' });
    const p = pdf.addPage(595, 842);
    p.setFill(255, 0, 0);
    p.rect(10, 10, 100, 50, { fill: true, stroke: true });
    p.setStroke(0, 0, 0);
    p.line(0, 0, 100, 100, 2);
    p.text('Grüße (a) \\ „x“ – 5 €', 20, 40, { font: 'serif-bold', size: 12 });
    p.text('Zeile', 20, 60, { font: 'sans', size: 9 });
    pdf.addPage(300, 400).text('Seite 2', 10, 20, { font: 'mono', size: 8 });
    return pdf.toBytes();
  }

  it('Header, Binärkommentar, EOF, startxref', () => {
    const b = sample();
    const s = latin1(b);
    expect(s.startsWith('%PDF-1.4\n')).toBe(true);
    expect(b[9]).toBe(0x25);
    expect(b[10]).toBeGreaterThanOrEqual(0x80);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    const sx = /startxref\n(\d+)\n%%EOF/.exec(s);
    expect(sx).toBeTruthy();
    expect(s.slice(Number(sx[1]), Number(sx[1]) + 4)).toBe('xref');
  });

  it('xref: je Zeile 20 Bytes, Offsets zeigen auf „n 0 obj“', () => {
    const b = sample();
    const s = latin1(b);
    const xpos = Number(/startxref\n(\d+)/.exec(s)[1]);
    const head = /^xref\n0 (\d+)\n/.exec(s.slice(xpos));
    const size = Number(head[1]);
    const start = xpos + head[0].length;
    const table = s.slice(start, start + size * 20);
    expect(table.length).toBe(size * 20);
    expect(table.slice(0, 20)).toBe('0000000000 65535 f \n');
    for (let n = 1; n < size; n++) {
      const line = table.slice(n * 20, n * 20 + 20);
      expect(line).toMatch(/^\d{10} 00000 n \n$/);
      const off = Number(line.slice(0, 10));
      expect(s.slice(off, off + (n + ' 0 obj').length)).toBe(n + ' 0 obj');
    }
    expect(s).toContain('/Size ' + size);
  });

  it('/Count, Producer, Title, Standard-14 mit WinAnsiEncoding', () => {
    const s = latin1(sample());
    expect(s).toContain('/Count 2');
    expect(s).toContain('/Producer (LENZ LIVE)');
    expect(s).toContain('/Title (Test \\(1\\))');
    for (const f of ['Helvetica', 'Helvetica-Bold', 'Times-Roman', 'Times-Bold', 'Courier']) expect(s).toContain('/BaseFont /' + f + ' /Encoding /WinAnsiEncoding');
    expect(s).toContain('/MediaBox [0 0 595 842]');
    expect(s).toContain('/MediaBox [0 0 300 400]');
  });

  it('/Length entspricht der echten Byte-Länge des Streams', () => {
    const s = latin1(sample());
    const re = /<< \/Length (\d+) >>\nstream\n/g;
    let m;
    let n = 0;
    while ((m = re.exec(s))) {
      const from = m.index + m[0].length;
      expect(s.slice(from + Number(m[1]), from + Number(m[1]) + 10)).toBe('\nendstream');
      n++;
    }
    expect(n).toBe(2);
  });

  it('Text: WinAnsi-Bytes oktal, Escapes für ( ) \\, y von oben nach unten umgerechnet', () => {
    const s = latin1(sample());
    // „Grüße (a) \ „x“ – 5 €“ → ü=374 ß=337 „=204 “=223 –=226 €=200 (oktal)
    expect(s).toContain('(Gr\\374\\337e \\(a\\) \\\\ \\204x\\223 \\226 5 \\200)');
    expect(s).toContain('/F4 12 Tf 20 802 Td'); // serif-bold = 4. Schrift, y = 842 − 40
    expect(s).toContain('10 782 100 50 re B'); // rect y = 842 − 10 − 50
    expect(s).toContain('2 w 0 842 m 100 742 l S');
    expect(s).toContain('1 0 0 rg');
  });

  it('sans/sans-bold/serif/serif-bold/mono → F1…F5', () => {
    const pdf = createPdf();
    const p = pdf.addPage(100, 100);
    for (const f of ['sans', 'sans-bold', 'serif', 'serif-bold', 'mono']) p.text('x', 1, 1, { font: f, size: 5 });
    const s = latin1(pdf.toBytes());
    for (const i of [1, 2, 3, 4, 5]) expect(s).toContain('/F' + i + ' 5 Tf');
  });

  it('JPEG: SOF0/SOF1/SOF2, Gray/RGB/CMYK parsen', () => {
    expect(parseJpeg(jpegBytes({ w: 300, h: 450 }))).toEqual({ width: 300, height: 450, comps: 3 });
    expect(parseJpeg(jpegBytes({ marker: 0xc1 }))).toMatchObject({ width: 3, height: 2 });
    expect(parseJpeg(jpegBytes({ marker: 0xc2, comps: 1 }))).toMatchObject({ comps: 1 });
    expect(parseJpeg(jpegBytes({ comps: 4 }))).toMatchObject({ comps: 4 });
  });

  it('JPEG ungültig → null, Bild wird ausgelassen', () => {
    const pdf = createPdf();
    expect(pdf.addJpeg(Uint8Array.from([1, 2, 3, 4, 5]))).toBeNull();
    expect(pdf.addJpeg(new Uint8Array(0))).toBeNull();
    expect(pdf.addJpeg(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
    expect(pdf.addJpeg(jpegBytes({ precision: 12 }))).toBeNull();
    expect(pdf.addJpeg(jpegBytes().slice(0, 12))).toBeNull(); // abgeschnitten
    const p = pdf.addPage(100, 100);
    expect(() => p.image(null, 0, 0, 10, 10)).not.toThrow();
    expect(latin1(pdf.toBytes())).not.toContain('/Subtype /Image');
  });

  it('JPEG: eingebettet mit DCTDecode, Farbraum und exakter Stream-Länge', () => {
    const pdf = createPdf();
    const rgb = pdf.addJpeg(jpegBytes({ w: 30, h: 45 }));
    const cmyk = pdf.addJpeg(jpegBytes({ comps: 4 }));
    const gray = pdf.addJpeg(jpegBytes({ comps: 1 }));
    const p = pdf.addPage(200, 300);
    p.image(rgb, 10, 20, 60, 90);
    p.image(cmyk, 0, 0, 10, 10);
    p.image(gray, 0, 0, 10, 10);
    const bytes = pdf.toBytes();
    const s = latin1(bytes);
    expect(s).toContain('/Width 30 /Height 45 /ColorSpace /DeviceRGB');
    expect(s).toContain('/ColorSpace /DeviceCMYK /Decode [1 0 1 0 1 0 1 0]');
    expect(s).toContain('/ColorSpace /DeviceGray');
    expect(s).toContain('/Filter /DCTDecode');
    expect(s).toContain('q 60 0 0 90 10 190 cm /Im1 Do Q'); // y = 300 − 20 − 90
    expect(s).toContain('/XObject <<');
    const len = jpegBytes({ w: 30, h: 45 }).length;
    expect(s).toContain('/Length ' + len + ' >>\nstream\n');
  });
});

describe('renderMagazinePdf', () => {
  const tip = (i) => ({
    imageId: 'img' + i, itemId: 'it' + i, title: 'Titel ' + i + ' mit Ümläuten und einem sehr langen Namen, der umbrochen werden muss', sub: 'S1 E1–E3', year: 2020, genres: ['Drama', 'Krimi'],
    runMin: 95, channelNo: 1, channelName: 'LIVE Kino', time: '20:15', start: Date.UTC(2026, 10, 11, 19, 15), badges: ['Premiere', 'ab 16'], age: 16,
    overview: 'Eine lange Inhaltsangabe. '.repeat(12), kindLabel: 'Film',
  });
  const rows = (n) => Array.from({ length: n }, (_, i) => ({ time: '20:' + String(i % 60).padStart(2, '0'), start: i, title: 'Sendung Nummer ' + i + ' „mit“ Umlauten äöüß', sub: 'S1 E' + i, badges: i % 3 ? ['Wdh.'] : ['Premiere'], kind: 'program' }));
  const chans = (from, to, n) => Array.from({ length: to - from + 1 }, (_, i) => ({ no: from + i, name: 'LIVE Sender ' + (from + i), theme: null, rows: rows(n) }));
  function fakeMag() {
    const days = Array.from({ length: 7 }, (_, i) => ({ D: 20000 + i, weekday: 'Mo', date: (11 + i) + '.11.' }));
    const pages = [{ kind: 'cover', no: 1 }];
    for (const d of days) {
      const h = { D: d.D, weekday: d.weekday, date: d.date };
      pages.push({ kind: 'tips', no: pages.length + 1, ...h, theme: 'Filmreihe', tips: [1, 2, 3, 4, 5].map(tip) });
      pages.push({ kind: 'evening', no: pages.length + 1, ...h, channels: chans(1, 18, 30) });
      pages.push({ kind: 'day', no: pages.length + 1, part: 1, ...h, channels: chans(1, 9, 70) });
      pages.push({ kind: 'day', no: pages.length + 1, part: 2, ...h, channels: chans(10, 18, 3) });
    }
    pages.push({ kind: 'back', no: pages.length + 1 });
    return { title: 'LIVE Programm', subtitle: 'Die Fernsehwoche · 11.–17.11.2026', fileName: 'x.pdf', days, cover: { hero: tip(0), teasers: days.map((d) => ({ D: d.D, weekday: d.weekday, label: 'Thementag ' + d.date })) }, pages };
  }

  it.each(['crt80', 'silver', 'flat', 'plain', 'unbekannt'])('Stil %s: 30 Seiten, Fortschritt, keine URLs/Tokens', async (style) => {
    const loaded = [];
    const prog = [];
    const bytes = await renderMagazinePdf(fakeMag(), {
      style,
      loadImage: async (id) => { loaded.push(id); return id === 'img3' ? null : jpegBytes({ w: 20, h: 30 }); },
      onProgress: (d, t) => prog.push([d, t]),
    });
    expect(bytes).toBeInstanceOf(Uint8Array);
    const s = latin1(bytes);
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s).toContain('/Count 30');
    expect(s).not.toMatch(/http|api_key|ApiKey/i);
    expect(prog).toHaveLength(30);
    expect(prog[0]).toEqual([1, 30]);
    expect(prog[29]).toEqual([30, 30]);
    // jedes Bild nur einmal geladen und eingebettet (img0..img5, img3 ist null)
    expect(new Set(loaded).size).toBe(loaded.length);
    expect(s.match(/\/Subtype \/Image/g)).toHaveLength(loaded.length - 1);
  });

  it('ohne loadImage läuft es (Platzhalter), Text wird nicht überlang', async () => {
    const bytes = await renderMagazinePdf(fakeMag(), { style: 'flat' });
    const s = latin1(bytes);
    expect(s).toContain('/Count 30');
    expect(s).not.toContain('/Subtype /Image');
    // Umlaute als cp1252-Oktal vorhanden (ä = 344), nie als UTF-8-Roh-Bytes
    expect(s).toContain('\\344');
  });

  it('wirft nicht bei loadImage-Fehler und leerem Heft', async () => {
    const bytes = await renderMagazinePdf({ title: 'LIVE Programm', subtitle: '', cover: { hero: null, teasers: [] }, pages: [{ kind: 'cover', no: 1 }, { kind: 'back', no: 2 }], days: [] }, { style: 'plain', loadImage: async () => { throw new Error('x'); } });
    expect(latin1(bytes)).toContain('/Count 2');
  });
});

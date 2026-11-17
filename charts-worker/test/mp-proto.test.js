import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { V, parseFrame, cleanText, MAX_FRAME, RE_ITEM, RE_OBJ, RE_K, T_CAP } from '../src/mp/protocol.js';
import { LIMITS, take, frameGate } from '../src/mp/limits.js';

const golden = JSON.parse(readFileSync(new URL('./fixtures/mp-golden/core.json', import.meta.url), 'utf8'));

describe('mp-proto: Golden c2s', () => {
  for (const c of golden.c2s) {
    it(c.name, () => {
      expect(V[c.in.t](c.in)).toEqual(c.out);
    });
  }
});

describe('mp-proto: Frames', () => {
  for (const f of golden.frames) {
    it(f.name, () => {
      let data = f.text;
      if (f.genLen) data = '['.padEnd(f.genLen - 1, ' ') + ']';
      if (f.binary) data = new Uint8Array([1, 2, 3]).buffer;
      const r = parseFrame(data);
      if (f.result === 'ok') {
        expect(r.ok).toBe(true);
        expect(r.msgs).toHaveLength(f.count);
      } else {
        expect(r).toEqual({ ok: false, code: f.result });
      }
    });
  }
  it('Grenze entspricht dem Vertrag', () => expect(MAX_FRAME).toBe(2048));
});

describe('mp-proto: Limits', () => {
  it('Tabelle entspricht der Golden-Datei', () => expect(LIMITS).toEqual(golden.limits));
  it('Eimer: Burst, dann Auffuellen', () => {
    const rl = {};
    let ok = 0;
    for (let i = 0; i < 20; i++) if (take(rl, 'p', 1000)) ok++;
    expect(ok).toBe(10);
    expect(take(rl, 'p', 1099)).toBe(false);
    expect(take(rl, 'p', 1200)).toBe(true);
  });
  it('rn: 1 je Minute, ki: 1 je 5 s, e: 1 je 1,5 s', () => {
    const rl = {};
    expect(take(rl, 'rn', 0)).toBe(true);
    expect(take(rl, 'rn', 59000)).toBe(false);
    expect(take(rl, 'rn', 60000)).toBe(true);
    expect(take(rl, 'ki', 0)).toBe(true);
    expect(take(rl, 'ki', 4900)).toBe(false);
    expect(take(rl, 'ki', 5000)).toBe(true);
    expect(take(rl, 'e', 0)).toBe(true);
    expect(take(rl, 'e', 1400)).toBe(false);
    expect(take(rl, 'e', 1500)).toBe(true);
  });
  it('ks/kj/kl: je 1/s', () => {
    for (const t of ['ks', 'kj', 'kl']) {
      const rl = {};
      expect(take(rl, t, 0)).toBe(true);
      expect(take(rl, t, 500)).toBe(false);
      expect(take(rl, t, 1000)).toBe(true);
    }
  });
  it('Frame-Tor: 12/s ok, Dauerlast fuehrt nach 3 s zu close, Ruhe setzt zurueck', () => {
    const rl = {};
    const res = [];
    for (let t = 0; t <= 4000; t += 20) res.push(frameGate(rl, t)); // 50/s
    expect(res[0]).toBe('ok');
    expect(res).toContain('drop');
    const firstClose = res.indexOf('close');
    expect(firstClose).toBeGreaterThan(0);
    const r2 = {};
    for (let t = 0; t < 10000; t += 100) expect(frameGate(r2, t)).toBe('ok'); // 10/s
  });
});

describe('mp-proto: Hilfen', () => {
  it('Regex', () => {
    expect(RE_ITEM.test('0123456789abcdef0123456789abcdef')).toBe(true);
    expect(RE_ITEM.test('0123456789abcdef0123456789abcde')).toBe(false);
    expect(RE_OBJ.test('hoopBall')).toBe(true);
    expect(RE_OBJ.test('a:b')).toBe(false);
    expect(RE_OBJ.test('x'.repeat(25))).toBe(false);
    expect(RE_K.test('0123456789ab')).toBe(true);
  });
  it('cleanText: Steuer-, Bidi-, Zero-Width-Zeichen, Laenge, NFC', () => {
    expect(cleanText('a‮b​c\u0000d\n\te', 50)).toBe('abcd e');
    expect(cleanText('x'.repeat(30), 24)).toHaveLength(24);
    expect(Array.from(cleanText('\u{1F600}'.repeat(30), 24))).toHaveLength(24);
    expect(cleanText('é', 5)).toBe('é');
    expect(cleanText('  ​ ', 5)).toBe('');
    expect(cleanText(42, 5)).toBe('');
  });
  it('T_CAP-Tabelle', () => {
    expect(T_CAP.m).toBe('chat');
    expect(T_CAP.ki).toBe('admin');
    expect(T_CAP.ks).toBe('kino');
    expect(T_CAP.hi).toBeUndefined();
  });
});

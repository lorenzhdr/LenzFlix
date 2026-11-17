/* global Buffer */
import { describe, expect, it } from 'vitest';
import { b64urlDecode, cleanName, hasSecret, mintTicket, pseudonym, verifyTicket } from '../src/mp/ticket.js';

const SECRET = 'x'.repeat(40);
const UID = 'a'.repeat(32);
const NOW = 1_800_000_000_000;
const user = { uid: UID, name: 'Lenz', admin: false };

describe('Ticket signieren und prüfen', () => {
  it('Nutzlast {v,k,n,a,e,j}, e = jetzt + 60 s, jti 16 Byte', async () => {
    const { tk, exp } = await mintTicket(SECRET, user, NOW);
    expect(exp).toBe(NOW + 60000);
    const [p] = tk.split('.');
    const c = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
    expect(c).toMatchObject({ v: 1, n: 'Lenz', a: 0, e: NOW + 60000 });
    expect(c.k).toMatch(/^[0-9a-f]{12}$/);
    expect(c.j).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(c)).not.toContain(UID);
    const v = await verifyTicket(SECRET, tk, NOW + 1000);
    expect(v).toEqual({ k: c.k, n: 'Lenz', a: 0, e: NOW + 60000, j: c.j });
  });

  it('Admin-Flag wird übernommen', async () => {
    const { tk } = await mintTicket(SECRET, { ...user, admin: true }, NOW);
    expect((await verifyTicket(SECRET, tk, NOW)).a).toBe(1);
  });

  it('jti ist je Ticket verschieden', async () => {
    const a = await verifyTicket(SECRET, (await mintTicket(SECRET, user, NOW)).tk, NOW);
    const b = await verifyTicket(SECRET, (await mintTicket(SECRET, user, NOW)).tk, NOW);
    expect(a.j).not.toBe(b.j);
  });

  it('abgelaufen (e <= jetzt) wird abgelehnt', async () => {
    const { tk } = await mintTicket(SECRET, user, NOW);
    expect(await verifyTicket(SECRET, tk, NOW + 59999)).not.toBeNull();
    expect(await verifyTicket(SECRET, tk, NOW + 60000)).toBeNull();
  });

  it('Manipulation von Nutzlast und Signatur, falsches Secret, Müll', async () => {
    const { tk } = await mintTicket(SECRET, user, NOW);
    const [p, s] = tk.split('.');
    const evil = Buffer.from(
      JSON.stringify({ v: 1, k: 'f'.repeat(12), n: 'X', a: 1, e: NOW + 99999, j: 'a'.repeat(32) }),
    ).toString('base64url');
    expect(await verifyTicket(SECRET, `${evil}.${s}`, NOW)).toBeNull();
    const flip = s[0] === 'A' ? 'B' : 'A';
    expect(await verifyTicket(SECRET, `${p}.${flip}${s.slice(1)}`, NOW)).toBeNull();
    expect(await verifyTicket('y'.repeat(40), tk, NOW)).toBeNull();
    for (const bad of ['', 'abc', 'a.b.c', null, undefined, 42, `${p}.`, `.${s}`, '!!.@@'])
      expect(await verifyTicket(SECRET, bad, NOW)).toBeNull();
    expect(await verifyTicket(SECRET, 'a'.repeat(700), NOW)).toBeNull();
  });
});

describe('Pseudonym k', () => {
  it('stabil, 12 Hex, abhängig von Secret und uid', async () => {
    const k = await pseudonym(SECRET, UID);
    expect(k).toMatch(/^[0-9a-f]{12}$/);
    expect(await pseudonym(SECRET, UID)).toBe(k);
    expect(await pseudonym(SECRET, 'b'.repeat(32))).not.toBe(k);
    expect(await pseudonym('z'.repeat(40), UID)).not.toBe(k);
  });
});

describe('cleanName', () => {
  it('entfernt Steuer-, Bidi- und Zero-Width-Zeichen', () => {
    expect(cleanName('a\u0000b‮c​d⁦e﻿f\n')).toBe('abcdef');
  });
  it('NFC und höchstens 24 Codepoints (Emoji zählt einmal)', () => {
    expect(cleanName('é')).toBe('é');
    expect(Array.from(cleanName('😀'.repeat(30))).length).toBe(24);
    expect(cleanName('😀'.repeat(30))).toBe('😀'.repeat(24));
  });
  it('leer oder nur Steuerzeichen wird "Gast"', () => {
    expect(cleanName('')).toBe('Gast');
    expect(cleanName('  ​‮ ')).toBe('Gast');
    expect(cleanName(null)).toBe('Gast');
    expect(cleanName(undefined)).toBe('Gast');
  });
});

describe('hasSecret', () => {
  it('mindestens 32 Byte', () => {
    expect(hasSecret('x'.repeat(32))).toBe(true);
    expect(hasSecret('x'.repeat(31))).toBe(false);
    expect(hasSecret(undefined)).toBe(false);
    expect(hasSecret(12345)).toBe(false);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearNowCache, getNow } from '../src/srv/now.js';
import fixture from './fixtures/srv-sessions.json';

const env = { JELLYFIN_URL: 'https://jf.example', JELLYFIN_API_KEY: 'ADMINKEY' };
const U1 = '11111111111111111111111111111111';
const U2 = '22222222222222222222222222222222';
const EP = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1';
const MOV = 'ccccccccccccccccccccccccccccccc1';
const SECRET = 'ddddddddddddddddddddddddddddddd1';
const ALLOWED = new Set(['id', 't', 'title', 'series', 's', 'e', 'ep', 'img', 'pos', 'dur', 'paused', 'tc', 'mbps', 'dev', 'me']);
const ALLOWED_HIDDEN = new Set(['hidden', 'p', 'paused', 'tc', 'mbps', 'dev']);

let calls;
let sessions; // Objekt, Text oder 'fail'
let itemsVisible; // Set von IDs oder 'fail'
let mediaSourceBitrate;

function mockFetch() {
  calls = { sessions: 0, items: 0, ms: 0, tokens: [] };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url, init) => {
      const u = String(url);
      const token = String(init?.headers?.Authorization || '');
      if (u.includes('/Sessions')) {
        calls.sessions++;
        if (sessions === 'fail') throw new Error('net');
        const body = typeof sessions === 'string' ? sessions : JSON.stringify(sessions);
        return new Response(body, { status: 200 });
      }
      if (u.includes('Fields=MediaSources')) {
        calls.ms++;
        return new Response(JSON.stringify({ Items: [{ MediaSources: [{ Bitrate: mediaSourceBitrate }] }] }), { status: 200 });
      }
      if (u.includes('/Items?Ids=')) {
        calls.items++;
        calls.tokens.push(token);
        if (itemsVisible === 'fail') return new Response('x', { status: 500 });
        const ids = decodeURIComponent(u.split('Ids=')[1].split('&')[0]).split(',');
        return new Response(JSON.stringify({ Items: ids.filter((i) => itemsVisible.has(i)).map((Id) => ({ Id })) }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    }),
  );
}

const viewer = (uid = U1) => ({ uid, name: 'x', admin: false });

beforeEach(() => {
  clearNowCache();
  sessions = structuredClone(fixture);
  itemsVisible = new Set([EP, MOV, SECRET]);
  mediaSourceBitrate = 5_000_000;
  mockFetch();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getNow', () => {
  it('Anonymität: keine Konto-, Geräte- oder Sitzungsdaten, nur erlaubte Schlüssel', async () => {
    itemsVisible = new Set([EP, MOV]); // eine Zeile bleibt verborgen
    const body = await getNow(env, null, viewer(), 'viewer-token');
    const json = JSON.stringify(body);
    for (const leak of [
      'Klaus_Geheim', 'Zweite_Person', 'Dritter_Nutzer', 'Idle_Person', "Lorenz' iPhone", 'iPhone', 'Wohnzimmer', 'Samsung', '203.0.113', '198.51.100',
      '192.0.2', 'DEVID', 'SESSIONID', 'USERIMGTAG', 'SERVERID', 'QUEUE', 'PLAYLIST', 'MEDIASRC', 'PATH-LEAK', '11111111', '22222222', 'ADMINKEY',
      'viewer-token', 'Jellyfin', 'Chrome',
    ]) expect(json).not.toContain(leak);
    expect(body.rows.length).toBe(3);
    for (const r of body.rows) {
      const allowed = r.hidden ? ALLOWED_HIDDEN : ALLOWED;
      for (const k of Object.keys(r)) expect(allowed.has(k)).toBe(true);
    }
    const hidden = body.rows.find((r) => r.hidden);
    expect(hidden).toEqual({ hidden: 1, p: 0, paused: 0, tc: 0, mbps: 2, dev: 'web' });
    expect(json).not.toContain('Geheimfilm');
    expect(json).not.toContain('SECRETTAG');
  });

  it('Zeilen: me-Flag, Whitelist, Folgen-Felder, Bitrate, Reihenfolge, Summe', async () => {
    const body = await getNow(env, null, viewer(), 't');
    expect(body.v).toBe(1);
    expect(body.n).toBe(3);
    expect(body.rows.map((r) => r.title)).toEqual(['Tolle Serie', 'Anderer Film', 'Geheimfilm']);
    const [me, mov] = body.rows;
    expect(me).toEqual({
      id: EP, t: 'episode', title: 'Tolle Serie', ep: 'Pilot', s: 2, e: 5,
      img: { id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb1', tag: 'SERTAG' },
      pos: 600, dur: 2400, paused: 0, tc: 0, mbps: 4.6, dev: 'phone', me: 1,
    });
    expect(mov.me).toBeUndefined();
    expect(mov).toMatchObject({ t: 'movie', paused: 1, tc: 1, mbps: 8, dev: 'tv', img: { id: MOV, tag: 'MOVTAG' } });
    expect(body.mbps).toBe(14.6);
  });

  it('Remux (Video+Audio direkt) zählt als direkt', async () => {
    const body = await getNow(env, null, viewer(), 't');
    const remux = body.rows.find((r) => r.title === 'Geheimfilm');
    expect(remux.tc).toBe(0);
  });

  it('fail-closed: Sichtbarkeitsfehler verbirgt fremde, eigene bleiben', async () => {
    itemsVisible = 'fail';
    const body = await getNow(env, null, viewer(), 't');
    expect(body.rows[0].me).toBe(1);
    expect(body.rows.slice(1).every((r) => r.hidden === 1)).toBe(true);
    expect(JSON.stringify(body)).not.toContain('Anderer Film');
  });

  it('fremde Zeilen werden mit dem Token des Betrachters geprüft', async () => {
    await getNow(env, null, viewer(), 'viewer-token');
    expect(calls.items).toBe(1);
    expect(calls.tokens[0]).toContain('viewer-token');
  });

  it('kein Sichtbarkeitsabruf ohne fremde Zeilen', async () => {
    sessions = [fixture[0]];
    const body = await getNow(env, null, viewer(), 't');
    expect(body.n).toBe(1);
    expect(calls.items).toBe(0);
  });

  it('Roh-/Sessions wird geteilt: zwei Betrachter, ein Abruf', async () => {
    const [a, b] = await Promise.all([getNow(env, null, viewer(U1), 'a'), getNow(env, null, viewer(U2), 'b')]);
    expect(calls.sessions).toBe(1);
    expect(a.rows.find((r) => r.me).title).toBe('Tolle Serie');
    expect(b.rows.find((r) => r.me).title).toBe('Anderer Film');
    await getNow(env, null, viewer(U1), 'a');
    expect(calls.sessions).toBe(1);
  });

  it('down: Fehler (kurz gemerkt), Größengrenze, kaputtes JSON', async () => {
    sessions = 'fail';
    expect(await getNow(env, null, viewer(), 't')).toEqual({ v: 1, down: 1 });
    await getNow(env, null, viewer(), 't');
    expect(calls.sessions).toBe(1);
    clearNowCache();
    sessions = 'x'.repeat(513 * 1024);
    expect(await getNow(env, null, viewer(), 't')).toEqual({ v: 1, down: 1 });
    clearNowCache();
    sessions = 'kein json';
    expect(await getNow(env, null, viewer(), 't')).toEqual({ v: 1, down: 1 });
  });

  it('leer: n=0', async () => {
    sessions = [fixture[3]];
    expect(await getNow(env, null, viewer(), 't')).toEqual({ v: 1, n: 0, mbps: 0, rows: [] });
  });

  it('Bitrate-Rückfall über MediaSources: höchstens 5 je Anfrage, 1 h Cache', async () => {
    const mk = (i) => ({
      UserId: U1,
      PlayState: { PositionTicks: 0 },
      NowPlayingItem: { Id: i.toString(16).padStart(32, '0'), Name: `F${i}`, Type: 'Movie', RunTimeTicks: 1e10, MediaStreams: [] },
    });
    sessions = [1, 2, 3, 4, 5, 6, 7].map(mk);
    const body = await getNow(env, null, viewer(), 't');
    expect(calls.ms).toBe(5);
    expect(body.rows.filter((r) => r.mbps === 5).length).toBe(5);
    expect(body.rows.filter((r) => r.mbps === null).length).toBe(2);
    expect(body.mbps).toBe(25);
    // zweiter Lauf (Roh-Cache noch frisch): die 5 sind gecacht, die übrigen 2 werden nachgeholt
    const again = await getNow(env, null, viewer(), 't');
    expect(again.rows.filter((r) => r.mbps === 5).length).toBe(7);
    expect(calls.ms).toBe(7);
  });

  it('ohne jede Bitrate: null und nicht in der Summe', async () => {
    mediaSourceBitrate = undefined;
    sessions = [{ UserId: U1, PlayState: {}, NowPlayingItem: { Id: MOV, Name: 'X', Type: 'Movie', MediaStreams: [] } }];
    const body = await getNow(env, null, viewer(), 't');
    expect(body.rows[0].mbps).toBeNull();
    expect(body.mbps).toBe(0);
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const ds = vi.hoisted(() => ({ on: false, subs: new Set() }));
vi.mock('../src/js/core/datasaver.js', () => ({
  isDataSaver: () => ds.on,
  onDataSaverChange: (cb) => { ds.subs.add(cb); return () => ds.subs.delete(cb); },
}));
const setSaver = (v) => { ds.on = v; [...ds.subs].forEach((cb) => cb(v)); };

import { allowPrefetch, heroSettled, startRowPrefetch } from '../src/js/features/rows/prefetch.js';

function setConn(c) {
  Object.defineProperty(navigator, 'connection', { value: c, configurable: true });
}

function mkRow(id, { cards = 10 } = {}) {
  const el = document.createElement('section');
  el.className = 'is-loading';
  el.dataset.lfxRow = id;
  el.dataset.cards = String(cards);
  return el;
}
function fillRow(el) {
  el.classList.remove('is-loading');
  const n = Number(el.dataset.cards);
  for (let i = 0; i < n; i++) {
    const card = document.createElement('div');
    card.className = 'lfx-card';
    const img = document.createElement('img');
    img.setAttribute('loading', 'lazy');
    setComplete(img, false);
    card.append(img);
    el.append(card);
  }
}
function setComplete(img, v) {
  Object.defineProperty(img, 'complete', { value: v, configurable: true });
}

describe('rows/prefetch', () => {
  let slot;
  let pending;
  let calls;
  let resolvers;
  let hero;
  let inst;
  const load = vi.fn((el) => new Promise((res) => {
    calls.push(el.dataset.lfxRow);
    resolvers.push(() => { fillRow(el); res(); });
  }));
  const start = () => { inst = startRowPrefetch({ slot, pending, load, hero: () => hero }); return inst; };
  const tick = (ms) => vi.advanceTimersByTimeAsync(ms);

  beforeEach(() => {
    vi.useFakeTimers();
    setConn(undefined);
    document.body.innerHTML = '';
    slot = document.createElement('div');
    hero = document.createElement('div');
    document.body.append(hero, slot);
    pending = new Map();
    calls = [];
    resolvers = [];
    load.mockClear();
    inst = null;
    // oben: eine gefüllte Zeile mit geladenen Bildern
    const top = mkRow('top', { cards: 2 });
    slot.append(top);
    fillRow(top);
    for (const i of top.querySelectorAll('img')) setComplete(i, true);
  });
  afterEach(() => {
    if (inst) inst.stop();
    vi.useRealTimers();
    setConn(undefined);
    document.body.innerHTML = '';
  });

  const addPending = (...ids) => {
    for (const id of ids) {
      const el = mkRow(id);
      slot.append(el);
      pending.set(el, { id });
    }
  };

  describe('Netz-Sperre', () => {
    it.each([
      [{ saveData: true }, false],
      [{ type: 'cellular' }, false],
      [{ effectiveType: '3g' }, false],
      [{ effectiveType: '2g' }, false],
      [{ effectiveType: 'slow-2g' }, false],
      [{ effectiveType: '4g', saveData: false, type: 'wifi' }, true],
    ])('allowPrefetch %o -> %s', (c, ok) => {
      setConn(c);
      expect(allowPrefetch()).toBe(ok);
    });
    it('ohne connection-API erlaubt', () => {
      expect(allowPrefetch()).toBe(true);
    });
    it('gesperrtes Netz: nie ein loadRow', async () => {
      setConn({ saveData: true });
      addPending('a');
      start();
      await tick(30000);
      expect(load).not.toHaveBeenCalled();
    });
    it('ohne API: Start', async () => {
      addPending('a');
      start();
      await tick(1000);
      expect(load).toHaveBeenCalledTimes(1);
    });
  });

  describe('Start erst wenn oben fertig', () => {
    it('wartet auf wartenden Trailer, startet nach „on“', async () => {
      hero.dataset.lfxTr = 'wait';
      addPending('a');
      start();
      await tick(5000);
      expect(load).not.toHaveBeenCalled();
      hero.dataset.lfxTr = 'on';
      await tick(1000);
      expect(load).toHaveBeenCalledTimes(1);
    });
    it('wartet auf Hero-Bild', async () => {
      const img = document.createElement('img');
      setComplete(img, false);
      hero.append(img);
      addPending('a');
      start();
      await tick(5000);
      expect(load).not.toHaveBeenCalled();
      setComplete(img, true);
      await tick(1000);
      expect(load).toHaveBeenCalledTimes(1);
    });
    it('wartet auf Bilder der ersten Zeile, höchstens 4 s', async () => {
      slot.textContent = '';
      const r1 = mkRow('r1', { cards: 2 });
      slot.append(r1);
      fillRow(r1); // Bilder noch nicht geladen
      addPending('a');
      start();
      await tick(2000);
      expect(load).not.toHaveBeenCalled();
      await tick(3000);
      expect(load).toHaveBeenCalledTimes(1);
    });
    it('startet nicht, solange keine Zeile gefüllt ist; Obergrenze 15 s', async () => {
      slot.textContent = '';
      addPending('a');
      start();
      await tick(14000);
      expect(load).not.toHaveBeenCalled();
      await tick(2000);
      expect(load).toHaveBeenCalledTimes(1);
    });
    it('Obergrenze greift auch bei hängendem Trailer', async () => {
      hero.dataset.lfxTr = 'wait';
      addPending('a');
      start();
      await tick(14000);
      expect(load).not.toHaveBeenCalled();
      await tick(2000);
      expect(load).toHaveBeenCalledTimes(1);
    });
  });

  describe('Ablauf', () => {
    it('von oben nach unten (DOM-Reihenfolge), immer nur eine Zeile gleichzeitig', async () => {
      addPending('a', 'b', 'c');
      const [a, b, c] = [...pending.keys()];
      pending = new Map([[c, pending.get(c)], [a, pending.get(a)], [b, pending.get(b)]]); // Map-Reihenfolge egal
      start();
      await tick(1000);
      expect(calls).toEqual(['a']);
      await tick(5000);
      expect(calls).toEqual(['a']); // a lädt noch
      resolvers[0]();
      await tick(100);
      expect(calls).toEqual(['a']); // Bilder von a: bis zu 4 s Frist
      await tick(5000);
      expect(calls).toEqual(['a', 'b']);
      resolvers[1]();
      await tick(6000);
      expect(calls).toEqual(['a', 'b', 'c']);
      expect(pending.size).toBe(0);
      expect(b.isConnected).toBe(true);
    });

    it('setzt die ersten 8 Kartenbilder auf eager und geht bei load weiter', async () => {
      addPending('a', 'b');
      start();
      await tick(1000);
      resolvers[0]();
      await tick(50);
      const imgs = [...slot.querySelectorAll('[data-lfx-row="a"] img')];
      expect(imgs).toHaveLength(10);
      expect(imgs.slice(0, 8).every((i) => i.loading === 'eager')).toBe(true);
      expect(imgs[8].getAttribute('loading')).toBe('lazy');
      expect(calls).toEqual(['a']);
      for (const i of imgs.slice(0, 8)) i.dispatchEvent(new Event('load'));
      await tick(1000);
      expect(calls).toEqual(['a', 'b']);
    });

    it('überspringt eine Zeile, die der Nutzer zuerst lädt (Observer)', async () => {
      addPending('a', 'b');
      const [a] = [...pending.keys()];
      start();
      pending.delete(a); // Observer hat a übernommen und gefüllt
      fillRow(a);
      a.querySelectorAll('img').forEach((i) => setComplete(i, true));
      await tick(1000);
      expect(calls).toEqual(['b']);
    });

    it('entfernte Zeilen werden übersprungen', async () => {
      addPending('a', 'b');
      [...pending.keys()][0].remove();
      start();
      await tick(1000);
      expect(calls).toEqual(['b']);
    });

    it('pausiert bei hidden und macht sichtbar weiter', async () => {
      addPending('a');
      let hid = true;
      Object.defineProperty(document, 'hidden', { get: () => hid, configurable: true });
      try {
        start();
        await tick(5000);
        expect(load).not.toHaveBeenCalled();
        hid = false;
        document.dispatchEvent(new Event('visibilitychange'));
        await tick(1000);
        expect(load).toHaveBeenCalledTimes(1);
      } finally {
        delete document.hidden;
      }
    });

    it('stop() beendet alles, kein weiteres loadRow', async () => {
      addPending('a', 'b');
      start();
      await tick(1000);
      expect(calls).toEqual(['a']);
      resolvers[0]();
      inst.stop();
      await tick(30000);
      expect(calls).toEqual(['a']);
    });

    it('nachgelieferte Zeilen (notify) werden nachgeladen', async () => {
      addPending('a');
      start();
      await tick(1000);
      resolvers[0]();
      await tick(6000);
      expect(calls).toEqual(['a']);
      addPending('late');
      inst.notify();
      await tick(1000);
      expect(calls).toEqual(['a', 'late']);
    });

    it('Ladefehler einer Zeile stoppt die Kette nicht', async () => {
      const bad = vi.fn((el) => { calls.push(el.dataset.lfxRow); return Promise.reject(new Error('x')); });
      addPending('a', 'b');
      inst = startRowPrefetch({ slot, pending, load: bad, hero: () => hero });
      await tick(8000);
      expect(calls).toEqual(['a', 'b']);
    });
  });

  describe('Datensparmodus (Pause-Grund)', () => {
    afterEach(() => { ds.on = false; ds.subs.clear(); });

    it('an vor go: nichts startet; aus: nach 2 s lädt die oberste offene Zeile', async () => {
      ds.on = true;
      addPending('a', 'b');
      start();
      await tick(20000);
      expect(calls).toEqual([]);
      setSaver(false);
      await tick(1900);
      expect(calls).toEqual([]);
      await tick(300);
      expect(calls).toEqual(['a']);
    });

    it('an mitten in einer Zeile: sie wird fertig, die nächste wartet; aus: weiter an derselben Stelle', async () => {
      addPending('a', 'b');
      start();
      await tick(1000);
      expect(calls).toEqual(['a']);
      setSaver(true);
      resolvers[0]();
      await tick(10000);
      expect(calls).toEqual(['a']);
      setSaver(false);
      await tick(2300);
      expect(calls).toEqual(['a', 'b']);
    });

    it('stop() meldet das Abo ab; Netzregel bleibt über core/net.js (saveData sperrt weiter)', async () => {
      addPending('a');
      start();
      expect(ds.subs.size).toBe(1);
      inst.stop();
      expect(ds.subs.size).toBe(0);
      setConn({ saveData: true });
      expect(allowPrefetch()).toBe(false);
    });
  });

  describe('Pause (Info-Fenster, Hintergrund-TV)', () => {
    const root = document.documentElement;
    const open = async () => { root.classList.add('lfx-modal-open'); await tick(0); };
    const close = async () => { root.classList.remove('lfx-modal-open'); await tick(0); };
    afterEach(() => { root.classList.remove('lfx-modal-open', 'lfx-tvm-bgplay'); });

    it('Fenster offen vor go: nichts startet; nach Schließen erst nach 2 s', async () => {
      await open();
      addPending('a');
      start();
      await tick(20000);
      expect(calls).toEqual([]);
      await close();
      await tick(1900);
      expect(calls).toEqual([]);
      await tick(300);
      expect(calls).toEqual(['a']);
    });

    it('öffnet mitten in einer Zeile: sie wird fertig, die nächste wartet', async () => {
      addPending('a', 'b');
      start();
      await tick(1000);
      expect(calls).toEqual(['a']);
      await open();
      resolvers[0]();
      await tick(10000);
      expect(calls).toEqual(['a']);
      await close();
      await tick(2300);
      expect(calls).toEqual(['a', 'b']);
    });

    it('Schließen: nach 2 s lädt die oberste offene Zeile im DOM', async () => {
      addPending('a', 'b', 'c');
      await open();
      start();
      await tick(5000);
      await close();
      await tick(2300);
      expect(calls).toEqual(['a']);
    });

    it('erneutes Öffnen innerhalb der 2 s hält die Pause', async () => {
      await open();
      addPending('a');
      start();
      await tick(1000);
      await close();
      await tick(1000);
      await open();
      await tick(10000);
      expect(calls).toEqual([]);
      await close();
      await tick(2300);
      expect(calls).toEqual(['a']);
    });

    it('Schließen, dann stop() innerhalb der 2 s: keine neue Zeile', async () => {
      await open();
      addPending('a');
      start();
      await tick(1000);
      await close();
      await tick(500);
      inst.stop();
      await tick(10000);
      expect(calls).toEqual([]);
    });

    it('Hintergrund-PiP: Klasse + Video pausiert; nur Klasse nicht', async () => {
      root.classList.add('lfx-tvm-bgplay');
      addPending('a');
      start();
      await tick(2000);
      expect(calls).toEqual(['a']); // Klasse ohne Video: kein Halt
      resolvers[0]();
      await tick(6000);
      addPending('b');
      const bg = document.createElement('div');
      bg.id = 'lfx-tvm-bg';
      bg.append(document.createElement('video'));
      document.body.append(bg);
      inst.notify();
      await tick(3000);
      expect(calls).toEqual(['a']);
      bg.remove();
      root.classList.remove('lfx-tvm-bgplay');
      await tick(0);
      await tick(2300);
      expect(calls).toEqual(['a', 'b']);
    });
  });

  describe('heroSettled', () => {
    it('ohne Slot oder versteckt: fertig', () => {
      expect(heroSettled(null)).toBe(true);
      const s = document.createElement('div');
      s.hidden = true;
      expect(heroSettled(s)).toBe(true);
    });
    it('Skeleton / is-loading: nicht fertig', () => {
      const s = document.createElement('div');
      s.className = 'is-loading';
      expect(heroSettled(s)).toBe(false);
      s.className = '';
      s.innerHTML = '<div class="lfx-bb--skel"></div>';
      expect(heroSettled(s)).toBe(false);
    });
    it('lazy-Bilder zählen nicht', () => {
      const s = document.createElement('div');
      s.innerHTML = '<img loading="lazy">';
      setComplete(s.querySelector('img'), false);
      expect(heroSettled(s)).toBe(true);
    });
  });
});

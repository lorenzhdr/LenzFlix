// VIDEOTHEK LENZ 1.18.0 · Stimmen (voiceFor, seedHash) und Sprüche (Passanten, Rowdys, Richard, Salon): rein, ohne DOM.
import { describe, it, expect } from 'vitest';
import { voiceFor, seedHash, pickVoiceSeeded } from '../src/js/store3d/modules/voice.js';
import { LINES as NPC, pickLine } from '../src/js/store3d/npc/lines.js';
import { LINES as RICHARD } from '../src/js/store3d/modules/cashier-lines.js';
import { LINES as SALON, pickSalonLine } from '../src/js/store3d/char/salon-lines.js';

// Verbotene Begriffe: Diskriminierung (Herkunft, Hautfarbe, Religion, Geschlecht, Sexualität, Behinderung), sexuelle Gewalt, Marken.
const FORBIDDEN = [
  'spast', 'mongo', 'behindert', 'krüppel', 'schwul', 'schwuchtel', 'lesbe', 'transe', 'neger', 'kanake', 'zigeuner', 'jude', 'muslim', 'islam',
  'hurensohn', 'fotze', 'nutte', 'schlampe', 'vergewalt', 'missbrauch', 'hitler', 'nazi', 'asyl', 'ausländer', 'schwarzer', 'penner',
  'netflix', 'disney', 'amazon', 'youtube',
];
const ROWDY = ['rowdyAccost', 'rowdyThreat', 'rowdyAttack', 'rowdyHit', 'rowdyFlee', 'rowdyWin'];
const PASSERBY = ['emoteDance', 'emoteWave', 'emoteBow', 'greetKnown', 'trafficLight', 'cheerBasket', 'cheerCans', 'cheerDiscover', 'headAlarm', 'headBan',
  'provokeShy', 'provokeNormal', 'provokeHot', 'attackHot', 'struck', 'blinded', 'koSeen', ...ROWDY];

function allTexts() {
  const out = [];
  for (const [k, l] of Object.entries(NPC)) for (const t of l) out.push([`npc.${k}`, t]);
  for (const [k, l] of Object.entries(RICHARD)) for (const t of l) out.push([`richard.${k}`, t]);
  for (const [w, cats] of Object.entries(SALON)) for (const [k, l] of Object.entries(cats)) for (const t of l) out.push([`salon.${w}.${k}`, t]);
  return out;
}

describe('voiceFor', () => {
  it('ist deterministisch und bleibt in den Grenzen', () => {
    for (const seed of [0, 1, 7, 'gabi-haarscharf', 'x', 123456789]) {
      for (const n of [0, 1, 3, 8]) {
        const a = voiceFor(seed, n);
        expect(voiceFor(seed, n)).toEqual(a);
        expect(a.pitch).toBeGreaterThanOrEqual(0.7);
        expect(a.pitch).toBeLessThanOrEqual(1.4);
        expect(a.rate).toBeGreaterThanOrEqual(0.85);
        expect(a.rate).toBeLessThanOrEqual(1.15);
      }
    }
  });
  it('streut bei wenigen Stimmen über viele Seeds', () => {
    const ps = new Set();
    for (let s = 0; s < 40; s++) ps.add(voiceFor(s, 1).pitch);
    expect(ps.size).toBeGreaterThan(15);
  });
  it('Textseeds werden gehasht, Zahlen bleiben Zahlen', () => {
    expect(seedHash(5)).toBe(5);
    expect(seedHash(-3.7)).toBe(4);
    expect(seedHash('gabi-haarscharf')).not.toBe(seedHash('ronny-haarscharf'));
    expect(seedHash('abc')).toBe(seedHash('abc'));
    const vs = [{ name: 'A', lang: 'de-DE', localService: true }, { name: 'B', lang: 'de-DE', localService: true }, { name: 'C', lang: 'de-DE', localService: true }];
    expect(pickVoiceSeeded(vs, 'gabi-haarscharf').voice.name).toBe(pickVoiceSeeded(vs, 'gabi-haarscharf').voice.name);
  });
});

describe('Sprüche 1.18.0', () => {
  it('Passanten- und Rowdy-Kategorien haben je mindestens 12 Zeilen', () => {
    for (const c of PASSERBY) {
      expect(NPC[c], c).toBeTruthy();
      expect(NPC[c].length, c).toBeGreaterThanOrEqual(12);
      expect(pickLine(c, () => 0.5)).toBeTruthy();
    }
  });
  it('Richard und Salon: neue Kategorien gefüllt', () => {
    for (const c of ['playerKO', 'laserHit', 'whipHit', 'beltHit']) expect(RICHARD[c].length, c).toBeGreaterThanOrEqual(6);
    for (const w of ['gabi', 'ronny']) for (const c of ['threat', 'attack', 'struck', 'blinded']) {
      expect(SALON[w][c].length, `${w}.${c}`).toBeGreaterThanOrEqual(5);
      expect(pickSalonLine(w, c, () => 0.3)).toBeTruthy();
    }
  });
  it('keine leeren Kategorien, keine leeren oder doppelten Zeilen je Kategorie', () => {
    const lists = [...Object.entries(NPC), ...Object.entries(RICHARD), ...Object.entries(SALON.gabi), ...Object.entries(SALON.ronny)];
    for (const [k, l] of lists) {
      expect(l.length, k).toBeGreaterThan(0);
      expect(new Set(l).size, k).toBe(l.length);
      for (const t of l) expect(t.trim().length, k).toBeGreaterThan(2);
    }
  });
  it('keine verbotenen Begriffe und keine Auslassungspunkte in neuen Kategorien', () => {
    for (const [where, t] of allTexts()) {
      const low = t.toLowerCase();
      for (const f of FORBIDDEN) expect(low.includes(f), `${where}: "${t}" enthält ${f}`).toBe(false);
    }
    for (const c of PASSERBY) for (const t of NPC[c]) expect(t.includes('...'), t).toBe(false);
  });
  it('nur Rowdys dürfen derb sein, die übrigen Kategorien bleiben ohne Schimpfwörter', () => {
    const rude = /barsch|wichser|vollidiot|pisser|dreckskerl|scheiße|verdammt|fresse|loser/i;
    for (const c of PASSERBY.filter((x) => !ROWDY.includes(x))) for (const t of NPC[c]) expect(rude.test(t), `${c}: ${t}`).toBe(false);
    for (const [k, l] of Object.entries(RICHARD)) for (const t of l) expect(rude.test(t), `richard.${k}: ${t}`).toBe(false);
    for (const w of ['gabi', 'ronny']) for (const [k, l] of Object.entries(SALON[w])) for (const t of l) expect(rude.test(t), `${w}.${k}: ${t}`).toBe(false);
    const rowdyRude = ROWDY.flatMap((c) => NPC[c]).filter((t) => rude.test(t));
    expect(rowdyRude.length).toBeGreaterThan(20);
  });
});

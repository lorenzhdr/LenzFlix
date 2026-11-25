import { describe, expect, it } from 'vitest';
import {
  assertM,
  buildBingeCandidates,
  buildBingeEpisodes,
  buildConc,
  buildConcRows,
  buildMeta,
  buildMonth,
  buildMonthParts,
  buildRecDay,
  buildRecMonth,
  monthWindow,
  parseMonthParam,
} from '../src/srv/sql.js';

const UID = '0123456789abcdef0123456789abcdef';

describe('parseMonthParam / assertM', () => {
  it('Whitelist 0..35 als Ganzzahl', () => {
    for (const bad of ['-1', '36', '1a', '', '99', ' 1', '1.5', null, undefined, -1, 36, 1.5, NaN]) {
      expect(parseMonthParam(bad)).toBeNull();
    }
    expect(parseMonthParam('01')).toBe(1);
    expect(parseMonthParam('0')).toBe(0);
    expect(parseMonthParam('35')).toBe(35);
    expect(parseMonthParam(7)).toBe(7);
    expect(() => assertM(36)).toThrow();
    expect(() => assertM(-1)).toThrow();
    expect(() => assertM('1')).toThrow();
    expect(assertM(12)).toBe(12);
  });

  it('Bau mit ungültigem m wirft, kein SQL entsteht', () => {
    for (const bad of [-1, 36, 1.5, '1', NaN]) {
      expect(() => buildMonth(bad)).toThrow();
      expect(() => monthWindow(bad)).toThrow();
    }
  });
});

describe('UserList-Ausschluss und feste Form', () => {
  const all = () => [
    buildMeta(),
    buildMonth(0),
    buildMonth(35),
    ...Object.values(buildMonthParts(3)),
    buildRecDay(),
    buildRecMonth(),
    buildConc(true),
    buildConc(false),
    buildConcRows(true),
    buildConcRows(false),
    buildBingeCandidates(true),
    buildBingeCandidates(false),
    buildBingeEpisodes([{ d: '2026-11-10', u: UID }]),
  ];

  it('jede Abfrage schließt die Ignorierliste aus', () => {
    for (const sql of all()) {
      expect(sql).toContain('UserId NOT IN (SELECT UserId FROM UserList)');
    }
    for (const sql of Object.values(buildMonthParts(0))) {
      expect(sql).toContain('UserId NOT IN (SELECT UserId FROM UserList)');
    }
  });

  it('nur Filme und Folgen', () => {
    for (const sql of all()) expect(sql).toMatch(/ItemType (IN \('Movie','Episode'\)|= 'Episode')/);
  });

  it('Fenster in der Lokalzeit der DB, m als Zahl', () => {
    expect(monthWindow(0)).toBe(
      "DateCreated >= datetime('now','localtime','start of month','-0 months') AND DateCreated < datetime('now','localtime','start of month','+1 months')",
    );
    expect(monthWindow(2)).toContain("'-2 months') AND DateCreated < datetime('now','localtime','start of month','-1 months')");
    expect(buildMonth(1)).not.toMatch(/\bstrftime\('%s', 'now'/);
    // prev = Fenster m+1 (auch bei 35 ohne Fehler)
    expect(buildMonthParts(35).prev).toContain("'-36 months'");
  });

  it('Monat enthält alle Schlüssel in einer UNION-ALL-Abfrage', () => {
    const sql = buildMonth(0);
    for (const k of ['tot', 'day', 'hm', 'dev', 'pm', 'ty', 'prev']) expect(sql).toContain(`'${k}' AS k`);
    expect(sql.split('UNION ALL').length).toBe(7);
  });

  it('Marathon-Schritt 2 verwirft ungültige Tage und Konten', () => {
    expect(buildBingeEpisodes([])).toBeNull();
    expect(buildBingeEpisodes([{ d: "2026-11-10' OR 1=1 --", u: UID }])).toBeNull();
    expect(buildBingeEpisodes([{ d: '2026-11-10', u: "x' OR '1'='1" }])).toBeNull();
    expect(buildBingeEpisodes([{ d: '2026-11-10', u: UID.toUpperCase() }])).toBeNull();
    const sql = buildBingeEpisodes([
      { d: '2026-11-10', u: UID },
      { d: 'bad', u: UID },
    ]);
    expect(sql).toContain(`UserId = '${UID}'`);
    expect(sql).not.toContain('bad');
  });
});

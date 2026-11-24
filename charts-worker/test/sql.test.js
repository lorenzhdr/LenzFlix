import { describe, expect, it } from 'vitest';
import { buildSql, minSeconds, minSecondsMovie, windowDays } from '../src/sql.js';

describe('sql', () => {
  it('nutzt Defaults bei fehlenden/ungültigen Werten', () => {
    expect(windowDays(undefined)).toBe(30);
    expect(windowDays('abc')).toBe(30);
    expect(windowDays('0')).toBe(30);
    expect(windowDays('366')).toBe(30);
    expect(windowDays('-5')).toBe(30);
    expect(windowDays('1.5')).toBe(30);
    expect(minSeconds('')).toBe(300);
    expect(minSeconds('3601')).toBe(300);
    expect(minSecondsMovie(undefined)).toBe(800);
    expect(minSecondsMovie('abc')).toBe(800);
    expect(minSecondsMovie('3601')).toBe(800);
  });

  it('akzeptiert Grenzwerte', () => {
    expect(windowDays('1')).toBe(1);
    expect(windowDays('365')).toBe(365);
    expect(minSeconds('0')).toBe(0);
    expect(minSeconds('3600')).toBe(3600);
    expect(minSecondsMovie('0')).toBe(0);
    expect(minSecondsMovie('3600')).toBe(3600);
  });

  it('setzt validierte Werte in die Vorlage ein', () => {
    const sql = buildSql('7', '60', '900');
    expect(sql).toContain("ItemType = 'Episode' AND PlayDuration >= 60)");
    expect(sql).toContain("ItemType = 'Movie' AND PlayDuration >= 900)");
    expect(sql).toContain("'-7 days'");
    expect(sql).toContain('GROUP BY ItemId, UserId');
  });

  it('Schwellen je Typ: Filme 800 s, Folgen 300 s als Default', () => {
    const sql = buildSql();
    expect(sql).toContain("(ItemType = 'Movie' AND PlayDuration >= 800)");
    expect(sql).toContain("(ItemType = 'Episode' AND PlayDuration >= 300)");
    expect(buildSql('30', '300', '800')).toBe(sql);
  });

  it('liefert das Alter des letzten Abrufs in ganzen Sekunden als Spalte age', () => {
    const sql = buildSql();
    expect(sql).toContain("strftime('%s','now','localtime')");
    expect(sql).toContain("strftime('%s', substr(MAX(DateCreated),1,19))");
    expect(sql).toContain(' AS age ');
  });

  it('Injection nicht möglich: Müll fällt auf Defaults zurück', () => {
    const evil = "1 days'); DROP TABLE PlaybackActivity;--";
    const sql = buildSql(evil, '0; DELETE FROM UserList', "1'; DROP TABLE x;--");
    expect(sql).toBe(buildSql('30', '300', '800'));
    expect(sql).not.toMatch(/DROP|DELETE/);
    expect(sql.match(/;/g)).toBeNull();
  });

  it('Standard-SQL enthält weder ; noch Schreibbefehle', () => {
    const sql = buildSql();
    expect(sql).not.toMatch(/DROP|DELETE|INSERT|UPDATE/);
    expect(sql).not.toContain(';');
  });
});

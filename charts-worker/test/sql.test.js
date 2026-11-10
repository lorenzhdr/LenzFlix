import { describe, expect, it } from 'vitest';
import { buildSql, minSeconds, windowDays } from '../src/sql.js';

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
  });

  it('akzeptiert Grenzwerte', () => {
    expect(windowDays('1')).toBe(1);
    expect(windowDays('365')).toBe(365);
    expect(minSeconds('0')).toBe(0);
    expect(minSeconds('3600')).toBe(3600);
  });

  it('setzt validierte Werte in die Vorlage ein', () => {
    const sql = buildSql('7', '60');
    expect(sql).toContain('PlayDuration >= 60 ');
    expect(sql).toContain("'-7 days'");
    expect(sql).toContain('GROUP BY ItemId, UserId');
  });

  it('Injection nicht möglich: Müll fällt auf Defaults zurück', () => {
    const evil = "1 days'); DROP TABLE PlaybackActivity;--";
    const sql = buildSql(evil, '0; DELETE FROM UserList');
    expect(sql).toBe(buildSql('30', '300'));
    expect(sql).not.toMatch(/DROP|DELETE/);
    expect(sql.match(/;/g)).toBeNull();
  });
});

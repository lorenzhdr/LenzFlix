import { describe, expect, it } from 'vitest';
import {
  fmtAgo,
  fmtBytes,
  fmtClock,
  fmtDate,
  fmtDayShort,
  fmtDelta,
  fmtHm,
  fmtMbps,
  fmtUptime,
  monthName,
  num,
  plural,
} from '../src/js/serverstats/format.js';

describe('serverstats format', () => {
  it('Zahlen deutsch', () => {
    expect(num(1234567)).toBe('1.234.567');
    expect(num(8.14, 1)).toBe('8,1');
    expect(num(-8)).toBe('−8');
    expect(num(NaN)).toBe('–');
  });
  it('Zeit', () => {
    expect(fmtClock(2530, true)).toBe('0:42:10');
    expect(fmtClock(7080, true)).toBe('1:58:00');
    expect(fmtClock(730)).toBe('12:10');
    expect(fmtHm(182 * 3600)).toBe('182 h');
    expect(fmtHm(182 * 3600 + 15 * 60)).toBe('182 h 15 min');
    expect(fmtHm(6 * 3600 + 20 * 60)).toBe('6 h 20 min');
    expect(fmtHm(0)).toBe('0 min');
    expect(fmtUptime(3 * 86400 + 4 * 3600)).toBe('3 Tage 4 h');
    expect(fmtUptime(86400)).toBe('1 Tag 0 h');
    expect(fmtAgo(7200)).toBe('2 h');
    expect(fmtAgo(300)).toBe('5 min');
    expect(fmtAgo(3 * 86400)).toBe('3 Tagen');
  });
  it('Bytes dezimal', () => {
    expect(fmtBytes(1.42e12)).toBe('1,42 TB');
    expect(fmtBytes(1.2e12, 1)).toBe('1,2 TB');
    expect(fmtBytes(4e12, 1)).toBe('4,0 TB');
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(-1)).toBe('–');
    expect(fmtMbps(8.14)).toBe('8,1 Mbit/s');
    expect(fmtMbps(null)).toBe('');
  });
  it('Prozent und Vormonat', () => {
    expect(fmtDelta(112, 100)).toBe('+12 %');
    expect(fmtDelta(92, 100)).toBe('−8 %');
    expect(fmtDelta(100, 100)).toBe('0 %');
    expect(fmtDelta(5, 0)).toBe('neu');
    expect(fmtDelta(0, 0)).toBe('–');
  });
  it('Monate, Daten, Mehrzahl', () => {
    expect(monthName('2026-11')).toBe('November 2026');
    expect(monthName('2026-03', true)).toBe('März');
    expect(monthName('x')).toBe('');
    expect(fmtDate('2026-10-03')).toBe('03.10.2026');
    expect(fmtDayShort('2026-11-12')).toBe('Do., 12.11.');
    expect(plural(1, 'Folge', 'Folgen')).toBe('1 Folge');
    expect(plural(9224, 'Folge', 'Folgen')).toBe('9.224 Folgen');
  });
});

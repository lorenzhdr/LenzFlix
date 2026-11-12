// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createOsd } from '../src/js/live/ui/osd.js';

const data = { no: 3, channel: { no: 3, name: 'Test' }, title: 'Titel', from: '20:15', to: '21:00', progress: 0.2, next: null };

afterEach(() => vi.useRealTimers());

describe('OSD showInfo (Umschalten mit i)', () => {
  it('zweites Drücken blendet Info und Kanalnummer/Titel aus, Lautstärke bleibt', () => {
    vi.useFakeTimers();
    const host = document.createElement('div');
    const osd = createOsd(host);
    osd.showInfo(data);
    expect(osd.el.classList.contains('is-ch')).toBe(true);
    expect(osd.el.classList.contains('is-info')).toBe(true);
    osd.showVolume({ percent: 50 });
    osd.showInfo(data);
    expect(osd.el.classList.contains('is-ch')).toBe(false);
    expect(osd.el.classList.contains('is-info')).toBe(false);
    expect(osd.el.classList.contains('is-vol')).toBe(true);
    // gelöschte Timer: späteres Ablaufen ändert nichts, neue Einblendung wird nicht vorzeitig beendet
    osd.showChannel(data, 5000);
    vi.advanceTimersByTime(4000);
    expect(osd.el.classList.contains('is-ch')).toBe(true);
    vi.advanceTimersByTime(1500);
    expect(osd.el.classList.contains('is-ch')).toBe(false);
  });
});

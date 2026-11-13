// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { createCard } from '../src/js/live/ui/card.js';

describe('LENZ LIVE Fehlerkarte: Kurzcode', () => {
  it('showError mit Code zeigt „Code: X“ und data-code; ohne Code nichts', () => {
    const host = document.createElement('div');
    const card = createCard(host);
    card.showError('video', null, 'V-10BIT');
    expect(card.el.querySelector('.lfx-live-card__code').textContent).toBe('Code: V-10BIT');
    expect(card.el.dataset.code).toBe('V-10BIT');
    card.showError('network', null);
    expect(card.el.querySelector('.lfx-live-card__code')).toBeNull();
    expect(card.el.dataset.code).toBeUndefined();
    card.showError('browser', null, 'B-HLS');
    card.hide();
    expect(card.el.dataset.code).toBeUndefined();
  });
});

describe('LENZ LIVE Fehlerkarte: Grund (hint)', () => {
  it('zeigt eine Zeile mit dem Grund, ohne hint keine', () => {
    const card = createCard(document.createElement('div'));
    card.showError('video', null, 'M3', 'Bildformat h264 HDR');
    expect(card.el.querySelector('.lfx-live-card__hint').textContent).toBe('Bildformat h264 HDR wird von diesem Gerät nicht unterstützt');
    expect(card.el.querySelector('.lfx-live-card__code').textContent).toBe('Code: M3');
    card.showError('video', null, 'M3');
    expect(card.el.querySelector('.lfx-live-card__hint')).toBeNull();
  });
});

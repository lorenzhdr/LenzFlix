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

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/theme.js', () => ({ isTheme: (id) => id === 'flix', getTheme: () => 'flix', onThemeChange: () => () => {} }));
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => true, isTv: () => false }));
vi.mock('../src/js/core/api.js', () => ({ isReady: () => true, getUserId: () => 'u1', setImageScale: () => {} }));

import { openSecretMenu, closeSecretMenu } from '../src/js/features/secretmenu/panel.js';

describe('Geheimmenü: Bildgrößen', () => {
  beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; });
  afterEach(() => { closeSecretMenu(); vi.unstubAllGlobals(); });

  it('Reglerwert entspricht dem angezeigten Prozentwert (2/3 = 67)', () => {
    openSecretMenu();
    const input = document.getElementById('lfx-secret-saver');
    const label = input.closest('.lfx-secret__slider').querySelector('.lfx-secret__val').textContent;
    expect(input.step).toBe('1'); // Rastung 5 würde 67 auf 65 setzen (Browser), das Label zeigte weiter 67
    expect(`${input.value} %`).toBe(label.replace(/\s/g, ' '));
  });

  it('Reglerwert rastet beim Loslassen in Bewegungsrichtung auf 5 % (Pfeiltasten bleiben nicht hängen)', () => {
    openSecretMenu();
    const input = document.getElementById('lfx-secret-saver');
    input.value = '64';
    input.dispatchEvent(new Event('change'));
    expect(input.value).toBe('60');
    input.value = '61';
    input.dispatchEvent(new Event('change'));
    expect(input.value).toBe('65');
  });

  it('DPR < 1 sagt nicht „schärfer“', () => {
    vi.stubGlobal('devicePixelRatio', 0.9);
    openSecretMenu();
    const text = document.body.textContent;
    expect(text).toContain('Bildschirm dieses Geräts');
    expect(text).not.toMatch(/0,9× schärfer/);
  });
});

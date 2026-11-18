// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readCustom, updateCustom, writeCustom } from '../src/js/features/store/displayprefs.js';

let client;
beforeEach(() => {
  client = {
    getDisplayPreferences: vi.fn(async () => ({ Id: 'lenzstore', CustomPrefs: { chromecastVersion: 'stable', skipForwardLength: '30000' } })),
    updateDisplayPreferences: vi.fn(async () => {}),
  };
  window.ApiClient = client;
});
afterEach(() => { delete window.ApiClient; });

describe('displayprefs', () => {
  it('readCustom: String oder null, Client lenzflix', async () => {
    client.getDisplayPreferences.mockResolvedValueOnce({ CustomPrefs: { profile: '{"v":1}' } });
    expect(await readCustom('lenzstore', 'profile', 'u1')).toBe('{"v":1}');
    expect(await readCustom('lenzstore', 'profile', 'u1')).toBeNull();
    expect(client.getDisplayPreferences).toHaveBeenCalledWith('lenzstore', 'u1', 'lenzflix');
  });

  it('writeCustom: geteilte CustomPrefs-Schlüssel bleiben, nie die Id lenzflix', async () => {
    await writeCustom('lenzstore', 'profile', 'x'.repeat(4096), 'u1');
    const [id, prefs, uid, app] = client.updateDisplayPreferences.mock.calls[0];
    expect([id, uid, app]).toEqual(['lenzstore', 'u1', 'lenzflix']);
    expect(prefs.CustomPrefs).toEqual({ chromecastVersion: 'stable', skipForwardLength: '30000', profile: 'x'.repeat(4096) });
    const calls = client.getDisplayPreferences.mock.calls.concat(client.updateDisplayPreferences.mock.calls);
    expect(calls.every((c) => c[0] !== 'lenzflix')).toBe(true);
  });

  it('updateCustom: fn bekommt den alten Wert; null → kein POST; GET-Fehler → kein POST', async () => {
    const fn = vi.fn(() => null);
    expect(await updateCustom('lenzstore', 'profile', fn, 'u1')).toBe(false);
    expect(fn).toHaveBeenCalledWith(null);
    expect(client.updateDisplayPreferences).not.toHaveBeenCalled();
    client.getDisplayPreferences.mockRejectedValueOnce(new Error('offline'));
    await expect(updateCustom('lenzstore', 'profile', () => 'a', 'u1')).rejects.toThrow('offline');
    expect(client.updateDisplayPreferences).not.toHaveBeenCalled();
  });
});

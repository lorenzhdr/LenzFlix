// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { landscapeImage, pickLandscape, logoImage, imageUrl, buildUrl, setPlayed } from '../src/js/core/api.js';

beforeEach(() => {
  window.ApiClient = {
    serverAddress: () => 'http://srv:8096/',
    getCurrentUserId: () => 'u1',
    accessToken: () => 'tok',
    serverId: () => 's1',
  };
});

describe('api', () => {
  it('buildUrl: Adresse ohne Slash, Params ohne leere Werte, Arrays kommagetrennt', () => {
    expect(buildUrl('/Items', { a: 1, b: undefined, c: '', d: ['x', 'y'] })).toBe('http://srv:8096/Items?a=1&d=x%2Cy');
  });

  it('Fallback auf localStorage.jellyfin_credentials', () => {
    delete window.ApiClient;
    localStorage.setItem('jellyfin_credentials', JSON.stringify({ Servers: [{ AccessToken: 't', UserId: 'U', ManualAddress: 'http://x:1' }] }));
    expect(buildUrl('/Y')).toBe('http://x:1/Y');
    localStorage.clear();
  });

  it('Bildreihenfolge: Thumb vor Backdrop vor Primary', () => {
    const item = { Id: 'a', ImageTags: { Thumb: 't', Primary: 'p' }, BackdropImageTags: ['b'] };
    expect(pickLandscape(item)).toEqual({ id: 'a', type: 'Thumb', tag: 't' });
    delete item.ImageTags.Thumb;
    expect(pickLandscape(item).type).toBe('Backdrop');
    item.BackdropImageTags = [];
    expect(pickLandscape(item).type).toBe('Primary');
  });

  it('Episode: Eltern-Thumb/-Backdrop vor eigenem Primary', () => {
    const ep = { Id: 'e', ImageTags: { Primary: 'p' }, ParentThumbItemId: 'ser', ParentThumbImageTag: 'pt', ParentBackdropItemId: 'ser', ParentBackdropImageTags: ['pb'] };
    expect(pickLandscape(ep)).toEqual({ id: 'ser', type: 'Thumb', tag: 'pt' });
    delete ep.ParentThumbImageTag;
    expect(pickLandscape(ep)).toEqual({ id: 'ser', type: 'Backdrop', tag: 'pb' });
    delete ep.ParentBackdropImageTags;
    expect(pickLandscape(ep).id).toBe('e');
  });

  it('landscapeImage baut URL mit Tag/maxWidth; null ohne Bild; kein Token in der URL', () => {
    const url = landscapeImage({ Id: 'a', ImageTags: { Thumb: 't' } }, { maxWidth: 400 });
    expect(url).toContain('/Items/a/Images/Thumb?');
    expect(url).toContain('maxWidth=400');
    expect(url).toContain('tag=t');
    expect(url).not.toContain('tok');
    expect(landscapeImage({ Id: 'z' })).toBeNull();
  });

  it('logoImage: eigenes Logo, sonst Eltern-Logo', () => {
    expect(logoImage({ Id: 'a', ImageTags: { Logo: 'l' } })).toContain('/Items/a/Images/Logo');
    expect(logoImage({ Id: 'e', ParentLogoItemId: 'ser', ParentLogoImageTag: 'x' })).toContain('/Items/ser/Images/Logo');
    expect(logoImage({ Id: 'q' })).toBeNull();
  });

  it('imageUrl: null wenn Tag fehlt', () => {
    expect(imageUrl({ Id: 'a', ImageTags: {} }, { type: 'Primary' })).toBeNull();
    expect(imageUrl({ Id: 'a', BackdropImageTags: ['b'] }, { type: 'Backdrop' })).toContain('Backdrop');
  });
});

describe('setPlayed', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('POST bzw. DELETE auf /PlayedItems/<id> mit Authorization-Header', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 204 }));
    vi.stubGlobal('fetch', f);
    await setPlayed('abc', true);
    await setPlayed('abc', false);
    expect(f.mock.calls[0][0]).toBe('http://srv:8096/Users/u1/PlayedItems/abc');
    expect(f.mock.calls[0][1].method).toBe('POST');
    expect(f.mock.calls[0][1].headers.Authorization).toBe('MediaBrowser Token="tok"');
    expect(f.mock.calls[1][1].method).toBe('DELETE');
  });

  it('wirft bei !ok, ohne Token in der Meldung', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    await expect(setPlayed('abc', true)).rejects.toThrow('HTTP 500 (Gesehen)');
    await setPlayed('abc', true).catch((e) => expect(e.message).not.toContain('tok'));
  });
});

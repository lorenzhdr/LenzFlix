// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { imageTagMap, taggedImageUrl } from '../src/js/features/live/deps.js';

beforeEach(() => {
  window.ApiClient = { serverAddress: () => 'http://srv', getCurrentUserId: () => 'u1', accessToken: () => 'SECRET', serverId: () => 's' };
});
afterEach(() => { delete window.ApiClient; });

const raw = {
  movies: [{ Id: 'm1', ImageTags: { Thumb: 'tt', Primary: 'pp' }, BackdropImageTags: ['bb'] }, { Id: 'm2' }],
  series: [{ Id: 's1', ImageTags: { Primary: 'sp' } }],
};

describe('imageUrl mit tag', () => {
  const tags = imageTagMap(raw);
  it('hängt den Tag des angefragten Typs an', () => {
    expect(taggedImageUrl(tags, 'm1', { type: 'Thumb', maxWidth: 480 })).toContain('/Items/m1/Images/Thumb?');
    expect(taggedImageUrl(tags, 'm1', { type: 'Thumb', maxWidth: 480 })).toContain('tag=tt');
    expect(taggedImageUrl(tags, 'm1', { type: 'Backdrop' })).toContain('tag=bb');
    expect(taggedImageUrl(tags, 's1', { maxWidth: 200 })).toContain('tag=sp'); // Standardtyp Primary
  });
  it('unbekannt oder Typ fehlt: URL ohne tag, nie null, nie Schlüssel', () => {
    for (const [id, o] of [['m2', { type: 'Thumb' }], ['zz', { type: 'Thumb' }], ['s1', { type: 'Thumb' }], ['s1', { type: 'Backdrop' }]]) {
      const u = taggedImageUrl(tags, id, o);
      expect(u).toContain(`/Items/${id}/Images/`);
      expect(u).not.toContain('tag=');
      expect(u).not.toMatch(/api_key|ApiKey|SECRET/i);
    }
  });
  it('alter Cache ohne Tags und leerer Katalog', () => {
    expect(imageTagMap({ movies: [{ Id: 'a' }], series: [] }).size).toBe(0);
    expect(imageTagMap(null).size).toBe(0);
  });
});

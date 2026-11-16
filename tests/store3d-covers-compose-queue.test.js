// @vitest-environment jsdom
// CoverManager: cancelLoad verwirft wartende full-Compose-Jobs.
import { describe, it, expect } from 'vitest';
import { CoverManager } from '../src/js/store3d/covers/manager.js';

describe('cancelLoad verwirft wartenden full-Compose-Job', () => {
  it('composeQueue enthält danach keinen full-Job der Seite mehr', () => {
    const m = new CoverManager({ faceViews: [], items: new Map(), deps: {}, preset: { level: 'mid', atlas: 1024 } });
    const f = { loading: { ac: new AbortController(), bitmaps: new Map(), pending: 0, hi: false } };
    const other = { loading: null };
    m.composeQueue = [{ f, kind: 'full' }, { f: other, kind: 'full' }];
    m.cancelLoad(f);
    expect(m.composeQueue).toEqual([{ f: other, kind: 'full' }]);
  });
});


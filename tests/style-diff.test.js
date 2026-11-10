// @vitest-environment jsdom
/* global process */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { diffSnapshots, formatDiff, flatten } from '../build/style-diff-lib.mjs';

const base = () => ({
  url: '#/home',
  innerWidth: 1280,
  htmlClasses: ['a', 'b'],
  vars: { '--lfx-red': '#e50914' },
  els: {
    '.lfx-bb': { count: 1, style: { color: 'rgb(1, 2, 3)', width: '100px' }, before: { content: 'none' } },
    '.lfx-row': { count: 2, style: { color: 'red' } },
  },
});

describe('diffSnapshots', () => {
  it('liefert bei Gleichheit nichts', () => {
    expect(diffSnapshots(base(), base())).toEqual([]);
    expect(formatDiff([])).toMatch(/Keine Unterschiede/);
  });

  it('erkennt geaenderte, neue und fehlende Properties', () => {
    const n = base();
    n.els['.lfx-bb'].style.color = 'red';
    delete n.els['.lfx-row'];
    n.els['.lfx-card'] = { count: 1, style: { color: 'blue' } };
    n.vars['--lfx-red'] = '#f00';
    const d = diffSnapshots(base(), n);
    expect(d).toContainEqual({ kind: 'changed', group: '.lfx-bb', prop: 'color', from: 'rgb(1, 2, 3)', to: 'red' });
    expect(d).toContainEqual({ kind: 'changed', group: 'vars', prop: '--lfx-red', from: '#e50914', to: '#f00' });
    expect(d.some((x) => x.kind === 'removed' && x.group === '.lfx-row' && x.prop === 'count')).toBe(true);
    expect(d.some((x) => x.kind === 'added' && x.group === '.lfx-card' && x.prop === 'color')).toBe(true);
    expect(formatDiff(d)).toMatch(/Unterschied/);
  });

  it('beachtet --ignore (auch fuer Pseudo-Elemente)', () => {
    const n = base();
    n.els['.lfx-bb'].style.width = '200px';
    n.els['.lfx-bb'].before.content = '"x"';
    expect(diffSnapshots(base(), n)).toHaveLength(2);
    expect(diffSnapshots(base(), n, { ignore: ['width', 'content'] })).toEqual([]);
  });

  it('flatten tolerant gegen leere Snapshots', () => {
    expect(flatten({}).get('meta | url')).toBe('');
  });
});

describe('style-snapshot.js', () => {
  it('liefert valides JSON mit erwarteten Keys aus einem Mini-DOM', () => {
    document.documentElement.className = 'lfx-js zz';
    const st = document.createElement('style');
    st.textContent = ':root{--lfx-red:#e50914;--jf-x:1;--lfx-ambient-r:5}.lfx-bb{color:red;background-image:url(http://x/y.jpg?api_key=1)}';
    document.head.appendChild(st);
    document.body.innerHTML = '<div class="lfx-bb">x</div>';
    const src = readFileSync(resolve(process.cwd(), 'build/style-snapshot.js'), 'utf8');
    const out = (0, eval)(src);
    expect(typeof out).toBe('string');
    const snap = JSON.parse(out);
    expect(Object.keys(snap)).toEqual(expect.arrayContaining(['url', 'innerWidth', 'htmlClasses', 'vars', 'els']));
    expect(snap.htmlClasses).toEqual(['lfx-js', 'zz']);
    expect(snap.vars['--lfx-ambient-r']).toBeUndefined();
    expect(snap.els['.lfx-bb'].count).toBe(1);
    expect(snap.els['.lfx-bb'].style.color).toBeTruthy();
    expect(snap.els['.lfx-bb'].style['background-image']).not.toMatch(/api_key/);
    expect(snap.els['.lfx-nav__item'].count).toBe(0);
    expect(window.__lfxSnapshot).toEqual(snap);
    // Snapshot gegen sich selbst: Diff = 0
    expect(diffSnapshots(snap, JSON.parse(out))).toEqual([]);
  });
});

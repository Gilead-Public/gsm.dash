import { describe, it, expect } from 'vitest';
import { hasView, openingParams, readView, viewKey, viewParams, writeView } from '../src/app/saved-view.js';
import { currentParams } from '../src/data/store.js';

/** An in-memory Storage. */
const memory = () => {
  const items = new Map();
  return {
    getItem: (k) => (items.has(k) ? items.get(k) : null),
    setItem: (k, v) => void items.set(k, String(v)),
    removeItem: (k) => void items.delete(k),
    items,
  };
};
const refusing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
const p = (s) => new URLSearchParams(s);

describe('the portfolio view saved in the browser', () => {
  it('is kept per reports folder, so every report in one folder shares it and another folder has its own', () => {
    expect(viewKey('/x/reports/portfolio.html')).toBe(viewKey('/x/reports/STUDY001.html'));
    expect(viewKey('/x/reports/portfolio.html')).not.toBe(viewKey('/y/reports/portfolio.html'));
    expect(viewKey('/preview/portfolio.html')).not.toBe(viewKey('/portfolio.html'));
  });

  it('leaves the Admin settings out of a view, and an address holding only them carries no view', () => {
    expect(viewParams(p('theme=dark&filter.phase=P1&perrow=3&group=phase&combine=on')).toString()).toBe('filter.phase=P1&group=phase');
    expect([hasView(p('')), hasView(p('theme=dark&legend=on')), hasView(p('theme=dark&sort=label'))]).toEqual([false, false, true]);
  });

  it('saves a view, and forgets it when the view is the defaults', () => {
    const s = memory();
    writeView(s, 'k', p('filter.phase=P1'), 'hide=');
    expect(readView(s, 'k')?.toString()).toBe('filter.phase=P1');
    writeView(s, 'k', p('hide='), 'hide=');
    expect([s.items.has('k'), readView(s, 'k')]).toEqual([false, null]);
  });

  it('opens with the address when it carries a view, and otherwise with the saved one, in its current form, and the address\'s Admin settings', () => {
    const saved = p('filter.phase=P1&view=overview&expand=1&theme=light');
    expect(openingParams(p('group=status&theme=dark'), saved, currentParams).toString()).toBe('group=status&theme=dark');
    expect(openingParams(p('theme=dark'), saved, currentParams).toString()).toBe('filter.phase=P1&view=compact&theme=dark');
    expect(openingParams(p(''), null, currentParams).toString()).toBe('');
    expect(openingParams(p('ramp=teal&expand=1'), saved, currentParams).toString(), 'only retired params: no view').toBe('filter.phase=P1&view=compact');
  });

  it('works from the address alone when the browser refuses storage', () => {
    expect(() => writeView(refusing, 'k', p('filter.phase=P1'), '')).not.toThrow();
    expect(readView(refusing, 'k')).toBeNull();
    expect(readView(null, 'k')).toBeNull();
    expect(() => writeView(null, 'k', p('a=1'), '')).not.toThrow();
  });
});

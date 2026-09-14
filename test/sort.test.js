import { describe, it, expect } from 'vitest';
import { nextSort, sortRows } from '../src/data/sort.js';

describe('nextSort', () => {
  it('numeric columns start descending, then ascending, then clear', () => {
    let s = { key: null, dir: null };
    s = nextSort(s, 'Analysis_kri0001');
    expect(s).toEqual({ key: 'Analysis_kri0001', dir: 'desc' });
    s = nextSort(s, 'Analysis_kri0001');
    expect(s).toEqual({ key: 'Analysis_kri0001', dir: 'asc' });
    s = nextSort(s, 'Analysis_kri0001');
    expect(s).toEqual({ key: null, dir: null });
  });

  it('text columns start ascending', () => {
    expect(nextSort({ key: null, dir: null }, 'label', { numeric: false })).toEqual({ key: 'label', dir: 'asc' });
  });

  it('switching columns restarts the cycle', () => {
    expect(nextSort({ key: 'a', dir: 'asc' }, 'b')).toEqual({ key: 'b', dir: 'desc' });
  });
});

describe('sortRows', () => {
  const rows = [
    { id: 'A', v: 0.2 },
    { id: 'B', v: null },
    { id: 'C', v: 0.5 },
    { id: 'D', v: 0.2 },
  ];
  const byV = (r) => r.v;

  it('returns rows untouched when unsorted', () => {
    expect(sortRows(rows, { key: null, dir: null }, byV)).toBe(rows);
  });

  it('sorts descending with nulls last and ties in original order', () => {
    expect(sortRows(rows, { key: 'v', dir: 'desc' }, byV).map((r) => r.id)).toEqual(['C', 'A', 'D', 'B']);
  });

  it('sorts ascending with nulls still last', () => {
    expect(sortRows(rows, { key: 'v', dir: 'asc' }, byV).map((r) => r.id)).toEqual(['A', 'D', 'C', 'B']);
  });

  it('sorts strings with localeCompare', () => {
    const named = [{ n: 'STUDY010' }, { n: 'STUDY002' }, { n: 'STUDY001' }];
    expect(sortRows(named, { key: 'n', dir: 'asc' }, (r) => r.n).map((r) => r.n)).toEqual(['STUDY001', 'STUDY002', 'STUDY010']);
  });
});

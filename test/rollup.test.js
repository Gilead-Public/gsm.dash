import { describe, it, expect } from 'vitest';
import { selectLatestSnapshots, poolResults, flagDistribution, bucketStudies, filterStudies, studyValue } from '../src/data/rollup.js';
import { PortfolioStore } from '../src/data/store.js';
import { generatePortfolio } from '../scripts/generate-example-data.mjs';

describe('selectLatestSnapshots', () => {
  const studies = [
    { StudyID: 'A', snapshots: ['2026-04-30', '2026-05-31', '2026-06-30'] },
    { StudyID: 'B', snapshots: ['2026-04-30', '2026-05-31'] }, // lags a month
    { StudyID: 'C', snapshots: ['2026-06-30'] },
  ];

  it('takes each study’s own latest snapshot, never a global max', () => {
    const latest = selectLatestSnapshots(studies);
    expect(latest.get('A')).toBe('2026-06-30');
    expect(latest.get('B')).toBe('2026-05-31'); // B is NOT dropped for lagging
    expect(latest.get('C')).toBe('2026-06-30');
  });

  it('respects asOf per study and omits studies with no eligible snapshot', () => {
    const latest = selectLatestSnapshots(studies, '2026-05-31');
    expect(latest.get('A')).toBe('2026-05-31');
    expect(latest.get('B')).toBe('2026-05-31');
    expect(latest.has('C')).toBe(false);
  });
});

describe('poolResults', () => {
  it('pools by summing numerators and denominators, weighting studies by denominator', () => {
    const pooled = poolResults([
      { StudyID: 'A', Numerator: 10, Denominator: 100 }, // 10%
      { StudyID: 'B', Numerator: 90, Denominator: 300 }, // 30%
    ]);
    expect(pooled.Numerator).toBe(100);
    expect(pooled.Denominator).toBe(400);
    expect(pooled.Rate).toBeCloseTo(0.25); // pooled, NOT mean of rates (0.20)
    expect(pooled.NumStudies).toBe(2);
  });

  it('returns null rate on zero denominator', () => {
    expect(poolResults([{ StudyID: 'A', Numerator: 0, Denominator: 0 }]).Rate).toBeNull();
  });
});

describe('flagDistribution', () => {
  it('buckets by |flag| and counts NA distinctly, inside the share denominator', () => {
    const d = flagDistribution([
      { Flag: -2 },
      { Flag: 2 },
      { Flag: 1 },
      { Flag: -1 },
      { Flag: 0 },
      { Flag: 0 },
      { Flag: null },
      { Flag: null },
    ]);
    expect(d).toMatchObject({ red: 2, amber: 2, green: 2, na: 2, total: 8 });
    expect(d.share).toBeCloseTo(4 / 8); // NA included in the denominator
  });

  it('handles empty input', () => {
    expect(flagDistribution([]).share).toBe(0);
  });
});

describe('filterStudies + bucketStudies', () => {
  const studies = [
    { StudyID: 'A', params: { phase: 'P1', status: 'Active' } },
    { StudyID: 'B', params: { phase: 'P3', status: 'Active' } },
    { StudyID: 'C', params: { phase: 'P3', status: 'Completed' } },
  ];

  it('empty selections do not constrain; values OR within a param, AND across params', () => {
    expect(filterStudies(studies, { phase: new Set(), status: new Set() })).toHaveLength(3);
    expect(filterStudies(studies, { phase: new Set(['P3']), status: new Set() })).toHaveLength(2);
    expect(filterStudies(studies, { phase: new Set(['P1', 'P3']), status: new Set(['Active']) })).toHaveLength(2);
  });

  it('buckets sort by value and keep study membership', () => {
    const buckets = bucketStudies(studies, 'phase');
    expect(buckets.map((b) => b.value)).toEqual(['P1', 'P3']);
    expect(buckets[1].studies.map((s) => s.StudyID)).toEqual(['B', 'C']);
  });
});

describe('a study value that is missing or blank (#22)', () => {
  const studies = [
    { StudyID: 'A', params: { product: ' Product A ' } },
    { StudyID: 'B', params: { product: '' } },
    { StudyID: 'C', params: { product: '   ' } },
    { StudyID: 'D', params: { product: null } },
    { StudyID: 'E', params: {} },
    { StudyID: 'F', params: { product: 'Product A' } },
  ];

  it('22.07: is absent, as missing, null, empty or spaces; any other value is trimmed (#22)', () => {
    expect(studies.map((st) => studyValue(st, 'product'))).toEqual(['Product A', null, null, null, null, 'Product A']);
    expect(studyValue(studies[0], 'study')).toBe('A');
  });

  it('22.07: never matches a filter, and groups under (missing) (#22)', () => {
    expect(filterStudies(studies, { product: new Set(['Product A']) }).map((st) => st.StudyID)).toEqual(['A', 'F']);
    expect(bucketStudies(studies, 'product').map((b) => [b.value, b.studies.map((st) => st.StudyID)])).toEqual([
      ['(missing)', ['B', 'C', 'D', 'E']],
      ['Product A', ['A', 'F']],
    ]);
  });

  it('22.07: is no filter choice, so a field absent from every study offers none (#22)', () => {
    const portfolio = generatePortfolio();
    const withProducts = (/** @type {(i: number) => unknown} */ value) => {
      const studiesWith = portfolio.manifest.studies.map((st, i) => ({ ...st, params: { ...st.params, product: value(i) } }));
      return new PortfolioStore({ ...portfolio, manifest: { ...portfolio.manifest, studies: studiesWith } }).filterOptions().product;
    };
    expect(withProducts(() => undefined), 'omitted').toEqual([]);
    expect(withProducts((i) => (i % 2 ? '' : '  ')), 'blank').toEqual([]);
    expect(withProducts((i) => (i < 3 ? ` P${i} ` : i < 6 ? null : '')), 'partly blank').toEqual(['P0', 'P1', 'P2']);
  });
});

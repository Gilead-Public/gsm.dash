import { describe, it, expect, beforeAll } from 'vitest';
import { fmtInt, fmtRate, fmtMetric, fmtRateDiff, metricUnit, ndLine, displayRate } from '../src/util/format.js';
import { groupByCategory, CATEGORY_ORDER, OTHER_CATEGORY, STATUS_ORDER } from '../src/data/catalog.js';
import { normalizeMetric } from '../src/data/normalize.js';
import { PortfolioStore } from '../src/data/store.js';
import { generatePortfolio } from '../scripts/generate-example-data.mjs';

// Glossary display rules (P2): the rule only changes formatting; the rate is
// always Σn / Σd per day (exposure) or per participant.
const countPct = { Display: 'count_pct', Population: 'Enrolled', Denominator: 'Enrolled participants' };
const per28 = { Display: 'per_28d' };
const pct = { Display: 'pct', Population: 'Screened' };

describe('metric display rules', () => {
  it('renders count_pct as "n (p%)" with the percent as secondary markup', () => {
    const out = fmtMetric(countPct, { Numerator: 1234, Denominator: 10000 });
    expect(out.text).toBe('1,234 (12.3%)');
    expect(out.html).toBe('1,234<span class="pc"> (12.3%)</span>');
  });

  it('rescales exposure rates to 28 days for display only', () => {
    expect(displayRate(per28, 0.01)).toBeCloseTo(0.28, 10);
    expect(fmtRate(per28, 0.01)).toBe('0.28');
    expect(fmtMetric(per28, { Numerator: 1, Denominator: 100 }).text).toBe('0.28');
    expect(fmtRate(pct, 0.1234)).toBe('12.3%');
  });

  it('handles missing values without throwing', () => {
    expect(fmtInt(null)).toBe('—');
    expect(fmtRate(per28, null)).toBe('—');
    expect(fmtMetric(countPct, { Numerator: 0, Denominator: 0 }).text).toBe('—');
    expect(fmtRateDiff(pct, null, 0.1)).toBe('');
    expect(ndLine(countPct, null)).toBe('no data');
  });

  it('reports differences in the display unit', () => {
    expect(fmtRateDiff(pct, 0.15, 0.1)).toBe('+5.0 pt');
    expect(fmtRateDiff(per28, 0.01, 0.02)).toBe('−0.28 / 28 d');
  });

  it('labels units and the n/d line from the population', () => {
    expect(metricUnit(countPct)).toBe('n (% enr.)');
    expect(metricUnit(per28)).toBe('/ 28 d');
    expect(metricUnit(pct)).toBe('% scr.');
    expect(ndLine(countPct, { Numerator: 5, Denominator: 988 })).toBe('of 988 enrolled');
    expect(ndLine(pct, { Numerator: 5, Denominator: 988 })).toBe('5 / 988');
  });

  it('defaults metrics without a rule to Released percentages', () => {
    expect(normalizeMetric({ MetricID: 'x' })).toMatchObject({ Display: 'pct', Status: 'Released' });
  });
});

describe('groupByCategory', () => {
  it('orders buckets by the catalog, keeps metric order, and drops empty buckets', () => {
    const groups = groupByCategory([
      { id: 1, Category: 'Data quality' },
      { id: 2, Category: 'Disposition' },
      { id: 3, Category: 'Mystery' },
      { id: 4, Category: 'Disposition' },
      { id: 5 },
    ]);
    expect(groups.map((g) => g.category)).toEqual(['Disposition', 'Data quality', OTHER_CATEGORY]);
    expect(groups[0].metrics.map((m) => m.id)).toEqual([2, 4]);
    expect(groups[2].metrics.map((m) => m.id)).toEqual([3, 5]);
  });
});

describe('catalog in the example portfolio', () => {
  let store;
  beforeAll(() => {
    store = new PortfolioStore(generatePortfolio());
  });

  it('assigns every site-level metric a known category and status', () => {
    for (const m of store.supportedMetrics()) {
      expect(CATEGORY_ORDER).toContain(m.Category);
      expect(STATUS_ORDER).toContain(m.Status);
    }
  });

  it('filters visible metrics by status', () => {
    const all = store.visibleMetrics().length;
    const planned = store.visibleMetrics().filter((m) => m.Status === 'Planned').length;
    expect(planned).toBeGreaterThan(0);
    store.toggleStatus('Planned');
    expect(store.visibleMetrics().length).toBe(all - planned);
    expect(store.visibleMetrics().some((m) => m.Status === 'Planned')).toBe(false);
    store.toggleStatus('Planned');
    expect(store.visibleMetrics().length).toBe(all);
  });

  it('sums screened ≥ enrolled ≥ dosed populations across studies', () => {
    const pop = store.population(store.studies);
    const one = store.population([store.studies[0]]);
    expect(pop.enrolled).toBe(store.studies.reduce((s, st) => s + store.population([st]).enrolled, 0));
    expect(one.screened).toBeGreaterThanOrEqual(one.enrolled);
    expect(one.enrolled).toBeGreaterThanOrEqual(one.dosed);
    expect(store.population([])).toEqual({ screened: null, enrolled: null, dosed: null });
  });
});

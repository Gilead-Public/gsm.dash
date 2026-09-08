import { describe, it, expect } from 'vitest';
import { parseListField, pivotGroups, orderMetrics, indexResults } from '../src/data/normalize.js';

describe('parseListField', () => {
  it('parses Reporting_Metrics comma-delimited strings', () => {
    expect(parseListField('-2,-1,2,3')).toEqual([-2, -1, 2, 3]);
    expect(parseListField(' -2, -1 ')).toEqual([-2, -1]);
  });
  it('tolerates NA, empty, and missing values', () => {
    expect(parseListField('NA')).toEqual([]);
    expect(parseListField('')).toEqual([]);
    expect(parseListField(undefined)).toEqual([]);
  });
});

describe('pivotGroups', () => {
  it('pivots EAV rows to per-group objects', () => {
    const groups = pivotGroups([
      { GroupID: 'S1', GroupLevel: 'Study', Param: 'phase', Value: 'P3' },
      { GroupID: 'S1', GroupLevel: 'Study', Param: 'status', Value: 'Active' },
      { GroupID: 'SITE1', GroupLevel: 'Site', Param: 'Country', Value: 'US' },
    ]);
    expect(groups.get('S1')).toEqual({ phase: 'P3', status: 'Active' });
    expect(groups.get('SITE1')).toEqual({ Country: 'US' });
  });
});

describe('orderMetrics', () => {
  it('filters inactive metrics into their own list and sorts by Priority then MetricID', () => {
    const { active, inactive } = orderMetrics([
      { MetricID: 'Analysis_kri0002', Priority: 2 },
      { MetricID: 'Analysis_kri0001', Priority: 1 },
      { MetricID: 'Analysis_kri0013', Priority: 13, Active: false },
      { MetricID: 'Analysis_zzz' }, // no priority -> last
    ]);
    expect(active.map((m) => m.MetricID)).toEqual(['Analysis_kri0001', 'Analysis_kri0002', 'Analysis_zzz']);
    expect(inactive.map((m) => m.MetricID)).toEqual(['Analysis_kri0013']);
  });
});

describe('indexResults', () => {
  it('splits rows by metric and group level', () => {
    const idx = indexResults([
      { MetricID: 'M1', GroupLevel: 'Study', GroupID: 'S1' },
      { MetricID: 'M1', GroupLevel: 'Site', GroupID: 'SITE1' },
      { MetricID: 'M1', GroupLevel: 'Site', GroupID: 'SITE2' },
    ]);
    expect(idx.get('M1').study).toHaveLength(1);
    expect(idx.get('M1').site).toHaveLength(2);
  });
});

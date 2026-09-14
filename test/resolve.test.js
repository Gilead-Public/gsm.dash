import { describe, it, expect, beforeAll } from 'vitest';
import { PortfolioStore } from '../src/data/store.js';
import { resolveData } from '../src/widgets/resolve.js';
import { chartConfig, clone } from '../src/widgets/viz/adapter.js';
import { generatePortfolio } from '../scripts/generate-example-data.mjs';

let store;
let study;
beforeAll(() => {
  store = new PortfolioStore(generatePortfolio());
  study = store.studies[0];
});

describe('dataSpec resolution for the gsm.viz adapters', () => {
  const metricId = 'Analysis_kri0001';

  it('bounds: the latest snapshot carries Reporting_Bounds rows for the metric', () => {
    const data = resolveData({ results: 'self', bounds: 'self' }, { store, studyId: study.StudyID, metricId });
    expect(data.bounds.length).toBeGreaterThan(0);
    expect(new Set(data.bounds.map((b) => b.MetricID))).toEqual(new Set([metricId]));
    expect(new Set(data.bounds.map((b) => b.Threshold))).toEqual(new Set([-2, -1, 0, 2, 3]));
  });

  it('groups: Reporting_Groups EAV rows in gsm.viz groupMetadata form, with ParticipantCount for sites', () => {
    const { groups } = resolveData({ groups: 'self' }, { store, studyId: study.StudyID });
    const siteRows = groups.filter((g) => g.GroupLevel === 'Site');
    expect(siteRows.some((g) => g.Param === 'ParticipantCount')).toBe(true);
    for (const g of groups) expect(Object.keys(g).sort()).toEqual(['GroupID', 'GroupLevel', 'Param', 'Value']);
  });

  it('history: site rows across every snapshot of the study, each stamped with its SnapshotDate', () => {
    const { history, metric } = resolveData({ history: 'self' }, { store, studyId: study.StudyID, metricId });
    expect(metric.MetricID).toBe(metricId);
    expect(new Set(history.map((r) => r.SnapshotDate))).toEqual(new Set(study.snapshots));
    expect(history.every((r) => r.GroupLevel === 'Site')).toBe(true);
  });
});

describe('gsm.viz adapter helpers', () => {
  it('chartConfig carries the metric metadata gsm.viz validates, plus overrides', () => {
    const metric = store.metrics[0];
    const config = chartConfig(metric, { y: 'Metric' });
    for (const k of ['MetricID', 'GroupLevel', 'Abbreviation', 'Numerator', 'Denominator', 'Metric', 'Score', 'Threshold']) {
      expect(config[k], k).toBeDefined();
    }
    expect(config.y).toBe('Metric');
    expect(config.maintainAspectRatio).toBe(false);
    expect(config.thresholds).toBeUndefined(); // normalized-only fields stay out of gsm.viz config
  });

  it('clone hands gsm.viz its own row objects (it mutates them)', () => {
    const rows = store.siteRows(study.StudyID, store.latestDate(study.StudyID), 'Analysis_kri0001');
    const copies = clone(rows);
    copies[0].mutated = true;
    expect(rows[0].mutated).toBeUndefined();
  });
});

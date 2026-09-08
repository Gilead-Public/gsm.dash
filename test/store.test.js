import { describe, it, expect, beforeAll } from 'vitest';
import { PortfolioStore } from '../src/data/store.js';
import { generatePortfolio } from '../scripts/generate-example-data.mjs';

// Design decision (2026-09-02): site-level metrics are the dashboard's core
// input. Study and portfolio rates are DERIVED by pooling site rows; the
// pipeline's study-level rows are never read. Study-/country-/participant-
// level metrics are held back until a future release adds that plumbing.

let store;
beforeAll(() => {
  store = new PortfolioStore(generatePortfolio());
});

describe('site-level input model', () => {
  it('derives each study value by pooling that study’s site rows', () => {
    const study = store.studies[0];
    const date = store.latestDate(study.StudyID);
    const metricId = 'Analysis_kri0001';
    const sites = store.siteRows(study.StudyID, date, metricId);
    const num = sites.reduce((s, r) => s + r.Numerator, 0);
    const den = sites.reduce((s, r) => s + r.Denominator, 0);
    const derived = store.studyRollup(study.StudyID, date, metricId);
    expect(derived).toMatchObject({ Numerator: num, Denominator: den, NumSites: sites.length });
    expect(derived.Metric).toBeCloseTo(num / den, 10);
  });

  it('pools the portfolio across every contributing site, counting distinct studies', () => {
    const r = store.rollup(store.studies, 'Analysis_kri0001');
    expect(r.NumStudies).toBe(store.studies.length);
    expect(r.NumSites).toBeGreaterThan(store.studies.length);
    expect(r.Rate).toBeCloseTo(r.Numerator / r.Denominator, 10);
    expect(r.flags.total).toBe(r.NumSites);
  });

  it('one-study rollup equals the derived study value', () => {
    const study = store.studies[3];
    const date = store.latestDate(study.StudyID);
    const one = store.rollup([study], 'Analysis_kri0004');
    const derived = store.studyRollup(study.StudyID, date, 'Analysis_kri0004');
    expect(one.Numerator).toBe(derived.Numerator);
    expect(one.Denominator).toBe(derived.Denominator);
  });

  it('holds back non-site-level metrics from every view', () => {
    const qtl = store.metrics.find((m) => m.MetricID === 'Analysis_qtl0001');
    expect(qtl.GroupLevel).toBe('Study');
    expect(store.supportedMetrics().map((m) => m.MetricID)).not.toContain('Analysis_qtl0001');
    expect(store.visibleMetrics().map((m) => m.MetricID)).not.toContain('Analysis_qtl0001');
    expect(store.unsupportedMetrics().map((m) => m.MetricID)).toEqual(['Analysis_qtl0001']);
    // and there is nothing to derive from, so the study value is null rather than wrong
    const s = store.studies[0];
    expect(store.studyRollup(s.StudyID, store.latestDate(s.StudyID), 'Analysis_qtl0001')).toBeNull();
  });
});

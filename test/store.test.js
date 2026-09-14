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

describe('enrollment column', () => {
  it('sums ParticipantCount over each study’s latest snapshot', () => {
    const studies = store.studies.slice(0, 4);
    const expected = studies.reduce(
      (sum, s) => sum + Number(store.studyParamsAt(s.StudyID, store.latestDate(s.StudyID)).ParticipantCount),
      0
    );
    const e = store.enrollment(studies);
    expect(e.enrolled).toBe(expected);
    expect(e.nStudies).toBe(studies.length);
    expect(e.nCounted).toBe(studies.length);
  });

  it('the portfolio total equals the sum of its study rows', () => {
    const perStudy = store.studies.reduce((sum, s) => sum + store.enrollment([s]).enrolled, 0);
    expect(store.enrollment(store.studies).enrolled).toBe(perStudy);
  });

  it('follows asOf rather than always reading the newest snapshot', () => {
    const study = store.studies.find((s) => s.snapshots.length > 1);
    const [first] = study.snapshots;
    expect(store.studyParamsAt(study.StudyID, first)).toBe(
      store.snapshotIndex.get(study.StudyID).get(first).groupParams.get(study.StudyID)
    );
  });

  it('reports null rather than 0 when no study carries a count', () => {
    expect(store.enrollment([]).enrolled).toBeNull();
  });
});

describe('tile view state', () => {
  it('setTileViews replaces the whole map and emits once', () => {
    let changes = 0;
    const onChange = () => { changes += 1; };
    store.addEventListener('change', onChange);
    store.setTileViews([
      ['Analysis_kri0001', 'scatter-mini'],
      ['Analysis_kri0002', 'flag-dist'],
    ]);
    store.removeEventListener('change', onChange);
    expect(changes).toBe(1);
    expect(store.state.tileViews.get('Analysis_kri0001')).toBe('scatter-mini');
    expect(store.state.tileViews.get('Analysis_kri0002')).toBe('flag-dist');
    expect(store.state.tileViews.size).toBe(2); // replaced, not merged
    store.setAllTileViews(null); // back to per-metric defaults
    expect(store.state.tileViews.size).toBe(0);
  });
});

describe('cross-chart site highlight', () => {
  it('selects, re-selects to clear, and emits each time', () => {
    let changes = 0;
    const onChange = () => { changes += 1; };
    store.addEventListener('change', onChange);
    store.selectSite('SITE0001');
    expect(store.state.selectedSite).toBe('SITE0001');
    store.selectSite('SITE0002');
    expect(store.state.selectedSite).toBe('SITE0002');
    store.selectSite('SITE0002'); // same site again clears it
    expect(store.state.selectedSite).toBeNull();
    store.removeEventListener('change', onChange);
    expect(changes).toBe(3);
  });
});

describe('visit scrubbing via asOf', () => {
  it('an earlier asOf resolves each study to its own snapshot at that date', () => {
    const study = store.studies.find((s) => s.snapshots.length >= 3);
    const earlier = study.snapshots[1];
    store.set('asOf', earlier);
    expect(store.latestDate(study.StudyID)).toBe(earlier);
    // The rollup follows the scrubber, which is what makes the animation work.
    const scrubbed = store.studyRollup(study.StudyID, store.latestDate(study.StudyID), 'Analysis_kri0001');
    store.set('asOf', null);
    const latest = store.studyRollup(study.StudyID, store.latestDate(study.StudyID), 'Analysis_kri0001');
    expect(store.latestDate(study.StudyID)).toBe(study.snapshots.at(-1));
    expect(scrubbed).not.toEqual(latest);
  });

  it('an asOf before every snapshot drops the study rather than guessing', () => {
    const study = store.studies[0];
    store.set('asOf', '2000-01-01');
    expect(store.latestDate(study.StudyID)).toBeNull();
    store.set('asOf', null);
  });
});

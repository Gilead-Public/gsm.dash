import { describe, it, expect } from 'vitest';
import { generatePortfolio, METRICS } from '../scripts/generate-example-data.mjs';
import { buildDistributionModel, NEUTRAL_COLOUR, NOT_RECORDED, sumSitesToStudy } from '../src/data/distributions.js';
import { DISTRIBUTION_CONFIG, distributionConfig } from '../src/config/distributions.js';
import { categoryName, expectedView, studyTotals } from './qual/distributions.js';

const { manifest, snapshots } = generatePortfolio();
const latest = manifest.studies.map((s) => snapshots.find((x) => x.StudyID === s.StudyID && x.SnapshotDate === s.snapshots.at(-1)));
const configured = METRICS.filter((m) => DISTRIBUTION_CONFIG[m.ID]);
const rowsFor = (snap, metric) => snap.distributions.filter((d) => d.MetricID === metric.MetricID);
const studyRow = (snap, metric) => {
  const sites = snap.results.filter((r) => r.GroupLevel === 'Site' && r.MetricID === metric.MetricID);
  return { Numerator: sites.reduce((a, r) => a + r.Numerator, 0), Denominator: sites.reduce((a, r) => a + r.Denominator, 0) };
};

const site = (GroupID, Category, Count, Total, over = {}) => ({
  GroupID, GroupLevel: 'Site', MetricID: 'Analysis_x', Source: 'Numerator', Variable: 'reason', Category, Count, Participants: Count, Total, Percent: Total ? Count / Total : null, ...over,
});
const metric = { ID: 'x', Metric: 'Example Rate' };
const model = (rows, config, study = { Numerator: 10, Denominator: 100 }) => buildDistributionModel({ rows, metric, study, config });
const labels = (section) => section.bars.map((b) => b.label);

/** sumSitesToStudy output in the independent helper's shape, so the two compare as whole structures. */
function asTotals(sections) {
  const out = {};
  for (const s of sections) {
    out[s.Source] ??= {};
    out[s.Source][s.Variable] = {
      Total: s.Total,
      categories: Object.fromEntries(s.categories.map((c) => [categoryName(c.Category), { Count: c.Count, Participants: c.Participants }])),
    };
  }
  return out;
}

function withoutSiteTotals(totals) {
  return Object.fromEntries(Object.entries(totals).map(([source, vars]) => [source, Object.fromEntries(Object.entries(vars).map(([v, { Total, categories }]) => [v, { Total, categories }]))]));
}

const round = (x) => (x == null ? null : Math.round(x * 1e12) / 1e12);
const viewOf = (sections) => sections.map((s) => ({
  Source: s.source, Variable: s.variable, title: s.title, twoPercentages: s.enrolledLabel !== null,
  bars: s.bars.map((b) => ({ label: b.label, kind: b.kind, count: b.count, population: round(b.population), enrolled: round(b.enrolled) })),
}));
const expectedOf = (view) => view.map(({ Source, Variable, title, twoPercentages, bars }) => ({
  Source, Variable, title, twoPercentages,
  bars: bars.map((b) => ({ ...b, population: round(b.population), enrolled: round(b.enrolled) })),
}));

describe('site-to-study summing', () => {
  it('10.03: sumSitesToStudy equals an independent sum, as a whole structure, for every configured metric and study (#10)', () => {
    let compared = 0;
    for (const snap of latest) {
      for (const m of configured) {
        const rows = rowsFor(snap, m);
        expect(rows.length, `${snap.StudyID} ${m.ID}`).toBeGreaterThan(0);
        expect(asTotals(sumSitesToStudy(rows)), `${snap.StudyID} ${m.ID}`).toEqual(withoutSiteTotals(studyTotals(rows)));
        compared++;
      }
    }
    expect(compared).toBe(latest.length * configured.length);
  });

  it('10.03: summing one group equals an independent sum of that site alone, as a whole structure (#10)', () => {
    let compared = 0;
    for (const m of configured) {
      const rows = rowsFor(latest[0], m);
      for (const groupId of [...new Set(rows.map((r) => r.GroupID))].slice(0, 3)) {
        const mine = asTotals(sumSitesToStudy(rows, { groupId }));
        expect(Object.keys(mine).length).toBeGreaterThan(0);
        expect(mine).toEqual(withoutSiteTotals(studyTotals(rows, groupId)));
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(configured.length);
  });

  it('10.03: each site Total counts once however many categories repeat it (#10)', () => {
    const rows = [site('A', 'x', 1, 5), site('A', 'y', 2, 5), site('B', 'x', 3, 7)];
    expect(sumSitesToStudy(rows)[0]).toMatchObject({ Total: 12 });
  });
});

describe('displayed values in the model', () => {
  it('10.02: every section, bar, count and percentage, including collapsed bars, equals the independent expectation (#10)', () => {
    let compared = 0;
    for (const snap of latest) {
      for (const m of configured) {
        const rows = rowsFor(snap, m);
        const study = studyRow(snap, m);
        const config = distributionConfig(m);
        const result = buildDistributionModel({ rows, metric: m, study, config });
        expect(result.state).toBe('ok');
        expect(viewOf(result.sections), `${snap.StudyID} ${m.ID}`).toEqual(expectedOf(expectedView(rows, config, study)));
        compared++;
      }
    }
    expect(compared).toBe(latest.length * configured.length);
  });

  it('10.02: the header shows the metric numerator, denominator and rate summed from site results (#10)', () => {
    for (const snap of latest) {
      for (const m of configured) {
        const study = studyRow(snap, m);
        const { header } = buildDistributionModel({ rows: rowsFor(snap, m), metric: m, study, config: distributionConfig(m) });
        expect(header).toEqual({ name: m.Metric, numerator: study.Numerator, denominator: study.Denominator, percent: study.Numerator / study.Denominator });
      }
    }
  });
});

describe('one group', () => {
  const rows = [site('S1', 'x', 10, 20), site('S2', 'x', 30, 40)];
  const siteRows = [{ GroupID: 'S1', Numerator: 20, Denominator: 100 }, { GroupID: 'S2', Numerator: 40, Denominator: 100 }];
  const study = { Numerator: 60, Denominator: 200 };
  const config = { enrolledPercent: true };

  it('10.02: for one site the header and both percentages use that site totals, not the study rollup (#10)', () => {
    const m = buildDistributionModel({ rows, metric, study, siteRows, config, groupId: 'S1' });
    expect(m.header).toMatchObject({ numerator: 20, denominator: 100, percent: 0.2 });
    expect(m.sections[0].bars[0]).toMatchObject({ count: 10, population: 0.5, enrolled: 0.1 });
  });

  it('10.02: without a group the same rows use the study totals (#10)', () => {
    const m = buildDistributionModel({ rows, metric, study, siteRows, config });
    expect(m.header).toMatchObject({ numerator: 60, denominator: 200 });
    expect(m.sections[0].bars[0]).toMatchObject({ count: 40, population: 40 / 60, enrolled: 0.2 });
  });

  it('10.02: a group with no results row shows no percentages rather than study ones (#10)', () => {
    const m = buildDistributionModel({ rows: [site('S9', 'x', 1, 2)], metric, study, siteRows, config, groupId: 'S9' });
    expect(m.header.percent).toBeNull();
    expect(m.sections[0].bars[0].enrolled).toBeNull();
  });
});

describe('status colours', () => {
  const rows = [site('A', 'Ongoing', 3, 10, { Variable: 'status' }), site('A', 'Completed', 7, 10, { Variable: 'status' }), site('A', 'Other reason', 2, 10)];

  it('10.06: status categories take their configured colours (#10)', () => {
    const m = model(rows, { statusVariables: ['status'], colours: { Ongoing: '#2e7d32', Completed: '#1565c0' } });
    const status = m.sections.find((s) => s.variable === 'status');
    expect(Object.fromEntries(status.bars.map((b) => [b.label, b.colour]))).toEqual({ Completed: '#1565c0', Ongoing: '#2e7d32' });
  });

  it('10.06: without a colour map, status categories use the neutral colour (#10)', () => {
    const status = model(rows, { statusVariables: ['status'] }).sections.find((s) => s.variable === 'status');
    expect(status.bars.every((b) => b.colour === NEUTRAL_COLOUR)).toBe(true);
  });

  it('10.06: reason categories are not coloured (#10)', () => {
    const reason = model(rows, { statusVariables: ['status'], colours: { 'Other reason': '#000' } }).sections.find((s) => s.variable === 'reason');
    expect(reason.bars.every((b) => b.colour === null)).toBe(true);
  });
});

describe('ordering, collapsing, footnotes and states', () => {
  it('10.07: bars sort by descending count, ties keeping category order (#10)', () => {
    const rows = [site('A', 'b', 2, 20), site('A', 'a', 5, 20), site('A', 'c', 2, 20), site('A', 'd', 9, 20)];
    expect(labels(model(rows, {}).sections[0])).toEqual(['d', 'a', 'b', 'c']);
  });

  it('10.07: "Not recorded" comes last even when it is the largest (#10)', () => {
    const rows = [site('A', null, 50, 60), site('A', 'a', 4, 60), site('A', 'b', 6, 60)];
    expect(labels(model(rows, {}).sections[0])).toEqual(['b', 'a', NOT_RECORDED]);
  });

  it('10.07: a zero "Not recorded" is hidden (#10)', () => {
    const rows = [site('A', 'a', 4, 4), site('A', null, 0, 4)];
    expect(labels(model(rows, {}).sections[0])).toEqual(['a']);
  });

  it('10.07: top-N collapses the rest into one "+ k more" bar holding their sum (#10)', () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].map((c, i) => site('A', c, 10 - i, 40)).concat(site('A', null, 1, 40));
    const s = model(rows, { topN: 2 }).sections[0];
    expect(labels(s)).toEqual(['a', 'b', '+ 3 more', NOT_RECORDED]);
    expect(s.bars[2]).toMatchObject({ kind: 'more', count: 8 + 7 + 6 });
  });

  it('10.07: a footnote explains counts above the total for multi-value variables (#10)', () => {
    const rows = [site('A', 'x', 3, 4), site('A', 'y', 2, 4)];
    expect(model(rows, {}).sections[0].footnotes).toContain('multi');
    expect(model([site('A', 'x', 3, 4), site('A', 'y', 1, 4)], {}).sections[0].footnotes).not.toContain('multi');
  });

  it('10.07: a footnote explains "Not recorded" when it is present (#10)', () => {
    expect(model([site('A', 'x', 3, 4), site('A', null, 1, 4)], {}).sections[0].footnotes).toEqual(['not-recorded']);
  });

  it('10.07: numerator sections come before denominator sections (#10)', () => {
    const rows = [site('A', 'd', 3, 9, { Source: 'Denominator', Variable: 'status' }), site('A', 'n', 1, 1)];
    expect(model(rows, {}).sections.map((s) => s.source)).toEqual(['Numerator', 'Denominator']);
  });

  it('10.07: a configured metric with no rows for it is empty (#10)', () => {
    expect(model([], {})).toMatchObject({ state: 'empty', reason: 'no-rows' });
  });

  it('10.07: a snapshot that publishes no distributions is empty and says so (#10)', () => {
    expect(model(undefined, {})).toMatchObject({ state: 'empty', reason: 'not-published' });
  });

  it('10.07: a metric without a distribution configuration is missing (#10)', () => {
    expect(model([site('A', 'x', 1, 1)], null).state).toBe('missing');
  });
});

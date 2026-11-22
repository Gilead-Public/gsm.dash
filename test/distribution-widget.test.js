import { describe, it, expect } from 'vitest';
import { generatePortfolio, METRICS } from '../scripts/generate-example-data.mjs';
import { buildDistributionModel, NEUTRAL_COLOUR, NOT_RECORDED, sumSitesToStudy } from '../src/data/distributions.js';
import { DISTRIBUTION_CONFIG, distributionConfig } from '../src/config/distributions.js';
import { renderDistribution } from '../src/widgets/distribution-bar.js';
import { categoryName, countBy, expectedView, jointRecount, studyTotals } from './qual/distributions.js';

const { manifest, snapshots, records } = generatePortfolio();
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
  Source: s.source, Variable: s.variable, title: s.title, display: s.display,
  bars: s.bars.map((b) => ({ label: b.label, kind: b.kind, count: b.count, percent: round(b.percent), hover: { count: b.count, of: s.total } })),
}));
const expectedOf = (view) => view.map(({ Source, Variable, title, display, bars }) => ({
  Source, Variable, title, display,
  bars: bars.map((b) => ({ ...b, percent: round(b.percent) })),
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

  it('10.03: rows at country or study level are left out, never summed as extra sites (#10)', () => {
    const rows = [site('S1', 'x', 2, 10), site('S2', 'x', 3, 20)];
    const other = [site('US', 'x', 5, 30, { GroupLevel: 'Country' }), site('STUDY001', 'x', 5, 30, { GroupLevel: 'Study' })];
    expect(sumSitesToStudy([...rows, ...other])).toEqual(sumSitesToStudy(rows));
    expect(sumSitesToStudy([...rows, ...other])[0]).toMatchObject({ Total: 30, categories: [{ Category: 'x', Count: 5 }] });
    expect(withoutSiteTotals(studyTotals([...rows, ...other]))).toEqual(withoutSiteTotals(studyTotals(rows)));
  });

  it('10.03: each site Total counts once however many categories repeat it (#10)', () => {
    const rows = [site('A', 'x', 1, 5), site('A', 'y', 2, 5), site('B', 'x', 3, 7)];
    expect(sumSitesToStudy(rows)[0]).toMatchObject({ Total: 12 });
  });
});

describe('displayed values in the model', () => {
  it('10.02: every section, bar, percentage, count and hover value, including collapsed bars, equals the independent expectation (#10)', () => {
    let compared = 0;
    for (const snap of latest) {
      for (const m of configured) {
        const rows = rowsFor(snap, m);
        const study = studyRow(snap, m);
        const config = distributionConfig(m);
        const result = buildDistributionModel({ rows, metric: m, study, config });
        expect(result.state).toBe('ok');
        expect(viewOf(result.sections), `${snap.StudyID} ${m.ID}`).toEqual(expectedOf(expectedView(rows, config)));
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
  const status = { Source: 'Denominator', Variable: 'status' };
  const rows = [site('S1', 'x', 10, 20, status), site('S2', 'x', 30, 40, status)];
  const siteRows = [{ GroupID: 'S1', Numerator: 20, Denominator: 100 }, { GroupID: 'S2', Numerator: 40, Denominator: 100 }];
  const study = { Numerator: 60, Denominator: 200 };

  it('10.02: for one site the header, percentages and hover use that site, not the study rollup (#10)', () => {
    const m = buildDistributionModel({ rows, metric, study, siteRows, config: {}, groupId: 'S1' });
    expect(m.header).toMatchObject({ numerator: 20, denominator: 100, percent: 0.2 });
    expect(m.sections[0]).toMatchObject({ display: 'percent', total: 20 });
    expect(m.sections[0].bars[0]).toMatchObject({ count: 10, percent: 0.5 });
  });

  it('10.02: without a group the same rows use the study totals (#10)', () => {
    const m = buildDistributionModel({ rows, metric, study, siteRows, config: {} });
    expect(m.header).toMatchObject({ numerator: 60, denominator: 200 });
    expect(m.sections[0]).toMatchObject({ display: 'percent', total: 60 });
    expect(m.sections[0].bars[0]).toMatchObject({ count: 40, percent: 40 / 60 });
  });

  it('10.02: a group with no results row shows no header percentage rather than the study one (#10)', () => {
    const m = buildDistributionModel({ rows: [site('S9', 'x', 1, 2, status)], metric, study, siteRows, config: {}, groupId: 'S9' });
    expect(m.header.percent).toBeNull();
  });
});

describe('one value per bar', () => {
  it('10.07: top-N in a status section gives the "+ k more" bar the share of the rest (#10)', () => {
    const status = { Source: 'Denominator', Variable: 'status' };
    const rows = [site('S1', 'a', 5, 20, status), site('S1', 'b', 3, 20, status), site('S1', 'c', 2, 20, status)];
    const [s] = model(rows, { sections: { 'Denominator:status': { topN: 1 } } }).sections;
    expect(s.bars.map((b) => [b.label, b.count, b.percent])).toEqual([['a', 5, 0.25], ['+ 2 more', 5, 0.25]]);
  });

  const rows = [site('S1', 'a', 3, 10), site('S1', 'ok', 6, 30, { Source: 'Denominator', Variable: 'status' })];
  const config = { sections: { 'Denominator:status': { percentLabel: '% of enrolled' } } };

  it('10.09: a reason section shows counts with no percentage, and a status section shows percentages named by its population (#10)', () => {
    const [reason, status] = model(rows, config).sections;
    expect(reason).toMatchObject({ source: 'Numerator', display: 'count', valueLabel: 'n' });
    expect(reason.bars[0]).toMatchObject({ count: 3, percent: null });
    expect(status).toMatchObject({ source: 'Denominator', display: 'percent', valueLabel: '% of enrolled' });
    expect(status.bars[0]).toMatchObject({ count: 6, percent: 0.2 });
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

describe('a card\'s one breakdown (#10)', () => {
  const ie = METRICS.find((m) => m.ID === 'kri0014');
  const deaths = METRICS.find((m) => m.ID === 'kri0015');
  const JOINT = { rows: 'Numerator:death_window', columns: ['Numerator:window_eligibility', 'Numerator:window_treatment_related'] };

  it('10.10: a card naming one section gets exactly that section, and a section with no rows is empty (#10)', () => {
    for (const snap of latest) {
      const build = (only) => buildDistributionModel({ rows: rowsFor(snap, ie), metric: ie, study: studyRow(snap, ie), config: distributionConfig(ie), only });
      for (const key of ['Denominator:eligibility_status', 'Numerator:ietestcd_concat']) {
        const m = build([key]);
        expect(m.sections.map((s) => `${s.source}:${s.variable}`), `${snap.StudyID} ${key}`).toEqual([key]);
      }
      expect(build(['Numerator:nothing'])).toMatchObject({ state: 'empty', reason: 'no-rows' });
    }
  });

  it('10.11: the counts on each of widget 4\'s three cards equal an independent recount of the fixture\'s simulated death records, in every study (#10)', () => {
    let bars = 0;
    for (const snap of latest) {
      const sets = [...records].filter(([k]) => k.startsWith(`${snap.StudyID}|${snap.SnapshotDate}|`) && k.endsWith(`|${deaths.MetricID}`)).map(([, v]) => v.records);
      expect(sets.length, snap.StudyID).toBeGreaterThan(0);
      for (const variable of ['death_window', 'eligibility_status', 'treatment_related']) {
        const { sections } = buildDistributionModel({ rows: rowsFor(snap, deaths), metric: deaths, study: studyRow(snap, deaths), config: distributionConfig(deaths), only: [`Numerator:${variable}`] });
        expect(sections, `${snap.StudyID} ${variable}`).toHaveLength(1);
        const shown = sections[0].bars.filter((b) => b.count > 0).map((b) => [b.label, b.count]);
        const want = [...countBy(sets, variable)].map(([category, n]) => [category ?? NOT_RECORDED, n]);
        expect(Object.fromEntries(shown), `${snap.StudyID} ${variable}`).toEqual(Object.fromEntries(want));
        bars += shown.length;
      }
    }
    expect(bars).toBeGreaterThan(20);
  });

  it('the joint-count table kept for the premature-death design cycle still equals an independent recount of the fixture\'s simulated death records, in every study', () => {
    let cells = 0;
    for (const snap of latest) {
      const sets = [...records].filter(([k]) => k.startsWith(`${snap.StudyID}|${snap.SnapshotDate}|`) && k.endsWith(`|${deaths.MetricID}`)).map(([, v]) => v.records);
      expect(sets.length, snap.StudyID).toBeGreaterThan(0);
      const { joint } = buildDistributionModel({ rows: rowsFor(snap, deaths), metric: deaths, study: studyRow(snap, deaths), config: distributionConfig(deaths), joint: JOINT });
      const eligibility = jointRecount(sets, 'death_window', 'eligibility_status');
      const related = jointRecount(sets, 'death_window', 'treatment_related');
      expect(Object.fromEntries(joint.rows.map((r) => [r.label, r.total])), snap.StudyID).toEqual(Object.fromEntries([...eligibility.rows].map(([row, n]) => [row ?? NOT_RECORDED, n])));
      joint.groups.forEach((g, i) => {
        const want = [eligibility, related][i];
        for (const r of joint.rows) {
          g.columns.forEach((column, j) => {
            expect(r.cells[i][j], `${snap.StudyID} ${r.label} ${column}`).toBe(want.pairs.get(`${r.label}\u0000${column}`) ?? 0);
            cells++;
          });
        }
        const recounted = new Set([...want.pairs.keys()].map((k) => k.split('\u0000')[1]));
        expect(new Set(g.columns), `${snap.StudyID} ${g.label}: every recounted column is shown`).toEqual(new Set([...g.columns, ...recounted]));
      });
    }
    expect(cells).toBeGreaterThan(20);
  });

  it('the joint-count table kept for the premature-death design cycle counts blank windows in a Not recorded row with no cells, notes blanks, shows a pair with no rows as 0 and a row only the combined columns name without a count, and names an unlabelled section by its variable', () => {
    const at = (Variable, Category, Count) => site('S1', Category, Count, 10, { Variable });
    const rows = [
      at('death_window', '≤30', 3),
      at('death_window', null, 2),
      at('window_x', '≤30 | A', 2),
      at('window_x', '31–90 | B', 4),
      at('window_x', null, 1),
    ];
    const config = { sections: { 'Numerator:death_window': { label: 'Window', total: 'Deaths' } } };
    const { joint } = buildDistributionModel({ rows, metric, study: { Numerator: 10, Denominator: 100 }, config, joint: { rows: 'Numerator:death_window', columns: ['Numerator:window_x'] } });
    expect(joint).toEqual({
      rowLabel: 'Window',
      totalLabel: 'Deaths',
      groups: [{ key: 'Numerator:window_x', label: 'window_x', columns: ['A', 'B'] }],
      rows: [
        { label: '≤30', total: 3, cells: [[2, 0]] },
        { label: '31–90', total: null, cells: [[0, 4]] },
        { label: NOT_RECORDED, total: 2, cells: [[null, null]] },
      ],
      footnotes: ['not-recorded'],
    });
    const clean = rows.filter((r) => r.Category !== null);
    expect(buildDistributionModel({ rows: clean, metric, study: null, config, joint: { rows: 'Numerator:death_window', columns: ['Numerator:window_x'] } }).joint.footnotes).toEqual([]);
  });
});

describe('a breakdown that fits its card (#32)', () => {
  const ie = METRICS.find((m) => m.ID === 'kri0014');
  const only = ['Numerator:ietestcd_concat'];
  const criteria = ['IN01', 'IN02', 'IN03', 'IN04', 'EX01', 'EX02', 'EX03', 'EX04'];
  const rows = criteria
    .map((c, i) => site('A', c, 20 - i, 50, { MetricID: ie.MetricID, Variable: 'ietestcd_concat' }))
    .concat(site('A', null, 2, 50, { MetricID: ie.MetricID, Variable: 'ietestcd_concat' }));
  const data = { metric: ie, distributions: rows, study: { Numerator: 10, Denominator: 50 }, siteRows: [] };
  const shown = (el) => [...el.innerHTML.matchAll(/<span class="lbl">([^<]*)<\/span>/g)].map((m) => m[1]);
  // A laid-out box whose content is 20 px per bar row.
  const box = (clientHeight, isConnected = true) => ({
    dataset: {},
    attributes: new Set(),
    removeAttribute(name) {
      this.attributes.delete(name);
    },
    toggleAttribute(name, on) {
      if (on) this.attributes.add(name);
      else this.attributes.delete(name);
    },
    innerHTML: '',
    isConnected,
    clientHeight,
    get scrollHeight() {
      return (this.innerHTML.match(/class="dist-row /g) ?? []).length * 20;
    },
  });

  it('32.08: maxBars caps a section below its top-N, the rest going into "+ k more" before "Not recorded" (#32)', () => {
    const build = (maxBars) => buildDistributionModel({ rows, metric: ie, study: null, config: distributionConfig(ie), only, maxBars }).sections[0];
    expect(labels(build(Infinity))).toEqual(['IN01', 'IN02', 'IN03', 'IN04', 'EX01', '+ 3 more', NOT_RECORDED]);
    expect(labels(build(2))).toEqual(['IN01', 'IN02', '+ 6 more', NOT_RECORDED]);
    expect(build(2).bars[2]).toMatchObject({ kind: 'more', count: 18 + 17 + 16 + 15 + 14 + 13 });
  });

  it('32.08: the widget shows one bar fewer until the breakdown fits its box, down to one bar, marking a breakdown that fits, and shows its top-N when it fits or has no box (#32)', () => {
    const roomy = box(400);
    renderDistribution(roomy, data, { only });
    expect(shown(roomy)).toEqual(['IN01', 'IN02', 'IN03', 'IN04', 'EX01', '+ 3 more', NOT_RECORDED]);
    const five = box(100);
    renderDistribution(five, data, { only });
    expect(shown(five)).toEqual(['IN01', 'IN02', 'IN03', '+ 5 more', NOT_RECORDED]);
    expect(five.attributes.has('data-fits')).toBe(true);
    const tiny = box(20);
    renderDistribution(tiny, data, { only });
    expect(shown(tiny)).toEqual(['IN01', '+ 7 more', NOT_RECORDED]);
    expect(tiny.attributes.has('data-fits'), 'still too long at one bar, so the host makes room').toBe(false);
    for (const el of [box(20, false), box(0)]) {
      renderDistribution(el, data, { only });
      expect(shown(el)).toEqual(['IN01', 'IN02', 'IN03', 'IN04', 'EX01', '+ 3 more', NOT_RECORDED]);
    }
  });

  it('10.05: the widget has no header of its own: the card\'s header gives the value and n / N (#10)', () => {
    const el = box(400);
    renderDistribution(el, data, { only });
    expect(el.innerHTML).not.toMatch(/dist-head|dist-pct|dist-nd/);
    expect(el.innerHTML).not.toContain('10 / 50');
  });
});

describe('the top protocol-deviation categories (#19)', () => {
  const pd = METRICS.find((m) => m.ID === 'kri0004');
  const at = (GroupID, Category, Count, Total) => site(GroupID, Category, Count, Total, { MetricID: pd.MetricID, Variable: 'dvdecod' });
  const build = (rows, maxBars = Infinity) => buildDistributionModel({ rows, metric: pd, study: { Numerator: 40, Denominator: 4000 }, config: distributionConfig(pd), maxBars });
  const expected = (rows) => expectedView(rows, DISTRIBUTION_CONFIG.kri0004)[0].bars.map((b) => [b.label, b.count]);
  const shown = (model) => model.sections[0].bars.map((b) => [b.label, b.count]);

  it('19.01: the top 5 by count, summed over sites, equal the independent expectation, a tie at the cut going to the alphabetically first category whatever the rows\' order (#19)', () => {
    const rows = [
      at('S1', 'Study Procedures', 5, 30), at('S2', 'Study Procedures', 4, 19),
      at('S1', 'Investigational Product', 8, 30),
      at('S1', 'Eligibility Criteria', 7, 30),
      at('S2', 'Safety Reporting', 6, 19),
      at('S1', 'Visit Schedule', 5, 30),
      at('S2', 'Informed Consent', 5, 19),
      at('S2', 'Other', 2, 19),
    ];
    expect(shown(build(rows))).toEqual(expected(rows));
    expect(shown(build(rows))).toEqual([
      ['Study Procedures', 9], ['Investigational Product', 8], ['Eligibility Criteria', 7], ['Safety Reporting', 6], ['Informed Consent', 5], ['+ 2 more', 7],
    ]);
    expect(shown(build([...rows].reverse()))).toEqual(shown(build(rows)));
  });

  it('19.01: the top 5 are kept however little room the card has, and fewer categories than five are all shown (#19)', () => {
    const rows = ['A', 'B', 'C', 'D', 'E', 'F'].map((c, i) => at('S1', c, 10 - i, 45));
    expect(build(rows, 2).sections[0].bars.filter((b) => b.kind === 'category')).toHaveLength(5);
    const few = rows.slice(0, 3);
    expect(shown(build(few, 1))).toEqual(expected(few));
    expect(shown(build(few, 1))).toEqual([['A', 10], ['B', 9], ['C', 8]]);
  });
});

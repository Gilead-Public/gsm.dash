import { describe, it, expect, beforeEach } from 'vitest';
import { PortfolioStore, currentParams } from '../src/data/store.js';
import { enrollTarget } from '../src/app/portfolio-table.js';
import { generatePortfolio } from '../scripts/generate-example-data.mjs';

// The Cell display (#47): Compact folds every category to headline tiles; Detailed and Custom open every category.

let store;
const portfolio = generatePortfolio();
beforeEach(() => {
  store = new PortfolioStore(portfolio);
});
const cats = () => store.metricCategories().map((g) => g.category);

describe('table view', () => {
  it('47.02: lands on Compact, or on the configured Cell display (#47)', () => {
    expect(store.state.view).toBe('compact');
    expect(new PortfolioStore({ ...portfolio, config: { view: 'detailed' } }).state.view).toBe('detailed');
  });

  it('47.02: shows the heatmap under Custom only, whatever the heatmap setting (#47)', () => {
    store.set('heatmap', 'rate');
    expect(['compact', 'detailed', 'custom'].map((v) => (store.set('view', v), store.activeHeatmap()))).toEqual(['none', 'none', 'rate']);
  });

  it('47.03: opens every group when a grouping is chosen; a closed group travels in the address, and a new grouping or Reset opens it again (#47)', () => {
    store.set('groupBy', 'phase');
    const [first, second] = store.buckets().map((b) => String(b.value));
    expect(store.state.collapsed.size).toBe(0);
    store.toggleBucketOpen(first);
    expect(store.programParams().getAll('collapse')).toEqual([first]);
    const other = new PortfolioStore(portfolio);
    other.applyProgramParams(new URLSearchParams(store.programParams().toString()));
    expect([...other.state.collapsed]).toEqual([first]);
    other.applyProgramParams(new URLSearchParams(`group=phase&expand=${second}`));
    expect(other.state.collapsed.size, 'an old address\'s open groups are ignored').toBe(0);
    store.set('groupBy', 'status');
    expect(store.state.collapsed.size).toBe(0);
    store.set('groupBy', 'phase');
    store.toggleBucketOpen(first);
    store.reset();
    expect(store.state.collapsed.size).toBe(0);
  });
});

describe('highlight study (unwired, kept for a possible enhanced version)', () => {
  it('toggles: selecting the highlighted study again clears it', () => {
    const id = store.studies[2].StudyID;
    store.highlight(id);
    expect(store.state.highlightStudy).toBe(id);
    store.highlight(id);
    expect(store.state.highlightStudy).toBeNull();
    store.highlight(null);
    expect(store.state.highlightStudy).toBeNull();
  });
});

describe('URL params', () => {
  it('round-trips the view, and leaves a highlight out of the address', () => {
    store.set('view', 'detailed');
    store.highlight(store.studies[0].StudyID);
    const params = store.programParams();
    expect([...params.keys()]).toEqual(['view']);

    const other = new PortfolioStore(portfolio);
    other.applyProgramParams(new URLSearchParams(params.toString()));
    expect(other.state.view).toBe('detailed');
    expect(other.state.highlightStudy).toBeNull();
  });

  it('46.07: a study report keeps the portfolio\'s address in its current form: retired params removed, the old View rewritten, everything else as it was (#46)', () => {
    const old = 'statuses=Released&hide=a&hide=b&theme=dark&view=details&cell=custom&expand=P2&group=phase&collapse=P1&open=all&study=X&density=roomy&ramp=teal&dfold=Y';
    expect(currentParams(new URLSearchParams(old)).toString()).toBe('hide=a&hide=b&theme=dark&view=custom&group=phase&collapse=P1');
    expect(currentParams(new URLSearchParams('view=overview')).toString()).toBe('view=compact');
    expect(currentParams(new URLSearchParams('view=distribution&hide=a')).toString()).toBe('hide=a');
    const current = 'filter.study=STUDY001&view=detailed&perrow=3';
    expect(currentParams(new URLSearchParams(current)).toString()).toBe(current);
  });

  it('47.04: reads an old address\'s View and cell mode as the Cell display, and rewrites it in the new form (#47)', () => {
    const cases = [['view=overview', 'compact', ''], ['view=details', 'detailed', 'view=detailed'], ['view=details&cell=custom', 'custom', 'view=custom'], ['view=overview&cell=custom', 'compact', ''], ['view=details&study=NOPE', 'detailed', 'view=detailed']];
    for (const [old, view, written] of cases) {
      const s = new PortfolioStore(portfolio);
      s.applyProgramParams(new URLSearchParams(old));
      expect([s.state.view, s.programParams().toString()], old).toEqual([view, written]);
    }
  });

  it('ignores the retired settings in an old address: the Distribution view, its folds, open bands, row density and the highlighted study', () => {
    const [a, b] = cats();
    for (const old of [`view=distribution&dfold=${a}`, `view=mixed&open=${a}&open=${b}`, 'open=all', 'density=condensed', `study=${store.studies[0].StudyID}`]) {
      const s = new PortfolioStore(portfolio);
      s.applyProgramParams(new URLSearchParams(old));
      expect(viewState(s), old).toEqual(viewState(new PortfolioStore(portfolio)));
      expect(s.programParams().toString(), old).toBe('');
    }
  });

  it('27.05: writes no params for the default view, and no params restore every default (#27)', () => {
    expect(store.programParams().toString()).toBe('');
    changeEveryField(store);
    store.applyProgramParams(new URLSearchParams());
    expect(viewState(store)).toEqual(viewState(new PortfolioStore(portfolio)));
  });

  it('27.05: round-trips every field the portfolio carries to a study report and back (#27)', () => {
    changeEveryField(store);
    const fresh = viewState(new PortfolioStore(portfolio));
    const changed = viewState(store);
    for (const field of Object.keys(changed)) expect(changed[field], field).not.toEqual(fresh[field]);
    const url = store.programParams().toString();
    const other = new PortfolioStore(portfolio);
    other.applyProgramParams(new URLSearchParams(url));
    expect(viewState(other)).toEqual(changed);
    expect(other.programParams().toString()).toBe(url);
  });

  it('27.05: carries an emptied cell stack (#27)', () => {
    store.set('view', 'custom');
    for (const part of [...store.state.show]) store.toggleShow(part);
    const other = new PortfolioStore(portfolio);
    other.applyProgramParams(store.programParams());
    expect(other.state.show.size).toBe(0);
  });

  it('27.05: drops unknown values, keeping the defaults (#27)', () => {
    const junk = [
      'view=nope', 'open=Nope', 'study=NOPE', 'group=nickname', 'expand=Oncology', 'collapse=Oncology', 'sort=Nope', 'dir=desc',
      'cell=nope', 'show=nope', 'heatmap=nope', 'ramp=red', 'filter.phase=P9', 'filter.nope=1', 'statuses=Nope', 'hide=Nope',
      'theme=pink', 'perrow=9', 'cfgpanel=left', 'legend=maybe',
    ];
    store.applyProgramParams(new URLSearchParams(junk.join('&')));
    expect(viewState(store)).toEqual(viewState(new PortfolioStore(portfolio)));
    expect(store.programParams().toString()).toBe('');
    store.applyProgramParams(new URLSearchParams(`sort=${store.metrics[0].MetricID}&dir=sideways`));
    expect(store.state.sort).toEqual({ key: null, dir: null });
  });

  it('27.05: keeps study values that contain commas (#27)', () => {
    const [first, ...rest] = portfolio.manifest.studies;
    const studies = [{ ...first, params: { ...first.params, therapeutic_area: 'Cardiology, Renal' } }, ...rest];
    const data = { ...portfolio, manifest: { ...portfolio.manifest, studies } };
    const a = new PortfolioStore(data);
    a.set('groupBy', 'therapeutic_area');
    a.toggleBucketOpen('Cardiology, Renal');
    a.toggleFilter('therapeutic_area', 'Cardiology, Renal');
    const b = new PortfolioStore(data);
    b.applyProgramParams(new URLSearchParams(a.programParams().toString()));
    expect([...b.state.collapsed]).toEqual(['Cardiology, Renal']);
    expect([...b.state.filters.therapeutic_area]).toEqual(['Cardiology, Renal']);
  });

  it('27.05: a study report\'s store takes only the hidden metrics, those its hidden groups hide included (#27)', () => {
    changeEveryField(store);
    const study = new PortfolioStore(portfolio);
    study.applyMetricParams(store.programParams());
    const { hiddenMetrics } = viewState(store);
    const byGroup = store.metricCategories(store.supportedMetrics()).filter((g) => store.state.hiddenGroups.has(g.category)).flatMap((g) => g.metrics.map((m) => m.MetricID));
    expect(byGroup.length).toBeGreaterThan(0);
    expect(viewState(study)).toEqual({ ...viewState(new PortfolioStore(portfolio)), hiddenMetrics: [...new Set([...hiddenMetrics, ...byGroup])].sort() });
  });

  it('16.03: a study report shows exactly the metrics the portfolio shows, with groups hidden, while the portfolio keeps its checkboxes as they were (#16)', () => {
    const groups = [{ name: 'One', metrics: store.supportedMetrics().slice(0, 3).map((m) => m.MetricID), hidden: true }];
    const s = new PortfolioStore({ ...portfolio, config: { groups } });
    s.toggleMetric(s.supportedMetrics()[5].MetricID);
    s.toggleGroupHidden('Other');
    s.toggleGroupHidden('One');
    s.toggleGroupHidden('One');
    const params = s.programParams();
    const study = new PortfolioStore(portfolio);
    study.applyMetricParams(new URLSearchParams(params.toString()));
    expect(study.visibleMetrics().map((m) => m.MetricID)).toEqual(s.visibleMetrics().map((m) => m.MetricID));
    const back = new PortfolioStore({ ...portfolio, config: { groups } });
    back.applyProgramParams(new URLSearchParams(params.toString()));
    expect([...back.state.hiddenMetrics], 'the portfolio\'s checkboxes').toEqual([s.supportedMetrics()[5].MetricID]);
    expect(back.visibleMetrics().map((m) => m.MetricID)).toEqual(s.visibleMetrics().map((m) => m.MetricID));
  });
});

/** Every view setting 27.05 lists, sets as sorted arrays. */
describe('configured defaults (#16)', () => {
  const config = { groupBy: 'phase', heatmap: 'rate', show: ['den', 'trend'], metrics: ['Analysis_kri0003', 'Analysis_kri0004'], view: 'custom' };
  const configured = () => new PortfolioStore({ ...portfolio, config });

  it('opens with the configured view, and an empty hash restores it', () => {
    const s = configured();
    expect([s.state.groupBy, s.state.heatmap, [...s.state.show].sort(), [...s.state.hiddenMetrics].sort(), s.state.view]).toEqual(['phase', 'rate', ['den', 'trend'], config.metrics, 'custom']);
    const fresh = viewState(s);
    changeEveryField(s);
    s.applyProgramParams(new URLSearchParams());
    expect(viewState(s)).toEqual(fresh);
  });

  it('writes a setting changed back to its built-in default, and reads it back', () => {
    const s = configured();
    s.set('groupBy', 'none');
    s.set('heatmap', 'none');
    s.set('view', 'compact');
    s.toggleShow('den');
    s.toggleShow('trend');
    s.toggleShow('num');
    s.toggleShow('rate');
    for (const id of [...s.state.hiddenMetrics]) s.toggleMetric(id);
    const other = configured();
    other.applyProgramParams(new URLSearchParams(s.programParams().toString()));
    expect(viewState(other)).toEqual(viewState(new PortfolioStore(portfolio)));
  });

  it('always writes the hidden metrics, so a study report, which has no configuration, hides what the portfolio hid', () => {
    for (const change of [() => {}, (s) => s.toggleMetric('Analysis_kri0005'), (s) => [...s.state.hiddenMetrics].forEach((id) => s.toggleMetric(id))]) {
      const s = configured();
      change(s);
      const study = new PortfolioStore(portfolio);
      study.applyMetricParams(new URLSearchParams(s.programParams().toString()));
      expect(viewState(study).hiddenMetrics).toEqual(viewState(s).hiddenMetrics);
    }
  });
});

describe('the study filter and Reset (#22)', () => {
  it('limits the studies to those selected, combined with the other filters, and counts as an active filter', () => {
    const [a, , c] = store.studies;
    store.toggleFilter('study', a.StudyID);
    store.toggleFilter('study', c.StudyID);
    expect(store.filteredStudies().map((s) => s.StudyID)).toEqual([a.StudyID, c.StudyID]);
    expect(store.activeFilterCount()).toBe(2);
    store.toggleFilter('phase', a.params.phase);
    expect(store.filteredStudies().map((s) => s.StudyID)).toEqual([a, c].filter((s) => s.params.phase === a.params.phase).map((s) => s.StudyID));
    expect(store.filterOptions().study).toEqual(store.studies.map((s) => s.StudyID).sort());
    store.clearFilters();
    expect(store.filteredStudies()).toHaveLength(store.studies.length);
  });

  it('carries the study filter in the address', () => {
    store.toggleFilter('study', store.studies[1].StudyID);
    const params = store.programParams();
    expect(params.getAll('filter.study')).toEqual([store.studies[1].StudyID]);
    const other = new PortfolioStore(portfolio);
    other.applyProgramParams(new URLSearchParams(params.toString()));
    expect([...other.state.filters.study]).toEqual([store.studies[1].StudyID]);
  });

  it('Reset returns every setting the address holds to a fresh load, under the default and a configured view', () => {
    const config = { groupBy: 'phase', heatmap: 'rate', show: ['den'], metrics: ['Analysis_kri0003'], view: 'detailed' };
    for (const data of [portfolio, { ...portfolio, config }]) {
      const s = new PortfolioStore(data);
      const fresh = new PortfolioStore(data);
      fresh.applyProgramParams(new URLSearchParams());
      changeEveryField(s);
      s.reset();
      expect(viewState(s)).toEqual(viewState(fresh));
      expect(s.programParams().toString()).toBe(fresh.programParams().toString());
    }
  });
});

describe('table columns and view (#21)', () => {
  it('21.01: by default the table shows the study name, without Enrolled or Status, in Compact; a configuration sets both (#21)', () => {
    expect([[...store.state.columns], store.state.view]).toEqual([['name'], 'compact']);
    expect(store.programParams().toString()).toBe('');
    const s = new PortfolioStore({ ...portfolio, config: { columns: ['enroll', 'status'], view: 'detailed' } });
    expect([[...s.state.columns].sort(), s.state.view]).toEqual([['enroll', 'status'], 'detailed']);
    expect(s.programParams().toString()).toBe('');
  });

  it('21.01: the columns and view travel in the address, an emptied choice included, and unknown values are dropped (#21)', () => {
    store.toggleColumn('enroll');
    store.toggleColumn('status');
    store.set('view', 'detailed');
    const params = store.programParams();
    expect(params.getAll('cols')).toEqual(['name', 'enroll', 'status']);
    expect(params.get('view')).toBe('detailed');
    const other = new PortfolioStore(portfolio);
    other.applyProgramParams(new URLSearchParams(params.toString()));
    expect([[...other.state.columns].sort(), other.state.view]).toEqual([['enroll', 'name', 'status'], 'detailed']);
    other.toggleColumn('name');
    other.toggleColumn('enroll');
    other.toggleColumn('status');
    const empty = new PortfolioStore(portfolio);
    empty.applyProgramParams(new URLSearchParams(other.programParams().toString()));
    expect([...empty.state.columns]).toEqual([]);
    empty.applyProgramParams(new URLSearchParams('cols=site&view=mixed'));
    expect([[...empty.state.columns], empty.state.view]).toEqual([['name'], 'compact']);
  });

  it('21.02: a study\'s enrollment target is its ParticipantTarget above zero, as a number or as text, and none otherwise (#21)', () => {
    const study = (target) => ({ params: target === undefined ? {} : { ParticipantTarget: target } });
    expect([400, '400', ' 12 ', 0.5].map((t) => enrollTarget(study(t)))).toEqual([400, 400, 12, 0.5]);
    expect([undefined, null, '', '  ', 0, '0', -3, 'n/a', NaN, Infinity].map((t) => enrollTarget(study(t)))).toEqual(Array(10).fill(null));
    expect(enrollTarget(undefined)).toBeNull();
  });
});

function viewState(s) {
  const { state } = s;
  const sorted = (set) => [...set].map(String).sort();
  return {
    view: state.view,
    groupBy: state.groupBy,
    collapsed: sorted(state.collapsed),
    sort: state.sort,
    show: sorted(state.show),
    heatmap: state.heatmap,
    filters: Object.fromEntries(Object.entries(state.filters).map(([k, v]) => [k, sorted(v)])),
    hiddenMetrics: sorted(state.hiddenMetrics),
    hiddenGroups: sorted(state.hiddenGroups),
    columns: sorted(state.columns),
    admin: state.admin,
  };
}

/** Moves every setting viewState() reads away from its default, through the store's own setters. */
function changeEveryField(s) {
  s.set('view', s.state.view === 'custom' ? 'detailed' : 'custom');
  s.set('groupBy', 'therapeutic_area');
  s.toggleBucketOpen('Oncology');
  s.toggleSort(s.supportedMetrics()[0].MetricID);
  s.toggleShow('den');
  s.toggleShow('num');
  s.set('heatmap', 'rate');
  s.toggleFilter('phase', 'P2');
  s.toggleFilter('status', 'Active');
  s.toggleFilter('therapeutic_area', 'Oncology');
  s.toggleFilter('study', s.studies[2].StudyID);
  s.setAdmin('theme', 'dark');
  s.setAdmin('perrow', '6');
  s.setAdmin('cfgpanel', 'side');
  s.setAdmin('legend', 'on');
  s.toggleMetric(s.supportedMetrics()[1].MetricID);
  s.toggleGroupHidden(s.groupNames().at(-1));
  s.toggleColumn('name');
  s.toggleColumn('status');
}

describe('metric groups (#16, #21)', () => {
  const ids = (/** @type {any[]} */ groups) => groups.map((g) => [g.category, g.metrics.map((/** @type {any} */ m) => m.MetricID)]);

  it('16.05: without `groups`, the groups are the catalog\'s Category groups, in the catalog\'s category order (#16)', () => {
    const want = [];
    for (const m of store.supportedMetrics()) {
      const last = want.at(-1);
      if (last && last[0] === m.Category) last[1].push(m.MetricID);
      else want.push([m.Category, [m.MetricID]]);
    }
    expect(ids(store.metricCategories(store.supportedMetrics()))).toEqual(want);
  });

  it('16.05: with `groups`, each group holds its metrics in its order, unlisted metrics trail in an Other group, and a hidden group starts hidden (#16)', () => {
    const all = new PortfolioStore(portfolio).supportedMetrics().map((m) => m.MetricID);
    const [a, b, c, d] = [all[5], all[0], all[9], all[2]];
    const groups = [{ name: 'Second', metrics: [a, b] }, { name: 'First', metrics: [c], hidden: true }, { name: 'Third', metrics: [d] }];
    const s = new PortfolioStore({ ...portfolio, config: { groups } });
    const rest = all.filter((id) => ![a, b, c, d].includes(id));
    expect(ids(s.metricCategories(s.supportedMetrics()))).toEqual([['Second', [a, b]], ['First', [c]], ['Third', [d]], ['Other', rest]]);
    expect([...s.state.hiddenGroups]).toEqual(['First']);
    expect(s.visibleMetrics().map((m) => m.MetricID)).not.toContain(c);
    // A study report has no configuration, so the address names the metrics a hidden group hides even at the default.
    expect([...s.programParams()]).toEqual([['hidebygroup', c]]);
  });

  it('21.04: a hidden group hides its metrics from the table without touching their checkboxes, travels in the address, and Reset restores the configured default (#21)', () => {
    const groups = [{ name: 'One', metrics: store.supportedMetrics().slice(0, 3).map((m) => m.MetricID), hidden: true }];
    const s = new PortfolioStore({ ...portfolio, config: { groups } });
    const [x, y] = groups[0].metrics;
    s.toggleGroupHidden('One');
    s.toggleMetric(x);
    expect(s.visibleMetrics().map((m) => m.MetricID)).toEqual(expect.arrayContaining([y]));
    expect(s.visibleMetrics().map((m) => m.MetricID)).not.toContain(x);
    s.toggleGroupHidden('Other');
    expect(s.visibleMetrics().map((m) => m.MetricID)).toEqual(groups[0].metrics.filter((id) => id !== x));
    expect([...s.state.hiddenMetrics]).toEqual([x]);
    const params = s.programParams();
    expect(params.getAll('hidegroup')).toEqual(['Other']);
    const other = new PortfolioStore({ ...portfolio, config: { groups } });
    other.applyProgramParams(new URLSearchParams(params.toString()));
    expect([...other.state.hiddenGroups]).toEqual(['Other']);
    other.applyProgramParams(new URLSearchParams('hidegroup=Nope'));
    expect([...other.state.hiddenGroups], 'unknown names are dropped').toEqual(['One']);
    s.reset();
    expect([...s.state.hiddenGroups]).toEqual(['One']);
    expect([...s.programParams()]).toEqual(groups[0].metrics.map((id) => ['hidebygroup', id]));
  });
});


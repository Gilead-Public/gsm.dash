import { describe, it, expect, beforeEach } from 'vitest';
import { PortfolioStore } from '../src/data/store.js';
import { enrollTarget } from '../src/app/portfolio-table.js';
import { generatePortfolio } from '../scripts/generate-example-data.mjs';

// Overview and Details are the table's two views: every category folded to headline tiles, or every category open.

let store;
const portfolio = generatePortfolio();
beforeEach(() => {
  store = new PortfolioStore(portfolio);
});
const cats = () => store.metricCategories().map((g) => g.category);

describe('table view', () => {
  it('lands on Overview, or on the configured view', () => {
    expect(store.state.view).toBe('overview');
    expect(new PortfolioStore({ ...portfolio, config: { view: 'details' } }).state.view).toBe('details');
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
    store.set('view', 'details');
    store.highlight(store.studies[0].StudyID);
    const params = store.programParams();
    expect([...params.keys()]).toEqual(['view']);

    const other = new PortfolioStore(portfolio);
    other.applyProgramParams(new URLSearchParams(params.toString()));
    expect(other.state.view).toBe('details');
    expect(other.state.highlightStudy).toBeNull();
  });

  it('accepts a hand-written ?view=details and ignores unknown ids', () => {
    store.applyProgramParams(new URLSearchParams('view=details&study=NOPE'));
    expect(store.state.view).toBe('details');
    expect(store.state.highlightStudy).toBeNull();
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

  it('27.05: carries an emptied cell stack and an emptied status filter (#27)', () => {
    store.set('cellMode', 'custom');
    for (const part of [...store.state.show]) store.toggleShow(part);
    for (const status of [...store.state.statuses]) store.toggleStatus(status);
    const other = new PortfolioStore(portfolio);
    other.applyProgramParams(store.programParams());
    expect(other.state.show.size).toBe(0);
    expect(other.state.statuses.size).toBe(0);
  });

  it('27.05: drops unknown values, keeping the defaults (#27)', () => {
    const junk = [
      'view=nope', 'open=Nope', 'study=NOPE', 'group=nickname', 'expand=Oncology', 'sort=Nope', 'dir=desc',
      'cell=nope', 'show=nope', 'heatmap=nope', 'ramp=red', 'filter.phase=P9', 'filter.nope=1', 'statuses=Nope', 'hide=Nope',
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
    a.toggleExpanded('Cardiology, Renal');
    a.toggleFilter('therapeutic_area', 'Cardiology, Renal');
    const b = new PortfolioStore(data);
    b.applyProgramParams(new URLSearchParams(a.programParams().toString()));
    expect([...b.state.expanded]).toEqual(['Cardiology, Renal']);
    expect([...b.state.filters.therapeutic_area]).toEqual(['Cardiology, Renal']);
  });

  it('27.05: a study report takes only the metric-status filters and hidden metrics (#27)', () => {
    changeEveryField(store);
    const study = new PortfolioStore(portfolio);
    study.applyMetricParams(store.programParams());
    const { statuses, hiddenMetrics } = viewState(store);
    expect(viewState(study)).toEqual({ ...viewState(new PortfolioStore(portfolio)), statuses, hiddenMetrics });
  });
});

/** Every view setting 27.05 lists, sets as sorted arrays. */
describe('configured defaults (#16)', () => {
  const config = { groupBy: 'phase', heatmap: 'rate', show: ['den', 'trend'], metrics: ['Analysis_kri0003', 'Analysis_kri0004'], view: 'details' };
  const configured = () => new PortfolioStore({ ...portfolio, config });

  it('opens with the configured view, and an empty hash restores it', () => {
    const s = configured();
    expect([s.state.groupBy, s.state.heatmap, [...s.state.show].sort(), [...s.state.hiddenMetrics].sort(), s.state.view]).toEqual(['phase', 'rate', ['den', 'trend'], config.metrics, 'details']);
    const fresh = viewState(s);
    changeEveryField(s);
    s.applyProgramParams(new URLSearchParams());
    expect(viewState(s)).toEqual(fresh);
  });

  it('writes a setting changed back to its built-in default, and reads it back', () => {
    const s = configured();
    s.set('groupBy', 'none');
    s.set('heatmap', 'none');
    s.set('view', 'overview');
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
    const config = { groupBy: 'phase', heatmap: 'rate', show: ['den'], metrics: ['Analysis_kri0003'], view: 'details' };
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
  it('21.01: by default the table shows the study name, without Enrolled or Status, in Overview; a configuration sets both (#21)', () => {
    expect([[...store.state.columns], store.state.view]).toEqual([['name'], 'overview']);
    expect(store.programParams().toString()).toBe('');
    const s = new PortfolioStore({ ...portfolio, config: { columns: ['enroll', 'status'], view: 'details' } });
    expect([[...s.state.columns].sort(), s.state.view]).toEqual([['enroll', 'status'], 'details']);
    expect(s.programParams().toString()).toBe('');
  });

  it('21.01: the columns and view travel in the address, an emptied choice included, and unknown values are dropped (#21)', () => {
    store.toggleColumn('enroll');
    store.toggleColumn('status');
    store.set('view', 'details');
    const params = store.programParams();
    expect(params.getAll('cols')).toEqual(['name', 'enroll', 'status']);
    expect(params.get('view')).toBe('details');
    const other = new PortfolioStore(portfolio);
    other.applyProgramParams(new URLSearchParams(params.toString()));
    expect([[...other.state.columns].sort(), other.state.view]).toEqual([['enroll', 'name', 'status'], 'details']);
    other.toggleColumn('name');
    other.toggleColumn('enroll');
    other.toggleColumn('status');
    const empty = new PortfolioStore(portfolio);
    empty.applyProgramParams(new URLSearchParams(other.programParams().toString()));
    expect([...empty.state.columns]).toEqual([]);
    empty.applyProgramParams(new URLSearchParams('cols=site&view=mixed'));
    expect([[...empty.state.columns], empty.state.view]).toEqual([['name'], 'overview']);
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
    expanded: sorted(state.expanded),
    sort: state.sort,
    cellMode: state.cellMode,
    show: sorted(state.show),
    heatmap: state.heatmap,
    filters: Object.fromEntries(Object.entries(state.filters).map(([k, v]) => [k, sorted(v)])),
    statuses: sorted(state.statuses),
    hiddenMetrics: sorted(state.hiddenMetrics),
    columns: sorted(state.columns),
  };
}

/** Moves every setting viewState() reads away from its default, through the store's own setters. */
function changeEveryField(s) {
  s.set('view', s.state.view === 'details' ? 'overview' : 'details');
  s.set('groupBy', 'therapeutic_area');
  s.toggleExpanded('Oncology');
  s.toggleSort(s.supportedMetrics()[0].MetricID);
  s.set('cellMode', 'custom');
  s.toggleShow('den');
  s.toggleShow('num');
  s.set('heatmap', 'rate');
  s.toggleFilter('phase', 'P2');
  s.toggleFilter('status', 'Active');
  s.toggleFilter('therapeutic_area', 'Oncology');
  s.toggleFilter('study', s.studies[2].StudyID);
  s.toggleStatus('Planned');
  s.toggleMetric(s.supportedMetrics()[1].MetricID);
  s.toggleColumn('name');
  s.toggleColumn('status');
}

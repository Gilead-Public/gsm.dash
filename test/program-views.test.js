import { describe, it, expect, beforeEach } from 'vitest';
import { PortfolioStore } from '../src/data/store.js';
import { generatePortfolio } from '../scripts/generate-example-data.mjs';

// Unified program views (design iteration 2): Overview and Details are two
// zoom levels of one table, derived from the category folds; Distribution is
// a separate view. All three share the store's highlight and filters.

let store;
const portfolio = generatePortfolio();
beforeEach(() => {
  store = new PortfolioStore(portfolio);
});
const cats = () => store.metricCategories().map((g) => g.category);

describe('table zoom', () => {
  it('lands on Overview with every category folded', () => {
    expect(store.state.programView).toBe('table');
    expect(store.tableZoom()).toBe('overview');
  });

  it('derives details / mixed from the folds', () => {
    store.setProgramView('details');
    expect(store.tableZoom()).toBe('details');
    store.toggleGroup(cats()[0]);
    expect(store.tableZoom()).toBe('mixed');
    store.setProgramView('overview');
    expect(store.tableZoom()).toBe('overview');
  });

  it('keeps the table folds when switching to Distribution and back', () => {
    store.toggleGroup(cats()[1]);
    store.setProgramView('distribution');
    expect(store.state.programView).toBe('distribution');
    expect(store.tableZoom()).toBe('mixed');
  });
});

describe('highlight study', () => {
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
  it('round-trips view, open bands, highlight and distribution folds', () => {
    const [a, b] = cats();
    store.toggleGroup(a);
    store.highlight(store.studies[0].StudyID);
    store.toggleDistGroup(b);
    store.setProgramView('distribution');
    const params = store.programParams();
    expect(params.get('view')).toBe('distribution');
    expect(params.get('open')).toBe(a);

    const other = new PortfolioStore(portfolio);
    other.applyProgramParams(new URLSearchParams(params.toString()));
    expect(other.state.programView).toBe('distribution');
    expect(other.tableZoom()).toBe('mixed');
    expect(other.state.collapsedGroups.has(a)).toBe(false);
    expect(other.state.highlightStudy).toBe(store.studies[0].StudyID);
    expect([...other.state.distCollapsed]).toEqual([b]);
  });

  it('accepts a hand-written ?view=details and ignores unknown ids', () => {
    store.applyProgramParams(new URLSearchParams('view=details&study=NOPE&dfold=Nope'));
    expect(store.tableZoom()).toBe('details');
    expect(store.state.highlightStudy).toBeNull();
    expect(store.state.distCollapsed.size).toBe(0);
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
      'view=nope', 'open=Nope', 'dfold=Nope', 'study=NOPE', 'group=nickname', 'expand=Oncology', 'sort=Nope', 'dir=desc',
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
  const config = { groupBy: 'phase', heatmap: 'rate', show: ['den', 'trend'], metrics: ['Analysis_kri0003', 'Analysis_kri0004'] };
  const configured = () => new PortfolioStore({ ...portfolio, config });

  it('opens with the configured view, and an empty hash restores it', () => {
    const s = configured();
    expect([s.state.groupBy, s.state.heatmap, [...s.state.show].sort(), [...s.state.hiddenMetrics].sort()]).toEqual(['phase', 'rate', ['den', 'trend'], config.metrics]);
    const fresh = viewState(s);
    changeEveryField(s);
    s.applyProgramParams(new URLSearchParams());
    expect(viewState(s)).toEqual(fresh);
  });

  it('writes a setting changed back to its built-in default, and reads it back', () => {
    const s = configured();
    s.set('groupBy', 'none');
    s.set('heatmap', 'none');
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
    const config = { groupBy: 'phase', heatmap: 'rate', show: ['den'], metrics: ['Analysis_kri0003'] };
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

function viewState(s) {
  const { state } = s;
  const sorted = (set) => [...set].map(String).sort();
  return {
    programView: state.programView,
    collapsedGroups: sorted(state.collapsedGroups),
    distCollapsed: sorted(state.distCollapsed),
    groupBy: state.groupBy,
    expanded: sorted(state.expanded),
    sort: state.sort,
    cellMode: state.cellMode,
    show: sorted(state.show),
    heatmap: state.heatmap,
    filters: Object.fromEntries(Object.entries(state.filters).map(([k, v]) => [k, sorted(v)])),
    statuses: sorted(state.statuses),
    hiddenMetrics: sorted(state.hiddenMetrics),
    highlightStudy: state.highlightStudy,
  };
}

/** Moves every setting viewState() reads away from its default, through the store's own setters. */
function changeEveryField(s) {
  const [a, b] = s.metricCategories().map((g) => g.category);
  s.toggleGroup(a);
  s.toggleDistGroup(b);
  s.setProgramView('distribution');
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
  s.highlight(s.studies[1].StudyID);
}

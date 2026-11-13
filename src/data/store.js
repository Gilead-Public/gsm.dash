import { orderMetrics, normalizeMetric, pivotGroups, indexResults } from './normalize.js';
import { selectLatestSnapshots, poolResults, bucketStudies, filterStudies } from './rollup.js';
import { indexSummary, poolSummary, POPULATIONS } from './summary.js';
import { nextSort } from './sort.js';
import { STATUS_ORDER, CATEGORY_ORDER, groupByCategory } from './catalog.js';
import { CELL_MODES, GROUP_BY_OPTIONS, HEATMAPS, RAMPS, showOptions } from '../app/portfolio-controls.js';
import { POP_COLUMNS } from '../app/portfolio-table.js';

// The portfolio's single-valued settings in its URL: [param, state field, default, the controls' choices].
const SCALARS = [
  ['group', 'groupBy', 'none', GROUP_BY_OPTIONS],
  ['cell', 'cellMode', 'defined', CELL_MODES],
  ['heatmap', 'heatmap', 'none', HEATMAPS],
  ['ramp', 'ramp', 'blue', RAMPS],
];
const SHOW_PARTS = showOptions(false).map(([part]) => part);
const DEFAULT_SHOW = ['num', 'rate'];

/**
 * The known values of a set the user can empty. An emptied set is written as one empty value; a set whose values are
 * all unknown is the default rather than empty.
 * @param {URLSearchParams} params
 * @param {string} key
 * @param {string[]} options
 * @param {string[]} fallback
 */
function chosen(params, key, options, fallback) {
  const values = params.getAll(key);
  const kept = options.filter((o) => values.includes(o));
  return kept.length || (values.length && values.every((v) => v === '')) ? kept : fallback;
}

/**
 * PortfolioStore owns the loaded data and all view state for the program page.
 * Components read from it and call its setters; every mutation emits 'change'.
 * It is deliberately not a custom element — hosts that compose their own UI
 * (e.g. a gsm.kri htmlwidget) can drive it directly.
 */
export class PortfolioStore extends EventTarget {
  #summary = null;
  #comparison = null;

  /**
   * @param {{ manifest: any, snapshots: any[], summary?: any, comparison?: Array<{ SnapshotDate: string, MetricID: string, Numerator: number, Denominator: number }> }} data
   *   A study report passes its injected `comparison` (portfolio counts per visit date × metric) instead of the summary.
   */
  constructor({ manifest, snapshots, summary, comparison }) {
    super();
    const { active, inactive } = orderMetrics(manifest.metrics.map(normalizeMetric));
    this.metrics = active;
    this.inactiveMetrics = inactive;
    this.studies = manifest.studies;
    this.generated = manifest.generated;
    this.reportBase = manifest.reportBase ?? null;
    if (comparison) this.#comparison = new Map(comparison.map((r) => [`${r.SnapshotDate}\n${r.MetricID}`, r]));
    else this.#summary = indexSummary(summary, manifest.studies);

    // StudyID -> SnapshotDate -> {snapshot, byMetric, groupParams}
    this.snapshotIndex = new Map();
    for (const snap of snapshots) {
      if (!this.snapshotIndex.has(snap.StudyID)) this.snapshotIndex.set(snap.StudyID, new Map());
      this.snapshotIndex.get(snap.StudyID).set(snap.SnapshotDate, {
        snapshot: snap,
        byMetric: indexResults(snap.results, { StudyID: snap.StudyID, SnapshotDate: snap.SnapshotDate }),
        groupParams: pivotGroups(snap.groups),
      });
    }

    this.state = {
      show: new Set(DEFAULT_SHOW), // any of num | den | rate | trend; cells stack what's on
      heatmap: 'none', // 'none' | 'num' | 'den' | 'rate' — column-relative cell shading (and the metric sort measure)
      ramp: 'blue', // heatmap palette: 'blue' | 'teal' | 'purple' | 'grey'
      groupBy: 'none', // 'none' (one row per study) | a study param
      filters: { therapeutic_area: new Set(), phase: new Set(), status: new Set() },
      hiddenMetrics: new Set(), // MetricIDs the user has switched off
      expanded: new Set(),
      sort: { key: null, dir: null }, // key: 'label' | 'meta' | a MetricID
      detail: { metricId: null, tab: 'viz-bar' }, // study-page drill-in panel (W4)
      tileViews: new Map(), // MetricID -> the view currently shown in its tile
      groupByCategory: true, // study page: lifecycle rows (meta.Category) vs one flat grid
      selectedSite: null, // GroupID highlighted across every site-level chart at once
      asOf: null, // view the portfolio as of this date; the study page's visit scrubber drives it
      cellMode: 'defined', // 'defined' — each metric shows its glossary display rule | 'custom' — the `show` stack for every metric
      statuses: new Set(STATUS_ORDER), // glossary Status values to show (Released | New | Planned)
      // Program table zoom: folded categories show one headline value per
      // metric. All folded = Overview (the landing view), none = Details.
      collapsedGroups: new Set(), // filled with every category below
      programView: 'table', // 'table' (Overview / Details) | 'distribution'
      highlightStudy: null, // StudyID marked in every program view
      distCollapsed: new Set(), // distribution view: categories folded to their header
    };
    this.state.collapsedGroups = new Set(this.#allCategories());
  }

  get #index() {
    if (!this.#summary) throw new Error('a study report carries no portfolio summary, only its comparison');
    return this.#summary;
  }

  /**
   * The portfolio a study's tiles compare with, at the visit shown. A study report looks it up in its injected
   * comparison; otherwise it is pooled from the summary.
   * @returns {{ Numerator: number, Denominator: number, Rate: number | null } | null}
   */
  portfolioComparison(studyId, metricId) {
    if (!this.#comparison) return this.rollup(this.studies, metricId);
    const row = this.#comparison.get(`${this.latestDate(studyId)}\n${metricId}`);
    if (!row) return null;
    return { Numerator: row.Numerator, Denominator: row.Denominator, Rate: row.Denominator > 0 ? row.Numerator / row.Denominator : null };
  }

  /**
   * Highlight one site everywhere. Selecting the already-selected site clears
   * it, so clicking the same point twice is the way back to the default view.
   */
  selectSite(groupId) {
    this.state.selectedSite = this.state.selectedSite === groupId ? null : groupId;
    this.#emit();
  }

  setTileView(metricId, viewName) {
    this.state.tileViews.set(metricId, viewName);
    this.#emit();
  }

  /** Page every tile to one view; null returns each metric to its default view. */
  setAllTileViews(viewName) {
    this.state.tileViews = viewName ? new Map(this.metrics.map((m) => [m.MetricID, viewName])) : new Map();
    this.#emit();
  }

  /**
   * Replace the whole tile-view map in one shot — one 'change' for the batch
   * rather than one per tile. Which views a metric actually has depends on the
   * widget registry, so the caller supplies the [MetricID, viewName] pairs.
   */
  setTileViews(entries) {
    this.state.tileViews = new Map(entries);
    this.#emit();
  }

  /** Header click: cycle the sort for a column ('label'/'meta' are text/numeric row attributes; anything else is a MetricID). */
  toggleSort(key, { numeric = true } = {}) {
    this.state.sort = nextSort(this.state.sort, key, { numeric });
    this.#emit();
  }

  /**
   * Site-level metrics are the dashboard's core input: study and portfolio
   * rates are derived here by pooling site rows, so any new site-level metric
   * in the pipeline appears automatically. Study-, country- and
   * participant-level metrics (e.g. QTLs) need different plumbing — a
   * future release — and are held back rather than mis-aggregated.
   */
  supportedMetrics() {
    return this.metrics.filter((m) => m.GroupLevel === 'Site');
  }

  unsupportedMetrics() {
    return this.metrics.filter((m) => m.GroupLevel !== 'Site');
  }

  /** Supported catalog minus user-hidden metrics — what views should render. */
  visibleMetrics() {
    return this.supportedMetrics().filter(
      (m) => !this.state.hiddenMetrics.has(m.MetricID) && this.state.statuses.has(m.Status ?? 'Released')
    );
  }

  /** Visible metrics banded by glossary Category, in catalog category order. */
  metricCategories(metrics = this.visibleMetrics()) {
    return groupByCategory(metrics, CATEGORY_ORDER);
  }

  toggleStatus(status) {
    const set = this.state.statuses;
    set.has(status) ? set.delete(status) : set.add(status);
    this.#emit();
  }

  /** Fold / unfold one category band in the program table. */
  toggleGroup(category) {
    const set = this.state.collapsedGroups;
    set.has(category) ? set.delete(category) : set.add(category);
    this.#emit();
  }

  /**
   * Table zoom derived from which visible categories are folded: 'overview'
   * (all folded), 'details' (none folded) or 'mixed'.
   */
  tableZoom(categories = this.metricCategories().map((g) => g.category)) {
    const folded = categories.filter((c) => this.state.collapsedGroups.has(c)).length;
    if (folded === categories.length) return 'overview';
    return folded === 0 ? 'details' : 'mixed';
  }

  /** The view switch: 'overview' / 'details' set the table zoom; 'distribution' swaps the view. */
  setProgramView(view) {
    if (view === 'distribution') {
      this.state.programView = 'distribution';
    } else {
      this.state.programView = 'table';
      this.state.collapsedGroups = view === 'details' ? new Set() : new Set(this.#allCategories());
    }
    this.#emit();
  }

  #allCategories() {
    return [...new Set([...CATEGORY_ORDER, ...groupByCategory(this.metrics, CATEGORY_ORDER).map((g) => g.category)])];
  }

  /** Mark one study in every program view; selecting it again clears the highlight. */
  highlight(studyId) {
    this.state.highlightStudy = studyId && this.state.highlightStudy !== studyId ? studyId : null;
    this.#emit();
  }

  /**
   * The portfolio view as URL params, so a link reopens the same view and a study report can carry it there and back.
   * Defaults are left out, so the default view has no params. A list is one param per value, in catalog order, since
   * study values may contain commas. `open` lists the table's open bands; `all` stands for every band.
   */
  programParams() {
    const { state } = this;
    const cats = this.#allCategories();
    const open = cats.filter((c) => !state.collapsedGroups.has(c));
    const zoom = open.length === 0 ? 'overview' : open.length === cats.length ? 'details' : 'mixed';
    const view = state.programView === 'distribution' ? 'distribution' : zoom;
    const params = new URLSearchParams();
    const add = (key, values) => values.forEach((v) => params.append(key, v));
    // A set that can be emptied writes an empty value, so that it differs from the default.
    const addSet = (key, values) => (values.length ? add(key, values) : params.set(key, ''));
    if (view !== 'overview') params.set('view', view);
    if (zoom === 'mixed' || (zoom === 'details' && view === 'distribution')) add('open', zoom === 'details' ? ['all'] : open);
    add('dfold', cats.filter((c) => state.distCollapsed.has(c)));
    if (state.highlightStudy) params.set('study', state.highlightStudy);
    for (const [key, field, value] of SCALARS) if (state[field] !== value) params.set(key, state[field]);
    if (state.groupBy !== 'none') add('expand', this.#bucketValues().filter((v) => state.expanded.has(v)));
    if (state.sort.key && state.sort.dir) {
      params.set('sort', state.sort.key);
      params.set('dir', state.sort.dir);
    }
    if (SHOW_PARTS.some((p) => state.show.has(p) !== DEFAULT_SHOW.includes(p))) addSet('show', SHOW_PARTS.filter((p) => state.show.has(p)));
    const options = this.filterOptions();
    for (const param of Object.keys(state.filters)) add(`filter.${param}`, options[param].filter((v) => state.filters[param].has(v)));
    if (STATUS_ORDER.some((s) => !state.statuses.has(s))) addSet('statuses', STATUS_ORDER.filter((s) => state.statuses.has(s)));
    add('hide', this.metrics.map((m) => m.MetricID).filter((id) => state.hiddenMetrics.has(id)));
    return params;
  }

  /** Restore what programParams() wrote: an absent param is its default, and unknown values are dropped. One 'change'. */
  applyProgramParams(params) {
    const { state } = this;
    const cats = this.#allCategories();
    const known = (values, options) => values.filter((v) => options.includes(v));
    const view = params.get('view');
    const open = params.getAll('open');
    state.programView = view === 'distribution' ? 'distribution' : 'table';
    if (open.includes('all') || (!open.length && view === 'details')) state.collapsedGroups = new Set();
    else if (open.length) state.collapsedGroups = new Set(cats.filter((c) => !open.includes(c)));
    else state.collapsedGroups = new Set(cats);
    state.distCollapsed = new Set(known(params.getAll('dfold'), cats));
    const study = params.get('study');
    state.highlightStudy = this.studies.some((st) => st.StudyID === study) ? study : null;
    for (const [key, field, value, choices] of SCALARS) {
      const v = params.get(key);
      state[field] = choices.some(([choice]) => choice === v) ? v : value;
    }
    state.expanded = new Set(state.groupBy === 'none' ? [] : known(params.getAll('expand'), this.#bucketValues()));
    const [sortKey, dir] = [params.get('sort'), params.get('dir')];
    const sortable = ['label', 'meta', ...POP_COLUMNS.map((c) => c.key), ...this.metrics.map((m) => m.MetricID)];
    state.sort = sortable.includes(sortKey) && (dir === 'asc' || dir === 'desc') ? { key: sortKey, dir } : { key: null, dir: null };
    state.show = new Set(chosen(params, 'show', SHOW_PARTS, DEFAULT_SHOW));
    const options = this.filterOptions();
    for (const param of Object.keys(state.filters)) state.filters[param] = new Set(known(params.getAll(`filter.${param}`), options[param]));
    this.#applyMetricParams(params);
    this.#emit();
  }

  /** What a study report takes from the portfolio's params: the metric-status filters and hidden metrics. One 'change'. */
  applyMetricParams(params) {
    this.#applyMetricParams(params);
    this.#emit();
  }

  #applyMetricParams(params) {
    const hide = params.getAll('hide');
    this.state.statuses = new Set(chosen(params, 'statuses', STATUS_ORDER, STATUS_ORDER));
    this.state.hiddenMetrics = new Set(this.metrics.map((m) => m.MetricID).filter((id) => hide.includes(id)));
  }

  #bucketValues() {
    return bucketStudies(this.studies, this.state.groupBy).map((b) => String(b.value));
  }

  /** Fold / unfold one category in the distribution view (independent of the table's folds). */
  toggleDistGroup(category) {
    const set = this.state.distCollapsed;
    set.has(category) ? set.delete(category) : set.add(category);
    this.#emit();
  }

  /** Show or hide a batch of metrics in one change (sidebar category toggles). */
  setMetricsVisible(metricIds, visible) {
    for (const id of metricIds) visible ? this.state.hiddenMetrics.delete(id) : this.state.hiddenMetrics.add(id);
    this.#emit();
  }

  toggleMetric(metricId) {
    const set = this.state.hiddenMetrics;
    set.has(metricId) ? set.delete(metricId) : set.add(metricId);
    this.#emit();
  }

  setAllMetrics(visible) {
    this.state.hiddenMetrics = visible ? new Set() : new Set(this.metrics.map((m) => m.MetricID));
    this.#emit();
  }

  #emit() {
    this.dispatchEvent(new CustomEvent('change'));
  }

  set(key, value) {
    this.state[key] = value;
    this.#emit();
  }

  toggleFilter(param, value) {
    const set = this.state.filters[param];
    set.has(value) ? set.delete(value) : set.add(value);
    this.#emit();
  }

  toggleShow(part) {
    const set = this.state.show;
    set.has(part) ? set.delete(part) : set.add(part);
    this.#emit();
  }

  clearFilters() {
    for (const set of Object.values(this.state.filters)) set.clear();
    this.#emit();
  }

  activeFilterCount() {
    return Object.values(this.state.filters).reduce((n, set) => n + set.size, 0);
  }

  toggleExpanded(bucketValue) {
    const set = this.state.expanded;
    set.has(bucketValue) ? set.delete(bucketValue) : set.add(bucketValue);
    this.#emit();
  }

  /** Distinct values per filterable param, for building filter controls. */
  filterOptions() {
    const out = {};
    for (const param of Object.keys(this.state.filters)) {
      out[param] = [...new Set(this.studies.map((s) => String(s.params?.[param])).filter((v) => v !== 'undefined'))].sort();
    }
    return out;
  }

  filteredStudies() {
    return filterStudies(this.studies, this.state.filters);
  }

  latestFor(studies = this.filteredStudies()) {
    return selectLatestSnapshots(studies, this.state.asOf);
  }

  #entry(studyId, date) {
    return this.snapshotIndex.get(studyId)?.get(date);
  }

  /**
   * A study's value for one metric, DERIVED by pooling its site rows —
   * never read from a pipeline study-level row. Shape mirrors a results row
   * (Numerator / Denominator / Metric) plus NumSites.
   */
  studyRollup(studyId, date, metricId) {
    const rows = this.siteRows(studyId, date, metricId);
    if (!rows.length) return null;
    const { Numerator, Denominator, Rate } = poolResults(rows);
    return { Numerator, Denominator, Metric: Rate, NumSites: rows.length };
  }

  /** This study's latest snapshot date, respecting the store-wide asOf. */
  latestDate(studyId) {
    const study = this.studies.find((s) => s.StudyID === studyId);
    if (!study) return null;
    return selectLatestSnapshots([study], this.state.asOf).get(studyId) ?? null;
  }

  /** Reporting_Distributions site rows for one metric; undefined when the snapshot carries no distributions. */
  distributionRows(studyId, date, metricId) {
    const rows = this.#entry(studyId, date)?.snapshot.distributions;
    return rows?.filter((d) => d.MetricID === metricId);
  }

  /** Reporting_Bounds rows for one metric (scatter envelope); empty when the snapshot has none. */
  boundsRows(studyId, date, metricId) {
    const bounds = this.#entry(studyId, date)?.snapshot.bounds ?? [];
    return bounds.filter((b) => b.MetricID === metricId);
  }

  /** Reporting_Groups EAV rows for the snapshot — gsm.viz's groupMetadata format as-is. */
  groupRows(studyId, date) {
    return this.#entry(studyId, date)?.snapshot.groups ?? [];
  }

  /**
   * Study-level Reporting_Groups params as of ONE snapshot, pivoted wide.
   * The manifest's `params` are the study's most recent snapshot; these track
   * whichever snapshot the view is showing, so they respect `asOf`. Falls back
   * to the manifest when a snapshot carries no Study-level group rows.
   */
  studyParamsAt(studyId, date) {
    return (
      this.#entry(studyId, date)?.groupParams.get(studyId) ??
      this.studies.find((s) => s.StudyID === studyId)?.params ??
      {}
    );
  }

  /**
   * Participant populations (P4) across a set of studies, from each study's latest counts in the summary: Screened /
   * Enrolled / Dosed from Reporting_Groups `ScreenedCount` / `ParticipantCount` / `DosedCount`. `asOf` only decides which
   * studies count: the summary carries no earlier counts. Each is null when no counted study reports it, so a missing
   * value is never rendered as a real zero.
   */
  population(studies) {
    const ids = [...this.latestFor(studies).keys()];
    return Object.fromEntries(
      Object.entries(POPULATIONS).map(([key, param]) => {
        const reported = ids.map((id) => this.#index.population(id, param)).filter((n) => n != null);
        return [key, reported.length ? reported.reduce((a, b) => a + b, 0) : null];
      }),
    );
  }

  /** Site rows for one metric across every snapshot of the study (time series input). */
  siteRowsHistory(studyId, metricId) {
    const study = this.studies.find((s) => s.StudyID === studyId);
    if (!study) return [];
    return study.snapshots.flatMap((date) => this.siteRows(studyId, date, metricId));
  }

  /** Derived study rate across this study's own snapshots (tile trend). */
  studyTrend(studyId, metricId) {
    const study = this.studies.find((s) => s.StudyID === studyId);
    if (!study) return [];
    return study.snapshots.map((date) => ({
      date,
      rate: this.studyRollup(studyId, date, metricId)?.Metric ?? null,
    }));
  }

  siteRows(studyId, date, metricId) {
    return this.#entry(studyId, date)?.byMetric.get(metricId)?.site ?? [];
  }

  /**
   * Pooled rollup for a set of studies at their latest snapshots, from the
   * summary: Σ site numerators / Σ site denominators, plus the site flag
   * distribution. One study or the whole portfolio — same math.
   */
  rollup(studies, metricId) {
    return poolSummary(this.#index, this.latestFor(studies), metricId);
  }

  buckets() {
    return bucketStudies(this.filteredStudies(), this.state.groupBy);
  }

  /**
   * Portfolio pooled rate per snapshot grid date (D5). Each study contributes
   * its latest snapshot as of the grid date; studies with none yet are absent.
   */
  trendSeries(metricId, studies = this.filteredStudies()) {
    const gridDates = [...new Set(studies.flatMap((s) => s.snapshots))].sort();
    return gridDates.map((date) => {
      const { Rate, NumStudies } = poolSummary(this.#index, selectLatestSnapshots(studies, date), metricId);
      return { date, rate: Rate, nStudies: NumStudies };
    });
  }
}

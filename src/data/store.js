import { orderMetrics, normalizeMetric, pivotGroups, indexResults } from './normalize.js';
import { selectLatestSnapshots, poolResults, bucketStudies, filterStudies, studyValue } from './rollup.js';
import { indexSummary, poolSummary, POPULATIONS } from './summary.js';
import { nextSort } from './sort.js';
import { groupAsConfigured, ungrouped } from './catalog.js';
import { COLUMN_OPTIONS, GROUP_BY_OPTIONS, HEATMAPS, VIEWS, SHOW_OPTIONS } from '../app/portfolio-controls.js';
import { readAdmin, writeAdmin } from '../app/admin-settings.js';
import { POP_COLUMNS } from '../app/portfolio-table.js';
import { portfolioDefaults } from './portfolio-config.js';

// The portfolio's single-valued settings in its URL: [param, state field, the controls' choices].
const SCALARS = [
  ['group', 'groupBy', GROUP_BY_OPTIONS],
  ['view', 'view', VIEWS],
  ['heatmap', 'heatmap', HEATMAPS],
];
const SHOW_PARTS = SHOW_OPTIONS.map(([part]) => part);
const COLUMN_PARTS = COLUMN_OPTIONS.map(([part]) => part);

/**
 * The Cell display an address asks for. Addresses from before #47 carried the View (overview / details) and the cell
 * mode apart: details with a custom cell mode is Custom.
 * @param {URLSearchParams} params
 */
function legacyView(params) {
  const view = params.get('view');
  if (view === 'overview') return 'compact';
  if (view === 'details') return params.get('cell') === 'custom' ? 'custom' : 'detailed';
  return view;
}

/** Params no setting reads: #35's retired views and highlight, #23's palette, #46's status filter, and #47's open
 * groups and cell mode. */
const RETIRED_PARAMS = ['open', 'dfold', 'study', 'density', 'ramp', 'statuses', 'expand', 'cell'];

/**
 * An address in its current form, for a report that only carries the portfolio's (a study report): retired params
 * removed, and an old View and cell mode rewritten as the Cell display (#47). Every other param is kept as it is.
 * @param {URLSearchParams} params
 */
export function currentParams(params) {
  const out = new URLSearchParams(params);
  const view = legacyView(params);
  for (const key of RETIRED_PARAMS) out.delete(key);
  if (view != null && !VIEWS.some(([choice]) => choice === view)) out.delete('view');
  else if (view != null && view !== params.get('view')) out.set('view', view);
  return out;
}

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
  #defaults;
  /** @type {Set<string>} */
  #offCycle = new Set();

  /**
   * @param {{ manifest: any, snapshots: any[], summary?: any, config?: import('./portfolio-config.js').PortfolioConfig }} data
   *   The portfolio passes its summary and its configured defaults (#16), already checked; a study report passes
   *   neither.
   */
  constructor({ manifest, snapshots, summary, config }) {
    super();
    this.#defaults = portfolioDefaults(config);
    const { active, inactive } = orderMetrics(manifest.metrics.map(normalizeMetric));
    this.metrics = active;
    this.inactiveMetrics = inactive;
    this.studies = manifest.studies;
    // Trends draw on every study's history, off-cycle ones included (#14).
    this.historyStudies = manifest.studies;
    this.generated = manifest.generated;
    this.reportBase = manifest.reportBase ?? null;
    if (summary) {
      this.#summary = indexSummary(summary, manifest.studies);
      // Off-cycle studies are left out of every current figure; the cycle notice names them (#14).
      this.#offCycle = new Set(this.#summary.cycle.offCycle.map((s) => s.StudyID));
      this.studies = manifest.studies.filter((s) => !this.#offCycle.has(s.StudyID));
    }

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
      show: new Set(this.#defaults.show), // any of num | den | rate | trend; cells stack what's on
      columns: new Set(this.#defaults.columns), // the table's optional columns shown: name | enroll | status (#21)
      view: this.#defaults.view, // the Cell display (#47): 'compact' (headline tiles) | 'detailed' (as defined) | 'custom' (`show` and the heatmap)
      heatmap: this.#defaults.heatmap, // 'none' | 'num' | 'den' | 'rate'; applies under Custom only (activeHeatmap)
      groupBy: this.#defaults.groupBy, // 'none' (one row per study) | a study param
      filters: { therapeutic_area: new Set(), phase: new Set(), status: new Set(), product: new Set(), study: new Set() },
      hiddenMetrics: new Set(this.#defaults.metrics), // MetricIDs the user has switched off
      hiddenGroups: new Set(this.#hiddenGroupDefaults()), // metric groups whose band is hidden (#21), independent of hiddenMetrics
      collapsed: new Set(), // group-by buckets closed by the user; every group opens by default (#47)
      sort: { key: null, dir: null }, // key: 'label' | 'meta' | a MetricID
      detail: { metricId: null, tab: 'viz-bar' }, // study-page drill-in panel (W4)
      asOf: null, // view the portfolio as of this date; the study page's visit scrubber drives it
      admin: readAdmin(new URLSearchParams()), // the Admin panel's settings (#46)
      // StudyID marked in the table. Unwired since the 19 Nov 2026 design review (#35): nothing sets it, and the address
      // doesn't carry it; kept for a possible enhanced version of the page.
      highlightStudy: null,
    };
  }

  get #index() {
    if (!this.#summary) throw new Error('a study report carries no portfolio summary');
    return this.#summary;
  }

  /** The portfolio's snapshot cycle and the studies left out of it (#14); null in a study report. */
  get cycle() {
    return this.#summary?.cycle ?? null;
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

  /** Supported catalog minus user-hidden metrics and the metrics of hidden groups — what views should render. */
  visibleMetrics() {
    const hiddenGroup = new Set(
      this.metricCategories(this.supportedMetrics())
        .filter((g) => this.state.hiddenGroups.has(g.category))
        .flatMap((g) => g.metrics.map((m) => m.MetricID)),
    );
    return this.supportedMetrics().filter(
      (m) => !this.state.hiddenMetrics.has(m.MetricID) && !hiddenGroup.has(m.MetricID)
    );
  }

  /** Metrics banded into groups: as configured (#16's `groups`), or all in one. */
  metricCategories(metrics = this.visibleMetrics()) {
    return this.#defaults.groups ? groupAsConfigured(metrics, this.#defaults.groups) : ungrouped(metrics);
  }

  /**
   * Every group's name, in order, whatever is hidden, when there are groups to choose between: none without `groups`,
   * and none when one group holds every metric, since hiding the only band would leave the table without metrics.
   */
  groupNames() {
    const names = this.#defaults.groups ? this.metricCategories(this.supportedMetrics()).map((g) => g.category) : [];
    return names.length > 1 ? names : [];
  }

  #hiddenGroupDefaults() {
    const names = this.groupNames();
    return (this.#defaults.groups ?? []).filter((g) => g.hidden && names.includes(g.name)).map((g) => g.name);
  }

  /** Show or hide one group's band; its metrics' own checkboxes are left as they are. */
  toggleGroupHidden(name) {
    const set = this.state.hiddenGroups;
    set.has(name) ? set.delete(name) : set.add(name);
    this.#emit();
  }

  /** Mark one study in the table; selecting it again clears the highlight. */
  highlight(studyId) {
    this.state.highlightStudy = studyId && this.state.highlightStudy !== studyId ? studyId : null;
    this.#emit();
  }

  /**
   * The portfolio view as URL params, so a link reopens the same view and a study report can carry it there and back.
   * Defaults are left out, so the default view has no params. A list is one param per value, in catalog order, since
   * study values may contain commas.
   */
  programParams() {
    const { state } = this;
    const params = new URLSearchParams();
    const add = (key, values) => values.forEach((v) => params.append(key, v));
    // A set that can be emptied writes an empty value, so that it differs from the default.
    const addSet = (key, values) => (values.length ? add(key, values) : params.set(key, ''));
    for (const [key, field] of SCALARS) if (state[field] !== this.#defaults[field]) params.set(key, state[field]);
    if (state.groupBy !== 'none') add('collapse', this.#bucketValues().filter((v) => state.collapsed.has(v)));
    if (state.sort.key && state.sort.dir) {
      params.set('sort', state.sort.key);
      params.set('dir', state.sort.dir);
    }
    if (SHOW_PARTS.some((p) => state.show.has(p) !== this.#defaults.show.includes(p))) addSet('show', SHOW_PARTS.filter((p) => state.show.has(p)));
    if (COLUMN_PARTS.some((p) => state.columns.has(p) !== this.#defaults.columns.includes(p))) addSet('cols', COLUMN_PARTS.filter((p) => state.columns.has(p)));
    const options = this.filterOptions();
    for (const param of Object.keys(state.filters)) add(`filter.${param}`, options[param].filter((v) => state.filters[param].has(v)));
    const hidden = this.metrics.map((m) => m.MetricID).filter((id) => state.hiddenMetrics.has(id));
    // Written even when it equals the configured default: a study report has no configuration, and takes the hidden
    // metrics from the link.
    if (hidden.length || this.#defaults.metrics.length) addSet('hide', hidden);
    const groups = this.groupNames();
    const hiddenGroups = groups.filter((g) => state.hiddenGroups.has(g));
    const defaultHidden = this.#hiddenGroupDefaults();
    if (groups.some((g) => state.hiddenGroups.has(g) !== defaultHidden.includes(g))) addSet('hidegroup', hiddenGroups);
    // A study report has no groups or configuration: it takes the metrics a hidden group hides as a list of its own,
    // written even at the configured default and apart from `hide`, so the portfolio's checkboxes keep their own state
    // (16.03).
    const groupHidden = this.metricCategories(this.supportedMetrics())
      .filter((g) => state.hiddenGroups.has(g.category))
      .flatMap((g) => g.metrics.map((m) => m.MetricID));
    add('hidebygroup', groupHidden);
    return writeAdmin(params, state.admin);
  }

  /** Restore what programParams() wrote: an absent param is its configured default, and unknown values are dropped. One 'change'. */
  applyProgramParams(params) {
    const { state } = this;
    const known = (values, options) => values.filter((v) => options.includes(v));
    for (const [key, field, choices] of SCALARS) {
      const v = key === 'view' ? legacyView(params) : params.get(key);
      state[field] = choices.some(([choice]) => choice === v) ? v : this.#defaults[field];
    }
    state.collapsed = new Set(state.groupBy === 'none' ? [] : known(params.getAll('collapse'), this.#bucketValues()));
    state.admin = readAdmin(params);
    const [sortKey, dir] = [params.get('sort'), params.get('dir')];
    const sortable = ['label', 'meta', ...POP_COLUMNS.map((c) => c.key), ...this.metrics.map((m) => m.MetricID)];
    state.sort = sortable.includes(sortKey) && (dir === 'asc' || dir === 'desc') ? { key: sortKey, dir } : { key: null, dir: null };
    state.show = new Set(chosen(params, 'show', SHOW_PARTS, this.#defaults.show));
    state.columns = new Set(chosen(params, 'cols', COLUMN_PARTS, this.#defaults.columns));
    const options = this.filterOptions();
    for (const param of Object.keys(state.filters)) state.filters[param] = new Set(known(params.getAll(`filter.${param}`), options[param]));
    state.hiddenGroups = new Set(chosen(params, 'hidegroup', this.groupNames(), this.#hiddenGroupDefaults()));
    this.#applyMetricParams(params);
    this.#emit();
  }

  /**
   * What a study report takes from the portfolio's params: the hidden metrics, those its hidden groups hide included.
   * One 'change'.
   */
  applyMetricParams(params) {
    this.#applyMetricParams(params);
    const ids = this.metrics.map((m) => m.MetricID);
    for (const id of params.getAll('hidebygroup')) if (ids.includes(id)) this.state.hiddenMetrics.add(id);
    this.#emit();
  }

  #applyMetricParams(params) {
    this.state.hiddenMetrics = new Set(chosen(params, 'hide', this.metrics.map((m) => m.MetricID), this.#defaults.metrics));
  }

  #bucketValues() {
    return bucketStudies(this.studies, this.state.groupBy).map((b) => String(b.value));
  }

  toggleMetric(metricId) {
    const set = this.state.hiddenMetrics;
    set.has(metricId) ? set.delete(metricId) : set.add(metricId);
    this.#emit();
  }

  /** Ticks every metric given, e.g. a group's when none of them is selected. @param {string[]} metricIds */
  selectMetrics(metricIds) {
    for (const id of metricIds) this.state.hiddenMetrics.delete(id);
    this.#emit();
  }

  /** Shows every metric: none unticked and no group hidden. */
  showAllMetrics() {
    this.state.hiddenMetrics.clear();
    this.state.hiddenGroups.clear();
    this.#emit();
  }

  #emit() {
    this.dispatchEvent(new CustomEvent('change'));
  }

  set(key, value) {
    this.state[key] = value;
    if (key === 'groupBy') this.state.collapsed.clear();
    this.#emit();
  }

  /** The heatmap the table shows: its measure under Custom cell display, none otherwise (#47). */
  activeHeatmap() {
    return this.state.view === 'custom' ? this.state.heatmap : 'none';
  }

  /** @param {string} key @param {string} value */
  setAdmin(key, value) {
    this.state.admin = { ...this.state.admin, [key]: value };
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

  toggleColumn(part) {
    const set = this.state.columns;
    set.has(part) ? set.delete(part) : set.add(part);
    this.#emit();
  }

  /** Return every setting the address holds to its configured default, as a fresh load with no hash would. One 'change'. */
  reset() {
    this.applyProgramParams(new URLSearchParams());
  }

  clearFilters() {
    for (const set of Object.values(this.state.filters)) set.clear();
    this.#emit();
  }

  activeFilterCount() {
    return Object.values(this.state.filters).reduce((n, set) => n + set.size, 0);
  }

  toggleBucketOpen(bucketValue) {
    const set = this.state.collapsed;
    set.has(bucketValue) ? set.delete(bucketValue) : set.add(bucketValue);
    this.#emit();
  }

  /** Distinct values per filterable param, for building filter controls; a missing or blank value is no choice. */
  filterOptions() {
    const out = {};
    for (const param of Object.keys(this.state.filters)) {
      const values = this.studies.map((s) => studyValue(s, param));
      out[param] = [...new Set(values.filter((v) => v !== null))].sort();
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

  /** The study's pooled rate at each of its snapshots up to the visit shown (#32's sparkline). */
  studyTrend(studyId, metricId, upTo = this.latestDate(studyId)) {
    const study = this.studies.find((s) => s.StudyID === studyId);
    if (!study || upTo == null) return [];
    return [...study.snapshots]
      .filter((date) => date <= upTo)
      .sort()
      .map((date) => ({ date, rate: this.studyRollup(studyId, date, metricId)?.Metric ?? null }));
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

  /** The filtered studies whose history the trends draw on, off-cycle ones included (#14). */
  filteredHistory() {
    return filterStudies(this.historyStudies, this.state.filters);
  }

  /** Each group's history studies, off-cycle ones included, by group value. */
  historyBuckets() {
    return new Map(bucketStudies(this.filteredHistory(), this.state.groupBy).map((b) => [String(b.value), b.studies]));
  }

  /**
   * Portfolio pooled rate per snapshot grid date (D5). Each study contributes
   * its latest snapshot as of the grid date; studies with none yet are absent.
   */
  trendSeries(metricId, studies = this.filteredHistory()) {
    const cycle = this.cycle?.SnapshotDate;
    const gridDates = [...new Set(studies.flatMap((s) => s.snapshots))].filter((d) => !cycle || d <= cycle).sort();
    return gridDates.map((date) => {
      // The cycle's own point is a current figure, so like the totals it leaves off-cycle studies out (#14).
      const counted = date === cycle ? studies.filter((s) => !this.#offCycle.has(s.StudyID)) : studies;
      const { Rate, NumStudies } = poolSummary(this.#index, selectLatestSnapshots(counted, date), metricId);
      return { date, rate: Rate, nStudies: NumStudies };
    });
  }
}

import { orderMetrics, normalizeMetric, pivotGroups, indexResults } from './normalize.js';
import { selectLatestSnapshots, poolResults, flagDistribution, bucketStudies, filterStudies } from './rollup.js';
import { nextSort } from './sort.js';
import { STATUS_ORDER, CATEGORY_ORDER, groupByCategory } from './catalog.js';

/**
 * PortfolioStore owns the loaded data and all view state for the program page.
 * Components read from it and call its setters; every mutation emits 'change'.
 * It is deliberately not a custom element — hosts that compose their own UI
 * (e.g. a gsm.kri htmlwidget) can drive it directly.
 */
export class PortfolioStore extends EventTarget {
  constructor({ manifest, snapshots }) {
    super();
    const { active, inactive } = orderMetrics(manifest.metrics.map(normalizeMetric));
    this.metrics = active;
    this.inactiveMetrics = inactive;
    this.studies = manifest.studies;
    this.generated = manifest.generated;

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
      show: new Set(['num', 'rate']), // any of num | den | rate | flagged | red | dist | trend; cells stack what's on
      heatmap: 'flagged', // 'none' | 'num' | 'den' | 'rate' | 'flagged' | 'red' — the measure that drives cell shading (and metric sorting)
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
      collapsedGroups: new Set(), // program table: categories folded to one summary column
    };
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

  /** Contract `details` rows (categorical breakdown counts) for one metric. */
  detailRows(studyId, date, metricId) {
    const details = this.#entry(studyId, date)?.snapshot.details ?? [];
    return details.filter((d) => d.MetricID === metricId);
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
   * Participants enrolled across a set of studies, each at its own latest
   * snapshot — the same snapshot selection the metric rollups use, so the
   * enrollment column and the metric columns always describe the same extract.
   * Summed from Reporting_Groups `ParticipantCount`; `ParticipantTarget` comes
   * along for the "n of target" context.
   *
   * `enrolled` is null when no study in the set reports a count, so a missing
   * value is never rendered as a real zero.
   */
  enrollment(studies) {
    let enrolled = 0;
    let target = 0;
    let counted = 0;
    const latest = this.latestFor(studies);
    for (const [studyId, date] of latest) {
      const params = this.studyParamsAt(studyId, date);
      const n = Number(params.ParticipantCount);
      const t = Number(params.ParticipantTarget);
      if (Number.isFinite(n)) {
        enrolled += n;
        counted += 1;
      }
      if (Number.isFinite(t)) target += t;
    }
    return {
      enrolled: counted ? enrolled : null,
      target: target || null,
      nStudies: latest.size,
      nCounted: counted,
    };
  }

  /**
   * Participant populations (P4) across a set of studies at their latest
   * snapshots: Screened / Enrolled / Dosed from Reporting_Groups
   * `ScreenedCount` / `ParticipantCount` / `DosedCount`. Each is null when no
   * study in the set reports it.
   */
  population(studies) {
    const totals = { screened: 0, enrolled: 0, dosed: 0 };
    const counted = { screened: 0, enrolled: 0, dosed: 0 };
    const keys = { screened: 'ScreenedCount', enrolled: 'ParticipantCount', dosed: 'DosedCount' };
    for (const [studyId, date] of this.latestFor(studies)) {
      const params = this.studyParamsAt(studyId, date);
      for (const [k, param] of Object.entries(keys)) {
        const n = Number(params[param]);
        if (params[param] != null && Number.isFinite(n)) {
          totals[k] += n;
          counted[k] += 1;
        }
      }
    }
    return Object.fromEntries(Object.keys(keys).map((k) => [k, counted[k] ? totals[k] : null]));
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
   * Pooled rollup for a set of studies at their latest snapshots: Σ site
   * numerators / Σ site denominators across every contributing site, plus
   * the site flag distribution. One study or the whole portfolio — same math.
   */
  rollup(studies, metricId) {
    const latest = this.latestFor(studies);
    const siteRows = [];
    for (const [studyId, date] of latest) siteRows.push(...this.siteRows(studyId, date, metricId));
    return { ...poolResults(siteRows), NumSites: siteRows.length, flags: flagDistribution(siteRows) };
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
      const atDate = selectLatestSnapshots(studies, date);
      const rows = [];
      for (const [studyId, snapDate] of atDate) rows.push(...this.siteRows(studyId, snapDate, metricId));
      const { Rate, NumStudies } = poolResults(rows);
      return { date, rate: Rate, nStudies: NumStudies };
    });
  }
}

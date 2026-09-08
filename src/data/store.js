import { orderMetrics, normalizeMetric, pivotGroups, indexResults } from './normalize.js';
import { selectLatestSnapshots, poolResults, flagDistribution, bucketStudies, filterStudies } from './rollup.js';

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
      show: 'rate', // 'rate' | 'count' | 'trend'
      heatmap: 'share', // 'none' | 'share' | 'dist'
      ramp: 'blue', // heatmap palette: 'blue' | 'teal' | 'purple' | 'grey'
      groupBy: 'none', // 'none' (one row per study) | a study param
      filters: { therapeutic_area: new Set(), phase: new Set(), status: new Set() },
      hiddenMetrics: new Set(), // MetricIDs the user has switched off
      expanded: new Set(),
      asOf: null,
    };
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
    return this.supportedMetrics().filter((m) => !this.state.hiddenMetrics.has(m.MetricID));
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

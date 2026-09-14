// dataSpec resolution: the host assembles exactly the slices a widget
// declares and injects them — widgets never reach into the store or fetch.
// Mirrors how workr resolves workflow `spec:` blocks.
//
// Layers: results ('self' | 'all-site'), details ('self'), bounds ('self'),
// groups ('self'), history ('self' — site rows across the study's snapshots),
// external (link config only), listings (never on the exec build).

/**
 * @param {object} dataSpec
 * @param {{ store: import('../data/store.js').PortfolioStore, studyId: string, metricId?: string }} ctx
 */
export function resolveData(dataSpec, { store, studyId, metricId }) {
  const date = store.latestDate(studyId);
  // View state, not a data layer: every site-level view needs to know which
  // site is highlighted, and no widget should reach into the store for it.
  const data = { studyId, date, selectedSite: store.state.selectedSite };

  if (dataSpec.results === 'self' && metricId) {
    data.metric = store.metrics.find((m) => m.MetricID === metricId) ?? null;
    data.study = store.studyRollup(studyId, date, metricId); // derived from site rows
    data.siteRows = store.siteRows(studyId, date, metricId);
    data.trend = store.studyTrend(studyId, metricId);
    data.portfolio = store.rollup(store.studies, metricId); // whole-portfolio comparison
  } else if (dataSpec.results === 'all-site') {
    data.metrics = store.metrics;
    data.siteRowsByMetric = new Map(
      store.metrics.map((m) => [m.MetricID, store.siteRows(studyId, date, m.MetricID)])
    );
  }

  if (dataSpec.details === 'self' && metricId) data.details = store.detailRows(studyId, date, metricId);
  if (dataSpec.bounds === 'self' && metricId) data.bounds = store.boundsRows(studyId, date, metricId);
  if (dataSpec.groups === 'self') data.groups = store.groupRows(studyId, date);
  if (dataSpec.history === 'self' && metricId) {
    data.metric ??= store.metrics.find((m) => m.MetricID === metricId) ?? null;
    data.history = store.siteRowsHistory(studyId, metricId);
  }

  return data;
}

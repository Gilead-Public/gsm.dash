// dataSpec resolution: the host assembles exactly the slices a widget
// declares and injects them — widgets never reach into the store or fetch.
// Mirrors how workr resolves workflow `spec:` blocks.

/**
 * @param {object} dataSpec e.g. { results: 'self' } | { results: 'self', details: 'self' } | { results: 'all-site' }
 * @param {{ store: import('../data/store.js').PortfolioStore, studyId: string, metricId?: string }} ctx
 */
export function resolveData(dataSpec, { store, studyId, metricId }) {
  const date = store.latestDate(studyId);
  const data = { studyId, date };

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

  if (dataSpec.details === 'self' && metricId) {
    data.details = store.detailRows(studyId, date, metricId);
  }

  return data;
}

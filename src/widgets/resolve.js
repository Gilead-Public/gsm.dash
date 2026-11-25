// dataSpec resolution: the host assembles exactly the slices a widget
// declares and injects them — widgets never reach into the store or fetch.
// Mirrors how workr resolves workflow `spec:` blocks.
//
// Layers: results ('self' | 'all-site'), distributions ('self'), bounds ('self'),
// groups ('self'), history ('self' — site rows across the study's snapshots),
// external (link config only), listings (never on the exec build).
import { reportLink } from '../app/report-links.js';

/**
 * @param {object} dataSpec
 * @param {{ store: import('../data/store.js').PortfolioStore, studyId: string, metricId?: string, leadMetricId?: string }} ctx
 *   `leadMetricId`: another metric whose distributions a breakdown leads with.
 */
export function resolveData(dataSpec, { store, studyId, metricId, leadMetricId }) {
  const date = store.latestDate(studyId);
  const data = { studyId, date };

  if (dataSpec.results === 'self' && metricId) {
    data.metric = store.metrics.find((m) => m.MetricID === metricId) ?? null;
    data.study = store.studyRollup(studyId, date, metricId); // derived from site rows
    data.siteRows = store.siteRows(studyId, date, metricId);
    data.reportLink = reportLink(data.metric, store.reportBase, globalThis.location?.href ?? '', studyId);
  } else if (dataSpec.results === 'all-site') {
    data.metrics = store.metrics;
    data.siteRowsByMetric = new Map(
      store.metrics.map((m) => [m.MetricID, store.siteRows(studyId, date, m.MetricID)])
    );
  }

  if (dataSpec.distributions === 'self' && metricId) data.distributions = store.distributionRows(studyId, date, metricId);
  if (dataSpec.distributions === 'self' && leadMetricId) {
    data.leadMetric = store.metrics.find((m) => m.MetricID === leadMetricId) ?? null;
    data.leadDistributions = store.distributionRows(studyId, date, leadMetricId);
  }
  if (dataSpec.bounds === 'self' && metricId) data.bounds = store.boundsRows(studyId, date, metricId);
  if (dataSpec.groups === 'self') data.groups = store.groupRows(studyId, date);
  if (dataSpec.history === 'self' && metricId) {
    data.metric ??= store.metrics.find((m) => m.MetricID === metricId) ?? null;
    data.history = store.siteRowsHistory(studyId, metricId);
  }

  return data;
}

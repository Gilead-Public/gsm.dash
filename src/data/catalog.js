// Metrics carry no group of their own: the portfolio's configuration groups them (#16's `groups`), and the wrapper
// supplies its default groups.

export const OTHER_CATEGORY = 'Other';
export const ALL_METRICS = 'Metrics';

/**
 * Every metric in one group, in catalog order, for a portfolio configured with no groups.
 * @param {any[]} metrics
 */
export const ungrouped = (metrics) => (metrics.length ? [{ category: ALL_METRICS, metrics }] : []);

/**
 * Group metrics as the portfolio's configuration lists them (#16's `groups`): each group's metrics in its order, then
 * the metrics no group lists in a trailing "Other" group, in catalog order. "Other" is reserved, so no configured group
 * has that name. Empty groups are dropped.
 * @param {any[]} metrics
 * @param {Array<{ name: string, metrics: string[] }>} groups
 */
export function groupAsConfigured(metrics, groups) {
  const byId = new Map(metrics.map((m) => [m.MetricID, m]));
  const listed = new Set(groups.flatMap((g) => g.metrics));
  const out = groups.map((g) => ({ category: g.name, metrics: g.metrics.map((id) => byId.get(id)).filter(Boolean) }));
  const rest = metrics.filter((m) => !listed.has(m.MetricID));
  if (rest.length) out.push({ category: OTHER_CATEGORY, metrics: rest });
  return out.filter((g) => g.metrics.length);
}

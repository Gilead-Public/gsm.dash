// Metric catalog conventions shared by both pages. The categories and their
// order come from the CTQ Oversight Dashboard glossary review: the program
// table's column bands and the study page's tile rows read the same
// `meta.Category`, so both pages always present metrics in the same order.

export const CATEGORY_ORDER = ['Disposition', 'Early events', 'Eligibility & integrity', 'Safety & deviations', 'Data quality'];
export const OTHER_CATEGORY = 'Other';

/**
 * Group metrics into category buckets in CATEGORY_ORDER; metrics with an
 * unknown or missing Category land in a trailing "Other" bucket. Metric order
 * within a bucket is preserved. Empty buckets are dropped.
 */
export function groupByCategory(metrics, order = CATEGORY_ORDER) {
  const buckets = new Map(order.map((c) => [c, []]));
  const other = [];
  for (const m of metrics) (buckets.get(m.Category) ?? other).push(m);
  const out = [...buckets].map(([category, list]) => ({ category, metrics: list }));
  if (other.length) out.push({ category: OTHER_CATEGORY, metrics: other });
  return out.filter((g) => g.metrics.length);
}

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

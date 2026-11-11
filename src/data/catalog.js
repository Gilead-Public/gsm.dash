// Metric catalog conventions shared by both pages. The categories and their
// order come from the CTQ Oversight Dashboard glossary review: the program
// table's column bands and the study page's tile rows read the same
// `meta.Category`, so both pages always present metrics in the same order.

export const CATEGORY_ORDER = ['Disposition', 'Early events', 'Eligibility & integrity', 'Safety & deviations', 'Data quality'];
export const OTHER_CATEGORY = 'Other';

// Tracker lifecycle: Released (in production), New (in development), Planned
// (owned by a roadmap Requirement, not yet built — values are simulated).
export const STATUS_ORDER = ['Released', 'New', 'Planned'];

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

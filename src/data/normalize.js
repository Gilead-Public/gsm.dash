// Normalization of contract JSON into the in-memory model. Runs once at ingest.

/** Parse a Reporting_Metrics comma-delimited field ("-2,-1,2,3") into numbers. */
export function parseListField(value) {
  if (value == null || value === '' || value === 'NA') return [];
  if (Array.isArray(value)) return value.map(Number);
  return String(value)
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => !Number.isNaN(v));
}

/** Pivot Reporting_Groups EAV rows into GroupID -> {param: value}. */
export function pivotGroups(rows = []) {
  const out = new Map();
  for (const { GroupID, Param, Value } of rows) {
    if (!out.has(GroupID)) out.set(GroupID, {});
    out.get(GroupID)[Param] = Value;
  }
  return out;
}

/**
 * Order the metric catalog for display: active metrics only, by Priority
 * (ascending, missing last), then MetricID. Inactive metrics stay available
 * on the returned object for catalog views.
 */
export function orderMetrics(metrics = []) {
  const bySort = (a, b) =>
    (a.Priority ?? Infinity) - (b.Priority ?? Infinity) || a.MetricID.localeCompare(b.MetricID);
  const active = metrics.filter((m) => m.Active !== false).sort(bySort);
  const inactive = metrics.filter((m) => m.Active === false).sort(bySort);
  return { active, inactive };
}

/** Normalize one metric entry: parsed threshold/flag lists alongside the raw fields. */
export function normalizeMetric(metric) {
  return {
    // Glossary defaults: catalogs without display metadata render as before.
    Display: 'pct',
    Status: 'Released',
    ...metric,
    thresholds: parseListField(metric.Threshold),
    flagValues: parseListField(metric.Flag),
  };
}

/**
 * Index snapshot results by MetricID and GroupLevel. Rows are stamped with the
 * snapshot's StudyID/SnapshotDate when they omit them, so site rows can be
 * pooled across studies without carrying redundant columns in the contract.
 */
export function indexResults(results = [], { StudyID, SnapshotDate } = {}) {
  const byMetric = new Map();
  for (const raw of results) {
    const row = { StudyID, SnapshotDate, ...raw };
    if (!byMetric.has(row.MetricID)) byMetric.set(row.MetricID, { study: [], site: [], country: [] });
    const bucket = byMetric.get(row.MetricID);
    if (row.GroupLevel === 'Site') bucket.site.push(row);
    else if (row.GroupLevel === 'Study') bucket.study.push(row);
    else if (row.GroupLevel === 'Country') bucket.country.push(row);
  }
  return byMetric;
}

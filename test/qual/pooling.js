// @ts-check
// Independent portfolio arithmetic for checking what the pages show. It reads the per-study files directly and shares
// no code with src/: each study contributes its own latest snapshot on or before the as-of date, and a pooled rate is
// the sum of site numerators over the sum of site denominators.

/**
 * @typedef {object} StudyEntry
 * @property {string} StudyID
 * @property {Record<string, string | number>} params
 * @property {string[]} snapshots
 * @property {Record<string, string>} files
 */

/**
 * @typedef {object} MetricMeta
 * @property {string} MetricID
 * @property {string} Abbreviation
 * @property {string} [Display]
 * @property {string} [GroupLevel]
 * @property {boolean} [Active]
 * @property {number} [Priority]
 * @property {string} [Category]
 * @property {string} [Numerator]
 * @property {string} [Widget]
 * @property {string[]} [Widgets]
 */

/**
 * @typedef {object} SiteRow
 * @property {string} GroupID
 * @property {number} Numerator
 * @property {number} Denominator
 * @property {number | null} Flag
 */

/**
 * The metrics the pages show, in catalog order: active site-level metrics by Priority, then MetricID.
 * @param {MetricMeta[]} catalog
 * @returns {MetricMeta[]}
 */
export const shownMetrics = (catalog) =>
  catalog
    .filter((m) => m.Active !== false && m.GroupLevel === 'Site')
    .sort((a, b) => (a.Priority ?? Infinity) - (b.Priority ?? Infinity) || a.MetricID.localeCompare(b.MetricID));

/**
 * @param {StudyEntry} study
 * @returns {string}
 */
export const latestSnapshot = (study) => [...study.snapshots].sort()[study.snapshots.length - 1];

/**
 * Studies by the string value of one parameter, as a person would group them.
 * @param {StudyEntry[]} studies
 * @param {string} param
 * @returns {Map<string, StudyEntry[]>}
 */
export function studiesBy(studies, param) {
  /** @type {Map<string, StudyEntry[]>} */
  const groups = new Map();
  for (const s of studies) {
    const key = String(s.params[param] ?? '(missing)');
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  return groups;
}

/**
 * @param {StudyEntry} study
 * @param {string | null} asOf
 * @returns {string | null}
 */
export function snapshotAsOf(study, asOf) {
  const eligible = study.snapshots.filter((d) => asOf === null || d <= asOf).sort();
  return eligible.at(-1) ?? null;
}

/**
 * @param {(path: string) => any} read
 * @param {StudyEntry} study
 * @param {string} metricId
 * @param {string | null} asOf
 * @returns {SiteRow[]}
 */
export function siteRows(read, study, metricId, asOf = null) {
  const date = snapshotAsOf(study, asOf);
  if (!date) return [];
  return read(study.files[date]).results.filter((/** @type {any} */ r) => r.MetricID === metricId && r.GroupLevel === 'Site');
}

/**
 * @typedef {object} Pooled
 * @property {number} numerator
 * @property {number} denominator
 * @property {number | null} rate
 * @property {number} studies Studies contributing at least one site row.
 * @property {number} sites
 * @property {{ red: number; amber: number; green: number; na: number }} flags Sites by flag: |2| red, |1| amber, 0 green, none na.
 */

/**
 * @param {(path: string) => any} read
 * @param {StudyEntry[]} studies
 * @param {string} metricId
 * @param {string | null} asOf
 * @returns {Pooled}
 */
export function pooled(read, studies, metricId, asOf = null) {
  let numerator = 0;
  let denominator = 0;
  let contributing = 0;
  let sites = 0;
  const flags = { red: 0, amber: 0, green: 0, na: 0 };
  for (const study of studies) {
    const rows = siteRows(read, study, metricId, asOf);
    if (rows.length) contributing++;
    for (const r of rows) {
      numerator += r.Numerator;
      denominator += r.Denominator;
      sites++;
      if (r.Flag == null) flags.na++;
      else if (Math.abs(r.Flag) >= 2) flags.red++;
      else if (Math.abs(r.Flag) >= 1) flags.amber++;
      else flags.green++;
    }
  }
  return { numerator, denominator, rate: denominator > 0 ? numerator / denominator : null, studies: contributing, sites, flags };
}

/**
 * The pooled rate on every date any of the studies has a snapshot, each study as of that date.
 * @param {(path: string) => any} read
 * @param {StudyEntry[]} studies
 * @param {string} metricId
 */
export function pooledTrend(read, studies, metricId) {
  const dates = [...new Set(studies.flatMap((s) => s.snapshots))].sort();
  return dates.map((date) => {
    const p = pooled(read, studies, metricId, date);
    return { date, rate: p.rate, studies: p.studies };
  });
}

/**
 * A study-level population parameter (ScreenedCount, ParticipantCount, DosedCount) summed over the studies with a
 * snapshot on or before asOf, each from its latest snapshot, or null when none of them reports it.
 * @param {(path: string) => any} read
 * @param {StudyEntry[]} studies
 * @param {string} param
 * @param {string | null} [asOf]
 * @returns {number | null}
 */
export function population(read, studies, param, asOf = null) {
  let total = 0;
  let reported = 0;
  for (const study of studies) {
    if (snapshotAsOf(study, asOf) === null) continue;
    const row = read(study.files[latestSnapshot(study)]).groups.find(
      (/** @type {any} */ g) => g.GroupLevel === 'Study' && g.GroupID === study.StudyID && g.Param === param,
    );
    if (row?.Value == null) continue;
    total += Number(row.Value);
    reported++;
  }
  return reported ? total : null;
}

/**
 * A count as the pages print it: thousands separated, '—' when absent.
 * @param {number | null} n
 */
export const countText = (n) => (n == null ? '—' : n.toLocaleString('en-US'));

/**
 * The rate in the unit the glossary displays: per 28 days for exposure metrics, else a percentage.
 * @param {MetricMeta} metric
 * @param {number} rate
 */
export const displayed = (metric, rate) => (metric.Display === 'per_28d' ? rate * 28 : rate * 100);

/**
 * Reads a displayed rate ("12.4%" or "1.15") back into the display unit.
 * @param {MetricMeta} metric
 * @param {string} text
 * @returns {number | null}
 */
export function readRate(metric, text) {
  const t = text.trim();
  if (t === '—') return null;
  const m = metric.Display === 'per_28d' ? /^(\d+\.\d{2})$/.exec(t) : /^(\d+\.\d)%$/.exec(t);
  if (!m) throw new Error(`unexpected rate format for ${metric.Abbreviation}: "${t}"`);
  return Number(m[1]);
}

/**
 * Half a unit in the last displayed digit, plus room for floating-point noise.
 * @param {MetricMeta} metric
 */
export const tolerance = (metric) => (metric.Display === 'per_28d' ? 0.005 : 0.05) + 1e-9;

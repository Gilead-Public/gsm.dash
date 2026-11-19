// @ts-check
// Every portfolio number comes from the counts-only summary (#15), never from pooling the per-study files.
import { poolResults, flagDistributionFromCounts } from './rollup.js';

export const FLAG_KEYS = ['-2', '-1', '0', '1', '2', 'NA'];

export const POPULATIONS = { screened: 'ScreenedCount', enrolled: 'ParticipantCount', dosed: 'DosedCount' };

/**
 * @typedef {object} SummaryRow
 * @property {string} StudyID
 * @property {string} SnapshotDate
 * @property {string} MetricID
 * @property {number} Numerator
 * @property {number} Denominator
 * @property {number} SiteCount
 * @property {Record<string, number>} FlagCounts
 */

/**
 * Indexes the summary, refusing one that describes different studies or snapshots than the manifest, or a study its
 * cycle doesn't list (#14).
 * @param {{ cycle: { SnapshotDate: string, studies: string[] }, studies: Array<{ StudyID: string, snapshots: string[] } & Record<string, any>>, counts: SummaryRow[] } | null | undefined} summary
 * @param {Array<{ StudyID: string, snapshots: string[] }>} studies The manifest's studies.
 */
export function indexSummary(summary, studies) {
  if (!summary) throw new Error('the portfolio summary (summary.json) is missing');
  if (new Set(studies.map((s) => s.StudyID)).size !== studies.length) throw new Error('the manifest lists a study more than once');
  const entries = new Map(summary.studies.map((s) => [s.StudyID, s]));
  if (entries.size !== summary.studies.length) throw new Error('the portfolio summary lists a study more than once');
  const same = (a, b) => [...a].sort().join() === [...b].sort().join();
  for (const study of studies) {
    const entry = entries.get(study.StudyID);
    if (!entry) throw new Error(`the portfolio summary has no entry for ${study.StudyID}`);
    if (!same(entry.snapshots, study.snapshots)) throw new Error(`the portfolio summary lists different snapshots for ${study.StudyID}`);
  }
  if (entries.size !== studies.length) throw new Error('the portfolio summary has studies the manifest does not list');
  const { cycle } = summary;
  const listed = new Set(cycle.studies);
  for (const id of entries.keys()) {
    if (!listed.has(id)) throw new Error(`the portfolio summary has ${id}, which its ${cycle.SnapshotDate} cycle does not list`);
  }

  const rows = new Map();
  const key = (studyId, date, metricId) => `${studyId}\n${date}\n${metricId}`;
  for (const row of summary.counts) {
    if (!entries.get(row.StudyID)?.snapshots.includes(row.SnapshotDate)) {
      throw new Error(`the portfolio summary has counts for ${row.StudyID} on ${row.SnapshotDate}, which is not one of its snapshots`);
    }
    const k = key(row.StudyID, row.SnapshotDate, row.MetricID);
    if (rows.has(k)) throw new Error(`the portfolio summary has more than one row for ${row.StudyID} ${row.SnapshotDate} ${row.MetricID}`);
    rows.set(k, row);
  }
  return {
    /**
     * The cycle, with the studies whose latest snapshot is on another date and the listed studies with no entry.
     * @type {{ SnapshotDate: string, offCycle: Array<{ StudyID: string, latest: string }>, missing: string[] }}
     */
    cycle: {
      SnapshotDate: cycle.SnapshotDate,
      offCycle: summary.studies
        .map((s) => ({ StudyID: s.StudyID, latest: [...s.snapshots].sort().at(-1) ?? '' }))
        .filter((s) => s.latest !== cycle.SnapshotDate),
      missing: cycle.studies.filter((id) => !entries.has(id)),
    },
    /** @returns {SummaryRow | null} */
    row: (studyId, date, metricId) => rows.get(key(studyId, date, metricId)) ?? null,
    /**
     * The study's count for one of POPULATIONS at its latest snapshot, or null when it reports none.
     * @returns {number | null}
     */
    population: (studyId, param) => entries.get(studyId)?.[param] ?? null,
  };
}

/**
 * Pools one metric over the given study snapshots: Σ numerators / Σ denominators, with site and flag counts summed.
 * @param {ReturnType<typeof indexSummary>} index
 * @param {Map<string, string>} snapshots StudyID -> SnapshotDate
 * @param {string} metricId
 */
export function poolSummary(index, snapshots, metricId) {
  const rows = [];
  for (const [studyId, date] of snapshots) {
    const row = index.row(studyId, date, metricId);
    if (row) rows.push(row);
  }
  const flags = Object.fromEntries(FLAG_KEYS.map((k) => [k, 0]));
  for (const row of rows) for (const k of FLAG_KEYS) flags[k] += row.FlagCounts[k];
  return {
    ...poolResults(rows),
    NumSites: rows.reduce((n, r) => n + r.SiteCount, 0),
    flags: flagDistributionFromCounts(flags),
  };
}

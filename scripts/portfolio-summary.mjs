// The counts-only portfolio summary (#15), as the example-data generator writes it. In production the portfolio
// repository produces the same document.
import { FLAG_KEYS, POPULATIONS } from '../src/data/summary.js';

export const SUMMARY_SCHEMA_VERSION = '1.0.0';

/**
 * Sums each study snapshot's site rows per metric, and takes each study's population counts from its latest snapshot.
 * Only counts are kept; rates and shares are left to the reader.
 * @param {{ generated: string, studies: Array<{ StudyID: string, snapshots: string[] }> }} manifest
 * @param {Array<{ StudyID: string, SnapshotDate: string, results: any[], groups: any[] }>} snapshots
 */
export function buildSummary(manifest, snapshots) {
  const counts = [];
  for (const snap of snapshots) {
    const byMetric = new Map();
    for (const r of snap.results) {
      if (r.GroupLevel !== 'Site') continue;
      let row = byMetric.get(r.MetricID);
      if (!row) {
        row = {
          StudyID: snap.StudyID,
          SnapshotDate: snap.SnapshotDate,
          MetricID: r.MetricID,
          Numerator: 0,
          Denominator: 0,
          SiteCount: 0,
          FlagCounts: Object.fromEntries(FLAG_KEYS.map((k) => [k, 0])),
        };
        byMetric.set(r.MetricID, row);
      }
      const flag = r.Flag == null ? 'NA' : String(r.Flag);
      if (!FLAG_KEYS.includes(flag)) {
        throw new Error(`${snap.StudyID} ${snap.SnapshotDate} ${r.MetricID} ${r.GroupID}: flag ${r.Flag} is not -2, -1, 0, 1, 2 or missing`);
      }
      row.Numerator += r.Numerator;
      row.Denominator += r.Denominator;
      row.SiteCount += 1;
      row.FlagCounts[flag] += 1;
    }
    counts.push(...byMetric.values());
  }
  return {
    schemaVersion: SUMMARY_SCHEMA_VERSION,
    generated: manifest.generated,
    studies: manifest.studies.map(({ StudyID, snapshots: dates }) => ({
      StudyID,
      snapshots: dates,
      ...populations(snapshots.find((s) => s.StudyID === StudyID && s.SnapshotDate === [...dates].sort().at(-1))),
    })),
    counts,
  };
}

/** @param {{ StudyID: string, SnapshotDate: string, groups: any[] } | undefined} snap */
function populations(snap) {
  const out = {};
  for (const param of Object.values(POPULATIONS)) {
    const value = snap?.groups.find((g) => g.GroupLevel === 'Study' && g.GroupID === snap.StudyID && g.Param === param)?.Value;
    if (value == null) continue;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) throw new Error(`${snap.StudyID} ${snap.SnapshotDate}: ${param} ${value} is not a count`);
    out[param] = n;
  }
  return out;
}

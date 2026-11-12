// @ts-check
// One study's report data: the metric catalog, its manifest entry, all its snapshots, and the portfolio comparison
// for each of its snapshot dates, pooled from the counts-only summary (#15).
import { selectLatestSnapshots } from '../src/data/rollup.js';
import { indexSummary, poolSummary } from '../src/data/summary.js';

export const STUDY_DOCUMENT_SCHEMA_VERSION = '1.0.0';

/**
 * @param {{ manifest: any, summary: any, read: (path: string) => any }} data `read` returns a parsed file the manifest lists.
 * @param {string} studyId
 */
export function buildStudyDocument({ manifest, summary, read }, studyId) {
  const study = manifest.studies.find((/** @type {any} */ s) => s.StudyID === studyId);
  if (!study) throw new Error(`the manifest has no study ${studyId}`);
  const index = indexSummary(summary, manifest.studies);
  const comparison = [];
  const newest = [...study.snapshots].sort().at(-1);
  for (const date of study.snapshots) {
    // As on the study page: the newest visit compares with every study at its own latest snapshot, even one newer
    // than this study's; an earlier visit compares with every study as of that visit.
    const asOf = selectLatestSnapshots(manifest.studies, date === newest ? null : date);
    for (const { MetricID } of manifest.metrics) {
      const { Numerator, Denominator, NumStudies } = poolSummary(index, asOf, MetricID);
      if (NumStudies) comparison.push({ SnapshotDate: date, MetricID, Numerator, Denominator });
    }
  }
  return {
    schemaVersion: STUDY_DOCUMENT_SCHEMA_VERSION,
    generated: manifest.generated,
    metrics: manifest.metrics,
    study: { StudyID: study.StudyID, params: study.params, snapshots: study.snapshots },
    snapshots: study.snapshots.map((/** @type {string} */ d) => read(study.files[d])),
    comparison,
  };
}

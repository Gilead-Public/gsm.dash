// @ts-check
// One study's report data: the metric catalog, its manifest entry and all its snapshots.

export const STUDY_DOCUMENT_SCHEMA_VERSION = '2.1.0';

/**
 * @param {{ manifest: any, read: (path: string) => any, title?: string }} data `read` returns a parsed file the manifest
 *   lists. `title` is the dashboard's title (#24), set by the render step.
 * @param {string} studyId
 */
export function buildStudyDocument({ manifest, read, title }, studyId) {
  const study = manifest.studies.find((/** @type {any} */ s) => s.StudyID === studyId);
  if (!study) throw new Error(`the manifest has no study ${studyId}`);
  return {
    schemaVersion: STUDY_DOCUMENT_SCHEMA_VERSION,
    generated: manifest.generated,
    ...(manifest.reportBase != null && { reportBase: manifest.reportBase }),
    ...(title != null && { title }),
    metrics: manifest.metrics,
    study: { StudyID: study.StudyID, params: study.params, snapshots: study.snapshots },
    snapshots: study.snapshots.map((/** @type {string} */ d) => read(study.files[d])),
  };
}

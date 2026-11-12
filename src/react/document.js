import validate from 'virtual:gsm/validate-study-document';

/**
 * @typedef {object} StudyDocument
 * @property {string} schemaVersion
 * @property {string} generated
 * @property {any[]} metrics
 * @property {{ StudyID: string, params: Record<string, string | number>, snapshots: string[] }} study
 * @property {any[]} snapshots
 * @property {Array<{ SnapshotDate: string, MetricID: string, Numerator: number, Denominator: number }>} comparison
 */

/**
 * Reads the report's data document, refusing one that isn't JSON, fails its schema, holds snapshots that aren't the
 * study's own, or repeats a comparison row.
 * @param {string | null | undefined} text
 * @returns {{ ok: true, doc: StudyDocument } | { ok: false, errors: string[] }}
 */
export function readStudyDocument(text) {
  let doc;
  try {
    doc = JSON.parse(text ?? '');
  } catch (e) {
    return { ok: false, errors: [`the data is not JSON: ${e instanceof Error ? e.message : e}`] };
  }
  if (!validate(doc)) {
    return { ok: false, errors: (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`) };
  }
  const { StudyID, snapshots } = doc.study;
  const errors = doc.snapshots.flatMap((/** @type {any} */ s, /** @type {number} */ i) =>
    s.StudyID === StudyID ? [] : [`/snapshots/${i} is for ${s.StudyID}, not ${StudyID}`],
  );
  const dates = doc.snapshots.map((/** @type {any} */ s) => s.SnapshotDate).sort();
  if (dates.join() !== [...snapshots].sort().join()) errors.push(`/snapshots are not the study's snapshot dates`);
  const seen = new Set();
  for (const { SnapshotDate, MetricID } of doc.comparison) {
    const key = `${SnapshotDate} ${MetricID}`;
    if (seen.has(key)) errors.push(`/comparison has more than one row for ${key}`);
    seen.add(key);
  }
  return errors.length ? { ok: false, errors } : { ok: true, doc };
}

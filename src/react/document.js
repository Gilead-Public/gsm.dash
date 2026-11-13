// @ts-check
import validateStudy from 'virtual:gsm/validate-study-document';
import validatePortfolio from 'virtual:gsm/validate-portfolio-document';
import { indexSummary } from '../data/summary.js';

/**
 * @typedef {object} StudyDocument
 * @property {string} schemaVersion
 * @property {string} generated
 * @property {string} [reportBase]
 * @property {any[]} metrics
 * @property {{ StudyID: string, params: Record<string, string | number>, snapshots: string[] }} study
 * @property {any[]} snapshots
 * @property {Array<{ SnapshotDate: string, MetricID: string, Numerator: number, Denominator: number }>} comparison
 */

/**
 * @typedef {object} PortfolioDocument
 * @property {string} schemaVersion
 * @property {string} generated
 * @property {string} [reportBase]
 * @property {any[]} metrics
 * @property {Array<{ StudyID: string, params: Record<string, string | number>, snapshots: string[] }>} studies
 * @property {any} summary
 */

/**
 * The document as JSON that passes its schema, or why it isn't.
 * @param {string | null | undefined} text
 * @param {typeof validateStudy} validate
 * @returns {{ ok: true, doc: any } | { ok: false, errors: string[] }}
 */
function parse(text, validate) {
  let doc;
  try {
    doc = JSON.parse(text ?? '');
  } catch (e) {
    return { ok: false, errors: [`the data is not JSON: ${e instanceof Error ? e.message : e}`] };
  }
  if (!validate(doc)) {
    return { ok: false, errors: (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`) };
  }
  return { ok: true, doc };
}

/**
 * Reads the report's data document, refusing one that isn't JSON, fails its schema, holds snapshots that aren't the
 * study's own, or repeats a comparison row.
 * @param {string | null | undefined} text
 * @returns {{ ok: true, doc: StudyDocument } | { ok: false, errors: string[] }}
 */
export function readStudyDocument(text) {
  const parsed = parse(text, validateStudy);
  if (!parsed.ok) return parsed;
  const { doc } = parsed;
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

/**
 * Reads the portfolio report's data document, refusing one that isn't JSON, fails its schema, or whose summary
 * describes other studies or snapshots than the document lists.
 * @param {string | null | undefined} text
 * @returns {{ ok: true, doc: PortfolioDocument } | { ok: false, errors: string[] }}
 */
export function readPortfolioDocument(text) {
  const parsed = parse(text, validatePortfolio);
  if (!parsed.ok) return parsed;
  try {
    indexSummary(parsed.doc.summary, parsed.doc.studies);
  } catch (e) {
    return { ok: false, errors: [`/summary: ${e instanceof Error ? e.message : e}`] };
  }
  return parsed;
}

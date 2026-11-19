// @ts-check
// Visual acceptance against one validation run: what a reviewer must look at, and the records of what they accepted.
import { SHIPPED } from '../../e2e/projects.js';
/** @typedef {import('./gate.js').AcceptanceRecord} AcceptanceRecord */
/** @typedef {import('./gate.js').CriterionStatus} CriterionStatus */
/** @typedef {import('./criteria.js').Mode} Mode */

/**
 * @typedef {object} Shot
 * @property {Mode} mode
 * @property {string} path Relative to the run folder.
 * @property {string} sha256
 * @property {string} test
 */

/**
 * @typedef {object} Target
 * @property {string} id
 * @property {string} text
 * @property {Shot[]} shots
 * @property {string[]} problems Reasons the criterion can't be accepted on this run; empty when it can.
 */

/**
 * For each criterion, the shipped artifact's screenshots in every mode it requires, as the reviewer will see them.
 * A criterion that isn't a passing, in-scope visual criterion, or whose screenshots are missing or have changed since
 * the run, comes back with its problems.
 * @param {CriterionStatus[]} criteria The run's matrix.
 * @param {string[]} ids
 * @param {(path: string) => string | null} hashOf The sha256 of a run file as it is now, or null if it is missing.
 * @returns {Target[]}
 */
export function acceptanceTargets(criteria, ids, hashOf) {
  return ids.map((id) => {
    const c = criteria.find((x) => x.id === id);
    if (!c) return { id, text: '', shots: [], problems: [`${id}: not in this run's matrix`] };
    /** @type {string[]} */
    const problems = [];
    if (c.kind !== 'visual') problems.push(`${id}: a ${c.kind ?? 'unclassified'} criterion, not a visual one`);
    if (!c.inScope) problems.push(`${id}: not in this run's scope`);
    if (c.automated !== 'pass') problems.push(`${id}: its tests did not pass in this run (${c.automated})`);
    /** @type {Shot[]} */
    const shots = c.evidence
      .filter((e) => e.artifact === SHIPPED && e.mode !== null && c.modes.includes(e.mode) && e.sha256)
      .map((e) => ({ mode: /** @type {Mode} */ (e.mode), path: e.path, sha256: e.sha256, test: e.test }));
    for (const mode of c.modes) if (!shots.some((s) => s.mode === mode)) problems.push(`${id}: no ${SHIPPED} screenshot in ${mode} mode`);
    for (const s of shots) {
      const now = hashOf(s.path);
      if (now !== s.sha256) problems.push(`${id}: ${s.path} ${now === null ? 'is missing' : 'has changed since the run'}`);
    }
    return { id, text: c.text, shots, problems };
  });
}

/**
 * One record per screenshot the reviewer accepted.
 * @param {Target[]} targets
 * @param {{ runId: string, baselineHash: string, reviewer: string, acceptedAt: string }} by
 * @returns {AcceptanceRecord[]}
 */
export const acceptanceRecords = (targets, { runId, baselineHash, reviewer, acceptedAt }) =>
  targets.flatMap((t) => t.shots.map((s) => ({ runId, criterion: t.id, screenshotSha256: s.sha256, baselineHash, reviewer, acceptedAt })));

/**
 * The existing records with the new ones added; a new record replaces one for the same run, criterion and screenshot.
 * @param {AcceptanceRecord[]} existing
 * @param {AcceptanceRecord[]} added
 * @returns {AcceptanceRecord[]}
 */
export function mergeRecords(existing, added) {
  const key = (/** @type {AcceptanceRecord} */ r) => `${r.runId}\n${r.criterion}\n${r.screenshotSha256}`;
  const replaced = new Set(added.map(key));
  return [...existing.filter((r) => !replaced.has(key(r))), ...added];
}

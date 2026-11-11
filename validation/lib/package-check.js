// @ts-check
import { acceptedInEveryMode } from './gate.js';
/** @typedef {import('./gate.js').AcceptanceRecord} AcceptanceRecord */
/** @typedef {import('./gate.js').GateResult} GateResult */
import { REQUIRED_STEPS } from './record.js';
/** @typedef {import('./record.js').ManifestRow} ManifestRow */
/** @typedef {import('./record.js').RunRecord} RunRecord */

/**
 * @typedef {object} PackageInput
 * @property {RunRecord} run
 * @property {string} conclusion The Actions run's conclusion, fetched independently of the run's own record.
 * @property {string} tagCommit
 * @property {ManifestRow[]} manifest
 * @property {Map<string, string>} actualHashes sha256 recomputed now for every manifest path; missing files are absent.
 * @property {GateResult} gate
 * @property {AcceptanceRecord[]} acceptance
 */

/**
 * Every reason the run must not be packaged. Empty means it can be.
 * @param {PackageInput} p
 * @returns {string[]}
 */
export function packageProblems(p) {
  /** @type {string[]} */
  const problems = [];
  if (p.conclusion !== 'success') problems.push(`Actions run concluded "${p.conclusion}", not "success"`);
  if (p.run.validation !== 'passed') problems.push(`run.json validation is "${p.run.validation}"`);
  if (p.run.failures.length) problems.push(`run.json lists ${p.run.failures.length} failure(s)`);
  if (p.gate.incomplete) problems.push('the run is incomplete');
  for (const name of REQUIRED_STEPS) {
    const step = p.run.steps.find((s) => s.name === name);
    if (!step) problems.push(`step "${name}" is missing`);
    else if (step.skipped || step.exitCode !== 0) problems.push(`step "${name}" did not succeed`);
  }
  const env = p.run.environment;
  if (!env?.node || !env.browser?.version || !env.lockfileSha256) problems.push('run.json does not record the execution environment');
  if (p.run.commit !== p.tagCommit) problems.push(`run commit ${p.run.commit.slice(0, 12)} is not the tag commit ${p.tagCommit.slice(0, 12)}`);

  for (const row of p.manifest) {
    const actual = p.actualHashes.get(row.path);
    if (!actual) problems.push(`manifest file missing: ${row.path}`);
    else if (actual !== row.sha256) problems.push(`hash mismatch: ${row.path}`);
  }

  for (const c of p.gate.criteria.filter((c) => c.inScope && c.kind === 'visual')) {
    if (!acceptedInEveryMode(c, p.acceptance, p.run.runId, p.run.baselineHash)) {
      problems.push(`${c.id}: acceptance does not cover this run's screenshots in every mode (${c.modes.join(', ')})`);
    }
  }
  return problems;
}

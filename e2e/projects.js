// @ts-check
import { MODES } from '../validation/lib/criteria.js';
/** @typedef {import('../validation/lib/criteria.js').Mode} Mode */

/**
 * `reports`: one self-contained file per report, which is what ships.
 * @typedef {'reports'} Artifact
 */

/** @type {readonly Artifact[]} */
export const ARTIFACTS = ['reports'];

/** Visual acceptance is recorded against the artifact users receive. */
/** @type {Artifact} */
export const SHIPPED = 'reports';

/**
 * The artifacts each spec runs against. The gate requires a pass, and for browser criteria a screenshot, in every
 * mode of every artifact listed for the spec that holds a criterion's tests.
 * @type {Readonly<Record<string, readonly Artifact[]>>}
 */
export const SPEC_ARTIFACTS = {
  'e2e/cross-report.spec.js': ['reports'],
  'e2e/delivery.spec.js': ['reports'],
  'e2e/distribution.spec.js': ['reports'],
  'e2e/portfolio.spec.js': ['reports'],
  'e2e/portfolio-baseline.spec.js': ['reports'],
  'e2e/study-baseline.spec.js': ['reports'],
  'e2e/references.spec.js': ['reports'],
  'e2e/report-links.spec.js': ['reports'],
  'e2e/study-page.spec.js': ['reports'],
  'e2e/summary.spec.js': ['reports'],
  'e2e/reports.spec.js': ['reports'],
};

/**
 * @param {Artifact} artifact
 * @param {Mode} mode
 */
export const projectName = (artifact, mode) => `${artifact}-${mode}`;

/**
 * @param {string | undefined} name
 * @returns {{ artifact: Artifact; mode: Mode } | null}
 */
export function parseProject(name) {
  for (const artifact of ARTIFACTS) {
    for (const mode of MODES) if (name === projectName(artifact, mode)) return { artifact, mode };
  }
  return null;
}

/**
 * Every artifact × mode pair some spec targets.
 * @param {Readonly<Record<string, readonly Artifact[]>>} specs
 * @returns {{ artifact: Artifact; mode: Mode }[]}
 */
export function targetedProjects(specs = SPEC_ARTIFACTS) {
  const artifacts = ARTIFACTS.filter((a) => Object.values(specs).some((list) => list.includes(a)));
  return artifacts.flatMap((artifact) => MODES.map((mode) => ({ artifact, mode })));
}

/**
 * The run folder holding the builds under test. There is deliberately no default: browser tests run only against
 * builds of the current tree, which the validation runner makes before it starts Playwright.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function requireRunDir(env = process.env) {
  const dir = env.VALIDATION_RUN_DIR;
  if (!dir) {
    throw new Error('VALIDATION_RUN_DIR is not set. Run browser tests with `npm run e2e`, which builds the current tree into a fresh run folder first.');
  }
  return dir;
}

// @ts-check
// A validation run's reports, packaged to hand to people for feedback: the files the run built and tested, as its
// manifest hashed them, with a short read-me. Not a release: no reviewer has accepted it.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readRun, stageSite } from './release.js';
/** @typedef {import('./record.js').RunRecord} RunRecord */

/**
 * @param {RunRecord} run
 * @returns {string}
 */
export const shareReadme = (run) => `gsm.dash prototype reports

Open portfolio.html in Chrome, Edge or Firefox. The reports work offline, straight from this folder.
Keep the files together, so the links between them work.

- portfolio.html: the portfolio overview. Click a study's name to open its report. "Program overview" on a
  study report returns to the portfolio with your view kept.
- One <StudyID>.html per study.

All numbers are simulated example data. This is a prototype build for feedback: it passed automated validation,
but it is not a reviewed release.
Built and tested by validation run ${run.runId}${run.scope?.pr ? ` (gsm.dash PR #${run.scope.pr})` : ''} on commit ${run.commit.slice(0, 12)}.
`;

/**
 * Copies a passing run's reports into a new folder with the read-me, and returns their names. A run that didn't pass
 * shares nothing.
 * @param {string} dir The run folder.
 * @param {string} out A folder that doesn't exist yet.
 * @returns {string[]}
 */
export function shareRun(dir, out) {
  const { run, manifest } = readRun(dir);
  if (run.validation !== 'passed') throw new Error(`run ${run.runId} did not pass validation (${run.validation}); its reports are not shared`);
  const files = stageSite(dir, manifest, out);
  writeFileSync(join(out, 'README.txt'), shareReadme(run));
  return files;
}

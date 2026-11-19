// @ts-check
// The release gate. Stages a validation run's reports for publication only when the run qualifies:
// - its Actions run, fetched from GitHub rather than read from the run's own record, was a push to main that ran the
//   validation workflow on the tag commit and succeeded;
// - every required step ran and every file still matches the manifest;
// - every in-scope visual criterion is accepted against this run's own screenshots, in every mode.
// On any problem it lists them all and stages nothing.
// Usage: node validation/release.js <run folder> --tag-commit <sha> --acceptance <file> --out <new folder> [--repo <owner/name>]
//   <run folder>   the CI run's downloaded artifact, e.g. validation-runs/gh-123-1
//   --acceptance   the acceptance.json attached to the release (validation/accept.js)
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { option } from './lib/cli.js';
import { DEFAULT_REPO, actionsRun } from './lib/github.js';
import { packageProblems } from './lib/package-check.js';
import { ciRun, readRun, stageSite } from './lib/release.js';

const args = process.argv.slice(2);
const [dir] = args;
const tagCommit = option(args, '--tag-commit');
const acceptanceFile = option(args, '--acceptance');
const out = option(args, '--out');
const repo = option(args, '--repo') ?? process.env.GITHUB_REPOSITORY ?? DEFAULT_REPO;
if (!dir || dir.startsWith('--') || !tagCommit || !acceptanceFile || !out) {
  console.error('usage: node validation/release.js <run folder> --tag-commit <sha> --acceptance <file> --out <new folder> [--repo <owner/name>]');
  process.exit(2);
}

/** @param {string[]} problems */
const refuse = (problems) => {
  console.error(`Not released:\n${problems.map((p) => `  ✗ ${p}`).join('\n')}`);
  process.exit(1);
};

const runDir = resolve(dir);
const { run, gate, manifest, actualHashes } = readRun(runDir);
const ci = ciRun(run.runId);
if (!ci) refuse([`${run.runId} is a local run; only a CI run's record can be checked against GitHub`]);
if (!existsSync(acceptanceFile)) refuse([`no acceptance file at ${acceptanceFile}`]);
const actions = actionsRun(repo, /** @type {{ id: string }} */ (ci).id, /** @type {{ attempt: string }} */ (ci).attempt);
const problems = packageProblems({
  run, gate, manifest, actualHashes, tagCommit, repo,
  acceptance: JSON.parse(readFileSync(acceptanceFile, 'utf8')),
  conclusion: actions.conclusion, actionsCommit: actions.headSha, actionsWorkflow: actions.workflow, actionsEvent: actions.event, actionsBranch: actions.branch,
});
if (problems.length) refuse(problems);

const files = stageSite(runDir, manifest, resolve(out));
console.log(`Run ${run.runId} on ${tagCommit.slice(0, 12)} qualifies. Staged ${files.length} reports and index.html in ${resolve(out)}:`);
console.log(`  ${files.join(' ')}`);

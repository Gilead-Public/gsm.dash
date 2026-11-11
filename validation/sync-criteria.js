// @ts-check
// Regenerates validation/requirements.json from the issues' acceptance sections, keeping reviewed metadata by ID.
// Usage: node validation/sync-criteria.js [--repo owner/name] [--issues 8-25,30] [--body-dir <dir with body-<n>.md>]
// With --issues, only those issues are refreshed; every other issue in the baseline is kept as it is.
import { existsSync, readFileSync } from 'node:fs';
import { BASELINE_PATH, readBaseline, syncIssues, writeBaseline } from './lib/baseline.js';
/** @typedef {import('./lib/baseline.js').IssueSource} IssueSource */
import { parseIssueBody } from './lib/criteria.js';
import { DEFAULT_REPO, fetchIssue, listIssueNumbers } from './lib/github.js';
import { option, parseIssueList } from './lib/cli.js';

const args = process.argv.slice(2);
const repo = option(args, '--repo') ?? DEFAULT_REPO;
const bodyDir = option(args, '--body-dir');
const only = option(args, '--issues');

const previous = existsSync(BASELINE_PATH) ? readBaseline() : null;
const numbers = only ? parseIssueList(only) : listIssueNumbers(repo);

/** @type {IssueSource[]} */
const sources = [];
/** @type {string[]} */
const errors = [];
for (const n of numbers) {
  const info = fetchIssue(repo, n);
  const local = bodyDir ? `${bodyDir}/body-${n}.md` : null;
  const body = local && existsSync(local) ? readFileSync(local, 'utf8') : info.body;
  if (!only && !/^## Acceptance criteria\s*$/m.test(body)) continue;
  const parsed = parseIssueBody(n, body);
  errors.push(...parsed.errors);
  sources.push({ number: n, title: info.title, parent: info.parent, parsed });
}

if (errors.length) {
  console.error(`Not written: ${errors.length} problem(s) in the acceptance sections.\n${errors.map((e) => `- ${e}`).join('\n')}`);
  process.exit(1);
}

const baseline = writeBaseline({ repo, issues: syncIssues(previous, sources, { scoped: Boolean(only) }) });
const all = baseline.issues.flatMap((i) => i.criteria);
const unclassified = all.filter((c) => c.kind === null).map((c) => c.id);
const unreviewed = all.filter((c) => c.kind !== null && !c.reviewed).map((c) => c.id);
console.log(`${BASELINE_PATH}: ${baseline.issues.length} issues, ${all.length} criteria, hash ${baseline.hash.slice(0, 12)}`);
if (unclassified.length) console.log(`Needs a kind: ${unclassified.join(' ')}`);
if (unreviewed.length) console.log(`Needs review: ${unreviewed.join(' ')}`);

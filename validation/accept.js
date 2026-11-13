// @ts-check
// Visual acceptance against one validation run. Lists, for each criterion, the shipped artifact's screenshots the
// reviewer must look at. With --accept, records that the reviewer accepted them in <run>/acceptance.json, which is
// attached to the release made from that run's commit, so the acceptance and the bytes it covers travel together.
// Usage: node validation/accept.js <run folder> <ids> [--accept --reviewer "<name>"]
//   <ids>  comma-separated criterion IDs (10.08,11.04)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { acceptanceRecords, acceptanceTargets, mergeRecords } from './lib/acceptance.js';
import { flag, option } from './lib/cli.js';
import { acceptedInEveryMode } from './lib/gate.js';
import { sha256File } from './lib/hash.js';
/** @typedef {import('./lib/gate.js').AcceptanceRecord} AcceptanceRecord */
/** @typedef {import('./lib/gate.js').GateResult} GateResult */
/** @typedef {import('./lib/record.js').RunRecord} RunRecord */

const args = process.argv.slice(2);
const [dir, spec] = args;
const accept = flag(args, '--accept');
const reviewer = option(args, '--reviewer')?.trim();
if (!dir || !spec || spec.startsWith('--')) {
  console.error('usage: node validation/accept.js <run folder> <ids> [--accept --reviewer "<name>"]');
  process.exit(2);
}
if (accept && !reviewer) {
  console.error('--accept needs --reviewer "<name>": the record says who accepted');
  process.exit(2);
}

const runDir = resolve(dir);
const read = (/** @type {string} */ name) => JSON.parse(readFileSync(join(runDir, name), 'utf8'));
/** @type {RunRecord} */
const run = read('run.json');
/** @type {GateResult} */
const matrix = read('matrix.json');
const ids = spec.split(',').map((s) => s.trim()).filter(Boolean);
const targets = acceptanceTargets(matrix.criteria, ids, (path) => (existsSync(join(runDir, path)) ? sha256File(join(runDir, path)) : null));

console.log(`Run ${run.runId} · commit ${run.commit} · validation ${run.validation}`);
for (const t of targets) {
  console.log(`\n${t.id}  ${t.text}`);
  for (const s of t.shots) console.log(`  ${s.mode.padEnd(8)} ${join(runDir, s.path)}\n           sha256 ${s.sha256}`);
}
const problems = targets.flatMap((t) => t.problems);
if (problems.length) {
  console.error(`\nNot accepted:\n${problems.map((p) => `  ✗ ${p}`).join('\n')}`);
  process.exit(1);
}
if (!accept) {
  console.log(`\nOnce you have compared every screenshot above, record the acceptance with --accept --reviewer "<name>".`);
  process.exit(0);
}

const file = join(runDir, 'acceptance.json');
/** @type {AcceptanceRecord[]} */
const existing = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
const added = acceptanceRecords(targets, { runId: run.runId, baselineHash: run.baselineHash, reviewer: /** @type {string} */ (reviewer), acceptedAt: new Date().toISOString() });
const records = mergeRecords(existing, added);
const byId = new Map(matrix.criteria.map((c) => [c.id, c]));
const uncovered = ids.filter((id) => !acceptedInEveryMode(/** @type {any} */ (byId.get(id)), records, run.runId, run.baselineHash));
if (uncovered.length) throw new Error(`the records would not cover every mode of ${uncovered.join(', ')}`);
writeFileSync(file, `${JSON.stringify(records, null, 2)}\n`);
console.log(`\nRecorded ${added.length} acceptance(s) of ${ids.join(', ')} by ${reviewer} in ${file}.`);
console.log(`Attach that file to the release made from commit ${run.commit}.`);

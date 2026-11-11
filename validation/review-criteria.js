// @ts-check
// Records classification decisions in validation/requirements.json and re-hashes it, so approvals never
// leave the stored identity stale.
// Usage: node validation/review-criteria.js <ids> [--kind unit|e2e|visual] [--modes file,subpath --reason "…"] [--approve]
//   <ids>  comma-separated criterion IDs (10.01) or whole issues (10)
// Changing kind or modes without --approve leaves the criterion unreviewed. --approve refuses a criterion whose
// metadata still has a problem (no kind, a visual mismatch with its text, narrowed modes without a reason).
import { metadataProblems, readBaseline, writeBaseline } from './lib/baseline.js';
/** @typedef {import('./lib/baseline.js').Criterion} Criterion */
import { flag, option } from './lib/cli.js';
import { MODES } from './lib/criteria.js';
/** @typedef {import('./lib/criteria.js').Kind} Kind */
/** @typedef {import('./lib/criteria.js').Mode} Mode */

const args = process.argv.slice(2);
const spec = args[0];
const kind = /** @type {Kind | undefined} */ (option(args, '--kind'));
const modesArg = option(args, '--modes');
const reason = option(args, '--reason');
const approve = flag(args, '--approve');

if (!spec || spec.startsWith('--')) {
  console.error('usage: node validation/review-criteria.js <ids> [--kind unit|e2e|visual] [--modes file,subpath --reason "…"] [--approve]');
  process.exit(2);
}
if (kind && !['unit', 'e2e', 'visual'].includes(kind)) throw new Error(`unknown kind "${kind}"`);
const modes = /** @type {Mode[] | undefined} */ (modesArg?.split(',').map((m) => m.trim()));
if (modes?.some((m) => !MODES.includes(m))) throw new Error(`unknown mode in "${modesArg}"`);

const baseline = readBaseline();
const wanted = spec.split(',').map((s) => s.trim()).filter(Boolean);
/**
 * @param {Criterion} c
 */
const matches = (c) => wanted.some((w) => (w.includes('.') ? c.id === w : c.id.split('.')[0] === w));
const targets = baseline.issues.flatMap((i) => i.criteria).filter(matches);
const unknown = wanted.filter((w) => !targets.some((c) => (w.includes('.') ? c.id === w : c.id.split('.')[0] === w)));
if (unknown.length) throw new Error(`not in the baseline: ${unknown.join(', ')}`);

/** @type {string[]} */
const refused = [];
for (const c of targets) {
  const changed = (kind && kind !== c.kind) || modes !== undefined;
  if (kind) c.kind = kind;
  if (modes) {
    c.modes = modes;
    if (reason) c.reason = reason;
  }
  if (approve) {
    const problems = metadataProblems({ ...c, reviewed: true });
    if (problems.length) {
      refused.push(...problems);
      c.reviewed = false;
    } else c.reviewed = true;
  } else if (changed) c.reviewed = false;
}

const saved = writeBaseline(baseline);
console.log(`${targets.length} criteria updated; baseline hash ${saved.hash.slice(0, 12)}`);
if (refused.length) {
  console.error(`Not approved:\n${refused.map((p) => `- ${p}`).join('\n')}`);
  process.exit(1);
}

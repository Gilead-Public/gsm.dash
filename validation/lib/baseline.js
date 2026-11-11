// @ts-check
import { readFileSync, writeFileSync } from 'node:fs';
import { compareIds, isVisualText, MODES, sha256 } from './criteria.js';
/** @typedef {import('./criteria.js').Kind} Kind */
/** @typedef {import('./criteria.js').Mode} Mode */
/** @typedef {import('./criteria.js').ParsedIssue} ParsedIssue */

/**
 * @typedef {object} Criterion
 * @property {string} id
 * @property {string} text
 * @property {string} sha256
 * @property {Kind | null} kind
 * @property {Mode[]} [modes]
 * @property {string} [reason]
 * @property {boolean} reviewed
 */

/**
 * @typedef {object} BaselineIssue
 * @property {number} number
 * @property {string} title
 * @property {string | null} parent
 * @property {boolean} userTest
 * @property {Criterion[]} criteria
 */

/**
 * @typedef {object} Baseline
 * @property {string} repo
 * @property {string} hash
 * @property {BaselineIssue[]} issues
 */

export const BASELINE_PATH = 'validation/requirements.json';

/**
 * @param {BaselineIssue[]} issues
 * @returns {string}
 */
export const hashIssues = (issues) => sha256(JSON.stringify(issues));

/**
 * Every way the stored baseline disagrees with its own hashes (hand edits, partial merges).
 * @param {Baseline} baseline
 * @returns {string[]}
 */
export function baselineProblems(baseline) {
  /** @type {string[]} */
  const problems = [];
  for (const issue of baseline.issues) {
    for (const c of issue.criteria) if (c.sha256 !== sha256(c.text)) problems.push(`${c.id}: stored hash does not match its text`);
  }
  const sorted = [...baseline.issues].sort((x, y) => x.number - y.number);
  if (baseline.hash !== hashIssues(sorted)) problems.push('baseline hash does not match its content; save changes with criteria:review or criteria:sync');
  return problems;
}

/**
 * @returns {{ baseline: Baseline; problems: string[] }}
 */
export function loadBaseline(path = BASELINE_PATH) {
  const baseline = /** @type {Baseline} */ (JSON.parse(readFileSync(path, 'utf8')));
  return { baseline, problems: baselineProblems(baseline) };
}

/**
 * The verified baseline; throws when it fails its own hashes.
 * @returns {Baseline}
 */
export function readBaseline(path = BASELINE_PATH) {
  const { baseline, problems } = loadBaseline(path);
  if (problems.length) throw new Error(`${path} failed verification:\n${problems.join('\n')}`);
  return baseline;
}

/**
 * @param {Omit<Baseline, 'hash'>} baseline
 * @returns {Baseline}
 */
export function writeBaseline(baseline, path = BASELINE_PATH) {
  const issues = [...baseline.issues].sort((a, b) => a.number - b.number);
  /** @type {Baseline} */
  const out = { repo: baseline.repo, hash: hashIssues(issues), issues };
  writeFileSync(path, `${JSON.stringify(out, null, 2)}\n`);
  return out;
}

/**
 * @typedef {object} IssueSource
 * @property {number} number
 * @property {string} title
 * @property {string | null} parent
 * @property {ParsedIssue} parsed
 */

/**
 * Text and hashes come from the issues; kind, modes, reason and the reviewed flag are kept from the
 * previous baseline by criterion ID. A changed text keeps its metadata but needs review again.
 * @param {Baseline | null} previous
 * @param {IssueSource[]} sources
 * @returns {BaselineIssue[]}
 */
export function mergeBaseline(previous, sources) {
  const old = new Map();
  for (const issue of previous?.issues ?? []) for (const c of issue.criteria) old.set(c.id, c);

  return sources.map(({ number, title, parent, parsed }) => ({
    number,
    title,
    parent,
    userTest: parsed.userTest,
    criteria: parsed.criteria
      .map(({ id, text }) => {
        const hash = sha256(text);
        const prev = old.get(id);
        /** @type {Criterion} */
        const c = { id, text, sha256: hash, kind: prev?.kind ?? null, reviewed: prev ? prev.reviewed && prev.sha256 === hash : false };
        if (prev?.modes) c.modes = prev.modes;
        if (prev?.reason) c.reason = prev.reason;
        return c;
      })
      .sort((a, b) => compareIds(a.id, b.id)),
  }));
}

/**
 * @param {Criterion} c
 * @returns {Mode[]}
 */
export const modesFor = (c) => c.modes ?? (c.kind === 'unit' ? [] : [...MODES]);

/**
 * Problems with the baseline's own metadata, reported per criterion ID.
 * @param {Criterion} c
 * @returns {string[]}
 */
export function metadataProblems(c) {
  /** @type {string[]} */
  const problems = [];
  if (c.kind === null) return [`${c.id}: not classified`];
  if (!c.reviewed) problems.push(`${c.id}: classification not reviewed`);
  if ((c.kind === 'visual') !== isVisualText(c.text)) {
    problems.push(`${c.id}: kind "${c.kind}" disagrees with the issue text about visual review`);
  }
  if (c.modes) {
    if (!c.reason) problems.push(`${c.id}: modes narrowed without a reason`);
    if (c.modes.some((m) => !MODES.includes(m))) problems.push(`${c.id}: unknown mode`);
    if (c.kind !== 'unit' && !c.modes.length) problems.push(`${c.id}: ${c.kind} criterion with no modes`);
  }
  return problems;
}

/**
 * @param {Baseline} baseline
 * @returns {Map<string, { issue: BaselineIssue; criterion: Criterion }>}
 */
export function criterionIndex(baseline) {
  const index = new Map();
  for (const issue of baseline.issues) for (const criterion of issue.criteria) index.set(criterion.id, { issue, criterion });
  return index;
}

/**
 * A sync's result. A scoped sync refreshes only its issues and keeps every other baseline issue untouched.
 * @param {Baseline | null} previous
 * @param {IssueSource[]} sources
 * @param {{ scoped: boolean }} arg2
 * @returns {BaselineIssue[]}
 */
export function syncIssues(previous, sources, { scoped }) {
  const refreshed = new Set(sources.map((s) => s.number));
  const kept = scoped ? (previous?.issues ?? []).filter((i) => !refreshed.has(i.number)) : [];
  return [...kept, ...mergeBaseline(previous, sources)];
}

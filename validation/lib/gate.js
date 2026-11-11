// @ts-check
import { criterionIndex, metadataProblems, modesFor } from './baseline.js';
/** @typedef {import('./baseline.js').Baseline} Baseline */
/** @typedef {import('./criteria.js').Kind} Kind */
/** @typedef {import('./criteria.js').Mode} Mode */
import { parseTitle, testKey, testTitle } from './results.js';
import { SHIPPED } from '../../e2e/projects.js';
/** @typedef {import('../../e2e/projects.js').Artifact} Artifact */
/** @typedef {import('./results.js').Outcome} Outcome */
/**
 * @template T
 * @typedef {import('./results.js').ParsedReport<T>} ParsedReport
 */
/** @typedef {import('./results.js').ResultRow} ResultRow */
/** @typedef {import('./results.js').TestRow} TestRow */

export const EVIDENCE = 'evidence';

/**
 * @typedef {object} AcceptanceRecord
 * @property {string} runId
 * @property {string} criterion
 * @property {string} screenshotSha256
 * @property {string} baselineHash
 */

/**
 * @typedef {object} GateInput
 * @property {Baseline} baseline
 * @property {Set<number>} scope
 * @property {Mode[]} modes
 * @property {Readonly<Record<string, readonly Artifact[]>>} artifacts The artifacts each spec file runs against.
 * @property {{ vitest: ParsedReport<ResultRow> | null; playwright: ParsedReport<ResultRow> | null }} reports
 * @property {TestRow[] | null} inventory
 * @property {Map<string, string>} evidence sha256 of every evidence attachment that exists on disk, keyed by its path.
 * @property {string} runId
 * @property {AcceptanceRecord[]} [acceptance]
 */

/** `unapproved`: every test requirement is met, but the criterion's kind is not approved (or not set), so it cannot pass yet. */
/** @typedef {'pass' | 'fail' | 'missing' | 'unapproved' | 'pending'} Automated */
/** @typedef {'accepted' | 'awaiting' | 'not required'} Acceptance */

/**
 * @typedef {object} CriterionStatus
 * @property {string} id
 * @property {number} issue
 * @property {string} text
 * @property {Kind | null} kind
 * @property {boolean} inScope
 * @property {Automated} automated
 * @property {Acceptance} acceptance
 * @property {Mode[]} modes Delivery modes this criterion must pass in (and, when visual, be accepted in).
 * @property {{ title: string; file: string; artifact: Artifact | null; mode: Mode | null; outcome: Outcome }[]} tests
 * @property {EvidenceItem[]} evidence
 * @property {string[]} notes
 */

/**
 * @typedef {object} EvidenceItem
 * @property {Artifact | null} artifact
 * @property {Mode | null} mode
 * @property {string} path Relative to the run folder.
 * @property {string} sha256
 * @property {string} test
 * @property {string} file
 */

/**
 * Acceptance must cover every required mode of the shipped artifact: for each, a record from this run and baseline
 * whose hash is one of that mode's screenshots. A record for one mode never stands in for another, and screenshots of
 * an artifact that doesn't ship never count.
 */
export function acceptedInEveryMode(
  c,
  records,
  runId,
  baselineHash,
) {
  if (!c.modes.length) return false;
  return c.modes.every((mode) => {
    const hashes = new Set(c.evidence.filter((e) => e.artifact === SHIPPED && e.mode === mode && e.sha256).map((e) => e.sha256));
    return records.some((a) => a.runId === runId && a.criterion === c.id && a.baselineHash === baselineHash && hashes.has(a.screenshotSha256));
  });
}

/**
 * @typedef {object} GateResult
 * @property {CriterionStatus[]} criteria
 * @property {string[]} failures
 * @property {boolean} incomplete
 * @property {number} untraced
 * @property {number} inScope
 */

/**
 * @param {GateInput} input
 * @returns {GateResult}
 */
export function evaluate(input) {
  /** @type {string[]} */
  const failures = [];
  let incomplete = false;
  const index = criterionIndex(input.baseline);

  /** @type {ResultRow[]} */
  const rows = [];
  for (const [name, report] of Object.entries(input.reports)) {
    if (!report) {
      failures.push(`${name} report is missing or unreadable`);
      incomplete = true;
      continue;
    }
    failures.push(...report.errors);
    rows.push(...report.rows);
  }

  const byCriterion = new Map();
  let untraced = 0;
  for (const row of rows) {
    const { criterion, error } = parseTitle(testTitle(row));
    if (error) failures.push(`${row.file}: ${error}`);
    if (!criterion) {
      if (!error) untraced++;
      continue;
    }
    if (!index.has(criterion)) {
      failures.push(`${row.file}: test names ${criterion}, which is not in the baseline`);
      continue;
    }
    byCriterion.set(criterion, [...(byCriterion.get(criterion) ?? []), row]);
  }

  if (!input.inventory) {
    failures.push('test inventory is missing');
    incomplete = true;
  } else {
    const seen = new Set(rows.map(testKey));
    for (const t of input.inventory) {
      if (!seen.has(testKey(t))) failures.push(`no result for listed test ${testKey(t)}`);
    }
  }

  const declared = new Set(Object.values(input.artifacts).flat());
  if (input.reports.playwright) {
    for (const artifact of declared) {
      for (const mode of input.modes) {
        if (!rows.some((r) => r.source === 'playwright' && r.artifact === artifact && r.mode === mode)) {
          failures.push(`${artifact}/${mode} produced no results`);
          incomplete = true;
        }
      }
    }
  }
  for (const file of new Set(rows.filter((r) => r.source === 'playwright').map((r) => r.file))) {
    if (!input.artifacts[file]) failures.push(`${file} declares no artifacts in e2e/projects.js`);
  }

  /** @type {CriterionStatus[]} */
  const criteria = [];
  for (const { issue, criterion: c } of index.values()) {
    const mapped = byCriterion.get(c.id) ?? [];
    const evidence = mapped
      .filter((r) => r.outcome === 'passed')
      .flatMap((r) => r.attachments.filter((a) => a.name === EVIDENCE).map((a) => ({ artifact: r.artifact, mode: r.mode, path: a.path, sha256: input.evidence.get(a.path) ?? '', test: testTitle(r), file: r.file })));
    const inScope = input.scope.has(issue.number);
    /** @type {string[]} */
    const notes = [];
    /** @type {Automated} */
    let automated = 'pending';

    if (inScope) {
      const meta = metadataProblems(c);
      /** @type {string[]} */
      const tests = [];
      if (!mapped.length) tests.push(`${c.id}: no test`);
      for (const r of mapped.filter((r) => r.outcome !== 'passed')) tests.push(`${c.id}: ${r.outcome} ${r.mode ? `[${r.artifact}/${r.mode}] ` : ''}${testTitle(r)}`);
      // An unclassified criterion has no known modes yet; its mode requirements apply once a kind is set.
      // Every artifact the criterion's specs run against must pass in every mode; with no browser test yet, the shipped one.
      const targeted = new Set(mapped.filter((r) => r.source === 'playwright').flatMap((r) => input.artifacts[r.file] ?? []));
      const artifacts = targeted.size ? [...targeted] : [SHIPPED];
      for (const mode of c.kind === null ? [] : modesFor(c)) {
        for (const artifact of artifacts) {
          const where = `${artifact}/${mode}`;
          const passedHere = mapped.filter((r) => r.artifact === artifact && r.mode === mode && r.outcome === 'passed');
          if (!passedHere.length) tests.push(`${c.id}: no passing result in ${where}`);
          if ((c.kind === 'visual' || c.kind === 'e2e') && !evidence.some((e) => e.artifact === artifact && e.mode === mode && e.sha256)) tests.push(`${c.id}: no screenshot in ${where}`);
        }
      }
      notes.push(...meta, ...tests);
      automated = !mapped.length ? 'missing' : tests.length ? 'fail' : meta.length ? 'unapproved' : 'pass';
      failures.push(...notes);
    }

    const modes = modesFor(c);
    /** @type {Acceptance} */
    let acceptance = 'not required';
    if (c.kind === 'visual') {
      const ok = acceptedInEveryMode({ id: c.id, modes, evidence }, input.acceptance ?? [], input.runId, input.baseline.hash);
      acceptance = ok ? 'accepted' : 'awaiting';
    }

    criteria.push({
      id: c.id,
      issue: issue.number,
      text: c.text,
      kind: c.kind,
      inScope,
      automated,
      acceptance,
      modes,
      tests: mapped.map((r) => ({ title: testTitle(r), file: r.file, artifact: r.artifact, mode: r.mode, outcome: r.outcome })),
      evidence,
      notes,
    });
  }

  return { criteria, failures, incomplete, untraced, inScope: criteria.filter((c) => c.inScope).length };
}

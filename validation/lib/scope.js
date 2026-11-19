// @ts-check
/**
 * @typedef {object} ScopeInput
 * @property {Set<number>} known Issues with criteria in the baseline.
 * @property {number[]} completed Issues closed as completed.
 * @property {number[]} prCloses Issues the PR declares it closes.
 * @property {number[]} cli Issues named with --issues.
 */

/**
 * The issues whose criteria the gate enforces. A PR that closes, or a run that names, an issue without criteria in
 * the baseline fails: otherwise its requirements would drop out of enforcement silently.
 * @param {ScopeInput} options
 * @returns {{ issues: number[]; failures: string[] }}
 */
export function resolveScope({ known, completed, prCloses, cli }) {
  /** @type {string[]} */
  const failures = [];
  for (const n of prCloses) if (!known.has(n)) failures.push(`the PR closes #${n}, which has no criteria in the baseline; run criteria:sync`);
  for (const n of cli) if (!known.has(n)) failures.push(`--issues names #${n}, which has no criteria in the baseline`);
  const issues = new Set([...completed, ...prCloses, ...cli].filter((n) => known.has(n)));
  return { issues: [...issues].sort((a, b) => a - b), failures };
}

const CLOSING =
  /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b:?[ \t]+(?:#(\d+)|([\w.-]+\/[\w.-]+)#(\d+)|https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+))(?![\w/])/gi;

/**
 * Issues a PR body closes in `repo`, by GitHub's keyword rules: every issue needs its own keyword. Comments and code
 * are ignored, so template examples and quoted snippets don't count.
 * @param {string} body
 * @param {string} repo
 * @returns {number[]}
 */
export function closingKeywords(body, repo) {
  const text = body.replace(/<!--[\s\S]*?-->/g, ' ').replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');
  const issues = new Set();
  for (const m of text.matchAll(CLOSING)) {
    const [, local, crossRepo, crossNumber, urlRepo, urlNumber] = m;
    const target = crossRepo ?? urlRepo;
    if (local) issues.add(Number(local));
    else if (target && target.toLowerCase() === repo.toLowerCase()) issues.add(Number(crossNumber ?? urlNumber));
  }
  return [...issues].sort((a, b) => a - b);
}

/**
 * @typedef {object} PullInfo
 * @property {number} number
 * @property {string} base
 * @property {string} head
 * @property {string} body
 * @property {'open' | 'closed'} state
 * @property {boolean} merged
 */

/**
 * @typedef {object} StackSource
 * @property {string} repo
 * @property {string} defaultBranch
 * @property {(n: number) => PullInfo} pull
 * @property {(branch: string) => PullInfo[]} pullsWithHead
 * @property {(n: number) => number[]} linkedCloses GitHub's own closing references; it links them only on PRs to the default branch.
 * @property {(branch: string) => boolean} landed Whether the branch's tip is already contained in the default branch.
 */

/**
 * @typedef {object} StackEntry
 * @property {number} pr
 * @property {string} base
 * @property {number[]} closes
 * @property {'linked' | 'body'} source
 */

/**
 * The issues a PR closes, together with those of the PRs it is stacked on: their changes are part of its diff. The
 * walk follows each base branch to the open PR whose head it is, down to the default branch. Without an open PR, the
 * walk ends only if the base branch's tip is already in the default branch. Branch names get reused, so a merged PR
 * in the branch's history proves nothing about what the branch holds now. Anything else fails closed.
 * @param {number} pr
 * @param {StackSource} src
 * @returns {{ closes: number[]; stack: StackEntry[]; failures: string[] }}
 */
export function walkStack(pr, src) {
  /** @type {StackEntry[]} */
  const stack = [];
  /** @type {string[]} */
  const failures = [];
  const seen = new Set();
  let current = src.pull(pr);
  while (true) {
    if (seen.has(current.number)) {
      failures.push(`the PR stack loops back to #${current.number}`);
      break;
    }
    seen.add(current.number);
    if (current.base === src.defaultBranch) {
      stack.push({ pr: current.number, base: current.base, closes: src.linkedCloses(current.number), source: 'linked' });
      break;
    }
    stack.push({ pr: current.number, base: current.base, closes: closingKeywords(current.body, src.repo), source: 'body' });
    const parents = src.pullsWithHead(current.base).filter((p) => p.number !== current.number);
    const open = parents.filter((p) => p.state === 'open');
    if (open.length > 1) {
      failures.push(`#${current.number} targets ${current.base}, which is the head of more than one open PR (${open.map((p) => `#${p.number}`).join(', ')})`);
      break;
    }
    if (open.length === 1) {
      current = open[0];
      continue;
    }
    // Everything beneath has landed: its issues are closed as completed, so they are in scope already.
    if (src.landed(current.base)) break;
    const closed = parents.filter((p) => !p.merged).map((p) => `#${p.number}`);
    failures.push(
      `#${current.number} targets ${current.base}, which has commits not in ${src.defaultBranch}, but no open PR has that branch as its head` +
        (closed.length ? ` (${closed.join(', ')} closed without merging)` : ''),
    );
    break;
  }
  const closes = new Set(stack.flatMap((s) => s.closes));
  return { closes: [...closes].sort((a, b) => a - b), stack, failures };
}

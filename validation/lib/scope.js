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

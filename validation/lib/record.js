// @ts-check
export const REQUIRED_STEPS = /** @type {const} */ (['environment', 'scope', 'generate-data', 'build-file', 'build-subpath', 'inventory', 'vitest', 'playwright', 'report']);

/**
 * @typedef {object} StepRecord
 * @property {string} name
 * @property {number | null} exitCode
 * @property {boolean} [skipped]
 * @property {string} startedAt
 * @property {string} endedAt
 */

/** @typedef {'passed' | 'failed' | 'incomplete'} Validation */

/** What the run actually executed on, read at run time rather than assumed from pinned files. */
/**
 * @typedef {object} Environment
 * @property {string} os
 * @property {string} arch
 * @property {string} node
 * @property {string} npm
 * @property {Record<string, string>} packages
 * @property {{ name: string; version: string }} browser
 * @property {string} lockfileSha256
 */

/**
 * @typedef {object} RunRecord
 * @property {string} runId
 * @property {string} commit
 * @property {string} repo
 * @property {string} startedAt
 * @property {string} [finishedAt]
 * @property {string} baselineHash
 * @property {{ issues: number[]; completed: number[]; pr: number | null; prCloses: number[]; stack: import('./scope.js').StackEntry[]; cli: number[] }} scope
 * @property {Record<string, { state: string; stateReason: string | null; fetchedAt: string }>} issueStates
 * @property {Environment | null} environment
 * @property {string | null} dataSha256
 * @property {Record<string, string>} builds
 * @property {StepRecord[]} steps
 * @property {Validation} validation
 * @property {string[]} failures
 * @property {string[]} warnings
 */

/**
 * @typedef {object} ManifestRow
 * @property {string} path
 * @property {string} sha256
 * @property {'build' | 'evidence' | 'trace' | 'attachment' | 'record'} kind
 * @property {string} [criterion]
 * @property {string} [test]
 * @property {string | null} [artifact]
 * @property {string | null} [mode]
 */

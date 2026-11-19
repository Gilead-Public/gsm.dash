// @ts-check
import { relative } from 'node:path';
/** @typedef {import('./criteria.js').Mode} Mode */
/** @typedef {import('../../e2e/projects.js').Artifact} Artifact */
import { parseProject } from '../../e2e/projects.js';

/** @typedef {'vitest' | 'playwright'} Source */
/** @typedef {'passed' | 'failed' | 'skipped'} Outcome */

/**
 * @typedef {object} TestRow
 * @property {Source} source
 * @property {string} file
 * @property {string[]} titlePath
 * @property {Artifact | null} artifact
 * @property {Mode | null} mode
 */

/**
 * @typedef {object} ResultRowFields
 * @property {Outcome} outcome
 * @property {{ name: string; path: string }[]} attachments
 */
/** @typedef {TestRow & ResultRowFields} ResultRow */

/**
 * @template T
 * @typedef {object} ParsedReport
 * @property {T[]} rows
 * @property {string[]} errors
 */

/**
 * @param {TestRow} r
 * @returns {string}
 */
export const testKey = (r) => [r.source, r.file, r.titlePath.join(' > '), r.artifact ?? '', r.mode ?? ''].join('|');
/**
 * @param {TestRow} r
 * @returns {string}
 */
export const testTitle = (r) => r.titlePath[r.titlePath.length - 1];

const TRACED = /^(\d+)\.(\d{2}): .+ \(#(\d+)\)$/;

/**
 * `<issue>.<nn>: … (#<issue>)`, with no other `#<digits>` anywhere (qcthat reads `#4e79a7` as issue 4).
 * @param {string} title
 * @returns {{ criterion: string | null; error: string | null }}
 */
export function parseTitle(title) {
  const refs = title.match(/#\d+/g) ?? [];
  const m = TRACED.exec(title);
  if (m) {
    if (m[1] !== m[3]) return { criterion: null, error: `prefix ${m[1]}.${m[2]} and (#${m[3]}) disagree: "${title}"` };
    if (refs.length !== 1) return { criterion: null, error: `stray # reference in "${title}"` };
    return { criterion: `${m[1]}.${m[2]}`, error: null };
  }
  if (/^\d+\.\d{2}:/.test(title)) return { criterion: null, error: `criterion prefix without a trailing (#N): "${title}"` };
  if (refs.length) return { criterion: null, error: `# reference without a criterion prefix: "${title}"` };
  return { criterion: null, error: null };
}

/**
 * @param {string} cwd
 * @param {string} file
 */
const rel = (cwd, file) => relative(cwd, file).split('\\').join('/');
/**
 * @param {string} project
 * @returns {{ artifact: Artifact | null; mode: Mode | null }}
 */
const fromProject = (project) => parseProject(project) ?? { artifact: null, mode: null };

/**
 * @typedef {object} VitestAssertion
 * @property {string[]} ancestorTitles
 * @property {string} title
 * @property {string} status
 */
/**
 * @typedef {object} VitestFile
 * @property {string} name
 * @property {string} [status]
 * @property {string} [message]
 * @property {VitestAssertion[]} assertionResults
 */

/**
 * @param {{ testResults: VitestFile[] }} json
 * @param {string} cwd
 * @returns {ParsedReport<ResultRow>}
 */
export function parseVitestResults(json, cwd) {
  /** @type {ResultRow[]} */
  const rows = [];
  /** @type {string[]} */
  const errors = [];
  for (const f of json.testResults) {
    const file = rel(cwd, f.name);
    if (f.status === 'failed' && !f.assertionResults.length) errors.push(`vitest: ${file} failed to run: ${(f.message ?? '').split('\n')[0]}`);
    for (const a of f.assertionResults) {
      /** @type {Outcome} */
      const outcome = a.status === 'passed' ? 'passed' : a.status === 'failed' ? 'failed' : 'skipped';
      rows.push({ source: 'vitest', file, titlePath: [...a.ancestorTitles, a.title], artifact: null, mode: null, outcome, attachments: [] });
    }
  }
  return { rows, errors };
}

/**
 * @param {{ name: string; file: string }[]} json
 * @param {string} cwd
 * @returns {TestRow[]}
 */
export function parseVitestList(json, cwd) {
  return json.map((t) => ({ source: 'vitest', file: rel(cwd, t.file), titlePath: t.name.split(' > '), artifact: null, mode: null }));
}

/**
 * @typedef {object} PwResult
 * @property {string} status
 * @property {{ name: string, path?: string }[]} [attachments]
 */
/**
 * @typedef {object} PwTest
 * @property {string} projectName
 * @property {string} status
 * @property {PwResult[]} results
 */
/**
 * @typedef {object} PwSpec
 * @property {string} title
 * @property {string} file
 * @property {PwTest[]} tests
 */
/**
 * @typedef {object} PwSuite
 * @property {string} title
 * @property {string} file
 * @property {PwSpec[]} [specs]
 * @property {PwSuite[]} [suites]
 */
/**
 * @typedef {object} PwReport
 * @property {{ rootDir?: string }} [config]
 * @property {PwSuite[]} suites
 * @property {{ message?: string }[]} [errors]
 */

/**
 * @param {PwSuite[]} suites
 * @param {string[]} titles
 * @param {(spec: PwSpec, titles: string[]) => void} visit
 * @param {boolean} root
 */
function walk(suites, titles, visit, root) {
  for (const s of suites) {
    const path = root ? titles : [...titles, s.title];
    for (const spec of s.specs ?? []) visit(spec, path);
    walk(s.suites ?? [], path, visit, false);
  }
}

/**
 * @param {PwReport} report
 * @param {PwSpec} spec
 * @param {string} cwd
 * @returns {string}
 */
function pwFile(report, spec, cwd) {
  const root = report.config?.rootDir ?? cwd;
  return rel(cwd, `${root}/${spec.file}`);
}

/**
 * @param {PwReport} report
 * @param {string} cwd
 * @returns {ParsedReport<ResultRow>}
 */
export function parsePlaywrightResults(report, cwd) {
  /** @type {ResultRow[]} */
  const rows = [];
  const errors = (report.errors ?? []).map((e) => `playwright: ${(e.message ?? '').split('\n')[0]}`);
  walk(report.suites, [], (spec, titles) => {
    for (const t of spec.tests) {
      const passed = t.status === 'expected' && t.results.length > 0 && t.results.every((r) => r.status === 'passed');
      /** @type {Outcome} */
      const outcome = passed ? 'passed' : t.status === 'skipped' ? 'skipped' : 'failed';
      const attachments = t.results.flatMap((r) => (r.attachments ?? []).filter((a) => a.path).map((a) => ({ name: a.name, path: /** @type {string} */ (a.path) })));
      rows.push({ source: 'playwright', file: pwFile(report, spec, cwd), titlePath: [...titles, spec.title], ...fromProject(t.projectName), outcome, attachments });
    }
  }, true);
  return { rows, errors };
}

/**
 * @param {PwReport} report
 * @param {string} cwd
 * @returns {TestRow[]}
 */
export function parsePlaywrightList(report, cwd) {
  /** @type {TestRow[]} */
  const rows = [];
  walk(report.suites, [], (spec, titles) => {
    for (const t of spec.tests) rows.push({ source: 'playwright', file: pwFile(report, spec, cwd), titlePath: [...titles, spec.title], ...fromProject(t.projectName) });
  }, true);
  return rows;
}

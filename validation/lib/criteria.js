// @ts-check
import { createHash } from 'node:crypto';

/** @typedef {'unit' | 'e2e' | 'visual'} Kind */
/** @typedef {'file' | 'subpath'} Mode */
/** @type {readonly Mode[]} */
export const MODES = ['file', 'subpath'];

/**
 * @typedef {object} ParsedCriterion
 * @property {string} id
 * @property {string} text
 */

/**
 * @typedef {object} ParsedIssue
 * @property {ParsedCriterion[]} criteria
 * @property {boolean} userTest
 * @property {string[]} errors
 */

const ITEM = /^- \*\*(\d+)\.(\d{2})\*\* (\S.*)$/;
const VISUAL = /visual (check|comparison)/i;

/**
 * @param {string | Buffer} s
 * @returns {string}
 */
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/**
 * @param {string} text
 * @returns {boolean}
 */
export const isVisualText = (text) => VISUAL.test(text);

/**
 * @param {string} body
 * @param {RegExp} heading
 * @returns {string[] | null}
 */
function section(body, heading) {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) => heading.test(l));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^## /.test(l));
  return end < 0 ? rest : rest.slice(0, end);
}

/**
 * Strict: every non-empty line of the acceptance section must be one `- **<issue>.<nn>** text` item.
 * @param {number} issue
 * @param {string} body
 * @returns {ParsedIssue}
 */
export function parseIssueBody(issue, body) {
  /** @type {string[]} */
  const errors = [];
  const lines = section(body, /^## Acceptance criteria\s*$/);
  if (!lines) return { criteria: [], userTest: false, errors: [`#${issue}: no "## Acceptance criteria" section`] };

  /** @type {ParsedCriterion[]} */
  const criteria = [];
  const seen = new Set();
  for (const line of lines) {
    if (!line.trim()) continue;
    const m = ITEM.exec(line.trimEnd());
    if (!m) {
      errors.push(`#${issue}: acceptance line without an ID: "${line.trim().slice(0, 80)}"`);
      continue;
    }
    const id = `${m[1]}.${m[2]}`;
    if (Number(m[1]) !== issue) errors.push(`#${issue}: ${id} does not belong to this issue`);
    if (seen.has(id)) errors.push(`#${issue}: duplicate ID ${id}`);
    seen.add(id);
    criteria.push({ id, text: m[3].trim() });
  }
  if (!criteria.length && !errors.length) errors.push(`#${issue}: acceptance section is empty`);

  const qc = section(body, /^## QC approach\s*$/) ?? [];
  const userTest = qc.some((l) => /^- \[x\] User Tests/i.test(l.trim()));
  if (userTest && !criteria.some((c) => isVisualText(c.text))) {
    errors.push(`#${issue}: User Tests is ticked but no criterion is a visual check or comparison`);
  }
  return { criteria, userTest, errors };
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export const compareIds = (a, b) => {
  const [ai, an] = a.split('.').map(Number);
  const [bi, bn] = b.split('.').map(Number);
  return ai - bi || an - bn;
};

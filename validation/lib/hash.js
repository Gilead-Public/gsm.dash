// @ts-check
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { sha256 } from './criteria.js';

/**
 * @param {string} path
 * @returns {string}
 */
export const sha256File = (path) => sha256(readFileSync(path));

/**
 * sha256 of every file under `dir`, keyed by its path relative to `base`.
 * @param {string} dir
 * @param {string} base
 * @returns {Record<string, string>}
 */
export function hashTree(dir, base) {
  /** @type {Record<string, string>} */
  const out = {};
  /**
   * @param {string} d
   */
  const visit = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) visit(p);
      else out[relative(base, p).split('\\').join('/')] = sha256File(p);
    }
  };
  visit(dir);
  return out;
}

/**
 * @param {Record<string, string>} tree
 * @returns {string}
 */
export const treeDigest = (tree) =>
  sha256(Object.entries(tree).map(([p, h]) => `${h}  ${p}`).join('\n'));

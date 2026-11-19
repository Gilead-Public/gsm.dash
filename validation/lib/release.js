// @ts-check
// A release publishes one qualifying validation run's own reports: the bytes its manifest hashed and its reviewers
// accepted, copied, never rebuilt.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { sha256File } from './hash.js';
import { SITE } from './package-check.js';
/** @typedef {import('./gate.js').GateResult} GateResult */
/** @typedef {import('./record.js').ManifestRow} ManifestRow */
/** @typedef {import('./record.js').RunRecord} RunRecord */

/** The site's front door, written at release time; it is not a report. */
export const REDIRECT = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta http-equiv="refresh" content="0; url=./portfolio.html">
<title>gsm.dash</title>
<a href="./portfolio.html">Open the portfolio</a>
</html>
`;

/**
 * The Actions run and attempt behind a CI run's id (`gh-<run>-<attempt>`), or null for a local run.
 * @param {string} runId
 */
export function ciRun(runId) {
  const m = /^gh-(\d+)-(\d+)$/.exec(runId);
  return m ? { id: m[1], attempt: m[2] } : null;
}

/**
 * A run folder as packageProblems reads it, with every manifest file hashed as it is now. A file that is missing, or
 * whose path leads outside the folder, has no hash.
 * @param {string} dir
 * @returns {{ run: RunRecord, gate: GateResult, manifest: ManifestRow[], actualHashes: Map<string, string> }}
 */
export function readRun(dir) {
  const root = resolve(dir);
  const read = (/** @type {string} */ name) => readFileSync(join(root, name), 'utf8');
  /** @type {ManifestRow[]} */
  const manifest = read('manifest.jsonl').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  /** @type {Map<string, string>} */
  const actualHashes = new Map();
  for (const row of manifest) {
    const path = resolve(root, row.path);
    if (path.startsWith(root + sep) && existsSync(path)) actualHashes.set(row.path, sha256File(path));
  }
  return { run: JSON.parse(read('run.json')), gate: JSON.parse(read('matrix.json')), manifest, actualHashes };
}

/**
 * Copies the run's reports, as its manifest lists and hashes them, into a new folder with the redirect page, and
 * returns their paths within it. Files the manifest doesn't list are left behind, a path that would land outside the
 * folder is refused, and the folder must not exist yet, so a release never mixes with other files.
 * @param {string} dir
 * @param {ManifestRow[]} manifest
 * @param {string} out
 * @returns {string[]}
 */
export function stageSite(dir, manifest, out) {
  if (existsSync(out)) throw new Error(`${out} already exists; a release is staged into a new folder`);
  const root = resolve(out);
  const rows = manifest.filter((r) => r.kind === 'build' && r.path.startsWith(SITE));
  for (const r of rows) {
    if (!resolve(root, r.path.slice(SITE.length)).startsWith(root + sep)) throw new Error(`${r.path} would be staged outside ${out}`);
  }
  mkdirSync(root, { recursive: true });
  for (const r of rows) {
    const to = resolve(root, r.path.slice(SITE.length));
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(dir, r.path), to);
    if (sha256File(to) !== r.sha256) throw new Error(`${r.path} does not match its manifest hash after copying`);
  }
  writeFileSync(join(out, 'index.html'), REDIRECT);
  return rows.map((r) => r.path.slice(SITE.length));
}

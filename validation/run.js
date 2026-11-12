// @ts-check
// Builds every artifact in both delivery modes, runs every test, and writes the traceability matrix and evidence for one run.
// Usage: node validation/run.js [--issues 8,9] [--pr <number>] [--offline] [--repo owner/name]
// Exit code 0 only when validation passed. Every step runs and is recorded; nothing short-circuits the report.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { differsFromLive, loadBaseline, BASELINE_PATH } from './lib/baseline.js';
import { resolveScope, walkStack } from './lib/scope.js';
import { flag, option, parseIssueList } from './lib/cli.js';
import { MODES, parseIssueBody } from './lib/criteria.js';
import { EVIDENCE, evaluate } from './lib/gate.js';
import { SPEC_ARTIFACTS } from '../e2e/projects.js';
/** @typedef {import('./lib/gate.js').GateResult} GateResult */
import { closingIssues, containedIn, DEFAULT_REPO, defaultBranch, fetchIssue, fetchPull, pullsWithHead } from './lib/github.js';
import { hashTree, sha256File, treeDigest } from './lib/hash.js';
import { groupFailures, matrixHtml, matrixMarkdown } from './lib/matrix.js';
/** @typedef {import('./lib/record.js').Environment} Environment */
/** @typedef {import('./lib/record.js').ManifestRow} ManifestRow */
/** @typedef {import('./lib/record.js').RunRecord} RunRecord */
/** @typedef {import('./lib/record.js').StepRecord} StepRecord */
import { arch, release, type } from 'node:os';
import { parsePlaywrightList, parsePlaywrightResults, parseTitle, parseVitestList, parseVitestResults, testTitle } from './lib/results.js';
/**
 * @template T
 * @typedef {import('./lib/results.js').ParsedReport<T>} ParsedReport
 */
/** @typedef {import('./lib/results.js').ResultRow} ResultRow */
/** @typedef {import('./lib/results.js').TestRow} TestRow */

const PREFIX = '/cod-demo/';
const args = process.argv.slice(2);
const cwd = process.cwd();
const repo = option(args, '--repo') ?? process.env.VALIDATION_REPO ?? DEFAULT_REPO;
const offline = flag(args, '--offline');
const prArg = option(args, '--pr') ?? process.env.VALIDATION_PR;
const cliIssues = option(args, '--issues') ? parseIssueList(/** @type {string} */ (option(args, '--issues'))) : [];

/**
 * @param {...string} a
 */
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const commit = git('rev-parse', 'HEAD');
const dirty = git('status', '--porcelain').length > 0;
const now = () => new Date().toISOString();
const runId = process.env.GITHUB_RUN_ID
  ? `gh-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`
  : `${now().replace(/[-:]/g, '').replace(/\..*$/, '')}-${commit.slice(0, 7)}`;
const runDir = resolve('validation-runs', runId);
mkdirSync(runDir, { recursive: true });
/**
 * @param {...string} p
 */
const at = (...p) => join(runDir, ...p);

const { baseline, problems: baselineProblems } = loadBaseline();
copyFileSync(BASELINE_PATH, at('requirements.json'));

/** @type {RunRecord} */
const record = {
  runId, commit, repo, startedAt: now(), baselineHash: baseline.hash,
  scope: { issues: [], completed: [], pr: prArg ? Number(prArg) : null, prCloses: [], stack: [], cli: cliIssues },
  issueStates: {}, environment: null, dataSha256: null, builds: {}, steps: [], validation: 'incomplete', failures: [], warnings: [],
};
if (dirty) record.warnings.push('the working tree has uncommitted changes; the commit does not identify what was tested');
record.failures.push(...baselineProblems.map((p) => `baseline: ${p}`));

/**
 * @param {string} name
 * @param {() => number} fn
 * @returns {boolean}
 */
function step(name, fn) {
  const startedAt = now();
  let exitCode;
  try {
    exitCode = fn();
  } catch (e) {
    record.failures.push(`${name}: ${/** @type {Error} */ (e).message.split('\n')[0]}`);
    exitCode = 1;
  }
  record.steps.push({ name, exitCode, startedAt, endedAt: now() });
  if (exitCode !== 0) record.failures.push(`step "${name}" exited ${exitCode}`);
  return exitCode === 0;
}

/**
 * @param {string} name
 */
const skip = (name) => record.steps.push({ name, exitCode: null, skipped: true, startedAt: now(), endedAt: now() });

/**
 * @param {string} cmd
 * @param {string[]} a
 * @param {Record<string, string>} [env]
 */
const sh = (cmd, a, env = {}) =>
  spawnSync(cmd, a, { stdio: 'inherit', env: { ...process.env, ...env } }).status ?? 1;

const runEnv = {
  VALIDATION_RUN_DIR: runDir,
  VALIDATION_RUN_ID: runId,
  VALIDATION_COMMIT: commit,
};

// 0. Environment: the versions that actually run, including the browser Playwright launches.
step('environment', () => {
  /**
   * @param {string} pkg
   */
  const version = (pkg) => (JSON.parse(readFileSync(join('node_modules', pkg, 'package.json'), 'utf8'))).version;
  const probe = "import { chromium } from '@playwright/test'; const b = await chromium.launch(); console.log(b.version()); await b.close();";
  /** @type {Environment} */
  const environment = {
    os: `${type()} ${release()}`,
    arch: arch(),
    node: process.version,
    npm: execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim(),
    packages: Object.fromEntries(['@playwright/test', 'vitest', 'vite', 'typescript', 'ajv', 'ajv-formats', 'astro', '@astrojs/react', 'react', 'react-dom', 'es-module-lexer'].map((p) => [p, version(p)])),
    browser: { name: 'chromium', version: execFileSync('node', ['--input-type=module', '-e', probe], { encoding: 'utf8' }).trim() },
    lockfileSha256: sha256File('package-lock.json'),
  };
  record.environment = environment;
  return 0;
});

// 1. Scope: completed issues, plus what the PR and the PRs it is stacked on close, plus --issues.
const scope = new Set();
step('scope', () => {
  const known = new Set(baseline.issues.map((i) => i.number));
  const settle = () => {
    const resolved = resolveScope({ known, completed: record.scope.completed, prCloses: record.scope.prCloses, cli: cliIssues });
    for (const n of resolved.issues) scope.add(n);
    record.failures.push(...resolved.failures);
    return resolved.failures.length;
  };
  if (offline) {
    record.warnings.push('offline: issue states, PR scope and requirement drift were not checked');
    return settle() ? 1 : 0;
  }
  const live = new Map();
  for (const issue of baseline.issues) {
    const info = fetchIssue(repo, issue.number);
    record.issueStates[issue.number] = { state: info.state, stateReason: info.stateReason, fetchedAt: now() };
    if (info.state === 'closed' && info.stateReason === 'completed') record.scope.completed.push(issue.number);
    live.set(issue.number, info.body);
  }
  let broken = 0;
  if (record.scope.pr) {
    const main = defaultBranch(repo);
    const walked = walkStack(record.scope.pr, {
      repo,
      defaultBranch: main,
      pull: (n) => fetchPull(repo, n),
      pullsWithHead: (branch) => pullsWithHead(repo, branch),
      linkedCloses: (n) => closingIssues(repo, n),
      landed: (branch) => containedIn(repo, main, branch),
    });
    record.scope.prCloses = walked.closes;
    record.scope.stack = walked.stack;
    record.failures.push(...walked.failures);
    broken = walked.failures.length;
  }
  const unknown = settle() + broken;

  let drift = 0;
  for (const issue of baseline.issues) {
    if (!differsFromLive(issue, parseIssueBody(issue.number, live.get(issue.number) ?? ''))) continue;
    const msg = `#${issue.number}: acceptance criteria or Scope on GitHub differ from the baseline; run criteria:sync`;
    if (scope.has(issue.number)) {
      record.failures.push(msg);
      drift++;
    } else record.warnings.push(msg);
  }
  return drift || unknown ? 1 : 0;
});
record.scope.issues = [...scope].sort((a, b) => a - b);

// 2–5. One data generation shared by three isolated builds, each written into the run folder before the next starts.
const buildsOk =
  step('generate-data', () => {
    const code = sh('npm', ['run', 'generate-data']);
    if (code === 0) record.dataSha256 = treeDigest(hashTree('examples/data', cwd));
    return code;
  }) &&
  step('build-file', () => {
    const code = sh('npx', ['vite', 'build']) || sh('node', ['scripts/build-standalone.mjs']);
    if (code) return code;
    mkdirSync(at('build/file'), { recursive: true });
    copyFileSync('dist/gsm-dash-standalone.html', at('build/file/gsm-dash-standalone.html'));
    return 0;
  }) &&
  step('build-subpath', () => {
    const out = at('build/subpath');
    const code = sh('npx', ['vite', 'build', `--base=${PREFIX}`, '--outDir', out, '--emptyOutDir']);
    if (code) return code;
    mkdirSync(join(out, 'examples'), { recursive: true });
    cpSync('examples/data', join(out, 'examples/data'), { recursive: true });
    return 0;
  }) &&
  step('build-reports', () => sh('npx', ['astro', 'build']) || sh('node', ['scripts/package-reports.mjs', at('build/reports')]));

if (buildsOk) {
  record.builds = hashTree(at('build'), runDir);
  step('inventory', () =>
    // Vitest 5 lists by parsing source unless told otherwise, which leaves template-literal names unexpanded.
    sh('npx', ['vitest', 'list', '--staticParse=false', `--json=${at('inventory-vitest.json')}`]) ||
    sh('npx', ['playwright', 'test', '--list', '--reporter=json'], { ...runEnv, PLAYWRIGHT_JSON_OUTPUT_NAME: at('inventory-playwright.json') }));
  step('vitest', () => sh('npx', ['vitest', 'run', '--reporter=default', '--reporter=json', `--outputFile.json=${at('vitest.json')}`]));
  step('playwright', () => sh('npx', ['playwright', 'test', '--reporter=list,json'], { ...runEnv, PLAYWRIGHT_JSON_OUTPUT_NAME: at('playwright.json') }));
} else {
  for (const name of ['build-file', 'build-subpath', 'build-reports', 'inventory', 'vitest', 'playwright']) {
    if (!record.steps.some((s) => s.name === name)) skip(name);
  }
}

// 6. Report: always runs, from whatever exists.
/**
 * @template T
 * @param {string} path
 * @returns {T | null}
 */
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** @type {GateResult | null} */
let gate = null;
/** @type {ManifestRow[]} */
const manifest = [];
step('report', () => {
  const vRaw = readJson(at('vitest.json'));
  const pRaw = readJson(at('playwright.json'));
  // Attachment paths become run-relative, so the matrix links and the manifest work wherever the bundle is unpacked.
  /**
   * @param {string} p
   */
  const toRun = (p) => relative(runDir, resolve(p)).split('\\').join('/');
  /**
   * @param {ParsedReport<ResultRow> | null} report
   * @returns {ParsedReport<ResultRow> | null}
   */
  const portable = (report) =>
    report && { ...report, rows: report.rows.map((r) => ({ ...r, attachments: r.attachments.map((a) => ({ ...a, path: toRun(a.path) })) })) };
  const vitest = portable(vRaw ? parseVitestResults(vRaw, cwd) : null);
  const playwright = portable(pRaw ? parsePlaywrightResults(pRaw, cwd) : null);
  const vList = readJson(at('inventory-vitest.json'));
  const pList = readJson(at('inventory-playwright.json'));
  /** @type {TestRow[] | null} */
  const inventory = vList && pList ? [...parseVitestList(vList, cwd), ...parsePlaywrightList(pList, cwd)] : null;

  const rows = [...(vitest?.rows ?? []), ...(playwright?.rows ?? [])];
  const hashes = new Map();
  for (const r of rows) for (const a of r.attachments) if (existsSync(at(a.path))) hashes.set(a.path, sha256File(at(a.path)));
  const evidence = new Map([...hashes].filter(([p]) => rows.some((r) => r.attachments.some((a) => a.path === p && a.name === EVIDENCE))));

  gate = evaluate({ baseline, scope, modes: [...MODES], artifacts: SPEC_ARTIFACTS, reports: { vitest, playwright }, inventory, evidence, runId });
  record.failures.push(...gate.failures);

  const time = now();
  writeFileSync(at('results.jsonl'), rows.map((r) => {
    const { criterion } = parseTitle(testTitle(r));
    return JSON.stringify({ runId, commit, time, source: r.source, file: r.file, title: testTitle(r), titlePath: r.titlePath, artifact: r.artifact, mode: r.mode, outcome: r.outcome, criterion, issue: criterion ? Number(criterion.split('.')[0]) : null });
  }).join('\n') + (rows.length ? '\n' : ''));
  writeFileSync(at('matrix.json'), `${JSON.stringify(gate, null, 2)}\n`);

  for (const [path, hash] of Object.entries(record.builds)) manifest.push({ path, sha256: hash, kind: 'build' });
  for (const r of rows) {
    const { criterion } = parseTitle(testTitle(r));
    for (const a of r.attachments) {
      const hash = hashes.get(a.path);
      if (!hash) continue;
      const kind = a.name === EVIDENCE ? 'evidence' : a.name === 'trace' ? 'trace' : 'attachment';
      manifest.push({ path: a.path, sha256: hash, kind, criterion: criterion ?? undefined, test: `${r.file} › ${r.titlePath.join(' › ')}`, artifact: r.artifact, mode: r.mode });
    }
  }
  return 0;
});

for (const m of manifest) {
  if (isAbsolute(m.path) || m.path.startsWith('..')) record.failures.push(`manifest path outside the run folder: ${m.path}`);
}
const skipped = record.steps.some((s) => s.skipped);
record.validation = offline || skipped || gate === null || /** @type {GateResult} */ (/** @type {unknown} */ (gate)).incomplete ? 'incomplete' : record.failures.length ? 'failed' : 'passed';
record.finishedAt = now();

if (gate) {
  writeFileSync(at('traceability-matrix.md'), matrixMarkdown(record, gate));
  writeFileSync(at('traceability-matrix.html'), matrixHtml(record, gate));
}
for (const name of ['requirements.json', 'results.jsonl', 'matrix.json', 'traceability-matrix.md', 'traceability-matrix.html']) {
  if (existsSync(at(name))) manifest.push({ path: name, sha256: sha256File(at(name)), kind: 'record' });
}
writeFileSync(at('manifest.jsonl'), manifest.map((m) => JSON.stringify(m)).join('\n') + '\n');
writeFileSync(at('run.json'), `${JSON.stringify(record, null, 2)}\n`);

console.log(`\nValidation ${record.validation.toUpperCase()} · run ${runId} · ${relative(cwd, at('traceability-matrix.html'))}`);
const shown = groupFailures(record.failures);
for (const f of shown.slice(0, 20)) console.log(`  ✗ ${f}`);
if (shown.length > 20) console.log(`  … ${shown.length - 20} more in run.json`);
process.exit(record.validation === 'passed' ? 0 : 1);

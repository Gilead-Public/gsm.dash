// @ts-check
import { execFileSync } from 'node:child_process';

export const DEFAULT_REPO = 'Gilead-Public/gsm.dash';

/**
 * @param {string[]} args
 * @returns {string}
 */
function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

/**
 * @typedef {object} IssueInfo
 * @property {number} number
 * @property {string} title
 * @property {string} body
 * @property {'open' | 'closed'} state
 * @property {string | null} stateReason
 * @property {string | null} parent
 */

/**
 * @param {string | null | undefined} url
 * @returns {string | null}
 */
const parentRef = (url) => {
  const m = url ? /repos\/([^/]+\/[^/]+)\/issues\/(\d+)$/.exec(url) : null;
  return m ? `${m[1]}#${m[2]}` : null;
};

/**
 * @param {string} repo
 * @param {number} n
 * @returns {IssueInfo}
 */
export function fetchIssue(repo, n) {
  const raw = JSON.parse(gh(['api', `repos/${repo}/issues/${n}`]));
  return {
    number: raw.number,
    title: raw.title,
    body: raw.body ?? '',
    state: raw.state,
    stateReason: raw.state_reason ?? null,
    parent: parentRef(raw.parent_issue_url),
  };
}

/**
 * Issue numbers (not PRs) in the repo, any state.
 * @param {string} repo
 * @returns {number[]}
 */
export function listIssueNumbers(repo) {
  const out = gh(['api', '--paginate', `repos/${repo}/issues?state=all&per_page=100`, '--jq', '.[] | select(.pull_request | not) | .number']);
  return out.split('\n').filter(Boolean).map(Number).sort((a, b) => a - b);
}

/**
 * Issues the PR declares it closes, limited to `repo`.
 * @param {string} repo
 * @param {number} pr
 * @returns {number[]}
 */
export function closingIssues(repo, pr) {
  const [owner, name] = repo.split('/');
  const query = `query($owner:String!,$name:String!,$pr:Int!){repository(owner:$owner,name:$name){pullRequest(number:$pr){closingIssuesReferences(first:100){nodes{number repository{nameWithOwner}}}}}}`;
  const raw = JSON.parse(gh(['api', 'graphql', '-f', `query=${query}`, '-F', `owner=${owner}`, '-F', `name=${name}`, '-F', `pr=${pr}`]));
  const nodes =
    raw.data.repository.pullRequest.closingIssuesReferences.nodes;
  return nodes.filter((n) => n.repository.nameWithOwner.toLowerCase() === repo.toLowerCase()).map((n) => n.number);
}

/** @typedef {import('./scope.js').PullInfo} PullInfo */

/**
 * @param {any} raw
 * @returns {PullInfo}
 */
const toPull = (raw) => ({
  number: raw.number,
  base: raw.base.ref,
  head: raw.head.ref,
  body: raw.body ?? '',
  state: raw.state,
  merged: Boolean(raw.merged_at),
});

/**
 * @param {string} repo
 * @param {number} n
 * @returns {PullInfo}
 */
export function fetchPull(repo, n) {
  return toPull(JSON.parse(gh(['api', `repos/${repo}/pulls/${n}`])));
}

/**
 * PRs in any state whose head is `branch` in `repo`.
 * @param {string} repo
 * @param {string} branch
 * @returns {PullInfo[]}
 */
export function pullsWithHead(repo, branch) {
  const head = encodeURIComponent(`${repo.split('/')[0]}:${branch}`);
  const pages = JSON.parse(gh(['api', '--paginate', '--slurp', `repos/${repo}/pulls?state=all&per_page=100&head=${head}`]));
  return pages.flat().map(toPull);
}

/**
 * @param {string} repo
 * @returns {string}
 */
export function defaultBranch(repo) {
  return gh(['api', `repos/${repo}`, '--jq', '.default_branch']).trim();
}

/**
 * Whether `branch` has no commits that `base` lacks.
 * @param {string} repo
 * @param {string} base
 * @param {string} branch
 * @returns {boolean}
 */
export function containedIn(repo, base, branch) {
  const ahead = gh(['api', `repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(branch)}`, '--jq', '.ahead_by']).trim();
  if (!/^\d+$/.test(ahead)) throw new Error(`cannot compare ${branch} with ${base}: ${ahead || 'no ahead_by in the response'}`);
  return Number(ahead) === 0;
}

/**
 * One attempt of an Actions run as GitHub records it: its conclusion (empty while it runs), the commit it checked out,
 * the workflow file it came from, and the event and branch that triggered it.
 * @param {string} repo
 * @param {string} id
 * @param {string} attempt
 * @returns {{ conclusion: string, headSha: string, workflow: string, event: string, branch: string }}
 */
export function actionsRun(repo, id, attempt) {
  const r = JSON.parse(gh(['api', `repos/${repo}/actions/runs/${id}/attempts/${attempt}`]));
  return { conclusion: r.conclusion ?? '', headSha: r.head_sha, workflow: r.path, event: r.event, branch: r.head_branch ?? '' };
}

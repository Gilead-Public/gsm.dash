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

/**
 * @param {string} repo
 * @param {string} runId
 * @returns {string}
 */
export function runConclusion(repo, runId) {
  return gh(['run', 'view', runId, '-R', repo, '--json', 'conclusion', '--jq', '.conclusion']).trim();
}

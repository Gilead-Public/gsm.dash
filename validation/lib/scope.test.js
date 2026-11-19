// @ts-check
import { describe, expect, it } from 'vitest';
import { closingKeywords, walkStack } from './scope.js';
/** @typedef {import('./scope.js').PullInfo} PullInfo */
/** @typedef {import('./scope.js').StackSource} StackSource */

const REPO = 'Owner/Repo';

describe('closing keywords in a PR body', () => {
  it('reads every GitHub keyword form, with or without a colon, in any case', () => {
    const body = 'close #1\nCloses #2\nclosed: #3\nFIX #4\nfixes #5\nFixed #6\nresolve #7\nresolves: #8\nResolved #9';
    expect(closingKeywords(body, REPO)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('needs a keyword for each issue', () => {
    expect(closingKeywords('Closes #8, #9, #10', REPO)).toEqual([8]);
    expect(closingKeywords('Closes #8, closes #9, closes #10', REPO)).toEqual([8, 9, 10]);
  });

  it('accepts references to this repo in owner/repo#N and issue URL form, ignoring case', () => {
    expect(closingKeywords('Fixes owner/repo#12 and resolves https://github.com/Owner/Repo/issues/13', REPO)).toEqual([12, 13]);
  });

  it('ignores other repos', () => {
    expect(closingKeywords('Closes other/repo#5, fixes https://github.com/other/repo/issues/6', REPO)).toEqual([]);
  });

  it('ignores references without a closing keyword', () => {
    expect(closingKeywords('Depends on #26. Refs #27. Related to #28. See #29.', REPO)).toEqual([]);
  });

  it('ignores keywords inside words, comments and code', () => {
    const body = 'prefixes #1, unfixed #2\n<!-- Closes #3 -->\n```\ncloses #4\n```\nrun `fixes #5` here';
    expect(closingKeywords(body, REPO)).toEqual([]);
  });

  it('does not read a longer token as an issue number', () => {
    expect(closingKeywords('closes #12a and fixes #7/8', REPO)).toEqual([]);
  });
});

/**
 * @param {Partial<PullInfo> & { number: number; base: string; head: string }} p
 * @returns {PullInfo}
 */
const pull = (p) => ({ body: '', state: 'open', merged: false, ...p });

/**
 * @param {PullInfo[]} pulls
 * @param {Record<number, number[]>} [linked]
 * @param {string[]} [landed] Branches whose tips are already in the default branch.
 * @returns {StackSource}
 */
function source(pulls, linked = {}, landed = []) {
  return {
    repo: REPO,
    defaultBranch: 'main',
    pull: (n) => {
      const p = pulls.find((x) => x.number === n);
      if (!p) throw new Error(`no PR #${n}`);
      return p;
    },
    pullsWithHead: (branch) => pulls.filter((p) => p.head === branch),
    linkedCloses: (n) => linked[n] ?? [],
    landed: (branch) => landed.includes(branch),
  };
}

const bottom = pull({ number: 26, base: 'main', head: 'cod/build', body: 'Closes #8, closes #9, closes #10' });
const middle = pull({ number: 27, base: 'cod/build', head: 'cod/study', body: 'Depends on #26\n\nCloses #15' });
const top = pull({ number: 28, base: 'cod/study', head: 'cod/flags', body: 'Closes #11, closes #12, closes #13' });

describe('the PR stack walk', () => {
  it('uses GitHub\'s linked references for a PR to the default branch', () => {
    const walked = walkStack(26, source([bottom], { 26: [8, 9, 10] }));
    expect(walked).toEqual({ closes: [8, 9, 10], stack: [{ pr: 26, base: 'main', closes: [8, 9, 10], source: 'linked' }], failures: [] });
  });

  it('adds the issues of every PR beneath a stacked PR', () => {
    const walked = walkStack(28, source([bottom, middle, top], { 26: [8, 9, 10] }));
    expect(walked.failures).toEqual([]);
    expect(walked.closes).toEqual([8, 9, 10, 11, 12, 13, 15]);
    expect(walked.stack.map((s) => [s.pr, s.source])).toEqual([[28, 'body'], [27, 'body'], [26, 'linked']]);
  });

  it('fails closed when no PR has the base as its head', () => {
    const walked = walkStack(27, source([middle]));
    expect(walked.failures.join()).toMatch(/#27 targets cod\/build, which has commits not in main, but no open PR has that branch as its head/);
    expect(walked.closes).toEqual([15]);
  });

  it('fails closed when the PR beneath was closed without merging', () => {
    const walked = walkStack(27, source([{ ...bottom, state: 'closed' }, middle]));
    expect(walked.failures.join()).toMatch(/no open PR .* \(#26 closed without merging\)/);
  });

  it('fails closed when more than one open PR has the base as its head', () => {
    const twin = pull({ number: 30, base: 'main', head: 'cod/build' });
    expect(walkStack(27, source([bottom, twin, middle])).failures.join()).toMatch(/more than one open PR \(#26, #30\)/);
  });

  it('ends the walk when the PR beneath merged and its branch holds nothing beyond the default branch', () => {
    const walked = walkStack(27, source([{ ...bottom, state: 'closed', merged: true }, middle], {}, ['cod/build']));
    expect(walked.failures).toEqual([]);
    expect(walked.closes).toEqual([15]);
  });

  it('fails when the PR beneath merged but its branch gained commits afterwards', () => {
    const walked = walkStack(27, source([{ ...bottom, state: 'closed', merged: true }, middle]));
    expect(walked.failures.join()).toMatch(/#27 targets cod\/build, which has commits not in main, but no open PR/);
  });

  it('is not fooled by a reused branch: an old merge does not vouch for a later abandoned PR', () => {
    const merged = { ...bottom, state: /** @type {const} */ ('closed'), merged: true };
    const abandoned = pull({ number: 39, base: 'main', head: 'cod/build', body: 'Closes #11', state: 'closed' });
    const later = pull({ number: 40, base: 'cod/build', head: 'cod/later', body: 'Closes #15' });
    const walked = walkStack(40, source([merged, abandoned, later]));
    expect(walked.failures.join()).toMatch(/#40 targets cod\/build, .* no open PR .* \(#39 closed without merging\)/);
  });

  it('fails when a PR beneath merged into another branch instead of the default branch', () => {
    const walked = walkStack(28, source([{ ...middle, state: 'closed', merged: true }, top]));
    expect(walked.failures.join()).toMatch(/#28 targets cod\/study, which has commits not in main, but no open PR/);
  });

  it('stops on a cycle', () => {
    const a = pull({ number: 40, base: 'b', head: 'a' });
    const b = pull({ number: 41, base: 'a', head: 'b' });
    expect(walkStack(40, source([a, b])).failures.join()).toMatch(/loops back to #40/);
  });
});

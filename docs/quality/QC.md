# Quality control

This is the authoritative quality-control policy for gsm.dash. It applies to every pull request into the default
branch and to every release. Where it and a plan, a PR or a tool disagree, this document wins until it is changed by a
reviewed pull request.

## Requirements

- Requirements are GitHub issues with numbered acceptance criteria (`<issue>.<nn>`). Each issue's **Scope** says what
  is in and out.
- A change implements the full Scope of the issues it closes, and nothing beyond it. Behaviour no criterion covers is
  removed, or raised on the issue as a requirements question before it is built.
- A pull request closes only the issues it completes. An issue whose criteria or Scope changed after it was built
  stays open (`Refs #n`) until the pull request that implements the change closes it.
- Tests claimed as acceptance-criterion evidence must be named `<id>: … (#<issue>)`. Other regression and harness tests
  may remain untraced; they don't count as criterion evidence.
- Criteria, their kinds and their review status change only through `npm run criteria:sync` and
  `npm run criteria:review`.

## Roles

Records identify each reviewer, tester and approver by their public GitHub handle and their role, so independence and
sign-off can be established. A GitHub handle is not a personal name: this repository is public, so don't write
people's personal names, and write handles without `@` unless you mean to notify someone.

| Role | Who |
|---|---|
| Developer | Writes the change and its tests. |
| Code reviewer | Anyone but the developer. |
| Calculation reviewer | Someone who did not write the calculation under review. |
| Business owner | The stakeholders who set the requirements, through the people who collect their feedback. |
| UAT tester | A person assigned to an acceptance issue. Not the developer. |
| Release approver | Decides that a release meets this policy. |

## The four tracks

Every pull request states, for each track, whether it applies, and gives its evidence or the reason it doesn't apply.
"Not applicable" without a reason is not accepted.

### 1. Code review

**Applies to:** every pull request.

**Evidence, recorded in the pull request:**
- the reviewer confirms that the implementation and its tests satisfy the full Scope and every criterion of each issue
  the pull request closes, and add nothing outside them;
- every review finding has a recorded disposition: fixed (with the commit), or declined (with the reason);
- automated validation passes on the pull request's head: every in-scope criterion is approved and covered in each
  delivery mode it requires.

### 2. Independent calculation review

**Applies to:** any change to how the dashboard computes what it shows:
- pooling or summing site rows to a study or portfolio value;
- numerators and denominators, and which population a percentage is out of;
- snapshot selection, including "as of" dates;
- flag summaries;
- scaling and display rules, such as rates per 28 days, and rounding.

The dashboard derives no new metric logic: metric definitions belong to the metric pipeline.

**Evidence:**
- a calculation reviewer reviews the change and records sign-off in the pull request;
- the qualification evidence the criteria require exists: independent expectations in `test/qual/`, which share no
  code with `src/`, and the tests that compare the two.

### 3. Business UAT

**Applies to:** any change to what users see or can do.

**Evidence, recorded separately from technical UAT and linked from the pull request:**
- what was shared with the business owner (a build or prototype, and when);
- the feedback received, and where it is recorded;
- each item's disposition: changed, deferred or declined. Feedback that changes a requirement is written into the
  issue before it is built;
- **the acceptance decision:** the business owner, or a representative they designate, records that they accept the
  identified behaviour and the feedback dispositions, with their GitHub handle, the date and a reference to what they
  reviewed.

Collecting feedback alone leaves this track pending. So does any disposition, deferred or declined included, until the
acceptance decision covers it.

### 4. Technical UAT

**Applies to:** every user-facing issue.

**Evidence:**
- an acceptance issue for each user-facing issue, titled `qcthat Acceptance for #<n>: <description>` and linked as
  its sub-issue, holding numbered checks that state exact expected values from the fixed example data;
- the checks cover the behaviour users depend on: values, filters, navigation, error states and other critical
  interactions. Comparing screenshots alone is not technical UAT;
- the build under test is identified: its validation run, commit and example data;
- a tester assigned to the acceptance issue works through every check and closes the issue as **completed**.
  Closing it as "not planned", or closing by anyone not assigned, is not acceptance.

Acceptance issues follow the qcthat format, so they work with its tooling, but nothing here depends on that tooling:
they can be created, assigned and closed by hand.

## Releases

A release is approved only when:
- every issue in it (every issue closed as completed since the previous release) has completed each track that
  applies to it, including a recorded business acceptance decision where business UAT applies;
- its evidence covers the released behaviour and the released build: a passing validation run on the release commit,
  and technical UAT against that build or one whose reports are identical;
- every reassessment below has been recorded.

Each release carries its qualification report: the traceability matrix, the validation run's record and environment,
and the acceptance records.

## What invalidates earlier acceptance

A material change after acceptance needs an explicit reassessment, recorded where the acceptance was recorded. Either
the affected checks are run again, or the record states why the earlier acceptance still holds. Material changes
include:
- a change to an accepted issue's criteria or Scope (this also reopens the criteria's review);
- a change to accepted behaviour, including its look where a check covers it;
- a change to a calculation that has been reviewed;
- a change to the example data that alters a value a check states.

Changes to tests, documentation or tooling alone don't need a reassessment, unless they change what a check relies on.

## What tooling enforces today

- **Validation gate** (`validation/run.js`, in CI on every pull request): each in-scope criterion is approved, traced
  and passing in every delivery mode it requires, and the issues' text matches the approved baseline.
- **Release gate** (`validation/release.js`): the release run's provenance, its files' hashes, and acceptance of its
  visual criteria against that run's own screenshots.

Tooling doesn't yet record or check tracks 2 to 4. Until it does, the people responsible record them in the pull
request and the issues, and the release approver checks them.

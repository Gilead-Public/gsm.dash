# Instructions for coding agents

Read [docs/quality/QC.md](docs/quality/QC.md) before you implement or review a change. It is the quality-control
policy, and it overrides any plan or habit.

In short:
- **Requirements** are GitHub issues with numbered acceptance criteria. Implement an issue's full Scope and nothing
  beyond it; raise anything else as a requirements question on the issue.
- **Tests** claimed as acceptance-criterion evidence must be named `<id>: … (#<issue>)`. Other regression and harness
  tests may remain untraced; they don't count as criterion evidence. Change criteria, kinds and approvals only through
  `npm run criteria:sync` and `npm run criteria:review`, never by editing `validation/requirements.json`.
- **Evidence:** run `npm run e2e -- --issues <n,…>` (a fresh build in both delivery modes) before calling a change
  done, and check that each new rule's test fails when the rule is removed.

## Independent-review boundaries

- An agent that wrote a change doesn't review it. Its own checks are not code review, calculation review or UAT.
- A reviewing agent gets the code and the requirements, not the author's conclusions, and reports findings for a
  person to dispose of.
- Independent expectations in `test/qual/` share no code with `src/`: no imports, no copied logic.
- Agents may draft acceptance checks and produce automated evidence. Only the assigned people record business or
  technical acceptance, or sign off a calculation review.

## Public repository

Don't put people's personal names, internal URLs or quotations from internal documents in code, comments, issues, pull
requests or fixtures. Public GitHub handles are allowed where QC records need them (reviewers, testers, approvers),
written without `@` unless someone should be notified.

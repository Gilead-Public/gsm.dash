# Prototype features: what is removed and what stays

The reports began as a prototype (commits up to `a0703b2`). Some of its features have no requirement or business source
behind them. Under the QC policy ([QC.md](QC.md), Requirements), behaviour no acceptance criterion covers is removed, or
raised as a requirements question, and behaviour without a business source is removed, or raised with the business owner.
A regression baseline (11.03, 12.02) only guards against unintended change; it doesn't make a feature a requirement.

This list comes from a scope audit of every visible feature against the approved requirements, done on 16 Nov and updated
on 17 Nov for #16, #20, #22 and #25. The removals are tracked in #35, and the PR that closes #35 re-records the 11.03 and 12.02
baselines and records the reassessment. Code locations are as of `ef550d9`.

## Removed (#35)

| ID | Feature | Why | Code |
|---|---|---|---|
| R1 | "Change log" link in the portfolio header | No requirement; it links a public report to a private site | `src/pages/portfolio.astro` |
| R2 | "Metric glossary" button and dialog, both reports | No requirement; its text still describes the prototype ("simulated", "(Q2)" placeholders). Each metric's glossary entry stays in its hovers (#20) | `src/layouts/Report.astro`, `src/app/glossary.js`, `src/react/mount.jsx` |
| R3 | "⤨ Randomize" on the study report | A demo aid | `src/react/StudyPage.jsx` |
| R4 | STANDARD / CUSTOM badge on study tiles and in the Charts panel | Developer-facing, and it labels Breakdowns "Standard" while its help text calls them "Custom" | `src/react/StudyPage.jsx` |
| R5 | ▶ / ❚❚ play through visits | A demo animation; the visit slider stays | `src/react/StudyPage.jsx` |
| R6 | Comparison line "portfolio … · this study … pt" on Details tiles, and the portfolio comparison data in each study document | A derived calculation with no requirement or calculation review; it also puts portfolio-wide figures in every study report (gsm.roadmap#623, open question 5) | `src/widgets/scalar-tile.js`, `src/widgets/resolve.js`, `scripts/study-document.mjs`, `schemas/study-document.schema.json`, `src/react/document.js` |
| R7 | Note "n metrics are not site-level … held back until a future release adds that plumbing." | Developer wording, no requirement | `src/app/portfolio-controls.js` |
| R8 | Study metadata line "n metrics · exported <date>" | No requirement; #24 removes the portfolio's | `src/react/mount.jsx` |
| R9 | Theme switch Auto / Light / Dark and its stored choice | Decided under #24: reports follow the operating system's light or dark setting | `src/layouts/Report.astro`, `src/app/theme.js` |

Second pass, 17 Nov, after checking each kept feature for a business source in gsm.roadmap#618, #624 and #625:

| ID | Feature | Why | Code |
|---|---|---|---|
| R10 | Metrics All / None, and the per-category all / none toggle | No business source; #624 asks for configurable columns, which #16 provides | `src/react/Sidebar.jsx` |
| R11 | Study tile views Overview, Scatter (n vs d) and Numerator by site, with their chart hovers | No business source; #618 asks for an overview widget (the Details tile) and a distribution widget (Breakdowns) | `src/widgets/views/`, `src/app/study-page-spec.js` |
| R12 | All tiles menu | No business source | `src/react/StudyPage.jsx` |
| R13 | Site highlight across charts, and its chip, including in the flag views and the Charts panel | No business source | `src/react/StudyPage.jsx`, `src/widgets/` |
| R14 | Charts button and panel on CTQ tiles; the standard-KRI widgets keep theirs (#32) | No business source; #625's drill-through goes to the detailed report (#13) | `src/react/StudyPage.jsx` |

## Kept

| ID | Feature | Decision |
|---|---|---|
| K1 | Page tags "Program overview" / "Study view" | Removed by #24 (design review 2026-11-19): the header shows the logo and the dashboard's title |
| K3 | "Extract: <date>" on a single-snapshot study | Kept, and required by 35.09. Source: gsm.roadmap#625 (the view is generated from the scheduled study snapshot) |
| K4 | Trend over time tile view | Kept, and required by 35.05. Source: gsm.roadmap#618 and #625 (the study view presents CTQ trends) |

A full study tile pages through Details, Trend over time, the metric's own views (Breakdowns, Report link) and, where a
study configures them, the flag views (#11).

These were uncovered in the audit, but a requirement now covers them:
- row-click highlight (25.05);
- Clear filters (22.04);
- the Controls panel's collapse and sections (#22);
- Overview tiles and Details cells (#20, #25);
- the Distribution view's study link.

Features covered only by a regression baseline stay until a business-source check finds each a source, or removes it: the
"Showing" lines, the zoom note, the Distribution legend and notes, status pills, disabled-control reasons, study header
attributes, tile heads and the Details view.

K2 (Metrics All / None) and K5 (the Charts panel on CTQ tiles) were kept at first, and removed in the second pass (R10, R14).

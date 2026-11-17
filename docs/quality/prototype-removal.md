# Prototype features: what is removed and what stays

The reports began as a prototype (commits up to `a0703b2`). Some of its features have no requirement behind them. Under the
QC policy ([QC.md](QC.md), Requirements), behaviour no acceptance criterion covers is removed, or raised as a requirements
question. A regression baseline (11.03, 12.02) only guards against unintended change; it doesn't make a feature a
requirement.

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

## Kept

| ID | Feature | Decision |
|---|---|---|
| K1 | Page tags "Program overview" / "Study view" | Decided with #24's header work |
| K2 | Metrics All / None, per-category all / none | Kept; to be written into a baseline requirement (gsm.roadmap#624) |
| K3 | "Extract: <date>" on a single-snapshot study | Kept, as the only place the date shows; baseline requirement (gsm.roadmap#625) |
| K4 | Study tile views Overview, Scatter (n vs d), Numerator by site, Trend; the All tiles menu; site highlight across charts; chart-mark hovers | Kept; baseline requirement (gsm.roadmap#625). How sites are coloured by flag is a question for #11 |
| K5 | Charts drill-in on CTQ tiles | Kept; baseline requirement (gsm.roadmap#625). #32 requires it for the KRI widgets |

These were uncovered in the audit, but a requirement now covers them:
- row-click highlight (25.05);
- Clear filters (22.04);
- the Controls panel's collapse and sections (#22);
- Overview tiles and Details cells (#20, #25);
- the Distribution view's study link.

Features covered only by a regression baseline stay until a baseline requirement says otherwise: the "Showing" lines, the zoom
note, the Distribution legend and notes, status pills, disabled-control reasons, study header attributes, tile heads and the
Details view.

# gsm.dash

> **Status: early prototype.** APIs, the data contract, and the widget
> framework are all subject to change. Every number in the example data is
> simulated.

Executive dashboard reports for the gsm ecosystem: a portfolio overview and one report per study.

## Intended use

gsm.dash displays precomputed clinical-trial oversight metrics for central monitoring review, for one study or
across a portfolio of studies.

- **Users:** central monitoring and study teams reviewing study and portfolio status.
- **Inputs:** aggregated outputs of the gsm.reporting data model (results, groups, bounds, distributions). No
  participant-level data.
- **What it computes:** display arithmetic on those outputs only: summing site rows to study or portfolio level,
  percentages of displayed counts, sorting and grouping.
- **What it does not do:** derive metrics, scores or flags (the upstream gsm pipeline does), make decisions, or
  write data back.
- **Validation:** its regulatory classification is not yet confirmed, so it is developed to the GxP standard in
  the meantime. Requirements are GitHub issues with numbered acceptance criteria, every test names the criterion
  it evidences, and each validation run produces a traceability matrix and a hashed evidence bundle (see
  `validation/`).
References in code comments to "design doc §n", "Qn" and "Wn" point at this
project's internal requirements and design documentation.

gsm.dash consumes **standardized metric outputs from the gsm.reporting data
model** — never raw clinical data. Each report is one self-contained HTML file,
built with Astro and React, that opens from disk or from any static host.

**Input model:** site-level metrics are the core input. The dashboard derives
study rates and multi-study rates itself by pooling site-level rows, so any
new site-level metric added to the pipeline appears automatically. Study-,
country- and participant-level metrics (e.g. QTLs) need different plumbing
and are held back until a future release.

## Quick start

```sh
npm install
npm test               # rollup/normalize units + contract schema conformance
npm run build:reports  # portfolio.html and one report per study in dist/reports; each opens from disk
```

## Publishing

GitHub Pages shows only a release: the reports from a validation run that came from a push to main, reviewed and
published byte for byte.

1. Download that run's artifact (`validation-run-<id>-<attempt>`). After comparing the screenshots it lists, accept
   every in-scope visual criterion:
   `node validation/accept.js <run folder> <ids> --accept --reviewer "<name>"`.
2. Tag the run's commit and create a GitHub release on the tag, with the run folder's `acceptance.json` attached.
3. `gh workflow run pages.yml --ref main -f tag=<tag>`. The workflow checks the run with `validation/release.js` and
   publishes its reports. On any problem, it publishes nothing.

The run's artifact must still exist, which is 90 days by default.

To share a build for feedback without releasing it: every CI run that passes also uploads
`gsm-dash-reports-<id>-<attempt>`, which holds just its tested reports and a read-me. It isn't a reviewed release.

## What's here

- `src/data/` — `PortfolioStore` plus the normalize / **rollup** modules.
  `rollup.js` is the numeric heart (pooled Σn/Σd, per-study latest-snapshot
  selection, NA-inclusive flag distributions) and the double-programming QC
  target.
- `src/pages/`, `src/react/` — the reports: an Astro page each for the
  portfolio and a study, with one React root rendering it from one injected
  document (gsm.viz inlined into study reports). Hovering a metric's header
  shows its definition from `Reporting_Metrics` (#20). The portfolio's
  controls sit in its header (#22, #24): **Filters**, a chip bar collapsed on
  load (Study, Product, Therapeutic area, Phase, Status; a field no study has a
  value for gets no chip, and a blank value is no value), then Group rows by;
  **Config**, by what it changes: Cells (the Cell display: Compact, Detailed,
  or Custom with its cell contents and heatmap; #47) and Columns (Study
  columns: study name, **Enrolled**, on by default, Status, #21; and the
  metrics, each configured group's heading with a checkbox for its band);
  **Reset**; and
  **Admin**, a demo tool for the theme, the study grid's cards per row, Config
  as a popover or side panel, and a heatmap legend (#46). Enrolled, the
  Population band's one column, is the summary's `ParticipantCount`, summed
  over the row's studies; screened shows in the hovers. The study page
  is one grid of same-size cards, one per widget the tracker requests, in its
  order (#32), at the study's latest snapshot (#48). Each card's header gives
  the metric's title, and on its right the value and n / N, whose hover names
  both; a breakdown names its total, its notes sit behind a footer marker, and
  one longer than its card allows shows its top rows, then "+ k more",
  and when a card's content can't be shortened (the protocol-deviation
  categories always show their top 5, #19), every card grows to fit it, so
  nothing is clipped. Its back link reads
  "← Portfolio". Links
  between reports are relative and carry the portfolio's view in the hash.
  The browser also keeps the view, without the Admin settings, per reports
  folder: a report opened with no view in its address restores it, and Reset
  or a return to the defaults forgets it. Where the browser refuses storage,
  the reports work from the address alone.
  `src/app/` holds the rules and text both pages share.
- `src/widgets/` — the **widget framework** (see the Widget Framework
  proposal artifact): a build-time registry of small composable views. Each
  widget declares a `dataSpec` naming the contract layers it needs; the host
  resolves the data against its layer allow-list (the exec build never
  carries `listings`). A widget that is unknown, needs a layer the host
  doesn't carry, or doesn't apply to the metric (`appliesTo`) is never
  swapped for another: its card shows a placeholder naming it and the
  reason, and configuration no card can show is listed above the study
  page (`src/app/references.js`). Shipped set: `distribution-bar` (#10),
  `kri-summary` (a standard KRI's flag counts, #32, configured in
  `src/config/kri-groups.js`), and `threshold-list` (watch sites — its
  derivation is a pure, unit-tested export per the "widgets render, the
  pipeline computes" boundary).
- `src/config/study-cards.js` — the **study page's cards**, in tracker order
  (gsm.roadmap#617): each names its widget, its metric, its title and, for a
  breakdown, the one section it shows. Premature deaths are three cards, by
  time window, eligibility and relatedness (#10); the joint-count table they
  replaced is kept unwired for the premature-death design cycle. The
  catalog declares each metric's widget (`Widget`, with options in
  `WidgetConfigs`); a standard KRI declares its card by being in a KRI group.
  A card whose metric is unknown or inactive, whose metric declares another
  widget, or which names an unknown widget or section shows a placeholder
  (#12). Cards of metrics the portfolio hides are left out (#27), and KRIs
  hidden by default appear after the one "Show more" control. The tile views
  are retired (#35): a catalog entry's `Widgets`, or a `Widget` or
  `WidgetConfigs` naming Details, Trend over time, a flag view or Report link,
  is listed in the page's notice. The grouped layout
  (`src/react/StudyGroupedCards.jsx`) is kept but unwired: the 19 Nov design
  review orders cards by layout only and leaves grouping for later.
- `src/widgets/viz/` — **gsm.viz adapters**: the standard KRI-report charts
  as widgets (`viz-bar`, `viz-scatter`, `viz-timeseries`), fed by the same
  site-level rows, group metadata, bounds and snapshot history the contract
  already carries. On the study page each standard KRI's card opens a Charts
  drill-in panel with these as tabs, across the grid after the card (#32);
  CTQ cards have none (#35). Each adapter guards the gsm.viz call and
  degrades to a labeled placeholder if a chart cannot run in widget mode.
  gsm.viz 2.3.0 is vendored under `public/vendor/` (see its README) until
  it ships as an ESM package.

### Known gsm.viz widget-mode gaps (to raise upstream)

- Ships only as an IIFE global (`window.gsmViz.default`); no ESM/npm build.
- Charts are not theme-aware (Chart.js default inks), so the adapters place
  them on a light card even in dark mode.
- `scatterPlot` sizes points by `ParticipantCount` from group metadata; when
  the key is absent the radius is `NaN` and points vanish instead of
  falling back to a default size.
- `groupOverview` hardcodes gsm.kri's site-risk-score metric ID and docs
  URL as defaults (harmless when the metric is absent — the column is
  simply omitted).
- `src/scales/flags.js` — the single flag scale; colors live in CSS tokens.
- `src/charts/sparkline.js` — D5 renderer. Deliberate seam: swaps to
  `@gilead-biostats/gsm.viz`'s `sparkline` once gsm.viz ships as an ESM
  package (design doc §7).
- `schemas/` — the **normative JSON contract**: `portfolio.json` manifest,
  the counts-only `summary.json` that every portfolio number comes from, and
  one study-snapshot file per study × snapshot date, columns mirroring the
  gsm.core reporting data model exactly. The R-side export writer validates
  against these.
- `scripts/package-reports.mjs` inlines each built page into a template;
  `scripts/inject.mjs` puts one data document into it (built by
  `scripts/portfolio-document.mjs` or `scripts/study-document.mjs`, with a
  schema in `schemas/`); `Rscript scripts/inject.R` does the same in base R,
  writing the same bytes. A document that fails its schema shows an error state.
- `scripts/generate-example-data.mjs` — deterministic simulated portfolio
  (12 studies × ~6 monthly snapshots, real gsm.kri metric catalog IDs, all
  numbers fake).

## Data

Each report carries its data as one injected document (`<script type="application/json"
id="gsm-data">`), checked against its schema when it loads. The portfolio's holds the
catalog, the studies, the counts-only summary and its configuration, if any. A study's
holds the catalog, the study's manifest entry and all its snapshots. Either may carry a
`title` (#24), which the render step sets; the header and the browser tab show it, and
"gsm.dash" when there is none.

Portfolio defaults (#16): an optional `config.json` beside `portfolio.json` sets the
portfolio's initial grouping (`groupBy`), heatmap (`heatmap`), cell values (`show`),
hidden metrics (`metrics`, MetricIDs), optional table columns (`columns`: `name`, `enroll`,
`status`; #21), view (`view`: `overview` or `details`) and metric groups (`groups`: an
ordered list of `{ "name", "metrics", "hidden" }`, each metric in one group; metrics no group
lists trail in an "Other" group, a reserved name; without it, or with an empty list, every metric
sits in one band, "Metrics", with no group checkboxes; #21's group checkboxes in Config show or
hide each band, and a study report opened from the portfolio leaves out the metrics a hidden
group hides); every key is optional.
Metrics carry no group of their own: the wrapper supplies the default groups, and the example
data writes its own `config.json` with the groups shown at the 24 Nov demo.
The Enrolled column shows a study's count against its `ParticipantTarget` parameter when
the study has one. It travels in the portfolio
document, so one template serves any configuration. Its values are checked against the
controls' choices and the catalog when the document is built and when the report
loads. A setting in the address's hash overrides its configured default.

Snapshot cycle (#14): the summary's `cycle` names one snapshot date and every study taking
part. A study whose latest snapshot is on another date is left out of the table and the
totals, and a notice names it with its latest snapshot; a listed study with no
data is named as missing. Trends keep every study's history before the cycle date; their
point on the cycle date, like the totals, leaves off-cycle studies out, and they end there. A
summary holding a study its cycle doesn't list is refused.

Detailed-report links (#13): a catalog entry's `ReportLink` is a path to that metric's
report, resolved against the manifest's optional `reportBase`, which itself resolves
against the page; a relative base therefore works wherever the dashboard is hosted.
A metric without `ReportLink` shows no link. A `{StudyID}` in the path is replaced by each
study's ID, URL-encoded, so each study gets its own report (#25). On the portfolio, study
rows' cells and tiles open their metric's report in a new tab.

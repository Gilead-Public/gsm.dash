# gsm.dash

> **Status: early prototype.** APIs, the data contract, and the widget
> framework are all subject to change. Every number in the example data is
> simulated.

Executive dashboard components and app shell for the gsm ecosystem.
References in code comments to "design doc §n", "Qn" and "Wn" point at this
project's internal requirements and design documentation.

gsm.dash consumes **standardized metric outputs from the gsm.reporting data
model** — never raw clinical data. It is a framework-free web-component
library plus a thin static app shell (vanilla JS, no runtime dependencies).

**Input model:** site-level metrics are the core input. The dashboard derives
study rates and multi-study rates itself by pooling site-level rows, so any
new site-level metric added to the pipeline appears automatically. Study-,
country- and participant-level metrics (e.g. QTLs) need different plumbing
and are held back until a future release.

## Quick start

```sh
npm install
npm run dev        # generates example data, serves the app
npm test           # rollup/normalize units + contract schema conformance
```

## What's here (v1: the program page)

- `src/data/` — `PortfolioStore` plus the load / normalize / **rollup** modules.
  `rollup.js` is the numeric heart (pooled Σn/Σd, per-study latest-snapshot
  selection, NA-inclusive flag distributions) and the double-programming QC
  target.
- `src/components/` — light-DOM custom elements: `<gsm-filter-bar>` (D2),
  `<gsm-portfolio-table>` (D1/D3/D4 + D5 trend row), and `<gsm-study-page>`,
  which composes the study view from widgets. The table carries an **Enrolled**
  column — `Reporting_Groups` `ParticipantCount` summed over the row's studies
  at the same latest snapshots the metric rollups use — and every metric header
  carries an ⓘ with that metric's definition from `Reporting_Metrics`
  (numerator, denominator, model, score, thresholds, accrual rule).
- `src/widgets/` — the **widget framework** (see the Widget Framework
  proposal artifact): a build-time registry of small composable views. Each
  widget declares a `dataSpec` naming the contract layers it needs; the host
  resolves the data against its layer allow-list (the exec build never
  carries `listings`) and degrades unsatisfiable widgets along their
  `fallback` chain. Metric tiles bind via metric metadata
  (`Category`/`Widget`/`WidgetConfig`); page-level widgets come from the
  minimal spec in `src/app/study-page-spec.js`. Shipped set: `scalar-tile`
  (default), `breakdown-bar` (contract `details`), `link-out`, and
  `threshold-list` (watch sites — its derivation is a pure, unit-tested
  export per the "widgets render, the pipeline computes" boundary).
- `src/widgets/views/` — the **standard tile views** every site-level metric
  gets for free from the reporting layer: Overview (text), Details, Scatter
  (n vs d), Numerator by site, Outlier sites, Flag distribution, Trend over
  time. A metric tile pages through these (and any custom views bound to the
  metric) with ‹ › arrows. Each tile carries a **Standard / Custom** badge
  derived from the data layers the view declares: reporting-layer-only
  (`results`, `history`, `bounds`, `groups`) is Standard; anything reading
  `details`, `listings` or an external link is Custom. These small views
  live here for now; their long-term home is gsm.viz.
- `src/widgets/viz/` — **gsm.viz adapters**: the standard KRI-report charts
  as widgets (`viz-bar`, `viz-scatter`, `viz-timeseries`), fed by the same
  site-level rows, group metadata, bounds and snapshot history the contract
  already carries. On the study page every metric tile opens a drill-in
  panel with these as tabs. Each adapter guards the gsm.viz call and
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
- `schemas/` — the **normative JSON contract**: `portfolio.json` manifest +
  one study-snapshot file per study × snapshot date, columns mirroring the
  gsm.core reporting data model exactly. The R-side export writer validates
  against these.
- `scripts/generate-example-data.mjs` — deterministic simulated portfolio
  (12 studies × ~6 monthly snapshots, real gsm.kri metric catalog IDs, all
  numbers fake).

## Data loading

One contract, two modes (auto-detected): **fetched** (static host serving
`portfolio.json` + `studies/...`) or **embedded**
(`<script type="application/json" data-gsm="portfolio|snapshot">` blocks for
self-contained HTML / htmlwidget embedding).

## Events

Components extend the gsm.viz CustomEvent vocabulary
(`riskSignalSelected` / `groupSelected`): the table dispatches bubbling
`studySelected` events; the app shell answers with navigation. Hosts that
embed components without the shell subscribe to the same events.

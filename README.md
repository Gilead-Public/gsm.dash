# gsm.dash

> **Status: early prototype.** APIs, the data contract, and the widget
> framework are all subject to change. Every number in the example data is
> simulated.

Executive dashboard components and app shell for the gsm ecosystem.
Implements gsm.roadmap#53 (Exec Dashboard Analytics Framework). The
requirement and design docs live in the internal `gsm.roadmap` repository
(`requirements/design/53_design.md`); references in code comments to
"design doc §n", "Qn" and "Wn" point at those internal documents.

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
  which composes the study view from widgets.
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

# gsm.viz 2.3.0 (vendored build)

`index.js` and `main.css` are the built distribution of
[gsm.viz](https://github.com/Gilead-BioStats/gsm.viz) v2.3.0, copied verbatim
from gsm.kri's `inst/htmlwidgets/lib/gsm.viz-2.3.0/` — the same mechanism
gsm.kri uses to ship it. Third-party license notices (Chart.js and friends)
are in the banner at the end of `index.js`.

The bundle is an IIFE that defines a global `gsmViz`; the chart API lives at
`window.gsmViz.default.{barChart, scatterPlot, timeSeries, groupOverview, sparkline}`.
gsm.dash wraps these in `src/widgets/viz/`.

Interim arrangement: once gsm.viz publishes an ESM package this directory goes
away and the adapters import it directly (design doc §7).

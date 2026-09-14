// Build-time registry: importing this module registers the shipped widget set.
// Standard tile views (reporting layer only — free for every site-level metric):
import './views/overview.js';
import './scalar-tile.js'; // "Details"
import './views/scatter-mini.js';
import './views/bar-numerator.js';
import './views/bar-outliers.js';
import './views/flag-dist.js';
import './views/trend-mini.js';
// Custom / page-level widgets:
import './breakdown-bar.js';
import './link-out.js';
import './threshold-list.js';
// gsm.viz adapters — the standard KRI-report charts, wide format (drill-in panel).
import './viz/viz-bar.js';
import './viz/viz-scatter.js';
import './viz/viz-timeseries.js';

export { registerWidget, resolveWidget, missingLayers, listWidgets, getWidget, widgetKind } from './registry.js';
export { resolveData } from './resolve.js';

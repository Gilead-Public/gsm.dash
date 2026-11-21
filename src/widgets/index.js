// Build-time registry: importing this module registers the shipped widget set.
// The study page's cards (#32):
import './distribution-bar.js';
import './kri-summary.js';
// Page-level widgets:
import './threshold-list.js';
// gsm.viz adapters — the standard KRI-report charts, wide format (drill-in panel).
import './viz/viz-bar.js';
import './viz/viz-scatter.js';
import './viz/viz-timeseries.js';

export { registerWidget, resolveWidget, missingLayers, listWidgets, getWidget } from './registry.js';
export { resolveData } from './resolve.js';

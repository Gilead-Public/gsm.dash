// Adapter between the widget framework and gsm.viz 2.3.0 (vendored IIFE,
// API at window.gsmViz.default). Charts stay in gsm.viz; this file only
// translates contract data into gsm.viz's argument conventions and guards
// the call so a chart that can't run in widget mode degrades to a visible
// placeholder instead of breaking the page.
import { esc } from '../../util/format.js';

export function gsmVizApi() {
  const api = globalThis.gsmViz?.default;
  if (!api) throw new Error('gsm.viz bundle is not loaded (expected window.gsmViz.default)');
  return api;
}

// gsm.viz's `_config_` is the metric's metadata row plus chart overrides.
const METRIC_KEYS = ['MetricID', 'GroupLevel', 'Abbreviation', 'Metric', 'Numerator', 'Denominator', 'Model', 'AnalysisType', 'Score', 'Threshold', 'Flag'];

export function chartConfig(metric, overrides = {}) {
  const config = {};
  for (const k of METRIC_KEYS) if (metric[k] !== undefined) config[k] = metric[k];
  return { GroupLevel: 'Site', maintainAspectRatio: false, ...config, ...overrides };
}

/**
 * gsm.viz's own cross-chart highlight key. It expects an array and treats an
 * empty one as "nothing selected", so this maps our single selection onto its
 * vocabulary rather than inventing a parallel one.
 */
export const selectedGroupIDs = (selectedSite) => (selectedSite ? [String(selectedSite)] : []);

/** gsm.viz mutates the rows it is given (attaches group metadata etc.); never hand it store rows. */
export const clone = (rows) => (rows ?? []).map((r) => ({ ...r }));

/**
 * Render a gsm.viz chart into `el` with a caption; on failure show a
 * placeholder naming the chart and the error. Returns { chart } for cleanup.
 */
export function renderChart(el, { chartName, title, height = 320 }, draw) {
  el.innerHTML = `<div class="viz" style="height:${height}px"></div><div class="viz-cap">gsm.viz · ${esc(chartName)}${title ? ` · ${esc(title)}` : ''}</div>`;
  const container = el.querySelector('.viz');
  try {
    const chart = draw(container);
    return { chart };
  } catch (err) {
    console.error(`[gsm.dash] gsm.viz ${chartName} failed in widget mode:`, err);
    el.innerHTML = `<div class="viz viz-placeholder" style="height:${height}px">
        <b>gsm.viz ${esc(chartName)}</b> could not render in widget mode.
        <span class="mono">${esc(err.message)}</span>
        <span class="muted">Placeholder — tracked for a gsm.viz widget-mode issue.</span>
      </div>
      <div class="viz-cap">gsm.viz · ${esc(chartName)}${title ? ` · ${esc(title)}` : ''}</div>`;
    return { chart: null };
  }
}

import { registerWidget } from '../registry.js';
import { gsmVizApi, chartConfig, clone, renderChart, selectedGroupIDs } from './adapter.js';

// The KRI report's scatter plot: denominator (log) vs numerator per site,
// with the Reporting_Bounds envelope when the snapshot carries bounds.

export function renderVizScatter(el, data, config = {}) {
  const { metric, siteRows, bounds, groups, selectedSite } = data;
  return renderChart(el, { chartName: 'scatterPlot', title: metric.Abbreviation, height: config.height }, (container) =>
    gsmVizApi().scatterPlot(
      container,
      clone(siteRows),
      chartConfig(metric, { selectedGroupIDs: selectedGroupIDs(selectedSite) }),
      bounds?.length ? clone(bounds) : [],
      groups?.length ? clone(groups) : null
    )
  );
}

registerWidget({
  name: 'viz-scatter',
  label: 'Scatter plot (gsm.viz)',
  format: 'wide',
  version: '0.1.0',
  size: 'wide',
  dataSpec: { results: 'self', bounds: 'self', groups: 'self' },
  fallback: 'scalar-tile',
  render: renderVizScatter,
});

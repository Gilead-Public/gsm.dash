import { registerWidget } from '../registry.js';
import { gsmVizApi, chartConfig, clone, renderChart } from './adapter.js';

// The KRI report's bar chart: one bar per site, colored by flag, threshold
// lines from the metric's parsed Threshold. Outcome defaults to Score;
// config.y may switch it to 'Metric' or 'Numerator' as in gsm.kri.

export function renderVizBar(el, data, config = {}) {
  const { metric, siteRows, groups } = data;
  return renderChart(el, { chartName: 'barChart', title: metric.Abbreviation, height: config.height }, (container) =>
    gsmVizApi().barChart(
      container,
      clone(siteRows),
      chartConfig(metric, { y: config.y ?? 'Score' }),
      metric.thresholds ?? [],
      groups?.length ? clone(groups) : null
    )
  );
}

registerWidget({
  name: 'viz-bar',
  label: 'Bar chart (gsm.viz)',
  format: 'wide',
  version: '0.1.0',
  size: 'wide',
  dataSpec: { results: 'self', groups: 'self' },
  render: renderVizBar,
});

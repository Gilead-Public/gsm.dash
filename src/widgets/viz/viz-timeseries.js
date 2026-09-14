import { registerWidget } from '../registry.js';
import { gsmVizApi, chartConfig, clone, renderChart, selectedGroupIDs } from './adapter.js';

// The KRI report's time series: per-site lines over the study's snapshots
// with the study aggregate and a distribution overlay. Input is the metric's
// site rows across every snapshot (the `history` layer).

export function renderVizTimeSeries(el, data, config = {}) {
  const { metric, history, groups, selectedSite } = data;
  return renderChart(el, { chartName: 'timeSeries', title: metric.Abbreviation, height: config.height }, (container) =>
    gsmVizApi().timeSeries(
      container,
      clone(history),
      chartConfig(metric, { y: config.y ?? 'Score', selectedGroupIDs: selectedGroupIDs(selectedSite) }),
      metric.thresholds ?? [],
      null,
      groups?.length ? clone(groups) : null
    )
  );
}

registerWidget({
  name: 'viz-timeseries',
  label: 'Over time (gsm.viz)',
  format: 'wide',
  version: '0.1.0',
  size: 'wide',
  dataSpec: { history: 'self', groups: 'self' },
  fallback: 'scalar-tile',
  render: renderVizTimeSeries,
});

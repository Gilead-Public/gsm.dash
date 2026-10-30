import { registerWidget } from './registry.js';
import { fmtMetric, fmtRate, fmtRateDiff, ndLine } from '../util/format.js';
import { flagDistribution } from '../data/rollup.js';
import { SEVERITY_ORDER } from '../scales/flags.js';
import { sparkline } from '../charts/sparkline.js';

// The default metric tile: headline rate, site flag distribution (counts
// always labeled — color is never the only encoding), study trend sparkline,
// neutral portfolio comparison.

function comparisonLine(metric, study, portfolio) {
  if (study?.Metric == null || portfolio?.Rate == null) return '';
  return `<div class="cmp">portfolio ${fmtRate(metric, portfolio.Rate)} · this study ${fmtRateDiff(metric, study.Metric, portfolio.Rate)}</div>`;
}

export function renderScalarTile(el, data) {
  const { metric, study, siteRows, trend, portfolio } = data;
  const f = flagDistribution(siteRows);
  const segs = SEVERITY_ORDER.filter((s) => f[s] > 0)
    .map((s) => `<i class="flag-${s}" style="flex:${f[s]}"></i>`)
    .join('');
  el.innerHTML = `
    <div><span class="big">${study ? fmtMetric(metric, { ...study, Rate: study.Metric }).html : '—'}</span>
      <span class="nd">${ndLine(metric, study)}</span></div>
    <div class="flags"><div class="fbar">${segs}</div>
      <span class="fcounts">${f.red}R·${f.amber}A·${f.green}G·${f.na}NA</span></div>
    <div class="spark-slot"></div>
    ${comparisonLine(metric, study, portfolio)}`;
  sparkline(el.querySelector('.spark-slot'), trend, { width: 180, height: 26, label: `${metric.Abbreviation} study trend` });
}

registerWidget({
  name: 'scalar-tile',
  label: 'Details',
  version: '0.1.0',
  dataSpec: { results: 'self' },
  render: renderScalarTile,
});

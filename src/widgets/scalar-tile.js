import { registerWidget } from './registry.js';
import { fmtMetric, ndLine } from '../util/format.js';
import { flagDistribution } from '../data/rollup.js';
import { SEVERITY_ORDER } from '../scales/flags.js';
import { sparkline } from '../charts/sparkline.js';

// The default metric tile: headline rate and study trend sparkline. With `flags` set, it also shows the site flag
// distribution (counts always labeled; colour is never the only encoding), which is hidden by default (#11).

function flagLine(siteRows) {
  const f = flagDistribution(siteRows);
  const segs = SEVERITY_ORDER.filter((s) => f[s] > 0)
    .map((s) => `<i class="flag-${s}" style="flex:${f[s]}"></i>`)
    .join('');
  return `<div class="flags"><div class="fbar">${segs}</div>
      <span class="fcounts">${f.red}R·${f.amber}A·${f.green}G·${f.na}NA</span></div>`;
}

export function renderScalarTile(el, data, config = {}) {
  const { metric, study, siteRows, trend } = data;
  el.innerHTML = `
    <div><span class="big">${study ? fmtMetric(metric, { ...study, Rate: study.Metric }).html : '—'}</span>
      <span class="nd">${ndLine(metric, study)}</span></div>
    ${config.flags ? flagLine(siteRows) : ''}
    <div class="spark-slot"></div>`;
  sparkline(el.querySelector('.spark-slot'), trend, { width: 180, height: 26, label: `${metric.Abbreviation} study trend` });
}

registerWidget({
  name: 'scalar-tile',
  label: 'Details',
  version: '0.1.0',
  dataSpec: { results: 'self' },
  render: renderScalarTile,
});

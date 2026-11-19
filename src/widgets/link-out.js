import { registerWidget } from './registry.js';
import { esc, fmtMetric, ndLine } from '../util/format.js';
import { sparkline } from '../charts/sparkline.js';

// v1 answer for shape-gap tiles: headline scalar + trend, with the depth living in a dedicated report ("More
// details", the deck's own affordance). The link is the metric's configured report link (#13); the label is a view
// option.

export function renderLinkOut(el, data, config = {}) {
  const { metric, study, trend, reportLink: href } = data;
  const { label = 'details' } = config;
  el.innerHTML = `
    <div><span class="big">${study ? fmtMetric(metric, { ...study, Rate: study.Metric }).html : '—'}</span>
      <span class="nd">${ndLine(metric, study)}</span></div>
    <div class="spark-slot"></div>
    ${href ? `<a class="more" href="${esc(href)}" target="_blank" rel="noopener">More details → ${esc(label)}</a>` : ''}`;
  sparkline(el.querySelector('.spark-slot'), trend, { width: 180, height: 26, label: `${metric.Abbreviation} study trend` });
}

registerWidget({
  name: 'link-out',
  label: 'Report link',
  version: '0.1.0',
  dataSpec: { results: 'self', external: true },
  appliesTo: (metric) => (metric.ReportLink != null ? null : 'no report link is configured for it'),
  render: renderLinkOut,
});

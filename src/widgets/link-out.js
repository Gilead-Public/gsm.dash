import { registerWidget } from './registry.js';
import { esc, fmtPct, fmtInt } from '../util/format.js';
import { sparkline } from '../charts/sparkline.js';

// v1 answer for shape-gap tiles: headline scalar + trend, with the depth
// living in a dedicated report ("More details" — the deck's own affordance).
// The href comes from metric metadata (meta.WidgetConfig), not widget code.

export function renderLinkOut(el, data, config = {}) {
  const { metric, study, trend } = data;
  const { href, label = 'details' } = config;
  el.innerHTML = `
    <div><span class="big">${fmtPct(study?.Metric)}</span>
      <span class="nd">${study ? `${fmtInt(study.Numerator)} / ${fmtInt(study.Denominator)}` : 'no data'}</span></div>
    <div class="spark-slot"></div>
    ${href ? `<a class="more" href="${esc(href)}" target="_blank" rel="noopener">More details → ${esc(label)}</a>` : ''}`;
  sparkline(el.querySelector('.spark-slot'), trend, { width: 180, height: 26, label: `${metric.Abbreviation} study trend` });
}

registerWidget({
  name: 'link-out',
  label: 'Report link',
  version: '0.1.0',
  dataSpec: { results: 'self', external: true },
  fallback: 'scalar-tile',
  render: renderLinkOut,
});

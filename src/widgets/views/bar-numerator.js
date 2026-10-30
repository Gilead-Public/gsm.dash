import { registerWidget } from '../registry.js';
import { esc, fmtInt, fmtRate } from '../../util/format.js';
import { svgOpen, svgClose, linear, sevClass, selClass, text, sortDesc } from '../../charts/mini.js';

// One bar per site (all sites), height = numerator, colored by flag.
export function renderBarNumerator(el, data) {
  const { metric, siteRows, selectedSite } = data;
  const rows = sortDesc(siteRows, 'Numerator');
  const W = 220, H = 110, L = 30, R = 6, T = 8, B = 16;
  const maxN = Math.max(1, ...rows.map((r) => r.Numerator));
  const y = linear([0, maxN], [H - B, T]);
  const gap = 2;
  const bw = Math.max(2, (W - L - R - gap * (rows.length - 1)) / Math.max(1, rows.length));
  const bars = rows
    .map((r, i) => {
      const x0 = L + i * (bw + gap);
      const y0 = y(r.Numerator);
      return `<rect data-site="${esc(r.GroupID)}" x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - B - y0).toFixed(1)}" rx="1.5" class="bar ${sevClass(r.Flag)}${selClass(r.GroupID, selectedSite)}"><title>${esc(r.GroupID)} · ${fmtInt(r.Numerator)} / ${fmtInt(r.Denominator)} = ${fmtRate(metric, r.Metric)} · flag ${r.Flag ?? 'NA'}</title></rect>`;
    })
    .join('');
  el.innerHTML = `
    <div class="sub-h">${esc(metric.Numerator ?? 'Numerator')} by site</div>
    ${svgOpen(W, H, `${metric.Abbreviation} numerator by site`)}
      <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" class="axis"/>
      ${text(L - 3, T + 4, fmtInt(maxN), { anchor: 'end' })}${text(L - 3, H - B, '0', { anchor: 'end' })}
      ${bars}
    ${svgClose()}
    <div class="cmp">${rows.length} sites, sorted by numerator · click a bar to track it</div>`;
}

registerWidget({
  name: 'bar-numerator',
  label: 'Numerator by site',
  version: '0.1.0',
  dataSpec: { results: 'self' },
  render: renderBarNumerator,
});

import { registerWidget } from '../registry.js';
import { esc, fmtInt, fmtRate } from '../../util/format.js';
import { svgOpen, svgClose, linear, sevClass, selClass, text } from '../../charts/mini.js';

// Numerator vs denominator, one point per site, colored by flag. The small
// cousin of the KRI scatter plot (no bounds envelope at this size).
export function renderScatterMini(el, data) {
  const { metric, siteRows, selectedSite } = data;
  const W = 220, H = 120, L = 30, R = 8, T = 8, B = 22;
  const maxD = Math.max(1, ...siteRows.map((r) => r.Denominator));
  const maxN = Math.max(1, ...siteRows.map((r) => r.Numerator));
  const x = linear([0, maxD], [L, W - R]);
  const y = linear([0, maxN], [H - B, T]);
  // Selected point last so it paints over its neighbours.
  const points = [...siteRows]
    .sort((a, b) => Number(a.GroupID === selectedSite) - Number(b.GroupID === selectedSite))
    .map(
      (r) => `<circle data-site="${esc(r.GroupID)}" cx="${x(r.Denominator).toFixed(1)}" cy="${y(r.Numerator).toFixed(1)}" r="${
        r.GroupID === selectedSite ? 5.5 : 3.5
      }" class="pt ${sevClass(r.Flag)}${selClass(r.GroupID, selectedSite)}"><title>${esc(r.GroupID)} · ${fmtInt(r.Numerator)} / ${fmtInt(r.Denominator)} = ${fmtRate(metric, r.Metric)} · flag ${r.Flag ?? 'NA'}</title></circle>`
    )
    .join('');
  el.innerHTML = `
    <div class="sub-h">Sites: numerator vs denominator</div>
    ${svgOpen(W, H, `${metric.Abbreviation} numerator vs denominator by site`)}
      <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" class="axis"/>
      <line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" class="axis"/>
      ${text(L, H - B + 12, '0')}${text(W - R, H - B + 12, fmtInt(maxD), { anchor: 'end' })}
      ${text(L - 3, T + 4, fmtInt(maxN), { anchor: 'end' })}${text(L - 3, H - B, '0', { anchor: 'end' })}
      ${text((L + W - R) / 2, H - 2, esc(metric.Denominator ?? 'denominator'), { anchor: 'middle', cls: 'lbl axis-title' })}
      ${points}
    ${svgClose()}
    <div class="cmp">y: ${esc(metric.Numerator ?? 'numerator')} · ${siteRows.length} sites · click a point to track it</div>`;
}

registerWidget({
  name: 'scatter-mini',
  label: 'Scatter (n vs d)',
  version: '0.1.0',
  dataSpec: { results: 'self' },
  render: renderScatterMini,
});

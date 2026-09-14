import { registerWidget } from '../registry.js';
import { esc, fmtPct } from '../../util/format.js';
import { svgOpen, svgClose, linear, text } from '../../charts/mini.js';

// Study rate (all sites pooled) at each snapshot — the trend with axes.
export function renderTrendMini(el, data) {
  const { metric, trend } = data;
  const pts = trend.filter((p) => p.rate != null);
  const W = 220, H = 110, L = 34, R = 10, T = 10, B = 20;
  const rates = pts.map((p) => p.rate);
  const lo = Math.min(...rates), hi = Math.max(...rates);
  const pad = (hi - lo || hi || 0.01) * 0.15;
  const y = linear([Math.max(0, lo - pad), hi + pad], [H - B, T]);
  const x = linear([0, Math.max(1, pts.length - 1)], [L, W - R]);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rate).toFixed(1)}`).join(' ');
  const dots = pts
    .map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.rate).toFixed(1)}" r="${i === pts.length - 1 ? 3.5 : 2.5}" class="trend-dot"><title>${esc(p.date)} · ${fmtPct(p.rate)}</title></circle>`)
    .join('');
  el.innerHTML = `
    <div class="sub-h">Study rate over time</div>
    ${pts.length < 2 ? '<div class="nd">Not enough snapshots for a trend</div>' : `${svgOpen(W, H, `${metric.Abbreviation} study rate by snapshot`)}
      <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" class="axis"/>
      <line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" class="axis"/>
      ${text(L - 3, T + 4, fmtPct(hi + pad), { anchor: 'end' })}${text(L - 3, H - B, fmtPct(Math.max(0, lo - pad)), { anchor: 'end' })}
      ${text(L, H - 4, pts[0].date.slice(0, 7))}${text(W - R, H - 4, pts[pts.length - 1].date.slice(0, 7), { anchor: 'end' })}
      <path d="${path}" class="trend-line"/>${dots}
    ${svgClose()}`}
    <div class="cmp">latest ${fmtPct(pts[pts.length - 1]?.rate)} · ${pts.length} snapshots · all sites pooled</div>`;
}

registerWidget({
  name: 'trend-mini',
  label: 'Trend over time',
  version: '0.1.0',
  dataSpec: { results: 'self' },
  render: renderTrendMini,
});

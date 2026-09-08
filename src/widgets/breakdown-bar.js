import { registerWidget } from './registry.js';
import { esc, fmtPct, fmtInt } from '../util/format.js';

// Categorical breakdown from the contract's `details` slice (Q8 option A:
// counts aggregated from Mapped-layer frames at export — e.g. ineligibility
// reasons from Mapped_EXCLUSION's Source attribution). Falls back to the
// scalar tile when the host can't supply `details`.

export function renderBreakdownBar(el, data) {
  const { metric, study, details = [] } = data;
  const sorted = [...details].sort((a, b) => b.Numerator - a.Numerator);
  const max = Math.max(1, ...sorted.map((d) => d.Numerator));
  const rows = sorted
    .map(
      (d) => `<div class="r"><span title="${esc(d.Category)}">${esc(d.Category)}</span>
        <div class="btrack"><div class="b" style="width:${((d.Numerator / max) * 100).toFixed(1)}%"></div></div>
        <span class="v">${fmtInt(d.Numerator)}</span></div>`
    )
    .join('');
  el.innerHTML = `
    <div class="trow"><span class="abbr">${esc(metric.Abbreviation)}</span><span class="name">${esc(metric.Metric)} — by source</span></div>
    <div><span class="big">${study ? fmtInt(study.Numerator) : '—'}</span>
      <span class="nd">${study ? `of ${fmtInt(study.Denominator)} · ${fmtPct(study.Metric)}` : 'no data'}</span></div>
    ${rows ? `<div class="hbar">${rows}</div>` : '<div class="nd">no detail rows in this snapshot</div>'}`;
}

registerWidget({
  name: 'breakdown-bar',
  version: '0.1.0',
  dataSpec: { results: 'self', details: 'self' },
  fallback: 'scalar-tile',
  render: renderBreakdownBar,
});

import { registerWidget } from '../registry.js';
import { esc, fmtPct, fmtInt } from '../../util/format.js';
import { flagSeverity } from '../../scales/flags.js';
import { sortDesc, selClass } from '../../charts/mini.js';

/** Flagged (red or amber) sites only, by rate descending — a pure, testable split. */
export function outlierSites(siteRows) {
  const flagged = siteRows.filter((r) => ['red', 'amber'].includes(flagSeverity(r.Flag)));
  return { outliers: sortDesc(flagged, 'Metric'), hidden: siteRows.length - flagged.length };
}

// Horizontal bars: rates for flagged sites; footnote how many unflagged sites are hidden.
export function renderBarOutliers(el, data) {
  const { metric, siteRows, study, selectedSite } = data;
  const { outliers, hidden } = outlierSites(siteRows);
  const maxRate = Math.max(study?.Metric ?? 0, ...outliers.map((r) => r.Metric ?? 0), 0.0001);
  const rows = outliers
    .slice(0, 8)
    .map(
      (r) => `<div class="r${selClass(r.GroupID, selectedSite)}" data-site="${esc(r.GroupID)}"><span class="mono" title="${esc(r.GroupID)}">${esc(r.GroupID)}</span>
        <div class="btrack"><div class="b flag-${flagSeverity(r.Flag)}" style="width:${(((r.Metric ?? 0) / maxRate) * 100).toFixed(1)}%"></div></div>
        <span class="v">${fmtPct(r.Metric)}</span></div>`
    )
    .join('');
  el.innerHTML = `
    <div class="sub-h">Outlier sites — rate</div>
    ${rows ? `<div class="hbar">${rows}</div>` : `<div class="nd">No flagged sites at this snapshot</div>`}
    <div class="cmp">${outliers.length > 8 ? `top 8 of ${outliers.length} flagged · ` : ''}${fmtInt(hidden)} non-flagged site${hidden === 1 ? '' : 's'} hidden · study rate ${fmtPct(study?.Metric)}</div>`;
}

registerWidget({
  name: 'bar-outliers',
  label: 'Outlier sites',
  version: '0.1.0',
  dataSpec: { results: 'self' },
  render: renderBarOutliers,
});

import { registerWidget } from './registry.js';
import { esc, fmtInt } from '../util/format.js';
import { flagSeverity } from '../scales/flags.js';

// Page-level derived widget (bound via the page spec, not metric metadata):
// sites flagged on >= N metrics at this study's latest snapshot. This is a
// DERIVATION widget under W3 — it thresholds counts of pipeline-computed
// flags but produces no new flags/scores — so the derivation is a pure,
// unit-tested export (W8 tier: unit tests, not just visual comparison).

/**
 * @param {Map<string, Array<{GroupID: string, Flag: (number|null)}>>} siteRowsByMetric
 * @param {Array<{MetricID: string, Abbreviation: string}>} metrics
 * @param {{threshold?: number}} options
 * @returns {Array<{GroupID: string, count: number, abbrs: string[]}>} sorted desc by count
 */
export function deriveWatchSites(siteRowsByMetric, metrics, { threshold = 2 } = {}) {
  const perSite = new Map();
  for (const m of metrics) {
    for (const row of siteRowsByMetric.get(m.MetricID) ?? []) {
      const sev = flagSeverity(row.Flag);
      if (sev !== 'red' && sev !== 'amber') continue;
      if (!perSite.has(row.GroupID)) perSite.set(row.GroupID, { GroupID: row.GroupID, count: 0, abbrs: [] });
      const entry = perSite.get(row.GroupID);
      entry.count += 1;
      entry.abbrs.push(m.Abbreviation);
    }
  }
  return [...perSite.values()]
    .filter((s) => s.count >= threshold)
    .sort((a, b) => b.count - a.count || a.GroupID.localeCompare(b.GroupID));
}

export function renderThresholdList(el, data, config = {}) {
  const threshold = config.threshold ?? 2;
  const sites = deriveWatchSites(data.siteRowsByMetric, data.metrics, { threshold });
  const rows = sites
    .slice(0, config.limit ?? 6)
    .map(
      (s) => `<tr><td class="mono">${esc(s.GroupID)}</td>
        <td title="${esc(s.abbrs.join(', '))}">${fmtInt(s.count)} flagged metrics</td></tr>`
    )
    .join('');
  el.innerHTML = `
    <div class="trow"><span class="abbr">WS</span><span class="name">Watch sites — flagged on ≥${threshold} metrics</span></div>
    ${rows ? `<table class="minitbl">${rows}</table>` : '<div class="nd">No sites over threshold at this snapshot</div>'}
    <div class="cmp">derived client-side from site-level results</div>`;
}

registerWidget({
  name: 'threshold-list',
  label: 'Watch sites',
  version: '0.1.0',
  dataSpec: { results: 'all-site' },
  render: renderThresholdList,
});

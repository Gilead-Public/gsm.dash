// @ts-check
import { registerWidget } from './registry.js';
import { fmtPct } from '../util/format.js';
import { flagDistribution } from '../data/rollup.js';

// The compact standard-KRI widget (#32): how the study's sites are flagged at the visit shown.

const FLAGS = /** @type {const} */ ([
  ['red', 'Red'],
  ['amber', 'Amber'],
  ['green', 'Green'],
  ['na', 'No flag'],
]);

/**
 * How the metric's sites are flagged; every percentage is out of all its sites, those without a flag included. The
 * card's header carries the rate and n / N (#32).
 * @param {Array<{ Flag: number | null }>} siteRows
 */
export function kriFlags(siteRows) {
  const f = flagDistribution(siteRows ?? []);
  return FLAGS.map(([key, label]) => ({ key, label, count: f[key], percent: f.total > 0 ? fmtPct(f[key] / f.total) : '—' }));
}

export function renderKriSummary(el, data) {
  const flags = kriFlags(data.siteRows)
    .map((f) => `<li data-flag="${f.key}"><i class="flag-${f.key}" aria-hidden="true"></i><span class="lbl">${f.label}</span><span class="v">${f.count}</span><span class="p">${f.percent}</span></li>`)
    .join('');
  el.innerHTML = `<div class="kri"><ul class="kri-flags" aria-label="Sites by flag">${flags}</ul></div>`;
}

registerWidget({
  name: 'kri-summary',
  label: 'Summary',
  version: '0.1.0',
  dataSpec: { results: 'self' },
  render: renderKriSummary,
});

// @ts-check
import { registerWidget } from './registry.js';
import { esc, fmtPct } from '../util/format.js';
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

/**
 * The same flags as one stacked bar, each segment as wide as its share of the sites, for a combined KRI card (an Admin
 * demo setting), with a line under it giving each flag's share and count: No flag only when some site has none.
 */
export function renderKriFlagBar(el, data) {
  const flags = kriFlags(data.siteRows);
  const total = flags.reduce((sum, f) => sum + f.count, 0);
  const segments = flags
    .filter((f) => f.count > 0)
    .map((f) => `<i class="flag-${f.key}" data-flag="${f.key}" data-count="${f.count}" style="flex-grow: ${f.count}" data-tip="${esc(`<b>${f.label}</b>: ${f.count} of ${total} sites (${f.percent})`)}"></i>`)
    .join('');
  const key = flags
    .filter((f) => f.key !== 'na' || f.count > 0)
    .map((f) => `<li data-flag="${f.key}"><i class="flag-${f.key}" aria-hidden="true"></i>${f.label} <span class="v">${f.percent} (${f.count})</span></li>`)
    .join('');
  el.innerHTML = `<div class="flag-bar" aria-hidden="true">${segments}</div><ul class="flag-key" aria-label="Sites by flag">${key}</ul>`;
}

registerWidget({
  name: 'kri-flag-bar',
  label: 'Flag bar',
  version: '0.1.0',
  dataSpec: { results: 'self' },
  render: renderKriFlagBar,
});

registerWidget({
  name: 'kri-summary',
  label: 'Summary',
  version: '0.1.0',
  dataSpec: { results: 'self' },
  render: renderKriSummary,
});

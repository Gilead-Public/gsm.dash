// @ts-check
import { registerWidget } from './registry.js';
import { DAYS_PER_MONTH, esc, fmtInt, fmtPct, fmtRate } from '../util/format.js';
import { flagDistribution } from '../data/rollup.js';
import { kriSettings } from '../app/kri-groups.js';

// The compact standard-KRI widget (#32): the study's rate, n / N and how its sites are flagged, for the visit shown.

const FLAGS = /** @type {const} */ ([
  ['red', 'Red'],
  ['amber', 'Amber'],
  ['green', 'Green'],
  ['na', 'No flag'],
]);

const periods = (/** @type {number} */ days) => (days / DAYS_PER_MONTH).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * What the widget shows. A rate per 28 days is n ÷ exposure days × 28 and its N is exposure days ÷ 28, both from the
 * unrounded sums; every flag percentage is out of all the metric's sites, those without a flag included.
 * @param {any} metric
 * @param {{ Numerator: number, Denominator: number, Metric: number | null } | null} study the pooled site rows
 * @param {Array<{ Flag: number | null }>} siteRows
 */
export function kriSummary(metric, study, siteRows) {
  const per28 = metric?.Display === 'per_28d';
  const f = flagDistribution(siteRows ?? []);
  return {
    rate: study ? fmtRate(metric, study.Metric) : '—',
    unit: per28 ? kriSettings(metric).unit : null,
    n: study ? fmtInt(study.Numerator) : '—',
    N: study ? (per28 ? periods(study.Denominator) : fmtInt(study.Denominator)) : '—',
    flags: FLAGS.map(([key, label]) => ({ key, label, count: f[key], percent: f.total > 0 ? fmtPct(f[key] / f.total) : '—' })),
  };
}

export function renderKriSummary(el, data) {
  const s = kriSummary(data.metric, data.study, data.siteRows);
  const flags = s.flags
    .map((f) => `<li data-flag="${f.key}"><i class="flag-${f.key}" aria-hidden="true"></i><span class="lbl">${f.label}</span><span class="v">${f.count}</span><span class="p">${f.percent}</span></li>`)
    .join('');
  el.innerHTML = `<div class="kri">
    <div class="kri-rate"><span class="big">${esc(s.rate)}</span>${s.unit ? `<span class="unit">${esc(s.unit)}</span>` : ''}</div>
    <div class="kri-nd">${s.n} / ${s.N}</div>
    <ul class="kri-flags" aria-label="Sites by flag">${flags}</ul>
  </div>`;
}

registerWidget({
  name: 'kri-summary',
  label: 'Summary',
  version: '0.1.0',
  dataSpec: { results: 'self' },
  render: renderKriSummary,
});

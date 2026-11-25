// @ts-check
import { DAYS_PER_MONTH, esc, fmtInt, fmtRate } from '../util/format.js';
import { kriSettings } from './kri-groups.js';

const periods = (/** @type {number} */ days) => (days / DAYS_PER_MONTH).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * A card header's value and n / N (#32), from the study's pooled site rows at its latest snapshot (#48). Per 28 days, the rate is
 * n ÷ exposure days × 28 and N is exposure days ÷ 28, both from the unrounded sums.
 * @param {any} metric
 * @param {{ Numerator: number, Denominator: number, Metric: number | null } | null} study
 */
export function cardValue(metric, study) {
  const per28 = metric?.Display === 'per_28d';
  return {
    rate: study ? fmtRate(metric, study.Metric) : '—',
    unit: unitOf(metric),
    n: study ? fmtInt(study.Numerator) : '—',
    N: study ? (per28 ? periods(study.Denominator) : fmtInt(study.Denominator)) : '—',
  };
}

/**
 * The header value's hover (#48): n and N, each beside the catalog's label for what it counts, N in the unit the header
 * shows. Per 28 days, N is 28-day periods of exposure, so it is never named in days; the exposure days follow it.
 * @param {any} metric
 * @param {{ Numerator: number, Denominator: number, Metric: number | null } | null} study
 */
export function cardValueTip(metric, study) {
  if (!study) return null;
  const v = cardValue(metric, study);
  const denominator = metric?.Display === 'per_28d' ? `28-day periods of exposure (${fmtInt(study.Denominator)} exposure days)` : (metric?.Denominator ?? '');
  return `<b>${esc(v.unit ? `${v.rate} ${v.unit}` : v.rate)}</b><br>${esc(v.n)} · ${esc(metric?.Numerator ?? '')}<br>${esc(v.N)} · ${esc(denominator)}`;
}

/**
 * A rate as the header writes it, unit included: "0.86 per 28 days", "3.7%".
 * @param {any} metric
 * @param {number | null} rate
 */
export function cardRate(metric, rate) {
  const unit = unitOf(metric);
  return unit ? `${fmtRate(metric, rate)} ${unit}` : fmtRate(metric, rate);
}

/**
 * The unit after a rate per 28 days, from configuration; none for a proportion.
 * @param {any} metric
 */
const unitOf = (metric) => (metric?.Display === 'per_28d' ? kriSettings(metric).unit : null);

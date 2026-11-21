// @ts-check
import { DAYS_PER_MONTH, fmtInt, fmtRate } from '../util/format.js';
import { kriSettings } from './kri-groups.js';

const periods = (/** @type {number} */ days) => (days / DAYS_PER_MONTH).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * A card header's value and n / N (#32), from the study's pooled site rows at the visit shown. Per 28 days, the rate is
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

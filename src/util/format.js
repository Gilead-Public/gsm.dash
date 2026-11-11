// Environment-free formatting helpers, shared by widgets and components.
export const esc = (value) =>
  String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const fmtPct = (rate, digits = 1) => (rate == null ? '—' : `${(rate * 100).toFixed(digits)}%`);

export const fmtInt = (value) => (value == null ? '—' : Number(value).toLocaleString('en-US'));

// --- metric display rules (glossary `Display`) ---------------------------------
// The rule is a formatting instruction only: rates are computed (and flagged)
// upstream as Σn / Σd, and the 28-day rescale is a constant factor, so sort
// order and heatmap bins never depend on it.

export const DAYS_PER_MONTH = 28;

const POPULATION_SHORT = { Enrolled: 'enr.', Dosed: 'dosed', Screened: 'scr.' };

/** The rate as the glossary displays it: per 28 days for exposure metrics, else the raw proportion. */
export function displayRate(metric, rate) {
  if (rate == null) return null;
  return metric?.Display === 'per_28d' ? rate * DAYS_PER_MONTH : rate;
}

/** One-number form of a metric's rate: "1.15" (per 28 d) or "12.4%". */
export function fmtRate(metric, rate) {
  if (rate == null) return '—';
  return metric?.Display === 'per_28d' ? displayRate(metric, rate).toFixed(2) : fmtPct(rate);
}

/** Short unit line for headers: "n (% enr.)", "/ 28 d", "% scr.", "%". */
export function metricUnit(metric) {
  const pop = POPULATION_SHORT[metric?.Population];
  switch (metric?.Display) {
    case 'count_pct':
      return pop ? `n (% ${pop})` : 'n (%)';
    case 'per_28d':
      return `/ ${DAYS_PER_MONTH} d`;
    default:
      return pop ? `% ${pop}` : '%';
  }
}

/** Long form of the display rule, for tooltips and the glossary. */
export function displayLabel(metric) {
  switch (metric?.Display) {
    case 'count_pct':
      return `count (% of ${(metric.Denominator ?? 'denominator').toLowerCase()})`;
    case 'per_28d':
      return `events per ${DAYS_PER_MONTH} days of exposure (n ÷ d × ${DAYS_PER_MONTH})`;
    default:
      return 'percent (n ÷ d)';
  }
}

/**
 * A rollup ({Numerator, Denominator, Rate}) rendered by the metric's display
 * rule. `html` carries markup for the secondary percent; `text` is plain.
 */
export function fmtMetric(metric, { Numerator, Denominator, Rate } = {}) {
  const rate = Rate ?? (Denominator ? Numerator / Denominator : null);
  if (rate == null) return { html: '<span class="muted">—</span>', text: '—' };
  if (metric?.Display === 'count_pct') {
    return { html: `${fmtInt(Numerator)}<span class="pc"> (${fmtPct(rate)})</span>`, text: `${fmtInt(Numerator)} (${fmtPct(rate)})` };
  }
  const text = fmtRate(metric, rate);
  return { html: text, text };
}

/** The small n / d line beside a headline: "of 988 enrolled" when the headline already carries the count. */
export function ndLine(metric, row) {
  if (!row) return 'no data';
  if (metric?.Display === 'count_pct') return `of ${fmtInt(row.Denominator)}${metric.Population ? ` ${metric.Population.toLowerCase()}` : ''}`;
  if (metric?.Display === 'per_28d') return `${fmtInt(row.Numerator)} in ${fmtInt(row.Denominator)} days`;
  return `${fmtInt(row.Numerator)} / ${fmtInt(row.Denominator)}`;
}

/** Difference between two rates in the metric's display unit: "+1.2 pt" or "−0.08 / 28 d". */
export function fmtRateDiff(metric, a, b) {
  if (a == null || b == null) return '';
  const diff = displayRate(metric, a) - displayRate(metric, b);
  const sign = diff >= 0 ? '+' : '−';
  return metric?.Display === 'per_28d'
    ? `${sign}${Math.abs(diff).toFixed(2)} / ${DAYS_PER_MONTH} d`
    : `${sign}${Math.abs(diff * 100).toFixed(1)} pt`;
}

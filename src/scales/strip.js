// Strip-plot scale for the program page's Distribution view. Environment-free.

/** Axis end label in the metric's display unit, with enough digits for small values. */
export function axisLabel(metric, value) {
  if (value == null) return '—';
  if (metric?.Display === 'per_28d') return value.toFixed(value < 0.1 ? 3 : 2);
  const pct = value * 100;
  return `${pct.toFixed(pct < 1 ? 2 : 1)}%`;
}

/**
 * Strip-plot geometry for one metric: each study's display value as a
 * percentage position on a 0 → max × 1.08 scale, plus the portfolio value.
 * Studies with no rate are left off the line rather than drawn at zero.
 */
export function stripScale(values, portfolio) {
  const finite = [...values, portfolio].filter((v) => v != null && Number.isFinite(v));
  const max = (finite.length ? Math.max(...finite) : 0) * 1.08 || 1;
  return { max, x: (v) => (v == null ? null : Math.min(100, Math.max(0, (v / max) * 100))) };
}

// The single flag scale for all of gsm.dash (the prototypes shipped three
// inconsistent ones). Colors live in CSS custom properties; JS deals only in
// class names so themes stay a stylesheet concern.

/** @param {(number|null)} flag @returns {'red'|'amber'|'green'|'na'} */
export function flagSeverity(flag) {
  if (flag == null) return 'na';
  if (Math.abs(flag) >= 2) return 'red';
  if (Math.abs(flag) >= 1) return 'amber';
  return 'green';
}

/** Absolute bins for flag-share measures (% Red, % Amber). Bins are deliberate, not a continuous ramp. */
export function shareBin(share) {
  if (share == null || share <= 0) return '';
  if (share <= 0.1) return 'hot1';
  if (share <= 0.25) return 'hot2';
  if (share <= 0.5) return 'hot3';
  return 'hot4';
}

/**
 * Column-relative bins for measures whose range differs per metric
 * (numerator, denominator, rate): position within [min, max] of the visible
 * rows in that column, in four steps. A column with no spread gets no shading.
 */
export function relativeBin(value, { min, max }) {
  if (value == null || !(max > min)) return '';
  const t = (value - min) / (max - min);
  if (t <= 0.25) return 'hot1';
  if (t <= 0.5) return 'hot2';
  if (t <= 0.75) return 'hot3';
  return 'hot4';
}

/** The value a heatmap measure reads off a rollup. */
export function heatValue(measure, rollup) {
  switch (measure) {
    case 'num': return rollup.Numerator;
    case 'den': return rollup.Denominator;
    case 'rate': return rollup.Rate;
    case 'flagged': return rollup.flags.total ? (rollup.flags.red + rollup.flags.amber) / rollup.flags.total : null;
    case 'red': return rollup.flags.total ? rollup.flags.red / rollup.flags.total : null;
    default: return null;
  }
}

export const RELATIVE_MEASURES = new Set(['num', 'den', 'rate']);

export const SEVERITY_ORDER = ['red', 'amber', 'green', 'na'];

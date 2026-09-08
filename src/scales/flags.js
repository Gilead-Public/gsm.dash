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

/** Binned flag-share heatmap class (D3 default mode). Bins are deliberate, not a continuous ramp. */
export function shareBin(share) {
  if (share <= 0) return '';
  if (share <= 0.1) return 'hot1';
  if (share <= 0.25) return 'hot2';
  if (share <= 0.5) return 'hot3';
  return 'hot4';
}

export const SEVERITY_ORDER = ['red', 'amber', 'green', 'na'];

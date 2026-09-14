// Small-format SVG chart helpers for the standard tile views. Deliberately
// tiny and dependency-free; the long-term home for these views is gsm.viz.
import { esc } from '../util/format.js';
import { flagSeverity } from '../scales/flags.js';

export const svgOpen = (w, h, label) =>
  `<svg class="mini" width="100%" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" preserveAspectRatio="xMidYMid meet">`;
export const svgClose = () => '</svg>';

/** Linear scale over [d0, d1] -> [r0, r1]; degenerate domains map to the midpoint. */
export function linear([d0, d1], [r0, r1]) {
  return (v) => (d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) * (r1 - r0)) / (d1 - d0));
}

export const sevClass = (flag) => `svg-flag-${flagSeverity(flag)}`;

/**
 * Cross-chart site highlight: the selected site's mark gets `is-sel`, every
 * other mark gets `is-dim`. Returns '' when nothing is selected, so the
 * default appearance is untouched rather than "everything is dimmed by 0%".
 */
export const selClass = (groupId, selectedSite) =>
  !selectedSite ? '' : ` ${groupId === selectedSite ? 'is-sel' : 'is-dim'}`;

export function text(x, y, str, opts = {}) {
  const { anchor = 'start', cls = 'lbl', dy = 0 } = opts;
  return `<text x="${x}" y="${y}" dy="${dy}" text-anchor="${anchor}" class="${cls}">${esc(str)}</text>`;
}

/** Sort a copy of site rows by a numeric key, descending, nulls last. */
export function sortDesc(rows, key) {
  return [...rows].sort((a, b) => (b[key] ?? -Infinity) - (a[key] ?? -Infinity));
}

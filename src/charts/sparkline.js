import { esc } from '../util/format.js';

// Trend sparkline (D5): mini line + area + emphasized endpoint, neutral
// styling — KRI flags are two-sided, so trends never color good/bad.
//
// SEAM: gsm.viz exports an unused `sparkline(element, results, config,
// thresholds)` renderer (Chart.js). Once @gilead-biostats/gsm.viz ships as an
// ESM package (design doc §7), this module becomes a thin adapter around it;
// the signature below is kept compatible on purpose.

/**
 * @param {HTMLElement} element container; replaced content
 * @param {Array<{date: string, rate: (number|null)}>} points
 * @param {{width?: number, height?: number, label?: string, format?: (rate: number) => string, gaps?: boolean}} config
 *   `format` writes the latest value in the label; a percentage by default. Without `gaps` the points that have a value
 *   are spaced evenly and joined. With `gaps` every point keeps its place: one without a value breaks the line, a
 *   value with no neighbouring value is a dot, and the label counts every point, says how many have no value and gives
 *   the last one's ("—" when it has none). Under two values it shows "—".
 */
export function sparkline(element, points, config = {}) {
  const { width = 96, height = 26, label = 'trend', format = (rate) => `${(rate * 100).toFixed(1)}%`, gaps = false } = config;
  const values = points.filter((p) => p.rate != null);
  if (values.length < 2) {
    element.textContent = '—';
    return;
  }
  const slots = gaps ? points : values;
  const rates = values.map((p) => p.rate);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const pad = 3;
  const x = (i) => (pad + (i * (width - 2 * pad)) / (slots.length - 1)).toFixed(1);
  const y = (i) => (max === min ? height / 2 : height - pad - ((slots[i].rate - min) * (height - 2 * pad)) / (max - min)).toFixed(1);
  /** @type {number[][]} */
  const runs = [[]];
  slots.forEach((p, i) => (p.rate == null ? runs.push([]) : runs[runs.length - 1].push(i)));
  const lines = runs.filter((r) => r.length > 1);
  const path = (r) => r.map((i, k) => `${k ? 'L' : 'M'}${x(i)},${y(i)}`).join(' ');
  const line = lines.map(path).join(' ');
  const area = lines.map((r) => `${path(r)} L${x(r[r.length - 1])},${height - 1} L${x(r[0])},${height - 1} Z`).join(' ');
  const end = slots.length - 1;
  const alone = runs.filter((r) => r.length === 1 && r[0] !== end).map(([i]) => `<circle cx="${x(i)}" cy="${y(i)}" r="1.8" class="spark-point"></circle>`);
  const latest = slots[end].rate;
  const missing = points.length - values.length;
  const text = gaps
    ? `${label}: ${points.length} snapshots${missing ? `, ${missing} without a value` : ''}, latest ${latest == null ? '—' : format(latest)}`
    : `${label}: ${values.length} snapshots, latest ${format(latest)}`;
  element.innerHTML =
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(text)}">` +
    (line ? `<path d="${area}" class="spark-area"></path><path d="${line}" class="spark-line"></path>` : '') +
    alone.join('') +
    (latest == null ? '' : `<circle cx="${x(end)}" cy="${y(end)}" r="2.6" class="spark-dot"></circle>`) +
    `</svg>`;
}

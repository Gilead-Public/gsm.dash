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
 * @param {{width?: number, height?: number, label?: string}} config
 */
export function sparkline(element, points, config = {}) {
  const { width = 96, height = 26, label = 'trend' } = config;
  const values = points.filter((p) => p.rate != null);
  if (values.length < 2) {
    element.textContent = '—';
    return;
  }
  const rates = values.map((p) => p.rate);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const pad = 3;
  const x = (i) => pad + (i * (width - 2 * pad)) / (values.length - 1);
  const y = (v) => (max === min ? height / 2 : height - pad - ((v - min) * (height - 2 * pad)) / (max - min));
  const line = values.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.rate).toFixed(1)}`).join(' ');
  const area = `${line} L${x(values.length - 1).toFixed(1)},${height - 1} L${x(0).toFixed(1)},${height - 1} Z`;
  const last = values[values.length - 1];
  element.innerHTML =
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" ` +
    `aria-label="${label}: ${values.length} snapshots, latest ${(last.rate * 100).toFixed(1)}%">` +
    `<path d="${area}" class="spark-area"></path>` +
    `<path d="${line}" class="spark-line"></path>` +
    `<circle cx="${x(values.length - 1).toFixed(1)}" cy="${y(last.rate).toFixed(1)}" r="2.6" class="spark-dot"></circle>` +
    `</svg>`;
}

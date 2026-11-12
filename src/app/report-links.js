// @ts-check
// Detailed-report links (#13): a metric's path from the catalog, resolved against the manifest's base, which is
// itself resolved against the page. A relative base or path therefore works wherever the reports are hosted.
import { esc } from '../util/format.js';

/**
 * @param {any} metric
 * @param {string | null | undefined} base
 * @param {string} page The page's own URL.
 * @returns {string | null} The link, or null when the metric has none or it can't be resolved.
 */
export function reportLink(metric, base, page) {
  if (metric?.ReportLink == null) return null;
  try {
    return new URL(metric.ReportLink, new URL(base ?? './', page)).href;
  } catch {
    return null;
  }
}

/** @param {string | null} href */
export const reportLinkHtml = (href) =>
  href ? `<a class="report-link" href="${esc(href)}" target="_blank" rel="noopener">Detailed report ↗</a>` : '';

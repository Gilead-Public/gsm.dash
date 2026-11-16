// @ts-check
// Detailed-report links (#13): a metric's path from the catalog, resolved against the manifest's base, which is
// itself resolved against the page. A relative base or path therefore works wherever the reports are hosted.
import { esc } from '../util/format.js';

/**
 * @param {any} metric
 * @param {string | null | undefined} base
 * @param {string} page The page's own URL.
 * @returns {string | null} The link, or null when the metric has none, it can't be resolved, or its scheme isn't allowed.
 */
export function reportLink(metric, base, page) {
  const url = resolve(metric, base, page);
  return url && SCHEMES.has(url.protocol) ? url.href : null;
}

const SCHEMES = new Set(['http:', 'https:', 'file:']);

/** @returns {URL | null} */
function resolve(metric, base, page) {
  if (metric?.ReportLink == null) return null;
  try {
    return new URL(metric.ReportLink, new URL(base ?? './', page));
  } catch {
    return null;
  }
}

/**
 * Why a metric's configured link isn't shown, or null when it is (or none is configured).
 * @param {any} metric
 * @param {string | null | undefined} base
 * @param {string} page
 * @returns {string | null}
 */
export function reportLinkProblem(metric, base, page) {
  if (metric?.ReportLink == null) return null;
  const url = resolve(metric, base, page);
  if (!url) return `it can't be resolved against the report base "${base ?? './'}"`;
  return SCHEMES.has(url.protocol) ? null : `its scheme "${url.protocol}" isn't allowed; links must be http, https or file`;
}

/** @param {string | null} href */
export const reportLinkHtml = (href) =>
  href ? `<a class="report-link" href="${esc(href)}" target="_blank" rel="noopener">Detailed report ↗</a>` : '';

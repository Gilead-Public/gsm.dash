// @ts-check
// Unknown and inapplicable references fail visibly (#12): no widget is swapped for another. Shared by both study
// page hosts, so the wording and the rules are the same in each.
import { DISTRIBUTION_CONFIG } from '../config/distributions.js';
import { STUDY_VIEW_CONFIG } from '../config/study-views.js';
import { esc } from '../util/format.js';
import { reportLink } from './report-links.js';
import { getWidget, resolveWidget } from '../widgets/registry.js';
import { DETAIL_TABS, EXEC_ALLOW_LIST, STUDY_PAGE_SPEC } from './study-page-spec.js';

/** @typedef {{ reference: string, reason: string }} Problem */

/** @param {Problem} problem */
export const problemText = (problem) => `${problem.reference}: ${problem.reason}.`;

const warned = new Set();

/**
 * Logs each problem once per page, however often the page re-renders.
 * @param {Problem} problem
 */
function warn(problem) {
  const text = problemText(problem);
  if (warned.has(text)) return;
  warned.add(text);
  console.warn(`[gsm.dash] ${text}`);
}

/**
 * A view in a tile or the drill-in panel: the widget to render, or the problem to show in its place.
 * @param {string} name
 * @param {any} [metric]
 * @param {object} [config]
 * @returns {{ def: any, problem: null } | { def: null, problem: Problem }}
 */
export function resolveView(name, metric, config) {
  const { def, reason } = resolveWidget(name, EXEC_ALLOW_LIST, metric, config);
  if (def || reason === null) return { def, problem: null };
  const problem = { reference: metric ? `Widget "${name}" for ${metric.Abbreviation} (${metric.MetricID})` : `Widget "${name}"`, reason };
  warn(problem);
  return { def: null, problem };
}

/**
 * References in configuration that no tile can show: metric IDs the catalog doesn't have, and view options for
 * widgets that don't exist. Metric views are checked where a tile shows them. The built-in page widgets and drill-in
 * tabs are code, not runtime configuration, so they are checked here too: a misspelt one fails the shipped-
 * configuration unit test before it can ship.
 * @param {any[]} catalog Every catalog metric, shown or not.
 * @param {{ breakdowns?: Record<string, unknown>, studies?: Record<string, { configs?: Record<string, unknown> }>, pageWidgets?: Array<{ widget: string }>, detailTabs?: Array<{ widget: string }>, reportBase?: string | null, page?: string }} [sources]
 * @returns {Problem[]}
 */
export function configProblems(
  catalog,
  {
    breakdowns = DISTRIBUTION_CONFIG,
    studies = STUDY_VIEW_CONFIG,
    pageWidgets = STUDY_PAGE_SPEC.pageWidgets,
    detailTabs = DETAIL_TABS,
    reportBase = null,
    page = globalThis.location?.href ?? '',
  } = {},
) {
  const ids = new Set(catalog.flatMap((m) => [m.ID, m.MetricID]));
  /** @type {Problem[]} */
  const problems = [];
  for (const id of Object.keys(breakdowns)) {
    if (!ids.has(id)) problems.push({ reference: `Metric "${id}" in the breakdown configuration`, reason: 'it is not in the metric catalog' });
  }
  for (const m of catalog) {
    for (const name of Object.keys(m.WidgetConfigs ?? {})) {
      if (!getWidget(name)) problems.push({ reference: `Widget "${name}" in the view options of ${m.Abbreviation} (${m.MetricID})`, reason: 'it is not a registered widget' });
    }
  }
  for (const [studyId, study] of Object.entries(studies)) {
    for (const name of Object.keys(study.configs ?? {})) {
      if (!getWidget(name)) problems.push({ reference: `Widget "${name}" in the view options of study ${studyId}`, reason: 'it is not a registered widget' });
    }
  }
  for (const m of catalog) {
    if (m.ReportLink != null && !reportLink(m, reportBase, page)) {
      problems.push({ reference: `Report link "${m.ReportLink}" for ${m.Abbreviation} (${m.MetricID})`, reason: `it can't be resolved against the report base "${reportBase ?? './'}"` });
    }
  }
  for (const { widget } of pageWidgets) {
    if (!getWidget(widget)) problems.push({ reference: `Widget "${widget}" in the study page layout`, reason: 'it is not a registered widget' });
  }
  for (const { widget } of detailTabs) {
    if (!getWidget(widget)) problems.push({ reference: `Widget "${widget}" in the drill-in tabs`, reason: 'it is not a registered widget' });
  }
  for (const problem of problems) warn(problem);
  return problems;
}

/** @param {Problem} problem */
export const problemHtml = (problem) => `<div class="ref-problem" role="note"><b>Can't show this view.</b> ${esc(problemText(problem))}</div>`;

/** @param {Problem[]} problems */
export const noticeHtml = (problems) =>
  problems.length
    ? `<div class="config-notice" role="status"><b>Configuration problems</b><ul>${problems.map((p) => `<li>${esc(problemText(p))}</li>`).join('')}</ul></div>`
    : '';

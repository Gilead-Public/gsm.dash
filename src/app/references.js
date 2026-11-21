// @ts-check
// Unknown and inapplicable references fail visibly (#12): no widget is swapped for another. Shared by both study
// page hosts, so the wording and the rules are the same in each.
import { DISTRIBUTION_CONFIG } from '../config/distributions.js';
import { STUDY_CARDS } from '../config/study-cards.js';
import { esc } from '../util/format.js';
import { reportLinkProblem } from './report-links.js';
import { KRI_GROUPS } from '../config/kri-groups.js';
import { getWidget, resolveWidget } from '../widgets/registry.js';
import { DETAIL_TABS, EXEC_ALLOW_LIST } from './study-page-spec.js';

/** @typedef {{ reference: string, reason: string }} Problem */

/** @param {Problem} problem */
export const problemText = (problem) => `${problem.reference}: ${problem.reason}.`;

const warned = new Set();

/**
 * Logs each problem once per page, however often the page re-renders.
 * @param {Problem} problem
 */
export function warnOnce(problem) {
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
  warnOnce(problem);
  return { def: null, problem };
}

/** The tile views the pager offered (#35): a catalog entry that still names one is listed in the notice (#12). */
export const RETIRED_VIEWS = ['scalar-tile', 'trend-mini', 'flag-dist', 'bar-outliers', 'link-out'];

/**
 * References in configuration that no card can show: metric IDs the catalog doesn't have, view options for widgets
 * that don't exist, and the catalog inputs the tile pager used (#35). A card's own references are checked where the
 * card shows them. The built-in page widgets and drill-in tabs are code, not runtime configuration, so they are
 * checked here too: a misspelt one fails the shipped-configuration unit test before it can ship.
 * @param {any[]} catalog Every catalog metric, shown or not.
 * @param {{ breakdowns?: Record<string, unknown>, cards?: Array<{ metric: string, title?: string }>, detailTabs?: Array<{ widget: string }>, kriGroups?: Array<{ id: string, label: string, metrics: string[] }>, reportBase?: string | null, page?: string, studyId?: string }} [sources] `studyId` fills the `{StudyID}` in report links.
 * @returns {Problem[]}
 */
export function configProblems(
  catalog,
  {
    breakdowns = DISTRIBUTION_CONFIG,
    cards = STUDY_CARDS,
    detailTabs = DETAIL_TABS,
    kriGroups = KRI_GROUPS,
    reportBase = null,
    page = globalThis.location?.href ?? '',
    studyId = '',
  } = {},
) {
  const ids = new Set(catalog.flatMap((m) => [m.ID, m.MetricID]));
  /** @type {Problem[]} */
  const problems = [];
  for (const id of Object.keys(breakdowns)) {
    if (!ids.has(id)) problems.push({ reference: `Metric "${id}" in the breakdown configuration`, reason: 'it is not in the metric catalog' });
  }
  for (const card of cards) {
    if (!ids.has(card.metric)) problems.push({ reference: `Metric "${card.metric}" in the study page's card list`, reason: 'it is not in the metric catalog' });
  }
  for (const m of catalog) {
    if (m.Widget == null || RETIRED_VIEWS.includes(m.Widget)) continue;
    const { reason } = resolveWidget(m.Widget, EXEC_ALLOW_LIST, m, m.WidgetConfigs?.[m.Widget] ?? m.WidgetConfig ?? {});
    if (reason) problems.push({ reference: `Widget "${m.Widget}" in the catalog entry of ${m.Abbreviation} (${m.MetricID})`, reason });
  }
  for (const m of catalog) {
    for (const name of Object.keys(m.WidgetConfigs ?? {})) {
      if (!getWidget(name) && !RETIRED_VIEWS.includes(name)) problems.push({ reference: `Widget "${name}" in the view options of ${m.Abbreviation} (${m.MetricID})`, reason: 'it is not a registered widget' });
    }
  }
  problems.push(...retiredInputs(catalog));
  for (const m of catalog) {
    const reason = reportLinkProblem(m, reportBase, page, studyId);
    if (reason) problems.push({ reference: `Report link "${m.ReportLink}" for ${m.Abbreviation} (${m.MetricID})`, reason });
  }
  for (const g of kriGroups) {
    for (const id of g.metrics) {
      if (!ids.has(id)) problems.push({ reference: `Metric "${id}" in the KRI group "${g.label}"`, reason: 'it is not in the metric catalog' });
    }
  }
  const groupIds = new Set(kriGroups.map((g) => g.id));
  for (const m of catalog) {
    const group = m.WidgetConfigs?.['kri-summary']?.group;
    if (group != null && !groupIds.has(group)) {
      problems.push({ reference: `KRI group "${group}" in the view options of ${m.Abbreviation} (${m.MetricID})`, reason: 'it is not a configured KRI group' });
    }
  }
  for (const { widget } of detailTabs) {
    if (!getWidget(widget)) problems.push({ reference: `Widget "${widget}" in the drill-in tabs`, reason: 'it is not a registered widget' });
  }
  for (const problem of problems) warnOnce(problem);
  return problems;
}

/**
 * Catalog inputs the tile pager used, which no longer have an effect (#12, #35): a metric's `Widgets`, and a `Widget`
 * or `WidgetConfigs` entry naming a retired view.
 * @param {any[]} catalog
 * @returns {Problem[]}
 */
export function retiredInputs(catalog) {
  /** @type {Problem[]} */
  const problems = [];
  const reason = 'tile views are retired, and each card shows one widget';
  for (const m of catalog) {
    const where = `${m.Abbreviation} (${m.MetricID})`;
    if (Array.isArray(m.Widgets) && m.Widgets.length) problems.push({ reference: `Views ${m.Widgets.map((/** @type {string} */ w) => `"${w}"`).join(', ')} in the catalog entry of ${where}`, reason });
    if (RETIRED_VIEWS.includes(m.Widget)) problems.push({ reference: `Widget "${m.Widget}" in the catalog entry of ${where}`, reason });
    for (const name of Object.keys(m.WidgetConfigs ?? {})) {
      if (RETIRED_VIEWS.includes(name)) problems.push({ reference: `View options for "${name}" in the catalog entry of ${where}`, reason });
    }
  }
  return problems;
}

/** @param {Problem} problem */
export const problemHtml = (problem) => `<div class="ref-problem" role="note"><b>Can't show this view.</b> ${esc(problemText(problem))}</div>`;

/** @param {Problem[]} problems */
export const noticeHtml = (problems) =>
  problems.length
    ? `<div class="config-notice" role="status"><b>Configuration problems</b><ul>${problems.map((p) => `<li>${esc(problemText(p))}</li>`).join('')}</ul></div>`
    : '';

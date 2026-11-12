// @ts-check
// Which views a metric's tile offers in a study, and with what options. Shared by both study page hosts.
import { STANDARD_TILE_VIEWS } from './study-page-spec.js';
import { studyViews } from '../config/study-views.js';
import { getWidget } from '../widgets/registry.js';

/**
 * Paging order: the standard views, then the study's added views, then the metric's own. A name that isn't a
 * registered widget stays in, so its tile shows why it can't render (#12); that includes an explicitly empty name.
 * Only an omitted name means "none".
 * @param {any} metric
 * @param {string} studyId
 * @returns {string[]}
 */
export function tileViews(metric, studyId) {
  const own = [metric?.Widget, ...(metric?.Widgets ?? [])].filter((n) => n != null);
  return [...new Set([...STANDARD_TILE_VIEWS, ...studyViews(studyId).views, ...own])];
}

/**
 * The view a tile shows: the one chosen for it, else its default (the metric's own view, else Details). A choice
 * this study doesn't offer, such as a flag view chosen in another study, returns the tile to its default.
 * @param {any} metric
 * @param {string | null | undefined} chosen
 * @param {string[]} views
 */
export function currentTileView(metric, chosen, views) {
  const fallback = metric?.Widget != null && views.includes(metric.Widget) ? metric.Widget : 'scalar-tile';
  return chosen != null && views.includes(chosen) ? chosen : fallback;
}

/**
 * A view's name in its tile: the widget's label, or the configured name in quotes when it isn't a widget, so an
 * empty or misspelt name reads as one.
 * @param {string} name
 */
export const viewLabel = (name) => getWidget(name)?.label ?? JSON.stringify(name);

/**
 * The views the "All tiles" menu offers: those every tile in the study has.
 * @param {string} studyId
 */
export const sharedTileViews = (studyId) => [...new Set([...STANDARD_TILE_VIEWS, ...studyViews(studyId).views])];

/**
 * A view's options for a metric in a study: the study's, overridden by the metric's own.
 * @param {any} metric
 * @param {string} view
 * @param {string} studyId
 * @returns {Record<string, unknown> | undefined}
 */
export function tileConfig(metric, view, studyId) {
  const own = metric.WidgetConfigs?.[view] ?? (view === metric.Widget ? metric.WidgetConfig : undefined);
  const study = studyViews(studyId).configs[view];
  return study || own ? { ...study, ...own } : undefined;
}

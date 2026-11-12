// @ts-check
// Per-study tile views (#11). Site-flag counts are hidden from the study view by default; a study listed here turns
// them back on for every metric. `views` adds tile views after the standard ones; `configs` sets a view's options,
// merged under any the metric sets itself. Per metric, the catalog does the same through `Widgets` and `WidgetConfigs`.

/** @typedef {{ views: string[], configs: Record<string, Record<string, unknown>> }} StudyViews */

/** @type {Record<string, StudyViews>} */
export const STUDY_VIEW_CONFIG = {
  STUDY006: { views: ['bar-outliers', 'flag-dist'], configs: { 'scalar-tile': { flags: true } } },
};

/**
 * @param {string} studyId
 * @returns {StudyViews}
 */
export const studyViews = (studyId) => STUDY_VIEW_CONFIG[studyId] ?? { views: [], configs: {} };

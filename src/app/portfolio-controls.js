// @ts-check
// The portfolio's controls: their options, and when each control applies.

export const GROUP_BY_OPTIONS = [
  ['none', 'None — one row per study'],
  ['therapeutic_area', 'Therapeutic area'],
  ['protocol_indication', 'Indication'],
  ['phase', 'Phase'],
  ['status', 'Status'],
  ['product', 'Product'],
];
/** @type {Record<string, string>} */
export const FILTER_LABELS = { therapeutic_area: 'Therapeutic area', phase: 'Phase', status: 'Status', study: 'Study' };
export const HEATMAPS = [['none', 'None'], ['num', 'Numerator'], ['den', 'Denominator'], ['rate', 'Rate']];
/** The table's optional columns (#21), under Config's Column grouping (#47). */
export const COLUMN_OPTIONS = [['name', 'Study name'], ['enroll', 'Enrolled'], ['status', 'Status']];
/**
 * The Cell display's presets (#47): Compact folds each category to one headline value per metric; Detailed opens them
 * all, each metric as its glossary defines it; Custom opens them with the chosen cell contents and heatmap.
 */
export const VIEWS = [['compact', 'Compact'], ['detailed', 'Detailed'], ['custom', 'Custom']];
/** @type {Record<string, string>} */
export const VIEW_HINTS = {
  compact: 'One headline rate per metric.',
  detailed: 'Each metric as its glossary defines it: n (%), per 28 days, or %.',
  custom: 'The chosen numbers in every cell, with an optional heatmap.',
};
/** What a Custom cell can show. */
export const SHOW_OPTIONS = [['num', 'Numerator'], ['den', 'Denominator'], ['rate', 'Rate'], ['trend', 'Trend']];

/**
 * A study as its ID and nickname.
 * @param {any} study
 */
export const studyLabel = (study) => `${study.StudyID}${study.params?.nickname ? ` · ${study.params.nickname}` : ''}`;

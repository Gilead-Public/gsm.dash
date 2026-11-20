// @ts-check
// The portfolio's controls: the sidebar's options and when each control applies, and the view switch's views and
// note.

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
export const CELL_MODES = [['defined', 'As defined'], ['custom', 'Custom']];
/** The table's optional columns (#21). */
export const COLUMN_OPTIONS = [['name', 'Study name'], ['enroll', 'Enrolled'], ['status', 'Status']];
/** The table's two views: Overview folds each category to one headline value per metric; Details opens them all. */
export const VIEWS = [['overview', 'Overview'], ['details', 'Details']];

/**
 * What each cell can also show: in "defined" mode only the trend, in "custom" mode the counts and rate too.
 * @param {boolean} defined
 */
export const showOptions = (defined) => (defined ? [['trend', 'Trend']] : [['num', 'Numerator'], ['den', 'Denominator'], ['rate', 'Rate'], ['trend', 'Trend']]);

/** @param {boolean} defined */
export const showLabel = (defined) => (defined ? 'Also show' : 'Show in each cell');

/** @param {boolean} defined */
export const cellModeHint = (defined) =>
  defined ? 'Each metric as its glossary defines it: n (%), per 28 days, or %.' : 'The same numbers stacked in every cell.';

export const HIGHLIGHT_HINT = 'Marks the study in the table. Click a row to pick one.';

/**
 * A study as the highlight menu names it.
 * @param {any} study
 */
export const studyLabel = (study) => `${study.StudyID}${study.params?.nickname ? ` · ${study.params.nickname}` : ''}`;

/**
 * One sidebar drives every portfolio view. A control that doesn't apply to the current view stays visible but
 * disabled: a non-empty value here disables it, and its text, once trimmed, is the reason shown under it.
 * @param {any} store
 */
export function controlStates(store) {
  const cells = store.state.view === 'overview' ? 'Overview tiles show one headline value per metric. Switch View to Details for full cells.' : '';
  return { cellMode: cells, show: cells ? ' ' : '' };
}

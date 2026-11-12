// @ts-check
// The portfolio's controls: the sidebar's options and when each control applies, and the view switch's views and
// note. Shared by both portfolio hosts.

export const GROUP_BY_OPTIONS = [
  ['none', 'None — one row per study'],
  ['therapeutic_area', 'Therapeutic area'],
  ['protocol_indication', 'Indication'],
  ['phase', 'Phase'],
  ['status', 'Status'],
  ['product', 'Product'],
];
/** @type {Record<string, string>} */
export const FILTER_LABELS = { therapeutic_area: 'Therapeutic area', phase: 'Phase', status: 'Status' };
export const RAMPS = [['blue', 'Blue'], ['teal', 'Teal'], ['purple', 'Purple'], ['grey', 'Grey']];
export const HEATMAPS = [['none', 'None'], ['num', 'Numerator'], ['den', 'Denominator'], ['rate', 'Rate']];
export const CELL_MODES = [['defined', 'As defined'], ['custom', 'Custom']];

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

export const HIGHLIGHT_HINT = 'Marks the study in every view. Click a row or a dot to pick one.';

/**
 * A study as the highlight menu and the Distribution view name it.
 * @param {any} study
 */
export const studyLabel = (study) => `${study.StudyID}${study.params?.nickname ? ` · ${study.params.nickname}` : ''}`;

/**
 * One sidebar drives every portfolio view. A control that doesn't apply to the current view stays visible but
 * disabled: a non-empty value here disables it, and its text, once trimmed, is the reason shown under it.
 * @param {any} store
 */
export function controlStates(store) {
  const { state } = store;
  const dist = state.programView === 'distribution';
  const overview = !dist && store.tableZoom() === 'overview';
  const tableOnly = dist ? 'Table only: the distribution plots every study on each metric’s line.' : '';
  const cells = dist
    ? 'The distribution shows each value as defined in the glossary.'
    : overview
      ? 'Overview tiles show one headline value per metric. Open a category or switch to Details.'
      : '';
  return {
    dist,
    cellMode: cells,
    show: cells ? ' ' : '',
    heatmap: tableOnly,
    ramp: dist || state.heatmap === 'none' ? ' ' : '',
    groupBy: tableOnly,
  };
}

/**
 * The note on metrics the portfolio can't show yet: its text, and the metrics it names.
 * @param {any[]} unsupported
 */
export function unsupportedNote(unsupported) {
  if (!unsupported.length) return null;
  return {
    title: unsupported.map((m) => `${m.Abbreviation} (${m.GroupLevel}-level)`).join(', '),
    text: `${unsupported.length} ${unsupported.length === 1 ? 'metric is' : 'metrics are'} not site-level (${[
      ...new Set(unsupported.map((m) => m.GroupLevel)),
    ].join('/')}) — held back until a future release adds that plumbing.`,
  };
}

/** The table's two zoom levels, then the Distribution view. */
export const TABLE_VIEWS = [
  ['overview', 'Overview', 'Every category folded to one headline value per metric'],
  ['details', 'Details', 'Every category open with full cells'],
];
export const DIST_VIEW = ['distribution', 'Distribution', 'Each metric as a strip plot of studies'];

/**
 * Which view buttons are lit. The table's are derived from the category folds, so opening a single band gives a
 * "mixed" state with both table buttons outlined.
 * @param {string} view
 * @param {boolean} dist
 * @param {string} zoom
 */
export const viewButton = (view, dist, zoom) => ({
  on: dist ? view === 'distribution' : view === zoom,
  part: !dist && zoom === 'mixed' && view !== 'distribution',
});

/**
 * The note beside the view switch. In a mixed table it lists the open categories, after a bold "Mixed".
 * @param {boolean} dist
 * @param {string} zoom
 * @param {string[]} open
 * @returns {{ text: string, mixed: string[] | null }}
 */
export function viewNote(dist, zoom, open) {
  if (dist) return { text: 'One line per metric · each dot is a study', mixed: null };
  if (zoom === 'overview') return { text: 'Every category folded to headline values · click a band to open it', mixed: null };
  if (zoom === 'details') return { text: 'Every category open · click a band to fold it', mixed: null };
  return { text: `${open.join(', ')} open`, mixed: open };
}

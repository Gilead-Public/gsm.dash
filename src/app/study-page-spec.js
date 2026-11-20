// The minimal page spec (widget framework, Design 3): the category-row order of the grouped layout, unwired since the
// 19 Nov design review (#35). The cards themselves come from src/config/study-cards.js.
import { CATEGORY_ORDER, OTHER_CATEGORY } from '../data/catalog.js';

export const STUDY_PAGE_SPEC = {
  // The glossary categories — the same bands the program table uses.
  rows: CATEGORY_ORDER,
  otherRow: OTHER_CATEGORY, // uncategorized metrics land here
};

// Host data-layer allow-list (W2): aggregated contract layers only — the exec
// build never carries participant-level `listings`.
export const EXEC_ALLOW_LIST = ['results', 'distributions', 'bounds', 'groups', 'history', 'external'];

// Drill-in panel (W4): the standard KRI-report charts offered per metric, in
// tab order. Each is a registered gsm.viz adapter widget.
export const DETAIL_TABS = [
  { widget: 'viz-bar', label: 'Bar chart' },
  { widget: 'viz-scatter', label: 'Scatter plot' },
  { widget: 'viz-timeseries', label: 'Over time' },
];

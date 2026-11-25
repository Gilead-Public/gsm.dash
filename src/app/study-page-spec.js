// The study page's data layers and drill-in charts. The cards themselves come from src/config/study-cards.js.

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

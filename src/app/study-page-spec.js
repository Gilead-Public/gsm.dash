// The minimal page spec (widget framework, Design 3): only what metric
// metadata cannot express — category-row order and page-level widgets.
// Metric tiles bind themselves via meta.Category / meta.Widget.
export const STUDY_PAGE_SPEC = {
  rows: ['Enrollment', 'On-Treatment', 'Data Quality'],
  otherRow: 'Other', // uncategorized metrics land here
  // Page-level widgets (none for now). The watch-sites widget (`threshold-list`)
  // stays registered and tested; re-add it here to show it:
  //   { widget: 'threshold-list', row: 'On-Treatment', config: { threshold: 2, limit: 6 } }
  pageWidgets: [],
};

// Host data-layer allow-list (W2): aggregated contract layers only — the exec
// build never carries participant-level `listings`.
export const EXEC_ALLOW_LIST = ['results', 'details', 'bounds', 'groups', 'history', 'external'];

// Standard tile views, in paging order. Every one reads only the reporting
// layer, so every site-level metric gets all of them for free. A metric's
// custom views (meta.Widget) are appended after these.
export const STANDARD_TILE_VIEWS = ['overview', 'scalar-tile', 'scatter-mini', 'bar-numerator', 'bar-outliers', 'flag-dist', 'trend-mini'];

export const KIND_HELP = {
  standard: 'Standard — built from the standardized reporting layer; available for every site-level metric automatically.',
  custom: 'Custom — purpose-built for this metric from additional data (e.g. Mapped-layer breakdown counts or an external report).',
};

// Drill-in panel (W4): the standard KRI-report charts offered per metric, in
// tab order. Each is a registered gsm.viz adapter widget.
export const DETAIL_TABS = [
  { widget: 'viz-bar', label: 'Bar chart' },
  { widget: 'viz-scatter', label: 'Scatter plot' },
  { widget: 'viz-timeseries', label: 'Over time' },
];

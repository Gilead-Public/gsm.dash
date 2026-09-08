// The minimal page spec (widget framework, Design 3): only what metric
// metadata cannot express — category-row order and page-level widgets.
// Metric tiles bind themselves via meta.Category / meta.Widget.
export const STUDY_PAGE_SPEC = {
  rows: ['Enrollment', 'On-Treatment', 'Data Quality'],
  otherRow: 'Other', // uncategorized metrics land here
  pageWidgets: [
    { widget: 'threshold-list', row: 'On-Treatment', config: { threshold: 2, limit: 6 } },
  ],
};

// Host data-layer allow-list (W2): the exec build never carries `listings`.
export const EXEC_ALLOW_LIST = ['results', 'details', 'external'];

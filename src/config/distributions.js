// @ts-check
// Distribution widget configuration per metric (keyed by gsm metric ID): business labels for each
// Source × Variable section (a denominator section's `percentLabel` names its population), which variables are
// statuses (coloured) rather than reasons (uncoloured), and top-N collapsing. `keepTopN` shows the top N however small
// the card, and `ties: 'alphabetical'` orders equal counts by name (#19). In a joint-count table (#10), a section's
// `label` heads its rows or column group, and the rows' section's `total` heads their counts.
// Labels never say "Numerator" or "Denominator". Status colours stay empty until the colour map is agreed (#18).

export const DISTRIBUTION_CONFIG = {
  kri0006: {
    statusVariables: ['drv_study_disposition'],
    sections: {
      'Denominator:drv_study_disposition': { title: 'Study disposition', percentLabel: '% of enrolled' },
    },
  },
  'kri0007-2': {
    statusVariables: ['drv_drg_completion'],
    sections: {
      'Numerator:drv_premature_discontinuation_reason': { title: 'Reasons for treatment discontinuation' },
      'Denominator:drv_drg_completion': { title: 'Treatment disposition', percentLabel: '% of dosed' },
    },
  },
  kri0019: {
    statusVariables: ['drv_ip_nonstarter_status'],
    sections: {
      'Denominator:drv_ip_nonstarter_status': { title: 'IP status', percentLabel: '% of enrolled' },
    },
  },
  kri0014: {
    statusVariables: ['eligibility_status'],
    sections: {
      'Numerator:ietestcd_concat': { title: 'Top I/E criteria not met', topN: 5 },
      'Denominator:eligibility_status': { title: 'Eligibility status', percentLabel: '% of enrolled' },
    },
  },
  kri0015: {
    statusVariables: [],
    sections: {
      'Numerator:death_window': { title: 'Deaths by time from randomisation', label: 'Time from randomisation', total: 'Deaths' },
      'Numerator:eligibility_status': { title: 'Deaths by eligibility' },
      'Numerator:treatment_related': { title: 'Deaths by relatedness to treatment' },
      'Numerator:window_eligibility': { title: 'Deaths by time and eligibility', label: 'Eligibility' },
      'Numerator:window_treatment_related': { title: 'Deaths by time and relatedness to treatment', label: 'Related to treatment' },
    },
  },
  kri0004: {
    statusVariables: [],
    sections: {
      'Numerator:dvdecod': { title: 'Top 5 categories', topN: 5, keepTopN: true, ties: 'alphabetical' },
    },
  },
  kri0003: {
    statusVariables: [],
    sections: {
      'Numerator:dvdecod': { title: 'Top 5 categories', topN: 5, keepTopN: true, ties: 'alphabetical' },
    },
  },
  kri0012: {
    statusVariables: ['drv_study_disposition'],
    sections: {
      'Numerator:sf_reason': { title: 'Screen failure reasons', topN: 5 },
      'Denominator:drv_study_disposition': { title: 'Screening status', percentLabel: '% of screened' },
    },
  },
};

/** The configuration for a metric (catalog entry with `ID`), merged with any per-metric override. */
export function distributionConfig(metric, override = {}) {
  const base = metric ? DISTRIBUTION_CONFIG[metric.ID] : undefined;
  if (!base) return null;
  return { ...base, ...override, sections: { ...base.sections, ...(override.sections ?? {}) } };
}

// @ts-check
// Distribution widget configuration per metric (keyed by gsm metric ID): business labels for each
// Source × Variable section, which variables are statuses (coloured) rather than reasons (uncoloured), top-N
// collapsing, and whether numerator sections also show the share of enrolled participants.
// Labels never say "Numerator" or "Denominator". Status colours stay empty until the colour map is agreed (#18).

export const DISTRIBUTION_CONFIG = {
  kri0006: {
    enrolledPercent: true,
    statusVariables: ['disposition'],
    sections: {
      'Numerator:compreas': { title: 'Reasons for study discontinuation', percentLabel: '% Discontinued' },
      'Denominator:disposition': { title: 'Study disposition', percentLabel: '% Enrolled' },
    },
  },
  'kri0007-2': {
    enrolledPercent: false,
    statusVariables: ['drv_drg_completion'],
    sections: {
      'Numerator:drv_premature_discontinuation_reason': { title: 'Reasons for treatment discontinuation', percentLabel: '% Discontinued' },
      'Denominator:drv_drg_completion': { title: 'Treatment disposition', percentLabel: '% Dosed' },
    },
  },
  kri0019: {
    enrolledPercent: false,
    statusVariables: ['ipns_status'],
    sections: {
      'Denominator:ipns_status': { title: 'IP status', percentLabel: '% Enrolled' },
    },
  },
  kri0014: {
    enrolledPercent: true,
    statusVariables: ['eligibility_status'],
    sections: {
      'Numerator:ietestcd_concat': { title: 'Top I/E criteria not met', percentLabel: '% Ineligible', topN: 5 },
      'Denominator:eligibility_status': { title: 'Eligibility status', percentLabel: '% Enrolled' },
    },
  },
  kri0015: {
    enrolledPercent: true,
    statusVariables: [],
    sections: {
      'Numerator:death_window': { title: 'Deaths by time from randomisation', percentLabel: '% Deaths' },
      'Numerator:ineligible_flag': { title: 'Deaths by eligibility', percentLabel: '% Deaths' },
      'Numerator:treatment_related': { title: 'Deaths by relatedness to treatment', percentLabel: '% Deaths' },
    },
  },
  strat0001: {
    enrolledPercent: true,
    statusVariables: ['strat_status'],
    sections: {
      'Numerator:factor_names': { title: 'Mis-stratification by factor', percentLabel: '% Mis-stratified' },
      'Denominator:strat_status': { title: 'Stratification status', percentLabel: '% Enrolled' },
    },
  },
  kri0012: {
    enrolledPercent: false,
    statusVariables: ['screening_status'],
    sections: {
      'Numerator:sf_reason': { title: 'Screen failure reasons', percentLabel: '% Screen failed', topN: 5 },
      'Denominator:screening_status': { title: 'Screening status', percentLabel: '% Screened' },
    },
  },
};

/** The configuration for a metric (catalog entry with `ID`), merged with any per-metric override. */
export function distributionConfig(metric, override = {}) {
  const base = metric ? DISTRIBUTION_CONFIG[metric.ID] : undefined;
  if (!base) return null;
  return { ...base, ...override, sections: { ...base.sections, ...(override.sections ?? {}) } };
}

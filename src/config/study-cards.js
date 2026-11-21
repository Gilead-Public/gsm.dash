// @ts-check
// The study page's cards (#32), in the order the tracker lists its widgets (gsm.roadmap#617), one per widget: the
// 19 Nov design review split widget 5 into two cards. The catalog declares each metric's widget (`Widget`, #12); a
// card names the widget, the metric, its title and, for a breakdown, the one section it shows (`section`), or the
// sections of a joint-count table (`joint`: the rows' section, then one section per column group, whose categories
// read "<row> | <column>"). A standard KRI declares its card by being in a KRI group (src/config/kri-groups.js).
// Widgets 4 and 7 follow #617's current proposal and widget 8 is a reduced interim (#9).

/** @typedef {{ id: string, widget: string, metric: string, title?: string, section?: string, joint?: { rows: string, columns: string[] } }} CardSpec */

/** @type {CardSpec[]} */
export const STUDY_CARDS = [
  { id: 'eligibility-status', widget: 'distribution-bar', metric: 'kri0014', title: 'Eligibility Status', section: 'Denominator:eligibility_status' },
  { id: 'ie-criteria', widget: 'distribution-bar', metric: 'kri0014', title: 'Eligibility I/E Criteria', section: 'Numerator:ietestcd_concat' },
  {
    id: 'premature-deaths',
    widget: 'distribution-bar',
    metric: 'kri0015',
    title: 'Premature Death Summary',
    joint: { rows: 'Numerator:death_window', columns: ['Numerator:window_eligibility', 'Numerator:window_treatment_related'] },
  },
  { id: 'ip-status', widget: 'distribution-bar', metric: 'kri0019', title: 'IP Status', section: 'Denominator:drv_ip_nonstarter_status' },
  { id: 'treatment-disposition', widget: 'distribution-bar', metric: 'kri0007-2', title: 'Treatment Disposition', section: 'Denominator:drv_drg_completion' },
  { id: 'treatment-discontinuation-reasons', widget: 'distribution-bar', metric: 'kri0007-2', title: 'Premature Treatment Discontinuation Reasons', section: 'Numerator:drv_premature_discontinuation_reason' },
  { id: 'study-disposition', widget: 'distribution-bar', metric: 'kri0006', title: 'Study Disposition – Enrolled', section: 'Denominator:drv_study_disposition' },
  { id: 'screening-disposition', widget: 'distribution-bar', metric: 'kri0012', title: 'Study Disposition – Screening', section: 'Denominator:drv_study_disposition' },
  { id: 'screen-failure-reasons', widget: 'distribution-bar', metric: 'kri0012', title: 'Screen Failure Reasons', section: 'Numerator:sf_reason' },
  ...['kri0004', 'kri0003', 'kri0002', 'kri0001', 'kri0005', 'kri0008', 'kri0009', 'kri0010', 'kri0011'].map((metric) => ({ id: metric, widget: 'kri-summary', metric })),
];

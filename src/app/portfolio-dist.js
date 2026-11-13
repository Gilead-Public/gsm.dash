// @ts-check
// The portfolio's Distribution view: one strip per metric with a dot per study at its latest snapshot, the pooled
// portfolio value as a rule, and the highlighted study as a labelled diamond. Tooltip text is HTML for the shared hover
// tooltip, and every other string is plain text.
import { esc, fmtInt, fmtMetric, displayRate, displayLabel } from '../util/format.js';
import { stripScale, axisLabel } from '../scales/strip.js';
import { studyLabel } from './portfolio-controls.js';

export const PICK_HINT = '<br><span class="tip-muted">Click to highlight this study</span>';

/**
 * @param {string} who
 * @param {any} metric
 * @param {any} rollup
 */
export const distTip = (who, metric, rollup) =>
  `<b>${esc(who)}</b><br><span class="tip-muted">${esc(metric.Metric)}</span><br>` +
  `${esc(fmtMetric(metric, rollup).text)} <span class="tip-muted">— ${esc(displayLabel(metric))}</span><br>` +
  `Σn/Σd = ${fmtInt(rollup.Numerator)} / ${fmtInt(rollup.Denominator)}`;

/**
 * The studies the view plots and the highlighted one among them.
 * @param {any} store
 */
export function distStudies(store) {
  const filtered = store.filteredStudies();
  const latest = store.latestFor(filtered);
  const studies = filtered.filter((/** @type {any} */ s) => latest.has(s.StudyID));
  const sel = studies.find((/** @type {any} */ s) => s.StudyID === store.state.highlightStudy) ?? null;
  return { filtered, studies, sel };
}

/**
 * One metric's strip. Positions are percentages of the track, as CSS `left` values.
 * @param {any} store
 * @param {any} metric
 * @param {{ filtered: any[], studies: any[], sel: any }} plotted
 */
export function distRow(store, metric, { filtered, studies, sel }) {
  const rollups = studies.map((s) => ({ s, r: store.rollup([s], metric.MetricID) }));
  const total = store.rollup(filtered, metric.MetricID);
  const totalV = displayRate(metric, total.Rate);
  const { max, x } = stripScale(rollups.map(({ r }) => displayRate(metric, r.Rate)), totalV);
  /** Position of a value that has one. */
  const at = (/** @type {number | null} */ v) => /** @type {number} */ (x(v));
  const dots = rollups
    .filter(({ s, r }) => s !== sel && r.Rate != null)
    .map(({ s, r }) => ({ id: s.StudyID, left: at(displayRate(metric, r.Rate)).toFixed(2), tip: distTip(studyLabel(s), metric, r) + PICK_HINT }));
  /** @type {{ id: string, left: string, labelLeft: string, label: string, tip: string } | null} */
  let mark = null;
  /** @type {string | null} */
  let selValue = null;
  if (sel) {
    const r = /** @type {{ r: any }} */ (rollups.find((o) => o.s === sel)).r;
    const v = displayRate(metric, r.Rate);
    if (v != null) {
      mark = { id: sel.StudyID, left: at(v).toFixed(2), labelLeft: Math.min(95, Math.max(4, at(v))).toFixed(2), label: axisLabel(metric, v), tip: distTip(studyLabel(sel), metric, r) };
    }
    selValue = fmtMetric(metric, r).text;
  }
  const rule = totalV == null ? null : { left: at(totalV).toFixed(2), tip: distTip(`Portfolio total · ${filtered.length} studies`, metric, total) };
  return {
    dots,
    rule,
    mark,
    selValue,
    count: rollups.length,
    maxLabel: axisLabel(metric, max),
    totalValue: fmtMetric(metric, total).text,
  };
}

/**
 * The line above the view. `highlight` names the highlighted study, shown in bold as a link to its report.
 * @param {any} store
 * @param {any[]} studies
 * @param {any} sel
 */
export const distShowing = (store, studies, sel) => ({
  lead: `Showing ${studies.length} / ${store.studies.length} studies · ${store.visibleMetrics().length} / ${
    store.supportedMetrics().length
  } site-level metrics · each study at its own latest snapshot`,
  highlight: sel ? studyLabel(sel) : null,
});

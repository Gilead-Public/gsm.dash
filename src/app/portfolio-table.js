// @ts-check
// The portfolio table's rules: its rows and their order, cell shading, and the text of its tooltips and notes. Tooltip
// text is HTML for the shared hover tooltip, and every other string is plain text.
import { esc, fmtInt, fmtPct, fmtMetric, displayLabel, DAYS_PER_MONTH } from '../util/format.js';
import { relativeBin, heatValue, RELATIVE_MEASURES } from '../scales/flags.js';
import { sortRows } from '../data/sort.js';
import { metricTip } from './tooltip.js';

/**
 * @typedef {object} Row
 * @property {'total' | 'bucket' | 'study'} kind
 * @property {any[]} studies
 * @property {string} label
 * @property {number | null} meta The number of studies in a total or group row; a study row has none.
 * @property {string} [date] A study row's snapshot date.
 * @property {(metricId: string) => any} rollup
 * @property {() => any} population
 * @property {(metricId: string) => Array<{ date: string, rate: number | null, nStudies: number }>} trend The row's trend, from
 *   its studies' history, off-cycle studies included (#14).
 * @property {any} [study]
 * @property {boolean} [open]
 * @property {Row[]} [children]
 */

export const POP_COLUMNS = [
  { key: 'pop:screened', short: 'Scr.', long: 'Screened', param: 'ScreenedCount', cls: '' },
  { key: 'enroll', short: 'Enr.', long: 'Enrolled', param: 'ParticipantCount', cls: 'pop-last' },
];

/**
 * @param {any} pop
 * @param {string} key
 */
export const popValue = (pop, key) => pop[key === 'enroll' ? 'enrolled' : key.slice(4)];

/**
 * A study's enrollment target, `ParticipantTarget` among its Reporting_Groups parameters (#21), or null when it has none
 * above zero. Reporting_Groups values are text, so `"400"` counts.
 * @param {any} study
 * @returns {number | null}
 */
export function enrollTarget(study) {
  const raw = study?.params?.ParticipantTarget;
  const n = typeof raw === 'string' && raw.trim() === '' ? NaN : Number(raw);
  return raw != null && Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Metric columns sort by whatever measure drives the heatmap, so shading and order tell the same story; with the
 * heatmap off, by rate. The 28-day display rescale is a constant factor, so it never changes the order.
 * @param {string} heatmap
 */
export const sortMeasure = (heatmap) => (heatmap === 'none' ? 'rate' : heatmap);

/** @type {Record<string, string>} */
export const MEASURE_LABELS = { num: 'numerator', den: 'denominator', rate: 'rate' };

/**
 * The rows for the store's state: the portfolio total, then one row per study, or one per group-by bucket whose
 * studies open beneath it. Each row memoizes its rollups.
 * @param {any} store
 */
export function tableRows(store) {
  const { state } = store;
  const { sort, heatmap } = state;
  const filtered = store.filteredStudies();
  /** @type {Map<string, string>} */
  const latest = store.latestFor(filtered);
  const flat = state.groupBy === 'none';
  /**
   * @param {Row['kind']} kind
   * @param {any[]} studies
   * @param {string} label
   * @param {any} meta
   * @returns {Row}
   */
  const makeRow = (kind, studies, label, meta, extra = {}, history = studies) => {
    const cache = new Map();
    let popCache;
    return {
      kind, studies, label, meta, ...extra,
      rollup: (metricId) => {
        if (!cache.has(metricId)) cache.set(metricId, store.rollup(studies, metricId));
        return cache.get(metricId);
      },
      population: () => (popCache ??= store.population(studies)),
      trend: (metricId) => store.trendSeries(metricId, history),
    };
  };
  const studyRow = (/** @type {any} */ s) => makeRow('study', [s], s.StudyID, null, { study: s, date: latest.get(s.StudyID) });
  const measure = sortMeasure(heatmap);
  const sortValue = (/** @type {Row} */ row) => {
    if (sort.key === 'label') return row.label;
    if (sort.key === 'meta') return row.meta;
    if (sort.key === 'enroll') return row.population().enrolled;
    if (sort.key?.startsWith('pop:')) return row.population()[sort.key.slice(4)];
    return heatValue(measure, row.rollup(sort.key));
  };
  const sorted = (/** @type {Row[]} */ rows) => sortRows(rows, sort, sortValue);
  const total = makeRow('total', filtered, 'Portfolio total', filtered.length, {}, store.filteredHistory());
  const history = flat ? null : store.historyBuckets();
  const reported = (/** @type {any[]} */ studies) => studies.filter((s) => latest.has(s.StudyID));
  const primary = flat
    ? sorted(reported(filtered).map(studyRow))
    : sorted(
        store.buckets().map((/** @type {any} */ b) =>
          makeRow('bucket', b.studies, String(b.value), b.studies.length, {
            open: state.expanded.has(String(b.value)),
            children: sorted(reported(b.studies).map(studyRow)),
          }, history?.get(String(b.value))),
        ),
      );
  return { filtered, latest, flat, total, primary };
}

/**
 * Column-relative heat bins; folded tiles shade the same way. A study row is binned among every study row the
 * ungrouped table shows, open groups or not, so its shade doesn't depend on the grouping (#23). Group rows and the
 * total are binned among the top-level rows; the total is a sum, so it is shaded only by rate.
 * @param {string} heatmap
 * @param {any[]} metrics
 * @param {Row[]} primary
 * @returns {(row: Row, metric: any) => string}
 */
export function heatClasses(heatmap, metrics, primary) {
  if (!RELATIVE_MEASURES.has(heatmap)) return () => '';
  /** @param {Row[]} rows @returns {Map<string, any>} */
  const domains = (rows) =>
    new Map(
      metrics.map((m) => {
        const values = rows.map((r) => heatValue(heatmap, r.rollup(m.MetricID))).filter((v) => v != null);
        return [m.MetricID, { min: Math.min(...values), max: Math.max(...values) }];
      }),
    );
  const top = domains(primary);
  const study = domains(primary.flatMap((r) => (r.kind === 'study' ? [r] : r.children ?? [])));
  return (row, metric) => {
    if (row.kind === 'total' && heatmap !== 'rate') return '';
    return relativeBin(heatValue(heatmap, row.rollup(metric.MetricID)), (row.kind === 'study' ? study : top).get(metric.MetricID));
  };
}

/** @param {number} n */
export const snapshotNote = (n) => (n === 1 ? '1 study at its latest snapshot' : `${n} studies, each at its latest snapshot`);

const PLANNED_WARNING = '<br><span class="tip-warn">Planned metric — values are simulated</span>';

/**
 * The pooled counts, the denominator named by the metric's catalog label (#20).
 * @param {any} metric
 * @param {any} rollup
 */
const counts = (metric, rollup) =>
  `${fmtInt(rollup.Numerator)} / ${fmtInt(rollup.Denominator)} <span class="tip-muted">(${esc(metric.Denominator ?? 'denominator')})</span>`;

/**
 * An open cell's tooltip.
 * @param {any} rollup
 * @param {any} metric
 * @param {string} label
 */
export function cellTip(rollup, metric, label) {
  const per28 = metric.Display === 'per_28d' && rollup.Rate != null;
  return (
    `<b>${esc(label)}</b><br>` +
    `<span class="tip-muted">${esc(metric.Metric)}</span><br>` +
    `${esc(fmtMetric(metric, rollup).text)} <span class="tip-muted">— ${esc(displayLabel(metric))}</span><br>` +
    `${counts(metric, rollup)}${per28 ? ` = ${rollup.Rate.toFixed(4)} / day × ${DAYS_PER_MONTH}` : ` = ${fmtPct(rollup.Rate)}`}<br>` +
    `${snapshotNote(rollup.NumStudies)}` +
    (metric.Status === 'Planned' ? PLANNED_WARNING : '')
  );
}

/**
 * A folded category's headline tile tooltip.
 * @param {string} rowLabel
 * @param {any} metric
 * @param {any} rollup
 */
export function tileTip(rowLabel, metric, rollup) {
  return (
    `<b>${esc(rowLabel)} · ${esc(metric.Abbreviation)}</b><br>` +
    `<span class="tip-muted">${esc(metric.Metric)}</span><br>` +
    `${esc(fmtMetric(metric, rollup).text)} <span class="tip-muted">— ${esc(displayLabel(metric))}</span><br>` +
    counts(metric, rollup) +
    (metric.Status === 'Planned' ? PLANNED_WARNING : '')
  );
}

/**
 * A population cell's provenance: all three populations, and how many studies reported.
 * @param {string} label
 * @param {any} pop
 * @param {number} nStudies
 */
export function popTip(label, pop, nStudies) {
  const line = (/** @type {string} */ name, /** @type {any} */ v, /** @type {string} */ param) =>
    `${name}: ${v == null ? '—' : fmtInt(v)} <span class="tip-muted">${param}</span>`;
  return (
    `<b>${esc(label)}</b><br>` +
    `${line('Screened', pop.screened, 'ScreenedCount')}<br>` +
    `${line('Enrolled', pop.enrolled, 'ParticipantCount')}<br>` +
    `${line('Dosed', pop.dosed, 'DosedCount')}<br>` +
    `${snapshotNote(nStudies)}<br><span class="tip-muted">The denominators behind every n (%) column.</span>`
  );
}

/**
 * @param {any} study
 * @param {string} date
 */
export function studyTip(study, date) {
  const p = study.params ?? {};
  const rows = [
    ['Therapeutic area', p.therapeutic_area],
    ['Indication', p.protocol_indication],
    ['Phase', p.phase],
    ['Status', p.status],
    ['Product', p.product],
    ['Screened', p.ScreenedCount],
    ['Enrolled', p.ParticipantCount],
    ['Dosed', p.DosedCount],
  ].filter(([, v]) => v != null);
  return (
    `<b>${esc(study.StudyID)}${p.nickname ? ` · ${esc(p.nickname)}` : ''}</b><br>` +
    rows.map(([k, v]) => `${k}: ${esc(v)}`).join('<br>') +
    `<br>Snapshot: ${esc(date)} (${study.snapshots.length} available)`
  );
}

/**
 * A metric header's tooltip: the glossary entry, without the technical fields, and how the column sorts.
 * @param {any} metric
 * @param {string} measureLabel
 */
export const metricHeadTip = (metric, measureLabel) =>
  `${metricTip(metric, { technical: false })}<span class="tip-muted">Click to sort by ${esc(measureLabel)}.</span>`;

/** @param {{ long: string, param: string }} column */
export const popHeadTip = ({ long, param }) =>
  `<b>${long}</b> participants — Reporting_Groups ${param}, summed over the studies in the row at their latest snapshots. Click to sort.`;

/**
 * @param {string} category
 * @param {boolean} collapsed
 */
export const bandTitle = (category, collapsed) => (collapsed ? `Open ${category} for full values` : `Fold ${category} to headline tiles`);

/**
 * The line above the table. `highlight` names the highlighted study, shown in bold.
 * @param {any} store
 * @param {any[]} filtered
 * @param {any[]} metrics
 * @param {string} zoom
 * @returns {{ lead: string, highlight: string | null, sortNote: string }}
 */
export function tableShowing(store, filtered, metrics, zoom) {
  const { state } = store;
  const statusCounts = ['Released', 'New', 'Planned']
    .map((st) => /** @type {[string, number]} */ ([st, metrics.filter((m) => (m.Status ?? 'Released') === st).length]))
    .filter(([, n]) => n)
    .map(([st, n]) => `${n} ${st.toLowerCase()}`)
    .join(' · ');
  const mode =
    zoom === 'overview' ? 'one headline value per metric' : state.cellMode === 'defined' ? 'cells as defined in the glossary' : 'custom cell contents';
  const hl = filtered.find((s) => s.StudyID === state.highlightStudy);
  const sorted = metrics.find((m) => m.MetricID === state.sort.key);
  return {
    lead: `Showing ${filtered.length} / ${store.studies.length} studies · ${metrics.length} / ${
      store.supportedMetrics().length
    } site-level metrics (${statusCounts}) · ${mode} · each study at its own latest snapshot`,
    highlight: hl ? `${hl.StudyID}${hl.params?.nickname ? ` ${hl.params.nickname}` : ''}` : null,
    sortNote: sorted ? ` · sorted by ${sorted.Abbreviation} ${MEASURE_LABELS[sortMeasure(state.heatmap)]} ${state.sort.dir === 'asc' ? '↑' : '↓'}` : '',
  };
}

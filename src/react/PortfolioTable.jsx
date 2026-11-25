// @ts-check
import { reportLink } from '../app/report-links.js';
import { metricTip } from '../app/tooltip.js';
import { fmtInt, fmtRate, metricUnit } from '../util/format.js';
import {
  POP_COLUMNS, MEASURE_LABELS, cellTip, enrollTarget, heatClasses, metricHeadTip, popHeadTip, popTip, popValue, sortMeasure,
  studyTip, tableRows, tableShowing, tileTip,
} from '../app/portfolio-table.js';
import { MetricValue, Sparkline, studyHref, useHoverTooltip } from './parts.jsx';
/** @typedef {import('../app/portfolio-table.js').Row} Row */

const LINK_HINT = 'Open the detailed report in a new tab';

/**
 * The heatmap's key (#46): its measure, and its four shades from lower to higher, each column shaded within its own
 * range.
 * @param {{ measure: string }} props
 */
function HeatLegend({ measure }) {
  return (
    <div className="heat-legend" data-legend="">
      <span>Heatmap: {measure}, shaded within each column</span>
      <span className="heat-scale">
        lower
        {[1, 2, 3, 4].map((i) => (
          <i key={i} className={`hot${i}`} />
        ))}
        higher
      </span>
    </div>
  );
}

/**
 * The portfolio table: the portfolio total, then a row per study or per group-by bucket. A folded category shows one
 * headline tile per metric (Compact); an open one shows full cells (Detailed and Custom). Clicking a study's name opens its
 * report, and its cells and tiles open their metric's detailed report in a new tab (#25).
 * @param {{ store: any }} props
 */
export function PortfolioTable({ store }) {
  const ref = useHoverTooltip();
  const { state } = store;
  const { sort } = state;
  const heatmap = store.activeHeatmap();
  const metrics = store.visibleMetrics();
  const groups = store.metricCategories(metrics).map((/** @type {any} */ g) => ({ ...g, collapsed: state.view === 'compact' }));
  const { filtered, latest, flat, total, primary } = tableRows(store);
  const heatClass = heatClasses(heatmap, metrics, primary);
  const measureLabel = MEASURE_LABELS[sortMeasure(heatmap)];
  const shown = (/** @type {string} */ column) => state.columns.has(column);
  const popColumns = POP_COLUMNS.filter((c) => c.key !== 'enroll' || shown('enroll')).map((c, i, all) => ({ ...c, cls: i === all.length - 1 ? 'pop-last' : '' }));
  const statusCell = (/** @type {any} */ study) => shown('status') && <td className="status-col">{study?.params?.status ?? ''}</td>;
  let sparks = 0;

  /** One delegated handler, so a click means the same thing wherever it lands. */
  const onClick = (/** @type {import('react').MouseEvent} */ e) => {
    const target = /** @type {Element} */ (e.target);
    if (target.closest('a[href]')) return;
    const bucketCell = target.closest('tr[data-bucket] td.grp');
    if (bucketCell) return store.toggleBucketOpen(/** @type {HTMLElement} */ (bucketCell.parentElement).dataset.bucket);
    const th = target.closest('th[data-sort]');
    if (th instanceof HTMLElement) return store.toggleSort(th.dataset.sort, { numeric: th.dataset.sort !== 'label' });
  };

  /**
   * A sortable header; `label` is its content.
   * @param {{ k: string, label: import('react').ReactNode, classes?: string, tip?: string, rowSpan?: number, abbr?: string }} props
   */
  const th = ({ k, label, classes = '', tip, rowSpan, abbr }) => {
    const active = sort.key === k;
    return (
      <th key={k} data-sort={k} className={`sortable ${classes} ${active ? 'active' : ''}`} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} data-tip={tip} rowSpan={rowSpan} data-abbr={abbr}>
        {label}
        {active && (
          <span className="si" aria-hidden="true">
            {sort.dir === 'asc' ? '▲' : '▼'}
          </span>
        )}
      </th>
    );
  };

  const bandRow = (
    <tr className="band">
      {th({ k: 'label', label: flat ? 'Study' : 'Group', classes: 'grp', rowSpan: 2 })}
      {!flat && th({ k: 'meta', label: 'Studies', rowSpan: 2 })}
      {shown('status') && (
        <th rowSpan={2} className="status-col">
          Status
        </th>
      )}
      {popColumns.length ? (
        <th colSpan={popColumns.length} className="bandh pop gs">
          Population
        </th>
      ) : null}
      {groups.map((/** @type {any} */ g) => {
        const n = g.metrics.length;
        if (!g.collapsed) {
          return (
            <th key={g.category} colSpan={n} className="bandh gs open" data-band={g.category}>
              {g.category}
            </th>
          );
        }
        return (
          <th key={g.category} rowSpan={2} className="bandh gs closed" data-band={g.category}>
            {g.category}
            <span className="otiles">
              {g.metrics.map((/** @type {any} */ m) => (
                <span key={m.MetricID} className="tlab" data-abbr={m.Abbreviation} data-tip={metricTip(m, { technical: false })}>
                  {m.Abbreviation}
                </span>
              ))}
            </span>
          </th>
        );
      })}
    </tr>
  );

  const colRow = (
    <tr className="cols">
      {popColumns.map((col, i) =>
        th({
          k: col.key,
          label: (
            <>
              {col.short}
              <span className="u">n</span>
            </>
          ),
          classes: `pop ${col.cls} ${i === 0 ? 'gs' : ''}`,
          tip: popHeadTip(col),
        }),
      )}
      {groups
        .filter((/** @type {any} */ g) => !g.collapsed)
        .flatMap((/** @type {any} */ g) =>
          g.metrics.map((/** @type {any} */ m, /** @type {number} */ i) =>
            th({
              k: m.MetricID,
              label: (
                <>
                  {m.Abbreviation}
                  <span className="u">{metricUnit(m)}</span>
                </>
              ),
              classes: i === 0 ? 'gs' : '',
              tip: metricHeadTip(m, measureLabel),
              abbr: m.Abbreviation,
            }),
          ),
        )}
    </tr>
  );

  /**
   * A study row's link to the metric's detailed report for that study, or null. Totals and groups never link.
   * @param {Row} row
   * @param {any} metric
   */
  const linkFor = (row, metric) => (row.kind === 'study' ? reportLink(metric, store.reportBase, location.href, row.study.StudyID) : null);

  /** @param {Row} row */
  const popCells = (row) => {
    const pop = row.population();
    const tip = popTip(row.label, pop, row.studies.filter((s) => latest.has(s.StudyID)).length);
    // A study's enrolled count is shown against its target when it has one; groups and the total show the count alone.
    const target = row.kind === 'study' ? enrollTarget(row.study) : null;
    return popColumns.map(({ key, cls }, i) => {
      const v = popValue(pop, key);
      return (
        <td key={key} className={`pop ${cls} ${i === 0 ? 'gs' : ''}`} data-tip={tip}>
          {v == null ? <span className="muted">—</span> : key === 'enroll' && target != null ? `${fmtInt(v)} / ${fmtInt(target)}` : fmtInt(v)}
        </td>
      );
    });
  };

  /**
   * An open cell: under Detailed the metric's display rule; under Custom the chosen counts and rate, with the trend
   * under them when chosen (#47).
   * @param {Row} row
   * @param {any} metric
   * @param {boolean} first
   */
  const cell = (row, metric, first) => {
    const rollup = row.rollup(metric.MetricID);
    const label = `${row.label} · ${metric.Abbreviation}`;
    const { show } = state;
    const custom = state.view === 'custom';
    /** @type {import('react').ReactNode[]} */
    const lines = [];
    if (!custom) {
      lines.push(
        <span key="main" className="cell-main">
          <MetricValue metric={metric} rollup={rollup} />
        </span>,
      );
    } else {
      if (show.has('num') || show.has('den')) {
        const nums = [show.has('num') && fmtInt(rollup.Numerator), show.has('den') && fmtInt(rollup.Denominator)].filter(Boolean);
        lines.push(
          <span key="nums" className="cell-nums">
            {nums.join(' / ')}
          </span>,
        );
      }
      if (show.has('rate')) {
        lines.push(
          <span key="rate" className={`cell-rate ${lines.length ? 'secondary' : ''}`}>
            {fmtRate(metric, rollup.Rate)}
          </span>,
        );
      }
    }
    if (custom && show.has('trend')) lines.push(<Sparkline key="trend" index={sparks++} series={row.trend(metric.MetricID)} label={`${label} trend`} />);
    const href = linkFor(row, metric);
    return (
      <td key={metric.MetricID} className={`${first ? 'gs ' : ''}${heatClass(row, metric)}`} data-tip={cellTip(rollup, metric, label)}>
        {href ? (
          <a className="cell" href={href} target="_blank" rel="noopener" title={LINK_HINT}>
            {lines}
          </a>
        ) : (
          <div className="cell">{lines}</div>
        )}
      </td>
    );
  };

  /** @param {Row} row */
  const cells = (row) =>
    groups.flatMap((/** @type {any} */ g) =>
      g.collapsed
        ? [
            <td key={g.category} className="cat gs">
              <span className="otiles">
                {g.metrics.map((/** @type {any} */ m) => {
                  const rollup = row.rollup(m.MetricID);
                  const className = `otile ${heatClass(row, m)}`;
                  const tip = tileTip(row.label, m, rollup);
                  const href = linkFor(row, m);
                  return href ? (
                    <a key={m.MetricID} className={className} data-tip={tip} href={href} target="_blank" rel="noopener" title={LINK_HINT}>
                      {fmtRate(m, rollup.Rate)}
                    </a>
                  ) : (
                    <span key={m.MetricID} className={className} data-tip={tip}>
                      {fmtRate(m, rollup.Rate)}
                    </span>
                  );
                })}
              </span>
            </td>,
          ]
        : g.metrics.map((/** @type {any} */ m, /** @type {number} */ i) => cell(row, m, i === 0)),
    );

  /**
   * @param {Row} row
   * @param {boolean} child
   */
  const studyRow = (row, child) => {
    const { study, date = '' } = row;
    const nick = study.params?.nickname;
    const tip = studyTip(study, date);
    return (
      <tr key={`study ${study.StudyID}`} className={`study ${child ? 'child' : ''} ${state.highlightStudy === study.StudyID ? 'sel' : ''}`} data-hl={study.StudyID}>
        <td className="grp">
          <a href={studyHref(store, study.StudyID)} data-study={study.StudyID} className="mono" data-tip={tip}>
            {study.StudyID}
          </a>
          {shown('name') && nick && (
            <span className="nick" data-tip={tip}>
              {nick}
            </span>
          )}
        </td>
        {child && <td className="nstud"></td>}
        {statusCell(study)}
        {popCells(row)}
        {cells(row)}
      </tr>
    );
  };

  // Rows are built in document order, so the sparklines are numbered in page order.
  const body = [
    <tr key="total" className="total">
      <td className="grp">Portfolio total</td>
      {!flat && <td className="nstud">{filtered.length}</td>}
      {statusCell(null)}
      {popCells(total)}
      {cells(total)}
    </tr>,
  ];
  for (const row of primary) {
    if (row.kind === 'study') {
      body.push(studyRow(row, false));
      continue;
    }
    body.push(
      <tr key={`bucket ${row.label}`} className={`bucket ${row.open ? 'open' : ''}`} data-bucket={row.label}>
        <td className="grp">
          <span className="tri" aria-hidden="true">
            ▶
          </span>
          {row.label}
        </td>
        <td className="nstud">{row.meta}</td>
        {statusCell(null)}
        {popCells(row)}
        {cells(row)}
      </tr>,
    );
    if (row.open) for (const child of row.children ?? []) body.push(studyRow(child, true));
  }

  const showing = tableShowing(store, filtered, metrics);
  return (
    <div className="portfolio-table" ref={ref} onClick={onClick}>
      <div className="tblwrap">
        <table className="po">
          <thead>
            {bandRow}
            {colRow}
          </thead>
          <tbody>{body}</tbody>
        </table>
      </div>
      {state.admin.legend === 'on' && heatmap !== 'none' && <HeatLegend measure={MEASURE_LABELS[heatmap]} />}
      <div className="showing">
        {showing.lead}
        {showing.highlight && (
          <>
            {' · highlighting '}
            <b>{showing.highlight}</b>
          </>
        )}
        {showing.sortNote}
      </div>
    </div>
  );
}

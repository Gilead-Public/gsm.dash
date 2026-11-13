// @ts-check
import { metricTip } from '../components/tooltip.js';
import { fmtInt, fmtRate, metricUnit } from '../util/format.js';
import {
  POP_COLUMNS, MEASURE_LABELS, bandTitle, cellTip, heatClasses, metricHeadTip, popHeadTip, popTip, popValue, sortMeasure,
  studyTip, tableRows, tableShowing, tileTip,
} from '../app/portfolio-table.js';
import { InfoIcon, MetricValue, Sparkline, StatusPill, useHoverTooltip } from './parts.jsx';
/** @typedef {import('../app/portfolio-table.js').Row} Row */

/**
 * The portfolio table: the portfolio total, then a row per study or per group-by bucket. A folded category shows one
 * headline tile per metric (Overview); an open one shows full cells (Details). Clicking a study's name opens its
 * report; clicking elsewhere on its row highlights it in every view.
 * @param {{ store: any, hidden: boolean }} props
 */
export function PortfolioTable({ store, hidden }) {
  const ref = useHoverTooltip();
  const { state } = store;
  const { sort, heatmap } = state;
  const metrics = store.visibleMetrics();
  const groups = store.metricCategories(metrics).map((/** @type {any} */ g) => ({ ...g, collapsed: state.collapsedGroups.has(g.category) }));
  const { filtered, latest, flat, total, primary } = tableRows(store);
  const heatClass = heatClasses(heatmap, metrics, primary);
  const measureLabel = MEASURE_LABELS[sortMeasure(heatmap)];
  let sparks = 0;

  /** The same delegation as the original element, so a click means the same thing wherever it lands. */
  const onClick = (/** @type {import('react').MouseEvent} */ e) => {
    const target = /** @type {Element} */ (e.target);
    if (target.closest('a[data-study]')) return;
    if (target.closest('.info')) return;
    const fold = target.closest('[data-fold]');
    if (fold instanceof HTMLElement) return store.toggleGroup(fold.dataset.fold);
    const bucketCell = target.closest('tr[data-bucket] td.grp');
    if (bucketCell) return store.toggleExpanded(/** @type {HTMLElement} */ (bucketCell.parentElement).dataset.bucket);
    const th = target.closest('th[data-sort]');
    if (th instanceof HTMLElement) return store.toggleSort(th.dataset.sort, { numeric: th.dataset.sort !== 'label' });
    const row = target.closest('tr[data-hl]');
    if (row instanceof HTMLElement) store.highlight(row.dataset.hl);
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
      {th({ k: 'meta', label: flat ? 'Snapshot' : 'Studies', rowSpan: 2 })}
      <th colSpan={2} className="bandh pop gs">
        Population
      </th>
      {groups.map((/** @type {any} */ g) => {
        const n = g.metrics.length;
        const fold = (
          <button type="button" className="fold" aria-expanded={!g.collapsed} aria-label={`${g.collapsed ? 'Open' : 'Fold'} ${g.category}`}>
            {g.collapsed ? '+' : '−'}
          </button>
        );
        if (!g.collapsed) {
          return (
            <th key={g.category} colSpan={n} className="bandh gs open" data-band={g.category} data-fold={g.category} title={bandTitle(g.category, false)}>
              {fold}
              {g.category}
              <span className="tw">{n}</span>
            </th>
          );
        }
        const statuses = new Set(g.metrics.map((/** @type {any} */ m) => m.Status ?? 'Released'));
        return (
          <th key={g.category} rowSpan={2} className="bandh gs closed" data-band={g.category} data-fold={g.category} title={bandTitle(g.category, true)}>
            {fold}
            {g.category}
            <span className="u">
              {`${n} metric${n === 1 ? '' : 's'}`}
              {statuses.size === 1 && <StatusPill metric={g.metrics[0]} />}
            </span>
            <span className="otiles">
              {g.metrics.map((/** @type {any} */ m) => (
                <span key={m.MetricID} className="tlab" data-abbr={m.Abbreviation} data-tip={metricTip(m)}>
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
      {POP_COLUMNS.map((col) =>
        th({
          k: col.key,
          label: (
            <>
              {col.short}
              <span className="u">n</span>
            </>
          ),
          classes: `pop ${col.cls} ${col.key === 'pop:screened' ? 'gs' : ''}`,
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
                  <InfoIcon metric={m} />
                  <span className="u">{metricUnit(m)}</span>
                  <StatusPill metric={m} />
                </>
              ),
              classes: `${i === 0 ? 'gs' : ''} ${m.Status === 'Planned' ? 'planned' : ''}`,
              tip: metricHeadTip(m, measureLabel),
              abbr: m.Abbreviation,
            }),
          ),
        )}
    </tr>
  );

  /** @param {Row} row */
  const popCells = (row) => {
    const pop = row.population();
    const tip = popTip(row.label, pop, row.studies.filter((s) => latest.has(s.StudyID)).length);
    return POP_COLUMNS.map(({ key, cls }) => {
      const v = popValue(pop, key);
      return (
        <td key={key} className={`pop ${cls} ${key === 'pop:screened' ? 'gs' : ''}`} data-tip={tip}>
          {v == null ? <span className="muted">—</span> : fmtInt(v)}
        </td>
      );
    });
  };

  /**
   * An open cell: in "defined" mode the metric's display rule, in "custom" mode the chosen counts and rate; either way
   * with the trend under it when chosen.
   * @param {Row} row
   * @param {any} metric
   * @param {boolean} first
   */
  const cell = (row, metric, first) => {
    const rollup = row.rollup(metric.MetricID);
    const label = `${row.label} · ${metric.Abbreviation}`;
    const { show, cellMode } = state;
    /** @type {import('react').ReactNode[]} */
    const lines = [];
    if (cellMode === 'defined') {
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
    if (show.has('trend')) lines.push(<Sparkline key="trend" index={sparks++} series={store.trendSeries(metric.MetricID, row.studies)} label={`${label} trend`} />);
    return (
      <td key={metric.MetricID} className={`${first ? 'gs ' : ''}${heatClass(row, metric)} ${metric.Status === 'Planned' ? 'planned' : ''}`} data-tip={cellTip(rollup, metric, label)}>
        <div className="cell">{lines}</div>
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
                  return (
                    <span key={m.MetricID} className={`otile ${m.Status === 'Planned' ? 'pl' : ''} ${heatClass(row, m)}`} data-tip={tileTip(row.label, m, rollup)}>
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
    const { study, meta: date } = row;
    const nick = study.params?.nickname;
    return (
      <tr key={`study ${study.StudyID}`} className={`study ${child ? 'child' : ''} ${state.highlightStudy === study.StudyID ? 'sel' : ''}`} data-hl={study.StudyID} title="Click to highlight in every view">
        <td className="grp">
          <a href={`./${encodeURIComponent(study.StudyID)}.html`} data-study={study.StudyID} className="mono">
            {study.StudyID}
          </a>
          {nick && <span className="nick">{nick}</span>}
          <span className="info" data-tip={studyTip(study, date)} role="img" aria-label="Study details">
            i
          </span>
        </td>
        <td className="nstud">{date}</td>
        {popCells(row)}
        {cells(row)}
      </tr>
    );
  };

  // Rows are built in document order, so each sparkline's index matches the original element's.
  const body = [
    <tr key="total" className="total">
      <td className="grp">Portfolio total</td>
      <td className="nstud">{filtered.length}</td>
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
        {popCells(row)}
        {cells(row)}
      </tr>,
    );
    if (row.open) for (const child of row.children ?? []) body.push(studyRow(child, true));
  }

  const showing = tableShowing(store, filtered, metrics, store.tableZoom(groups.map((/** @type {any} */ g) => g.category)));
  return (
    <div className="portfolio-table" data-ramp={state.ramp} hidden={hidden} ref={ref} onClick={onClick}>
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
      <div className="tblwrap">
        <table className="po">
          <thead>
            {bandRow}
            {colRow}
          </thead>
          <tbody>{body}</tbody>
        </table>
      </div>
    </div>
  );
}

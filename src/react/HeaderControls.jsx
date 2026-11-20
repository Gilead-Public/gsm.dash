// @ts-check
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { STATUS_ORDER } from '../data/catalog.js';
import {
  CELL_MODES, COLUMN_OPTIONS, FILTER_LABELS, GROUP_BY_OPTIONS, HEATMAPS, cellModeHint, controlStates, showLabel,
  showOptions,
} from '../app/portfolio-controls.js';
import { StatusPill } from './parts.jsx';

/** The study filter comes first (#22). */
const FILTER_ORDER = ['study', 'therapeutic_area', 'phase', 'status'];

/**
 * A control; a non-empty `na` disables it, and its trimmed text is the reason shown under it.
 * @param {{ na?: string, children: import('react').ReactNode }} props
 */
function Control({ na = '', children }) {
  return (
    <div className={`ctl ${na ? 'na' : ''}`} aria-disabled={na ? 'true' : undefined}>
      {children}
      {na.trim() && <p className="sb-why">{na}</p>}
    </div>
  );
}

/**
 * The choices for one filter: each value as a toggle chip, or each study as a checkbox.
 * @param {{ store: any, param: string, values: string[] }} props
 */
function FilterChoices({ store, param, values }) {
  const { state } = store;
  if (param === 'study') {
    return (
      <div className="study-opts">
        {store.studies.map((/** @type {any} */ st) => (
          <label key={st.StudyID} className="study-opt">
            <input type="checkbox" data-filter="study" data-value={st.StudyID} checked={state.filters.study.has(st.StudyID)} onChange={() => store.toggleFilter('study', st.StudyID)} />
            <span className="mono">{st.StudyID}</span>
            <span className="mname">{st.params?.nickname ?? ''}</span>
          </label>
        ))}
      </div>
    );
  }
  return (
    <div className="chips">
      {values.map((v) => (
        <button key={v} type="button" className={`chip ${state.filters[param].has(v) ? 'on' : ''}`} data-filter={param} data-value={v} aria-pressed={state.filters[param].has(v)} onClick={() => store.toggleFilter(param, v)}>
          {v}
        </button>
      ))}
    </div>
  );
}

/**
 * Config: the table's Collapse all / Expand all toggle, the display settings, and which metrics are shown.
 * @param {{ store: any }} props
 */
function ConfigPanel({ store }) {
  const { state } = store;
  const na = controlStates(store);
  const defined = state.cellMode === 'defined';
  const supported = store.supportedMetrics();
  const statusCount = (/** @type {string} */ st) => supported.filter((/** @type {any} */ m) => (m.Status ?? 'Released') === st).length;
  const collapsed = state.view === 'overview';
  /**
   * @param {string} key
   * @param {string[][]} options
   */
  const seg = (key, options) => (
    <div className="seg" role="group">
      {options.map(([value, label]) => (
        <button key={value} type="button" data-seg={key} data-value={value} className={value === state[key] ? 'on' : ''} onClick={() => store.set(key, value)}>
          {label}
        </button>
      ))}
    </div>
  );
  return (
    <>
      <div className="cfg-col" data-sec="config">
        <Control>
          <label>Table</label>
          <button type="button" className="chip view-toggle" data-view-toggle="" aria-pressed={!collapsed} onClick={() => store.set('view', collapsed ? 'details' : 'overview')}>
            {collapsed ? 'Expand all' : 'Collapse all'}
          </button>
        </Control>
        <Control na={na.cellMode}>
          <label>Cell display</label>
          {seg('cellMode', CELL_MODES)}
          {!na.cellMode && <p className="sb-hint">{cellModeHint(defined)}</p>}
        </Control>
        <Control na={na.show}>
          <label>{showLabel(defined)}</label>
          <div className="chips">
            {showOptions(defined).map(([k, label]) => (
              <button key={k} type="button" className={`chip ${state.show.has(k) ? 'on' : ''}`} data-show={k} aria-pressed={state.show.has(k)} onClick={() => store.toggleShow(k)}>
                {label}
              </button>
            ))}
          </div>
        </Control>
        <Control>
          <label>Heatmap (also drives column sort)</label>
          <select data-heatmap="" value={state.heatmap} onChange={(e) => store.set('heatmap', e.target.value)}>
            {HEATMAPS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Control>
        <Control>
          <label>Columns</label>
          <div className="chips">
            {COLUMN_OPTIONS.map(([k, label]) => (
              <button key={k} type="button" className={`chip ${state.columns.has(k) ? 'on' : ''}`} data-column={k} aria-pressed={state.columns.has(k)} onClick={() => store.toggleColumn(k)}>
                {label}
              </button>
            ))}
          </div>
        </Control>
        <Control>
          <label>Group rows by</label>
          <select data-groupby="" value={state.groupBy} onChange={(e) => store.set('groupBy', e.target.value)}>
            {GROUP_BY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Control>
      </div>
      <div className="cfg-col" data-sec="metrics">
        <div className="ctl">
          <label>Metrics</label>
          <div className="chips">
            {STATUS_ORDER.filter(statusCount).map((st) => (
              <button key={st} type="button" className={`chip ${state.statuses.has(st) ? 'on' : ''}`} data-status={st} aria-pressed={state.statuses.has(st)} onClick={() => store.toggleStatus(st)}>
                {st}
                <span className="cnt">{statusCount(st)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="metric-list">
          {store.metricCategories(supported).map((/** @type {any} */ g) => {
            const on = g.metrics.filter((/** @type {any} */ m) => !state.hiddenMetrics.has(m.MetricID)).length;
            return (
              <div key={g.category} className="mgroup">
                <div className="mgroup-head">
                  <span>{g.category}</span>
                  <span className="cnt">
                    {on}/{g.metrics.length}
                  </span>
                </div>
                {g.metrics.map((/** @type {any} */ m) => {
                  const off = !state.statuses.has(m.Status ?? 'Released');
                  return (
                    <label key={m.MetricID} className={`metric-opt ${off ? 'status-off' : ''}`} title={`${m.Metric}${off ? ' — hidden by the status filter' : ''}`}>
                      <input type="checkbox" data-metric={m.MetricID} checked={!state.hiddenMetrics.has(m.MetricID)} onChange={() => store.toggleMetric(m.MetricID)} />
                      <span className="mono">{m.Abbreviation}</span>
                      <span className="mname">{m.Metric}</span>
                      <StatusPill metric={m} />
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

/**
 * The portfolio's controls in the page header (#22, #24): Filters, collapsed whenever the report opens, then Config and
 * Reset. Opened, Filters shows a chip per filter, each opening its choices. One popover is open at a time; a click
 * elsewhere or Escape closes it. Every control stays in the page while hidden, so the view's state is all there.
 * @param {{ store: any }} props
 */
function Controls({ store }) {
  const [filtersShown, setFiltersShown] = useState(false);
  const [open, setOpen] = useState(/** @type {string | null} */ (null));
  const ref = useRef(/** @type {HTMLDivElement | null} */ (null));
  useEffect(() => {
    const onDown = (/** @type {MouseEvent} */ e) => {
      if (ref.current && !ref.current.contains(/** @type {Node} */ (e.target))) setOpen(null);
    };
    const onKey = (/** @type {KeyboardEvent} */ e) => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);
  const toggle = (/** @type {string} */ name) => setOpen((o) => (o === name ? null : name));
  const { state } = store;
  const options = store.filterOptions();
  const active = store.activeFilterCount();
  return (
    <div className="hctl" ref={ref}>
      <div className="filter-bar" role="group" aria-label="Filters" hidden={!filtersShown}>
        {FILTER_ORDER.map((param) => {
          const n = state.filters[param].size;
          const name = `filter:${param}`;
          return (
            <div key={param} className="popwrap">
              <button type="button" className={`chip fchip ${n ? 'on' : ''}`} data-open={name} aria-expanded={open === name} onClick={() => toggle(name)}>
                {FILTER_LABELS[param]}
                {n > 0 && <span className="cnt">{n}</span>}
              </button>
              <div className="hpop filter-pop" data-pop={name} role="group" aria-label={FILTER_LABELS[param]} hidden={open !== name}>
                <FilterChoices store={store} param={param} values={options[param]} />
              </div>
            </div>
          );
        })}
        {active > 0 && (
          <button type="button" className="linkbtn" data-clear="" onClick={() => store.clearFilters()}>
            Clear filters
          </button>
        )}
      </div>
      <button
        type="button"
        className={`hbtn ${active ? 'on' : ''}`}
        data-open="filters"
        aria-expanded={filtersShown}
        onClick={() => {
          setFiltersShown((v) => !v);
          setOpen(null);
        }}
      >
        Filters
        {active > 0 && <span className="badge">{active}</span>}
      </button>
      <div className="popwrap">
        <button type="button" className="hbtn" data-open="config" aria-expanded={open === 'config'} onClick={() => toggle('config')}>
          Config
        </button>
        <div className="hpop config-pop" data-pop="config" role="group" aria-label="Config" hidden={open !== 'config'}>
          <ConfigPanel store={store} />
        </div>
      </div>
      <button type="button" className="hbtn" data-reset="" title="Return the whole view to its defaults" onClick={() => store.reset()}>
        Reset
      </button>
    </div>
  );
}

/**
 * Renders the controls into the header's slot for them, outside the page's own root.
 * @param {{ store: any }} props
 */
export function HeaderControls({ store }) {
  const host = typeof document === 'undefined' ? null : document.getElementById('header-controls');
  return host ? createPortal(<Controls store={store} />, host) : null;
}

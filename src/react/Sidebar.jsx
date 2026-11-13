// @ts-check
import { useState } from 'react';
import { STATUS_ORDER } from '../data/catalog.js';
import {
  CELL_MODES, FILTER_LABELS, GROUP_BY_OPTIONS, HEATMAPS, HIGHLIGHT_HINT, RAMPS, cellModeHint, controlStates, showLabel,
  showOptions, studyLabel, unsupportedNote,
} from '../app/portfolio-controls.js';
import { StatusPill } from './parts.jsx';

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
 * @param {{ open: boolean, name: string, title: string, badge: string, onToggle: (open: boolean) => void, children: import('react').ReactNode }} props
 */
function Section({ open, name, title, badge, onToggle, children }) {
  return (
    <details className="sb-sec" data-sec={name} open={open} onToggle={(e) => onToggle(/** @type {HTMLDetailsElement} */ (e.currentTarget).open)}>
      <summary>
        {title}
        {badge && <span className="badge">{badge}</span>}
      </summary>
      <div className="sb-body">{children}</div>
    </details>
  );
}

/**
 * The portfolio's controls: Config (view settings), Metrics (which columns render) and Filter (which studies). The
 * whole panel collapses to a rail.
 * @param {{ store: any, collapsed: boolean, onCollapse: (collapsed: boolean) => void }} props
 */
export function Sidebar({ store, collapsed, onCollapse }) {
  const [open, setOpen] = useState({ config: true, metrics: true, filter: true });
  const toggle = (/** @type {keyof typeof open} */ name) => (/** @type {boolean} */ value) => setOpen((o) => (o[name] === value ? o : { ...o, [name]: value }));
  if (collapsed) {
    return (
      <div className="sidebar collapsed">
        <button type="button" className="sb-toggle" data-collapse="" aria-label="Expand controls" aria-expanded="false" title="Expand controls" onClick={() => onCollapse(false)}>
          »
        </button>
      </div>
    );
  }
  const { state } = store;
  const na = controlStates(store);
  const { dist } = na;
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
  const studies = store.filteredStudies();
  const hl = studies.some((/** @type {any} */ st) => st.StudyID === state.highlightStudy) ? state.highlightStudy : '';
  const defined = state.cellMode === 'defined';

  const supported = store.supportedMetrics();
  const note = unsupportedNote(store.unsupportedMetrics());
  const visible = store.visibleMetrics().length;
  const statusCount = (/** @type {string} */ st) => supported.filter((/** @type {any} */ m) => (m.Status ?? 'Released') === st).length;

  const options = store.filterOptions();
  const active = store.activeFilterCount();

  return (
    <div className="sidebar">
      <div className="sb-head">
        <span className="sb-title">Controls</span>
        <button type="button" className="sb-toggle" data-collapse="" aria-label="Collapse controls" aria-expanded="true" title="Collapse controls" onClick={() => onCollapse(true)}>
          «
        </button>
      </div>
      <Section open={open.config} name="config" title="Config" badge="" onToggle={toggle('config')}>
        <Control>
          <label>Highlight study</label>
          <select data-highlight="" value={hl} onChange={(e) => store.highlight(e.target.value || null)}>
            <option value="">None</option>
            {studies.map((/** @type {any} */ st) => (
              <option key={st.StudyID} value={st.StudyID}>
                {studyLabel(st)}
              </option>
            ))}
          </select>
          <p className="sb-hint">{HIGHLIGHT_HINT}</p>
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
        <Control na={na.heatmap}>
          <label>Heatmap (also drives column sort)</label>
          <select data-heatmap="" disabled={dist} value={state.heatmap} onChange={(e) => store.set('heatmap', e.target.value)}>
            {HEATMAPS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </Control>
        <Control na={na.ramp}>
          <label>Heatmap color</label>
          {seg('ramp', RAMPS)}
        </Control>
        <Control na={na.groupBy}>
          <label>Group rows by</label>
          <select data-groupby="" disabled={dist} value={state.groupBy} onChange={(e) => store.set('groupBy', e.target.value)}>
            {GROUP_BY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Control>
      </Section>
      <Section open={open.metrics} name="metrics" title="Metrics" badge={`${visible}/${supported.length}`} onToggle={toggle('metrics')}>
        <div className="ctl">
          <label>Status</label>
          <div className="chips">
            {STATUS_ORDER.filter(statusCount).map((st) => (
              <button key={st} type="button" className={`chip ${state.statuses.has(st) ? 'on' : ''}`} data-status={st} aria-pressed={state.statuses.has(st)} onClick={() => store.toggleStatus(st)}>
                {st}
                <span className="cnt">{statusCount(st)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="sb-actions">
          <button type="button" className="linkbtn" data-metrics-all="on" onClick={() => store.setAllMetrics(true)}>
            All
          </button>
          <button type="button" className="linkbtn" data-metrics-all="off" onClick={() => store.setAllMetrics(false)}>
            None
          </button>
        </div>
        <div className="metric-list">
          {store.metricCategories(supported).map((/** @type {any} */ g) => {
            const on = g.metrics.filter((/** @type {any} */ m) => !state.hiddenMetrics.has(m.MetricID)).length;
            const all = on === g.metrics.length;
            return (
              <div key={g.category} className="mgroup">
                <div className="mgroup-head">
                  <span>{g.category}</span>
                  <button type="button" className="linkbtn" data-group-metrics={g.category} data-on={all ? '1' : '0'} onClick={() => store.setMetricsVisible(g.metrics.map((/** @type {any} */ m) => m.MetricID), !all)}>
                    {all ? 'none' : 'all'}
                  </button>
                  <span className="cnt">
                    {on}/{g.metrics.length}
                  </span>
                </div>
                {g.metrics.map((/** @type {any} */ m) => {
                  const off = !state.statuses.has(m.Status ?? 'Released');
                  return (
                    <label key={m.MetricID} className={`metric-opt ${off ? 'status-off' : ''}`} title={`${m.Metric} · ${m.MetricID}${off ? ' — hidden by the status filter' : ''}`}>
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
        {note && (
          <p className="sb-note" title={note.title}>
            {note.text}
          </p>
        )}
      </Section>
      <Section open={open.filter} name="filter" title="Filter" badge={active ? `${active} active` : ''} onToggle={toggle('filter')}>
        {Object.entries(options).map(([param, values]) => (
          <div key={param} className="ctl">
            <label>{FILTER_LABELS[param] ?? param}</label>
            <div className="chips">
              {/** @type {string[]} */ (values).map((v) => (
                <button key={v} type="button" className={`chip ${state.filters[param].has(v) ? 'on' : ''}`} data-filter={param} data-value={v} onClick={() => store.toggleFilter(param, v)}>
                  {v}
                </button>
              ))}
            </div>
          </div>
        ))}
        {active > 0 && (
          <div className="sb-actions">
            <button type="button" className="linkbtn" data-clear="" onClick={() => store.clearFilters()}>
              Clear filters
            </button>
          </div>
        )}
      </Section>
    </div>
  );
}

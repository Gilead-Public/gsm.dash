// @ts-check
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COLUMN_OPTIONS, FILTER_LABELS, GROUP_BY_OPTIONS, HEATMAPS, SHOW_OPTIONS, VIEWS, VIEW_HINTS } from '../app/portfolio-controls.js';
import { AdminMenu } from './AdminPanel.jsx';
import { useDismiss } from './parts.jsx';

/** The study filter comes first (#22). */
const FILTER_ORDER = ['study', 'therapeutic_area', 'phase', 'status'];

/**
 * The side panel is modal (#46): while it's open, focus moves into it and Tab stays inside it, and when it closes,
 * focus returns to the button that opened it. Its scrim takes clicks meant for the page behind it.
 * @param {boolean} active
 * @param {import('react').RefObject<HTMLElement | null>} panel
 * @param {import('react').RefObject<HTMLElement | null>} opener
 */
function useModalFocus(active, panel, opener) {
  useEffect(() => {
    const el = panel.current;
    if (!active || !el) return;
    const stops = () => /** @type {HTMLElement[]} */ ([...el.querySelectorAll('button, select, input, a[href]')]).filter((e) => !e.hasAttribute('disabled') && e.offsetParent !== null);
    stops()[0]?.focus();
    const keep = (/** @type {FocusEvent} */ e) => {
      if (!el.contains(/** @type {Node} */ (e.target))) stops()[0]?.focus();
    };
    const trap = (/** @type {KeyboardEvent} */ e) => {
      const list = stops();
      if (e.key !== 'Tab' || !list.length) return;
      const [first, last] = [list[0], list[list.length - 1]];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    const back = opener.current;
    document.addEventListener('focusin', keep);
    el.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('focusin', keep);
      el.removeEventListener('keydown', trap);
      back?.focus();
    };
  }, [active, panel, opener]);
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
 * Config (#47): on the left, Group rows by, the Cell display with Custom's own choices under it, and a chip per metric
 * group showing or hiding its band; on the right, the optional columns and which metrics are shown.
 * @param {{ store: any }} props
 */
function ConfigPanel({ store }) {
  const { state } = store;
  const supported = store.supportedMetrics();
  return (
    <>
      <div className="cfg-col" data-sec="config">
        <div className="ctl">
          <label>Group rows by</label>
          <select data-groupby="" value={state.groupBy} onChange={(e) => store.set('groupBy', e.target.value)}>
            {GROUP_BY_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="ctl">
          <label>Cell display</label>
          <div className="seg" role="group" aria-label="Cell display">
            {VIEWS.map(([value, label]) => (
              <button key={value} type="button" data-display={value} aria-pressed={state.view === value} className={state.view === value ? 'on' : ''} onClick={() => store.set('view', value)}>
                {label}
              </button>
            ))}
          </div>
          <p className="sb-hint">{VIEW_HINTS[state.view]}</p>
        </div>
        {state.view === 'custom' && (
          <>
            <div className="ctl sub">
              <label>Show in each cell</label>
              <div className="chips">
                {SHOW_OPTIONS.map(([k, label]) => (
                  <button key={k} type="button" className={`chip ${state.show.has(k) ? 'on' : ''}`} data-show={k} aria-pressed={state.show.has(k)} onClick={() => store.toggleShow(k)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="ctl sub">
              <label>Heatmap (also drives column sort)</label>
              <select data-heatmap="" value={state.heatmap} onChange={(e) => store.set('heatmap', e.target.value)}>
                {HEATMAPS.map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
        {store.groupNames().length > 0 && (
          <div className="ctl">
            <label>Groups</label>
            <div className="chips">
              {store.groupNames().map((/** @type {string} */ name) => {
                const shown = !state.hiddenGroups.has(name);
                return (
                  <button key={name} type="button" className={`chip ${shown ? 'on' : ''}`} data-group={name} aria-pressed={shown} onClick={() => store.toggleGroupHidden(name)}>
                    {name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="cfg-col" data-sec="metrics">
        <div className="ctl">
          <label>Column grouping</label>
          <div className="chips">
            {COLUMN_OPTIONS.map(([k, label]) => (
              <button key={k} type="button" className={`chip ${state.columns.has(k) ? 'on' : ''}`} data-column={k} aria-pressed={state.columns.has(k)} onClick={() => store.toggleColumn(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="ctl">
          <label>Metrics</label>
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
                {g.metrics.map((/** @type {any} */ m) => (
                  <label key={m.MetricID} className="metric-opt" title={m.Metric}>
                    <input type="checkbox" data-metric={m.MetricID} checked={!state.hiddenMetrics.has(m.MetricID)} onChange={() => store.toggleMetric(m.MetricID)} />
                    <span className="mono">{m.Abbreviation}</span>
                    <span className="mname">{m.Metric}</span>
                  </label>
                ))}
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
  useDismiss(ref, () => setOpen(null));
  const toggle = (/** @type {string} */ name) => setOpen((o) => (o === name ? null : name));
  const { state } = store;
  const options = store.filterOptions();
  const active = store.activeFilterCount();
  const side = state.admin.cfgpanel === 'side';
  const configButton = useRef(/** @type {HTMLButtonElement | null} */ (null));
  const configPop = useRef(/** @type {HTMLDivElement | null} */ (null));
  useModalFocus(side && open === 'config', configPop, configButton);
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
        <button type="button" className="hbtn" data-open="config" aria-expanded={open === 'config'} ref={configButton} onClick={() => toggle('config')}>
          Config
        </button>
        {side && open === 'config' && <div className="drawer-scrim" data-scrim="" onClick={() => setOpen(null)} />}
        <div
          className={`hpop config-pop ${side ? 'drawer' : ''}`}
          data-pop="config"
          role={side ? 'dialog' : 'group'}
          aria-modal={side ? 'true' : undefined}
          aria-label="Config"
          hidden={open !== 'config'}
          ref={configPop}
        >
          {side && (
            <button type="button" className="drawer-close" data-close="config" aria-label="Close Config" onClick={() => setOpen(null)}>
              ×
            </button>
          )}
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
  return host
    ? createPortal(
        <>
          <Controls store={store} />
          <AdminMenu admin={store.state.admin} onChange={(key, value) => store.setAdmin(key, value)} />
        </>,
        host,
      )
    : null;
}

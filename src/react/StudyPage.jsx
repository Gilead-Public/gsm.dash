// @ts-check
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { attachHoverTooltip, metricTip } from '../components/tooltip.js';
import { getWidget, resolveWidget } from '../widgets/index.js';
import { STUDY_PAGE_SPEC, EXEC_ALLOW_LIST, DETAIL_TABS, STANDARD_TILE_VIEWS, KIND_HELP } from '../app/study-page-spec.js';
import { useStore } from './useStore.js';
import { Widget } from './Widget.jsx';

// The study overview: metric tiles in category rows, a drill-in panel of gsm.viz charts, and a visit scrubber. It
// keeps the markup of the original <gsm-study-page> element, so the same tests and styles apply.

const PARAMS = ['therapeutic_area', 'protocol_indication', 'phase', 'status', 'product'];

/** @param {{ metric: any }} props */
function InfoIcon({ metric }) {
  return (
    <span className="info" data-tip={metricTip(metric)} role="img" aria-label={`${metric.Metric} definition`}>
      i
    </span>
  );
}

/** @param {{ metric: any }} props */
function StatusPill({ metric }) {
  const status = metric?.Status ?? 'Released';
  return status === 'Released' ? null : <span className={`pill ${status.toLowerCase()}`}>{status}</span>;
}

/** @param {{ def: any }} props */
function KindBadge({ def }) {
  return (
    <span className={`kind kind-${def.kind}`} title={KIND_HELP[/** @type {keyof typeof KIND_HELP} */ (def.kind)] ?? ''}>
      {def.kind}
    </span>
  );
}

/** The views a metric tile can page through: every standard view, then the metric's custom ones. */
function viewsFor(/** @type {any} */ metric) {
  const custom = [metric?.Widget, ...(metric?.Widgets ?? [])].filter((n) => n && getWidget(n));
  return [...STANDARD_TILE_VIEWS, ...custom.filter((n) => !STANDARD_TILE_VIEWS.includes(n))];
}

/** Current view: what the user paged to, else the metric's custom view, else Details. */
function currentView(/** @type {any} */ store, /** @type {any} */ metric, /** @type {string[]} */ views) {
  const chosen = store.state.tileViews.get(metric.MetricID) ?? metric?.Widget ?? 'scalar-tile';
  return views.includes(chosen) ? chosen : views[0];
}

/**
 * @param {{ store: any, studyId: string }} props
 */
export function StudyPage({ store, studyId }) {
  const version = useStore(store);
  const root = useRef(/** @type {HTMLDivElement | null} */ (null));
  const timer = useRef(/** @type {ReturnType<typeof setInterval> | null} */ (null));
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (root.current) attachHoverTooltip(root.current);
  }, []);

  const study = store.studies.find((/** @type {any} */ s) => s.StudyID === studyId);
  /** @type {string[]} */
  const dates = study?.snapshots ?? [];
  const asOf = store.state.asOf;
  const found = asOf ? dates.lastIndexOf(asOf) : dates.length - 1;
  const visit = found < 0 ? dates.length - 1 : found;

  // The newest visit clears asOf rather than pinning it, so the page returns to "latest available".
  const goToVisit = useCallback(
    (/** @type {number} */ i) => {
      const clamped = Math.max(0, Math.min(dates.length - 1, i));
      store.set('asOf', clamped === dates.length - 1 ? null : dates[clamped]);
    },
    [store, dates],
  );

  const pause = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => pause, [pause]);

  /** Step forward through the visits, stopping at the newest; replaying from the end restarts at the first. */
  const togglePlay = () => {
    if (timer.current) return pause();
    if (dates.length < 2) return;
    let i = visit >= dates.length - 1 ? 0 : visit;
    timer.current = setInterval(() => {
      i += 1;
      if (i >= dates.length - 1) {
        pause();
        goToVisit(dates.length - 1);
        return;
      }
      goToVisit(i);
    }, 1100);
    setPlaying(true);
    goToVisit(i);
  };

  if (!study) return <p className="muted">Unknown study: {studyId}</p>;

  const spec = STUDY_PAGE_SPEC;
  const date = store.latestDate(studyId);
  const detail = store.state.detail;
  const visible = store.visibleMetrics();
  const grouped = store.state.groupByCategory;
  /** @type {Map<string, any[]>} */
  const categories = grouped ? new Map(spec.rows.map((/** @type {string} */ row) => [row, []])) : new Map([['All metrics', []]]);
  for (const metric of visible) {
    const row = grouped ? (categories.has(metric.Category) ? metric.Category : spec.otherRow) : 'All metrics';
    if (!categories.has(row)) categories.set(row, []);
    categories.get(row)?.push(metric);
  }
  for (const [row, list] of categories) if (!list.length && !spec.pageWidgets.some((/** @type {any} */ w) => w.row === row)) categories.delete(row);
  const rowLabel = (/** @type {string} */ row) => (grouped ? `${row} · ${categories.get(row)?.length}` : `${row} · ${visible.length}`);

  const chosen = visible.map((/** @type {any} */ m) => store.state.tileViews.get(m.MetricID) ?? null);
  const allViews = chosen.every((v) => v === null) ? 'default' : chosen[0] && chosen.every((v) => v === chosen[0]) ? chosen[0] : 'mixed';
  const viewOptions = [
    ['default', 'Default per metric'],
    ...STANDARD_TILE_VIEWS.map((name) => [name, getWidget(name)?.label ?? name]),
    ...(allViews === 'mixed' ? [['mixed', 'Mixed']] : []),
  ];

  /** Deal every visible tile an independent random view, the counterpart to setting them all to one. */
  const randomizeViews = () => {
    store.setTileViews(
      visible.map((/** @type {any} */ m) => {
        const views = viewsFor(m);
        return [m.MetricID, views[Math.floor(Math.random() * views.length)]];
      }),
    );
  };

  /** Any chart mark carrying data-site selects that site everywhere at once. */
  const onClick = (/** @type {import('react').MouseEvent} */ e) => {
    const mark = /** @type {Element} */ (e.target).closest?.('[data-site]');
    if (mark instanceof HTMLElement || mark instanceof SVGElement) store.selectSite(mark.dataset.site);
  };

  const shared = { store, studyId, version };
  const params = PARAMS.filter((p) => study.params[p] != null);

  return (
    <div className="study-page" data-study={studyId} ref={root} onClick={onClick}>
      <div className="dd-head">
        <span className="study mono">{study.StudyID}</span>
        {study.params.nickname ? <span className="study nick">{study.params.nickname}</span> : null}
        <span className="meta">
          {params.map((p, i) => (
            <Fragment key={p}>
              {i ? ' · ' : ''}
              <span>{study.params[p]}</span>
            </Fragment>
          ))}
        </span>
        <VisitScrubber dates={dates} visit={visit} date={date} playing={playing} onPlay={togglePlay} onPause={pause} goToVisit={goToVisit} />
        <SiteChip store={store} studyId={studyId} />
        <div className="dd-controls">
          <label className="toggle">
            <input type="checkbox" data-group-cat="" checked={grouped} onChange={(e) => store.set('groupByCategory', e.target.checked)} />
            {' Group by category'}
          </label>
          <label className="all-views">
            <span>All tiles</span>
            <select data-all-views="" aria-label="Set every tile to a view" value={allViews} onChange={(e) => store.setAllTileViews(e.target.value === 'default' ? null : e.target.value)}>
              {viewOptions.map(([v, label]) => (
                <option key={v} value={v} disabled={v === 'mixed'}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="randomize" data-randomize-views="" title="Give every tile a different randomly chosen view" onClick={randomizeViews}>
            ⤨ Randomize
          </button>
        </div>
      </div>
      {[...categories].map(([row, metrics]) => {
        const selected = metrics.find((m) => m.MetricID === detail.metricId);
        return (
          <div className="dd-row" data-row={row} key={row}>
            <div className="rowlab">{rowLabel(row)}</div>
            <div className="tiles">
              {metrics.map((metric) => (
                <Tile key={metric.MetricID} metric={metric} open={detail.metricId === metric.MetricID} {...shared} />
              ))}
              {spec.pageWidgets
                .filter((/** @type {any} */ w) => w.row === row)
                .map((/** @type {any} */ pw, /** @type {number} */ i) => (
                  <PageWidget key={`${pw.widget}-${i}`} name={pw.widget} config={pw.config} {...shared} />
                ))}
            </div>
            {selected ? <DetailPanel metric={selected} {...shared} /> : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Play/pause and a range over the study's snapshot dates. The range commits on `change` (pointer release), not
 * `input`: `input` only retitles the live label, so nothing re-renders mid-drag. Both are native listeners, as in
 * the original element, so a value set by script and then dispatched behaves like a user's.
 * @param {{ dates: string[], visit: number, date: string | null, playing: boolean, onPlay: () => void, onPause: () => void, goToVisit: (i: number) => void }} props
 */
function VisitScrubber({ dates, visit, date, playing, onPlay, onPause, goToVisit }) {
  const range = useRef(/** @type {HTMLInputElement | null} */ (null));
  const label = useRef(/** @type {HTMLElement | null} */ (null));

  useLayoutEffect(() => {
    if (range.current) range.current.value = String(visit);
  }, [visit]);

  useEffect(() => {
    const el = range.current;
    if (!el) return;
    const onInput = () => {
      onPause();
      if (label.current) label.current.textContent = dates[Number(el.value)] ?? '—';
    };
    const onChange = () => goToVisit(Number(el.value));
    el.addEventListener('input', onInput);
    el.addEventListener('change', onChange);
    return () => {
      el.removeEventListener('input', onInput);
      el.removeEventListener('change', onChange);
    };
  }, [dates, goToVisit, onPause]);

  if (dates.length < 2) {
    return (
      <span className="meta">
        Extract: <b>{date ?? '—'}</b>
      </span>
    );
  }
  return (
    <div className="visits">
      <button type="button" className={`play ${playing ? 'on' : ''}`} data-play="" aria-label={`${playing ? 'Pause' : 'Play'} through visits`} title="Animate the charts across visits" onClick={onPlay}>
        {playing ? '❚❚' : '▶'}
      </button>
      <input type="range" data-visit="" min="0" max={dates.length - 1} defaultValue={visit} step="1" aria-label="Visit" title="Pick a visit" ref={range} />
      <span className="meta">
        Visit <b>{`${visit + 1}/${dates.length}`}</b> · <b data-visit-label="" ref={label}>{dates[visit] ?? date ?? '—'}</b>
      </span>
    </div>
  );
}

/**
 * The current cross-chart site highlight, with a way out of it.
 * @param {{ store: any, studyId: string }} props
 */
function SiteChip({ store, studyId }) {
  const site = store.state.selectedSite;
  if (!site) return null;
  const name = store
    .groupRows(studyId, store.latestDate(studyId))
    .find((/** @type {any} */ r) => r.GroupID === site && r.GroupLevel === 'Site' && r.Param === 'Site')?.Value;
  return (
    <span className="sitechip" title="Highlighted in every chart on this page">
      <i></i>
      <span className="mono">{site}</span>
      {name ? <span className="nm">{name}</span> : null}
      <button type="button" data-clear-site="" aria-label="Clear site highlight" onClick={() => store.selectSite(null)}>
        ✕
      </button>
    </span>
  );
}

/**
 * @param {{ metric: any, open: boolean, store: any, studyId: string, version: number }} props
 */
function Tile({ metric, open, store, studyId, version }) {
  const views = viewsFor(metric);
  const current = currentView(store, metric, views);
  const idx = views.indexOf(current);
  const { def, degraded } = resolveWidget(current, EXEC_ALLOW_LIST);
  const config = metric.WidgetConfigs?.[current] ?? (current === metric.Widget ? metric.WidgetConfig : undefined);
  const step = (/** @type {number} */ by) => store.setTileView(metric.MetricID, views[(idx + by + views.length) % views.length]);
  const toggleDetail = () => store.set('detail', { metricId: open ? null : metric.MetricID, tab: store.state.detail.tab });
  return (
    <div className={def.size ? `tile ${def.size}` : 'tile'} data-metric-id={metric.MetricID}>
      <div className="tile-head">
        <span className="abbr">{metric.Abbreviation}</span>
        <span className="name">{metric.Metric}</span>
        <InfoIcon metric={metric} />
        <StatusPill metric={metric} />
        <KindBadge def={def} />
      </div>
      <Widget className="tile-body" def={def} degradedFrom={degraded ? current : undefined} metricId={metric.MetricID} config={config} store={store} studyId={studyId} version={version} />
      <div className="tile-foot">
        <button type="button" className="vbtn" data-view-step="-1" data-metric={metric.MetricID} aria-label="Previous view" onClick={() => step(-1)}>
          ‹
        </button>
        <span className="view-name" title={`${def.label} — view ${idx + 1} of ${views.length}`}>
          {def.label} <span className="muted">{`${idx + 1}/${views.length}`}</span>
        </span>
        <button type="button" className="vbtn" data-view-step="1" data-metric={metric.MetricID} aria-label="Next view" onClick={() => step(1)}>
          ›
        </button>
        <button type="button" className={`tile-more ${open ? 'on' : ''}`} data-detail-metric={metric.MetricID} aria-expanded={open} title="Full-size gsm.viz charts" onClick={toggleDetail}>
          Charts {open ? '▴' : '▾'}
        </button>
      </div>
    </div>
  );
}

/**
 * A page-level widget from the page spec, in a tile of its own.
 * @param {{ name: string, config?: object, store: any, studyId: string, version: number }} props
 */
function PageWidget({ name, config, store, studyId, version }) {
  const { def, degraded } = resolveWidget(name, EXEC_ALLOW_LIST);
  return (
    <div className={def.size ? `tile ${def.size}` : 'tile'}>
      <div className="tile-head">
        <KindBadge def={def} />
      </div>
      <Widget className="tile-body" def={def} degradedFrom={degraded ? name : undefined} config={config} store={store} studyId={studyId} version={version} />
    </div>
  );
}

const FALLBACK_NOTE = '<p class="muted small">This chart needs a data layer this build does not carry; showing the fallback view.</p>';

/**
 * The drill-in panel under the row that owns the selected metric: the standard KRI-report charts as tabs.
 * @param {{ metric: any, store: any, studyId: string, version: number }} props
 */
function DetailPanel({ metric, store, studyId, version }) {
  const { tab } = store.state.detail;
  const tabDef = getWidget(tab);
  const { def, degraded } = resolveWidget(tab, EXEC_ALLOW_LIST);
  return (
    <div className="detail">
      <div className="detail-head">
        <span className="abbr">{metric.Abbreviation}</span>
        <span className="detail-title">{metric.Metric}</span>
        <InfoIcon metric={metric} />
        {tabDef ? <KindBadge def={tabDef} /> : null}
        <div className="tabs" role="tablist">
          {DETAIL_TABS.map((t) => (
            <button key={t.widget} type="button" role="tab" className={t.widget === tab ? 'on' : ''} data-detail-tab={t.widget} aria-selected={t.widget === tab} onClick={() => store.set('detail', { ...store.state.detail, tab: t.widget })}>
              {t.label}
            </button>
          ))}
        </div>
        <button type="button" className="detail-close" data-detail-close="" aria-label="Close charts" onClick={() => store.set('detail', { ...store.state.detail, metricId: null })}>
          ✕
        </button>
      </div>
      <Widget className="detail-body" def={def} degradedFrom={degraded ? tab : undefined} note={degraded ? FALLBACK_NOTE : undefined} metricId={metric.MetricID} store={store} studyId={studyId} version={version} />
    </div>
  );
}

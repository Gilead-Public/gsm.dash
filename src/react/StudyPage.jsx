// @ts-check
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { attachHoverTooltip } from '../app/tooltip.js';
import { InfoIcon, StatusPill } from './parts.jsx';
import { getWidget } from '../widgets/index.js';
import { configProblems, problemText, resolveView } from '../app/references.js';
import { reportLink } from '../app/report-links.js';
import { STUDY_PAGE_SPEC, DETAIL_TABS } from '../app/study-page-spec.js';
import { currentTileView, tileConfig, tileViews, viewLabel } from '../app/tile-views.js';
import { kriLayout } from '../app/kri-groups.js';
import { useStore } from './useStore.js';
import { Widget } from './Widget.jsx';

// The study overview: metric tiles in category rows, the grouped standard KRIs, a drill-in panel of gsm.viz charts, and
// a visit scrubber.

const PARAMS = ['therapeutic_area', 'protocol_indication', 'phase', 'status', 'product'];

/** @param {{ problem: import('../app/references.js').Problem }} props */
function ProblemNote({ problem }) {
  return (
    <div className="ref-problem" role="note">
      <b>Can't show this view.</b> {problemText(problem)}
    </div>
  );
}

/**
 * The body of a tile or the drill-in panel: the resolved widget, or the reason it can't render. The one place a
 * problem is shown, for every caller.
 * @param {{ view: ReturnType<typeof resolveView>, className: string, metricId?: string, config?: object, store: any, studyId: string, version: number }} props
 */
function ViewBody({ view, className, ...widget }) {
  if (view.problem) {
    return (
      <div className={className}>
        <ProblemNote problem={view.problem} />
      </div>
    );
  }
  return <Widget className={className} def={view.def} {...widget} />;
}

/**
 * Configuration references no tile can show.
 * @param {{ problems: import('../app/references.js').Problem[] }} props
 */
function ConfigNotice({ problems }) {
  if (!problems.length) return null;
  return (
    <div className="config-notice" role="status">
      <b>Configuration problems</b>
      <ul>
        {problems.map((p, i) => (
          <li key={i}>{problemText(p)}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * @param {{ store: any, studyId: string, back: string }} props `back` is the portfolio's address, with the view it was left in.
 */
export function StudyPage({ store, studyId, back }) {
  const version = useStore(store);
  const root = useRef(/** @type {HTMLDivElement | null} */ (null));
  const [expanded, setExpanded] = useState(() => /** @type {Set<string>} */ (new Set()));

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

  if (!study) return <p className="muted">Unknown study: {studyId}</p>;

  const spec = STUDY_PAGE_SPEC;
  const date = store.latestDate(studyId);
  const detail = store.state.detail;
  const { ctq: visible, groups: kriGroups } = kriLayout(store.visibleMetrics());
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

  const shared = { store, studyId, version };
  const params = PARAMS.filter((p) => study.params[p] != null);

  return (
    <div className="study-page" data-study={studyId} ref={root}>
      <a href={back} className="back">
        ← Program overview
      </a>
      <ConfigNotice problems={configProblems([...store.metrics, ...store.inactiveMetrics], { reportBase: store.reportBase, studyId })} />
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
        <VisitScrubber dates={dates} visit={visit} date={date} goToVisit={goToVisit} />
        <div className="dd-controls">
          <label className="toggle">
            <input type="checkbox" data-group-cat="" checked={grouped} onChange={(e) => store.set('groupByCategory', e.target.checked)} />
            {' Group by category'}
          </label>
        </div>
      </div>
      {[...categories].map(([row, metrics]) => {
        return (
          <div className="dd-row" data-row={row} key={row}>
            <div className="rowlab">{rowLabel(row)}</div>
            <div className="tiles">
              {metrics.map((metric) => (
                <Tile key={metric.MetricID} metric={metric} {...shared} />
              ))}
              {spec.pageWidgets
                .filter((/** @type {any} */ w) => w.row === row)
                .map((/** @type {any} */ pw, /** @type {number} */ i) => (
                  <PageWidget key={`${pw.widget}-${i}`} name={pw.widget} config={pw.config} {...shared} />
                ))}
            </div>
          </div>
        );
      })}
      {kriGroups.map((g) => {
        const open = expanded.has(g.id);
        const members = open ? g.members : g.shown;
        const selected = members.find((m) => m.MetricID === detail.metricId);
        return (
          <div className="dd-row kri-group" data-row={g.label} data-kri-group={g.id} key={g.id}>
            <div className="rowlab">{`${g.label} · ${members.length}`}</div>
            <div className="tiles">
              {members.map((metric) => (
                <KriTile key={metric.MetricID} metric={metric} open={detail.metricId === metric.MetricID} {...shared} />
              ))}
              {g.hidden.length && !open ? (
                <button type="button" className="kri-more" data-kri-expand={g.id} onClick={() => setExpanded(new Set([...expanded, g.id]))}>
                  Show more
                </button>
              ) : null}
            </div>
            {selected ? <DetailPanel metric={selected} {...shared} /> : null}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A range over the study's snapshot dates. The range commits on `change` (pointer release), not `input`: `input` only
 * retitles the live label, so nothing re-renders mid-drag. Both are native listeners, so a value set by script and
 * then dispatched behaves like a user's.
 * @param {{ dates: string[], visit: number, date: string | null, goToVisit: (i: number) => void }} props
 */
function VisitScrubber({ dates, visit, date, goToVisit }) {
  const range = useRef(/** @type {HTMLInputElement | null} */ (null));
  const label = useRef(/** @type {HTMLElement | null} */ (null));

  useLayoutEffect(() => {
    if (range.current) range.current.value = String(visit);
  }, [visit]);

  useEffect(() => {
    const el = range.current;
    if (!el) return;
    const onInput = () => {
      if (label.current) label.current.textContent = dates[Number(el.value)] ?? '—';
    };
    const onChange = () => goToVisit(Number(el.value));
    el.addEventListener('input', onInput);
    el.addEventListener('change', onChange);
    return () => {
      el.removeEventListener('input', onInput);
      el.removeEventListener('change', onChange);
    };
  }, [dates, goToVisit]);

  if (dates.length < 2) {
    return (
      <span className="meta">
        Extract: <b>{date ?? '—'}</b>
      </span>
    );
  }
  return (
    <div className="visits">
      <input type="range" data-visit="" min="0" max={dates.length - 1} defaultValue={visit} step="1" aria-label="Visit" title="Pick a visit" ref={range} />
      <span className="meta">
        Visit <b>{`${visit + 1}/${dates.length}`}</b> · <b data-visit-label="" ref={label}>{dates[visit] ?? date ?? '—'}</b>
      </span>
    </div>
  );
}

/**
 * @param {{ metric: any, store: any, studyId: string, version: number }} props
 */
function Tile({ metric, store, studyId, version }) {
  const views = tileViews(metric, studyId);
  const current = currentTileView(metric, store.state.tileViews.get(metric.MetricID), views);
  const idx = views.indexOf(current);
  const config = tileConfig(metric, current, studyId);
  const view = resolveView(current, metric, config);
  const { def } = view;
  const label = viewLabel(current);
  const link = reportLink(metric, store.reportBase, location.href, studyId);
  const step = (/** @type {number} */ by) => store.setTileView(metric.MetricID, views[(idx + by + views.length) % views.length]);
  return (
    <div className={def?.size ? `tile ${def.size}` : 'tile'} data-metric-id={metric.MetricID}>
      <div className="tile-head">
        <span className="abbr">{metric.Abbreviation}</span>
        <span className="name">{metric.Metric}</span>
        <InfoIcon metric={metric} />
        <StatusPill metric={metric} />
      </div>
      <ViewBody view={view} className="tile-body" metricId={metric.MetricID} config={config} store={store} studyId={studyId} version={version} />
      <div className="tile-foot">
        <button type="button" className="vbtn" data-view-step="-1" data-metric={metric.MetricID} aria-label="Previous view" onClick={() => step(-1)}>
          ‹
        </button>
        <span className="view-name" title={`${label} — view ${idx + 1} of ${views.length}`}>
          {label} <span className="muted">{`${idx + 1}/${views.length}`}</span>
        </span>
        <button type="button" className="vbtn" data-view-step="1" data-metric={metric.MetricID} aria-label="Next view" onClick={() => step(1)}>
          ›
        </button>
        {link ? (
          <a className="report-link" href={link} target="_blank" rel="noopener">
            Detailed report ↗
          </a>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A standard KRI in its group (#32): the compact summary, the drill-in charts and the detailed-report link, with no
 * view pager.
 * @param {{ metric: any, open: boolean, store: any, studyId: string, version: number }} props
 */
function KriTile({ metric, open, store, studyId, version }) {
  const link = reportLink(metric, store.reportBase, location.href, studyId);
  const toggleDetail = () => store.set('detail', { metricId: open ? null : metric.MetricID, tab: store.state.detail.tab });
  return (
    <div className="tile kri" data-metric-id={metric.MetricID}>
      <div className="tile-head">
        <span className="abbr">{metric.Abbreviation}</span>
        <span className="name">{metric.Metric}</span>
        <InfoIcon metric={metric} />
        <StatusPill metric={metric} />
      </div>
      <Widget className="tile-body" def={getWidget('kri-summary')} metricId={metric.MetricID} store={store} studyId={studyId} version={version} />
      <div className="tile-foot">
        <button type="button" className={`tile-more ${open ? 'on' : ''}`} data-detail-metric={metric.MetricID} aria-expanded={open} title="Full-size gsm.viz charts" onClick={toggleDetail}>
          Charts {open ? '▴' : '▾'}
        </button>
        {link ? (
          <a className="report-link" href={link} target="_blank" rel="noopener">
            Detailed report ↗
          </a>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A page-level widget from the page spec, in a tile of its own.
 * @param {{ name: string, config?: object, store: any, studyId: string, version: number }} props
 */
function PageWidget({ name, config, store, studyId, version }) {
  const view = resolveView(name, null, config);
  const { def } = view;
  return (
    <div className={def?.size ? `tile ${def.size}` : 'tile'}>
      <ViewBody view={view} className="tile-body" config={config} store={store} studyId={studyId} version={version} />
    </div>
  );
}

/**
 * The drill-in panel under the row that owns the selected metric: the standard KRI-report charts as tabs.
 * @param {{ metric: any, store: any, studyId: string, version: number }} props
 */
function DetailPanel({ metric, store, studyId, version }) {
  const { tab } = store.state.detail;
  const tabDef = getWidget(tab);
  const view = resolveView(tab, metric);
  return (
    <div className="detail">
      <div className="detail-head">
        <span className="abbr">{metric.Abbreviation}</span>
        <span className="detail-title">{metric.Metric}</span>
        <InfoIcon metric={metric} />
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
      <ViewBody view={view} className="detail-body" metricId={metric.MetricID} store={store} studyId={studyId} version={version} />
    </div>
  );
}

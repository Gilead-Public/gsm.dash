// @ts-check
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { attachHoverTooltip, metricTip } from '../app/tooltip.js';
import { cardValue, cardValueTip } from '../app/card-value.js';
import { esc } from '../util/format.js';
import { configProblems, problemText, resolveView } from '../app/references.js';
import { reportLink } from '../app/report-links.js';
import { DETAIL_TABS } from '../app/study-page-spec.js';
import { combineCards, studyCards } from '../app/study-cards.js';
import { COMBINED_CARDS } from '../config/study-cards.js';
import { useStore } from './useStore.js';
import { Widget } from './Widget.jsx';

// The study overview (#32): one grid of cards, one per widget the tracker requests, in its order, at the study's latest
// snapshot (#48); and a drill-in panel of gsm.viz charts under a standard KRI's card.

const PARAMS = ['therapeutic_area', 'protocol_indication', 'phase', 'status', 'product'];

/** The grid width and page state each grid's shared card height was found for. */
const fitScopes = new WeakMap();

/**
 * Every card has one height (#32): the configured one, or more while some card's content can't be shortened to fit
 * it, such as widget 4's tables or a breakdown already down to one bar. A body whose widget fitted it is marked
 * `data-fits` and left out. Until the page state or the grid's width changes the height only grows, so a breakdown
 * given more room doesn't shrink it again.
 * @param {HTMLElement} grid
 * @param {string} state
 */
function fitCards(grid, state) {
  const scope = `${state}|${grid.clientWidth}`;
  if (fitScopes.get(grid) !== scope) {
    fitScopes.set(grid, scope);
    grid.style.removeProperty('--card-min');
  }
  // A card stacked in a pair (#46) is measured too: the pair takes two card heights, so every card grows with it.
  const cards = /** @type {HTMLElement[]} */ ([...grid.querySelectorAll(':scope > .card, :scope > .card-pair > .card')]);
  let need = 0;
  for (const c of cards) {
    const body = c.querySelector(':scope > .tile-body');
    if (!body || body.hasAttribute('data-fits')) continue;
    const wanted = c.offsetHeight - body.clientHeight + body.scrollHeight;
    if (wanted > c.offsetHeight) need = Math.max(need, wanted);
  }
  if (need) grid.style.setProperty('--card-min', `${need}px`);
}

/** @param {{ problem: import('../app/references.js').Problem, what: string }} props */
function ProblemNote({ problem, what }) {
  return (
    <div className="ref-problem" role="note">
      <b>{`Can't show this ${what}.`}</b> {problemText(problem)}
    </div>
  );
}

/**
 * Configuration references no card can show.
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
 * @param {{ store: any, studyId: string, back: string, combine?: boolean }} props `back` is the portfolio's address, with the
 *   view it was left in; `combine` stacks similar KRIs in one card, an Admin setting (#46).
 */
export function StudyPage({ store, studyId, back, combine = false }) {
  const version = useStore(store);
  const root = useRef(/** @type {HTMLDivElement | null} */ (null));
  const grid = useRef(/** @type {HTMLDivElement | null} */ (null));
  const fitState = useRef('');
  const committing = useRef(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (root.current) attachHoverTooltip(root.current);
  }, []);

  const study = store.studies.find((/** @type {any} */ s) => s.StudyID === studyId);
  /** @type {string[]} */
  const dates = study?.snapshots ?? [];
  const asOf = store.state.asOf;
  const found = asOf ? dates.lastIndexOf(asOf) : dates.length - 1;
  const visit = found < 0 ? dates.length - 1 : found;
  fitState.current = `${studyId}|${visit}|${expanded}|${combine}`;
  committing.current = true;

  // A widget redrawn on its own, or a grid that changes width, may change the height the cards need. Within the page's
  // own render, the cards are measured once all of them are drawn.
  useLayoutEffect(() => {
    const el = grid.current;
    if (!el) return;
    const fit = () => {
      if (!committing.current) fitCards(el, fitState.current);
    };
    el.addEventListener('widget-drawn', fit);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    observer?.observe(el);
    return () => {
      el.removeEventListener('widget-drawn', fit);
      observer?.disconnect();
    };
  }, [study]);
  useLayoutEffect(() => {
    committing.current = false;
    if (grid.current) fitCards(grid.current, fitState.current);
  });

  if (!study) return <p className="muted">Unknown study: {studyId}</p>;

  const date = store.latestDate(studyId);
  const detail = store.state.detail;
  const cards = studyCards({ metrics: store.metrics, inactive: store.inactiveMetrics, visible: store.visibleMetrics() });
  const hidden = cards.filter((c) => c.hidden);
  const shown = expanded ? cards : cards.filter((c) => !c.hidden);
  // The control follows the last KRI card shown, or ends the grid when every KRI starts hidden, even with no card shown.
  const lastKri = shown.some((c) => c.kri) ? shown.findLastIndex((c) => c.kri) : shown.length - 1;
  const expand =
    hidden.length && !expanded ? (
      <button type="button" className="kri-more" data-kri-expand="" onClick={() => setExpanded(true)}>
        Show more
      </button>
    ) : null;
  const shared = { store, studyId, version };
  const params = PARAMS.filter((p) => study.params[p] != null);

  return (
    <div className="study-page" data-study={studyId} ref={root}>
      <a href={back} className="back">
        ← Portfolio
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
        <span className="meta snapshot">
          Latest snapshot: <b>{date ?? '—'}</b>
        </span>
      </div>
      <div className="tiles cards" ref={grid}>
        {(combine ? combineCards(shown, COMBINED_CARDS) : shown.map((card) => [card])).map((group) => {
          const opened = group.find((card) => card.kri && detail.metricId != null && detail.metricId === card.metric?.MetricID);
          const ids = group.map((card) => card.spec.id);
          return (
            <Fragment key={ids.join('+')}>
              {group.length === 1 ? (
                <Card card={group[0]} open={opened === group[0]} {...shared} />
              ) : (
                <div className="card-pair" data-pair={ids.join(' ')}>
                  {group.map((card) => (
                    <Card key={card.spec.id} card={card} open={opened === card} {...shared} />
                  ))}
                </div>
              )}
              {opened ? <DetailPanel metric={opened.metric} {...shared} /> : null}
              {group.includes(shown[lastKri]) ? expand : null}
            </Fragment>
          );
        })}
        {shown.length ? null : expand}
      </div>
    </div>
  );
}

/**
 * A range over the study's snapshot dates, unwired since the 23 Nov demo review (#48): the page shows the latest
 * snapshot only. Kept should earlier snapshots come back; `goToVisit(i)` would set the store's `asOf` to `dates[i]`,
 * or null for the newest. The range commits on `change` (pointer release), not `input`: `input` only retitles the live
 * label, so nothing re-renders mid-drag.
 * @param {{ dates: string[], visit: number, date: string | null, goToVisit: (i: number) => void }} props
 */
export function VisitScrubber({ dates, visit, date, goToVisit }) {
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
 * The card's value at the study's latest snapshot and its n / N, on the header's right (#48). Its hover names what n
 * and N count.
 * @param {{ metric: any, store: any, studyId: string }} props
 */
function CardValue({ metric, store, studyId }) {
  const study = store.studyRollup(studyId, store.latestDate(studyId), metric.MetricID);
  const value = cardValue(metric, study);
  return (
    <div className="card-value" data-tip={cardValueTip(metric, study) ?? undefined}>
      <span className="card-rate">
        <b className="big">{value.rate}</b>
        {value.unit ? <span className="unit">{value.unit}</span> : null}
      </span>
      <span className="card-nd">{`${value.n} / ${value.N}`}</span>
    </div>
  );
}

/**
 * A breakdown's notes, behind a marker in the card's footer (#48): its hover, or keyboard focus, shows them in full.
 * @param {{ notes: string[] }} props
 */
function NotesMarker({ notes }) {
  if (!notes.length) return null;
  return (
    <button type="button" className="notes" data-notes="" aria-label={`Notes: ${notes.join(' ')}`} data-tip={notes.map(esc).join('<br>')}>
      * Notes
    </button>
  );
}

/**
 * One card: a header with its title (whose hover gives the metric's definition) and its value and n / N; its one
 * widget or the reason it can't show it; and a footer with the breakdown's notes, the detailed-report link and, on a
 * standard KRI, the Charts drill-in.
 * @param {{ card: import('../app/study-cards.js').Card, open: boolean, store: any, studyId: string, version: number }} props
 */
export function Card({ card, open, store, studyId, version }) {
  const { spec, metric, def, config, problem, kri } = card;
  const link = metric ? reportLink(metric, store.reportBase, location.href, studyId) : null;
  const toggleDetail = () => store.set('detail', { metricId: open ? null : metric.MetricID, tab: store.state.detail.tab });
  const [notes, setNotes] = useState('');
  return (
    <div className={kri ? 'tile card kri' : 'tile card'} data-card={spec.id} data-metric-id={metric?.MetricID}>
      <div className="tile-head">
        <span className="name" data-tip={metric ? metricTip(metric) : undefined}>
          {card.title}
        </span>
        {def ? <CardValue metric={metric} store={store} studyId={studyId} /> : null}
      </div>
      {def ? (
        <Widget className="tile-body" def={def} metricId={metric.MetricID} config={config} store={store} studyId={studyId} version={version} onResult={(result) => setNotes((result?.notes ?? []).join('\n'))} />
      ) : (
        <div className="tile-body">{problem ? <ProblemNote problem={problem} what="card" /> : null}</div>
      )}
      <div className="tile-foot">
        <NotesMarker notes={notes ? notes.split('\n') : []} />
        {kri && def ? (
          <button type="button" className={`tile-more ${open ? 'on' : ''}`} data-detail-metric={metric.MetricID} aria-expanded={open} title="Full-size gsm.viz charts" onClick={toggleDetail}>
            Charts {open ? '▴' : '▾'}
          </button>
        ) : null}
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
 * The drill-in panel under a standard KRI's card, across the grid: the standard KRI-report charts as tabs.
 * @param {{ metric: any, store: any, studyId: string, version: number }} props
 */
function DetailPanel({ metric, store, studyId, version }) {
  const { tab } = store.state.detail;
  const view = resolveView(tab, metric);
  return (
    <div className="detail">
      <div className="detail-head">
        <span className="abbr">{metric.Abbreviation}</span>
        <span className="detail-title" data-tip={metricTip(metric)}>
          {metric.Metric}
        </span>
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
      {view.problem ? (
        <div className="detail-body">
          <ProblemNote problem={view.problem} what="view" />
        </div>
      ) : (
        <Widget className="detail-body" def={view.def} metricId={metric.MetricID} store={store} studyId={studyId} version={version} />
      )}
    </div>
  );
}

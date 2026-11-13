// @ts-check
import { metricUnit } from '../util/format.js';
import { distRow, distShowing, distStudies } from '../app/portfolio-dist.js';
import { InfoIcon, StatusPill, studyHref, useHoverTooltip } from './parts.jsx';

/**
 * The Distribution view: one strip per metric, a dot per study at its latest snapshot, the pooled portfolio value as a
 * rule and the highlighted study as a labelled diamond. The highlighted study's name above the view opens its report. Categories fold independently of the table's bands.
 * @param {{ store: any, hidden: boolean }} props
 */
export function PortfolioDist({ store, hidden }) {
  const ref = useHoverTooltip();
  const { state } = store;
  const plotted = distStudies(store);
  const { sel } = plotted;
  const selName = sel ? sel.params?.nickname ?? sel.StudyID : '';

  const onClick = (/** @type {import('react').MouseEvent} */ e) => {
    const target = /** @type {Element} */ (e.target);
    if (target.closest('.info')) return;
    const cat = target.closest('[data-dfold]');
    if (cat instanceof HTMLElement) return store.toggleDistGroup(cat.dataset.dfold);
    const pt = target.closest('[data-pick]');
    if (pt instanceof HTMLElement) store.highlight(pt.dataset.pick);
  };

  /** @param {any} m */
  const metricRow = (m) => {
    const row = distRow(store, m, plotted);
    return (
      <div key={m.MetricID} className={`dcols mrow ${m.Status === 'Planned' ? 'plan' : ''}`} data-metric={m.MetricID}>
        <div className="mn">
          <b>{m.Metric}</b>
          <span className="ab" data-abbr={m.Abbreviation}>
            {m.Abbreviation}
          </span>
          <InfoIcon metric={m} />
          <StatusPill metric={m} />
          <span className="u">{metricUnit(m)}</span>
        </div>
        <div className={`track ${sel ? 'dim' : ''}`} role="img" aria-label={`${m.Metric}: ${row.count} studies`}>
          <span className="tick">0</span>
          <span className="tick r">{row.maxLabel}</span>
          {row.dots.map((d) => (
            <span key={d.id} className="pt" style={{ left: `${d.left}%` }} data-pick={d.id} data-tip={d.tip}></span>
          ))}
          {row.rule && <span className="ptot" style={{ left: `${row.rule.left}%` }} data-tip={row.rule.tip}></span>}
          {row.mark && (
            <>
              <span className="psel" style={{ left: `${row.mark.left}%` }} data-pick={row.mark.id} data-tip={row.mark.tip}></span>
              <span className="lsel" style={{ left: `${row.mark.labelLeft}%` }}>
                {row.mark.label}
              </span>
            </>
          )}
        </div>
        <div className="pv">
          <div className="m">{row.totalValue}</div>
          {sel && (
            <div className="sv">
              {selName} <b>{row.selValue}</b>
            </div>
          )}
        </div>
      </div>
    );
  };

  const categories = store.metricCategories();
  const showing = distShowing(store, plotted.studies, sel);
  return (
    <div className="portfolio-dist" hidden={hidden} ref={ref} onClick={onClick}>
      <div className="showing">
        {showing.lead}
        {sel && (
          <>
            {' · highlighting '}
            <b>
              <a href={studyHref(store, sel.StudyID)} data-study={sel.StudyID}>
                {showing.highlight}
              </a>
            </b>
          </>
        )}
      </div>
      <div className="dist">
        {categories.length ? (
          categories.map((/** @type {any} */ g) => {
            const folded = state.distCollapsed.has(g.category);
            const n = g.metrics.length;
            return [
              <div key={g.category} className={`dcols dcat ${folded ? 'folded' : ''}`} data-dfold={g.category} data-band={g.category} role="button" aria-expanded={!folded}>
                <h4>
                  <span className="tog">{folded ? '+' : '−'}</span>
                  {g.category}
                  <small>{`${n} metric${n === 1 ? '' : 's'}`}</small>
                </h4>
                {folded ? (
                  <span className="dfold">{`${g.metrics.map((/** @type {any} */ m) => m.Abbreviation).join(' · ')} · click to open`}</span>
                ) : (
                  <>
                    <span className="colh l">Each dot = one study · scale 0 → max</span>
                    <span className="colh">Portfolio{sel ? ` · ${selName}` : ''}</span>
                  </>
                )}
              </div>,
              ...(folded ? [] : g.metrics.map(metricRow)),
            ];
          })
        ) : (
          <p className="muted">No metrics selected.</p>
        )}
      </div>
      <p className="notes">
        <span>
          <b>Dot</b> = one study's value; the black rule is the pooled portfolio value.
        </span>
        <span>
          <b>Click</b> a dot to highlight that study, a category to fold it.
        </span>
      </p>
    </div>
  );
}

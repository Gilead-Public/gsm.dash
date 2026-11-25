// @ts-check
import { useStore } from './useStore.js';
import { HeaderControls } from './HeaderControls.jsx';
import { PortfolioTable } from './PortfolioTable.jsx';

// The portfolio overview: the table, with its controls in the page header. It keeps the
// markup of the original program page, each custom element becoming a div that carries its name as a class, so the
// same tests and styles apply.

/**
 * Names the studies left out of the snapshot cycle: off cycle, with their latest snapshot, or missing (#14).
 * @param {{ cycle: { SnapshotDate: string, offCycle: Array<{ StudyID: string, latest: string }>, missing: string[] } | null }} props
 */
function CycleNotice({ cycle }) {
  if (!cycle || (!cycle.offCycle.length && !cycle.missing.length)) return null;
  return (
    <div className="cycle-notice" role="status">
      <b>Studies left out of the {cycle.SnapshotDate} snapshot cycle</b>
      <ul>
        {cycle.offCycle.map((s) => (
          <li key={s.StudyID}>
            {s.StudyID}: off cycle, latest snapshot {s.latest}
          </li>
        ))}
        {cycle.missing.map((id) => (
          <li key={id}>{id}: missing, no data</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Why the table has no studies or no metrics, each with the one action that brings them back (#21, #22).
 * @param {{ store: any }} props
 */
function EmptyNotice({ store }) {
  const noStudies = store.activeFilterCount() > 0 && store.filteredStudies().length === 0;
  const noMetrics = store.supportedMetrics().length > 0 && store.visibleMetrics().length === 0;
  if (!noStudies && !noMetrics) return null;
  return (
    <div className="empty-notes" role="status">
      {noStudies && (
        <p data-empty="studies">
          No studies match these filters.{' '}
          <button type="button" className="linkbtn" onClick={() => store.clearFilters()}>
            Clear filters
          </button>
        </p>
      )}
      {noMetrics && (
        <p data-empty="metrics">
          All metrics are hidden.{' '}
          <button type="button" className="linkbtn" onClick={() => store.showAllMetrics()}>
            Show all metrics
          </button>
        </p>
      )}
    </div>
  );
}

/** @param {{ store: any }} props */
export function PortfolioPage({ store }) {
  useStore(store);
  return (
    <div className="layout">
      <HeaderControls store={store} />
      <div className="content">
        <CycleNotice cycle={store.cycle} />
        <EmptyNotice store={store} />
        <PortfolioTable store={store} />
      </div>
    </div>
  );
}

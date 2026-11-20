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

/** @param {{ store: any }} props */
export function PortfolioPage({ store }) {
  useStore(store);
  return (
    <div className="layout">
      <HeaderControls store={store} />
      <div className="content">
        <CycleNotice cycle={store.cycle} />
        <PortfolioTable store={store} />
      </div>
    </div>
  );
}

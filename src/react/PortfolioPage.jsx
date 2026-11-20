// @ts-check
import { useState } from 'react';
import { useStore } from './useStore.js';
import { Sidebar } from './Sidebar.jsx';
import { ViewSwitch } from './ViewSwitch.jsx';
import { PortfolioTable } from './PortfolioTable.jsx';

// The portfolio overview: the controls, the view switch and the table. It keeps the
// markup of the original program page, each custom element becoming a div that carries its name as a class, so the
// same tests and styles apply.

const COLLAPSE_KEY = 'gsm-dash-sidebar';

function storedCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

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
  const [collapsed, setCollapsed] = useState(storedCollapsed);
  const collapse = (/** @type {boolean} */ value) => {
    setCollapsed(value);
    try {
      localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  };
  return (
    <div className={collapsed ? 'layout collapsed' : 'layout'}>
      <Sidebar store={store} collapsed={collapsed} onCollapse={collapse} />
      <div className="content">
        <CycleNotice cycle={store.cycle} />
        <ViewSwitch store={store} />
        <PortfolioTable store={store} />
      </div>
    </div>
  );
}

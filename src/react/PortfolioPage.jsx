// @ts-check
import { useState } from 'react';
import { useStore } from './useStore.js';
import { Sidebar } from './Sidebar.jsx';
import { ViewSwitch } from './ViewSwitch.jsx';
import { PortfolioTable } from './PortfolioTable.jsx';
import { PortfolioDist } from './PortfolioDist.jsx';

// The portfolio overview: the controls beside the view switch, the table and the Distribution view. It keeps the
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
  const dist = store.state.programView === 'distribution';
  return (
    <div className={collapsed ? 'layout collapsed' : 'layout'}>
      <Sidebar store={store} collapsed={collapsed} onCollapse={collapse} />
      <div className="content">
        <ViewSwitch store={store} />
        <PortfolioTable store={store} hidden={dist} />
        <PortfolioDist store={store} hidden={!dist} />
      </div>
    </div>
  );
}

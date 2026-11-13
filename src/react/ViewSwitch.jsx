// @ts-check
import { DIST_VIEW, TABLE_VIEWS, viewButton, viewNote } from '../app/portfolio-controls.js';

/**
 * The portfolio's view switch: the table's Overview and Details, and the Distribution view.
 * @param {{ store: any }} props
 */
export function ViewSwitch({ store }) {
  const { state } = store;
  const dist = state.programView === 'distribution';
  const cats = store.metricCategories().map((/** @type {any} */ g) => g.category);
  const zoom = store.tableZoom(cats);
  const note = viewNote(dist, zoom, cats.filter((/** @type {string} */ c) => !state.collapsedGroups.has(c)));
  /** @param {string[]} view */
  const button = ([view, label, title]) => {
    const { on, part } = viewButton(view, dist, zoom);
    return (
      <button key={view} type="button" role="tab" data-view={view} className={`${on ? 'on' : ''} ${part ? 'part' : ''}`} aria-selected={on} title={title} onClick={() => store.setProgramView(view)}>
        {label}
      </button>
    );
  };
  return (
    <div className="view-switch">
      <div className="viewbar">
        <div className="tabs" role="tablist" aria-label="Program view">
          <span className="tset">
            <span className="cap">Table</span>
            {TABLE_VIEWS.map(button)}
          </span>
          <span className="tset">{button(DIST_VIEW)}</span>
        </div>
        <span className="zoomnote">
          {note.mixed ? (
            <>
              <b>Mixed</b>: {note.text}
            </>
          ) : (
            note.text
          )}
        </span>
        {dist && (
          <span className="legend">
            <span className="lk">
              <i className="pline"></i>portfolio
            </span>
            <span className="lk">
              <i className="dmd"></i>highlighted study
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

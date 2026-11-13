import { StoreElement, esc } from './util.js';
import { DIST_VIEW, TABLE_VIEWS, viewButton, viewNote } from '../app/portfolio-controls.js';

/**
 * The program page's view switch: a "Table" pair (Overview | Details) and a
 * separate Distribution tab. Overview and Details are two zoom levels of one
 * table — which one is lit is derived from the category folds, so opening a
 * single band yields a "mixed" state with both table buttons outlined.
 */
export class GsmViewSwitch extends StoreElement {
  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-view]');
      if (b) this.store.setProgramView(b.dataset.view);
    });
  }

  render() {
    const store = this.store;
    const { state } = store;
    const dist = state.programView === 'distribution';
    const cats = store.metricCategories().map((g) => g.category);
    const zoom = store.tableZoom(cats);
    const btn = ([view, label, title]) => {
      const { on, part } = viewButton(view, dist, zoom);
      return `<button type="button" role="tab" data-view="${view}" class="${on ? 'on' : ''} ${part ? 'part' : ''}" aria-selected="${on}" title="${esc(title)}">${label}</button>`;
    };
    const open = cats.filter((c) => !state.collapsedGroups.has(c));
    const { text, mixed } = viewNote(dist, zoom, open);
    const note = mixed ? `<b>Mixed</b>: ${esc(text)}` : esc(text);
    const legend = dist ? `<span class="legend"><span class="lk"><i class="pline"></i>portfolio</span><span class="lk"><i class="dmd"></i>highlighted study</span></span>` : '';
    this.innerHTML = `<div class="viewbar">
      <div class="tabs" role="tablist" aria-label="Program view">
        <span class="tset"><span class="cap">Table</span>${TABLE_VIEWS.map(btn).join('')}</span>
        <span class="tset">${btn(DIST_VIEW)}</span>
      </div>
      <span class="zoomnote">${note}</span>${legend}</div>`;
  }
}

customElements.define('gsm-view-switch', GsmViewSwitch);

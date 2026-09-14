import { StoreElement, esc } from './util.js';

const GROUP_BY_OPTIONS = [
  ['none', 'None — one row per study'],
  ['therapeutic_area', 'Therapeutic area'],
  ['protocol_indication', 'Indication'],
  ['phase', 'Phase'],
  ['status', 'Status'],
  ['product', 'Product'],
];
const FILTER_LABELS = { therapeutic_area: 'Therapeutic area', phase: 'Phase', status: 'Status' };
const RAMPS = [['blue', 'Blue'], ['teal', 'Teal'], ['purple', 'Purple'], ['grey', 'Grey']];
const COLLAPSE_KEY = 'gsm-dash-sidebar';

/**
 * Collapsible control sidebar for the program page: Config (view settings),
 * Metrics (which columns render), Filter (study subset). Sections are native
 * <details>; the whole panel collapses to a rail. Mutates the store directly.
 */
export class GsmSidebar extends StoreElement {
  #collapsed = false;
  #open = { config: true, metrics: true, filter: true };

  connectedCallback() {
    this.addEventListener('click', (e) => {
      if (e.target.closest('button[data-collapse]')) return this.#setCollapsed(!this.#collapsed);
      const seg = e.target.closest('button[data-seg]');
      if (seg) return this.store.set(seg.dataset.seg, seg.dataset.value);
      const chip = e.target.closest('button[data-filter]');
      if (chip) return this.store.toggleFilter(chip.dataset.filter, chip.dataset.value);
      const show = e.target.closest('button[data-show]');
      if (show) return this.store.toggleShow(show.dataset.show);
      if (e.target.closest('button[data-clear]')) return this.store.clearFilters();
      const all = e.target.closest('button[data-metrics-all]');
      if (all) return this.store.setAllMetrics(all.dataset.metricsAll === 'on');
    });
    this.addEventListener('change', (e) => {
      if (e.target.matches('select[data-groupby]')) this.store.set('groupBy', e.target.value);
      if (e.target.matches('select[data-heatmap]')) this.store.set('heatmap', e.target.value);
      if (e.target.matches('input[data-metric]')) this.store.toggleMetric(e.target.dataset.metric);
    });
    // <details> toggle doesn't bubble; capture it so re-renders keep section state.
    this.addEventListener('toggle', (e) => {
      if (e.target.dataset.sec) this.#open[e.target.dataset.sec] = e.target.open;
    }, true);
    let collapsed = false;
    try { collapsed = localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { /* storage unavailable */ }
    this.#setCollapsed(collapsed, false);
    super.connectedCallback();
  }

  #setCollapsed(value, persist = true) {
    this.#collapsed = value;
    this.classList.toggle('collapsed', value);
    this.closest('.layout')?.classList.toggle('collapsed', value);
    if (persist) {
      try { localStorage.setItem(COLLAPSE_KEY, value ? '1' : '0'); } catch { /* storage unavailable */ }
      this.render();
    }
  }

  #seg(key, options) {
    const current = this.store.state[key];
    return `<div class="seg" role="group">${options
      .map(([value, label]) => `<button type="button" data-seg="${key}" data-value="${value}" class="${value === current ? 'on' : ''}">${label}</button>`)
      .join('')}</div>`;
  }

  #section(key, title, badge, body) {
    return `<details class="sb-sec" data-sec="${key}" ${this.#open[key] ? 'open' : ''}>
      <summary>${title}${badge ? `<span class="badge">${badge}</span>` : ''}</summary>
      <div class="sb-body">${body}</div></details>`;
  }

  render() {
    if (!this.store) return;
    const { state } = this.store;
    if (this.#collapsed) {
      this.innerHTML = `<button type="button" class="sb-toggle" data-collapse aria-label="Expand controls" aria-expanded="false" title="Expand controls">»</button>`;
      return;
    }

    const config =
      `<div class="ctl"><label>Show in each cell</label><div class="chips">${[
        ['num', 'Numerator'], ['den', 'Denominator'], ['rate', 'Rate'],
        ['flagged', '% Flagged'], ['red', '% Red'], ['dist', 'Distribution'], ['trend', 'Trend'],
      ]
        .map(([k, label]) => `<button type="button" class="chip ${state.show.has(k) ? 'on' : ''}" data-show="${k}" aria-pressed="${state.show.has(k)}">${label}</button>`)
        .join('')}</div></div>` +
      `<div class="ctl"><label>Heatmap (also drives column sort)</label><select data-heatmap>${[
        ['none', 'None'], ['num', 'Numerator'], ['den', 'Denominator'], ['rate', 'Rate'], ['flagged', '% Flagged (red or amber)'], ['red', '% Red'],
      ]
        .map(([k, label]) => `<option value="${k}" ${state.heatmap === k ? 'selected' : ''}>${label}</option>`)
        .join('')}</select></div>` +
      `<div class="ctl"><label>Heatmap color</label>${this.#seg('ramp', RAMPS)}</div>` +
      `<div class="ctl"><label>Group rows by</label><select data-groupby>${GROUP_BY_OPTIONS.map(
        ([value, label]) => `<option value="${value}" ${value === state.groupBy ? 'selected' : ''}>${label}</option>`
      ).join('')}</select></div>`;

    const supported = this.store.supportedMetrics();
    const unsupported = this.store.unsupportedMetrics();
    const visible = this.store.visibleMetrics().length;
    const metrics =
      `<div class="sb-actions"><button type="button" class="linkbtn" data-metrics-all="on">All</button><button type="button" class="linkbtn" data-metrics-all="off">None</button></div>` +
      `<div class="metric-list">${supported
        .map(
          (m) => `<label class="metric-opt" title="${esc(m.Metric)} · ${esc(m.MetricID)}">
            <input type="checkbox" data-metric="${esc(m.MetricID)}" ${state.hiddenMetrics.has(m.MetricID) ? '' : 'checked'}>
            <span class="mono">${esc(m.Abbreviation)}</span><span class="mname">${esc(m.Metric)}</span></label>`
        )
        .join('')}</div>` +
      (unsupported.length
        ? `<p class="sb-note" title="${esc(unsupported.map((m) => `${m.Abbreviation} (${m.GroupLevel}-level)`).join(', '))}">
            ${unsupported.length} ${unsupported.length === 1 ? 'metric is' : 'metrics are'} not site-level (${esc(
              [...new Set(unsupported.map((m) => m.GroupLevel))].join('/')
            )}) — held back until a future release adds that plumbing.</p>`
        : '');

    const options = this.store.filterOptions();
    const active = this.store.activeFilterCount();
    const filter =
      Object.entries(options)
        .map(
          ([param, values]) => `<div class="ctl"><label>${esc(FILTER_LABELS[param] ?? param)}</label>
          <div class="chips">${values
            .map((v) => `<button type="button" class="chip ${state.filters[param].has(v) ? 'on' : ''}" data-filter="${esc(param)}" data-value="${esc(v)}">${esc(v)}</button>`)
            .join('')}</div></div>`
        )
        .join('') +
      (active ? `<div class="sb-actions"><button type="button" class="linkbtn" data-clear>Clear filters</button></div>` : '');

    this.innerHTML = `
      <div class="sb-head"><span class="sb-title">Controls</span>
        <button type="button" class="sb-toggle" data-collapse aria-label="Collapse controls" aria-expanded="true" title="Collapse controls">«</button></div>
      ${this.#section('config', 'Config', '', config)}
      ${this.#section('metrics', 'Metrics', `${visible}/${supported.length}`, metrics)}
      ${this.#section('filter', 'Filter', active ? `${active} active` : '', filter)}`;
  }
}

customElements.define('gsm-sidebar', GsmSidebar);

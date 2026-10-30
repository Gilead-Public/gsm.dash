import { StoreElement, esc } from './util.js';
import { STATUS_ORDER } from '../data/catalog.js';
import { statusPill } from './tooltip.js';

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
      const status = e.target.closest('button[data-status]');
      if (status) return this.store.toggleStatus(status.dataset.status);
      const grp = e.target.closest('button[data-group-metrics]');
      if (grp) {
        const group = this.store.metricCategories(this.store.supportedMetrics()).find((g) => g.category === grp.dataset.groupMetrics);
        const ids = (group?.metrics ?? []).map((m) => m.MetricID);
        return this.store.setMetricsVisible(ids, grp.dataset.on !== '1');
      }
    });
    this.addEventListener('change', (e) => {
      if (e.target.matches('select[data-groupby]')) this.store.set('groupBy', e.target.value);
      if (e.target.matches('select[data-heatmap]')) this.store.set('heatmap', e.target.value);
      if (e.target.matches('select[data-highlight]')) this.store.highlight(e.target.value || null);
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

    // One sidebar drives every program view. A control that does not apply to
    // the current view stays visible but disabled, with the reason under it.
    const dist = state.programView === 'distribution';
    const overview = !dist && this.store.tableZoom() === 'overview';
    const ctl = (body, { na = '' } = {}) =>
      `<div class="ctl ${na ? 'na' : ''}"${na ? ' aria-disabled="true"' : ''}>${body}${
        na.trim() ? `<p class="sb-why">${na}</p>` : ''
      }</div>`;
    const tableOnly = dist ? 'Table only: the distribution plots every study on each metric’s line.' : '';

    const studies = this.store.filteredStudies();
    const hl = studies.some((st) => st.StudyID === state.highlightStudy) ? state.highlightStudy : '';
    const highlight = ctl(
      `<label>Highlight study</label><select data-highlight><option value="">None</option>${studies
        .map(
          (st) =>
            `<option value="${esc(st.StudyID)}" ${st.StudyID === hl ? 'selected' : ''}>${esc(st.StudyID)}${
              st.params?.nickname ? ` · ${esc(st.params.nickname)}` : ''
            }</option>`
        )
        .join('')}</select><p class="sb-hint">Marks the study in every view. Click a row or a dot to pick one.</p>`
    );

    // P2: cells follow each metric's glossary display rule by default; the
    // old free-form stack stays available as "Custom".
    const defined = state.cellMode === 'defined';
    const chip = ([k, label]) =>
      `<button type="button" class="chip ${state.show.has(k) ? 'on' : ''}" data-show="${k}" aria-pressed="${state.show.has(k)}">${label}</button>`;
    const extras = [['trend', 'Trend']];
    const cellsNa = dist
      ? 'The distribution shows each value as defined in the glossary.'
      : overview
        ? 'Overview tiles show one headline value per metric. Open a category or switch to Details.'
        : '';
    const config =
      highlight +
      ctl(
        `<label>Cell display</label>${this.#seg('cellMode', [['defined', 'As defined'], ['custom', 'Custom']])}${
          cellsNa
            ? ''
            : `<p class="sb-hint">${defined ? 'Each metric as its glossary defines it: n (%), per 28 days, or %.' : 'The same numbers stacked in every cell.'}</p>`
        }`,
        { na: cellsNa }
      ) +
      ctl(
        `<label>${defined ? 'Also show' : 'Show in each cell'}</label><div class="chips">${(defined
          ? extras
          : [['num', 'Numerator'], ['den', 'Denominator'], ['rate', 'Rate'], ...extras]
        )
          .map(chip)
          .join('')}</div>`,
        { na: cellsNa ? ' ' : '' }
      ) +
      ctl(
        `<label>Heatmap (also drives column sort)</label><select data-heatmap ${dist ? 'disabled' : ''}>${[
          ['none', 'None'], ['num', 'Numerator'], ['den', 'Denominator'], ['rate', 'Rate'],
        ]
          .map(([k, label]) => `<option value="${k}" ${state.heatmap === k ? 'selected' : ''}>${label}</option>`)
          .join('')}</select>`,
        { na: tableOnly }
      ) +
      ctl(`<label>Heatmap color</label>${this.#seg('ramp', RAMPS)}`, { na: dist || state.heatmap === 'none' ? ' ' : '' }) +
      ctl(
        `<label>Group rows by</label><select data-groupby ${dist ? 'disabled' : ''}>${GROUP_BY_OPTIONS.map(
          ([value, label]) => `<option value="${value}" ${value === state.groupBy ? 'selected' : ''}>${label}</option>`
        ).join('')}</select>`,
        { na: tableOnly }
      );

    const supported = this.store.supportedMetrics();
    const unsupported = this.store.unsupportedMetrics();
    const visible = this.store.visibleMetrics().length;
    const statusCount = (st) => supported.filter((m) => (m.Status ?? 'Released') === st).length;
    const metrics =
      `<div class="ctl"><label>Status</label><div class="chips">${STATUS_ORDER.filter(statusCount)
        .map(
          (st) =>
            `<button type="button" class="chip ${state.statuses.has(st) ? 'on' : ''}" data-status="${st}" aria-pressed="${state.statuses.has(st)}">${st}<span class="cnt">${statusCount(st)}</span></button>`
        )
        .join('')}</div></div>` +
      `<div class="sb-actions"><button type="button" class="linkbtn" data-metrics-all="on">All</button><button type="button" class="linkbtn" data-metrics-all="off">None</button></div>` +
      `<div class="metric-list">${this.store
        .metricCategories(supported)
        .map((g) => {
          const on = g.metrics.filter((m) => !state.hiddenMetrics.has(m.MetricID)).length;
          return `<div class="mgroup"><div class="mgroup-head"><span>${esc(g.category)}</span><button type="button" class="linkbtn" data-group-metrics="${esc(
            g.category
          )}" data-on="${on === g.metrics.length ? '1' : '0'}">${on === g.metrics.length ? 'none' : 'all'}</button><span class="cnt">${on}/${g.metrics.length}</span></div>${g.metrics
            .map((m) => {
              const off = !state.statuses.has(m.Status ?? 'Released');
              return `<label class="metric-opt ${off ? 'status-off' : ''}" title="${esc(m.Metric)} · ${esc(m.MetricID)}${off ? ' — hidden by the status filter' : ''}">
            <input type="checkbox" data-metric="${esc(m.MetricID)}" ${state.hiddenMetrics.has(m.MetricID) ? '' : 'checked'}>
            <span class="mono">${esc(m.Abbreviation)}</span><span class="mname">${esc(m.Metric)}</span>${statusPill(m)}</label>`;
            })
            .join('')}</div>`;
        })
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

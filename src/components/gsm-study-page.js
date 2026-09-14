import { StoreElement, esc } from './util.js';
import { attachHoverTooltip, metricInfoIcon } from './tooltip.js';
import { resolveWidget, resolveData, getWidget } from '../widgets/index.js';
import { STUDY_PAGE_SPEC, EXEC_ALLOW_LIST, DETAIL_TABS, STANDARD_TILE_VIEWS, KIND_HELP } from '../app/study-page-spec.js';

/**
 * Study overview page: composes widgets per the framework's Design 3 —
 * metric tiles are metadata-bound (meta.Category rows, meta.Widget view,
 * default scalar-tile); page-level widgets come from the minimal page spec.
 * Every metric tile also offers a drill-in panel (W4) with the standard
 * KRI-report charts as gsm.viz adapter widgets. The host resolves each
 * widget's dataSpec against its layer allow-list and injects the data;
 * widgets never touch the store.
 */
export class GsmStudyPage extends StoreElement {
  #charts = [];

  static get observedAttributes() {
    return ['study-id'];
  }

  attributeChangedCallback() {
    if (this.store) this.render();
  }

  connectedCallback() {
    this.addEventListener('click', (e) => {
      const arrow = e.target.closest('button[data-view-step]');
      if (arrow) {
        const metricId = arrow.dataset.metric;
        const views = this.#viewsFor(this.store.metrics.find((m) => m.MetricID === metricId));
        const idx = views.indexOf(this.#currentView(metricId, views));
        const next = views[(idx + Number(arrow.dataset.viewStep) + views.length) % views.length];
        return this.store.setTileView(metricId, next);
      }
      const more = e.target.closest('button[data-detail-metric]');
      if (more) {
        const metricId = more.dataset.detailMetric;
        const current = this.store.state.detail;
        return this.store.set('detail', {
          metricId: current.metricId === metricId ? null : metricId,
          tab: current.tab,
        });
      }
      if (e.target.closest('button[data-randomize-views]')) return this.#randomizeViews();
      if (e.target.closest('button[data-play]')) return this.#togglePlay();
      if (e.target.closest('button[data-clear-site]')) return this.store.selectSite(null);
      // Any chart mark carrying data-site selects that site everywhere at once.
      const mark = e.target.closest('[data-site]');
      if (mark) return this.store.selectSite(mark.dataset.site);
      const tab = e.target.closest('button[data-detail-tab]');
      if (tab) return this.store.set('detail', { ...this.store.state.detail, tab: tab.dataset.detailTab });
      if (e.target.closest('button[data-detail-close]')) {
        return this.store.set('detail', { ...this.store.state.detail, metricId: null });
      }
    });
    // The scrubber commits on `change` (pointer release), not `input`: a full
    // re-render mid-drag would replace the range element and kill the drag.
    // `input` only retitles the live label, which survives because nothing
    // re-renders.
    this.addEventListener('input', (e) => {
      if (!e.target.matches('input[data-visit]')) return;
      this.#pause();
      const label = this.querySelector('[data-visit-label]');
      if (label) label.textContent = this.#visitDates()[Number(e.target.value)] ?? '—';
    });
    this.addEventListener('change', (e) => {
      if (e.target.matches('input[data-visit]')) return this.#gotoVisit(Number(e.target.value));
      if (e.target.matches('select[data-all-views]')) {
        this.store.setAllTileViews(e.target.value === 'default' ? null : e.target.value);
      }
      if (e.target.matches('input[data-group-cat]')) this.store.set('groupByCategory', e.target.checked);
    });
    attachHoverTooltip(this);
    super.connectedCallback();
  }

  #playTimer = null;

  /** The study's snapshot dates, oldest first — the scrubber's ticks. */
  #visitDates() {
    return this.store.studies.find((st) => st.StudyID === this.#studyId)?.snapshots ?? [];
  }

  /** Index of the visit currently shown (the store's asOf, or the latest). */
  #visitIndex() {
    const dates = this.#visitDates();
    const asOf = this.store.state.asOf;
    const i = asOf ? dates.lastIndexOf(asOf) : dates.length - 1;
    return i < 0 ? dates.length - 1 : i;
  }

  /**
   * Show one visit. Every widget resolves its date through store.latestDate(),
   * which honours asOf — so moving the scrubber re-renders the whole page at
   * that snapshot with no per-widget plumbing. The newest visit clears asOf
   * rather than pinning it, so the page returns to "latest available".
   */
  #gotoVisit(i) {
    const dates = this.#visitDates();
    const clamped = Math.max(0, Math.min(dates.length - 1, i));
    this.store.set('asOf', clamped === dates.length - 1 ? null : dates[clamped]);
  }

  #pause() {
    clearInterval(this.#playTimer);
    this.#playTimer = null;
  }

  /** Step forward through the visits, stopping at the newest. */
  #togglePlay() {
    if (this.#playTimer) {
      this.#pause();
      this.render();
      return;
    }
    const dates = this.#visitDates();
    if (dates.length < 2) return;
    // Replaying from the end restarts from the first visit.
    let i = this.#visitIndex() >= dates.length - 1 ? 0 : this.#visitIndex();
    // Arm the timer BEFORE the first hop: #gotoVisit re-renders, and the
    // button reads #playTimer to choose its glyph.
    this.#playTimer = setInterval(() => {
      i += 1;
      if (i >= dates.length - 1) {
        this.#pause();
        this.#gotoVisit(dates.length - 1);
        return;
      }
      this.#gotoVisit(i);
    }, 1100);
    this.#gotoVisit(i);
  }

  /**
   * Deal every visible tile an independent random view — the counterpart to
   * "all tiles", which sets them all to the SAME view. Useful for showing the
   * range of standard views at a glance. Metrics with custom views can land on
   * those too, since #viewsFor already includes them.
   */
  #randomizeViews() {
    const pick = (metric) => {
      const views = this.#viewsFor(metric);
      return views[Math.floor(Math.random() * views.length)];
    };
    this.store.setTileViews(this.store.visibleMetrics().map((m) => [m.MetricID, pick(m)]));
  }

  /** What the "all tiles" selector should show: a shared view, the per-metric default, or mixed. */
  #allViewsValue(metrics) {
    const chosen = metrics.map((m) => this.store.state.tileViews.get(m.MetricID) ?? null);
    if (chosen.every((v) => v === null)) return 'default';
    const [first] = chosen;
    return first && chosen.every((v) => v === first) ? first : 'mixed';
  }

  disconnectedCallback() {
    this.#pause();
    this.#destroyCharts();
    super.disconnectedCallback();
    // asOf and the site highlight are study-view controls but live on the
    // shared store; leaving them set would silently scope the program table.
    // Reset after super, so this element is no longer listening.
    this.store.state.asOf = null;
    this.store.state.selectedSite = null;
  }

  #destroyCharts() {
    for (const chart of this.#charts) chart?.destroy?.();
    this.#charts = [];
  }

  get #studyId() {
    return this.getAttribute('study-id');
  }

  /** Resolve + render one widget into `container`; returns the widget's render result. */
  #mountWidget(container, name, { metricId, config }) {
    const { def, degraded } = resolveWidget(name, EXEC_ALLOW_LIST);
    if (degraded) container.dataset.degradedFrom = name;
    const data = resolveData(def.dataSpec, { store: this.store, studyId: this.#studyId, metricId });
    const result = def.render(container, data, config ?? {});
    if (result?.chart) this.#charts.push(result.chart);
    return { def, degraded, result };
  }

  /** The views a metric tile can page through: every standard view, then the metric's custom ones. */
  #viewsFor(metric) {
    const custom = [metric?.Widget, ...(metric?.Widgets ?? [])].filter((n) => n && getWidget(n));
    return [...STANDARD_TILE_VIEWS, ...custom.filter((n) => !STANDARD_TILE_VIEWS.includes(n))];
  }

  /** Current view: what the user paged to, else the metric's custom view, else Details. */
  #currentView(metricId, views) {
    const metric = this.store.metrics.find((m) => m.MetricID === metricId);
    const chosen = this.store.state.tileViews.get(metricId) ?? metric?.Widget ?? 'scalar-tile';
    return views.includes(chosen) ? chosen : views[0];
  }

  /** Visit scrubber: play/pause + a range over the study's snapshot dates. */
  #visitScrubber(date) {
    const dates = this.#visitDates();
    const i = this.#visitIndex();
    const playing = Boolean(this.#playTimer);
    if (dates.length < 2) return `<span class="meta">Extract: <b>${esc(date ?? '—')}</b></span>`;
    return `<div class="visits">
      <button type="button" class="play ${playing ? 'on' : ''}" data-play
        aria-label="${playing ? 'Pause' : 'Play'} through visits" title="Animate the charts across visits">${playing ? '❚❚' : '▶'}</button>
      <input type="range" data-visit min="0" max="${dates.length - 1}" value="${i}" step="1"
        aria-label="Visit" title="Pick a visit" />
      <span class="meta">Visit <b>${i + 1}/${dates.length}</b> · <b data-visit-label>${esc(dates[i] ?? date ?? '—')}</b></span>
    </div>`;
  }

  /** The current cross-chart site highlight, with a way out of it. */
  #siteChip() {
    const site = this.store.state.selectedSite;
    if (!site) return '';
    const params = this.store.groupRows(this.#studyId, this.store.latestDate(this.#studyId))
      .filter((r) => r.GroupID === site && r.GroupLevel === 'Site');
    const name = params.find((r) => r.Param === 'Site')?.Value;
    return `<span class="sitechip" title="Highlighted in every chart on this page">
      <i></i><span class="mono">${esc(site)}</span>${name ? `<span class="nm">${esc(name)}</span>` : ''}
      <button type="button" data-clear-site aria-label="Clear site highlight">✕</button></span>`;
  }

  #kindBadge(def) {
    return `<span class="kind kind-${def.kind}" title="${esc(KIND_HELP[def.kind] ?? '')}">${def.kind}</span>`;
  }

  #tile(container, metric) {
    const views = this.#viewsFor(metric);
    const current = this.#currentView(metric.MetricID, views);
    const idx = views.indexOf(current);
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.metricId = metric.MetricID;
    container.append(tile);
    const body = document.createElement('div');
    body.className = 'tile-body';
    tile.append(body);
    const config = current === metric.Widget ? metric.WidgetConfig : undefined;
    const { def } = this.#mountWidget(body, current, { metricId: metric.MetricID, config });
    if (def.size) tile.classList.add(def.size);
    const open = this.store.state.detail.metricId === metric.MetricID;
    // The tile owns the metric's identity so it reads the same in every view;
    // views add only a chart subheader when one helps.
    tile.insertAdjacentHTML(
      'afterbegin',
      `<div class="tile-head"><span class="abbr">${esc(metric.Abbreviation)}</span><span class="name">${esc(
        metric.Metric
      )}</span>${metricInfoIcon(metric)}${this.#kindBadge(def)}</div>`
    );
    tile.insertAdjacentHTML(
      'beforeend',
      `<div class="tile-foot">
        <button type="button" class="vbtn" data-view-step="-1" data-metric="${esc(metric.MetricID)}" aria-label="Previous view">‹</button>
        <span class="view-name" title="${esc(def.label)} — view ${idx + 1} of ${views.length}">${esc(def.label)} <span class="muted">${idx + 1}/${views.length}</span></span>
        <button type="button" class="vbtn" data-view-step="1" data-metric="${esc(metric.MetricID)}" aria-label="Next view">›</button>
        <button type="button" class="tile-more ${open ? 'on' : ''}" data-detail-metric="${esc(metric.MetricID)}" aria-expanded="${open}" title="Full-size gsm.viz charts">Charts ${open ? '▴' : '▾'}</button>
      </div>`
    );
  }

  #detailPanel(row, metric) {
    const { tab } = this.store.state.detail;
    const panel = document.createElement('div');
    panel.className = 'detail';
    const tabDef = getWidget(tab);
    panel.innerHTML = `
      <div class="detail-head">
        <span class="abbr">${esc(metric.Abbreviation)}</span><span class="detail-title">${esc(
        metric.Metric
      )}</span>${metricInfoIcon(metric)}${tabDef ? this.#kindBadge(tabDef) : ''}
        <div class="tabs" role="tablist">${DETAIL_TABS.map(
          (t) => `<button type="button" role="tab" class="${t.widget === tab ? 'on' : ''}" data-detail-tab="${t.widget}" aria-selected="${t.widget === tab}">${t.label}</button>`
        ).join('')}</div>
        <button type="button" class="detail-close" data-detail-close aria-label="Close charts">✕</button>
      </div>
      <div class="detail-body"></div>`;
    row.append(panel);
    const { degraded } = this.#mountWidget(panel.querySelector('.detail-body'), tab, { metricId: metric.MetricID });
    if (degraded) {
      panel.querySelector('.detail-body').insertAdjacentHTML('afterbegin', `<p class="muted small">This chart needs a data layer this build does not carry; showing the fallback view.</p>`);
    }
  }

  render() {
    this.#destroyCharts();
    const study = this.store.studies.find((s) => s.StudyID === this.#studyId);
    if (!study) {
      this.innerHTML = `<p class="muted">Unknown study: ${esc(this.#studyId ?? '')}</p>`;
      return;
    }
    const spec = STUDY_PAGE_SPEC;
    const date = this.store.latestDate(study.StudyID);
    const detail = this.store.state.detail;
    const params = ['therapeutic_area', 'protocol_indication', 'phase', 'status', 'product']
      .filter((p) => study.params[p] != null)
      .map((p) => `<span>${esc(study.params[p])}</span>`)
      .join(' · ');

    const visible = this.store.visibleMetrics();
    const grouped = this.store.state.groupByCategory;
    // Rows: lifecycle categories from metric metadata, or one flat grid in catalog order.
    const categories = grouped ? new Map(spec.rows.map((row) => [row, []])) : new Map([['All metrics', []]]);
    for (const metric of visible) {
      const row = grouped ? (categories.has(metric.Category) ? metric.Category : spec.otherRow) : 'All metrics';
      if (!categories.has(row)) categories.set(row, []);
      categories.get(row).push(metric);
    }
    const rowLabel = (row) => (grouped ? (/quality/i.test(row) ? row : `${row} quality`) : `${row} · ${visible.length}`);

    const allViews = this.#allViewsValue(visible);
    const viewOptions = [
      ['default', 'Default per metric'],
      ...STANDARD_TILE_VIEWS.map((name) => [name, getWidget(name)?.label ?? name]),
      ...(allViews === 'mixed' ? [['mixed', 'Mixed']] : []),
    ];

    this.innerHTML = `
      <a href="#/program" class="back">← Program overview</a>
      <div class="dd-head">
        <span class="study mono">${esc(study.StudyID)}</span>${
          study.params.nickname ? `<span class="study nick">${esc(study.params.nickname)}</span>` : ''
        }
        <span class="meta">${params}</span>
        ${this.#visitScrubber(date)}
        ${this.#siteChip()}
        <div class="dd-controls">
          <label class="toggle"><input type="checkbox" data-group-cat ${grouped ? 'checked' : ''}> Group by category</label>
          <label class="all-views"><span>All tiles</span>
            <select data-all-views aria-label="Set every tile to a view">${viewOptions
              .map(([v, label]) => `<option value="${esc(v)}" ${v === allViews ? 'selected' : ''} ${v === 'mixed' ? 'disabled' : ''}>${esc(label)}</option>`)
              .join('')}</select></label>
          <button type="button" class="randomize" data-randomize-views title="Give every tile a different randomly chosen view">⤨ Randomize</button>
        </div>
      </div>
      ${[...categories.keys()]
        .map((row) => `<div class="dd-row" data-row="${esc(row)}"><div class="rowlab">${esc(rowLabel(row))}</div><div class="tiles"></div></div>`)
        .join('')}`;

    for (const [row, metrics] of categories) {
      const rowEl = this.querySelector(`[data-row="${CSS.escape(row)}"]`);
      const container = rowEl.querySelector('.tiles');
      for (const metric of metrics) this.#tile(container, metric);
      for (const pw of spec.pageWidgets.filter((w) => w.row === row)) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        container.append(tile);
        const body = document.createElement('div');
        body.className = 'tile-body';
        tile.append(body);
        const { def } = this.#mountWidget(body, pw.widget, { config: pw.config });
        if (def.size) tile.classList.add(def.size);
        tile.insertAdjacentHTML('afterbegin', `<div class="tile-head">${this.#kindBadge(def)}</div>`);
      }
      // The drill-in panel sits directly under the row that owns the selected metric.
      const selected = metrics.find((m) => m.MetricID === detail.metricId);
      if (selected) this.#detailPanel(rowEl, selected);
    }
  }
}

customElements.define('gsm-study-page', GsmStudyPage);

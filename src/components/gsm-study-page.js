import { StoreElement, esc } from './util.js';
import { resolveWidget, resolveData } from '../widgets/index.js';
import { STUDY_PAGE_SPEC, EXEC_ALLOW_LIST } from '../app/study-page-spec.js';

/**
 * Study overview page: composes widgets per the framework's Design 3 —
 * metric tiles are metadata-bound (meta.Category rows, meta.Widget view,
 * default scalar-tile); page-level widgets come from the minimal page spec.
 * The host resolves each widget's dataSpec against its layer allow-list and
 * injects the data; widgets never touch the store.
 */
export class GsmStudyPage extends StoreElement {
  static get observedAttributes() {
    return ['study-id'];
  }

  attributeChangedCallback() {
    if (this.store) this.render();
  }

  #mountWidget(container, name, { metricId, config }) {
    const tile = document.createElement('div');
    tile.className = 'tile';
    container.append(tile);
    const { def, degraded } = resolveWidget(name, EXEC_ALLOW_LIST);
    if (degraded) tile.dataset.degradedFrom = name;
    const data = resolveData(def.dataSpec, { store: this.store, studyId: this.#studyId, metricId });
    def.render(tile, data, config ?? {});
  }

  get #studyId() {
    return this.getAttribute('study-id');
  }

  render() {
    const study = this.store.studies.find((s) => s.StudyID === this.#studyId);
    if (!study) {
      this.innerHTML = `<p class="muted">Unknown study: ${esc(this.#studyId ?? '')}</p>`;
      return;
    }
    const spec = STUDY_PAGE_SPEC;
    const date = this.store.latestDate(study.StudyID);
    const params = ['therapeutic_area', 'protocol_indication', 'phase', 'status', 'product']
      .filter((p) => study.params[p] != null)
      .map((p) => `<span>${esc(study.params[p])}</span>`)
      .join(' · ');

    const categories = new Map(spec.rows.map((row) => [row, []]));
    for (const metric of this.store.visibleMetrics()) {
      const row = categories.has(metric.Category) ? metric.Category : spec.otherRow;
      if (!categories.has(row)) categories.set(row, []);
      categories.get(row).push(metric);
    }

    this.innerHTML = `
      <a href="#/program" class="back">← Program overview</a>
      <div class="dd-head">
        <span class="study mono">${esc(study.StudyID)}</span>${
          study.params.nickname ? `<span class="study nick">${esc(study.params.nickname)}</span>` : ''
        }
        <span class="meta">${params}</span>
        <span class="meta">Extract: <b>${esc(date ?? '—')}</b></span>
      </div>
      ${[...categories.entries()]
        .filter(([, metrics]) => metrics.length || spec.pageWidgets.some((w) => w.row === undefined))
        .map(([row]) => `<div class="dd-row" data-row="${esc(row)}"><div class="rowlab">${esc(/quality/i.test(row) ? row : `${row} quality`)}</div><div class="tiles"></div></div>`)
        .join('')}`;

    for (const [row, metrics] of categories) {
      const container = this.querySelector(`[data-row="${CSS.escape(row)}"] .tiles`);
      if (!container) continue;
      for (const metric of metrics) {
        this.#mountWidget(container, metric.Widget, { metricId: metric.MetricID, config: metric.WidgetConfig });
      }
      for (const pw of spec.pageWidgets.filter((w) => w.row === row)) {
        this.#mountWidget(container, pw.widget, { config: pw.config });
      }
    }
  }
}

customElements.define('gsm-study-page', GsmStudyPage);

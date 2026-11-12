import { StoreElement, esc, fmtInt } from './util.js';
import { attachHoverTooltip, metricInfoIcon, metricTip, statusPill } from './tooltip.js';
import { fmtMetric, fmtRate, metricUnit } from '../util/format.js';
import { sparkline } from '../charts/sparkline.js';
import {
  POP_COLUMNS, MEASURE_LABELS, bandTitle, cellTip, heatClasses, metricHeadTip, popHeadTip, popTip, popValue, sortMeasure,
  studyTip, tableRows, tableShowing, tileTip,
} from '../app/portfolio-table.js';

/**
 * D1/D3/D4/D5 — the program-page rollup table.
 * Rows: portfolio total, then one row per study (grouping "None") or one row
 * per group-by bucket (click to expand per-study contributions). Every row is
 * a rollup over site-level rows — one study or many, same math. Dispatches a
 * bubbling `studySelected` CustomEvent ({detail: {StudyID}}) when a study
 * link is clicked — extending the gsm.viz event vocabulary
 * (riskSignalSelected / groupSelected). Clicking anywhere else on a study row
 * highlights that study in every program view.
 *
 * One table serves both Overview and Details: a folded category shows one
 * headline value per metric (tiles); an open one shows full cells.
 */
export class GsmPortfolioTable extends StoreElement {
  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('click', (e) => {
      const studyLink = e.target.closest('a[data-study]');
      if (studyLink) {
        e.preventDefault();
        this.dispatchEvent(
          new CustomEvent('studySelected', { bubbles: true, detail: { StudyID: studyLink.dataset.study } })
        );
        return;
      }
      // The metric-definition icon lives inside sortable / foldable headers;
      // hovering it is the point, so a click on it must do nothing else.
      if (e.target.closest('.info')) return;
      const fold = e.target.closest('[data-fold]');
      if (fold) return this.store.toggleGroup(fold.dataset.fold);
      const bucketCell = e.target.closest('tr[data-bucket] td.grp');
      if (bucketCell) return this.store.toggleExpanded(bucketCell.parentElement.dataset.bucket);
      const th = e.target.closest('th[data-sort]');
      if (th) return this.store.toggleSort(th.dataset.sort, { numeric: th.dataset.sort !== 'label' });
      const row = e.target.closest('tr[data-hl]');
      if (row) this.store.highlight(row.dataset.hl);
    });
    attachHoverTooltip(this);
  }

  #sparks = [];

  /**
   * One cell. In "defined" mode (P2) the first line is the metric's glossary
   * display rule — n (%), per 28 days, or % — and the sidebar's "also show"
   * trend stacks under it. In "custom" mode every metric shows the same
   * numerator / denominator / rate stack, as before the glossary review.
   */
  #cell(rollup, metric, label, heatClass, studies) {
    const { show, cellMode } = this.store.state;
    const lines = [];
    if (cellMode === 'defined') {
      lines.push(`<span class="cell-main">${fmtMetric(metric, rollup).html}</span>`);
    } else {
      if (show.has('num') || show.has('den')) {
        const nums = [show.has('num') && fmtInt(rollup.Numerator), show.has('den') && fmtInt(rollup.Denominator)].filter(Boolean);
        lines.push(`<span class="cell-nums">${nums.join(' / ')}</span>`);
      }
      if (show.has('rate')) lines.push(`<span class="cell-rate ${lines.length ? 'secondary' : ''}">${fmtRate(metric, rollup.Rate)}</span>`);
    }
    if (show.has('trend')) {
      // The series is computed now; the SVG is drawn after the DOM exists.
      const idx = this.#sparks.push({ series: this.store.trendSeries(metric.MetricID, studies), label }) - 1;
      lines.push(`<span class="spark" data-spark="${idx}"></span>`);
    }
    const planned = metric.Status === 'Planned' ? 'planned' : '';
    return `<td class="${heatClass} ${planned}" data-tip="${esc(cellTip(rollup, metric, label))}"><div class="cell">${lines.join('')}</div></td>`;
  }

  /**
   * A folded category (Overview): one headline tile per metric — the rate in
   * its display unit (per 28 days or %). Counts need the open category.
   */
  #tiles(row, group, heatClass) {
    const tiles = group.metrics
      .map((m) => {
        const rollup = row.rollup(m.MetricID);
        const planned = m.Status === 'Planned' ? 'pl' : '';
        return `<span class="otile ${planned} ${heatClass(row, m)}" data-tip="${esc(tileTip(row.label, m, rollup))}">${fmtRate(m, rollup.Rate)}</span>`;
      })
      .join('');
    return `<td class="cat gs"><span class="otiles">${tiles}</span></td>`;
  }

  render() {
    const store = this.store;
    const { state } = store;
    const { sort, heatmap } = state;
    const metrics = store.visibleMetrics();
    const groups = store.metricCategories(metrics).map((g) => ({ ...g, collapsed: state.collapsedGroups.has(g.category) }));
    const { filtered, latest, flat, total, primary } = tableRows(store);
    const heatClass = heatClasses(heatmap, metrics, primary);
    this.#sparks = [];
    this.dataset.ramp = state.ramp;

    // --- header: a category band row over a metric row (P3) ---
    // `label` is raw HTML (the metric headers embed an ⓘ). `tip` uses the
    // shared hover tooltip; `title` is the native one — never both on a cell,
    // or two tooltips race each other.
    const th = (key, label, { classes = '', title = '', tip = '', attrs = '' } = {}) => {
      const active = sort.key === key;
      const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
      return `<th data-sort="${esc(key)}" class="sortable ${classes} ${active ? 'active' : ''}" aria-sort="${ariaSort}"${
        title ? ` title="${esc(title)}"` : ''
      }${tip ? ` data-tip="${esc(tip)}"` : ''} ${attrs}>${label}${
        active ? `<span class="si" aria-hidden="true">${sort.dir === 'asc' ? '▲' : '▼'}</span>` : ''
      }</th>`;
    };
    const measureLabel = MEASURE_LABELS[sortMeasure(heatmap)];
    const bandRow =
      `<tr class="band">` +
      `${th('label', flat ? 'Study' : 'Group', { classes: 'grp', attrs: 'rowspan="2"' })}` +
      `${th('meta', flat ? 'Snapshot' : 'Studies', { attrs: 'rowspan="2"' })}` +
      `<th colspan="2" class="bandh pop gs">Population</th>` +
      groups
        .map((g) => {
          const n = g.metrics.length;
          const btn = `<button type="button" class="fold" aria-expanded="${!g.collapsed}" aria-label="${
            g.collapsed ? 'Open' : 'Fold'
          } ${esc(g.category)}">${g.collapsed ? '+' : '−'}</button>`;
          const attrs = `data-band="${esc(g.category)}" data-fold="${esc(g.category)}"`;
          if (!g.collapsed) {
            return `<th colspan="${n}" class="bandh gs open" ${attrs} title="${esc(bandTitle(g.category, false))}">${btn}${esc(g.category)}<span class="tw">${n}</span></th>`;
          }
          const statuses = [...new Set(g.metrics.map((m) => m.Status ?? 'Released'))];
          const pill = statuses.length === 1 ? statusPill(g.metrics[0]) : '';
          const labels = g.metrics
            .map((m) => `<span class="tlab" data-abbr="${esc(m.Abbreviation)}" data-tip="${esc(metricTip(m))}">${esc(m.Abbreviation)}</span>`)
            .join('');
          return `<th rowspan="2" class="bandh gs closed" ${attrs} title="${esc(bandTitle(g.category, true))}">${btn}${esc(g.category)}<span class="u">${n} metric${
            n === 1 ? '' : 's'
          }${pill}</span><span class="otiles">${labels}</span></th>`;
        })
        .join('') +
      `</tr>`;
    const metricHead = (m, first) => {
      const planned = m.Status === 'Planned';
      return th(m.MetricID, `${esc(m.Abbreviation)}${metricInfoIcon(m)}<span class="u">${esc(metricUnit(m))}</span>${statusPill(m)}`, {
        classes: `${first ? 'gs' : ''} ${planned ? 'planned' : ''}`,
        tip: metricHeadTip(m, measureLabel),
        attrs: `data-abbr="${esc(m.Abbreviation)}"`,
      });
    };
    const colRow =
      `<tr class="cols">` +
      POP_COLUMNS
        .map((col) =>
          th(col.key, `${col.short}<span class="u">n</span>`, {
            classes: `pop ${col.cls} ${col.key === 'pop:screened' ? 'gs' : ''}`,
            tip: popHeadTip(col),
          })
        )
        .join('') +
      groups
        .filter((g) => !g.collapsed)
        .map((g) => g.metrics.map((m, i) => metricHead(m, i === 0)).join(''))
        .join('') +
      `</tr>`;
    const head = `<thead>${bandRow}${colRow}</thead>`;

    // --- body ---
    const popCells = (row) => {
      const pop = row.population();
      const tip = esc(popTip(row.label, pop, row.studies.filter((s) => latest.has(s.StudyID)).length));
      return POP_COLUMNS
        .map(({ key, cls }) => {
          const v = popValue(pop, key);
          return `<td class="pop ${cls} ${key === 'pop:screened' ? 'gs' : ''}" data-tip="${tip}">${v == null ? '<span class="muted">—</span>' : fmtInt(v)}</td>`;
        })
        .join('');
    };
    const cells = (row) =>
      groups
        .map((g) =>
          g.collapsed
            ? this.#tiles(row, g, heatClass)
            : g.metrics
                .map((m, i) => {
                  const html = this.#cell(row.rollup(m.MetricID), m, `${row.label} · ${m.Abbreviation}`, heatClass(row, m), row.studies);
                  return i === 0 ? html.replace('<td class="', '<td class="gs ') : html;
                })
                .join('')
        )
        .join('');
    const studyRowHTML = (row, child) => {
      const { study, meta: date } = row;
      const nick = study.params?.nickname;
      const hl = state.highlightStudy === study.StudyID;
      return `<tr class="study ${child ? 'child' : ''} ${hl ? 'sel' : ''}" data-hl="${esc(study.StudyID)}" title="Click to highlight in every view">
        <td class="grp"><a href="#/study/${esc(study.StudyID)}" data-study="${esc(study.StudyID)}" class="mono">${esc(study.StudyID)}</a>${
          nick ? `<span class="nick">${esc(nick)}</span>` : ''
        }<span class="info" data-tip="${esc(studyTip(study, date))}" role="img" aria-label="Study details">i</span></td>
        <td class="nstud">${esc(date)}</td>${popCells(row)}${cells(row)}</tr>`;
    };

    let body = `<tr class="total"><td class="grp">Portfolio total</td><td class="nstud">${filtered.length}</td>${popCells(total)}${cells(total)}</tr>`;
    for (const row of primary) {
      if (row.kind === 'study') {
        body += studyRowHTML(row, false);
        continue;
      }
      body += `<tr class="bucket ${row.open ? 'open' : ''}" data-bucket="${esc(row.label)}">
        <td class="grp"><span class="tri" aria-hidden="true">▶</span>${esc(row.label)}</td>
        <td class="nstud">${row.meta}</td>${popCells(row)}${cells(row)}</tr>`;
      if (row.open) for (const child of row.children) body += studyRowHTML(child, true);
    }

    const showing = tableShowing(store, filtered, metrics, store.tableZoom(groups.map((g) => g.category)));
    this.innerHTML = `
      <div class="showing">${esc(showing.lead)}${showing.highlight ? ` · highlighting <b>${esc(showing.highlight)}</b>` : ''}${esc(showing.sortNote)}</div>
      <div class="tblwrap"><table class="po">${head}<tbody>${body}</tbody></table></div>`;

    for (const el of this.querySelectorAll('.spark')) {
      const { series, label } = this.#sparks[Number(el.dataset.spark)];
      sparkline(el, series, { width: 64, height: 20, label: `${label} trend` });
    }
  }
}

customElements.define('gsm-portfolio-table', GsmPortfolioTable);

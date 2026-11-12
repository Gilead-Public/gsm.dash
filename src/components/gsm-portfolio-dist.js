import { StoreElement, esc } from './util.js';
import { attachHoverTooltip, metricInfoIcon, statusPill } from './tooltip.js';
import { metricUnit } from '../util/format.js';
import { distRow, distShowing, distStudies } from '../app/portfolio-dist.js';

/**
 * Distribution view of the program page: one line per metric, one dot per
 * study at its latest snapshot, the pooled portfolio value as a rule and the
 * highlighted study as a labelled diamond. Shares every sidebar control with
 * the table except row order and grouping, which a strip plot has no use for.
 * Categories fold independently of the table's bands.
 */
export class GsmPortfolioDist extends StoreElement {
  connectedCallback() {
    super.connectedCallback();
    this.addEventListener('click', (e) => {
      if (e.target.closest('.info')) return;
      const cat = e.target.closest('[data-dfold]');
      if (cat) return this.store.toggleDistGroup(cat.dataset.dfold);
      const pt = e.target.closest('[data-pick]');
      if (pt) this.store.highlight(pt.dataset.pick);
    });
    attachHoverTooltip(this);
  }

  render() {
    const store = this.store;
    const { state } = store;
    const plotted = distStudies(store);
    const { sel } = plotted;
    const selName = sel ? esc(sel.params?.nickname ?? sel.StudyID) : '';

    const metricRow = (m) => {
      const row = distRow(store, m, plotted);
      const dots = row.dots.map((d) => `<span class="pt" style="left:${d.left}%" data-pick="${esc(d.id)}" data-tip="${esc(d.tip)}"></span>`).join('');
      const mark = row.mark
        ? `<span class="psel" style="left:${row.mark.left}%" data-pick="${esc(row.mark.id)}" data-tip="${esc(row.mark.tip)}"></span>` +
          `<span class="lsel" style="left:${row.mark.labelLeft}%">${row.mark.label}</span>`
        : '';
      const selLine = sel ? `<div class="sv">${selName} <b>${esc(row.selValue)}</b></div>` : '';
      const rule = row.rule ? `<span class="ptot" style="left:${row.rule.left}%" data-tip="${esc(row.rule.tip)}"></span>` : '';
      return `<div class="dcols mrow ${m.Status === 'Planned' ? 'plan' : ''}" data-metric="${esc(m.MetricID)}">
        <div class="mn"><b>${esc(m.Metric)}</b><span class="ab" data-abbr="${esc(m.Abbreviation)}">${esc(m.Abbreviation)}</span>${metricInfoIcon(m)}${statusPill(m)}<span class="u">${esc(
          metricUnit(m)
        )}</span></div>
        <div class="track ${sel ? 'dim' : ''}" role="img" aria-label="${esc(m.Metric)}: ${row.count} studies"><span class="tick">0</span><span class="tick r">${row.maxLabel}</span>${dots}${rule}${mark}</div>
        <div class="pv"><div class="m">${esc(row.totalValue)}</div>${selLine}</div>
      </div>`;
    };

    const html = store
      .metricCategories()
      .map((g) => {
        const folded = state.distCollapsed.has(g.category);
        const n = g.metrics.length;
        const head =
          `<div class="dcols dcat ${folded ? 'folded' : ''}" data-dfold="${esc(g.category)}" data-band="${esc(g.category)}" role="button" aria-expanded="${!folded}">` +
          `<h4><span class="tog">${folded ? '+' : '−'}</span>${esc(g.category)}<small>${n} metric${n === 1 ? '' : 's'}</small></h4>` +
          (folded
            ? `<span class="dfold">${g.metrics.map((m) => esc(m.Abbreviation)).join(' · ')} · click to open</span>`
            : `<span class="colh l">Each dot = one study · scale 0 → max</span><span class="colh">Portfolio${sel ? ` · ${selName}` : ''}</span>`) +
          `</div>`;
        return folded ? head : head + g.metrics.map(metricRow).join('');
      })
      .join('');
    const showing = distShowing(store, plotted.studies, sel);
    this.innerHTML = `
      <div class="showing">${esc(showing.lead)}${showing.highlight ? ` · highlighting <b>${esc(showing.highlight)}</b>` : ''}</div>
      <div class="dist">${html || '<p class="muted">No metrics selected.</p>'}</div>
      <p class="notes"><span><b>Dot</b> = one study's value; the black rule is the pooled portfolio value.</span><span><b>Click</b> a dot to highlight that study, a category to fold it.</span></p>`;
  }
}

customElements.define('gsm-portfolio-dist', GsmPortfolioDist);

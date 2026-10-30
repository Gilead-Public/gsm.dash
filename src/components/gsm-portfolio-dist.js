import { StoreElement, esc, fmtInt } from './util.js';
import { attachHoverTooltip, metricInfoIcon, statusPill } from './tooltip.js';
import { fmtMetric, displayRate, displayLabel, metricUnit } from '../util/format.js';
import { stripScale, axisLabel } from '../scales/strip.js';

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
    const filtered = store.filteredStudies();
    const latest = store.latestFor(filtered);
    const studies = filtered.filter((s) => latest.has(s.StudyID));
    const sel = studies.find((s) => s.StudyID === state.highlightStudy) ?? null;
    const label = (s) => `${s.StudyID}${s.params?.nickname ? ` · ${s.params.nickname}` : ''}`;
    const selName = sel ? esc(sel.params?.nickname ?? sel.StudyID) : '';

    const metricRow = (m) => {
      const rollups = studies.map((s) => ({ s, r: store.rollup([s], m.MetricID) }));
      const total = store.rollup(filtered, m.MetricID);
      const totalV = displayRate(m, total.Rate);
      const { max, x } = stripScale(rollups.map(({ r }) => displayRate(m, r.Rate)), totalV);
      const tip = (who, r) =>
        esc(
          `<b>${esc(who)}</b><br><span class="tip-muted">${esc(m.Metric)}</span><br>` +
            `${esc(fmtMetric(m, r).text)} <span class="tip-muted">— ${esc(displayLabel(m))}</span><br>` +
            `Σn/Σd = ${fmtInt(r.Numerator)} / ${fmtInt(r.Denominator)}`
        );
      const dots = rollups
        .filter(({ s, r }) => s !== sel && r.Rate != null)
        .map(
          ({ s, r }) =>
            `<span class="pt" style="left:${x(displayRate(m, r.Rate)).toFixed(2)}%" data-pick="${esc(s.StudyID)}" data-tip="${tip(label(s), r)}${esc(
              '<br><span class="tip-muted">Click to highlight this study</span>'
            )}"></span>`
        )
        .join('');
      let mark = '';
      let selLine = '';
      if (sel) {
        const r = rollups.find((o) => o.s === sel).r;
        const v = displayRate(m, r.Rate);
        if (v != null) {
          mark =
            `<span class="psel" style="left:${x(v).toFixed(2)}%" data-pick="${esc(sel.StudyID)}" data-tip="${tip(label(sel), r)}"></span>` +
            `<span class="lsel" style="left:${Math.min(95, Math.max(4, x(v))).toFixed(2)}%">${axisLabel(m, v)}</span>`;
        }
        selLine = `<div class="sv">${selName} <b>${esc(fmtMetric(m, r).text)}</b></div>`;
      }
      const rule = totalV == null ? '' : `<span class="ptot" style="left:${x(totalV).toFixed(2)}%" data-tip="${tip(`Portfolio total · ${filtered.length} studies`, total)}"></span>`;
      return `<div class="dcols mrow ${m.Status === 'Planned' ? 'plan' : ''}" data-metric="${esc(m.MetricID)}">
        <div class="mn"><b>${esc(m.Metric)}</b><span class="ab" data-abbr="${esc(m.Abbreviation)}">${esc(m.Abbreviation)}</span>${metricInfoIcon(m)}${statusPill(m)}<span class="u">${esc(
          metricUnit(m)
        )}</span></div>
        <div class="track ${sel ? 'dim' : ''}" role="img" aria-label="${esc(m.Metric)}: ${rollups.length} studies"><span class="tick">0</span><span class="tick r">${axisLabel(m, max)}</span>${dots}${rule}${mark}</div>
        <div class="pv"><div class="m">${esc(fmtMetric(m, total).text)}</div>${selLine}</div>
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
    const hl = sel ? ` · highlighting <b>${esc(label(sel))}</b>` : '';
    this.innerHTML = `
      <div class="showing">Showing ${studies.length} / ${store.studies.length} studies · ${store.visibleMetrics().length} / ${
        store.supportedMetrics().length
      } site-level metrics · each study at its own latest snapshot${hl}</div>
      <div class="dist">${html || '<p class="muted">No metrics selected.</p>'}</div>
      <p class="notes"><span><b>Dot</b> = one study's value; the black rule is the pooled portfolio value.</span><span><b>Click</b> a dot to highlight that study, a category to fold it.</span></p>`;
  }
}

customElements.define('gsm-portfolio-dist', GsmPortfolioDist);

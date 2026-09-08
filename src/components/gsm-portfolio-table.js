import { StoreElement, esc, fmtPct, fmtInt } from './util.js';
import { shareBin, SEVERITY_ORDER } from '../scales/flags.js';
import { sparkline } from '../charts/sparkline.js';

/**
 * D1/D3/D4/D5 — the program-page rollup table.
 * Rows: portfolio total, a trend (sparkline) row, one row per group-by bucket
 * (click to expand per-study contributions), study rows with their own
 * snapshot dates. Dispatches a bubbling `studySelected` CustomEvent
 * ({detail: {StudyID}}) when a study link is clicked — extending the gsm.viz
 * event vocabulary (riskSignalSelected / groupSelected).
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
      const bucketCell = e.target.closest('tr[data-bucket] td.grp');
      if (bucketCell) this.store.toggleExpanded(bucketCell.parentElement.dataset.bucket);
    });
    this.addEventListener('mousemove', (e) => this.#moveTooltip(e));
    this.addEventListener('mouseleave', () => this.#hideTooltip());
  }

  #tooltip() {
    let tip = document.getElementById('gsm-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'gsm-tooltip';
      tip.setAttribute('role', 'tooltip');
      tip.hidden = true;
      document.body.append(tip);
    }
    return tip;
  }

  #moveTooltip(e) {
    const cell = e.target.closest('[data-tip]');
    const tip = this.#tooltip();
    if (!cell) {
      tip.hidden = true;
      return;
    }
    tip.innerHTML = cell.dataset.tip;
    tip.hidden = false;
    const x = Math.min(e.clientX + 14, window.innerWidth - 280);
    const y = e.clientY + 130 > window.innerHeight ? e.clientY - 110 : e.clientY + 16;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }

  #hideTooltip() {
    const tip = document.getElementById('gsm-tooltip');
    if (tip) tip.hidden = true;
  }

  #sparks = [];

  #cell(studies, metric, label) {
    const { state } = this.store;
    const rollup = this.store.rollup(studies, metric.MetricID);
    let value;
    if (state.show === 'rate') value = fmtPct(rollup.Rate);
    else if (state.show === 'count') value = `<span class="mono">${fmtInt(rollup.Numerator)}/${fmtInt(rollup.Denominator)}</span>`;
    else {
      // Trend mode: the series is computed now, the SVG is drawn after the DOM exists.
      const idx = this.#sparks.push({ series: this.store.trendSeries(metric.MetricID, studies), label }) - 1;
      value = `<span class="spark" data-spark="${idx}"></span>`;
    }
    const heatClass = state.heatmap === 'share' ? shareBin(rollup.flags.share) : '';
    const bar =
      state.heatmap === 'dist'
        ? `<div class="cellbar">${SEVERITY_ORDER.filter((s) => rollup.flags[s] > 0)
            .map((s) => `<i class="flag-${s}" style="flex:${rollup.flags[s]}"></i>`)
            .join('')}</div>`
        : '';
    const tip =
      `<b>${esc(label)}</b><br>` +
      `Σn/Σd = ${fmtInt(rollup.Numerator)} / ${fmtInt(rollup.Denominator)} = ${fmtPct(rollup.Rate)}<br>` +
      `sites: ${rollup.flags.red}R · ${rollup.flags.amber}A · ${rollup.flags.green}G · ${rollup.flags.na}NA<br>` +
      `${rollup.NumStudies} ${rollup.NumStudies === 1 ? 'study' : 'studies'}, each at its latest snapshot`;
    return `<td class="${heatClass}" data-tip="${esc(tip)}">${value}${bar}</td>`;
  }

  #studyTip(study, date) {
    const p = study.params ?? {};
    const rows = [
      ['Therapeutic area', p.therapeutic_area],
      ['Indication', p.protocol_indication],
      ['Phase', p.phase],
      ['Status', p.status],
      ['Product', p.product],
      ['Participants', p.ParticipantCount],
    ].filter(([, v]) => v != null);
    return (
      `<b>${esc(study.StudyID)}${p.nickname ? ` · ${esc(p.nickname)}` : ''}</b><br>` +
      rows.map(([k, v]) => `${k}: ${esc(v)}`).join('<br>') +
      `<br>Snapshot: ${esc(date)} (${study.snapshots.length} available)`
    );
  }

  render() {
    const store = this.store;
    const { state } = store;
    const metrics = store.visibleMetrics();
    const filtered = store.filteredStudies();
    const latest = store.latestFor(filtered);
    this.#sparks = [];
    this.dataset.ramp = state.ramp;

    const head = `<thead><tr><th class="grp">${state.groupBy === 'none' ? 'Study' : 'Group'}</th><th>${
      state.groupBy === 'none' ? 'Snapshot' : 'Studies'
    }</th>${metrics
      .map((m) => `<th title="${esc(m.Metric)} · ${esc(m.MetricID)}">${esc(m.Abbreviation)}</th>`)
      .join('')}</tr></thead>`;

    const rollupCells = (studies, label) =>
      metrics.map((m) => this.#cell(studies, m, `${label} · ${m.Abbreviation}`)).join('');

    // A study row is a one-study rollup: same cells, heatmap, and tooltip as a bucket.
    const studyRow = (study, child) => {
      const date = latest.get(study.StudyID);
      if (!date) return '';
      const nick = study.params?.nickname;
      return `<tr class="study ${child ? 'child' : ''}">
        <td class="grp"><a href="#/study/${esc(study.StudyID)}" data-study="${esc(study.StudyID)}" class="mono">${esc(study.StudyID)}</a>${
          nick ? `<span class="nick">${esc(nick)}</span>` : ''
        }<span class="info" data-tip="${esc(this.#studyTip(study, date))}" role="img" aria-label="Study details">i</span></td>
        <td class="nstud">${esc(date)}</td>${rollupCells([study], study.StudyID)}</tr>`;
    };

    let body = `<tr class="total"><td class="grp">Portfolio total</td><td class="nstud">${filtered.length}</td>${rollupCells(
      filtered,
      'Portfolio'
    )}</tr>`;

    if (state.groupBy === 'none') {
      for (const study of filtered) body += studyRow(study, false);
    } else {
      for (const bucket of store.buckets()) {
        const open = state.expanded.has(String(bucket.value));
        body += `<tr class="bucket ${open ? 'open' : ''}" data-bucket="${esc(bucket.value)}">
          <td class="grp"><span class="tri" aria-hidden="true">▶</span>${esc(bucket.value)}</td>
          <td class="nstud">${bucket.studies.length}</td>
          ${rollupCells(bucket.studies, String(bucket.value))}</tr>`;
        if (open) for (const study of bucket.studies) body += studyRow(study, true);
      }
    }

    this.innerHTML = `
      <div class="showing">Showing ${filtered.length} / ${store.studies.length} studies · ${metrics.length} / ${store.supportedMetrics().length} site-level metrics · each study at its own latest snapshot</div>
      <div class="tblwrap"><table class="po">${head}<tbody>${body}</tbody></table></div>`;

    for (const el of this.querySelectorAll('.spark')) {
      const { series, label } = this.#sparks[Number(el.dataset.spark)];
      sparkline(el, series, { width: 64, height: 20, label: `${label} trend` });
    }
  }
}

customElements.define('gsm-portfolio-table', GsmPortfolioTable);

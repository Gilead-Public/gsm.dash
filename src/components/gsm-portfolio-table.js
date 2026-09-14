import { StoreElement, esc, fmtPct, fmtInt } from './util.js';
import { attachHoverTooltip, metricInfoIcon } from './tooltip.js';
import { shareBin, relativeBin, heatValue, RELATIVE_MEASURES, SEVERITY_ORDER } from '../scales/flags.js';
import { sparkline } from '../charts/sparkline.js';
import { sortRows } from '../data/sort.js';

/**
 * D1/D3/D4/D5 — the program-page rollup table.
 * Rows: portfolio total, then one row per study (grouping "None") or one row
 * per group-by bucket (click to expand per-study contributions). Every row is
 * a rollup over site-level rows — one study or many, same math. Dispatches a
 * bubbling `studySelected` CustomEvent ({detail: {StudyID}}) when a study
 * link is clicked — extending the gsm.viz event vocabulary
 * (riskSignalSelected / groupSelected).
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
      if (bucketCell) return this.store.toggleExpanded(bucketCell.parentElement.dataset.bucket);
      // The metric-definition icon lives inside a sortable header; hovering it
      // is the point, so a click on it must not also re-sort the column.
      if (e.target.closest('.info')) return;
      const th = e.target.closest('th[data-sort]');
      if (th) this.store.toggleSort(th.dataset.sort, { numeric: th.dataset.sort !== 'label' });
    });
    attachHoverTooltip(this);
  }

  #sparks = [];

  /** One cell: the toggled content lines, the heatmap class, and a provenance tooltip. */
  #cell(rollup, metric, label, heatClass, studies) {
    const { show } = this.store.state;
    // Cells stack whatever is switched on: numbers, rate, flag shares, distribution, trend.
    const lines = [];
    if (show.has('num') || show.has('den')) {
      const nums = [show.has('num') && fmtInt(rollup.Numerator), show.has('den') && fmtInt(rollup.Denominator)].filter(Boolean);
      lines.push(`<span class="cell-nums">${nums.join(' / ')}</span>`);
    }
    if (show.has('rate')) lines.push(`<span class="cell-rate ${lines.length ? 'secondary' : ''}">${fmtPct(rollup.Rate)}</span>`);
    const f = rollup.flags;
    if (show.has('flagged') || show.has('red')) {
      // Share of contributing sites flagged (red or amber) / flagged red; NA sites count in the denominator.
      const parts = [];
      if (show.has('flagged')) {
        parts.push(`<span title="${f.red + f.amber} of ${f.total} sites flagged red or amber"><i class="dot flag-red"></i><i class="dot flag-amber pair"></i>${fmtPct(heatValue('flagged', rollup), 0)}</span>`);
      }
      if (show.has('red')) {
        parts.push(`<span title="${f.red} of ${f.total} sites flagged red"><i class="dot flag-red"></i>${fmtPct(heatValue('red', rollup), 0)}</span>`);
      }
      lines.push(`<span class="cell-flags">${parts.join('')}</span>`);
    }
    if (show.has('dist')) {
      lines.push(`<span class="cellbar" title="${f.red}R · ${f.amber}A · ${f.green}G · ${f.na}NA">${SEVERITY_ORDER.filter((s) => f[s] > 0)
        .map((s) => `<i class="flag-${s}" style="flex:${f[s]}"></i>`)
        .join('')}</span>`);
    }
    if (show.has('trend')) {
      // The series is computed now; the SVG is drawn after the DOM exists.
      const idx = this.#sparks.push({ series: this.store.trendSeries(metric.MetricID, studies), label }) - 1;
      lines.push(`<span class="spark" data-spark="${idx}"></span>`);
    }
    const tip =
      `<b>${esc(label)}</b><br>` +
      `Σn/Σd = ${fmtInt(rollup.Numerator)} / ${fmtInt(rollup.Denominator)} = ${fmtPct(rollup.Rate)}<br>` +
      `sites: ${f.red}R · ${f.amber}A · ${f.green}G · ${f.na}NA<br>` +
      `${this.#snapshotNote(rollup.NumStudies)}`;
    return `<td class="${heatClass}" data-tip="${esc(tip)}"><div class="cell">${lines.join('')}</div></td>`;
  }

  /** "1 study at its latest snapshot" / "n studies, each at its latest snapshot". */
  #snapshotNote(n) {
    return n === 1 ? '1 study at its latest snapshot' : `${n} studies, each at its latest snapshot`;
  }

  /** Provenance for an enrollment cell: n of target, and how many studies reported. */
  #enrollTip(label, e) {
    const pct = e.enrolled != null && e.target ? ` (${fmtPct(e.enrolled / e.target, 0)} of target)` : '';
    const missing = e.nStudies - e.nCounted;
    return (
      `<b>${esc(label)}</b><br>` +
      `Participants enrolled: ${e.enrolled == null ? '—' : fmtInt(e.enrolled)}` +
      `${e.target ? ` / ${fmtInt(e.target)} target` : ''}${pct}<br>` +
      `${this.#snapshotNote(e.nStudies)}` +
      `${missing ? `<br>${missing} without a reported count` : ''}`
    );
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
    const { sort, heatmap } = state;
    const metrics = store.visibleMetrics();
    const filtered = store.filteredStudies();
    const latest = store.latestFor(filtered);
    const flat = state.groupBy === 'none';
    this.#sparks = [];
    this.dataset.ramp = state.ramp;

    // --- rows: each carries its study set and a memoized rollup per metric ---
    const makeRow = (kind, studies, label, meta, extra = {}) => {
      const cache = new Map();
      let enrollCache;
      return {
        kind, studies, label, meta, ...extra,
        rollup: (metricId) => {
          if (!cache.has(metricId)) cache.set(metricId, store.rollup(studies, metricId));
          return cache.get(metricId);
        },
        enrollment: () => (enrollCache ??= store.enrollment(studies)),
      };
    };
    const studyRow = (s) => makeRow('study', [s], s.StudyID, latest.get(s.StudyID), { study: s });
    // Metric columns sort by whatever measure drives the heatmap, so shading
    // and order tell the same story; with the heatmap off, by rate.
    const sortMeasure = heatmap === 'none' ? 'rate' : heatmap;
    const sortValue = (row) => {
      if (sort.key === 'label') return row.label;
      if (sort.key === 'meta') return row.meta;
      if (sort.key === 'enroll') return row.enrollment().enrolled;
      return heatValue(sortMeasure, row.rollup(sort.key));
    };
    const sorted = (rows) => sortRows(rows, sort, sortValue);

    const total = makeRow('total', filtered, 'Portfolio total', filtered.length);
    let primary; // the rows the column domains are computed over
    if (flat) {
      primary = sorted(filtered.filter((s) => latest.has(s.StudyID)).map(studyRow));
    } else {
      primary = sorted(
        store.buckets().map((b) =>
          makeRow('bucket', b.studies, String(b.value), b.studies.length, {
            open: state.expanded.has(String(b.value)),
            children: sorted(b.studies.filter((s) => latest.has(s.StudyID)).map(studyRow)),
          })
        )
      );
    }

    // --- heatmap: absolute bins for flag shares, column-relative bins otherwise ---
    const domains = new Map();
    if (RELATIVE_MEASURES.has(heatmap)) {
      for (const m of metrics) {
        const values = primary.map((r) => heatValue(heatmap, r.rollup(m.MetricID))).filter((v) => v != null);
        domains.set(m.MetricID, { min: Math.min(...values), max: Math.max(...values) });
      }
    }
    const heatClass = (row, metric) => {
      if (heatmap === 'none') return '';
      const value = heatValue(heatmap, row.rollup(metric.MetricID));
      if (RELATIVE_MEASURES.has(heatmap)) {
        // The total row is a sum — not comparable to its members on counts.
        if (row.kind === 'total' && heatmap !== 'rate') return '';
        return relativeBin(value, domains.get(metric.MetricID));
      }
      return shareBin(value);
    };

    // --- header ---
    // `label` is raw HTML (the metric headers embed an ⓘ). `tip` uses the
    // shared hover tooltip; `title` is the native one — never both on a cell,
    // or two tooltips race each other.
    const th = (key, label, { classes = '', title = '', tip = '' } = {}) => {
      const active = sort.key === key;
      const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
      return `<th data-sort="${esc(key)}" class="sortable ${classes} ${active ? 'active' : ''}" aria-sort="${ariaSort}"${
        title ? ` title="${esc(title)}"` : ''
      }${tip ? ` data-tip="${esc(tip)}"` : ''}>${label}${
        active ? `<span class="si" aria-hidden="true">${sort.dir === 'asc' ? '▲' : '▼'}</span>` : ''
      }</th>`;
    };
    const measureLabel = { num: 'numerator', den: 'denominator', rate: 'rate', flagged: '% flagged', red: '% red' }[sortMeasure];
    const head = `<thead><tr>${th('label', flat ? 'Study' : 'Group', { classes: 'grp' })}${th(
      'meta',
      flat ? 'Snapshot' : 'Studies'
    )}${th('enroll', 'Enrolled', {
      classes: 'enroll',
      tip: 'Participants enrolled — Reporting_Groups ParticipantCount, summed over the studies in the row at their latest snapshots. Click to sort.',
    })}${metrics
      .map((m) =>
        th(
          m.MetricID,
          `${esc(m.Abbreviation)}${metricInfoIcon(m)}`,
          { tip: `<b>${esc(m.Metric)}</b><br>Click to sort by ${esc(measureLabel)}. Hover ⓘ for the definition.` }
        )
      )
      .join('')}</tr></thead>`;

    // --- body ---
    const enrollCell = (row) => {
      const e = row.enrollment();
      return `<td class="enroll" data-tip="${esc(this.#enrollTip(row.label, e))}">${
        e.enrolled == null ? '<span class="muted">—</span>' : fmtInt(e.enrolled)
      }</td>`;
    };
    const cells = (row) =>
      metrics
        .map((m) => this.#cell(row.rollup(m.MetricID), m, `${row.label} · ${m.Abbreviation}`, heatClass(row, m), row.studies))
        .join('');
    const studyRowHTML = (row, child) => {
      const { study, meta: date } = row;
      const nick = study.params?.nickname;
      return `<tr class="study ${child ? 'child' : ''}">
        <td class="grp"><a href="#/study/${esc(study.StudyID)}" data-study="${esc(study.StudyID)}" class="mono">${esc(study.StudyID)}</a>${
          nick ? `<span class="nick">${esc(nick)}</span>` : ''
        }<span class="info" data-tip="${esc(this.#studyTip(study, date))}" role="img" aria-label="Study details">i</span></td>
        <td class="nstud">${esc(date)}</td>${enrollCell(row)}${cells(row)}</tr>`;
    };

    let body = `<tr class="total"><td class="grp">Portfolio total</td><td class="nstud">${filtered.length}</td>${enrollCell(
      total
    )}${cells(total)}</tr>`;
    for (const row of primary) {
      if (row.kind === 'study') {
        body += studyRowHTML(row, false);
        continue;
      }
      body += `<tr class="bucket ${row.open ? 'open' : ''}" data-bucket="${esc(row.label)}">
        <td class="grp"><span class="tri" aria-hidden="true">▶</span>${esc(row.label)}</td>
        <td class="nstud">${row.meta}</td>${enrollCell(row)}${cells(row)}</tr>`;
      if (row.open) for (const child of row.children) body += studyRowHTML(child, true);
    }

    const sortedMetric = metrics.find((m) => m.MetricID === sort.key);
    const sortNote = sortedMetric ? ` · sorted by ${esc(sortedMetric.Abbreviation)} ${measureLabel} ${sort.dir === 'asc' ? '↑' : '↓'}` : '';
    this.innerHTML = `
      <div class="showing">Showing ${filtered.length} / ${store.studies.length} studies · ${metrics.length} / ${store.supportedMetrics().length} site-level metrics · each study at its own latest snapshot${sortNote}</div>
      <div class="tblwrap"><table class="po">${head}<tbody>${body}</tbody></table></div>`;

    for (const el of this.querySelectorAll('.spark')) {
      const { series, label } = this.#sparks[Number(el.dataset.spark)];
      sparkline(el, series, { width: 64, height: 20, label: `${label} trend` });
    }
  }
}

customElements.define('gsm-portfolio-table', GsmPortfolioTable);

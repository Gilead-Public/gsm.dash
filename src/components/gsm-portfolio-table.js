import { StoreElement, esc, fmtPct, fmtInt } from './util.js';
import { attachHoverTooltip, metricInfoIcon, statusPill } from './tooltip.js';
import { fmtMetric, fmtRate, metricUnit, displayLabel, DAYS_PER_MONTH } from '../util/format.js';
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
      const fold = e.target.closest('button[data-fold]');
      if (fold) return this.store.toggleGroup(fold.dataset.fold);
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

  /**
   * One cell. In "defined" mode (P2) the first line is the metric's glossary
   * display rule — n (%), per 28 days, or % — and the sidebar's "also show"
   * extras stack under it. In "custom" mode every metric shows the same
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
    const f = rollup.flags;
    if (show.has('flagged') || show.has('red')) {
      // Share of contributing sites flagged (red or amber) / flagged red; NA sites count in the denominator.
      const parts = [];
      if (show.has('flagged')) {
        parts.push(`<span><i class="dot flag-red"></i><i class="dot flag-amber pair"></i>${fmtPct(heatValue('flagged', rollup), 0)}</span>`);
      }
      if (show.has('red')) {
        parts.push(`<span><i class="dot flag-red"></i>${fmtPct(heatValue('red', rollup), 0)}</span>`);
      }
      lines.push(`<span class="cell-flags">${parts.join('')}</span>`);
    }
    if (show.has('dist')) {
      lines.push(`<span class="cellbar">${SEVERITY_ORDER.filter((s) => f[s] > 0)
        .map((s) => `<i class="flag-${s}" style="flex:${f[s]}"></i>`)
        .join('')}</span>`);
    }
    if (show.has('trend')) {
      // The series is computed now; the SVG is drawn after the DOM exists.
      const idx = this.#sparks.push({ series: this.store.trendSeries(metric.MetricID, studies), label }) - 1;
      lines.push(`<span class="spark" data-spark="${idx}"></span>`);
    }
    const per28 = metric.Display === 'per_28d' && rollup.Rate != null;
    const tip =
      `<b>${esc(label)}</b><br>` +
      `<span class="tip-muted">${esc(metric.Metric)}</span><br>` +
      `${esc(fmtMetric(metric, rollup).text)} <span class="tip-muted">— ${esc(displayLabel(metric))}</span><br>` +
      `Σn/Σd = ${fmtInt(rollup.Numerator)} / ${fmtInt(rollup.Denominator)}${
        per28 ? ` = ${(rollup.Rate).toFixed(4)} / day × ${DAYS_PER_MONTH}` : ` = ${fmtPct(rollup.Rate)}`
      }<br>` +
      `sites: ${f.red}R · ${f.amber}A · ${f.green}G · ${f.na}NA (${fmtPct(heatValue('flagged', rollup), 0)} flagged)<br>` +
      `${this.#snapshotNote(rollup.NumStudies)}` +
      (metric.Status === 'Planned' ? `<br><span class="tip-warn">Planned metric — values are simulated</span>` : '');
    const planned = metric.Status === 'Planned' ? 'planned' : '';
    return `<td class="${heatClass} ${planned}" data-tip="${esc(tip)}"><div class="cell">${lines.join('')}</div></td>`;
  }

  /**
   * A folded category (P3): one dot per metric whose flagged-site share is
   * notable (red > 25%, amber 10–25%), and "k / n metrics" above 10%.
   */
  #summary(row, group) {
    const shares = group.metrics.map((m) => ({ m, share: heatValue('flagged', row.rollup(m.MetricID)) }));
    const hot = shares.filter((x) => x.share > 0.1);
    const dots = hot
      .sort((a, b) => b.share - a.share)
      .map((x) => `<i class="${x.share > 0.25 ? 'flag-red' : 'flag-amber'}"></i>`)
      .join('');
    const tip =
      `<b>${esc(row.label)} · ${esc(group.category)}</b><br>` +
      shares.map((x) => `${esc(x.m.Abbreviation)}: ${x.share == null ? '—' : `${fmtPct(x.share, 0)} sites flagged`}`).join('<br>') +
      `<br><span class="tip-muted">Dots: red > 25%, amber 10–25% of sites flagged</span>`;
    return `<td class="sum gs" data-tip="${esc(tip)}"><span class="dots">${dots}</span><span class="k">${hot.length}/${group.metrics.length}</span></td>`;
  }

  /** Sort value for a folded category: metrics over 10% flagged, ties by the mean share. */
  #summaryValue(row, group) {
    const shares = group.metrics.map((m) => heatValue('flagged', row.rollup(m.MetricID)) ?? 0);
    return shares.filter((v) => v > 0.1).length + shares.reduce((a, v) => a + v, 0) / (shares.length * 10);
  }

  /** "1 study at its latest snapshot" / "n studies, each at its latest snapshot". */
  #snapshotNote(n) {
    return n === 1 ? '1 study at its latest snapshot' : `${n} studies, each at its latest snapshot`;
  }

  /** Provenance for a population cell (P4): all three populations, and how many studies reported. */
  #popTip(label, pop, nStudies) {
    const line = (name, v, param) => `${name}: ${v == null ? '—' : fmtInt(v)} <span class="tip-muted">${param}</span>`;
    return (
      `<b>${esc(label)}</b><br>` +
      `${line('Screened', pop.screened, 'ScreenedCount')}<br>` +
      `${line('Enrolled', pop.enrolled, 'ParticipantCount')}<br>` +
      `${line('Dosed', pop.dosed, 'DosedCount')}<br>` +
      `${this.#snapshotNote(nStudies)}<br><span class="tip-muted">The denominators behind every n (%) column.</span>`
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
      ['Screened', p.ScreenedCount],
      ['Enrolled', p.ParticipantCount],
      ['Dosed', p.DosedCount],
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
    const groups = store.metricCategories(metrics).map((g) => ({ ...g, collapsed: state.collapsedGroups.has(g.category) }));
    const shownMetrics = groups.filter((g) => !g.collapsed).flatMap((g) => g.metrics);
    const filtered = store.filteredStudies();
    const latest = store.latestFor(filtered);
    const flat = state.groupBy === 'none';
    this.#sparks = [];
    this.dataset.ramp = state.ramp;

    // --- rows: each carries its study set and a memoized rollup per metric ---
    const makeRow = (kind, studies, label, meta, extra = {}) => {
      const cache = new Map();
      let popCache;
      return {
        kind, studies, label, meta, ...extra,
        rollup: (metricId) => {
          if (!cache.has(metricId)) cache.set(metricId, store.rollup(studies, metricId));
          return cache.get(metricId);
        },
        population: () => (popCache ??= store.population(studies)),
      };
    };
    const studyRow = (s) => makeRow('study', [s], s.StudyID, latest.get(s.StudyID), { study: s });
    // Metric columns sort by whatever measure drives the heatmap, so shading
    // and order tell the same story; with the heatmap off, by rate. The 28-day
    // display rescale is a constant factor, so it never changes the order.
    const sortMeasure = heatmap === 'none' ? 'rate' : heatmap;
    const sortValue = (row) => {
      if (sort.key === 'label') return row.label;
      if (sort.key === 'meta') return row.meta;
      if (sort.key === 'enroll') return row.population().enrolled;
      if (sort.key?.startsWith('pop:')) return row.population()[sort.key.slice(4)];
      if (sort.key?.startsWith('cat:')) {
        const group = groups.find((g) => g.category === sort.key.slice(4));
        return group ? this.#summaryValue(row, group) : null;
      }
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
      for (const m of shownMetrics) {
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
    const measureLabel = { num: 'numerator', den: 'denominator', rate: 'rate', flagged: '% flagged', red: '% red' }[sortMeasure];
    const popCols = [
      ['pop:screened', 'Scr.', 'Screened', 'ScreenedCount', ''],
      ['enroll', 'Enr.', 'Enrolled', 'ParticipantCount', ''],
      ['pop:dosed', 'Dosed', 'Dosed', 'DosedCount', 'pop-last'],
    ];
    const bandRow =
      `<tr class="band" data-anno="bands">` +
      `${th('label', flat ? 'Study' : 'Group', { classes: 'grp', attrs: 'rowspan="2"' })}` +
      `${th('meta', flat ? 'Snapshot' : 'Studies', { attrs: 'rowspan="2"' })}` +
      `<th colspan="3" class="bandh pop gs" data-anno="population">Population</th>` +
      groups
        .map((g) => {
          const n = g.metrics.length;
          const btn = `<button type="button" class="fold" data-fold="${esc(g.category)}" aria-expanded="${!g.collapsed}" title="${
            g.collapsed ? 'Expand' : 'Collapse'
          } ${esc(g.category)}">${g.collapsed ? '▸' : '▾'}</button>`;
          return `<th colspan="${g.collapsed ? 1 : n}" class="bandh gs" data-band="${esc(g.category)}">${btn}${esc(g.category)}<span class="tw">${n}</span></th>`;
        })
        .join('') +
      `</tr>`;
    const metricHead = (m, first) => {
      const planned = m.Status === 'Planned';
      return th(m.MetricID, `${esc(m.Abbreviation)}${metricInfoIcon(m)}<span class="u">${esc(metricUnit(m))}</span>${statusPill(m)}`, {
        classes: `${first ? 'gs' : ''} ${planned ? 'planned' : ''}`,
        tip: `<b>${esc(m.Metric)}</b><br>Shown as ${esc(displayLabel(m))}.<br>Click to sort by ${esc(measureLabel)}. Hover ⓘ for the glossary entry.`,
        attrs: `data-abbr="${esc(m.Abbreviation)}"`,
      });
    };
    const colRow =
      `<tr class="cols">` +
      popCols
        .map(([key, short, long, param, cls]) =>
          th(key, `${short}<span class="u">n</span>`, {
            classes: `pop ${cls} ${key === 'pop:screened' ? 'gs' : ''}`,
            tip: `<b>${long}</b> participants — Reporting_Groups ${param}, summed over the studies in the row at their latest snapshots. Click to sort.`,
          })
        )
        .join('') +
      groups
        .map((g) =>
          g.collapsed
            ? th(`cat:${g.category}`, `<span class="sumh">${g.metrics.map((m) => esc(m.Abbreviation)).join(' ')}</span><span class="u">metrics &gt;10% flagged</span>`, {
                classes: 'gs sum',
                tip: `<b>${esc(g.category)}</b> (folded)<br>Dots mark metrics with many flagged sites. Click to sort by how many.`,
              })
            : g.metrics.map((m, i) => metricHead(m, i === 0)).join('')
        )
        .join('') +
      `</tr>`;
    const head = `<thead>${bandRow}${colRow}</thead>`;

    // --- body ---
    const popCells = (row) => {
      const pop = row.population();
      const tip = esc(this.#popTip(row.label, pop, row.studies.filter((s) => latest.has(s.StudyID)).length));
      return popCols
        .map(([key, , , , cls]) => {
          const v = pop[key === 'enroll' ? 'enrolled' : key.slice(4)];
          return `<td class="pop ${cls} ${key === 'pop:screened' ? 'gs' : ''}" data-tip="${tip}">${v == null ? '<span class="muted">—</span>' : fmtInt(v)}</td>`;
        })
        .join('');
    };
    const cells = (row) =>
      groups
        .map((g) =>
          g.collapsed
            ? this.#summary(row, g)
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
      return `<tr class="study ${child ? 'child' : ''}">
        <td class="grp"><a href="#/study/${esc(study.StudyID)}" data-study="${esc(study.StudyID)}" class="mono">${esc(study.StudyID)}</a>${
          nick ? `<span class="nick">${esc(nick)}</span>` : ''
        }<span class="info" data-tip="${esc(this.#studyTip(study, date))}" role="img" aria-label="Study details">i</span></td>
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

    const sortedMetric = metrics.find((m) => m.MetricID === sort.key);
    const sortNote = sortedMetric ? ` · sorted by ${esc(sortedMetric.Abbreviation)} ${measureLabel} ${sort.dir === 'asc' ? '↑' : '↓'}` : '';
    const statusCounts = ['Released', 'New', 'Planned']
      .map((st) => [st, metrics.filter((m) => (m.Status ?? 'Released') === st).length])
      .filter(([, n]) => n)
      .map(([st, n]) => `${n} ${st.toLowerCase()}`)
      .join(' · ');
    const mode = state.cellMode === 'defined' ? 'cells as defined in the glossary' : 'custom cell contents';
    this.innerHTML = `
      <div class="showing" data-anno="showing">Showing ${filtered.length} / ${store.studies.length} studies · ${metrics.length} / ${
        store.supportedMetrics().length
      } site-level metrics (${statusCounts}) · ${mode} · each study at its own latest snapshot${sortNote}</div>
      <div class="tblwrap"><table class="po">${head}<tbody>${body}</tbody></table></div>`;

    for (const el of this.querySelectorAll('.spark')) {
      const { series, label } = this.#sparks[Number(el.dataset.spark)];
      sparkline(el, series, { width: 64, height: 20, label: `${label} trend` });
    }
  }
}

customElements.define('gsm-portfolio-table', GsmPortfolioTable);

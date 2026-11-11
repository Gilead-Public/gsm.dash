// P6 — the CTQ metric glossary as a page inside the dashboard: every catalog
// metric, grouped by category, with its numerator / denominator text, display
// rule, status and owning gsm.roadmap Requirement.
import { esc, displayLabel, metricUnit } from '../util/format.js';
import { statusPill, REQUIREMENT_URL } from './tooltip.js';
import { groupByCategory } from '../data/catalog.js';

export function glossaryHTML(metrics, { query = '' } = {}) {
  const q = query.trim().toLowerCase();
  const match = (m) => !q || [m.Abbreviation, m.Metric, m.Numerator, m.Denominator, m.Category].some((v) => String(v ?? '').toLowerCase().includes(q));
  const groups = groupByCategory(metrics.filter(match));
  if (!groups.length) return `<p class="muted">No metric matches “${esc(query)}”.</p>`;
  return groups
    .map(
      (g) => `<h3>${esc(g.category)} <span class="cnt">${g.metrics.length}</span></h3>
      <table class="gloss"><thead><tr><th>Metric</th><th>Numerator ÷ Denominator</th><th>Displayed as</th><th>Requirement</th></tr></thead><tbody>${g.metrics
        .map(
          (m) => `<tr class="${(m.Status ?? '').toLowerCase()}">
          <td><span class="mono ab">${esc(m.Abbreviation)}</span> <b>${esc(m.Metric)}</b>${statusPill(m)}
            <div class="def">${m.Definition ? esc(m.Definition) : '<span class="muted">Definition not yet supplied (Q2)</span>'}</div>
            ${m.Note ? `<div class="note">${esc(m.Note)}</div>` : ''}</td>
          <td>${esc(m.Numerator ?? '—')} <span class="muted">÷</span> ${esc(m.Denominator ?? '—')}</td>
          <td><span class="mono">${esc(metricUnit(m))}</span><div class="muted small">${esc(displayLabel(m))}</div></td>
          <td>${m.RequirementID ? `<a href="${REQUIREMENT_URL(m.RequirementID)}" target="_blank" rel="noopener">gsm.roadmap#${m.RequirementID}</a>` : '<span class="muted">—</span>'}</td></tr>`
        )
        .join('')}</tbody></table>`
    )
    .join('');
}

/** Open (creating on first use) the glossary <dialog> for a store's catalog. */
export function openGlossary(store) {
  let dlg = document.getElementById('gsm-glossary');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'gsm-glossary';
    dlg.innerHTML = `<div class="gl-head"><h2>Metric glossary</h2>
      <input type="search" placeholder="Search metrics…" aria-label="Search metrics">
      <button type="button" class="gl-close" aria-label="Close">✕</button></div>
      <p class="gl-sub">Source: CTQ Oversight Dashboard Feedback Tracker (gsm.roadmap#53). Planned metrics are owned by the linked Requirement; their values in this prototype are simulated.</p>
      <div class="gl-body"></div>`;
    document.body.append(dlg);
    const body = dlg.querySelector('.gl-body');
    const input = dlg.querySelector('input');
    const metrics = [...store.supportedMetrics(), ...store.unsupportedMetrics()];
    const draw = () => (body.innerHTML = glossaryHTML(metrics, { query: input.value }));
    input.addEventListener('input', draw);
    dlg.querySelector('.gl-close').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close(); // backdrop click
    });
    draw();
  }
  dlg.showModal();
}

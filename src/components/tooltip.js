// The shared hover tooltip. One `<div id="gsm-tooltip">` serves the whole page;
// components call attachHoverTooltip(this) once and then emit `data-tip`
// wherever a rich tooltip is wanted. Native `title` cannot carry markup, cannot
// be positioned, and cannot be styled — so anything multi-line goes through
// here, and `title` is left for one-line hints.
import { esc, displayLabel } from '../util/format.js';

function tooltipEl() {
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

export function hideTooltip() {
  const tip = document.getElementById('gsm-tooltip');
  if (tip) tip.hidden = true;
}

/**
 * Delegate hover tooltips for every `[data-tip]` inside `host`. Idempotent per
 * element, so a component may call it from connectedCallback without stacking
 * listeners across re-connects.
 */
export function attachHoverTooltip(host) {
  if (host.dataset.tipHost === 'on') return;
  host.dataset.tipHost = 'on';
  host.addEventListener('mousemove', (e) => {
    const target = e.target.closest('[data-tip]');
    const tip = tooltipEl();
    if (!target) {
      tip.hidden = true;
      return;
    }
    tip.innerHTML = target.dataset.tip;
    tip.hidden = false;
    const x = Math.min(e.clientX + 14, window.innerWidth - 280);
    const y = e.clientY + 130 > window.innerHeight ? e.clientY - 110 : e.clientY + 16;
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  });
  host.addEventListener('mouseleave', hideTooltip);
}

export const REQUIREMENT_URL = (n) => `https://github.com/Gilead-BioStats/gsm.roadmap/issues/${n}`;

/** Status pill — Released metrics carry none; New / Planned are flagged. */
export function statusPill(metric) {
  const status = metric?.Status ?? 'Released';
  return status === 'Released' ? '' : `<span class="pill ${status.toLowerCase()}">${esc(status)}</span>`;
}

/**
 * A metric's glossary entry as tooltip HTML — name, status, definition,
 * numerator / denominator, display rule, then the flagging model. Shared so
 * the program table's column headers and the study page's tile and drill-in
 * headers all say the same thing (P6).
 */
export function metricTip(metric) {
  const rows = [
    ['Definition', metric.Definition != null ? esc(metric.Definition) : '<span class="tip-muted">not yet supplied (Q2)</span>', true],
    ['Numerator', metric.Numerator],
    ['Denominator', metric.Denominator],
    ['Displayed as', displayLabel(metric)],
    [
      'Flagging',
      [metric.Score, metric.thresholds?.length ? `thresholds ${metric.thresholds.join(', ')}` : metric.Threshold].filter(Boolean).join(' · '),
    ],
    [
      'Accrual',
      metric.AccrualThreshold != null ? `${metric.AccrualMetric ?? 'Denominator'} ≥ ${metric.AccrualThreshold}` : null,
    ],
    ['Requirement', metric.RequirementID ? `gsm.roadmap#${metric.RequirementID}` : null],
    ['Note', metric.Note],
  ].filter(([, v]) => v != null && v !== '');
  return (
    `<b>${esc(metric.Metric)}</b>${statusPill(metric)}<br>` +
    `<span class="tip-muted mono">${esc(metric.Abbreviation)} · ${esc(metric.ID ?? metric.MetricID)}${
      metric.Category ? ` · ${esc(metric.Category)}` : ''
    }</span>` +
    `<dl class="tip-dl">${rows.map(([k, v, raw]) => `<dt>${k}</dt><dd>${raw ? v : esc(v)}</dd>`).join('')}</dl>`
  );
}

/** The ⓘ affordance that carries a rich tooltip. */
export function infoIcon(tip, label) {
  return `<span class="info" data-tip="${esc(tip)}" role="img" aria-label="${esc(label)}">i</span>`;
}

/** The ⓘ for a metric — the one every metric header should use. */
export function metricInfoIcon(metric) {
  return infoIcon(metricTip(metric), `${metric.Metric} definition`);
}

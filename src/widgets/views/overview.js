import { registerWidget } from '../registry.js';
import { esc, fmtPct, fmtInt } from '../../util/format.js';

// Text-only view: rate with its numerator and denominator. The plainest
// thing the reporting layer gives every site-level metric.
export function renderOverview(el, data) {
  const { metric, study, siteRows } = data;
  el.innerHTML = `
    <div><span class="big">${fmtPct(study?.Metric)}</span></div>
    <dl class="kv">
      <dt>Numerator</dt><dd>${study ? fmtInt(study.Numerator) : '—'} <span class="muted">${esc(metric.Numerator ?? '')}</span></dd>
      <dt>Denominator</dt><dd>${study ? fmtInt(study.Denominator) : '—'} <span class="muted">${esc(metric.Denominator ?? '')}</span></dd>
      <dt>Sites</dt><dd>${siteRows.length}</dd>
    </dl>`;
}

registerWidget({
  name: 'overview',
  label: 'Overview',
  version: '0.1.0',
  dataSpec: { results: 'self' },
  render: renderOverview,
});

import { registerWidget } from './registry.js';
import { esc, fmtInt, fmtPct } from '../util/format.js';
import { buildDistributionModel } from '../data/distributions.js';
import { distributionConfig } from '../config/distributions.js';

// Layout A distribution bars (design review 2026-11-09) from Reporting_Distributions. Reference
// implementation for the gsm.viz metric distribution widget (Gilead-Public/gsm.viz#619).

const EMPTY = {
  'not-published': 'Breakdowns are published for the latest snapshot only.',
  'no-rows': 'No breakdown rows for this metric in this snapshot.',
};

const FOOTNOTES = {
  multi: (s) => `A participant can fall in more than one category, so the counts add up to more than ${fmtInt(s.total)}.`,
  'not-recorded': () => 'Not recorded: the source value was blank.',
};

function rowHtml(bar, s, max) {
  const width = max > 0 ? ((bar.count / max) * 100).toFixed(1) : '0';
  const style = bar.colour ? ` style="width:${width}%;background:${esc(bar.colour)}"` : ` style="width:${width}%"`;
  const parts = [`${bar.label}: ${fmtInt(bar.count)}`, `${fmtPct(bar.population)} ${s.populationLabel}`];
  if (s.enrolledLabel) parts.push(`${fmtPct(bar.enrolled)} ${s.enrolledLabel}`);
  return `<div class="dist-row ${bar.kind}" role="listitem" aria-label="${esc(parts.join(', '))}" data-category="${esc(bar.category ?? '')}" data-kind="${bar.kind}">
    <span class="lbl" title="${esc(bar.label)}">${esc(bar.label)}</span>
    <div class="btrack" aria-hidden="true"><div class="b${bar.colour ? ' status' : ''}"${style}></div></div>
    <span class="v">${fmtInt(bar.count)}</span>
    <span class="p" data-pct="population">${fmtPct(bar.population)}</span>
    ${s.enrolledLabel ? `<span class="p" data-pct="enrolled">${fmtPct(bar.enrolled)}</span>` : ''}
  </div>`;
}

function sectionHtml(s) {
  const max = Math.max(0, ...s.bars.map((b) => b.count));
  const cols = s.enrolledLabel ? 'dist-sec two' : 'dist-sec';
  const notes = s.footnotes.map((f) => `<p class="dist-note">${esc(FOOTNOTES[f](s))}</p>`).join('');
  return `<section class="${cols}" data-source="${esc(s.source)}" data-variable="${esc(s.variable)}" aria-label="${esc(s.title)}">
    <div class="sub-h">${esc(s.title)}</div>
    <div class="dist-cols" aria-hidden="true"><span></span><span>n</span>
      <span title="${esc(`${s.populationLabel}: count out of ${fmtInt(s.total)}`)}">${esc(s.populationLabel)}</span>
      ${s.enrolledLabel ? `<span title="${esc(`${s.enrolledLabel}: count out of all enrolled participants`)}">${esc(s.enrolledLabel)}</span>` : ''}
    </div>
    <div class="dist-bars" role="list">${s.bars.map((b) => rowHtml(b, s, max)).join('')}</div>
    ${notes}
  </section>`;
}

export function renderDistribution(el, data, config = {}) {
  const model = buildDistributionModel({
    rows: data.distributions,
    metric: data.metric,
    study: data.study,
    siteRows: data.siteRows,
    config: distributionConfig(data.metric, config),
    groupId: config.groupId ?? null,
  });
  el.dataset.state = model.state;
  if (model.state === 'missing') {
    el.innerHTML = '<div class="dist"><div class="nd">No breakdowns are configured for this metric.</div></div>';
    return;
  }
  const h = model.header;
  const head = `<div class="dist-head"><span class="dist-name">${esc(h.name)}</span>
    <b class="dist-pct">${fmtPct(h.percent)}</b><span class="dist-nd">${fmtInt(h.numerator)} / ${fmtInt(h.denominator)}</span></div>`;
  const body = model.state === 'empty'
    ? `<div class="nd" data-empty="${model.reason}">${EMPTY[model.reason]}</div>`
    : model.sections.map(sectionHtml).join('');
  el.innerHTML = `<div class="dist" role="group" aria-label="${esc(`${h.name} breakdowns`)}">${head}${body}</div>`;
}

registerWidget({
  name: 'distribution-bar',
  label: 'Breakdowns',
  version: '0.1.0',
  dataSpec: { results: 'self', distributions: 'self' },
  appliesTo: (metric, config) => (distributionConfig(metric, config) ? null : 'it has no breakdown configuration'),
  render: renderDistribution,
});

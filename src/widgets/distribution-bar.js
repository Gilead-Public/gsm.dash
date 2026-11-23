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

/** A bar's value: a status section's share with its count beside it (#48), a reason section's count. */
const value = (bar, s) => (s.display === 'percent' ? `${fmtPct(bar.percent)} <span class="vn">(${fmtInt(bar.count)})</span>` : fmtInt(bar.count));

/** What a section's values are out of, its total named: "% of 366 enrolled", "n of 37 ineligible" (#48). */
export const descriptor = (s) => `${s.display === 'percent' ? '%' : 'n'} of ${fmtInt(s.total)}${s.population ? ` ${s.population}` : ''}`;

function rowHtml(bar, s, max) {
  const width = max > 0 ? ((bar.count / max) * 100).toFixed(1) : '0';
  const style = bar.colour ? ` style="width:${width}%;background:${esc(bar.colour)}"` : ` style="width:${width}%"`;
  const nOfN = `${fmtInt(bar.count)} of ${fmtInt(s.total)}`;
  const aria = s.display === 'percent' ? `${bar.label}: ${fmtPct(bar.percent)}, ${nOfN}` : `${bar.label}: ${nOfN}`;
  return `<div class="dist-row ${bar.kind}" role="listitem" title="${esc(`${bar.label}: ${nOfN}`)}" aria-label="${esc(aria)}" data-category="${esc(bar.category ?? '')}" data-kind="${bar.kind}">
    <span class="lbl">${esc(bar.label)}</span>
    <div class="btrack" aria-hidden="true"><div class="b${bar.colour ? ' status' : ''}"${style}></div></div>
    <span class="v">${value(bar, s)}</span>
  </div>`;
}

// The section's title and what its values are out of share one row (#48); its notes go to the card's footer.
function sectionHtml(s) {
  const max = Math.max(0, ...s.bars.map((b) => b.count));
  return `<section class="dist-sec" data-source="${esc(s.source)}" data-variable="${esc(s.variable)}" data-display="${s.display}" aria-label="${esc(s.title)}">
    <div class="sec-head"><div class="sub-h">${esc(s.title)}</div><div class="dist-cols">${esc(descriptor(s))}</div></div>
    <div class="dist-bars" role="list">${s.bars.map((b) => rowHtml(b, s, max)).join('')}</div>
  </section>`;
}

/** The notes a model's sections or joint table carry, each once, for the card's footer (#48). */
const notesOf = (model) => [
  ...new Set([
    ...(model.sections ?? []).flatMap((s) => s.footnotes.map((f) => FOOTNOTES[f](s))),
    ...(model.joint?.footnotes ?? []).map((f) => FOOTNOTES[f]()),
  ]),
];

const count = (/** @type {number | null} */ n) => (n == null ? '—' : fmtInt(n));

/**
 * Widget 4's joint counts (#10): a table per column group, each with a row per category of the rows' section; the
 * first also gives each row's count.
 */
function jointHtml(t, title) {
  const tables = t.groups.map((g, i) => {
    const head = `<tr><th scope="col">${esc(t.rowLabel)}</th>${i === 0 ? `<th scope="col">${esc(t.totalLabel)}</th>` : ''}${g.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr>`;
    const body = t.rows
      .map((r) => `<tr data-category="${esc(r.label)}"><th scope="row">${esc(r.label)}</th>${i === 0 ? `<td data-total="">${count(r.total)}</td>` : ''}${r.cells[i].map((n) => `<td>${count(n)}</td>`).join('')}</tr>`)
      .join('');
    return `<table class="dist-joint" data-section="${esc(g.key)}" aria-label="${esc(`${title}: ${g.label}`)}"><caption>${esc(g.label)}</caption><thead>${head}</thead><tbody>${body}</tbody></table>`;
  });
  return tables.join('');
}

const shownBars = (model) => Math.max(0, ...(model.sections ?? []).map((s) => s.bars.filter((b) => b.kind === 'category').length));

// Only a laid-out box can overflow: detached or unsized, the widget shows every bar its top-N allows.
const overflows = (el) => el.isConnected && el.clientHeight > 0 && el.scrollHeight > el.clientHeight;
const overflowsAcross = (el) => el.isConnected && el.clientWidth > 0 && el.scrollWidth > el.clientWidth;

/**
 * `config.only` (section keys) or `config.joint` choose what a card shows (#10); the rest is the metric's
 * distribution configuration, merged over the shipped one. The card's header carries the metric's value and n / N
 * (#32). While the breakdown overflows its box, each section shows one bar fewer, the rest going into "+ k more",
 * down to one bar. A breakdown that then fits is marked `data-fits`; the host grows the cards for anything else. It
 * returns the breakdown's notes, which the card shows in its footer (#48).
 */
export function renderDistribution(el, data, config = {}) {
  const { only = null, joint = null, ...options } = /** @type {any} */ (config);
  const merged = distributionConfig(data.metric, options);
  const draw = (maxBars) => {
    const model = buildDistributionModel({
      rows: data.distributions,
      metric: data.metric,
      study: data.study,
      siteRows: data.siteRows,
      config: merged,
      groupId: options.groupId ?? null,
      only,
      joint,
      maxBars,
    });
    el.dataset.state = model.state;
    el.innerHTML = html(model);
    return model;
  };
  el.removeAttribute('data-tight');
  let model = draw(Infinity);
  for (let bars = shownBars(model) - 1; bars >= 1 && overflows(el); bars--) model = draw(bars);
  // Joint tables wider than the card may break their headings inside words, which they otherwise keep whole.
  if (model.joint && overflowsAcross(el)) el.toggleAttribute('data-tight', true);
  el.toggleAttribute('data-fits', Boolean(model.sections) && !overflows(el));
  return { notes: model.state === 'ok' ? notesOf(model) : [] };
}

function html(model) {
  if (model.state === 'missing') return '<div class="dist"><div class="nd">No breakdowns are configured for this metric.</div></div>';
  const { name } = model.header;
  const body = model.state === 'empty'
    ? `<div class="nd" data-empty="${model.reason}">${EMPTY[model.reason]}</div>`
    : model.joint
      ? jointHtml(model.joint, `${name} by ${model.joint.rowLabel.toLowerCase()}`)
      : model.sections.map(sectionHtml).join('');
  return `<div class="dist" role="group" aria-label="${esc(`${name} breakdowns`)}">${body}</div>`;
}

registerWidget({
  name: 'distribution-bar',
  label: 'Breakdowns',
  version: '0.1.0',
  dataSpec: { results: 'self', distributions: 'self' },
  fits: true,
  appliesTo: (metric, config) => (distributionConfig(metric, config) ? null : 'it has no breakdown configuration'),
  render: renderDistribution,
});

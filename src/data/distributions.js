// Reporting_Distributions (gsm.roadmap#617) → the Layout A distribution view model.
// The pipeline publishes site rows only. Summing them to study level is the one piece of dashboard logic
// here, kept in `sumSitesToStudy` so it can be qualified on its own (gsm.roadmap#625). Everything else is
// presentation: sorting, collapsing and labelling.

export const NOT_RECORDED = 'Not recorded';
export const NEUTRAL_COLOUR = 'var(--na)';

const sectionKey = (source, variable) => `${source}:${variable}`;

/**
 * Sum one metric's site rows to study level (or keep one group with `groupId`).
 * Per Source × Variable × Category: Σ Count and Σ Participants. Per Source × Variable: Σ Total, taking each
 * site's Total once (it repeats on every category row). Category order is first appearance.
 */
export function sumSitesToStudy(rows, { groupId = null } = {}) {
  const sections = new Map();
  for (const r of rows) {
    if (groupId != null && r.GroupID !== groupId) continue;
    const key = sectionKey(r.Source, r.Variable);
    let s = sections.get(key);
    if (!s) {
      s = { Source: r.Source, Variable: r.Variable, Total: 0, sites: new Set(), categories: new Map() };
      sections.set(key, s);
    }
    if (!s.sites.has(r.GroupID)) {
      s.sites.add(r.GroupID);
      s.Total += r.Total;
    }
    const c = s.categories.get(r.Category) ?? { Category: r.Category, Count: 0, Participants: 0 };
    c.Count += r.Count;
    c.Participants += r.Participants;
    s.categories.set(r.Category, c);
  }
  return [...sections.values()].map(({ Source, Variable, Total, categories }) => ({ Source, Variable, Total, categories: [...categories.values()] }));
}

const ratio = (n, d) => (d > 0 ? n / d : null);

function orderAndCollapse(categories, topN) {
  const recorded = categories.filter((c) => c.Category !== null);
  const blank = categories.find((c) => c.Category === null);
  const sorted = recorded.map((c, i) => ({ c, i })).sort((a, b) => b.c.Count - a.c.Count || a.i - b.i).map(({ c }) => c);
  const shown = Number.isFinite(topN) && sorted.length > topN ? sorted.slice(0, topN) : sorted;
  const rest = sorted.slice(shown.length);
  return { shown, rest, blank: blank && blank.Count > 0 ? blank : null };
}

/** The metric's Numerator and Denominator for the same scope as the distribution rows: the study, or one group. */
export function scopeTotals({ study, siteRows, groupId = null }) {
  if (groupId == null) return study ?? null;
  const row = (siteRows ?? []).find((r) => r.GroupID === groupId);
  return row ? { Numerator: row.Numerator, Denominator: row.Denominator } : null;
}

/**
 * The view model for one metric. `config` is the metric's distribution configuration (labels, top-N, status
 * variables, colours); without one the metric is "missing". With one but no rows it is "empty": either the
 * snapshot publishes no distributions at all (`rows` undefined; they cover the latest snapshot only), or none
 * for this metric or group. Header and percentages use the same scope as the rows (`groupId` or the study).
 */
export function buildDistributionModel({ rows, metric, study, siteRows, config, groupId = null }) {
  if (!config) return { state: 'missing' };
  const totals = scopeTotals({ study, siteRows, groupId });
  if (rows === undefined) return { state: 'empty', reason: 'not-published', header: header(metric, totals) };
  const sections = sumSitesToStudy(rows, { groupId });
  if (!sections.length) return { state: 'empty', reason: 'no-rows', header: header(metric, totals) };

  const ordered = [...sections].sort((a, b) => (a.Source === b.Source ? 0 : a.Source === 'Numerator' ? -1 : 1));
  return {
    state: 'ok',
    header: header(metric, totals),
    sections: ordered.map((s) => section(s, { config, totals })),
  };
}

function header(metric, totals) {
  return {
    name: metric?.Metric ?? '',
    percent: totals ? ratio(totals.Numerator, totals.Denominator) : null,
    numerator: totals?.Numerator ?? null,
    denominator: totals?.Denominator ?? null,
  };
}

function section(s, { config, totals }) {
  const sc = config.sections?.[sectionKey(s.Source, s.Variable)] ?? {};
  const isStatus = (config.statusVariables ?? []).includes(s.Variable);
  const colours = config.colours ?? null;
  const enrolled = s.Source === 'Numerator' && config.enrolledPercent === true && totals?.Denominator > 0;
  const { shown, rest, blank } = orderAndCollapse(s.categories, sc.topN ?? config.topN ?? Infinity);

  const bar = (c, label, kind) => ({
    kind,
    category: c.Category,
    label,
    count: c.Count,
    population: ratio(c.Count, s.Total),
    enrolled: enrolled ? ratio(c.Count, totals.Denominator) : null,
    colour: kind === 'category' && isStatus ? (colours?.[c.Category] ?? NEUTRAL_COLOUR) : null,
  });

  const bars = shown.map((c) => bar(c, c.Category, 'category'));
  if (rest.length) {
    const more = { Category: null, Count: rest.reduce((a, c) => a + c.Count, 0) };
    bars.push(bar(more, `+ ${rest.length} more`, 'more'));
  }
  if (blank) bars.push(bar(blank, NOT_RECORDED, 'not-recorded'));

  const counted = s.categories.reduce((a, c) => a + c.Count, 0);
  const footnotes = [];
  if (counted > s.Total) footnotes.push('multi');
  if (blank) footnotes.push('not-recorded');

  return {
    source: s.Source,
    variable: s.Variable,
    title: sc.title ?? s.Variable,
    populationLabel: sc.percentLabel ?? config.percentLabel ?? '%',
    enrolledLabel: enrolled ? (config.enrolledLabel ?? '% Enrolled') : null,
    total: s.Total,
    isStatus,
    bars,
    footnotes,
  };
}

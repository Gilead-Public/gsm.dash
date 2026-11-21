// Reporting_Distributions (gsm.roadmap#617) → the Layout A distribution view model.
// The pipeline publishes site rows only. Summing them to study level is the one piece of dashboard logic
// here, kept in `sumSitesToStudy` so it can be qualified on its own (gsm.roadmap#625). Everything else is
// presentation: sorting, collapsing and labelling.

export const NOT_RECORDED = 'Not recorded';
export const NEUTRAL_COLOUR = 'var(--na)';
/** Joins the two parts of a combined category, as #617's upstream step builds them (e.g. `death_window || ' | ' || …`). */
export const JOINT_DELIMITER = ' | ';

export const sectionKey = (source, variable) => `${source}:${variable}`;

/**
 * Sum one metric's site rows to study level (or keep one group with `groupId`).
 * Per Source × Variable × Category: Σ Count and Σ Participants. Per Source × Variable: Σ Total, taking each
 * site's Total once (it repeats on every category row). Category order is first appearance. Rows at other group levels
 * (country, study) are left out, so they're never counted as extra sites.
 */
export function sumSitesToStudy(rows, { groupId = null } = {}) {
  const sections = new Map();
  for (const r of rows) {
    if (r.GroupLevel !== 'Site') continue;
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
 * A card shows one section (`only`, a list of 'Source:Variable' keys) or a joint-count table (`joint`, #10). `maxBars`
 * caps each section's category bars below its top-N, so a breakdown fits its card (#32).
 * @param {{ rows: any[] | undefined, metric: any, study: any, siteRows?: any[], config: any, groupId?: string | null, only?: string[] | null, joint?: { rows: string, columns: string[] } | null, maxBars?: number }} input
 */
export function buildDistributionModel({ rows, metric, study, siteRows, config, groupId = null, only = null, joint = null, maxBars = Infinity }) {
  if (!config) return { state: 'missing' };
  const totals = scopeTotals({ study, siteRows, groupId });
  if (rows === undefined) return { state: 'empty', reason: 'not-published', header: header(metric, totals) };
  const wanted = joint ? [joint.rows, ...joint.columns] : only;
  const sections = sumSitesToStudy(rows, { groupId }).filter((s) => !wanted || wanted.includes(sectionKey(s.Source, s.Variable)));
  if (!sections.length) return { state: 'empty', reason: 'no-rows', header: header(metric, totals) };
  if (joint) return { state: 'ok', header: header(metric, totals), joint: jointTable(sections, joint, config) };

  const ordered = [...sections].sort((a, b) => (a.Source === b.Source ? 0 : a.Source === 'Numerator' ? -1 : 1));
  return {
    state: 'ok',
    header: header(metric, totals),
    sections: ordered.map((s) => section(s, { config, maxBars })),
  };
}

/**
 * Counts only (#10): a row per category of the `rows` section with its count, then, for each column section, a
 * column per second part of its "<row> | <column>" categories. Blank rows are counted in a "Not recorded" row with no
 * cells; a blank combined category (either part blank upstream) has no cell. Either is noted. Columns keep first
 * appearance; a pair with no rows is 0, and a row only the combined sections name has no count of its own.
 */
function jointTable(sections, joint, config) {
  const byKey = new Map(sections.map((s) => [sectionKey(s.Source, s.Variable), s]));
  const label = (key) => config.sections?.[key]?.label ?? config.sections?.[key]?.title ?? key.slice(key.indexOf(':') + 1);
  const rowSection = byKey.get(joint.rows);
  const rowCounts = new Map((rowSection?.categories ?? []).filter((c) => c.Category !== null).map((c) => [c.Category, c.Count]));
  const rowBlank = rowSection?.categories.find((c) => c.Category === null)?.Count ?? 0;
  const rowNames = [...rowCounts.keys()];
  let blank = rowBlank;
  const groups = joint.columns.map((key) => {
    const cells = new Map();
    const columns = [];
    for (const c of byKey.get(key)?.categories ?? []) {
      const at = c.Category === null ? -1 : c.Category.indexOf(JOINT_DELIMITER);
      if (at < 0) {
        blank += c.Count;
        continue;
      }
      const row = c.Category.slice(0, at);
      const column = c.Category.slice(at + JOINT_DELIMITER.length);
      if (!rowNames.includes(row)) rowNames.push(row);
      if (!columns.includes(column)) columns.push(column);
      cells.set(`${row}${JOINT_DELIMITER}${column}`, c.Count);
    }
    return { key, label: label(key), columns, cells };
  });
  const rows = rowNames.map((row) => ({
    label: row,
    total: rowCounts.get(row) ?? null,
    cells: groups.map((g) => g.columns.map((column) => g.cells.get(`${row}${JOINT_DELIMITER}${column}`) ?? 0)),
  }));
  if (rowBlank > 0) rows.push({ label: NOT_RECORDED, total: rowBlank, cells: groups.map((g) => g.columns.map(() => null)) });
  return {
    rowLabel: label(joint.rows),
    totalLabel: config.sections?.[joint.rows]?.total ?? 'n',
    groups: groups.map(({ key, label: l, columns }) => ({ key, label: l, columns })),
    rows,
    footnotes: blank > 0 ? ['not-recorded'] : [],
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

// Status sections (the metric's denominator) show each category's share of their population; reason sections (its
// numerator) show counts (design follow-up, 2026-11-13).
function section(s, { config, maxBars }) {
  const sc = config.sections?.[sectionKey(s.Source, s.Variable)] ?? {};
  const isStatus = (config.statusVariables ?? []).includes(s.Variable);
  const colours = config.colours ?? null;
  const display = s.Source === 'Denominator' ? 'percent' : 'count';
  const { shown, rest, blank } = orderAndCollapse(s.categories, Math.min(sc.topN ?? config.topN ?? Infinity, maxBars));

  const bar = (c, label, kind) => ({
    kind,
    category: c.Category,
    label,
    count: c.Count,
    percent: display === 'percent' ? ratio(c.Count, s.Total) : null,
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
    display,
    valueLabel: display === 'percent' ? (sc.percentLabel ?? config.percentLabel ?? '%') : 'n',
    total: s.Total,
    isStatus,
    bars,
    footnotes,
  };
}

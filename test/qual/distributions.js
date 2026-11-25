// @ts-check
// Independent recount of distribution rows from simulated records, for double programming.
// Deliberately shares no code with scripts/example-distributions.mjs: one pass over the records, tallying
// every (variable, category) pair, instead of filtering the pool once per category.

const key = (source, variable, category) => `${source}\u0000${variable}\u0000${category === null ? '\u0001' : category}`;

/**
 * @param records  [{ participant, inNumerator, values: { [variable]: value | value[] } }]
 * @param variables [{ Source, Variable, categories }]
 * @returns Map of key(Source, Variable, Category) → { Count, Participants, Total }
 */
export function recount(records, variables) {
  const totals = { Numerator: 0, Denominator: records.length };
  const tally = new Map();
  for (const r of records) {
    if (r.inNumerator) totals.Numerator += 1;
    for (const { Source, Variable } of variables) {
      if (Source === 'Numerator' && !r.inNumerator) continue;
      const raw = r.values[Variable];
      if (raw === undefined) continue;
      const seen = new Set();
      for (const category of [].concat(raw)) {
        if (seen.has(category)) continue;
        seen.add(category);
        const k = key(Source, Variable, category);
        const t = tally.get(k) ?? { count: 0, people: new Set() };
        t.count += 1;
        t.people.add(r.participant);
        tally.set(k, t);
      }
    }
  }
  const out = new Map();
  for (const { Source, Variable, categories } of variables) {
    for (const category of categories) {
      const t = tally.get(key(Source, Variable, category));
      out.set(key(Source, Variable, category), { Count: t?.count ?? 0, Participants: t?.people.size ?? 0, Total: totals[Source] });
    }
  }
  return out;
}

export const rowKey = (row) => key(row.Source, row.Variable, row.Category);

/**
 * Independent site-to-study sum for one metric's rows: nested objects keyed by Source → Variable, one Total per
 * site, Counts and Participants accumulated per category.
 */
export function studyTotals(rows, groupId = null) {
  const out = {};
  for (const r of rows) {
    if (r.GroupLevel !== 'Site') continue;
    if (groupId !== null && r.GroupID !== groupId) continue;
    out[r.Source] ??= {};
    const v = (out[r.Source][r.Variable] ??= { siteTotals: {}, categories: {} });
    v.siteTotals[r.GroupID] = r.Total;
    const name = r.Category === null ? '\u0001' : r.Category;
    const c = (v.categories[name] ??= { Count: 0, Participants: 0 });
    c.Count += r.Count;
    c.Participants += r.Participants;
  }
  for (const source of Object.values(out)) {
    for (const v of Object.values(source)) v.Total = Object.values(v.siteTotals).reduce((a, b) => a + b, 0);
  }
  return out;
}

export const categoryName = (category) => (category === null ? '\u0001' : category);

/**
 * Independent expectation of the Layout A view for one metric, written from the issue #10 rules rather than from
 * src/: numerator sections first (otherwise first appearance), bars by descending count with ties in first-appearance
 * order (by name, ignoring case, where the section asks for alphabetical ties, #19), the top N then one "+ k more" bar holding the rest, "Not recorded" last and only when non-zero. A
 * denominator (status) section shows each bar's share of the section total; a numerator (reason) section shows its
 * count. Every bar's hover is its count out of the section total.
 * @param {{ Source: string, Variable: string, Category: string | null, GroupID: string, GroupLevel?: string, Count: number, Participants: number, Total: number }[]} allRows one metric's rows; only site rows count
 * @param {{ sections?: Record<string, { title?: string, topN?: number, ties?: string }>, topN?: number }} config keyed by 'Source:Variable'
 */
export function expectedView(allRows, config) {
  const rows = allRows.filter((r) => r.GroupLevel === 'Site');
  const sums = studyTotals(rows);
  const seen = [];
  for (const r of rows) if (!seen.includes(`${r.Source}|${r.Variable}`)) seen.push(`${r.Source}|${r.Variable}`);
  const keys = [...seen.filter((k) => k.startsWith('Numerator|')), ...seen.filter((k) => !k.startsWith('Numerator|'))];
  return keys.map((key) => {
    const [Source, Variable] = key.split('|');
    const t = sums[Source][Variable];
    const sc = config.sections?.[`${Source}:${Variable}`] ?? {};
    const limit = sc.topN ?? config.topN ?? Infinity;
    const named = sc.ties === 'alphabetical';
    const categories = [];
    for (const r of rows) {
      if (r.Source === Source && r.Variable === Variable && r.Category !== null && !categories.includes(r.Category)) categories.push(r.Category);
    }
    const ranked = categories.map((c, i) => ({ c, i, n: t.categories[c].Count })).sort((a, b) => b.n - a.n || (named ? (a.c.toUpperCase() < b.c.toUpperCase() ? -1 : a.c.toUpperCase() > b.c.toUpperCase() ? 1 : 0) : 0) || a.i - b.i);
    const display = Source === 'Denominator' ? 'percent' : 'count';
    const bar = (label, kind, count) => ({
      label, kind, count,
      percent: display === 'percent' && t.Total > 0 ? count / t.Total : null,
      hover: { count, of: t.Total },
    });
    const bars = ranked.slice(0, limit).map((x) => bar(x.c, 'category', x.n));
    if (ranked.length > limit) bars.push(bar(`+ ${ranked.length - limit} more`, 'more', ranked.slice(limit).reduce((a, x) => a + x.n, 0)));
    const blank = t.categories[categoryName(null)]?.Count ?? 0;
    if (blank > 0) bars.push(bar('Not recorded', 'not-recorded', blank));
    const counted = Object.values(t.categories).reduce((a, c) => a + c.Count, 0);
    return { Source, Variable, title: sc.title ?? Variable, Total: t.Total, display, bars, notes: { multi: counted > t.Total, notRecorded: blank > 0 } };
  });
}

/**
 * Independent count of numerator records by one single-value variable, over every record set given (one per site).
 * A blank value counts under `null`.
 * @param {Array<Array<{ inNumerator: boolean, values: Record<string, unknown> }>>} recordSets
 * @param {string} variable
 * @returns {Map<string | null, number>}
 */
export function countBy(recordSets, variable) {
  const counts = new Map();
  for (const records of recordSets) {
    for (const r of records) {
      if (!r.inNumerator) continue;
      const value = r.values[variable] ?? null;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Independent joint count of numerator records by two of their single-value variables, for a joint-count table
 * (#10, widget 4): how many records have each pair of values, and how many each first value, over every record
 * set given (one per site). A blank first value counts under `null`; a record with either value blank is left out of
 * the pairs.
 * @param {Array<Array<{ inNumerator: boolean, values: Record<string, unknown> }>>} recordSets
 * @param {string} rowVariable
 * @param {string} columnVariable
 * @returns {{ rows: Map<string | null, number>, pairs: Map<string, number> }} pairs keyed "row\u0000column"
 */
export function jointRecount(recordSets, rowVariable, columnVariable) {
  const rows = new Map();
  const pairs = new Map();
  for (const records of recordSets) {
    for (const r of records) {
      if (!r.inNumerator) continue;
      const row = r.values[rowVariable] ?? null;
      const column = r.values[columnVariable];
      rows.set(row, (rows.get(row) ?? 0) + 1);
      if (row === null || column == null) continue;
      const k = `${row}\u0000${column}`;
      pairs.set(k, (pairs.get(k) ?? 0) + 1);
    }
  }
  return { rows, pairs };
}

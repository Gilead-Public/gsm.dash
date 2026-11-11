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
 * order, the top N then one "+ k more" bar holding the rest, "Not recorded" last and only when non-zero, the share of
 * the section total and, where configured, of the metric's denominator.
 * @param {{ Source: string, Variable: string, Category: string | null, GroupID: string, Count: number, Participants: number, Total: number }[]} rows one metric's site rows
 * @param {{ sections?: Record<string, { title?: string, topN?: number }>, topN?: number, enrolledPercent?: boolean }} config keyed by 'Source:Variable'
 * @param {{ Numerator: number, Denominator: number }} totals for the same scope as `rows`
 */
export function expectedView(rows, config, totals) {
  const sums = studyTotals(rows);
  const seen = [];
  for (const r of rows) if (!seen.includes(`${r.Source}|${r.Variable}`)) seen.push(`${r.Source}|${r.Variable}`);
  const keys = [...seen.filter((k) => k.startsWith('Numerator|')), ...seen.filter((k) => !k.startsWith('Numerator|'))];
  return keys.map((key) => {
    const [Source, Variable] = key.split('|');
    const t = sums[Source][Variable];
    const sc = config.sections?.[`${Source}:${Variable}`] ?? {};
    const limit = sc.topN ?? config.topN ?? Infinity;
    const categories = [];
    for (const r of rows) {
      if (r.Source === Source && r.Variable === Variable && r.Category !== null && !categories.includes(r.Category)) categories.push(r.Category);
    }
    const ranked = categories.map((c, i) => ({ c, i, n: t.categories[c].Count })).sort((a, b) => b.n - a.n || a.i - b.i);
    const twoPercentages = Source === 'Numerator' && config.enrolledPercent === true && totals?.Denominator > 0;
    const bar = (label, kind, count) => ({
      label, kind, count,
      population: t.Total > 0 ? count / t.Total : null,
      enrolled: twoPercentages ? count / totals.Denominator : null,
    });
    const bars = ranked.slice(0, limit).map((x) => bar(x.c, 'category', x.n));
    if (ranked.length > limit) bars.push(bar(`+ ${ranked.length - limit} more`, 'more', ranked.slice(limit).reduce((a, x) => a + x.n, 0)));
    const blank = t.categories[categoryName(null)]?.Count ?? 0;
    if (blank > 0) bars.push(bar('Not recorded', 'not-recorded', blank));
    const counted = Object.values(t.categories).reduce((a, c) => a + c.Count, 0);
    return { Source, Variable, title: sc.title ?? Variable, Total: t.Total, twoPercentages, bars, notes: { multi: counted > t.Total, notRecorded: blank > 0 } };
  });
}

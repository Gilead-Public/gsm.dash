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

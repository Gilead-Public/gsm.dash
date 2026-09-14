// Column sorting for the program table. Pure so it can be unit-tested; the
// table supplies a valueOf(row) for the active key.

/**
 * Next sort state when a header is clicked. Numeric columns start descending
 * (highest rates first — the exec question is "where is it worst?"); text
 * columns start ascending. Clicking the same header cycles to the other
 * direction, then back to unsorted.
 */
export function nextSort(current, key, { numeric = true } = {}) {
  const first = numeric ? 'desc' : 'asc';
  const second = numeric ? 'asc' : 'desc';
  if (current.key !== key) return { key, dir: first };
  if (current.dir === first) return { key, dir: second };
  return { key: null, dir: null };
}

/**
 * Stable sort; null/undefined values always sort last regardless of direction.
 * @param {Array} rows
 * @param {{key: (string|null), dir: ('asc'|'desc'|null)}} sort
 * @param {(row: any) => (number|string|null)} valueOf
 */
export function sortRows(rows, sort, valueOf) {
  if (!sort?.key || !sort.dir) return rows;
  const sign = sort.dir === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: valueOf(row) }))
    .sort((a, b) => {
      const aNull = a.value == null;
      const bNull = b.value == null;
      if (aNull || bNull) return aNull === bNull ? a.index - b.index : aNull ? 1 : -1;
      const cmp =
        typeof a.value === 'string' || typeof b.value === 'string'
          ? String(a.value).localeCompare(String(b.value))
          : a.value - b.value;
      return cmp !== 0 ? sign * cmp : a.index - b.index;
    })
    .map(({ row }) => row);
}

// The numeric heart of gsm.dash (design doc §4.3). Pure functions over
// contract-shaped rows; the qualification target for double-programming QC.

/**
 * Pick each study's own latest snapshot date <= asOf. Studies snapshot on
 * independent cadences, so a global max date would silently drop studies —
 * every rollup must go through this selection.
 * @param {Array<{StudyID: string, snapshots: string[]}>} studies
 * @param {string|null} asOf ISO date, or null for "latest available per study"
 * @returns {Map<string, string>} StudyID -> SnapshotDate (studies with none <= asOf omitted)
 */
export function selectLatestSnapshots(studies, asOf = null) {
  const out = new Map();
  for (const study of studies) {
    const eligible = asOf ? study.snapshots.filter((d) => d <= asOf) : study.snapshots;
    if (eligible.length) out.set(study.StudyID, eligible.reduce((a, b) => (a > b ? a : b)));
  }
  return out;
}

/**
 * Pooled rollup: sum numerators / sum denominators across study-level rows.
 * Each study is implicitly weighted by its denominator.
 * @param {Array<{StudyID: string, Numerator: number, Denominator: number}>} rows one per study
 */
export function poolResults(rows) {
  let num = 0;
  let den = 0;
  const studyIDs = new Set();
  for (const r of rows) {
    num += r.Numerator;
    den += r.Denominator;
    studyIDs.add(r.StudyID);
  }
  return { Numerator: num, Denominator: den, Rate: den > 0 ? num / den : null, NumStudies: studyIDs.size };
}

/**
 * Site flag distribution. NA (Flag null/undefined — non-evaluable sites) is a
 * distinct bucket and is INCLUDED in the share denominator; the prototype
 * silently excluded it and we surface it instead.
 * @param {Array<{Flag: (number|null)}>} siteRows
 */
export function flagDistribution(siteRows) {
  const d = { red: 0, amber: 0, green: 0, na: 0 };
  for (const { Flag } of siteRows) {
    if (Flag == null) d.na += 1;
    else if (Math.abs(Flag) >= 2) d.red += 1;
    else if (Math.abs(Flag) >= 1) d.amber += 1;
    else d.green += 1;
  }
  d.total = d.red + d.amber + d.green + d.na;
  d.share = d.total > 0 ? (d.red + d.amber) / d.total : 0;
  return d;
}

/**
 * Group filtered studies into buckets by one study param, preserving a stable
 * sorted order. Returns [{value, studies}] plus the full set as `all`.
 */
export function bucketStudies(studies, param) {
  const buckets = new Map();
  for (const study of studies) {
    const value = study.params?.[param] ?? '(missing)';
    if (!buckets.has(value)) buckets.set(value, []);
    buckets.get(value).push(study);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([value, bucketStudies]) => ({ value, studies: bucketStudies }));
}

/** AND across params, OR within a param; empty selection = no constraint. */
export function filterStudies(studies, filters) {
  return studies.filter((study) =>
    Object.entries(filters).every(
      ([param, values]) => values.size === 0 || values.has(String(study.params?.[param]))
    )
  );
}

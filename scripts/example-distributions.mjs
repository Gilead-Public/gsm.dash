// Simulated Reporting_Distributions (gsm.roadmap#617) for the example data.
//
// Each metric's records are simulated per site from that metric's own Numerator and Denominator, so every
// distribution reconciles with its metric. They are not one coherent cohort across metrics.
// Records are participants, except for protocol deviations, where each record is one deviation.
// A null category is a blank value, displayed as "Not recorded".

const NR = null;

const DISCONTINUATION_REASONS = ['Withdrawal by Participant', 'Lost to Follow-Up', 'Death', 'Study Discontinuation: Other'];
const TREATMENT_REASONS = ['Adverse Event', 'Progressive Disease', 'Physician Decision', 'Withdrawal by Participant', 'Other'];
const IE_CRITERIA = ['IN01', 'IN02', 'IN04', 'IN07', 'EX01', 'EX03', 'EX06', 'EX09'];
const STRAT_FACTORS = ['Region', 'Disease Stage', 'Prior Therapy', 'Age Group'];
const SF_REASONS = ['Inclusion Criteria Not Met', 'Exclusion Criteria Met', 'Withdrawal by Participant', 'Other'];
const DOSED_STATUSES = ['Dosed – ongoing', 'Dosed – treatment complete', 'Dosed – premature treatment discontinuation'];
const PD_CATEGORIES = ['Informed Consent', 'Eligibility Criteria', 'Investigational Product', 'Study Procedures', 'Visit Schedule', 'Safety Reporting', 'Other'];

function weighted(rand, entries) {
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let x = rand() * total;
  for (const [value, w] of entries) {
    x -= w;
    if (x < 0) return value;
  }
  return entries[entries.length - 1][0];
}

/** One to `max` distinct values, or a blank with probability `blank`. */
function several(rand, values, weights, blank) {
  if (rand() < blank) return [NR];
  const k = weighted(rand, weights);
  const pool = [...values];
  const out = [];
  while (out.length < k && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

const completion = (ctx, rand, done, ongoing) => (rand() < 0.1 + 0.5 * ctx.progress ? done : ongoing);

/**
 * Per metric: which population the records are (`unit`), the variables with their full category grids, and
 * how one record's categories are drawn. `inNumerator` is fixed before `assign` runs, so totals always reconcile.
 * Variable names follow #617's category columns; `disposition`, `eligibility_status`, `screening_status` and
 * `dvdecod` follow the 2026-11-09 design review and await #617's confirmation.
 */
export const DISTRIBUTION_SPECS = [
  {
    id: 'kri0006',
    unit: 'participant',
    variables: [
      { Source: 'Numerator', Variable: 'compreas', categories: [...DISCONTINUATION_REASONS, NR] },
      { Source: 'Denominator', Variable: 'disposition', categories: [...DISCONTINUATION_REASONS, 'Study Completion', 'Ongoing', NR] },
    ],
    assign(rec, rand, ctx) {
      if (rec.inNumerator) {
        const reason = weighted(rand, [[DISCONTINUATION_REASONS[0], 35], [DISCONTINUATION_REASONS[1], 20], [DISCONTINUATION_REASONS[2], 15], [DISCONTINUATION_REASONS[3], 22], [NR, 8]]);
        return { compreas: reason, disposition: reason };
      }
      return { disposition: completion(ctx, rand, 'Study Completion', 'Ongoing') };
    },
  },
  {
    id: 'kri0007-2',
    unit: 'participant',
    variables: [
      { Source: 'Numerator', Variable: 'drv_premature_discontinuation_reason', categories: [...TREATMENT_REASONS, NR], multi: true },
      { Source: 'Denominator', Variable: 'drv_drg_completion', categories: [...DOSED_STATUSES, NR] },
    ],
    assign(rec, rand, ctx) {
      if (rec.inNumerator) {
        return {
          drv_premature_discontinuation_reason: several(rand, TREATMENT_REASONS, [[1, 70], [2, 30]], 0.07),
          drv_drg_completion: DOSED_STATUSES[2],
        };
      }
      return { drv_drg_completion: completion(ctx, rand, DOSED_STATUSES[1], DOSED_STATUSES[0]) };
    },
  },
  {
    id: 'kri0019',
    unit: 'participant',
    // One combined IP status: the three treatment statuses of dosed participants plus the non-starter statuses
    // (design review 2026-11-09). Whether #617 emits them as one variable is still open.
    variables: [
      { Source: 'Denominator', Variable: 'ipns_status', categories: [...DOSED_STATUSES, 'Potential Non-Starter – within window', 'Potential Non-Starter – outside window', 'Confirmed Non-Starter', NR] },
    ],
    assign(rec, rand, ctx) {
      if (rec.inNumerator) return { ipns_status: 'Confirmed Non-Starter' };
      const status = weighted(rand, [['dosed', 955], ['Potential Non-Starter – within window', 30], ['Potential Non-Starter – outside window', 15]]);
      if (status !== 'dosed') return { ipns_status: status };
      if (rand() < 0.09) return { ipns_status: DOSED_STATUSES[2] };
      return { ipns_status: completion(ctx, rand, DOSED_STATUSES[1], DOSED_STATUSES[0]) };
    },
  },
  {
    id: 'kri0014',
    unit: 'participant',
    variables: [
      { Source: 'Numerator', Variable: 'ietestcd_concat', categories: [...IE_CRITERIA, NR], multi: true },
      { Source: 'Denominator', Variable: 'eligibility_status', categories: ['Eligible', 'Potentially Ineligible', 'Ineligible', NR] },
    ],
    assign(rec, rand) {
      if (rec.inNumerator) {
        return {
          ietestcd_concat: several(rand, IE_CRITERIA, [[1, 60], [2, 30], [3, 10]], 0.05),
          eligibility_status: rand() < 0.55 ? 'Ineligible' : 'Potentially Ineligible',
        };
      }
      return { eligibility_status: 'Eligible' };
    },
  },
  {
    id: 'kri0015',
    unit: 'participant',
    variables: [
      { Source: 'Numerator', Variable: 'death_window', categories: ['Day 1–30', 'Day 31–90', NR] },
      { Source: 'Numerator', Variable: 'ineligible_flag', categories: ['Eligible', 'Ineligible', NR] },
      // Relatedness has no mapped source yet (#617, data requirement R5/R6).
      { Source: 'Numerator', Variable: 'treatment_related', categories: ['Related', 'Not related', NR] },
    ],
    assign(rec, rand, ctx) {
      if (!rec.inNumerator) return {};
      return {
        death_window: rec.index < ctx.early ? 'Day 1–30' : 'Day 31–90',
        ineligible_flag: rand() < 0.12 ? 'Ineligible' : 'Eligible',
        treatment_related: weighted(rand, [['Related', 30], ['Not related', 60], [NR, 10]]),
      };
    },
  },
  {
    id: 'strat0001',
    unit: 'participant',
    variables: [
      { Source: 'Numerator', Variable: 'factor_names', categories: [...STRAT_FACTORS, NR], multi: true },
      { Source: 'Denominator', Variable: 'strat_status', categories: ['Correctly Stratified', 'Mis-stratified', NR] },
    ],
    assign(rec, rand) {
      if (rec.inNumerator) return { factor_names: several(rand, STRAT_FACTORS, [[1, 75], [2, 25]], 0), strat_status: 'Mis-stratified' };
      return { strat_status: rand() < 0.02 ? NR : 'Correctly Stratified' };
    },
  },
  {
    id: 'kri0012',
    unit: 'participant',
    variables: [
      { Source: 'Numerator', Variable: 'sf_reason', categories: [...SF_REASONS, NR] },
      // The metric's denominator (screened) excludes anyone still in screening, so "In Screening" stays 0 until
      // #617 says whether the all-participants population is available.
      { Source: 'Denominator', Variable: 'screening_status', categories: ['Screen Failure', 'In Screening', 'Enrolled', NR] },
    ],
    assign(rec, rand) {
      if (rec.inNumerator) {
        return { sf_reason: weighted(rand, [[SF_REASONS[0], 40], [SF_REASONS[1], 30], [SF_REASONS[2], 15], [SF_REASONS[3], 10], [NR, 5]]), screening_status: 'Screen Failure' };
      }
      return { screening_status: 'Enrolled' };
    },
  },
  {
    id: 'kri0004',
    unit: 'deviation',
    variables: [{ Source: 'Numerator', Variable: 'dvdecod', categories: [...PD_CATEGORIES, NR] }],
    assign: (rec, rand) => ({ dvdecod: weighted(rand, [[PD_CATEGORIES[0], 22], [PD_CATEGORIES[1], 20], [PD_CATEGORIES[2], 18], [PD_CATEGORIES[3], 14], [PD_CATEGORIES[4], 8], [PD_CATEGORIES[5], 10], [PD_CATEGORIES[6], 5], [NR, 3]]) }),
  },
  {
    id: 'kri0003',
    unit: 'deviation',
    variables: [{ Source: 'Numerator', Variable: 'dvdecod', categories: [...PD_CATEGORIES, NR] }],
    assign: (rec, rand) => ({ dvdecod: weighted(rand, [[PD_CATEGORIES[0], 6], [PD_CATEGORIES[1], 4], [PD_CATEGORIES[2], 10], [PD_CATEGORIES[3], 28], [PD_CATEGORIES[4], 34], [PD_CATEGORIES[5], 8], [PD_CATEGORIES[6], 7], [NR, 3]]) }),
  },
];

/**
 * Records for one metric at one site. Participant metrics have one record per denominator participant, the
 * first `numerator` of them in the numerator. Deviation metrics have one record per deviation, each owned
 * by one of the site's `participants`.
 */
export function simulateRecords(spec, { numerator, denominator, participants, early = 0, progress = 0 }, rand) {
  const ctx = { early, progress };
  const n = spec.unit === 'deviation' ? numerator : denominator;
  return Array.from({ length: n }, (_, index) => {
    const rec = {
      index,
      participant: spec.unit === 'deviation' ? Math.floor(rand() * Math.max(1, participants)) : index,
      inNumerator: spec.unit === 'deviation' || index < numerator,
    };
    return { ...rec, values: spec.assign(rec, rand, ctx) };
  });
}

const valuesOf = (rec, variable) => {
  const v = rec.values[variable];
  return v === undefined ? [] : Array.isArray(v) ? v : [v];
};

/** Rows for every variable and every category in its grid, zeros included. */
export function distributionRows(spec, records, { GroupID, MetricID, StudyID, SnapshotDate }) {
  const rows = [];
  for (const { Source, Variable, categories } of spec.variables) {
    const pool = Source === 'Numerator' ? records.filter((r) => r.inNumerator) : records;
    const Total = pool.length;
    for (const Category of categories) {
      const hits = pool.filter((r) => valuesOf(r, Variable).includes(Category));
      const Count = hits.length;
      rows.push({
        GroupID, GroupLevel: 'Site', MetricID, Source, Variable, Category, Count,
        Participants: new Set(hits.map((r) => r.participant)).size,
        Total,
        Percent: Total > 0 ? +(Count / Total).toFixed(6) : null,
        StudyID, SnapshotDate,
      });
    }
  }
  return rows;
}

/** FNV-1a, to seed one independent stream per study snapshot without disturbing the main generator. */
export function seedOf(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

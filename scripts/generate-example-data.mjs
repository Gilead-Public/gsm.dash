// Deterministic simulated portfolio conforming to schemas/. Regenerate with
// `npm run generate-data`. Metric IDs and abbreviations match the released
// gsm.kri catalog (inst/workflow/2_metrics); every number is fake.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'examples', 'data');
const SCHEMA_VERSION = '1.0.0';

// mulberry32 — stable data across runs
function rng(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(53);

// The CTQ Oversight Dashboard metric glossary (gsm.roadmap#53 design
// artifact): names, numerator/denominator text, display rule, status and
// category come from the tracker. IDs kri0001–0015 are the released gsm.kri
// catalog; `ctq*` IDs are placeholders for Planned metrics whose workflows
// are owned by other roadmap Requirements. Every number is simulated.
//
// den: which simulated site quantity is the denominator. base: study-level
// rate (per day for exposure metrics). derived metrics are computed from the
// site populations so the population columns and the metrics reconcile.
const GLOSSARY = [
  // Disposition
  { id: 'kri0012', abbr: 'SF', name: 'Screen Failure Rate', cat: 'Disposition', status: 'Released', display: 'pct', pop: 'Screened', num: 'Number of screen failed participants', den: 'Total screened participants', denKey: 'screened', derived: 'sf', base: 0.18, note: 'The tracker also lists a Planned "Screen Failure" divided by all enrolled (open question Q1).' },
  { id: 'kri0006', abbr: 'SDSC', name: 'Study Discontinuation Rate', cat: 'Disposition', status: 'Released', display: 'count_pct', pop: 'Enrolled', num: 'Number of participants with premature study discontinuation', den: 'All enrolled', denKey: 'enrolled', base: 0.08, req: 61 },
  { id: 'kri0007', abbr: 'TDSC', name: 'Treatment Discontinuation Rate', cat: 'Disposition', status: 'Released', display: 'count_pct', pop: 'Dosed', num: 'Number of participants with premature treatment discontinuation', den: 'All dosed', denKey: 'dosed', base: 0.11, req: 90, note: 'Tracker: changed-in-dev (denominator moves to all dosed).' },
  { id: 'ctq0001', abbr: 'WC', name: 'Withdrawal of Consent', cat: 'Disposition', status: 'Planned', display: 'count_pct', pop: 'Enrolled', num: 'Number of participants who withdrew consent from the study', den: 'All enrolled', denKey: 'enrolled', base: 0.03, req: 61 },
  { id: 'ctq0002', abbr: 'LTFU', name: 'Lost to Follow Up', cat: 'Disposition', status: 'Planned', display: 'count_pct', pop: 'Enrolled', num: 'Number of participants lost to follow-up', den: 'All enrolled', denKey: 'enrolled', base: 0.015, req: 61 },
  // Early events
  { id: 'ctq0003', abbr: 'DTH30', name: 'Early Deaths (30 days)', cat: 'Early events', status: 'Planned', display: 'count_pct', pop: 'Enrolled', num: 'Number of participants who died within 30 days from randomization', den: 'All enrolled', denKey: 'enrolled', derived: 'dth30', base: 0.006, req: 121 },
  { id: 'kri0015', abbr: 'DTH90', name: 'Early Deaths (90 days)', cat: 'Early events', status: 'Planned', display: 'count_pct', pop: 'Enrolled', num: 'Number of participants who died within 90 days from randomization', den: 'All enrolled', denKey: 'enrolled', base: 0.018, req: 121 },
  { id: 'ctq0004', abbr: 'IPNS', name: 'IP Non-starters', cat: 'Early events', status: 'Planned', display: 'count_pct', pop: 'Enrolled', num: 'Number of confirmed IP non-starters', den: 'All enrolled', denKey: 'enrolled', derived: 'ipns', base: 0.02, req: 56 },
  // Eligibility & integrity
  { id: 'kri0014', abbr: 'IE', name: 'Eligibility', cat: 'Eligibility & integrity', status: 'Planned', display: 'count_pct', pop: 'Enrolled', num: 'Number of ineligible participants', den: 'All enrolled', denKey: 'enrolled', base: 0.03, req: 49 },
  { id: 'ctq0005', abbr: 'STRAT', name: 'Stratification', cat: 'Eligibility & integrity', status: 'Planned', display: 'count_pct', pop: 'Enrolled', num: 'Number of confirmed mis-stratified participants', den: 'All enrolled', denKey: 'enrolled', base: 0.02, req: 49 },
  { id: 'ctq0006', abbr: 'PFSC', name: 'Premature Censoring for PFS', cat: 'Eligibility & integrity', status: 'Planned', display: 'count_pct', pop: 'Enrolled', num: 'Number of participants at very high risk for premature censoring for PFS', den: 'All enrolled', denKey: 'enrolled', base: 0.025, req: 261 },
  // Safety & deviations
  { id: 'kri0001', abbr: 'AE', name: 'AE Reporting Rate', cat: 'Safety & deviations', status: 'New', display: 'per_28d', num: 'Number of AEs reported', den: 'Exposure in days', denKey: 'exposureDays', base: 1.1 / 28 },
  { id: 'kri0002', abbr: 'SAE', name: 'SAE Reporting Rate', cat: 'Safety & deviations', status: 'New', display: 'per_28d', num: 'Number of SAEs reported', den: 'Exposure in days', denKey: 'exposureDays', base: 0.09 / 28 },
  { id: 'kri0003', abbr: 'PD', name: 'Non-Important Protocol Deviation Rate', cat: 'Safety & deviations', status: 'New', display: 'per_28d', num: 'Number of non-important PDs', den: 'Exposure in days', denKey: 'exposureDays', base: 0.32 / 28 },
  { id: 'kri0004', abbr: 'IPD', name: 'Important Protocol Deviation Rate', cat: 'Safety & deviations', status: 'New', display: 'per_28d', num: 'Number of important PDs', den: 'Exposure in days', denKey: 'exposureDays', base: 0.05 / 28 },
  { id: 'kri0005', abbr: 'LB', name: 'G3+ Lab Abnormality Rate', cat: 'Safety & deviations', status: 'Released', display: 'count_pct', num: 'Number of G3+ abnormal lab samples', den: 'Total # lab samples', denKey: 'labSamples', base: 0.04 },
  // Data quality
  { id: 'kri0008', abbr: 'QRY', name: 'Query Rate', cat: 'Data quality', status: 'Released', display: 'pct', num: 'Total # queries', den: 'Total # data points', denKey: 'dataPoints', derived: 'qry', base: 0.06 },
  { id: 'kri0009', abbr: 'OQRY', name: 'Delayed Query Resolution Rate', cat: 'Data quality', status: 'Released', display: 'pct', num: '# queries ever open > 30 days', den: 'Total # queries', denKey: 'queries', base: 0.09 },
  { id: 'kri0010', abbr: 'ODAT', name: 'Delayed Data Entry Rate', cat: 'Data quality', status: 'Released', display: 'pct', num: 'Total # data pages entered > 10 days', den: 'Total # data pages', denKey: 'dataPages', base: 0.11 },
  { id: 'kri0011', abbr: 'CDAT', name: 'Data Change Rate', cat: 'Data quality', status: 'Released', display: 'pct', num: 'Total # data points with > 1 change', den: 'Total # data points', denKey: 'dataPoints', base: 0.03 },
  // Not in the CTQ tracker (open question Q7): kept to exercise catalog handling.
  { id: 'kri0013', abbr: 'PK', name: 'PK Collection Compliance Rate', cat: 'Data quality', display: 'pct', num: 'PK samples collected', den: 'PK samples expected', denKey: 'labSamples', base: 0.06, active: false },
  // One study-level metric (a QTL) to exercise the hold-back path: the
  // dashboard's core input is site-level metrics; other levels are a future release.
  { id: 'qtl0001', abbr: 'QTL-DC', name: 'Discontinuation QTL', cat: 'Disposition', display: 'pct', num: 'Participants discontinued', den: 'All enrolled', denKey: 'enrolled', base: 0.12, level: 'Study' },
];

export const METRICS = GLOSSARY.map((g, i) => ({
  MetricID: `Analysis_${g.id}`,
  Type: 'Analysis',
  ID: g.id,
  GroupLevel: g.level ?? 'Site',
  Abbreviation: g.abbr,
  Metric: g.name,
  Numerator: g.num,
  Denominator: g.den,
  Model: 'Normal Approximation',
  AnalysisType: 'rate',
  Score: 'Adjusted Z-Score',
  Threshold: '-2,-1,2,3',
  Flag: '-2,-1,0,1,2',
  Priority: i + 1,
  Active: g.active ?? true, // one inactive metric to exercise catalog handling
  // Glossary metadata (P1): how the dashboard displays the metric, which
  // participant population the denominator counts, tracker status, owner.
  Display: g.display,
  ...(g.pop && { Population: g.pop }),
  ...(g.status && { Status: g.status }),
  ...(g.req && { RequirementID: g.req }),
  ...(g.note && { Note: g.note }),
  Definition: null, // the tracker's Definition column is empty (open question Q2)
  // Shared by the study page tile rows and the program table column bands.
  Category: g.cat,
  ...(g.abbr === 'IE' && { Widget: 'breakdown-bar' }),
  ...(g.abbr === 'DTH90' && {
    Widget: 'link-out',
    WidgetConfig: { href: 'https://gilead-biostats.github.io/gsm.kri/', label: 'mortality report' },
  }),
  // generator-only; stripped before writing
  base: g.base,
  denKey: g.denKey,
  derived: g.derived,
}));

// Mapped_EXCLUSION's real Source attribution levels — the breakdown-bar demo
// mirrors the phase-2 `details` slice (counts aggregated at export).
const IE_SOURCES = ['EDC I/E only', 'Eligibility PD only', 'Ineligible, Both Criteria'];

const SNAPSHOT_DATES = ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30'];
const TAS = ['Cardiology', 'Immunology', 'Neurology', 'Oncology', 'Virology'];
const INDICATIONS = ['Dermatology', 'Hematology', 'Respiratory', 'Solid Tumors'];
const PHASES = ['P1', 'P2', 'P3'];
const STATUSES = ['Active', 'Completed', 'Enrolling'];
const NICKNAMES = ['ATLAS', 'BEACON', 'COBALT', 'DELTA', 'EMBER', 'FALCON', 'GRANITE', 'HARBOR', 'IRIS', 'JUNIPER', 'KESTREL', 'LUMEN'];

function pick(arr) {
  return arr[Math.floor(R() * arr.length)];
}

export function generateStudies(n = 12) {
  return Array.from({ length: n }, (_, i) => {
    const StudyID = `STUDY${String(i + 1).padStart(3, '0')}`;
    // A few studies lag a month — snapshot cadences are independent by design.
    const nSnaps = R() < 0.25 ? SNAPSHOT_DATES.length - 1 : SNAPSHOT_DATES.length;
    const nSites = 8 + Math.floor(R() * 12);
    const sites = Array.from({ length: nSites }, (_, s) => `SITE${String(i * 100 + s + 1).padStart(4, '0')}`);
    return {
      StudyID,
      params: {
        nickname: `${NICKNAMES[i]}-${1 + Math.floor(R() * 3)}`, // Mapped_STUDY carries a protocol nickname
        therapeutic_area: pick(TAS),
        protocol_indication: pick(INDICATIONS),
        phase: pick(PHASES),
        status: pick(STATUSES),
        product: `Product ${'ABCDEFGHIJKL'[i]}`,
      },
      snapshots: SNAPSHOT_DATES.slice(0, nSnaps),
      sites,
      // Final enrolment per site; earlier snapshots see a growing share of it.
      siteSize: sites.map(() => 10 + Math.floor(R() * 80)),
      drift: (R() - 0.45) * 0.03, // monthly rate drift for trend shape
      // Per-metric study character: deviation from the base rate, and how
      // much sites disagree (drives the share of flagged sites).
      character: Object.fromEntries(METRICS.map((m) => [m.MetricID, { factor: 0.6 + R() * 0.8, spread: 0.2 + R() * 0.6 }])),
    };
  });
}

/** Stochastic rounding, so rare events still occur at small sites. */
const sround = (x) => Math.floor(x + R());

function scoreToFlag(score) {
  if (score <= -2 || score >= 3) return Math.sign(score) * 2;
  if (score <= -1 || score >= 2) return Math.sign(score);
  return 0;
}

/**
 * Simulated Reporting_Bounds for the scatter plot envelope: the normal
 * approximation gsm uses — for a pooled rate p and denominator d, the numerator
 * at threshold z is p·d + z·sqrt(p(1−p)d). Threshold 0 is the trend line.
 */
function generateBounds(metricId, rate, siteDens, thresholds = [-2, -1, 0, 2, 3]) {
  const lo = Math.max(1, Math.min(...siteDens));
  const hi = Math.max(...siteDens);
  const p = Math.min(0.999, Math.max(0.001, rate));
  const rows = [];
  for (let i = 0; i < 14; i += 1) {
    const d = Math.round(lo * Math.pow(hi / lo, i / 13)); // log-spaced, matching the log x-axis
    for (const z of thresholds) {
      const n = Math.max(0, p * d + z * Math.sqrt(p * (1 - p) * d));
      rows.push({ MetricID: metricId, Threshold: z, Denominator: d, LogDenominator: +Math.log10(d).toFixed(4), Numerator: +n.toFixed(2), Metric: +(n / d).toFixed(4) });
    }
  }
  return rows;
}

/**
 * Site populations for one snapshot: enrolled grows over the study's life;
 * screened, dosed, exposure days and data volumes follow from it. SF, IPNS
 * and DTH30 are derived from these so the program table's Screened / Enrolled
 * / Dosed columns reconcile with the metrics that divide by them.
 */
function sitePopulations(study, snapIndex, siteRate) {
  const months = snapIndex + 1;
  const growth = 0.45 + (0.55 * months) / SNAPSHOT_DATES.length;
  const jitter = () => 0.8 + R() * 0.4;
  return study.sites.map((site, s) => {
    const p = { site, enrolled: Math.max(3, Math.round(study.siteSize[s] * growth)) };
    const sf = Math.min(0.8, siteRate('SF', s));
    p.screened = p.enrolled + sround((p.enrolled * sf) / (1 - sf));
    p.ipns = Math.min(p.enrolled, sround(p.enrolled * siteRate('IPNS', s)));
    p.dosed = p.enrolled - p.ipns;
    p.exposureDays = Math.round(p.dosed * (30 + 26 * months) * jitter());
    p.labSamples = Math.round(p.dosed * (4 + 3 * months) * jitter());
    p.dataPoints = Math.round(p.enrolled * (60 + 40 * months) * jitter());
    p.dataPages = Math.round(p.enrolled * (8 + 5 * months) * jitter());
    p.queries = sround(p.dataPoints * siteRate('QRY', s));
    p.dth90 = Math.min(p.enrolled, sround(p.enrolled * siteRate('DTH90', s)));
    p.dth30 = Math.min(p.dth90, sround(p.dth90 * (0.25 + 0.2 * R())));
    return p;
  });
}

export function generateSnapshot(study, snapshotDate, snapIndex, metrics = METRICS, { withBounds = false } = {}) {
  const results = [];
  const details = [];
  const bounds = [];
  const byAbbr = new Map(METRICS.map((m) => [m.Abbreviation, m]));
  const studyRate = (m) => Math.max(m.base * 0.05, m.base * study.character[m.MetricID].factor * (1 + study.drift * snapIndex));
  // One rate draw per site and metric: site-to-site spread plus an occasional problem site.
  const draws = new Map();
  const siteRate = (abbr, s) => {
    const m = byAbbr.get(abbr);
    const key = `${abbr}|${s}`;
    if (!draws.has(key)) {
      const { spread } = study.character[m.MetricID];
      const outlier = R() < 0.06 ? 1.9 + R() : 1;
      draws.set(key, Math.max(0, studyRate(m) * (1 + (R() * 2 - 1) * spread) * outlier));
    }
    return draws.get(key);
  };
  const pops = sitePopulations(study, snapIndex, siteRate);
  const enrolledTotal = pops.reduce((a, p) => a + p.enrolled, 0);

  for (const m of metrics) {
    if (m.GroupLevel === 'Study') {
      // Study-level metrics arrive as a single study row with no site rows.
      const den = enrolledTotal;
      const num = sround(den * studyRate(m));
      results.push({
        GroupID: study.StudyID, GroupLevel: 'Study', MetricID: m.MetricID,
        Numerator: num, Denominator: den, Metric: den > 0 ? +(num / den).toFixed(4) : null,
        Score: null, Flag: null, StudyID: study.StudyID, SnapshotDate: snapshotDate,
      });
      continue;
    }
    const p0 = studyRate(m);
    let studyNum = 0;
    let studyDen = 0;
    pops.forEach((p, s) => {
      let num;
      let den = p[m.denKey];
      if (m.derived === 'sf') num = p.screened - p.enrolled;
      else if (m.derived === 'ipns') num = p.ipns;
      else if (m.derived === 'qry') num = p.queries;
      else if (m.derived === 'dth30') num = p.dth30;
      else if (m.Abbreviation === 'DTH90') num = p.dth90;
      else num = Math.min(den, sround(den * siteRate(m.Abbreviation, s)));
      const rate = den > 0 ? num / den : null;
      // Normal approximation with over-dispersion: binomial SE or a relative
      // floor, whichever is larger.
      const sd = Math.max(p0 * 0.35, Math.sqrt((p0 * (1 - Math.min(p0, 0.99))) / Math.max(den, 1)));
      const score = rate == null ? null : (rate - p0) / sd;
      const evaluable = p.enrolled >= 12 && rate != null; // small sites are non-evaluable -> Flag null (NA)
      results.push({
        GroupID: p.site,
        GroupLevel: 'Site',
        MetricID: m.MetricID,
        Numerator: num,
        Denominator: den,
        Metric: rate == null ? null : +rate.toFixed(6),
        Score: evaluable ? +score.toFixed(2) : null,
        Flag: evaluable ? scoreToFlag(score) : null,
        StudyID: study.StudyID,
        SnapshotDate: snapshotDate,
      });
      studyNum += num;
      studyDen += den;
    });
    results.push({
      GroupID: study.StudyID,
      GroupLevel: 'Study',
      MetricID: m.MetricID,
      Numerator: studyNum,
      Denominator: studyDen,
      Metric: studyDen > 0 ? +(studyNum / studyDen).toFixed(6) : null,
      Score: null,
      Flag: null,
      StudyID: study.StudyID,
      SnapshotDate: snapshotDate,
    });
    if (withBounds && studyDen > 0) {
      bounds.push(...generateBounds(m.MetricID, studyNum / studyDen, pops.map((p) => p[m.denKey])));
    }
    if (m.Abbreviation === 'IE') {
      // Category counts must reconcile with the study-level numerator.
      const c1 = Math.round(studyNum * (0.4 + R() * 0.2));
      const c2 = Math.round((studyNum - c1) * (0.5 + R() * 0.2));
      const counts = [c1, c2, studyNum - c1 - c2];
      IE_SOURCES.forEach((Category, i) =>
        details.push({ MetricID: m.MetricID, Category, Numerator: counts[i] })
      );
    }
  }
  const sum = (k) => pops.reduce((a, p) => a + p[k], 0);
  const studyParams = {
    ...study.params,
    // Participant populations (P4): enrolled is the existing ParticipantCount;
    // screened and dosed are new optional Reporting_Groups params.
    ParticipantCount: sum('enrolled'),
    ScreenedCount: sum('screened'),
    DosedCount: sum('dosed'),
  };
  const groups = [
    ...Object.entries(studyParams).map(([Param, Value]) => ({
      GroupID: study.StudyID,
      GroupLevel: 'Study',
      Param,
      Value,
    })),
    // Site metadata as Reporting_Groups carries it: gsm.viz reads ParticipantCount
    // (point sizing) and a label key from these rows.
    ...pops.flatMap((p, i) => [
      { GroupID: p.site, GroupLevel: 'Site', Param: 'Country', Value: pick(['US', 'DE', 'JP', 'BR', 'PL']) },
      { GroupID: p.site, GroupLevel: 'Site', Param: 'ParticipantCount', Value: p.enrolled },
      { GroupID: p.site, GroupLevel: 'Site', Param: 'InvestigatorLastName', Value: `Investigator ${String.fromCharCode(65 + (i % 26))}` },
    ]),
  ];
  const snapshot = { schemaVersion: SCHEMA_VERSION, StudyID: study.StudyID, SnapshotDate: snapshotDate, results, groups, details };
  if (withBounds) snapshot.bounds = bounds;
  return snapshot;
}

export function generatePortfolio() {
  const studies = generateStudies();
  // Bounds are single-snapshot by design (Reporting_Bounds); emitting them only
  // for each study's latest snapshot keeps the example data small.
  const byStudy = studies.map((s) =>
    s.snapshots.map((d, i) => generateSnapshot(s, d, i, METRICS, { withBounds: i === s.snapshots.length - 1 }))
  );
  // The manifest's params are the study's most recent snapshot.
  const latestParams = (snaps) =>
    Object.fromEntries(snaps[snaps.length - 1].groups.filter((g) => g.GroupLevel === 'Study').map((g) => [g.Param, g.Value]));
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    generated: '2026-08-31T12:00:00Z',
    studies: studies.map((s, i) => ({
      StudyID: s.StudyID,
      params: latestParams(byStudy[i]),
      snapshots: s.snapshots,
      files: Object.fromEntries(s.snapshots.map((d) => [d, `studies/${s.StudyID}/${d}.json`])),
    })),
    metrics: METRICS.map(({ base, denKey, derived, ...m }) => m),
  };
  return { manifest, snapshots: byStudy.flat() };
}

function main() {
  const { manifest, snapshots } = generatePortfolio();
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'portfolio.json'), JSON.stringify(manifest, null, 1));
  for (const snap of snapshots) {
    const dir = join(OUT, 'studies', snap.StudyID);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${snap.SnapshotDate}.json`), JSON.stringify(snap));
  }
  console.log(`Wrote ${snapshots.length} snapshots for ${manifest.studies.length} studies to ${OUT}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

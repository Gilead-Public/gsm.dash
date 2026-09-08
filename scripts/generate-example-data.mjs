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

export const METRICS = [
  ['Analysis_kri0001', 'AE', 'Adverse Event Rate', 0.34, 1],
  ['Analysis_kri0002', 'SAE', 'Serious Adverse Event Rate', 0.08, 2],
  ['Analysis_kri0003', 'PD', 'Non-Important Protocol Deviation Rate', 0.15, 3],
  ['Analysis_kri0004', 'IPD', 'Important Protocol Deviation Rate', 0.05, 4],
  ['Analysis_kri0005', 'LB', 'Grade 3+ Lab Abnormality Rate', 0.12, 5],
  ['Analysis_kri0006', 'SDSC', 'Study Discontinuation Rate', 0.1, 6],
  ['Analysis_kri0007', 'TDSC', 'Treatment Discontinuation Rate', 0.14, 7],
  ['Analysis_kri0008', 'QRY', 'Query Rate', 0.22, 8],
  ['Analysis_kri0009', 'OQRY', 'Delayed Query Resolution Rate', 0.09, 9],
  ['Analysis_kri0010', 'ODAT', 'Delayed Data Entry Rate', 0.11, 10],
  ['Analysis_kri0011', 'CDAT', 'Data Change Rate', 0.07, 11],
  ['Analysis_kri0012', 'SF', 'Screen Failure Rate', 0.18, 12],
  ['Analysis_kri0013', 'PK', 'PK Collection Compliance Rate', 0.06, 13],
  ['Analysis_kri0014', 'IE', 'Ineligibility', 0.04, 14],
  ['Analysis_kri0015', 'DTH90', 'Premature Death Rate', 0.03, 15],
  // One study-level metric (a QTL) to exercise the hold-back path: the
  // dashboard's core input is site-level metrics; other levels are a future release.
  ['Analysis_qtl0001', 'QTL-DC', 'Discontinuation QTL', 0.12, 16, 'Study'],
].map(([MetricID, Abbreviation, Metric, base, Priority, GroupLevel = 'Site']) => ({
  MetricID,
  Type: 'Analysis',
  ID: MetricID.replace('Analysis_', ''),
  GroupLevel,
  Abbreviation,
  Metric,
  Numerator: 'Events',
  Denominator: 'Exposure',
  Threshold: '-2,-1,2,3',
  Flag: '-2,-1,0,1,2',
  Priority,
  Active: Abbreviation !== 'PK', // one inactive metric to exercise catalog handling
  // Study-page metadata (widget framework, Design 3): Category drives tile
  // rows; Widget overrides the default scalar-tile view.
  Category: { SF: 'Enrollment', IE: 'Enrollment', QRY: 'Data Quality', OQRY: 'Data Quality', ODAT: 'Data Quality', CDAT: 'Data Quality', PK: 'Data Quality' }[Abbreviation] ?? 'On-Treatment',
  ...(Abbreviation === 'IE' && { Widget: 'breakdown-bar' }),
  ...(Abbreviation === 'DTH90' && {
    Widget: 'link-out',
    WidgetConfig: { href: 'https://gilead-biostats.github.io/gsm.kri/', label: 'mortality report' },
  }),
  base, // generator-only; stripped before writing
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
    return {
      StudyID,
      params: {
        nickname: `${NICKNAMES[i]}-${1 + Math.floor(R() * 3)}`, // Mapped_STUDY carries a protocol nickname
        therapeutic_area: pick(TAS),
        protocol_indication: pick(INDICATIONS),
        phase: pick(PHASES),
        status: pick(STATUSES),
        product: `Product ${'ABCDEFGHIJKL'[i]}`,
        ParticipantCount: 200 + Math.floor(R() * 1600),
      },
      snapshots: SNAPSHOT_DATES.slice(0, nSnaps),
      sites: Array.from({ length: nSites }, (_, s) => `SITE${String(i * 100 + s + 1).padStart(4, '0')}`),
      drift: (R() - 0.45) * 0.03, // monthly rate drift for trend shape
      factor: 0.7 + R() * 0.6, // study-level deviation from metric base rate
    };
  });
}

function scoreToFlag(score) {
  if (score <= -2 || score >= 3) return Math.sign(score) * 2;
  if (score <= -1 || score >= 2) return Math.sign(score);
  return 0;
}

export function generateSnapshot(study, snapshotDate, snapIndex, metrics = METRICS) {
  const results = [];
  const details = [];
  for (const m of metrics) {
    const studyRate = Math.max(0.005, m.base * study.factor * (1 + study.drift * snapIndex));
    if (m.GroupLevel === 'Study') {
      // Study-level metrics arrive as a single study row with no site rows.
      const den = 200 + Math.floor(R() * 400);
      const num = Math.round(den * studyRate);
      results.push({
        GroupID: study.StudyID, GroupLevel: 'Study', MetricID: m.MetricID,
        Numerator: num, Denominator: den, Metric: +(num / den).toFixed(4),
        Score: null, Flag: null, StudyID: study.StudyID, SnapshotDate: snapshotDate,
      });
      continue;
    }
    let studyNum = 0;
    let studyDen = 0;
    for (const site of study.sites) {
      const den = 30 + Math.floor(R() * 150);
      const outlier = R() < 0.06 ? 1.9 + R() : 1; // occasional problem site
      const rate = Math.max(0, studyRate * (0.6 + R() * 0.8) * outlier);
      const num = Math.round(den * rate);
      const score = (rate - studyRate) / Math.max(0.015, studyRate * 0.45);
      const evaluable = den >= 40; // small sites are non-evaluable -> Flag null (NA)
      results.push({
        GroupID: site,
        GroupLevel: 'Site',
        MetricID: m.MetricID,
        Numerator: num,
        Denominator: den,
        Metric: den > 0 ? +(num / den).toFixed(4) : null,
        Score: evaluable ? +score.toFixed(2) : null,
        Flag: evaluable ? scoreToFlag(score) : null,
        StudyID: study.StudyID,
        SnapshotDate: snapshotDate,
      });
      studyNum += num;
      studyDen += den;
    }
    results.push({
      GroupID: study.StudyID,
      GroupLevel: 'Study',
      MetricID: m.MetricID,
      Numerator: studyNum,
      Denominator: studyDen,
      Metric: studyDen > 0 ? +(studyNum / studyDen).toFixed(4) : null,
      Score: null,
      Flag: null,
      StudyID: study.StudyID,
      SnapshotDate: snapshotDate,
    });
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
  const groups = [
    ...Object.entries(study.params).map(([Param, Value]) => ({
      GroupID: study.StudyID,
      GroupLevel: 'Study',
      Param,
      Value,
    })),
    ...study.sites.map((site) => ({ GroupID: site, GroupLevel: 'Site', Param: 'Country', Value: pick(['US', 'DE', 'JP', 'BR', 'PL']) })),
  ];
  return { schemaVersion: SCHEMA_VERSION, StudyID: study.StudyID, SnapshotDate: snapshotDate, results, groups, details };
}

export function generatePortfolio() {
  const studies = generateStudies();
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    generated: '2026-08-31T12:00:00Z',
    studies: studies.map((s) => ({
      StudyID: s.StudyID,
      params: s.params,
      snapshots: s.snapshots,
      files: Object.fromEntries(s.snapshots.map((d) => [d, `studies/${s.StudyID}/${d}.json`])),
    })),
    metrics: METRICS.map(({ base, ...m }) => m),
  };
  const snapshots = studies.flatMap((s) => s.snapshots.map((d, i) => generateSnapshot(s, d, i)));
  return { manifest, snapshots };
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

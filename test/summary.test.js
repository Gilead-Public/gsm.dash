import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { writeExampleData } from '../scripts/generate-example-data.mjs';
import { buildSummary } from '../scripts/portfolio-summary.mjs';
import { PortfolioStore } from '../src/data/store.js';
import { tableRows } from '../src/app/portfolio-table.js';
import { indexSummary } from '../src/data/summary.js';
import { latestSnapshot, pooled, pooledTrend, population, shownMetrics, snapshotAsOf, studiesBy } from './qual/pooling.js';

let dir;
let files;

/** Reads the example data back from disk, as the app and the independent pooling both see it. */
function readDir(root) {
  const parsed = new Map();
  const read = (path) => {
    if (!parsed.has(path)) parsed.set(path, JSON.parse(readFileSync(join(root, path), 'utf8')));
    return parsed.get(path);
  };
  const manifest = read('portfolio.json');
  const snapshots = manifest.studies.flatMap((s) => Object.values(s.files).map(read));
  return { root, read, manifest, summary: read('summary.json'), snapshots };
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'gsm-dash-summary-'));
  writeExampleData(dir);
  files = readDir(dir);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** The store's rollup in the oracle's terms. */
const fromStore = (r) => ({
  numerator: r.Numerator,
  denominator: r.Denominator,
  rate: r.Rate,
  studies: r.NumStudies,
  sites: r.NumSites,
  flags: { red: r.flags.red, amber: r.flags.amber, green: r.flags.green, na: r.flags.na },
  share: r.flags.share,
});

/** The independent pooling, with the flag share a reader computes from the counts. */
function expected(read, studies, metricId, asOf) {
  const p = pooled(read, studies, metricId, asOf);
  const total = p.flags.red + p.flags.amber + p.flags.green + p.flags.na;
  return { ...p, share: total > 0 ? (p.flags.red + p.flags.amber) / total : 0 };
}

/**
 * Every rollup, trend point and population the store computes from the summary, compared with pooling the files.
 * @returns {number} how many values were compared
 */
function compareAll({ read, manifest, summary, snapshots }, sets, asOfs) {
  const store = new PortfolioStore({ manifest, summary, snapshots });
  const metrics = shownMetrics(manifest.metrics);
  let compared = 0;
  for (const asOf of asOfs) {
    store.set('asOf', asOf);
    for (const [label, studies] of sets) {
      for (const m of metrics) {
        expect(fromStore(store.rollup(studies, m.MetricID)), `${label} · ${m.Abbreviation} · as of ${asOf ?? 'latest'}`).toEqual(
          expected(read, studies, m.MetricID, asOf),
        );
        compared++;
      }
      const pop = store.population(studies);
      expect([pop.screened, pop.enrolled, pop.dosed], `${label} populations as of ${asOf ?? 'latest'}`).toEqual(
        ['ScreenedCount', 'ParticipantCount', 'DosedCount'].map((param) => population(read, studies, param, asOf)),
      );
      compared += 3;
    }
  }
  store.set('asOf', null);
  for (const [label, studies] of sets) {
    for (const m of metrics) {
      const trend = store.trendSeries(m.MetricID, studies).map((p) => ({ date: p.date, rate: p.rate, studies: p.nStudies }));
      expect(trend, `${label} · ${m.Abbreviation} trend`).toEqual(pooledTrend(read, studies, m.MetricID));
      compared += trend.length;
    }
  }
  return compared;
}

/** The day before the earliest snapshot of any study, when no study has data yet. */
const dayBeforeData = (studies) => {
  const first = studies.flatMap((s) => s.snapshots).sort()[0];
  return new Date(Date.parse(first) - 864e5).toISOString().slice(0, 10);
};

/** Each study alone, every phase and therapeutic area, and the whole portfolio. */
function studySets(studies) {
  return [
    ['portfolio', studies],
    ...studies.map((s) => [s.StudyID, [s]]),
    ...[...studiesBy(studies, 'phase')].map(([v, list]) => [`phase ${v}`, list]),
    ...[...studiesBy(studies, 'therapeutic_area')].map(([v, list]) => [`area ${v}`, list]),
  ];
}

describe('portfolio numbers from the counts-only summary', () => {
  it('15.01: every portfolio number computed from the summary equals pooling the per-study files, latest and as of every snapshot date (#15)', () => {
    const { manifest } = files;
    const studies = manifest.studies;
    const dates = [...new Set(studies.flatMap((s) => s.snapshots))].sort();
    expect(new Set(studies.map((s) => s.snapshots[0])).size, 'studies start on different snapshots').toBeGreaterThan(1);
    expect(dates.length).toBeGreaterThan(3);
    const before = dayBeforeData(studies);
    expect(population(files.read, studies, 'ParticipantCount', before), 'no study has data yet').toBeNull();
    const compared = compareAll(files, studySets(studies), [null, before, ...dates]);
    expect(compared).toBeGreaterThan(5000);
  });

  it('15.01: the summary still agrees where a denominator is zero, a metric has no site rows, a study has no snapshot yet, or a population is not reported (#15)', () => {
    const edge = mkdtempSync(join(tmpdir(), 'gsm-dash-summary-edge-'));
    try {
      writeExampleData(edge);
      const { read, manifest } = readDir(edge);
      const [zeroed, emptied, late] = manifest.studies;
      const [m1, m2] = shownMetrics(manifest.metrics);
      const write = (path, data) => writeFileSync(join(edge, path), JSON.stringify(data));

      const zeroFile = zeroed.files[zeroed.snapshots.at(-1)];
      const zeroSnap = read(zeroFile);
      for (const r of zeroSnap.results) if (r.MetricID === m1.MetricID && r.GroupLevel === 'Site') Object.assign(r, { Numerator: 0, Denominator: 0 });
      zeroSnap.groups = zeroSnap.groups.filter((g) => !(g.GroupLevel === 'Study' && g.Param === 'ParticipantCount'));
      write(zeroFile, zeroSnap);

      const emptyFile = emptied.files[emptied.snapshots.at(-1)];
      const emptySnap = read(emptyFile);
      emptySnap.results = emptySnap.results.filter((r) => !(r.MetricID === m2.MetricID && r.GroupLevel === 'Site'));
      write(emptyFile, emptySnap);

      for (const study of manifest.studies) {
        const file = study.files[study.snapshots.at(-1)];
        const snap = read(file);
        snap.groups = snap.groups.filter((g) => !(g.GroupLevel === 'Study' && g.Param === 'DosedCount'));
        write(file, snap);
      }

      const dropped = late.snapshots.slice(0, 2);
      late.snapshots = late.snapshots.slice(2);
      for (const d of dropped) delete late.files[d];
      write('portfolio.json', manifest);

      const snapshots = manifest.studies.flatMap((s) => Object.values(s.files).map(read));
      write('summary.json', buildSummary(manifest, snapshots, read('summary.json').cycle));
      const data = readDir(edge);

      expect(expected(data.read, [zeroed], m1.MetricID, null).rate, 'a study whose denominator is zero').toBeNull();
      expect(expected(data.read, [emptied], m2.MetricID, null).studies, 'a study without site rows for a metric').toBe(0);
      expect(expected(data.read, [late], m1.MetricID, dropped[0]).studies, 'a study with no snapshot yet').toBe(0);
      const all = data.manifest.studies;
      expect(population(data.read, [zeroed], 'ParticipantCount'), 'a study that reports no enrollment').toBeNull();
      expect(population(data.read, all, 'DosedCount'), 'no study reports a dosed count').toBeNull();
      expect(snapshotAsOf(late, dropped[0]), 'the late study is not counted yet').toBeNull();
      expect(population(data.read, all, 'ParticipantCount', dropped[0]), 'counted studies only').toBeLessThan(
        population(data.read, all, 'ParticipantCount'),
      );
      const compared = compareAll(data, studySets(all), [null, dayBeforeData(all), '2025-12-31', ...dropped]);
      expect(compared).toBeGreaterThan(1000);
    } finally {
      rmSync(edge, { recursive: true, force: true });
    }
  });

  it('15.02: the schema accepts the generated summary but rejects stored ratios and unknown fields at every level (#15)', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(JSON.parse(readFileSync(new URL('../schemas/portfolio-summary.schema.json', import.meta.url))));
    const { summary } = files;
    expect(validate(summary), JSON.stringify(validate.errors?.slice(0, 3))).toBe(true);
    expect(summary.counts.length).toBeGreaterThan(1000);
    expect(summary.studies.every((s) => Number.isInteger(s.ParticipantCount)), 'population counts present').toBe(true);

    const variant = (change) => {
      const copy = structuredClone(summary);
      change(copy);
      return copy;
    };
    const row = (s) => s.counts[0];
    const rejected = {
      'a stored rate on a count row': (s) => (row(s).Rate = row(s).Numerator / row(s).Denominator),
      'a stored metric value on a count row': (s) => (row(s).Metric = 0.25),
      'a stored flag share': (s) => (row(s).FlagCounts.Share = 0.1),
      'a stored rate beside the counts': (s) => (s.rates = [{ StudyID: row(s).StudyID, Rate: 0.25 }]),
      'a stored rate on a study entry': (s) => (s.studies[0].Rate = 0.25),
      'a stored ratio in study parameters': (s) => (s.studies[0].params = { Rate: 0.25 }),
      'descriptive study parameters': (s) => (s.studies[0].params = { phase: 'Phase 3' }),
      'a fractional population count': (s) => (s.studies[0].ParticipantCount = 0.25),
      'a population count as text': (s) => (s.studies[0].ParticipantCount = '120'),
      'a fractional site count': (s) => (row(s).SiteCount = 2.5),
      'a fractional flag count': (s) => (row(s).FlagCounts['0'] = 0.5),
      'a negative numerator': (s) => (row(s).Numerator = -1),
      'a missing flag count': (s) => delete row(s).FlagCounts.NA,
      'a missing site count': (s) => delete row(s).SiteCount,
      'an unknown top-level field': (s) => (s.note = 'x'),
      'an unknown field on a count row': (s) => (row(s).Note = 'x'),
      'a malformed snapshot date': (s) => (row(s).SnapshotDate = '31/05/2026'),
    };
    for (const [what, change] of Object.entries(rejected)) expect(validate(variant(change)), what).toBe(false);
  });

  it('15.03: summary.json is at most 10% of the combined size of the per-study snapshot files the manifest lists (#15)', () => {
    const listed = files.manifest.studies.flatMap((s) => Object.values(s.files));
    expect(listed.length).toBeGreaterThan(50);
    const perStudy = listed.reduce((n, path) => n + statSync(join(dir, path)).size, 0);
    const summary = statSync(join(dir, 'summary.json')).size;
    expect(summary).toBeGreaterThan(0);
    expect(summary / perStudy, `${summary} of ${perStudy} bytes`).toBeLessThanOrEqual(0.1);
  });
});

describe('the snapshot cycle', () => {
  let edge;
  let data;
  let off;
  let inCycle;
  let cycleDate;

  // The example data with one study's latest snapshot dropped, so its latest is a cycle behind.
  beforeAll(() => {
    edge = mkdtempSync(join(tmpdir(), 'gsm-dash-summary-cycle-'));
    writeExampleData(edge);
    const { read, manifest } = readDir(edge);
    off = manifest.studies[2];
    const dropped = off.snapshots.at(-1);
    off.snapshots = off.snapshots.slice(0, -1);
    delete off.files[dropped];
    writeFileSync(join(edge, 'portfolio.json'), JSON.stringify(manifest));
    const snapshots = manifest.studies.flatMap((s) => Object.values(s.files).map(read));
    writeFileSync(join(edge, 'summary.json'), JSON.stringify(buildSummary(manifest, snapshots, read('summary.json').cycle)));
    data = readDir(edge);
    cycleDate = data.summary.cycle.SnapshotDate;
    inCycle = data.manifest.studies.filter((s) => latestSnapshot(s) === cycleDate);
  });

  afterAll(() => rmSync(edge, { recursive: true, force: true }));

  it('14.02: with one study off cycle, the portfolio totals equal pooling the in-cycle studies\' files (#14)', () => {
    expect(inCycle.map((s) => s.StudyID)).not.toContain(off.StudyID);
    expect(inCycle.length).toBe(data.manifest.studies.length - 1);
    const store = new PortfolioStore(data);
    const total = store.filteredStudies();
    expect(total.map((s) => s.StudyID)).toEqual(inCycle.map((s) => s.StudyID));

    let differs = 0;
    for (const m of shownMetrics(data.manifest.metrics)) {
      const want = expected(data.read, inCycle, m.MetricID, null);
      expect(fromStore(store.rollup(total, m.MetricID)), m.Abbreviation).toEqual(want);
      if (want.numerator !== expected(data.read, data.manifest.studies, m.MetricID, null).numerator) differs++;
    }
    expect(differs, 'leaving the off-cycle study out changes the totals').toBeGreaterThan(0);
    const pop = store.population(total);
    expect([pop.screened, pop.enrolled, pop.dosed]).toEqual(['ScreenedCount', 'ParticipantCount', 'DosedCount'].map((p) => population(data.read, inCycle, p)));
  });

  it('14.02: with one study off cycle, the total\'s and its group\'s trends keep that study\'s history before the cycle date, and end on the in-cycle totals (#14)', () => {
    const store = new PortfolioStore(data);
    /** The trend an independent reader expects: every study as of each earlier date, then the in-cycle studies. */
    const wanted = (studies, metricId) => [
      ...pooledTrend(data.read, studies, metricId).filter((p) => p.date < cycleDate),
      { date: cycleDate, ...(({ rate, studies: n }) => ({ rate, studies: n }))(pooled(data.read, studies.filter((s) => inCycle.includes(s)), metricId)) },
    ];
    const shown = (trend) => trend.map((p) => ({ date: p.date, rate: p.rate, studies: p.nStudies }));
    const phase = off.params.phase;
    const sameStudies = data.manifest.studies.filter((s) => s.params.phase === phase);
    expect(sameStudies.length, 'the off-cycle study shares its phase with another').toBeGreaterThan(1);

    let kept = 0;
    for (const m of shownMetrics(data.manifest.metrics)) {
      const { total } = tableRows(store);
      const want = wanted(data.manifest.studies, m.MetricID);
      expect(shown(total.trend(m.MetricID)), `${m.Abbreviation} total`).toEqual(want);
      const before = want.filter((p) => p.date < cycleDate);
      if (before.some((p, i) => p.rate !== pooledTrend(data.read, inCycle, m.MetricID)[i].rate)) kept++;
    }
    expect(kept, 'the off-cycle study\'s history changes the earlier points').toBeGreaterThan(0);

    store.set('groupBy', 'phase');
    const group = tableRows(store).primary.find((r) => r.label === phase);
    for (const m of shownMetrics(data.manifest.metrics)) {
      expect(shown(group.trend(m.MetricID)), `${m.Abbreviation} ${phase}`).toEqual(wanted(sameStudies, m.MetricID));
    }
  });
});

describe('a study ahead of the cycle', () => {
  it('is off cycle, and the trends still end on the cycle date', () => {
    const edge = mkdtempSync(join(tmpdir(), 'gsm-dash-summary-ahead-'));
    try {
      writeExampleData(edge);
      const { read, manifest } = readDir(edge);
      const ahead = manifest.studies[3];
      const later = '2026-07-31';
      const snap = { ...read(ahead.files[ahead.snapshots.at(-1)]), SnapshotDate: later };
      writeFileSync(join(edge, 'ahead.json'), JSON.stringify(snap));
      ahead.snapshots = [...ahead.snapshots, later];
      ahead.files[later] = 'ahead.json';
      writeFileSync(join(edge, 'portfolio.json'), JSON.stringify(manifest));
      const snapshots = manifest.studies.flatMap((s) => Object.values(s.files).map(read));
      const summary = buildSummary(manifest, snapshots, read('summary.json').cycle);
      writeFileSync(join(edge, 'summary.json'), JSON.stringify(summary));
      const data = readDir(edge);
      const store = new PortfolioStore(data);
      expect(store.cycle?.offCycle).toEqual([{ StudyID: ahead.StudyID, latest: later }]);
      const [m] = shownMetrics(data.manifest.metrics);
      const trend = tableRows(store).total.trend(m.MetricID);
      expect(trend.at(-1)?.date).toBe(summary.cycle.SnapshotDate);
      expect(trend.at(-1)?.nStudies).toBe(data.manifest.studies.length - 1);
    } finally {
      rmSync(edge, { recursive: true, force: true });
    }
  });
});

describe('reading the summary', () => {
  const studies = [{ StudyID: 'A', snapshots: ['2026-01-31', '2026-02-28'] }];
  const doc = (counts = [], entries = [{ StudyID: 'A', snapshots: ['2026-01-31', '2026-02-28'] }], cycle = { SnapshotDate: '2026-02-28', studies: entries.map((e) => e.StudyID) }) => ({
    cycle,
    studies: entries,
    counts,
  });
  const row = (date, metric = 'M') => ({ StudyID: 'A', SnapshotDate: date, MetricID: metric, Numerator: 1, Denominator: 2, SiteCount: 1, FlagCounts: {} });

  it('refuses a missing summary', () => {
    expect(() => indexSummary(null, studies)).toThrow(/summary \(summary.json\) is missing/);
  });

  it('refuses a summary that describes other studies or snapshots than the manifest', () => {
    expect(() => indexSummary(doc([], []), studies)).toThrow(/no entry for A/);
    expect(() => indexSummary(doc([], [{ StudyID: 'A', snapshots: ['2026-01-31'] }]), studies)).toThrow(/different snapshots for A/);
    expect(() => indexSummary(doc([], [...doc().studies, { StudyID: 'B', snapshots: ['2026-01-31'] }]), studies)).toThrow(/studies the manifest does not list/);
  });

  it('refuses a manifest or a summary that lists a study twice', () => {
    expect(() => indexSummary(doc([], [...doc().studies, ...doc().studies]), studies)).toThrow(/summary lists a study more than once/);
    expect(() => indexSummary(doc(), [...studies, ...studies])).toThrow(/manifest lists a study more than once/);
  });

  it('refuses counts for an unknown snapshot, or two rows for one study, snapshot and metric', () => {
    expect(() => indexSummary(doc([row('2026-03-31')]), studies)).toThrow(/not one of its snapshots/);
    expect(() => indexSummary(doc([row('2026-01-31'), row('2026-01-31')]), studies)).toThrow(/more than one row/);
  });

  it('the generator refuses a flag it cannot count', () => {
    const snap = { StudyID: 'A', SnapshotDate: '2026-01-31', results: [{ GroupID: 'S1', GroupLevel: 'Site', MetricID: 'M', Numerator: 1, Denominator: 2, Flag: 3 }] };
    expect(() => buildSummary({ generated: '', studies: [] }, [snap])).toThrow(/flag 3 is not -2, -1, 0, 1, 2 or missing/);
  });

  it('the generator refuses a population that is not a count', () => {
    const snap = { StudyID: 'A', SnapshotDate: '2026-01-31', results: [], groups: [{ GroupID: 'A', GroupLevel: 'Study', Param: 'ParticipantCount', Value: '0.25' }] };
    expect(() => buildSummary({ generated: '', studies: [{ StudyID: 'A', snapshots: ['2026-01-31'] }] }, [snap], { SnapshotDate: '2026-01-31', studies: ['A'] })).toThrow(
      /ParticipantCount 0.25 is not a count/,
    );
  });

  it('refuses a summary holding a study its cycle does not list', () => {
    expect(() => indexSummary(doc([], undefined, { SnapshotDate: '2026-02-28', studies: ['B'] }), studies)).toThrow(/has A, which its 2026-02-28 cycle does not list/);
  });

  it('names the studies off cycle, with their latest snapshot, and the listed studies with no entry', () => {
    const two = [...studies, { StudyID: 'C', snapshots: ['2026-01-31'] }];
    const index = indexSummary(doc([], two, { SnapshotDate: '2026-02-28', studies: ['A', 'B', 'C'] }), two);
    expect(index.cycle).toEqual({ SnapshotDate: '2026-02-28', offCycle: [{ StudyID: 'C', latest: '2026-01-31' }], missing: ['B'] });
    expect(indexSummary(doc(), studies).cycle).toEqual({ SnapshotDate: '2026-02-28', offCycle: [], missing: [] });
  });
});

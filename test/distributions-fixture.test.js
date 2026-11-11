import { describe, it, expect } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { generatePortfolio, METRICS, writeExampleData } from '../scripts/generate-example-data.mjs';
import { DISTRIBUTION_SPECS } from '../scripts/example-distributions.mjs';
import { recount, rowKey } from './qual/distributions.js';

const { manifest, snapshots, records } = generatePortfolio();
const latest = manifest.studies.map((s) => snapshots.find((x) => x.StudyID === s.StudyID && x.SnapshotDate === s.snapshots.at(-1)));
const configured = new Map(DISTRIBUTION_SPECS.map((spec) => [`Analysis_${spec.id}`, spec]));
const at = (snap, row) => `${snap.StudyID}|${row.GroupID}|${row.MetricID}`;

function resultIndex() {
  const index = new Map();
  for (const snap of latest) for (const r of snap.results) if (r.GroupLevel === 'Site') index.set(at(snap, r), r);
  return index;
}

function totalsMatch(source, field) {
  const results = resultIndex();
  let checked = 0;
  for (const snap of latest) {
    for (const row of snap.distributions.filter((d) => d.Source === source)) {
      expect(row.Total, `${at(snap, row)} ${row.Variable}`).toBe(results.get(at(snap, row))[field]);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(0);
}

function recountMatches(source) {
  let checked = 0;
  for (const snap of latest) {
    const bySite = Map.groupBy(snap.distributions.filter((d) => d.Source === source), (d) => `${snap.StudyID}|${snap.SnapshotDate}|${d.GroupID}|${d.MetricID}`);
    for (const [k, rows] of bySite) {
      const { spec, records: recs } = records.get(k);
      const expected = recount(recs, spec.variables);
      for (const row of rows) {
        const want = expected.get(rowKey(row));
        expect({ Count: row.Count, Participants: row.Participants, Total: row.Total }, `${k} ${row.Variable}=${row.Category}`).toEqual(want);
        expect(row.Percent ?? 0).toBeCloseTo(want.Total ? want.Count / want.Total : 0, 5);
        checked++;
      }
    }
  }
  expect(checked).toBeGreaterThan(0);
}

describe('simulated distributions for the #617 metrics', () => {
  it('9.01: numerator Totals equal the metric Numerator at every site (#9)', () => totalsMatch('Numerator', 'Numerator'));

  it('9.01: numerator rows equal an independent recount of the simulated records (#9)', () => recountMatches('Numerator'));

  it('9.02: denominator Totals equal the metric Denominator at every site (#9)', () => totalsMatch('Denominator', 'Denominator'));

  it('9.02: denominator rows equal an independent recount of the simulated records (#9)', () => recountMatches('Denominator'));

  it('9.03: for single-value variables the category Counts sum to Total (#9)', () => {
    let checked = 0;
    for (const snap of latest) {
      const groups = Map.groupBy(snap.distributions, (d) => `${d.GroupID}|${d.MetricID}|${d.Source}|${d.Variable}`);
      for (const [k, rows] of groups) {
        const variable = configured.get(rows[0].MetricID).variables.find((v) => v.Variable === rows[0].Variable && v.Source === rows[0].Source);
        if (variable.multi) continue;
        expect(rows.reduce((a, r) => a + r.Count, 0), k).toBe(rows[0].Total);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('9.04: in each latest snapshot every site in results for a configured metric has distribution rows (#9)', () => {
    for (const snap of latest) {
      const covered = new Set(snap.distributions.map((d) => `${d.GroupID}|${d.MetricID}`));
      const sites = snap.results.filter((r) => r.GroupLevel === 'Site' && configured.has(r.MetricID));
      expect(sites.length).toBeGreaterThan(0);
      for (const r of sites) expect(covered.has(`${r.GroupID}|${r.MetricID}`), `${snap.StudyID} ${r.GroupID} ${r.MetricID}`).toBe(true);
    }
  });

  it('9.05: every generated file, read back from disk, validates against the contract schemas (#9)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gsm-dash-data-'));
    try {
      writeExampleData(dir);
      const ajv = new Ajv({ allErrors: true, strict: false });
      addFormats(ajv);
      const schema = (name) => ajv.compile(JSON.parse(readFileSync(new URL(`../schemas/${name}`, import.meta.url))));
      const [validateSnapshot, validatePortfolio] = [schema('study-snapshot.schema.json'), schema('portfolio.schema.json')];
      const written = JSON.parse(readFileSync(join(dir, 'portfolio.json'), 'utf8'));
      expect(validatePortfolio(written), JSON.stringify(validatePortfolio.errors?.slice(0, 3))).toBe(true);

      const listed = written.studies.flatMap((s) => Object.values(s.files)).sort();
      const onDisk = readdirSync(join(dir, 'studies')).flatMap((study) => readdirSync(join(dir, 'studies', study)).map((f) => `studies/${study}/${f}`)).sort();
      expect(onDisk, 'files on disk are exactly the files the manifest lists').toEqual(listed);
      expect(listed.length).toBeGreaterThan(50);

      let withDistributions = 0;
      for (const rel of listed) {
        const snap = JSON.parse(readFileSync(join(dir, rel), 'utf8'));
        expect(validateSnapshot(snap), `${rel}: ${JSON.stringify(validateSnapshot.errors?.slice(0, 3))}`).toBe(true);
        if (snap.distributions?.length) withDistributions++;
      }
      expect(withDistributions, 'one latest snapshot per study carries distributions').toBe(written.studies.length);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('the fixture covers multi-value variables, blank categories and zero rows', () => {
    const rows = latest.flatMap((s) => s.distributions);
    expect(rows.some((r) => r.Category === null && r.Count > 0)).toBe(true);
    expect(rows.some((r) => r.Count === 0)).toBe(true);
    const sums = Map.groupBy(rows.filter((r) => r.Variable === 'ietestcd_concat'), (r) => `${r.StudyID}|${r.GroupID}`);
    expect([...sums.values()].some((g) => g.reduce((a, r) => a + r.Count, 0) > g[0].Total)).toBe(true);
  });

  it('every status variable uses exactly the labels agreed in the design review, each populated', () => {
    // Copied from issue #9 (design review 2026-11-09), not from the generator, so a dropped or renamed category fails here.
    const AGREED = {
      'Analysis_kri0014|eligibility_status': ['Eligible', 'Potentially Ineligible', 'Ineligible'],
      'Analysis_kri0019|ipns_status': [
        'Dosed – ongoing', 'Dosed – treatment complete', 'Dosed – premature treatment discontinuation',
        'Potential Non-Starter – within window', 'Potential Non-Starter – outside window', 'Confirmed Non-Starter',
      ],
      'Analysis_kri0006|disposition': ['Withdrawal by Participant', 'Lost to Follow-Up', 'Study Discontinuation: Other', 'Death', 'Study Completion', 'Ongoing'],
      'Analysis_kri0012|screening_status': ['Screen Failure', 'In Screening', 'Enrolled'],
    };
    // The metric's denominator (screened) excludes anyone still in screening, so this stays 0 until #617 answers.
    const ALWAYS_ZERO = new Set(['Analysis_kri0012|screening_status|In Screening']);
    const rows = latest.flatMap((snap) => snap.distributions);
    for (const [key, labels] of Object.entries(AGREED)) {
      const [metricId, variable] = key.split('|');
      const mine = rows.filter((r) => r.MetricID === metricId && r.Variable === variable);
      expect(new Set(mine.filter((r) => r.Category !== null).map((r) => r.Category)), key).toEqual(new Set(labels));
      for (const label of labels) {
        if (ALWAYS_ZERO.has(`${key}|${label}`)) continue;
        expect(mine.some((r) => r.Category === label && r.Count > 0), `${key} ${label}`).toBe(true);
      }
    }
  });

  it('uses the production metric IDs from the pipeline requirement', () => {
    const ids = new Set(METRICS.map((m) => m.ID));
    for (const id of ['kri0019', 'strat0001', 'kri0007-2']) expect(ids.has(id), id).toBe(true);
    for (const id of ['ctq0004', 'ctq0005']) expect(ids.has(id), id).toBe(false);
    for (const spec of DISTRIBUTION_SPECS) expect(ids.has(spec.id), spec.id).toBe(true);
  });

  it('only the latest snapshot of each study carries distributions, and only at site level', () => {
    for (const snap of snapshots) expect(Boolean(snap.distributions), `${snap.StudyID} ${snap.SnapshotDate}`).toBe(latest.includes(snap));
    expect(latest.flatMap((s) => s.distributions).every((r) => r.GroupLevel === 'Site')).toBe(true);
  });
});

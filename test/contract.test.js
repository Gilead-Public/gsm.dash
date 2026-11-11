import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import { generatePortfolio } from '../scripts/generate-example-data.mjs';

const ajv = new Ajv({ allErrors: true, strict: false });
const portfolioSchema = JSON.parse(readFileSync(new URL('../schemas/portfolio.schema.json', import.meta.url)));
const snapshotSchema = JSON.parse(readFileSync(new URL('../schemas/study-snapshot.schema.json', import.meta.url)));

describe('example data conforms to the contract schemas', () => {
  const { manifest, snapshots } = generatePortfolio();

  it('portfolio manifest validates', () => {
    const validate = ajv.compile(portfolioSchema);
    expect(validate(manifest), JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('every study snapshot validates', () => {
    const validate = ajv.compile(snapshotSchema);
    for (const snap of snapshots) {
      expect(validate(snap), `${snap.StudyID} ${snap.SnapshotDate}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
  });

  it('manifest file paths cover every generated snapshot', () => {
    const listed = new Set(manifest.studies.flatMap((s) => Object.values(s.files)));
    for (const snap of snapshots) {
      expect(listed.has(`studies/${snap.StudyID}/${snap.SnapshotDate}.json`)).toBe(true);
    }
  });

  it('for site-level metrics, the pipeline study row equals the sum of site rows (reconciliation)', () => {
    const snap = snapshots[0];
    const byMetric = {};
    for (const row of snap.results) {
      byMetric[row.MetricID] ??= { site: [0, 0], study: [0, 0], nSites: 0 };
      const slot = row.GroupLevel === 'Study' ? 'study' : 'site';
      byMetric[row.MetricID][slot][0] += row.Numerator;
      byMetric[row.MetricID][slot][1] += row.Denominator;
      if (slot === 'site') byMetric[row.MetricID].nSites += 1;
    }
    for (const [metricId, { site, study, nSites }] of Object.entries(byMetric)) {
      if (nSites === 0) continue; // study-level-only metrics (e.g. QTLs) have nothing to reconcile
      expect(study, metricId).toEqual(site);
    }
  });
});

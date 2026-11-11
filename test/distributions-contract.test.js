import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const schema = JSON.parse(readFileSync(new URL('../schemas/study-snapshot.schema.json', import.meta.url)));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const snapshot = (extra = {}) => ({ schemaVersion: '1.0.0', StudyID: 'AA-AA-000-0000', SnapshotDate: '2026-11-01', results: [], ...extra });

const row = (over = {}) => ({
  GroupID: '0001', GroupLevel: 'Site', MetricID: 'kri0005', Source: 'Numerator', Variable: 'aeser',
  Category: 'Y', Count: 3, Participants: 2, Total: 10, Percent: 0.3,
  StudyID: 'AA-AA-000-0000', SnapshotDate: '2026-11-01', ...over,
});

const without = (key) => {
  const r = row();
  delete r[key];
  return r;
};

const valid = (rows) => validate(snapshot({ distributions: rows }));

const REQUIRED = ['GroupID', 'GroupLevel', 'MetricID', 'Source', 'Variable', 'Category', 'Count', 'Participants', 'Total', 'Percent'];

const INVALID = {
  'a Source outside Numerator/Denominator': row({ Source: 'Both' }),
  'a negative Count': row({ Count: -1 }),
  'a negative Participants': row({ Participants: -1 }),
  'a negative Total': row({ Total: -5 }),
  'a Percent above 1': row({ Percent: 1.2 }),
  'a Percent below 0': row({ Percent: -0.1 }),
  'an unknown GroupLevel': row({ GroupLevel: 'Region' }),
};

describe('distributions in the study snapshot contract', () => {
  it('8.01: the schema accepts a valid distributions array (#8)', () => {
    const rows = [row(), row({ Source: 'Denominator', Variable: 'enrolled', Category: null, Count: 10, Participants: 10, Percent: 1 }), row({ GroupLevel: 'Study', GroupID: 'AA-AA-000-0000', Percent: null, Total: 0, Count: 0, Participants: 0 })];
    expect(valid(rows), JSON.stringify(validate.errors)).toBe(true);
  });

  for (const key of REQUIRED) {
    it(`8.01: the schema rejects a row missing ${key} (#8)`, () => {
      expect(valid([without(key)])).toBe(false);
    });
  }

  for (const [label, bad] of Object.entries(INVALID)) {
    it(`8.01: the schema rejects ${label} (#8)`, () => {
      expect(valid([bad])).toBe(false);
    });
  }

  it('8.02: a study file without distributions stays valid (#8)', () => {
    expect(validate(snapshot()), JSON.stringify(validate.errors)).toBe(true);
  });

  it('8.02: a study file with results but no distributions stays valid (#8)', () => {
    const results = [{ GroupID: '0001', GroupLevel: 'Site', MetricID: 'kri0001', Numerator: 1, Denominator: 10, Metric: 0.1, Score: 0, Flag: 0 }];
    expect(validate(snapshot({ results })), JSON.stringify(validate.errors)).toBe(true);
  });

  it('8.03: the valid, invalid and empty cases are all exercised (#8)', () => {
    expect(valid([])).toBe(true);
    expect(valid([row()])).toBe(true);
    expect(Object.values(INVALID).every((bad) => !valid([bad]))).toBe(true);
    expect(REQUIRED.every((key) => !valid([without(key)]))).toBe(true);
  });

  it('rejects malformed dates in the snapshot and in its distribution rows', () => {
    for (const bad of ['not-a-date', '2026-13-45', '11/01/2026', '2026-11-01T00:00:00Z']) {
      expect(validate(snapshot({ SnapshotDate: bad })), bad).toBe(false);
      expect(valid([row({ SnapshotDate: bad })]), bad).toBe(false);
    }
  });
});

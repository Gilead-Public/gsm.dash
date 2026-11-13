import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { init } from 'es-module-lexer';
import { writeExampleData } from '../scripts/generate-example-data.mjs';
import { assertNoImports, flatten, packagePage } from '../scripts/package-reports.mjs';
import { inject, PLACEHOLDER } from '../scripts/inject.mjs';
import { buildStudyDocument } from '../scripts/study-document.mjs';
import { buildPortfolioDocument } from '../scripts/portfolio-document.mjs';
import { readPortfolioDocument, readStudyDocument } from '../src/react/document.js';
import { pooled } from './qual/pooling.js';

let dir;
let data;

beforeAll(async () => {
  await init;
  dir = mkdtempSync(join(tmpdir(), 'gsm-dash-reports-'));
  writeExampleData(dir);
  const parsed = new Map();
  const read = (path) => {
    if (!parsed.has(path)) parsed.set(path, JSON.parse(readFileSync(join(dir, path), 'utf8')));
    return parsed.get(path);
  };
  data = { manifest: read('portfolio.json'), summary: read('summary.json'), read };
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const schema = (name) => JSON.parse(readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url), 'utf8'));
function schemaValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(schema('study-snapshot'));
  ajv.addSchema(schema('portfolio'));
  return ajv.compile(schema('study-document'));
}
function portfolioValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(schema('portfolio'));
  ajv.addSchema(schema('portfolio-summary'));
  return ajv.compile(schema('portfolio-document'));
}

describe('the study document', () => {
  it("15.01: each report's portfolio comparison equals pooling every study's files, at the newest visit each at its own latest snapshot and at an earlier visit each as of that date (#15)", () => {
    const { manifest, read } = data;
    let compared = 0;
    let newestSeesLaterSnapshots = false;
    for (const study of manifest.studies) {
      const doc = buildStudyDocument(data, study.StudyID);
      const keys = doc.comparison.map((r) => `${r.SnapshotDate} ${r.MetricID}`);
      expect(new Set(keys).size, `${study.StudyID}: one row per date and metric`).toBe(keys.length);
      const got = new Map(doc.comparison.map((r, i) => [keys[i], [r.Numerator, r.Denominator]]));
      const newest = [...study.snapshots].sort().at(-1);
      const want = new Map();
      for (const date of study.snapshots) {
        for (const { MetricID } of manifest.metrics) {
          const p = pooled(read, manifest.studies, MetricID, date === newest ? null : date);
          if (!p.studies) continue;
          want.set(`${date} ${MetricID}`, [p.numerator, p.denominator]);
          if (date === newest && pooled(read, manifest.studies, MetricID, date).denominator !== p.denominator) newestSeesLaterSnapshots = true;
        }
      }
      expect(got, study.StudyID).toEqual(want);
      compared += want.size;
    }
    expect(newestSeesLaterSnapshots, "some study's newest visit pools other studies' later snapshots").toBe(true);
    expect(compared).toBeGreaterThan(500);
  });

  it('13.02: each study report carries the manifest\'s report base, so its links resolve against the configured base (#13)', () => {
    const validate = schemaValidator();
    const { StudyID } = data.manifest.studies[0];
    expect(buildStudyDocument(data, StudyID)).not.toHaveProperty('reportBase');
    const doc = buildStudyDocument({ ...data, manifest: { ...data.manifest, reportBase: '../reports/' } }, StudyID);
    expect(doc.reportBase).toBe('../reports/');
    expect(validate(doc), JSON.stringify(validate.errors?.slice(0, 3))).toBe(true);
    expect(validate({ ...doc, reportBase: 3 })).toBe(false);
  });

  it("holds the catalog, the study's manifest entry and exactly its snapshot files, and passes its schema", () => {
    const validate = schemaValidator();
    for (const study of data.manifest.studies) {
      const doc = buildStudyDocument(data, study.StudyID);
      expect(validate(doc), JSON.stringify(validate.errors?.slice(0, 3))).toBe(true);
      expect(doc.metrics).toEqual(data.manifest.metrics);
      expect(doc.study).toEqual({ StudyID: study.StudyID, params: study.params, snapshots: study.snapshots });
      expect(doc.snapshots).toEqual(study.snapshots.map((d) => data.read(study.files[d])));
    }
  });

  it('the schema rejects stored rates, unknown fields and bad snapshot rows', () => {
    const validate = schemaValidator();
    const doc = buildStudyDocument(data, data.manifest.studies[0].StudyID);
    const rejected = {
      'an unknown top-level field': (d) => (d.note = 'x'),
      'a stored rate in the comparison': (d) => (d.comparison[0].Rate = 0.5),
      'a comparison numerator as text': (d) => (d.comparison[0].Numerator = '5'),
      'no comparison': (d) => delete d.comparison,
      'a manifest file list on the study': (d) => (d.study.files = {}),
      'a snapshot numerator as text': (d) => (d.snapshots[0].results[0].Numerator = '5'),
      'a metric without an ID': (d) => delete d.metrics[0].MetricID,
    };
    for (const [what, change] of Object.entries(rejected)) {
      const copy = structuredClone(doc);
      change(copy);
      expect(validate(copy), what).toBe(false);
    }
  });
});

describe('the portfolio document', () => {
  it("holds the catalog, each study's manifest entry without its file list, and the summary, and passes its schema", () => {
    const validate = portfolioValidator();
    const doc = buildPortfolioDocument(data);
    expect(validate(doc), JSON.stringify(validate.errors?.slice(0, 3))).toBe(true);
    expect(doc.metrics).toEqual(data.manifest.metrics);
    expect(doc.studies).toEqual(data.manifest.studies.map(({ StudyID, params, snapshots }) => ({ StudyID, params, snapshots })));
    expect(doc.summary).toEqual(data.summary);
    expect(doc).not.toHaveProperty('reportBase');
    expect(buildPortfolioDocument({ ...data, manifest: { ...data.manifest, reportBase: '../reports/' } }).reportBase).toBe('../reports/');
  });

  it("15.01: the portfolio document is built without reading any study's file, and is byte-identical when those files change (#15)", () => {
    let reads = 0;
    const counting = { ...data, read: (path) => (reads++, data.read(path)) };
    const before = JSON.stringify(buildPortfolioDocument(counting));
    const edited = {
      ...data,
      read: (path) => {
        reads++;
        const snap = structuredClone(data.read(path));
        for (const r of snap.results) r.Numerator += 1;
        return snap;
      },
    };
    expect(JSON.stringify(buildPortfolioDocument(edited))).toBe(before);
    expect(reads, 'study files read').toBe(0);
    const { Numerator } = data.read(data.manifest.studies[0].files[data.manifest.studies[0].snapshots[0]]).results[0];
    expect(edited.read(data.manifest.studies[0].files[data.manifest.studies[0].snapshots[0]]).results[0].Numerator, 'the edit changes the files').toBe(Numerator + 1);
  });

  it('the schema rejects stored rates, unknown fields, file lists and snapshot rows', () => {
    const validate = portfolioValidator();
    const doc = buildPortfolioDocument(data);
    const rejected = {
      'an unknown top-level field': (d) => (d.note = 'x'),
      'a stored rate in the summary': (d) => (d.summary.counts[0].Rate = 0.5),
      'a summary numerator as text': (d) => (d.summary.counts[0].Numerator = '5'),
      'no summary': (d) => delete d.summary,
      'no studies': (d) => (d.studies = []),
      'a manifest file list on a study': (d) => (d.studies[0].files = {}),
      'snapshot rows': (d) => (d.snapshots = []),
      'a metric without an ID': (d) => delete d.metrics[0].MetricID,
    };
    for (const [what, change] of Object.entries(rejected)) {
      const copy = structuredClone(doc);
      change(copy);
      expect(validate(copy), what).toBe(false);
    }
  });
});

describe('reading the injected portfolio document in the page', () => {
  const doc = () => structuredClone(buildPortfolioDocument(data));

  it('accepts a generated document', () => {
    expect(readPortfolioDocument(JSON.stringify(doc())).ok).toBe(true);
  });

  it('refuses text that is not JSON, and what the schema rejects, as the schema does', () => {
    for (const text of ['{"studies": ', PLACEHOLDER, '', null]) {
      expect(readPortfolioDocument(text)).toMatchObject({ ok: false, errors: [expect.stringMatching(/not JSON/)] });
    }
    const validate = portfolioValidator();
    for (const change of [(d) => (d.note = 'x'), (d) => (d.summary.counts[0].Rate = 0.5), (d) => (d.studies[0].files = {})]) {
      const d = doc();
      change(d);
      expect(validate(d)).toBe(false);
      const result = readPortfolioDocument(JSON.stringify(d));
      expect(result.ok).toBe(false);
      expect(!result.ok && result.errors.length).toBeGreaterThan(0);
    }
  });

  it('refuses a summary that describes other studies or snapshots than the document lists', () => {
    const extra = doc();
    extra.studies.push({ ...extra.studies[0], StudyID: 'ELSEWHERE' });
    expect(readPortfolioDocument(JSON.stringify(extra))).toMatchObject({ ok: false, errors: [expect.stringMatching(/^\/summary: .*ELSEWHERE/)] });
    const date = doc();
    date.summary.counts[0].SnapshotDate = '1999-01-01';
    expect(readPortfolioDocument(JSON.stringify(date))).toMatchObject({ ok: false, errors: [expect.stringMatching(/^\/summary: .*1999-01-01/)] });
    const dates = doc();
    dates.studies[0].snapshots = dates.studies[0].snapshots.slice(1);
    expect(readPortfolioDocument(JSON.stringify(dates))).toMatchObject({ ok: false, errors: [expect.stringMatching(/^\/summary: .*different snapshots/)] });
  });
});

describe('reading the injected document in the page', () => {
  const doc = () => structuredClone(buildStudyDocument(data, data.manifest.studies[0].StudyID));

  it('accepts a generated document', () => {
    const result = readStudyDocument(JSON.stringify(doc()));
    expect(result.ok).toBe(true);
  });

  it('refuses text that is not JSON, including a template nothing was injected into', () => {
    for (const text of ['{"study": ', PLACEHOLDER, '', null]) {
      const result = readStudyDocument(text);
      expect(result.ok, String(text)).toBe(false);
      expect(!result.ok && result.errors[0]).toMatch(/not JSON/);
    }
  });

  it('refuses what the schema rejects, as the schema does', () => {
    const validate = schemaValidator();
    for (const change of [(d) => (d.note = 'x'), (d) => (d.comparison[0].Rate = 0.5), (d) => (d.snapshots[0].results[0].Numerator = '5')]) {
      const d = doc();
      change(d);
      expect(validate(d)).toBe(false);
      const result = readStudyDocument(JSON.stringify(d));
      expect(result.ok).toBe(false);
      expect(!result.ok && result.errors.length).toBeGreaterThan(0);
    }
  });

  it("refuses another study's snapshot, a repeated comparison row, or snapshots that aren't the study's dates", () => {
    const other = doc();
    other.snapshots[0].StudyID = 'ELSEWHERE';
    expect(readStudyDocument(JSON.stringify(other))).toMatchObject({ ok: false, errors: [expect.stringMatching(/is for ELSEWHERE/)] });
    const repeated = doc();
    repeated.comparison.unshift({ ...repeated.comparison[0], Numerator: repeated.comparison[0].Numerator + 1e6 });
    expect(readStudyDocument(JSON.stringify(repeated))).toMatchObject({ ok: false, errors: [expect.stringMatching(/more than one row for/)] });
    const missing = doc();
    missing.snapshots.pop();
    expect(readStudyDocument(JSON.stringify(missing))).toMatchObject({ ok: false, errors: [expect.stringMatching(/not the study's snapshot dates/)] });
  });
});

describe('injecting a document into a template', () => {
  const template = `<html><body><script type="application/json" id="gsm-data">${PLACEHOLDER}</script><script type="module">run()</script></body></html>`;

  it('copies the JSON text as is apart from <, which cannot close the script', () => {
    const text = JSON.stringify({ label: '</script><script>alert(1)</script>', replacement: "$& $' $1", n: 1.5 }, null, 1);
    const html = inject(template, text);
    expect(html.match(/<\/script>/g)).toHaveLength(2);
    const block = /id="gsm-data">([\s\S]*?)<\/script>/.exec(html)[1];
    expect(block).toBe(text.replace(/</g, '\\u003c'));
    expect(JSON.parse(block)).toEqual(JSON.parse(text));
  });

  it('refuses text that is not JSON and a template without exactly one placeholder', () => {
    expect(() => inject(template, '{')).toThrow();
    expect(() => inject('<html></html>', '{}')).toThrow(/no __GSM_DATA__ placeholder/);
    expect(() => inject(`${template}${PLACEHOLDER}`, '{}')).toThrow(/more than one/);
  });
});

describe('packaging a built page', () => {
  const chunks = { './app.js': 'console.log("app");export{a as default};', './lazy.js': 'export const x=1;' };
  const read = (rel) => chunks[rel];
  const makeDist = (entry, head = '') => {
    const dist = mkdtempSync(join(tmpdir(), 'gsm-dash-package-'));
    mkdirSync(join(dist, '_astro'));
    writeFileSync(join(dist, '_astro', 'app.css'), 'body{color:red}');
    writeFileSync(join(dist, 'page.html'), `<head>${head}</head><body><script id="gsm-data" type="application/json">${PLACEHOLDER}</script><script type="module" src="/_astro/entry.js"></script></body>`);
    writeFileSync(join(dist, '_astro', 'entry.js'), entry);
    for (const [rel, body] of Object.entries(chunks)) writeFileSync(join(dist, '_astro', rel), body);
    return dist;
  };

  it('splices a side-effect facade into one module with nothing left to import', () => {
    const js = flatten('import"./app.js";', read);
    expect(js).toContain('console.log("app")');
    expect(() => assertNoImports(js, 'entry')).not.toThrow();
  });

  it('refuses code that still imports at runtime, statically or lazily', () => {
    expect(() => assertNoImports(flatten('import"./app.js";globalThis.later=()=>import("./lazy.js");', read), 'entry')).toThrow(/dynamic import\(\.\/lazy\.js\)/);
    expect(() => assertNoImports('import{x}from"./lazy.js";', 'entry')).toThrow(/import \.\/lazy\.js/);
    expect(() => assertNoImports('const u="./lazy.js";import(u);', 'entry')).toThrow(/non-literal/);
    expect(() => assertNoImports('console.log(import.meta.url);export{};', 'entry')).not.toThrow();
  });

  it('inlines the module script and stylesheets, leaving the placeholder', async () => {
    const { html, inlined } = await packagePage(makeDist('import"./app.js";', '<link rel="stylesheet" href="/_astro/app.css">'), 'page.html');
    expect(inlined).toEqual(['/_astro/entry.js', '/_astro/app.css']);
    expect(html).toContain('<script type="module">\n');
    expect(html).toContain('<style>\nbody{color:red}\n</style>');
    expect(html).not.toMatch(/src="|href="/);
    expect(html).toContain(PLACEHOLDER);
  });

  it('refuses a page whose code lazy-loads a chunk or that keeps a reference to another file', async () => {
    await expect(packagePage(makeDist('import"./app.js";globalThis.later=()=>import("./lazy.js");'), 'page.html')).rejects.toThrow(/lazy\.js/);
    await expect(packagePage(makeDist('import"./app.js";', '<link rel="modulepreload" href="./_astro/app.js">'), 'page.html')).rejects.toThrow(/survived inlining/);
    await expect(packagePage(makeDist('import"./app.js";', '<script src="./_astro/legacy.js"></script>'), 'page.html')).rejects.toThrow(/survived inlining/);
  });

  it('escapes </script inside inlined code', async () => {
    const { html } = await packagePage(makeDist('import"./app.js";const s="</script>";'), 'page.html');
    expect(html).toContain('<\\/script>');
  });
});

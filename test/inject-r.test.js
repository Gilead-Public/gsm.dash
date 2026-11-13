import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { writeExampleData } from '../scripts/generate-example-data.mjs';
import { REPORTS } from '../scripts/package-reports.mjs';
import { PLACEHOLDER } from '../scripts/inject.mjs';

// 27.03: the base R injector against the Node one. Each runs as its command, on files, and the two outputs are compared
// byte for byte. R runs with nothing on its PATH but R's own directory, so it cannot reach Node or Bun.

const R_SCRIPT = join(import.meta.dirname, '../scripts/inject.R');
const NODE_SCRIPT = join(import.meta.dirname, '../scripts/inject.mjs');
const TEMPLATE = '<!doctype html><html><head><meta charset="utf-8"><title>Zürich</title></head><body><div id="app"></div>'
  + `<script type="application/json" id="gsm-data">${PLACEHOLDER}</script><script>if (1 < 2) {}</script></body></html>\n`;

let dir;
let rscript;
let data;
let n = 0;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'gsm-dash-inject-r-'));
  const found = (process.env.PATH ?? '').split(delimiter).map((d) => join(d, 'Rscript')).find((p) => existsSync(p));
  if (!found) throw new Error('Rscript is not on the PATH; 27.03 needs R installed to compare the R injector');
  rscript = realpathSync(found);
  writeExampleData(join(dir, 'data'));
  const read = (path) => JSON.parse(readFileSync(join(dir, 'data', path), 'utf8'));
  data = { manifest: read('portfolio.json'), summary: read('summary.json'), read };
  mkdirSync(join(dir, 'rtmp'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/**
 * Runs both injectors on the same files.
 * @param {string | Buffer} template
 * @param {string | Buffer} text
 */
function injectBoth(template, text) {
  const at = join(dir, `case-${++n}`);
  mkdirSync(at);
  writeFileSync(join(at, 'template.html'), template);
  writeFileSync(join(at, 'document.json'), text);
  const args = [join(at, 'template.html'), join(at, 'document.json')];
  // R removes its session directory with `rm` on exit, which this PATH leaves out, so the directory is put where the
  // test cleans up.
  const r = spawnSync(rscript, [R_SCRIPT, ...args, join(at, 'r.html')], { env: { PATH: dirname(rscript), TMPDIR: join(dir, 'rtmp') }, encoding: 'utf8' });
  const node = spawnSync(process.execPath, [NODE_SCRIPT, ...args, join(at, 'node.html')], { encoding: 'utf8' });
  const out = (/** @type {string} */ name) => (existsSync(join(at, name)) ? readFileSync(join(at, name)) : null);
  return { r: { status: r.status, stderr: r.stderr, out: out('r.html') }, node: { status: node.status, stderr: node.stderr, out: out('node.html') } };
}

/**
 * Both injectors succeed with identical bytes, and the file is the template with the document in place of the
 * placeholder: the same JSON, with no `<` left to close the script element.
 * @param {string} template
 * @param {string} text
 */
function expectSameInjection(template, text) {
  const { r, node } = injectBoth(template, text);
  expect(r.status, r.stderr).toBe(0);
  expect(node.status, node.stderr).toBe(0);
  expect(r.out?.equals(/** @type {Buffer} */ (node.out)), 'R and Node outputs are byte-identical').toBe(true);
  const [before, after] = template.split(PLACEHOLDER).map((s) => Buffer.from(s));
  const file = /** @type {Buffer} */ (r.out);
  expect(file.subarray(0, before.length).equals(before)).toBe(true);
  expect(file.subarray(file.length - after.length).equals(after)).toBe(true);
  const injected = file.subarray(before.length, file.length - after.length);
  expect(injected.includes('<')).toBe(false);
  const lt = Buffer.from(text).filter((b) => b === 0x3c).length;
  expect(injected.length).toBe(Buffer.byteLength(text) + 5 * lt);
  expect(JSON.parse(injected.toString('utf8'))).toEqual(JSON.parse(text));
}

describe('the R injector', () => {
  it('27.03: writes the same bytes as the Node injector for every example report document (#27)', () => {
    const documents = REPORTS.flatMap(({ reports }) => reports(data));
    expect(documents.length).toBe(data.manifest.studies.length + 1);
    for (const [, doc] of documents) expectSameInjection(TEMPLATE, JSON.stringify(doc));
  }, 120_000);

  it('27.03: writes the same bytes as the Node injector for </script>, <!--, multibyte UTF-8, CRLF, either final newline and a placeholder at either end (#27)', () => {
    const cases = [
      '{"note":"</script><script>alert(1)</script><!-- x --><![CDATA[ ]]>"}',
      '{"name":"Zürich – 東京 – 😀","list":["ü<","<<"]}',
      '{\r\n  "a": "<b>",\r\n  "b": 1\r\n}\r\n',
      '{"a":1}',
      '{"a":1}\n',
      '{"a":"<"}\n\n',
    ];
    for (const text of cases) expectSameInjection(TEMPLATE, text);
    expectSameInjection(`${PLACEHOLDER}<p>after</p>\n`, '{"a":"<"}');
    expectSameInjection(`<p>before</p>${PLACEHOLDER}`, '{"a":"<"}');
    expectSameInjection(PLACEHOLDER, '{"a":"<"}');
  }, 60_000);

  it('27.03: both injectors refuse a template with no placeholder or more than one, and write nothing (#27)', () => {
    const templates = ['<p>no placeholder</p>', `${PLACEHOLDER}<p></p>${PLACEHOLDER}`, PLACEHOLDER.repeat(2), `${PLACEHOLDER}GSM_DATA__`];
    for (const template of templates) {
      const { r, node } = injectBoth(template, '{"a":1}');
      for (const run of [r, node]) {
        expect(run.status, template).not.toBe(0);
        expect(run.stderr).toMatch(/placeholder/);
        expect(run.out).toBeNull();
      }
    }
  }, 60_000);

  it('27.03: runs on base R alone, with neither Node nor Bun on its PATH (#27)', () => {
    for (const tool of ['node', 'bun']) expect(existsSync(join(dirname(rscript), tool)), `${tool} beside Rscript`).toBe(false);
    const code = readFileSync(R_SCRIPT, 'utf8')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');
    expect(code).not.toMatch(/\b(library|require|requireNamespace|loadNamespace|attachNamespace|source|system2?|shell|pipe|Sys\.which)\s*\(|::/);
    expectSameInjection(TEMPLATE, '{"a":"<"}');
  });
});

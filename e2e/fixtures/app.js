// @ts-check
import { test as base, expect } from '@playwright/test';
/** @typedef {import('@playwright/test').Page} Page */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseProject, requireRunDir } from '../projects.js';

const RUN_DIR = resolve(requireRunDir());
const RUN_ID = process.env.VALIDATION_RUN_ID ?? 'dev';
const COMMIT = process.env.VALIDATION_COMMIT ?? 'uncommitted';

/** @typedef {import('../projects.js').Artifact} Artifact */
/** @typedef {import('../../validation/lib/criteria.js').Mode} Mode */

/**
 * @param {import('@playwright/test').TestInfo} testInfo
 */
function projectOf(testInfo) {
  const project = parseProject(testInfo.project.name);
  if (!project) throw new Error(`unknown Playwright project "${testInfo.project.name}"`);
  return project;
}

/** The example data every build under test was made from. */
export const DATA_DIR = join(RUN_DIR, 'build/subpath/examples/data');
/** One report per study, each a single file. */
export const REPORTS_DIR = join(RUN_DIR, 'build/reports');
/**
 * @param {string} path
 */
export const readData = (path) => JSON.parse(readFileSync(join(DATA_DIR, path), 'utf8'));

/**
 * Test-only data changes, applied in place. The code under test is unchanged: in file mode the embedded JSON blocks
 * of the built file are rewritten into a copy; in sub-path mode the data requests are intercepted.
 */
/**
 * @typedef {object} DataOverrides
 * @property {(manifest: any) => void} [portfolio]
 * @property {(summary: any) => void} [summary]
 * @property {(snapshot: any) => void} [snapshot]
 */

/**
 * @typedef {object} App
 * @property {Artifact} artifact
 * @property {Mode} mode
 * @property {(route?: string, overrides?: DataOverrides) => Promise<void>} open Opens the build under test at a route such as `#/study/AA-AA-000-0000` and waits for the page to render.
 * @property {(studyId: string, overrides?: DataOverrides) => Promise<void>} openStudy Opens one study's page in the artifact under test.
 * @property {(studyId: string, overrides?: ReportOverrides) => Promise<string>} openReport Opens one study's report and waits for it to show its data or its error state. Returns the URL opened.
 */

/**
 * Test-only changes to a report's injected data, applied as for DataOverrides.
 * @typedef {object} ReportOverrides
 * @property {(doc: any) => void} [document] Changes the data document.
 * @property {string} [text] Replaces the injected text outright, for data that isn't a document at all.
 */

/**
 * The same data changes for a report's document: `portfolio` sees the catalog and the study's entry as a one-study
 * manifest, and `snapshot` sees each of the study's snapshots.
 * @param {DataOverrides} overrides
 * @returns {ReportOverrides}
 */
function asReportOverrides(overrides) {
  if (overrides.summary) throw new Error('a report carries no portfolio summary; summary overrides need the spa artifact');
  return {
    document(doc) {
      if (overrides.portfolio) {
        const manifest = { generated: doc.generated, metrics: doc.metrics, studies: [doc.study] };
        overrides.portfolio(manifest);
        doc.metrics = manifest.metrics;
        [doc.study] = manifest.studies;
      }
      if (overrides.snapshot) for (const snapshot of doc.snapshots) overrides.snapshot(snapshot);
    },
  };
}

const DATA_BLOCK = /(<script type="application\/json" id="gsm-data">)([\s\S]*?)(<\/script>)/;

/**
 * @param {string} html
 * @param {ReportOverrides} overrides
 * @returns {string}
 */
function rewriteReport(html, overrides) {
  if (!DATA_BLOCK.test(html)) throw new Error('the report has no #gsm-data block');
  return html.replace(DATA_BLOCK, (_, open, text, close) => {
    if (overrides.text !== undefined) return `${open}${overrides.text}${close}`;
    const doc = JSON.parse(text);
    overrides.document?.(doc);
    return `${open}${JSON.stringify(doc).replace(/</g, '\\u003c')}${close}`;
  });
}

const BLOCK = /<script type="application\/json" data-gsm="(portfolio|summary|snapshot)">([\s\S]*?)<\/script>/g;

/**
 * @param {string} html
 * @param {DataOverrides} overrides
 * @returns {string}
 */
function rewriteEmbedded(html, overrides) {
  return html.replace(BLOCK, (_, kind, text) => {
    const data = JSON.parse(text);
    if (kind === 'portfolio') overrides.portfolio?.(data);
    else if (kind === 'summary') overrides.summary?.(data);
    else overrides.snapshot?.(data);
    return `<script type="application/json" data-gsm="${kind}">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
  });
}

/**
 * @typedef {object} Evidence
 * @property {(page: Page, label: string) => Promise<string>} shot A stamped full-page screenshot, attached to the test as evidence. Returns its path.
 */

/**
 * @param {string} s
 */
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** @typedef {import('@playwright/test').PlaywrightTestArgs & import('@playwright/test').PlaywrightTestOptions} TestArgs */
/** @typedef {import('@playwright/test').PlaywrightWorkerArgs & import('@playwright/test').PlaywrightWorkerOptions} WorkerArgs */

export const test = base.extend(/** @type {import('@playwright/test').Fixtures<{ app: App, evidence: Evidence, pageErrors: string[], endState: void }, {}, TestArgs, WorkerArgs>} */ ({
  pageErrors: async ({ page }, use) => {
    /** @type {string[]} */
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await use(errors);
    expect(errors, 'uncaught errors in the page').toEqual([]);
  },

  app: async ({ page, context, pageErrors }, use, testInfo) => {
    void pageErrors;
    const { artifact, mode } = projectOf(testInfo);
    if (mode === 'file') await context.route(/^https?:/, (route) => route.abort());
    const base = mode === 'file'
      ? `file://${join(RUN_DIR, 'build/file/gsm-dash-standalone.html')}`
      : (testInfo.project.use.baseURL);
    await use({
      artifact,
      mode,
      async open(route = '', overrides) {
        let url = `${base}${route}`;
        if (overrides && mode === 'file') {
          const variant = testInfo.outputPath('variant.html');
          writeFileSync(variant, rewriteEmbedded(readFileSync(join(RUN_DIR, 'build/file/gsm-dash-standalone.html'), 'utf8'), overrides));
          url = `file://${variant}${route}`;
        } else if (overrides) {
          await page.route('**/examples/data/**', async (r) => {
            const response = await r.fetch();
            const json = await response.json();
            const url = r.request().url();
            if (url.endsWith('/portfolio.json')) overrides.portfolio?.(json);
            else if (url.endsWith('/summary.json')) overrides.summary?.(json);
            else overrides.snapshot?.(json);
            await r.fulfill({ response, json });
          });
        }
        await page.goto(url);
        await page.locator('#app > .layout, #app > gsm-study-page').first().waitFor();
      },
      async openStudy(studyId, overrides) {
        if (artifact === 'reports') {
          await this.openReport(studyId, overrides && asReportOverrides(overrides));
          await page.locator('#app .tile').first().waitFor();
          return;
        }
        await this.open(`#/study/${encodeURIComponent(studyId)}`, overrides);
        await page.locator('gsm-study-page .tile').first().waitFor();
      },
      async openReport(studyId, overrides) {
        if (artifact !== 'reports') throw new Error(`openReport needs the reports artifact, not ${artifact}`);
        const file = join(REPORTS_DIR, `${studyId}.html`);
        let url = mode === 'file' ? `file://${file}` : `${base}${encodeURIComponent(studyId)}.html`;
        if (overrides && mode === 'file') {
          const variant = testInfo.outputPath(`${studyId}.html`);
          writeFileSync(variant, rewriteReport(readFileSync(file, 'utf8'), overrides));
          url = `file://${variant}`;
        } else if (overrides) {
          await page.route(url, async (r) => {
            const response = await r.fetch();
            await r.fulfill({ response, body: rewriteReport(await response.text(), overrides) });
          });
        }
        await page.goto(url);
        await page.locator('#app > [data-study], #app > [role=alert]').waitFor();
        return url;
      },
    });
  },

  evidence: async ({}, use, testInfo) => {
    const { artifact, mode } = projectOf(testInfo);
    await use({
      async shot(page, label) {
        const id = /^(\d+\.\d{2}):/.exec(testInfo.title)?.[1] ?? 'untraced';
        const stamp = `${new Date().toISOString()} · run ${RUN_ID} · ${COMMIT.slice(0, 12)} · ${id} · ${artifact}/${mode}`;
        await page.evaluate((text) => {
          const d = document.createElement('div');
          d.id = '__evidence_banner';
          d.textContent = text;
          // In normal flow after the page content, so the stamp never covers what the screenshot evidences.
          Object.assign(d.style, { display: 'block', font: '12px ui-monospace, monospace', background: '#111', color: '#fff', padding: '4px 8px' });
          document.body.append(d);
        }, stamp);
        const path = testInfo.outputPath(`${id}--${slug(label)}.png`);
        await page.screenshot({ path, fullPage: true });
        await page.evaluate(() => document.getElementById('__evidence_banner')?.remove());
        await testInfo.attach('evidence', { path, contentType: 'image/png' });
        return path;
      },
    });
  },

  // Every traced browser test ends with a stamped screenshot of the page it verified. A passed test that cannot
  // produce one fails; a failed test's screenshot is best effort.
  endState: [async ({ page, evidence }, use, testInfo) => {
    await use();
    if (!/^\d+\.\d{2}:/.test(testInfo.title) || page.url() === 'about:blank') return;
    // A test that already attached its own evidence screenshot needs no second, near-identical one.
    if (testInfo.attachments.some((a) => a.name === 'evidence')) return;
    try {
      await evidence.shot(page, 'end state');
    } catch (e) {
      if (testInfo.status === 'passed') throw e;
    }
  }, { auto: true }],
}));

export { expect };

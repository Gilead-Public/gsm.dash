// @ts-check
import { test as base, expect } from '@playwright/test';
/** @typedef {import('@playwright/test').Page} Page */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const RUN_DIR = resolve(process.env.VALIDATION_RUN_DIR ?? 'validation-runs/dev');
const RUN_ID = process.env.VALIDATION_RUN_ID ?? 'dev';
const COMMIT = process.env.VALIDATION_COMMIT ?? 'uncommitted';

/** @typedef {'file' | 'subpath'} Mode */

/** The example data both builds under test were made from. */
export const DATA_DIR = join(RUN_DIR, 'build/subpath/examples/data');
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
 * @property {(snapshot: any) => void} [snapshot]
 */

/**
 * @typedef {object} App
 * @property {Mode} mode
 * @property {(route?: string, overrides?: DataOverrides) => Promise<void>} open Opens the build under test at a route such as `#/study/AA-AA-000-0000` and waits for the page to render.
 */

const BLOCK = /<script type="application\/json" data-gsm="(portfolio|snapshot)">([\s\S]*?)<\/script>/g;

/**
 * @param {string} html
 * @param {DataOverrides} overrides
 * @returns {string}
 */
function rewriteEmbedded(html, overrides) {
  return html.replace(BLOCK, (_, kind, text) => {
    const data = JSON.parse(text);
    if (kind === 'portfolio') overrides.portfolio?.(data);
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
    const mode = /** @type {Mode} */ (testInfo.project.name);
    if (mode === 'file') await context.route(/^https?:/, (route) => route.abort());
    const base = mode === 'file'
      ? `file://${join(RUN_DIR, 'build/file/gsm-dash-standalone.html')}`
      : (testInfo.project.use.baseURL);
    await use({
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
            if (r.request().url().endsWith('/portfolio.json')) overrides.portfolio?.(json);
            else overrides.snapshot?.(json);
            await r.fulfill({ response, json });
          });
        }
        await page.goto(url);
        await page.locator('#app > .layout, #app > gsm-study-page').first().waitFor();
      },
    });
  },

  evidence: async ({}, use, testInfo) => {
    const mode = testInfo.project.name;
    await use({
      async shot(page, label) {
        const id = /^(\d+\.\d{2}):/.exec(testInfo.title)?.[1] ?? 'untraced';
        const stamp = `${new Date().toISOString()} · run ${RUN_ID} · ${COMMIT.slice(0, 12)} · ${id} · ${mode}`;
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
    try {
      await evidence.shot(page, 'end state');
    } catch (e) {
      if (testInfo.status === 'passed') throw e;
    }
  }, { auto: true }],
}));

export { expect };

// @ts-check
// #22: the study filter and Reset. Reset returns the page and its address to a fresh load under the configured
// defaults (#16); the study filter is kept in the address like the other filters.
import { expect, readData, test } from './fixtures/app.js';
import { capturePortfolio } from './fixtures/baseline.js';
/** @typedef {import('@playwright/test').Page} Page */

test.describe.configure({ timeout: 90_000 });

/** @type {Array<{ StudyID: string, params: Record<string, string> }>} */
const studies = readData('portfolio.json').studies;
const study = 'STUDY004';
const hidden = 'Analysis_kri0005';
const CONFIG = { groupBy: 'phase', heatmap: 'rate', show: ['den', 'trend'], metrics: ['Analysis_kri0003', 'Analysis_kri0004'] };
/** Every setting the address holds, besides one `filter.<param>` per filter the Controls panel offers. */
const VIEW_KEYS = ['cell', 'dfold', 'dir', 'expand', 'group', 'heatmap', 'hide', 'open', 'show', 'sort', 'statuses', 'study', 'view'];

/** @param {Page} page */
const sidebar = (page) => page.locator('.sidebar');

/** @param {Page} page */
const hashKeys = (page) => [...new Set(new URLSearchParams(new URL(page.url()).hash.slice(1)).keys())].sort();

/**
 * Moves every setting the address holds away from both the built-in and the configured defaults, through the controls.
 * @param {Page} page
 */
async function changeEverySetting(page) {
  const box = sidebar(page);
  await box.locator('button[data-filter="therapeutic_area"][data-value="Cardiology"]').click();
  await box.locator('button[data-filter="phase"][data-value="P2"]').click();
  for (const status of ['Active', 'Enrolling']) await box.locator(`button[data-filter="status"][data-value="${status}"]`).click();
  await box.locator(`input[data-filter="study"][data-value="${study}"]`).check();
  await box.locator('button[data-status="Planned"]').click();
  await box.locator(`input[data-metric="${hidden}"]`).uncheck();
  await box.locator('select[data-groupby]').selectOption('therapeutic_area');
  await page.locator('button[data-view="distribution"]').click();
  await page.locator('[data-dfold="Disposition"]').click();
  await page.locator('button[data-view="overview"]').click();
  await page.locator('[data-fold="Data quality"]').first().click();
  await page.locator('tr[data-bucket="Cardiology"] td.grp').click();
  await page.locator('th[data-sort="Analysis_kri0008"]').click();
  await box.locator('button[data-seg="cellMode"][data-value="custom"]').click();
  await box.locator('button[data-show="den"]').click();
  await box.locator('button[data-show="num"]').click();
  await box.locator('select[data-heatmap]').selectOption('num');
  await box.locator('select[data-highlight]').selectOption(study);
}

/** @param {Page} page */
async function settled(page) {
  await page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());
  await page.mouse.move(0, 0);
}

for (const [configuration, config] of /** @type {const} */ ([['the default configuration', null], ['a non-default configuration', CONFIG]])) {
  for (const from of ['the table', 'the Distribution view']) {
    test(`22.02: after every setting the address holds is changed, Reset from ${from} leaves the address and the page equal to a fresh load, under ${configuration} (#22)`, async ({ app, page }) => {
      const overrides = config ? { document: (/** @type {any} */ doc) => void (doc.config = config) } : undefined;
      await app.openReport('portfolio', overrides);
      await page.locator('#app > .layout').waitFor();
      await settled(page);
      const freshUrl = page.url();
      const fresh = await capturePortfolio(page, 'fresh load');

      await changeEverySetting(page);
      if (from === 'the Distribution view') await page.locator('button[data-view="distribution"]').click();
      const filters = await sidebar(page).locator('[data-filter]').evaluateAll((els) => els.map((e) => `filter.${e.getAttribute('data-filter')}`));
      expect([...new Set(filters)].sort(), 'the filters the Controls panel offers').toEqual(['filter.phase', 'filter.status', 'filter.study', 'filter.therapeutic_area']);
      expect(hashKeys(page), 'every setting moved from its default').toEqual([...VIEW_KEYS, ...new Set(filters)].sort());

      await sidebar(page).locator('[data-reset]').click();
      await settled(page);
      expect(page.url(), 'the address').toBe(freshUrl);
      expect((await capturePortfolio(page, 'fresh load')).text, 'the page, with the Controls panel').toBe(fresh.text);
    });
  }
}

test('22.03: the study filter, with studies selected, and the Reset control, for visual comparison with this issue\'s Scope (#22)', async ({ app, page }) => {
  await app.open();
  for (const id of [study, 'STUDY008']) await sidebar(page).locator(`input[data-filter="study"][data-value="${id}"]`).check();
  const options = sidebar(page).locator('input[data-filter="study"]');
  await expect(options).toHaveCount(studies.length);
  await expect(sidebar(page).locator('[data-reset]')).toBeVisible();
  await settled(page);
});

test('22.04: a study-filter selection survives a reload and a study link with its back link, and Clear filters clears it with the other filters (#22)', async ({ app, page }) => {
  await app.open();
  const box = sidebar(page);
  for (const id of [study, 'STUDY008']) await box.locator(`input[data-filter="study"][data-value="${id}"]`).check();
  await box.locator('button[data-filter="phase"][data-value="P2"]').click();
  const kept = studies.filter((s) => [study, 'STUDY008'].includes(s.StudyID) && s.params.phase === 'P2').map((s) => s.StudyID);
  expect(kept, 'the selection and the phase filter keep the linked study').toContain(study);
  await expect(page.locator('.portfolio-table tr.study')).toHaveCount(kept.length);
  await settled(page);
  const left = page.url();
  expect(new URLSearchParams(new URL(left).hash.slice(1)).getAll('filter.study').sort()).toEqual([study, 'STUDY008'].sort());
  const before = await capturePortfolio(page, 'filtered');

  await page.reload();
  await page.locator('#app > .layout').waitFor();
  await settled(page);
  expect(page.url(), 'reload').toBe(left);
  expect((await capturePortfolio(page, 'filtered')).text, 'reload').toBe(before.text);

  await page.locator(`#app .portfolio-table a[data-study="${study}"]`).click();
  await page.locator(`#app > [data-study="${study}"] .tile`).first().waitFor();
  await page.locator('#app a.back').click();
  await page.locator('#app > .layout').waitFor();
  await settled(page);
  expect(page.url(), 'back link').toBe(left);
  expect((await capturePortfolio(page, 'filtered')).text, 'back link').toBe(before.text);

  await box.locator('[data-clear]').click();
  await expect(box.locator('input[data-filter="study"]:checked, button[data-filter].on')).toHaveCount(0);
  await expect(page.locator('.portfolio-table tr.study')).toHaveCount(studies.length);
  expect(hashKeys(page).filter((k) => k.startsWith('filter.')), 'no filter left in the address').toEqual([]);
});

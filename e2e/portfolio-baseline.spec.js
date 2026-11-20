// @ts-check
// 11.03 regression evidence: the portfolio as it rendered before #11's changes, recorded state by state in
// e2e/__snapshots__/portfolio-baseline.spec.js/, at 69b2240; re-recorded when the Distribution view was removed (#35),
// when View replaced the category folds and row density, and when the status line moved below the table (#24), each
// time with every tooltip, cell background, sparkline and table row unchanged. Each state is reached through the UI and
// recorded as its canonical DOM and computed styles (by hash), every sparkline's points, its accessibility tree (which
// leaves out hidden elements) and what CSS colours: every table cell's background, and any open tooltip. The canonical
// DOM lets the React page be compared with the same records.
import { readData, test } from './fixtures/app.js';
import { capturePortfolio as capture, expectRecorded } from './fixtures/baseline.js';
import { chooseView } from './fixtures/controls.js';
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').TestInfo} TestInfo */

test.describe.configure({ timeout: 60_000 });

const portfolio = readData('portfolio.json');
/** @type {Array<{ StudyID: string, params: Record<string, string> }>} */
const studies = portfolio.studies;

/**
 * Compares one state with its recorded baseline, and keeps going so every changed state is reported.
 * @param {Page} page
 * @param {TestInfo} testInfo
 * @param {string} name
 */
async function expectState(page, testInfo, name) {
  await expectRecorded(testInfo, `${name}.txt`, await capture(page, name));
}

/** @param {Page} page */
const sidebar = (page) => page.locator('.sidebar');

test.describe('the portfolio against its recorded baseline', () => {
  test('11.03: the table matches its baseline in Overview and Details, sorted both ways, with a heatmap and with each cell display (#11)', async ({ app, page }, testInfo) => {
    await app.open();
    await expectState(page, testInfo, 'table-overview');
    await chooseView(page, 'details');
    await expectState(page, testInfo, 'table-details');
    const column = await page.locator('th.sortable[data-sort^="Analysis_"]').first().getAttribute('data-sort');
    await page.locator(`th[data-sort="${column}"]`).click();
    await expectState(page, testInfo, 'table-sorted-once');
    await page.locator(`th[data-sort="${column}"]`).click();
    await expectState(page, testInfo, 'table-sorted-twice');
    await sidebar(page).locator('select[data-heatmap]').selectOption('rate');
    await expectState(page, testInfo, 'table-heatmap-rate');
    await sidebar(page).locator('button[data-seg="cellMode"][data-value="custom"]').click();
    for (const show of ['num', 'den', 'trend']) await sidebar(page).locator(`button[data-show="${show}"]`).click();
    await expectState(page, testInfo, 'table-custom-cells');
  });

  test('11.03: the table matches its baseline grouped with a group open, filtered, with a status and a metric hidden, and with a study highlighted (#11)', async ({ app, page }, testInfo) => {
    await app.open();
    await sidebar(page).locator('select[data-groupby]').selectOption('phase');
    await expectState(page, testInfo, 'rows-grouped');
    await page.locator('tr[data-bucket] td.grp').first().click();
    await expectState(page, testInfo, 'rows-group-open');
    await sidebar(page).locator('select[data-groupby]').selectOption('none');
    const area = studies[0].params.therapeutic_area;
    await sidebar(page).locator(`button[data-filter="therapeutic_area"][data-value="${area}"]`).click();
    await expectState(page, testInfo, 'rows-filtered');
    await sidebar(page).locator('button[data-status="New"]').click();
    await expectState(page, testInfo, 'rows-status-hidden');
    await sidebar(page).locator('input[type="checkbox"][data-metric]').first().uncheck();
    await expectState(page, testInfo, 'rows-metric-hidden');
    await sidebar(page).locator('select[data-highlight]').selectOption(studies[0].StudyID);
    await expectState(page, testInfo, 'rows-highlighted');
  });

  test('11.03: tooltips on the table match their baseline (#11)', async ({ app, page }, testInfo) => {
    await app.open();
    await page.locator('#app .otile').first().hover();
    await expectState(page, testInfo, 'tooltip-table-cell');
    await chooseView(page, 'details');
    await page.locator('#app thead th[data-sort^="Analysis_"]').first().hover();
    await expectState(page, testInfo, 'tooltip-table-header');
  });
});

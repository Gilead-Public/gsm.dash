// @ts-check
// 11.03 regression evidence: the portfolio as it rendered before #11's changes, recorded state by state in
// e2e/__snapshots__/portfolio-baseline.spec.js/, at 69b2240. Each state is reached through the UI and recorded as its
// canonical DOM and computed styles (by hash), every sparkline's points, its accessibility tree (which leaves out
// hidden elements) and what CSS places or colours: every Distribution mark's position along its track and whether it
// is visible, every table cell's background, and any open tooltip. The canonical DOM lets the React page be compared
// with the same records.
import { readData, test } from './fixtures/app.js';
import { capturePortfolio as capture, expectRecorded } from './fixtures/baseline.js';
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
  test('11.03: the table matches its baseline in Overview, Details and Mixed, sorted both ways, with a heatmap and with each cell display (#11)', async ({ app, page }, testInfo) => {
    await app.open();
    await expectState(page, testInfo, 'table-overview');
    await page.locator('button[data-view="details"]').click();
    await expectState(page, testInfo, 'table-details');
    await page.locator('[data-fold]').first().click();
    await expectState(page, testInfo, 'table-mixed');
    const column = await page.locator('th.sortable[data-sort^="Analysis_"]').first().getAttribute('data-sort');
    await page.locator(`th[data-sort="${column}"]`).click();
    await expectState(page, testInfo, 'table-sorted-once');
    await page.locator(`th[data-sort="${column}"]`).click();
    await expectState(page, testInfo, 'table-sorted-twice');
    await sidebar(page).locator('select[data-heatmap]').selectOption('rate');
    await expectState(page, testInfo, 'table-heatmap-rate');
    await sidebar(page).locator('button[data-seg="ramp"][data-value="teal"]').click();
    await expectState(page, testInfo, 'table-heatmap-teal');
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

  test('11.03: the Distribution view matches its baseline, with a category folded, a study highlighted and a filter on (#11)', async ({ app, page }, testInfo) => {
    await app.open();
    await page.locator('button[data-view="distribution"]').click();
    await expectState(page, testInfo, 'distribution');
    await page.locator('[data-dfold]').first().click();
    await expectState(page, testInfo, 'distribution-folded');
    await page.locator(`.track .pt[data-pick="${studies[1].StudyID}"]`).first().click();
    await expectState(page, testInfo, 'distribution-highlighted');
    const phase = studies[1].params.phase;
    await sidebar(page).locator(`button[data-filter="phase"][data-value="${phase}"]`).click();
    await expectState(page, testInfo, 'distribution-filtered');
  });

  test('11.03: tooltips on the table and the Distribution view match their baseline (#11)', async ({ app, page }, testInfo) => {
    await app.open();
    await page.locator('#app .otile').first().hover();
    await expectState(page, testInfo, 'tooltip-table-cell');
    await page.locator('button[data-view="details"]').click();
    await page.locator('#app thead .info').first().hover();
    await expectState(page, testInfo, 'tooltip-table-header');
    await page.locator('button[data-view="distribution"]').click();
    await page.locator('.track .pt').first().hover();
    await expectState(page, testInfo, 'tooltip-distribution-dot');
    await page.locator('.track .ptot').first().hover();
    await expectState(page, testInfo, 'tooltip-distribution-pooled');
  });
});

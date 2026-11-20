// @ts-check
// #27: the reports as one app. Each report links to the others by a relative URL, which works from a folder of files
// and under a sub-path, and the portfolio's view travels with those links to a study report and back.
import { expect, readData, test } from './fixtures/app.js';
import { capturePortfolio } from './fixtures/baseline.js';
import { chooseView, control } from './fixtures/controls.js';
/** @typedef {import('@playwright/test').Page} Page */

test.describe.configure({ timeout: 90_000 });

const portfolio = readData('portfolio.json');
/** @type {Array<{ StudyID: string, params: Record<string, string> }>} */
const studies = portfolio.studies;
/** @type {Array<{ MetricID: string, GroupLevel: string, Status?: string, Active?: boolean, Category: string }>} */
const catalog = portfolio.metrics;


const study = 'STUDY004';
const hidden = 'Analysis_kri0005';
/** The tiles a study report may show once Planned metrics and `hidden` are filtered out, from the catalog. */
const allowed = catalog
  .filter((m) => m.Active !== false && m.GroupLevel === 'Site' && (m.Status ?? 'Released') !== 'Planned' && m.MetricID !== hidden)
  .map((m) => m.MetricID)
  .sort();

/** @param {Page} page */
async function filterMetrics(page) {
  await control(page, 'button[data-status="Planned"]').click();
  await control(page, `input[data-metric="${hidden}"]`).uncheck();
}

/**
 * @param {Page} page
 * @param {string} studyId
 */
async function studyReport(page, studyId) {
  await page.locator(`#app > [data-study="${studyId}"] .tile`).first().waitFor();
}

/**
 * Follows a link from the portfolio to `study`'s report and that report's back link. The report shows exactly the
 * allowed tiles, and the portfolio comes back as it was left.
 * @param {Page} page
 * @param {import('@playwright/test').Locator} link
 * @param {string[]} [tiles] The tiles the report shows, when not `allowed`.
 */
async function roundTrip(page, link, tiles = allowed) {
  const left = new URL(page.url());
  const dir = left.href.slice(0, left.href.lastIndexOf('/') + 1);
  expect(await link.getAttribute('href')).toBe(`./${study}.html${left.hash}`);
  await page.mouse.move(0, 0);
  const before = await capturePortfolio(page, 'before leaving');

  await link.click();
  await studyReport(page, study);
  expect(page.url()).toBe(`${dir}${study}.html${left.hash}`);
  const shown = await page.locator('#app .tile[data-metric-id]').evaluateAll((els) => els.map((t) => t.getAttribute('data-metric-id')));
  expect(shown.sort()).toEqual(tiles);

  const back = page.locator('#app a.back');
  expect(await back.getAttribute('href')).toBe(`./portfolio.html${left.hash}`);
  await back.click();
  await page.locator('#app > .layout').waitFor();
  expect(page.url()).toBe(left.href);
  await page.mouse.move(0, 0);
  expect((await capturePortfolio(page, 'before leaving')).text).toBe(before.text);
}

test('27.02: every study link and back link is relative, and each opens its report from files and under the sub-path (#27)', async ({ app, page }) => {
  const url = await app.openReport('portfolio');
  await page.locator('#app > .layout').waitFor();
  const dir = url.slice(0, -'portfolio.html'.length);
  const links = await page.locator('#app a[data-study]').evaluateAll((els) => els.map((a) => [a.getAttribute('data-study'), a.getAttribute('href')]));
  expect(links.map(([id]) => id).sort()).toEqual(studies.map((s) => s.StudyID).sort());
  for (const [id, href] of links) expect(href).toBe(`./${encodeURIComponent(String(id))}.html`);

  for (const { StudyID } of studies) {
    await page.locator(`#app a[data-study="${StudyID}"]`).click();
    await studyReport(page, StudyID);
    expect(page.url()).toBe(`${dir}${encodeURIComponent(StudyID)}.html`);
    const back = page.locator('#app a.back');
    expect(await back.getAttribute('href')).toBe('./portfolio.html');
    await back.click();
    await page.locator('#app > .layout').waitFor();
    expect(page.url()).toBe(`${dir}portfolio.html`);
  }
});

test('27.05: the table view carries over to a study report, which applies its metric filters, and back (#27)', async ({ app, page }) => {
  await app.openReport('portfolio');
  await page.locator('#app > .layout').waitFor();

  // Every setting 27.05 lists, through the controls a user would use.
  await control(page, 'button[data-filter="phase"][data-value="P2"]').click();
  for (const status of ['Active', 'Enrolling']) await control(page, `button[data-filter="status"][data-value="${status}"]`).click();
  await filterMetrics(page);
  await control(page, 'select[data-groupby]').selectOption('therapeutic_area');
  await chooseView(page, 'details');
  await page.locator('tr[data-bucket="Cardiology"] td.grp').click();
  await page.locator('th[data-sort="Analysis_kri0008"]').click();
  await control(page, 'button[data-seg="cellMode"][data-value="custom"]').click();
  await control(page, 'button[data-show="den"]').click();
  await control(page, 'button[data-show="num"]').click();
  await control(page, 'select[data-heatmap]').selectOption('rate');
  await control(page, 'button[data-group="Data quality"]').click();

  const keys = [...new Set(new URLSearchParams(new URL(page.url()).hash.slice(1)).keys())].sort();
  expect(keys, 'every setting moved from its default').toEqual(
    ['cell', 'dir', 'expand', 'filter.phase', 'filter.status', 'group', 'heatmap', 'hide', 'hidebygroup', 'hidegroup', 'show', 'sort', 'statuses', 'view'].sort(),
  );
  // The study report also leaves out the hidden group's metrics (16.03).
  const dataQuality = catalog.filter((/** @type {any} */ m) => m.Category === 'Data quality').map((/** @type {any} */ m) => m.MetricID);
  expect(dataQuality.length).toBeGreaterThan(0);
  await roundTrip(page, page.locator(`#app .portfolio-table a[data-study="${study}"]`), allowed.filter((id) => !dataQuality.includes(id)));
});

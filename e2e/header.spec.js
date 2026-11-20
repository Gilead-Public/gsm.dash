// @ts-check
// #24: the reports' headers, and the portfolio's status line below its table.
import { expect, readData, test } from './fixtures/app.js';
import { visibleLines } from './fixtures/visible.js';
import { shownMetrics } from '../test/qual/pooling.js';
/** @typedef {import('@playwright/test').Page} Page */

const portfolio = readData('portfolio.json');
/** @type {Array<{ StudyID: string, params: Record<string, string> }>} */
const studies = portfolio.studies;
const metrics = shownMetrics(portfolio.metrics);

/** @param {Page} page */
const sidebar = (page) => page.locator('.sidebar');

/**
 * The status line's text as a user sees it, and whether it sits below the table.
 * @param {Page} page
 */
async function statusLine(page) {
  const line = page.locator('.portfolio-table .showing');
  await expect(line).toHaveCount(1);
  const [lineBox, tableBox] = await Promise.all([line.boundingBox(), page.locator('.portfolio-table .tblwrap').boundingBox()]);
  return {
    text: (await visibleLines(line)).join(' '),
    below: Boolean(lineBox && tableBox && lineBox.y >= tableBox.y + tableBox.height),
  };
}

test('the status line sits below the table and reads the studies and metrics shown, then the highlighted study and the sort where set', async ({ app, page }) => {
  await app.open();
  expect(await statusLine(page)).toEqual({ text: `${studies.length} / ${studies.length} studies · ${metrics.length} / ${metrics.length} metrics`, below: true });

  const phase = studies[0].params.phase;
  const kept = studies.filter((s) => s.params.phase === phase);
  const target = kept[0];
  await sidebar(page).locator(`button[data-filter="phase"][data-value="${phase}"]`).click();
  await sidebar(page).locator(`input[data-metric="${metrics[0].MetricID}"]`).uncheck();
  await sidebar(page).locator('select[data-highlight]').selectOption(target.StudyID);
  const sortBy = metrics[1];
  await page.locator('.sidebar button[data-seg="view"][data-value="details"]').click();
  await page.locator(`th[data-sort="${sortBy.MetricID}"]`).click();
  const { text, below } = await statusLine(page);
  expect(below).toBe(true);
  expect(text).toMatch(
    new RegExp(
      `^${kept.length} / ${studies.length} studies · ${metrics.length - 1} / ${metrics.length} metrics · highlighting ${target.StudyID} ${target.params.nickname} · sorted by ${sortBy.Abbreviation} \\S+ [↑↓]$`,
    ),
  );
});

test('the status line names every active sort and its direction, marking a sort whose column is hidden', async ({ app, page }) => {
  await app.open();
  await page.locator('.sidebar button[data-seg="view"][data-value="details"]').click();
  const box = sidebar(page);
  const [shown, other] = metrics;
  /** The sort the status line names, or null. */
  const named = async () => (await statusLine(page)).text.split(' · sorted by ')[1] ?? null;
  /**
   * The arrow the sorted column's header shows, from its aria-sort.
   * @param {string} key
   */
  const arrow = async (key) => ((await page.locator(`th[data-sort="${key}"]`).getAttribute('aria-sort')) === 'ascending' ? '↑' : '↓');
  /**
   * Clicks a column's header and checks the status line against the header's own direction.
   * @param {string} key
   * @param {string} label
   */
  const sortBy = async (key, label) => {
    await page.locator(`th[data-sort="${key}"]`).click();
    const dir = await arrow(key);
    expect(await named(), key).toBe(`${label} ${dir}`);
    return dir;
  };

  expect(await named(), 'unsorted').toBeNull();
  await sortBy('label', 'Study');
  await sortBy('label', 'Study');
  await sortBy('pop:screened', 'Screened');
  await box.locator('button[data-column="enroll"]').click();
  let dir = await sortBy('enroll', 'Enrolled');
  await box.locator('button[data-column="enroll"]').click();
  expect(await named(), 'Enrolled hidden').toBe(`Enrolled (hidden) ${dir}`);

  await sortBy(shown.MetricID, `${shown.Abbreviation} rate`);
  await box.locator('select[data-heatmap]').selectOption('num');
  dir = await arrow(shown.MetricID);
  expect(await named(), 'heatmap Numerator').toBe(`${shown.Abbreviation} numerator ${dir}`);
  await box.locator(`input[data-metric="${shown.MetricID}"]`).uncheck();
  expect(await named(), 'metric hidden').toBe(`${shown.Abbreviation} numerator (hidden) ${dir}`);
  await sortBy(other.MetricID, `${other.Abbreviation} numerator`);

  await box.locator('select[data-groupby]').selectOption('phase');
  await sortBy('label', 'Group');
  dir = await sortBy('meta', 'Studies');
  await box.locator('select[data-groupby]').selectOption('none');
  expect(await named(), 'ungrouped').toBe(`Studies (hidden) ${dir}`);
});

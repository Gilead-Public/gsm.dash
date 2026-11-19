// @ts-check
import { expect, readData, test } from './fixtures/app.js';
import { countText, displayed, latestSnapshot, pooled, readRate, shownMetrics, tolerance } from '../test/qual/pooling.js';
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('../test/qual/pooling.js').StudyEntry} StudyEntry */
/** @typedef {import('../test/qual/pooling.js').MetricMeta} MetricMeta */

const portfolio = readData('portfolio.json');
/** @type {StudyEntry[]} */
const studies = portfolio.studies;
// A percentage metric whose tile opens on Details.
const metric = /** @type {MetricMeta} */ (shownMetrics(portfolio.metrics).find((m) => m.Display !== 'per_28d' && !m.Widget));
const [changed] = studies;
const changedDate = latestSnapshot(changed);
const before = pooled(readData, studies, metric.MetricID);
const own = pooled(readData, [changed], metric.MetricID);
const delta = Math.round(own.denominator / 4);

/**
 * The portfolio total row's value for the metric, read under its visible heading, and its hover tooltip's pooled
 * numerator and denominator.
 * @param {Page} page
 * @param {string} row
 */
async function shownValue(page, row) {
  const table = page.locator('.portfolio-table table.po');
  const headings = await table.locator('thead th.bandh .tlab').allTextContents();
  const index = headings.map((h) => h.trim()).indexOf(/** @type {string} */ (metric.Abbreviation));
  expect(index, `a visible ${metric.Abbreviation} heading`).toBeGreaterThanOrEqual(0);
  await expect(table.locator('thead th.bandh .tlab').nth(index)).toBeVisible();
  const value = table.locator(`tbody tr${row}`).locator('.otile').nth(index);
  const text = /** @type {string} */ (await value.textContent());
  await value.hover();
  const tooltip = page.locator('#gsm-tooltip');
  await expect(tooltip.locator('b').first()).toHaveText(new RegExp(` · ${metric.Abbreviation}$`));
  const nd = /([\d,]+) \/ ([\d,]+) \(([^)]*)\)/.exec(await tooltip.innerText());
  expect(nd?.[3], 'the denominator named by its catalog label').toBe(metric.Denominator);
  return { rate: readRate(metric, text), nd: nd?.slice(1, 3) };
}

/**
 * @param {number | null} shown
 * @param {number | null} rate
 */
const near = (shown, rate) => shown !== null && rate !== null && Math.abs(shown - displayed(metric, rate)) <= tolerance(metric);

test.describe('the portfolio reads the counts-only summary', () => {
  test.beforeAll(() => {
    expect(before.rate).not.toBeNull();
    expect(delta).toBeGreaterThan(0);
    const after = (before.numerator + delta) / before.denominator;
    expect(Math.abs(displayed(metric, after) - displayed(metric, /** @type {number} */ (before.rate))), 'the change is visible at display precision').toBeGreaterThan(10 * tolerance(metric));
  });

  test('15.01: a count changed in the summary changes the portfolio total and the study\'s row (#15)', async ({ app, page }) => {
    const overrides = {
      /** @param {any} summary */
      summary: (summary) => {
        const row = summary.counts.find((/** @type {any} */ r) => r.StudyID === changed.StudyID && r.SnapshotDate === changedDate && r.MetricID === metric.MetricID);
        row.Numerator += delta;
      },
    };
    const total = (before.numerator + delta) / before.denominator;
    await app.open('', overrides);
    const shownTotal = await shownValue(page, '.total');
    expect(near(shownTotal.rate, total), `total ${shownTotal.rate}`).toBe(true);
    expect(shownTotal.nd).toEqual([countText(before.numerator + delta), countText(before.denominator)]);
    const shownStudy = await shownValue(page, `[data-hl="${changed.StudyID}"]`);
    expect(near(shownStudy.rate, (own.numerator + delta) / own.denominator), `${changed.StudyID} ${shownStudy.rate}`).toBe(true);
  });

  test('15.01: site rows changed in a study\'s file change that study\'s own value but no portfolio number (#15)', async ({ app, page }) => {
    /** @param {any} snapshot */
    const edit = (snapshot) => {
      let n = 0;
      if (snapshot.StudyID !== changed.StudyID || snapshot.SnapshotDate !== changedDate) return n;
      for (const r of snapshot.results) {
        if (r.MetricID !== metric.MetricID || r.GroupLevel !== 'Site') continue;
        r.Numerator += Math.round(r.Denominator / 4);
        n++;
      }
      return n;
    };
    let edited = 0;
    const overrides = { snapshot: (/** @type {any} */ snapshot) => void (edited += edit(snapshot)) };
    const editedOwn = pooled(
      (path) => {
        const data = structuredClone(readData(path));
        if (path === changed.files[changedDate]) edit(data);
        return data;
      },
      [changed],
      metric.MetricID,
    );
    expect(editedOwn.numerator).toBeGreaterThan(own.numerator);

    // The portfolio report holds no study file and asks for none, so no edit to one can reach it; the edit is made to
    // the study's own report below.
    /** @type {string[]} */
    const requests = [];
    page.on('request', (r) => requests.push(r.url()));
    await app.open('');
    const doc = JSON.parse((await page.locator('#gsm-data').textContent()) ?? '');
    expect(Object.keys(doc).sort(), 'the portfolio report holds the catalog, the studies and the summary').toEqual(['generated', 'metrics', 'schemaVersion', 'studies', 'summary']);
    expect(JSON.stringify(doc), 'no study file rows or file lists').not.toMatch(/"(results|files)":/);
    expect(requests.map((u) => u.replace(/#.*$/, '')), 'requests besides the report itself').toEqual([expect.stringMatching(/\/portfolio\.html$/)]);
    const shownTotal = await shownValue(page, '.total');
    expect(near(shownTotal.rate, before.rate), `total ${shownTotal.rate}`).toBe(true);
    expect(shownTotal.nd).toEqual([countText(before.numerator), countText(before.denominator)]);
    const shownStudy = await shownValue(page, `[data-hl="${changed.StudyID}"]`);
    expect(near(shownStudy.rate, own.rate), `${changed.StudyID} ${shownStudy.rate}`).toBe(true);

    await app.openStudy(changed.StudyID, overrides);
    expect(edited, "the study's file was edited before its report read it").toBeGreaterThan(0);
    const big = (await page.locator(`.tile[data-metric-id="${metric.MetricID}"] .big`).textContent())?.trim() ?? '';
    const pct = /\((\d+\.\d)%\)$/.exec(big);
    expect(pct, `the tile's value "${big}"`).toBeTruthy();
    expect(near(Number(pct?.[1]), editedOwn.rate), "the study's tile uses its edited file").toBe(true);
  });
});

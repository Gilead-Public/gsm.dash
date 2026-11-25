// @ts-check
// #44: the portfolio's planned metrics carry no hatching, and its text is readable.
import { expect, readData, test } from './fixtures/app.js';
import { chooseAdmin, chooseHeatmap, chooseView, closeControls, control } from './fixtures/controls.js';
import { shownMetrics } from '../test/qual/pooling.js';
/** @typedef {import('@playwright/test').Page} Page */

test.describe.configure({ timeout: 120_000 });

const portfolio = readData('portfolio.json');
const shown = new Set(shownMetrics(portfolio.metrics).map((m) => m.MetricID));
/** @type {Array<Record<string, any>>} */
const planned = portfolio.metrics.filter((/** @type {Record<string, any>} */ m) => shown.has(m.MetricID) && m.Status === 'Planned');
const TABLE = '.portfolio-table';

/** One study's values for one metric removed from the summary, so its cell and tile show a missing value. */
const missing = { study: portfolio.studies[0].StudyID, metric: [...shown][0] };
const withMissingValue = {
  /** @param {any} summary */
  summary: (summary) => {
    summary.counts = summary.counts.filter((/** @type {any} */ r) => !(r.StudyID === missing.study && r.MetricID === missing.metric));
  },
};

/** Elements in the table drawn with a background pattern or a dashed outline. @param {Page} page */
const decorated = (page) =>
  page.locator(TABLE).evaluate((root) =>
    [...root.querySelectorAll('*')]
      .filter((el) => {
        const style = getComputedStyle(el);
        return style.backgroundImage !== 'none' || style.outlineStyle === 'dashed';
      })
      .map((el) => `${el.tagName.toLowerCase()} ${el.textContent?.trim().slice(0, 20)}`),
  );

/** Visible text rendered under 12px, except symbol-only icons marked decorative (`aria-hidden`). @param {Page} page */
const smallText = (page) =>
  page.evaluate(() => {
    const small = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? '';
      const el = node.parentElement;
      if (!text.trim() || !el || !el.getClientRects().length) continue;
      if (!/[\p{L}\p{N}]/u.test(text) && el.closest('[aria-hidden="true"]')) continue;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || parseFloat(style.fontSize) >= 12) continue;
      small.push(`${el.tagName.toLowerCase()}.${el.className} "${text.trim().slice(0, 30)}" ${style.fontSize}`);
    }
    return small;
  });

/** The distinct font sizes of the table's study and total rows' cells. @param {Page} page */
const rowSizes = (page) =>
  page
    .locator(`${TABLE} tr.study td, ${TABLE} tr.total td`)
    .evaluateAll((cells) => [...new Set(cells.map((td) => getComputedStyle(td).fontSize))]);

test('44.01: no metric, planned ones included, shows a hatch pattern or a dashed outline in the table\'s headers, cells or Compact tiles (#44)', async ({ app, page }) => {
  expect(planned.length, 'planned metrics in the example data').toBeGreaterThan(0);
  await app.open();
  expect(await decorated(page), 'patterned or dashed elements in Compact').toEqual([]);
  for (const view of /** @type {const} */ (['detailed', 'custom'])) {
    await chooseView(page, view);
    await closeControls(page);
    expect(await decorated(page), `patterned or dashed elements in ${view}`).toEqual([]);
  }
});

test('44.02: the portfolio\'s text renders at 12px or more in every view, popover and hover, and its study and total rows at 14px (#44)', async ({ app, page }) => {
  await app.open('', withMissingValue);
  await expect(page.locator(`${TABLE} tr[data-hl="${missing.study}"]`), 'a missing value to check').toContainText('—');
  expect(await smallText(page), 'Overview').toEqual([]);
  expect(await rowSizes(page), 'Overview rows').toEqual(['14px']);

  await page.locator('button[data-open="filters"]').click();
  await page.locator('button[data-open="filter:study"]').click();
  expect(await smallText(page), 'Filters, with the Study choices open').toEqual([]);
  await closeControls(page);

  await page.locator('button[data-open="config"]').click();
  expect(await smallText(page), 'Config').toEqual([]);
  await closeControls(page);

  await page.locator('button[data-open="admin"]').click();
  expect(await smallText(page), 'the Admin panel').toEqual([]);
  await closeControls(page);

  await page.locator(`${TABLE} tr.study .otile`).first().hover();
  await expect(page.locator('#gsm-tooltip')).toBeVisible();
  expect(await smallText(page), 'a tile hover').toEqual([]);
  await closeControls(page);

  await chooseView(page, 'detailed');
  expect(await smallText(page), 'Details').toEqual([]);
  expect(await rowSizes(page), 'Details rows').toEqual(['14px']);

  await control(page, 'select[data-groupby]').selectOption('phase');
  await expect(page.locator(`${TABLE} tr.study`).first()).toBeVisible();
  expect(await smallText(page), 'Details, grouped with the groups open').toEqual([]);
  expect(await rowSizes(page), 'study rows in an open group').toEqual(['14px']);

  // Custom's own controls, Config as a side panel, and the heatmap legend (#46, #47).
  await chooseHeatmap(page, 'rate');
  await chooseAdmin(page, 'legend', 'on');
  await chooseAdmin(page, 'cfgpanel', 'side');
  await expect(page.locator('[data-legend]')).toBeVisible();
  expect(await smallText(page), 'Custom with a heatmap and its legend').toEqual([]);
  await page.locator('button[data-open="config"]').click();
  await expect(page.locator('.config-pop.drawer')).toBeVisible();
  expect(await smallText(page), 'Config as a side panel, under Custom').toEqual([]);
  await closeControls(page);
});

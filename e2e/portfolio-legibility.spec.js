// @ts-check
// #44: the portfolio's planned metrics carry no hatching, and its text is readable.
import { expect, readData, test } from './fixtures/app.js';
import { chooseView, closeControls, control } from './fixtures/controls.js';
import { card } from './fixtures/tiles.js';
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

/** The total row's cell under a metric's column header, by position. @param {Page} page @param {string} metricId */
async function totalCellUnder(page, metricId) {
  const head = await page.locator(`${TABLE} th[data-sort="${metricId}"]`).boundingBox();
  if (!head) throw new Error(`no header for ${metricId}`);
  const x = head.x + head.width / 2;
  const index = await page
    .locator(`${TABLE} tr.total td`)
    .evaluateAll((cells, at) => cells.findIndex((td) => { const r = td.getBoundingClientRect(); return r.left <= at && at <= r.right; }), x);
  return page.locator(`${TABLE} tr.total td`).nth(index);
}

/** The total row's Overview tile for a metric, found by the tile labels above it. @param {Page} page @param {string} abbr */
async function totalTile(page, abbr) {
  const bands = page.locator(`${TABLE} thead tr.band th.closed`);
  for (let j = 0; j < (await bands.count()); j++) {
    const at = (await bands.nth(j).locator('.tlab').allTextContents()).indexOf(abbr);
    if (at >= 0) return page.locator(`${TABLE} tr.total td.cat`).nth(j).locator('.otile').nth(at);
  }
  throw new Error(`no Overview tile labelled ${abbr}`);
}

test('44.01: planned metrics show no hatching or dashed outline, keep their Planned tag, and their hovers say "Planned metric: not yet released" (#44)', async ({ app, page }) => {
  expect(planned.length, 'planned metrics in the example data').toBeGreaterThan(0);
  await app.open();
  const tooltip = page.locator('#gsm-tooltip');

  expect(await decorated(page), 'patterned or dashed elements in Overview').toEqual([]);
  for (const m of planned) {
    await (await totalTile(page, m.Abbreviation)).hover();
    await expect(tooltip, `${m.Abbreviation}'s tile hover`).toContainText('Planned metric: not yet released');
    await expect(tooltip).not.toContainText('simulated');
  }

  await closeControls(page);
  await chooseView(page, 'details');
  expect(await decorated(page), 'patterned or dashed elements in Details').toEqual([]);
  for (const m of planned) {
    await expect(page.locator(`${TABLE} th[data-sort="${m.MetricID}"]`), `${m.Abbreviation}'s header`).toContainText('Planned');
    await (await totalCellUnder(page, m.MetricID)).hover();
    await expect(tooltip, `${m.Abbreviation}'s cell hover`).toContainText('Planned metric: not yet released');
    await expect(tooltip).not.toContainText('simulated');
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

  await page.locator(`${TABLE} tr.study .otile`).first().hover();
  await expect(page.locator('#gsm-tooltip')).toBeVisible();
  expect(await smallText(page), 'a tile hover').toEqual([]);
  await closeControls(page);

  await chooseView(page, 'details');
  expect(await smallText(page), 'Details').toEqual([]);
  expect(await rowSizes(page), 'Details rows').toEqual(['14px']);

  await control(page, 'select[data-groupby]').selectOption('phase');
  await page.locator('tr[data-bucket] td.grp').first().click();
  await expect(page.locator(`${TABLE} tr.study`).first()).toBeVisible();
  expect(await smallText(page), 'Details, grouped with a group open').toEqual([]);
  expect(await rowSizes(page), 'study rows in an open group').toEqual(['14px']);
});

test('the study page\'s hovers keep their tag styling: the larger portfolio text stops at the portfolio', async ({ app, page }) => {
  const metric = portfolio.metrics.find((/** @type {Record<string, any>} */ m) => m.MetricID === 'Analysis_kri0014');
  expect(metric?.Status, 'the eligibility card\'s metric').toBe('Planned');
  await app.openStudy(portfolio.studies[0].StudyID);
  await card(page, 'eligibility-status').locator('.tile-head .name').hover();
  const tag = page.locator('#gsm-tooltip .pill');
  await expect(tag).toBeVisible();
  expect(await tag.evaluate((el) => { const s = getComputedStyle(el); return [s.fontSize, s.fontWeight, s.textTransform]; })).toEqual(['9px', '700', 'uppercase']);
});

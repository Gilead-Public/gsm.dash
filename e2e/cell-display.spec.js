// @ts-check
// #47: the portfolio's Config, with Group rows by first, one Cell display of three presets holding every display
// change, and the columns beside the metrics; grouped rows open by default.
import { expect, readData, test } from './fixtures/app.js';
import { chooseAdmin, chooseHeatmap, chooseView, closeControls, control } from './fixtures/controls.js';
/** @typedef {import('@playwright/test').Page} Page */

const portfolio = readData('portfolio.json');
/** @type {Array<{ StudyID: string, params: Record<string, string> }>} */
const studies = portfolio.studies;
/** @type {Array<{ MetricID: string, GroupLevel: string, Active?: boolean, Abbreviation: string }>} */
const catalog = portfolio.metrics;
const shown = catalog.filter((m) => m.Active !== false && m.GroupLevel === 'Site');
const phases = [...new Set(studies.map((s) => s.params.phase))].sort();
const TABLE = '.portfolio-table table.po';

/** @param {Page} page */
const address = (page) => new URL(page.url()).hash;

/**
 * Config's two columns as their labels read, and whether the left one sits left of the right.
 * @param {Page} page
 */
async function configColumns(page) {
  await page.locator('#header-controls [data-open="config"]').click();
  const pop = page.locator('#header-controls [data-pop="config"]');
  const left = await pop.locator('[data-sec="config"] > .ctl > label').allTextContents();
  const right = await pop.locator('[data-sec="metrics"] > .ctl > label').allTextContents();
  const [l, r] = await Promise.all(['[data-sec="config"]', '[data-sec="metrics"]'].map((s) => pop.locator(s).boundingBox()));
  await closeControls(page);
  return { left, right, sideBySide: /** @type {any} */ (l).x + /** @type {any} */ (l).width <= /** @type {any} */ (r).x + 0.5 };
}

/**
 * What the table shows: folded tiles, open cells, shaded cells, trend lines, and cells stacking counts.
 * @param {Page} page
 */
const tableShows = (page) =>
  page.locator(TABLE).evaluate((table) => ({
    tiles: table.querySelectorAll('tbody .otile').length,
    cells: table.querySelectorAll('tbody td .cell').length,
    shaded: table.querySelectorAll('[class*="hot"]').length,
    trends: table.querySelectorAll('tbody svg').length,
    stacked: table.querySelectorAll('tbody .cell-nums').length,
  }));

/** @param {Page} page */
const pressed = (page) => control(page, 'button[data-display][aria-pressed="true"]').locator.evaluateAll((els) => els.map((e) => e.getAttribute('data-display')));

test('47.01: Config\'s left column holds Group rows by, Cell display and Groups, with Show in each cell and Heatmap only under Custom; its right column holds Column grouping, then Metrics (#47)', async ({ app, page }) => {
  await app.open();
  for (const view of /** @type {const} */ (['compact', 'detailed', 'custom'])) {
    await chooseView(page, view);
    const seen = await configColumns(page);
    const custom = view === 'custom' ? ['Show in each cell', 'Heatmap (also drives column sort)'] : [];
    expect(seen, view).toEqual({ left: ['Group rows by', 'Cell display', ...custom, 'Groups'], right: ['Column grouping', 'Metrics'], sideBySide: true });
  }
  await page.locator('#header-controls [data-open="config"]').click();
  expect(await page.locator('#header-controls button[data-column]').allTextContents(), 'Column grouping holds the table\'s columns').toEqual(['Study name', 'Enrolled', 'Status']);
});

test('47.02: Cell display has three buttons, one pressed, Compact by default: Compact shows one rate per metric, Detailed the open cells as defined with no trend or shading, Custom its Show and Heatmap choices; columns sort by the active heatmap, otherwise by rate (#47)', async ({ app, page }) => {
  // A configuration that asks for a trend and a heatmap, which only Custom applies.
  await app.openReport('portfolio', { document: (/** @type {any} */ doc) => void (doc.config = { show: ['num', 'trend'], heatmap: 'rate' }) });
  await page.locator('#app > .layout').waitFor();
  expect(await control(page, 'button[data-display]').locator.allTextContents()).toEqual(['Compact', 'Detailed', 'Custom']);
  expect(await pressed(page), 'by default').toEqual(['compact']);
  const rows = await page.locator(`${TABLE} tbody tr`).count();
  const compact = await tableShows(page);
  expect(compact, 'Compact: one tile per metric and row, unshaded').toEqual({ tiles: rows * shown.length, cells: 0, shaded: 0, trends: 0, stacked: 0 });
  const tile = page.locator(`${TABLE} tbody tr.total .otile`).first();
  await expect(tile, 'a tile holds one value').toHaveText(/^\s*[\d.,]+%?\s*$/);

  await chooseView(page, 'detailed');
  expect(await pressed(page)).toEqual(['detailed']);
  expect(await tableShows(page), 'Detailed: open cells as defined, no trend, no shading').toEqual({ tiles: 0, cells: rows * shown.length, shaded: 0, trends: 0, stacked: 0 });
  const metric = shown[1];
  await page.locator(`th[data-sort="${metric.MetricID}"]`).click();
  await expect(page.locator('.portfolio-table .showing'), 'Detailed sorts by rate').toContainText(`sorted by ${metric.Abbreviation} rate`);

  await chooseView(page, 'custom');
  expect(await pressed(page)).toEqual(['custom']);
  const custom = await tableShows(page);
  expect([custom.cells, custom.stacked, custom.trends > 0, custom.shaded > 0], 'Custom: the configured cells, trend and heatmap').toEqual([rows * shown.length, rows * shown.length, true, true]);
  await expect(page.locator('.portfolio-table .showing'), 'Custom sorts by the heatmap\'s measure').toContainText(`sorted by ${metric.Abbreviation} rate`);
  await chooseHeatmap(page, 'num');
  await expect(page.locator('.portfolio-table .showing')).toContainText(`sorted by ${metric.Abbreviation} numerator`);
  await chooseView(page, 'detailed');
  await expect(page.locator('.portfolio-table .showing'), 'back in Detailed, by rate').toContainText(`sorted by ${metric.Abbreviation} rate`);
  expect((await tableShows(page)).shaded, 'Detailed with a heatmap set').toBe(0);
});

test('47.03: choosing a grouping opens every group; a click closes or reopens one; closed groups survive a reload, a study link and its back link; a new grouping or Reset opens them all (#47)', async ({ app, page }) => {
  await app.open();
  await control(page, 'select[data-groupby]').selectOption('phase');
  await expect(page.locator(`${TABLE} tr.study.child`), 'every group open').toHaveCount(studies.length);
  const [first, second] = phases;
  await page.locator(`tr[data-bucket="${first}"] td.grp`).click();
  const inFirst = studies.filter((s) => s.params.phase === first).length;
  await expect(page.locator(`${TABLE} tr.study.child`), `${first} closed`).toHaveCount(studies.length - inFirst);
  expect(new URLSearchParams(address(page).slice(1)).getAll('collapse')).toEqual([first]);
  const left = page.url();
  await page.reload();
  await page.locator('#app > .layout').waitFor();
  await expect(page.locator(`${TABLE} tr.study.child`), 'reload').toHaveCount(studies.length - inFirst);
  const linked = /** @type {{ StudyID: string }} */ (studies.find((s) => s.params.phase === second));
  await page.locator(`#app .portfolio-table a[data-study="${linked.StudyID}"]`).click();
  await page.locator(`#app > [data-study="${linked.StudyID}"] .card`).first().waitFor();
  await page.locator('#app a.back').click();
  await page.locator('#app > .layout').waitFor();
  expect(page.url(), 'back link').toBe(left);
  await expect(page.locator(`${TABLE} tr.study.child`), 'back link').toHaveCount(studies.length - inFirst);
  await page.locator(`tr[data-bucket="${first}"] td.grp`).click();
  await expect(page.locator(`${TABLE} tr.study.child`), `${first} reopened`).toHaveCount(studies.length);
  await page.locator(`tr[data-bucket="${first}"] td.grp`).click();

  await control(page, 'select[data-groupby]').selectOption('status');
  await expect(page.locator(`${TABLE} tr.study.child`), 'a new grouping opens every group').toHaveCount(studies.length);
  expect(new URLSearchParams(address(page).slice(1)).has('collapse')).toBe(false);
  await page.locator(`${TABLE} tr[data-bucket] td.grp`).first().click();
  await control(page, '[data-reset]').click();
  await control(page, 'select[data-groupby]').selectOption('phase');
  await expect(page.locator(`${TABLE} tr.study.child`), 'after Reset, every group open').toHaveCount(studies.length);
});

test('47.04: a configured Cell display of compact, detailed or custom opens the report in it, any other value is refused, and an old address\'s View and cell mode open the matching preset, rewritten in the new form (#47)', async ({ app, page }) => {
  for (const view of ['compact', 'detailed', 'custom']) {
    await page.goto('about:blank');
    await app.openReport('portfolio', { document: (/** @type {any} */ doc) => void (doc.config = { view }) });
    await page.locator('#app > .layout').waitFor();
    expect(await pressed(page), `configured ${view}`).toEqual([view]);
  }
  for (const view of ['overview', 'details', 'mixed']) {
    await page.goto('about:blank');
    await app.openReport('portfolio', { document: (/** @type {any} */ doc) => void (doc.config = { view }) });
    await expect(page.getByRole('alert').getByRole('heading'), `configured ${view}`).toHaveText("This report can't be shown");
    await expect(page.getByRole('alert'), `configured ${view}`).toContainText('config.view');
  }
  // Under the sub-path, an override is a route: drop it to open the report as shipped.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  for (const [old, view, rewritten] of [
    ['#view=overview', 'compact', ''],
    ['#view=details', 'detailed', '#view=detailed'],
    ['#view=details&cell=custom', 'custom', '#view=custom'],
    [`#group=phase&expand=${phases[0]}`, 'compact', '#group=phase'],
  ]) {
    await page.goto('about:blank');
    await app.open(old);
    expect([await pressed(page), address(page)], old).toEqual([[view], rewritten]);
  }
  await expect(page.locator(`${TABLE} tr.study.child`), 'an old address\'s open groups are ignored: every group open').toHaveCount(studies.length);
});

test('47.05: Config under each Cell display, as a popover and as a side panel, for visual comparison with this issue\'s Scope (#47)', async ({ app, page, evidence }) => {
  await app.open();
  for (const panel of ['popover', 'side']) {
    if (panel === 'side') await chooseAdmin(page, 'cfgpanel', 'side');
    for (const view of /** @type {const} */ (['compact', 'detailed', 'custom'])) {
      await chooseView(page, view);
      await page.locator('#header-controls [data-open="config"]').click();
      await expect(page.locator('#header-controls [data-pop="config"]')).toBeVisible();
      await page.waitForTimeout(250);
      await evidence.shot(page, `Config as a ${panel === 'side' ? 'side panel' : 'popover'}, ${view}`);
      await closeControls(page);
    }
  }
});

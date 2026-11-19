// @ts-check
// #16: the portfolio's defaults come from the configuration in its data document. The hash overrides them, and the
// view survives a reload and the trip to a study report and back under any configuration.
import { expect, readData, test } from './fixtures/app.js';
import { canonicalDom, capturePortfolio } from './fixtures/baseline.js';
/** @typedef {import('@playwright/test').Page} Page */

test.describe.configure({ timeout: 120_000 });

const portfolio = readData('portfolio.json');
/** @type {Array<{ MetricID: string, GroupLevel: string, Active?: boolean, Abbreviation: string }>} */
const catalog = portfolio.metrics;
/** @type {Array<{ StudyID: string, params: Record<string, string> }>} */
const studies = portfolio.studies;
const eligible = catalog.filter((m) => m.Active !== false && m.GroupLevel === 'Site').map((m) => m.MetricID);
const CONFIG = { groupBy: 'phase', heatmap: 'rate', show: ['den', 'trend'], metrics: ['Analysis_kri0003', 'Analysis_kri0004'] };
const study = 'STUDY004';
const studyParams = /** @type {{ params: Record<string, string> }} */ (studies.find((s) => s.StudyID === study)).params;

/** @param {unknown} config */
const configured = (config) => ({ document: (/** @type {any} */ doc) => void (doc.config = config), beside: [study] });

/** @param {Page} page */
const sidebar = (page) => page.locator('.sidebar');

/**
 * The table's markup in the baseline's canonical form, which writes each study link without the hash it carries.
 * @param {Page} page
 */
const tableMarkup = (page) => page.locator('.portfolio-table table.po').evaluate(canonicalDom);

/** @param {Page} page */
async function controls(page) {
  const box = sidebar(page);
  return {
    groupBy: await box.locator('select[data-groupby]').inputValue(),
    heatmap: await box.locator('select[data-heatmap]').inputValue(),
    hidden: (await box.locator('input[data-metric]:not(:checked)').evaluateAll((els) => els.map((e) => e.getAttribute('data-metric')))).sort(),
    shown: (await box.locator('input[data-metric]:checked').evaluateAll((els) => els.map((e) => e.getAttribute('data-metric')))).sort(),
  };
}

/**
 * Cell display is set in Details: Overview shows one headline value per metric and disables it.
 * @param {Page} page
 * @param {'details' | 'overview'} view
 */
const switchTo = (page, view) => page.locator(`button[data-view="${view}"]`).click();

/**
 * The table in Overview and in Details, starting and ending in Overview.
 * @param {Page} page
 */
async function bothViews(page) {
  await page.mouse.move(0, 0);
  const overview = await tableMarkup(page);
  await switchTo(page, 'details');
  await page.mouse.move(0, 0);
  const details = await tableMarkup(page);
  await switchTo(page, 'overview');
  return { overview, details };
}

/**
 * The Show in each cell chips under Custom cell display, read with Custom on, leaving the cell display as it was.
 * @param {Page} page
 */
async function customChips(page) {
  const box = sidebar(page);
  const was = await box.locator('button[data-seg="cellMode"].on').getAttribute('data-value');
  await box.locator('button[data-seg="cellMode"][data-value="custom"]').click();
  const chips = await box.locator('button[data-show]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-show'), e.getAttribute('aria-pressed')]));
  if (was !== 'custom') await box.locator(`button[data-seg="cellMode"][data-value="${was}"]`).click();
  return Object.fromEntries(chips);
}

test('16.01: with every setting configured away from its built-in default, the portfolio opens on the configured view (#16)', async ({ app, page }) => {
  // The same view reached through the controls, without configuration.
  await app.openReport('portfolio');
  await sidebar(page).locator('select[data-groupby]').selectOption('phase');
  await sidebar(page).locator('select[data-heatmap]').selectOption('rate');
  await switchTo(page, 'details');
  await sidebar(page).locator('button[data-seg="cellMode"][data-value="custom"]').click();
  for (const part of ['num', 'rate', 'den', 'trend']) await sidebar(page).locator(`button[data-show="${part}"]`).click();
  await sidebar(page).locator('button[data-seg="cellMode"][data-value="defined"]').click();
  await switchTo(page, 'overview');
  for (const id of CONFIG.metrics) await sidebar(page).locator(`input[data-metric="${id}"]`).uncheck();
  const reference = await bothViews(page);

  await app.openReport('portfolio', configured(CONFIG));
  const shown = await controls(page);
  expect([shown.groupBy, shown.heatmap]).toEqual(['phase', 'rate']);
  expect(shown.hidden).toEqual([...CONFIG.metrics].sort());
  expect(shown.shown).toEqual(eligible.filter((id) => !CONFIG.metrics.includes(id)).sort());
  expect(await bothViews(page), 'the table equals the same view set through the controls, in Overview and Details').toEqual(reference);

  const table = page.locator('.portfolio-table table.po');
  const phases = [...new Set(studies.map((s) => s.params.phase))].sort((a, b) => a.localeCompare(b));
  expect(phases.length).toBeGreaterThan(1);
  const buckets = await table.locator('tbody tr.bucket td.grp').evaluateAll((tds) =>
    tds.map((td) => {
      const copy = /** @type {Element} */ (td.cloneNode(true));
      for (const e of copy.querySelectorAll('.tri, .nick, .info')) e.remove();
      return (copy.textContent ?? '').trim();
    }),
  );
  expect(buckets, 'grouped by phase').toEqual(phases);
  expect(await table.locator('.otile[class*="hot"]').count(), 'cells shaded by rate').toBeGreaterThan(0);
  const columns = await table.locator('thead th.bandh .tlab').allTextContents();
  const abbr = (/** @type {string} */ id) => catalog.find((m) => m.MetricID === id)?.Abbreviation;
  expect(columns.map((c) => c.trim()).sort(), 'every eligible metric but the hidden ones').toEqual(
    eligible.filter((id) => !CONFIG.metrics.includes(id)).map(abbr).sort(),
  );
  await switchTo(page, 'details');
  expect(await customChips(page)).toEqual({ num: 'false', den: 'true', rate: 'false', trend: 'true' });
});

/**
 * Settings away from the configuration, through the controls.
 * @type {Record<string, (page: Page) => Promise<void>>}
 */
const CHANGES = {
  'as configured': async () => {},
  'changed to other values': async (page) => {
    await sidebar(page).locator('select[data-groupby]').selectOption('status');
    await sidebar(page).locator('select[data-heatmap]').selectOption('num');
    await switchTo(page, 'details');
    await sidebar(page).locator('button[data-seg="cellMode"][data-value="custom"]').click();
    for (const part of ['den', 'num']) await sidebar(page).locator(`button[data-show="${part}"]`).click();
    await sidebar(page).locator('input[data-metric="Analysis_kri0003"]').check();
    await sidebar(page).locator('input[data-metric="Analysis_kri0005"]').uncheck();
  },
  'changed back to the built-in defaults': async (page) => {
    await sidebar(page).locator('select[data-groupby]').selectOption('none');
    await sidebar(page).locator('select[data-heatmap]').selectOption('none');
    await switchTo(page, 'details');
    await sidebar(page).locator('button[data-seg="cellMode"][data-value="custom"]').click();
    for (const part of ['den', 'trend', 'num', 'rate']) await sidebar(page).locator(`button[data-show="${part}"]`).click();
    await sidebar(page).locator('button[data-seg="cellMode"][data-value="defined"]').click();
    for (const id of CONFIG.metrics) await sidebar(page).locator(`input[data-metric="${id}"]`).check();
  },
};

test('16.03: under a configuration, the portfolio comes back as it was left after a reload and after a study report and its back link, and the study report shows exactly the metrics the portfolio showed (#16)', async ({ app, page }) => {
  for (const [what, change] of Object.entries(CHANGES)) {
    await app.openReport('portfolio', configured(CONFIG));
    await change(page);
    const groupBy = await sidebar(page).locator('select[data-groupby]').inputValue();
    if (groupBy !== 'none') await page.locator(`tr[data-bucket="${studyParams[groupBy]}"] td.grp`).click();
    await page.mouse.move(0, 0);
    const left = page.url();
    const before = await capturePortfolio(page, 'before leaving');
    const { shown } = await controls(page);
    if (what === 'changed back to the built-in defaults') expect(shown, `${what}: every metric shown`).toEqual([...eligible].sort());
    else expect(shown.length, what).toBeLessThan(eligible.length);

    await page.reload();
    await page.locator('#app > .layout').waitFor();
    await page.mouse.move(0, 0);
    expect(page.url(), `${what}: reload`).toBe(left);
    expect((await capturePortfolio(page, 'before leaving')).text, `${what}: reload`).toBe(before.text);

    await page.locator(`#app .portfolio-table a[data-study="${study}"]`).first().click();
    await page.locator(`#app > [data-study="${study}"] .tile`).first().waitFor();
    const tiles = await page.locator('#app .tile[data-metric-id]').evaluateAll((els) => els.map((t) => t.getAttribute('data-metric-id')));
    expect(tiles.sort(), `${what}: the study report's metrics`).toEqual(shown);

    await page.locator('#app a.back').click();
    await page.locator('#app > .layout').waitFor();
    await page.mouse.move(0, 0);
    expect(page.url(), `${what}: back link`).toBe(left);
    expect((await capturePortfolio(page, 'before leaving')).text, `${what}: back link`).toBe(before.text);
  }
});

/** @type {Array<[string, unknown, string]>} */
const REFUSED = [
  ['an unknown key', { colour: 'red' }, 'colour'],
  ['a value outside the Controls panel\'s choices', { heatmap: 'flag' }, 'heatmap'],
  ['a study-level MetricID', { metrics: [catalog.find((m) => m.Active !== false && m.GroupLevel !== 'Site')?.MetricID] }, 'metrics'],
  ['an inactive MetricID', { metrics: [catalog.find((m) => m.Active === false)?.MetricID] }, 'metrics'],
];

for (const [what, config, key] of REFUSED) {
  test(`16.04: a portfolio document whose configuration has ${what} shows the error state naming the key, not the portfolio (#16)`, async ({ app, page }) => {
    expect(JSON.stringify(config)).not.toContain('null');
    await app.openReport('portfolio', configured(config));
    await expect(page.getByRole('alert').getByRole('heading')).toHaveText("This report can't be shown");
    await expect(page.getByRole('alert')).toContainText(`config.${key}`);
    await expect(page.locator('#app .layout')).toHaveCount(0);
  });
}

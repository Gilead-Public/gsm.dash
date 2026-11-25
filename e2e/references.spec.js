// @ts-check
// #12: an unknown or inapplicable reference in configuration shows a placeholder naming it and the reason, and logs
// a warning; nothing is substituted. Every case here is supplied through the catalog, as a deployment would supply
// it; a misspelt widget or section in the card list itself is code, covered by the unit tests.
import { expect, readData, test } from './fixtures/app.js';
import { card } from './fixtures/tiles.js';
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {{ MetricID: string, ID: string, Abbreviation: string, Metric: string, Active?: boolean, Widget?: string, Widgets?: string[], WidgetConfigs?: Record<string, object>, GroupLevel: string }} Meta */

const portfolio = readData('portfolio.json');
const study = portfolio.studies[0];
/** @type {Meta[]} */
const catalog = portfolio.metrics;
/** @param {string} id */
const metricOf = (id) => /** @type {Meta} */ (catalog.find((m) => m.ID === id));
// Shown metrics with no card: the notice is the only place their configuration can surface.
const cardless = metricOf('ctq0002');
const typo = metricOf('ctq0003');
const unconfigured = metricOf('kri0007');

/**
 * Opens the study with a changed catalog, collecting the page's warnings.
 * @param {import('./fixtures/app.js').App} app
 * @param {Page} page
 * @param {(metrics: Meta[]) => Meta[] | void} change
 */
async function openWith(app, page, change) {
  /** @type {string[]} */
  const warnings = [];
  page.on('console', (m) => {
    if (m.type() === 'warning') warnings.push(m.text());
  });
  await app.openStudy(study.StudyID, {
    portfolio: (p) => {
      const replaced = change(p.metrics);
      if (replaced) p.metrics = replaced;
    },
  });
  return warnings;
}

/**
 * The card shows only the placeholder naming the bad reference, its footer has nothing to offer, and the page warned.
 * @param {Page} page
 * @param {string[]} warnings
 * @param {string} id
 * @param {string} text
 */
async function expectPlaceholder(page, warnings, id, text) {
  const body = card(page, id).locator('.tile-body');
  await expect(body.locator('.ref-problem')).toBeVisible();
  await expect(body.locator('.ref-problem')).toHaveText(`Can't show this card. ${text}`);
  expect(await body.evaluate((el) => [...el.children].map((c) => c.className)), 'nothing shown in its place').toEqual(['ref-problem']);
  await expect(card(page, id).locator('.tile-foot button')).toHaveCount(0);
  expect(warnings).toContain(`[gsm.dash] ${text}`);
}

test.describe('references that fail visibly', () => {
  test('12.01: a card whose metric the catalog lacks shows a placeholder naming it, and the notice lists it in the breakdowns and the card list (#12)', async ({ app, page }) => {
    const ip = metricOf('kri0019');
    const warnings = await openWith(app, page, (metrics) => metrics.filter((m) => m.ID !== ip.ID));
    await expectPlaceholder(page, warnings, 'ip-status', `Metric "${ip.ID}" for the card "IP Status": it is not in the metric catalog.`);
    const notice = [`Metric "${ip.ID}" in the breakdown configuration: it is not in the metric catalog.`, `Metric "${ip.ID}" in the study page's card list: it is not in the metric catalog.`];
    await expect(page.locator('.config-notice li')).toHaveText(notice);
    for (const text of notice) expect(warnings).toContain(`[gsm.dash] ${text}`);
  });

  test('12.01: a card whose metric is inactive shows a placeholder saying so (#12)', async ({ app, page }) => {
    const ip = metricOf('kri0019');
    const warnings = await openWith(app, page, (metrics) => {
      /** @type {Meta} */ (metrics.find((m) => m.ID === ip.ID)).Active = false;
    });
    await expectPlaceholder(page, warnings, 'ip-status', `Metric "${ip.ID}" for the card "IP Status": it is inactive.`);
    await expect(page.locator('.config-notice')).toHaveCount(0);
  });

  test('12.01: a breakdown card whose metric declares another widget, or none, shows a placeholder naming both (#12)', async ({ app, page }) => {
    const ie = metricOf('kri0014');
    const where = `${ie.Abbreviation} (${ie.MetricID})`;
    let warnings = await openWith(app, page, (metrics) => {
      /** @type {Meta} */ (metrics.find((m) => m.ID === ie.ID)).Widget = 'distributon-bar';
    });
    await expectPlaceholder(page, warnings, 'eligibility-status', `Widget "distribution-bar" for the card "Eligibility Status": ${where} declares the widget "distributon-bar".`);
    await expectPlaceholder(page, warnings, 'ie-criteria', `Widget "distribution-bar" for the card "Eligibility I/E Criteria": ${where} declares the widget "distributon-bar".`);
    warnings = await openWith(app, page, (metrics) => {
      delete (/** @type {Meta} */ (metrics.find((m) => m.ID === ie.ID)).Widget);
    });
    await expectPlaceholder(page, warnings, 'eligibility-status', `Widget "distribution-bar" for the card "Eligibility Status": ${where} declares no widget.`);
  });

  test('12.01: a standard KRI\'s card whose metric the configuration takes out of every KRI group shows a placeholder saying so (#12)', async ({ app, page }) => {
    const ae = metricOf('kri0001');
    const warnings = await openWith(app, page, (metrics) => {
      const m = /** @type {Meta} */ (metrics.find((x) => x.ID === ae.ID));
      m.WidgetConfigs = { ...m.WidgetConfigs, 'kri-summary': { group: null } };
    });
    await expectPlaceholder(page, warnings, 'kri0001', `Widget "kri-summary" for the card "${ae.Metric}": ${ae.Abbreviation} (${ae.MetricID}) is not a standard KRI.`);
  });

  test('12.01: a catalog widget that is unknown or doesn\'t apply, options for an unknown widget, and the catalog inputs the tile pager used, are listed in the notice above the study page, and log a warning (#12)', async ({ app, page }) => {
    const warnings = await openWith(app, page, (metrics) => {
      const m = /** @type {Meta} */ (metrics.find((x) => x.ID === cardless.ID));
      Object.assign(m, { Widget: 'trend-mini', Widgets: ['link-out'], WidgetConfigs: { 'scalar-tyle': { flags: true }, 'link-out': { label: 'report' } } });
      /** @type {Meta} */ (metrics.find((x) => x.ID === typo.ID)).Widget = 'distributon-bar';
      /** @type {Meta} */ (metrics.find((x) => x.ID === unconfigured.ID)).Widget = 'distribution-bar';
    });
    const where = `${cardless.Abbreviation} (${cardless.MetricID})`;
    const retired = 'tile views are retired, and each card shows one widget.';
    const texts = [
      `Widget "distribution-bar" in the catalog entry of ${unconfigured.Abbreviation} (${unconfigured.MetricID}): it has no breakdown configuration.`,
      `Widget "distributon-bar" in the catalog entry of ${typo.Abbreviation} (${typo.MetricID}): it is not a registered widget.`,
      `Widget "scalar-tyle" in the view options of ${where}: it is not a registered widget.`,
      `Views "link-out" in the catalog entry of ${where}: ${retired}`,
      `Widget "trend-mini" in the catalog entry of ${where}: ${retired}`,
      `View options for "link-out" in the catalog entry of ${where}: ${retired}`,
    ];
    await expect(page.locator('.config-notice li')).toHaveText(texts);
    for (const text of texts) expect(warnings).toContain(`[gsm.dash] ${text}`);
    await expect(page.locator(`.card[data-metric-id="${cardless.MetricID}"]`)).toHaveCount(0);
    await expect(page.locator('.ref-problem')).toHaveCount(0);
  });
});

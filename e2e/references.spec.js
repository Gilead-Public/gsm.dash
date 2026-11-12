// @ts-check
// #12: an unknown or inapplicable reference in configuration shows a placeholder naming it and the reason, and logs
// a warning; nothing is substituted. Every case is supplied through real configuration (the catalog), on both hosts.
import { expect, readData, test } from './fixtures/app.js';
import { DISTRIBUTION_CONFIG } from '../src/config/distributions.js';
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {{ MetricID: string, ID: string, Abbreviation: string, Widget?: string, Widgets?: string[], WidgetConfigs?: Record<string, object>, GroupLevel: string }} Meta */

const portfolio = readData('portfolio.json');
const study = portfolio.studies[0];
/** @type {Meta[]} */
const catalog = portfolio.metrics;
// A metric with no view of its own and no breakdown configuration.
const plain = /** @type {Meta} */ (catalog.find((m) => !m.Widget && !m.Widgets && !(m.ID in DISTRIBUTION_CONFIG) && m.GroupLevel === 'Site'));
const configured = /** @type {Meta} */ (catalog.find((m) => m.ID in DISTRIBUTION_CONFIG));
const STANDARD_VIEWS = 5;

/**
 * Opens the study with one change to the plain metric's catalog entry, collecting the page's warnings.
 * @param {import('./fixtures/app.js').App} app
 * @param {Page} page
 * @param {(meta: Meta, catalog: Meta[]) => Meta[] | void} change
 */
async function openWith(app, page, change) {
  /** @type {string[]} */
  const warnings = [];
  page.on('console', (m) => {
    if (m.type() === 'warning') warnings.push(m.text());
  });
  await app.openStudy(study.StudyID, {
    portfolio: (p) => {
      const replaced = change(p.metrics.find((/** @type {Meta} */ m) => m.MetricID === plain.MetricID), p.metrics);
      if (replaced) p.metrics = replaced;
    },
  });
  return warnings;
}

/** @param {Page} page */
const body = (page) => page.locator(`.tile[data-metric-id="${plain.MetricID}"] .tile-body`);

/**
 * Pages the plain metric's tile forward to a view.
 * @param {Page} page
 * @param {string} view
 */
async function pageTo(page, view) {
  const name = page.locator(`.tile[data-metric-id="${plain.MetricID}"] .view-name`);
  for (let i = 0; i < 12 && !(await name.textContent())?.trim().startsWith(view); i++) {
    await page.locator(`.tile[data-metric-id="${plain.MetricID}"] button[data-view-step="1"]`).click();
  }
  await expect(name).toHaveText(new RegExp(`^${view} `));
}

/**
 * The tile shows only the placeholder, which names the widget, the metric and the reason, and the page warned.
 * @param {Page} page
 * @param {string[]} warnings
 * @param {string} widget
 * @param {string} reason
 */
async function expectPlaceholder(page, warnings, widget, reason) {
  const text = `Widget "${widget}" for ${plain.Abbreviation} (${plain.MetricID}): ${reason}.`;
  await expect(body(page).locator('.ref-problem')).toBeVisible();
  await expect(body(page).locator('.ref-problem')).toHaveText(`Can't show this view. ${text}`);
  expect(await body(page).evaluate((el) => [...el.children].map((c) => c.className)), 'nothing shown in its place').toEqual(['ref-problem']);
  expect(warnings).toContain(`[gsm.dash] ${text}`);
}

test.describe('references that fail visibly', () => {
  test('12.01: an unknown widget as a metric’s own view shows a placeholder naming it, in place of any other view, and logs a warning (#12)', async ({ app, page }) => {
    const warnings = await openWith(app, page, (m) => {
      m.Widget = 'distributon-bar';
    });
    await expect(page.locator(`.tile[data-metric-id="${plain.MetricID}"] .view-name`)).toHaveText(`"distributon-bar" ${STANDARD_VIEWS + 1}/${STANDARD_VIEWS + 1}`);
    await expectPlaceholder(page, warnings, 'distributon-bar', 'it is not a registered widget');
    await expect(page.locator('.config-notice')).toHaveCount(0);
  });

  test('12.01: an unknown widget among a metric’s extra views shows a placeholder naming it when paged to, and logs a warning (#12)', async ({ app, page }) => {
    const warnings = await openWith(app, page, (m) => {
      m.Widgets = ['trend-sparkle'];
    });
    await expect(body(page).locator('.big')).toBeVisible();
    await pageTo(page, '"trend-sparkle"');
    await expectPlaceholder(page, warnings, 'trend-sparkle', 'it is not a registered widget');
  });

  test('12.01: an explicitly empty name as a metric’s own view shows a placeholder naming it, in place of any other view, and logs a warning (#12)', async ({ app, page }) => {
    const warnings = await openWith(app, page, (m) => {
      m.Widget = '';
    });
    await expect(page.locator(`.tile[data-metric-id="${plain.MetricID}"] .view-name`)).toHaveText(`"" ${STANDARD_VIEWS + 1}/${STANDARD_VIEWS + 1}`);
    await expectPlaceholder(page, warnings, '', 'it is not a registered widget');
  });

  test('12.01: an explicitly empty name among a metric’s extra views shows a placeholder naming it when paged to, and logs a warning (#12)', async ({ app, page }) => {
    const warnings = await openWith(app, page, (m) => {
      m.Widgets = [''];
    });
    await expect(body(page).locator('.big')).toBeVisible();
    await pageTo(page, '""');
    await expectPlaceholder(page, warnings, '', 'it is not a registered widget');
  });

  test('12.01: a breakdown widget on a metric with no breakdown configuration shows a placeholder naming both and the reason, and logs a warning (#12)', async ({ app, page }) => {
    const warnings = await openWith(app, page, (m) => {
      m.Widget = 'distribution-bar';
    });
    await expectPlaceholder(page, warnings, 'distribution-bar', 'it has no breakdown configuration');
  });

  test('12.01: a report-link widget on a metric with no configured link shows a placeholder naming both and the reason, and logs a warning (#12)', async ({ app, page }) => {
    const warnings = await openWith(app, page, (m) => {
      m.Widgets = ['link-out'];
    });
    await pageTo(page, 'Report link');
    await expectPlaceholder(page, warnings, 'link-out', 'no report link is configured for it');
  });

  test('12.01: view options for an unknown widget are listed in the notice above the study page, and log a warning (#12)', async ({ app, page }) => {
    const warnings = await openWith(app, page, (m) => {
      m.WidgetConfigs = { 'scalar-tyle': { flags: true } };
    });
    const text = `Widget "scalar-tyle" in the view options of ${plain.Abbreviation} (${plain.MetricID}): it is not a registered widget.`;
    await expect(page.locator('.config-notice')).toBeVisible();
    await expect(page.locator('.config-notice li')).toHaveText([text]);
    expect(warnings).toContain(`[gsm.dash] ${text}`);
    await expect(body(page).locator('.big')).toBeVisible();
    await expect(body(page).locator('.flags')).toHaveCount(0);
  });

  test('12.01: a metric the breakdown configuration names but the catalog lacks is listed in the notice above the study page, and logs a warning (#12)', async ({ app, page }) => {
    const warnings = await openWith(app, page, (_m, metrics) => metrics.filter((m) => m.MetricID !== configured.MetricID));
    const text = `Metric "${configured.ID}" in the breakdown configuration: it is not in the metric catalog.`;
    await expect(page.locator('.config-notice')).toBeVisible();
    await expect(page.locator('.config-notice li')).toHaveText([text]);
    expect(warnings).toContain(`[gsm.dash] ${text}`);
    await expect(page.locator(`.tile[data-metric-id="${configured.MetricID}"]`)).toHaveCount(0);
  });
});

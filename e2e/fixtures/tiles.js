// @ts-check
// Study-report tile helpers shared by the browser tests.
import { expect } from './app.js';
/** @typedef {import('@playwright/test').Page} Page */

/**
 * @param {Page} page
 * @param {string} metricId
 */
export const tile = (page, metricId) => page.locator(`.tile[data-metric-id="${metricId}"]`);

/**
 * Pages every full tile forward until it shows the named view.
 * @param {Page} page
 * @param {string} view The view's label, e.g. "Trend over time".
 */
export async function pageAllTo(page, view) {
  for (const id of await page.locator('.tile:not(.kri)[data-metric-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-metric-id') ?? ''))) {
    const name = tile(page, id).locator('.view-name');
    for (let i = 0; i < 12 && !(await name.textContent())?.trim().startsWith(view); i++) await tile(page, id).locator('button[data-view-step="1"]').click();
    await expect(name).toHaveText(new RegExp(`^${view} `));
  }
}

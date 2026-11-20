// @ts-check
/** @typedef {import('@playwright/test').Page} Page */

/**
 * Sets the portfolio table's View, Overview or Details, through the Controls panel.
 * @param {Page} page
 * @param {string} view
 */
export const chooseView = (page, view) => page.locator(`.sidebar button[data-seg="view"][data-value="${view}"]`).click();

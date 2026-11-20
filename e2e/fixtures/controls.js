// @ts-check
// The portfolio's controls live in its header (#22, #24): Filters, a chip bar collapsed on load whose chips each open
// their choices, and the Config popover. These helpers reach a control the way a user does: open what holds it, act,
// then close it with Escape, so an open popover never covers the table for the next step.
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').Locator} Locator */

const HOST = '#header-controls';

/**
 * Opens whatever holds `target`: the Filters bar and the filter's chip, or Config.
 * @param {Page} page
 * @param {Locator} target
 */
async function reveal(page, target) {
  const { pop, inBar } = await target.evaluate((el) => ({
    pop: el.closest('[data-pop]')?.getAttribute('data-pop') ?? null,
    inBar: Boolean(el.closest('.filter-bar')),
  }));
  const host = page.locator(HOST);
  if (inBar) {
    const bar = host.locator('[data-open="filters"]');
    if ((await bar.getAttribute('aria-expanded')) !== 'true') await bar.click();
  }
  if (!pop) return;
  const opener = host.locator(`[data-open="${pop}"]`);
  if ((await opener.getAttribute('aria-expanded')) !== 'true') await opener.click();
}

/**
 * A portfolio control by selector. Actions open what holds it first and close it after; reads need nothing open.
 * @param {Page} page
 * @param {string} selector
 */
export function control(page, selector) {
  const locator = page.locator(HOST).locator(selector);
  /**
   * @template {unknown[]} A
   * @param {(target: Locator, ...args: A) => Promise<unknown>} action
   */
  const act = (action) => async (/** @type {A} */ ...args) => {
    await reveal(page, locator.first());
    await action(locator, ...args);
    await page.keyboard.press('Escape');
  };
  return {
    locator,
    click: act((t) => t.click()),
    check: act((t) => t.check()),
    uncheck: act((t) => t.uncheck()),
    selectOption: act((t, /** @type {string} */ value) => t.selectOption(value)),
    inputValue: () => locator.inputValue(),
    getAttribute: (/** @type {string} */ name) => locator.getAttribute(name),
  };
}

/**
 * Sets the portfolio table's View, Overview (collapsed) or Details (expanded), with Config's Collapse all / Expand all.
 * @param {Page} page
 * @param {string} view
 */
export async function chooseView(page, view) {
  const toggle = control(page, 'button[data-view-toggle]');
  const now = (await toggle.getAttribute('aria-pressed')) === 'true' ? 'details' : 'overview';
  if (now !== view) await toggle.click();
}

/**
 * Closes any open popover, takes focus off the control that opened it, and moves the pointer off the page.
 * @param {Page} page
 */
export async function closeControls(page) {
  await page.keyboard.press('Escape');
  await page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());
  await page.mouse.move(0, 0);
}

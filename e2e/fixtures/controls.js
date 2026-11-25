// @ts-check
// The portfolio's controls live in its header (#22, #24): Filters, a chip bar collapsed on load whose chips each open
// their choices, and the Config popover. These helpers reach a control the way a user does: open what holds it, act,
// then close it with Escape, so an open popover never covers the table for the next step.
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').Locator} Locator */

const HOST = '#header-controls';

/**
 * Opens whatever holds `target`: the Filters bar and the filter's chip, or Config, and in Config the metric group whose
 * caret hides it. Returns that group's name, so the caller can close it again: which groups are open isn't part of the
 * view, so a test leaves them as it found them.
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
  const closedGroup = await target.evaluate((el) => {
    const body = /** @type {HTMLElement | null} */ (el.closest('.mgroup-body'));
    return body?.hidden ? (body.closest('.mgroup')?.querySelector('[data-expand]')?.getAttribute('data-expand') ?? null) : null;
  });
  if (closedGroup) await host.locator(`[data-expand="${closedGroup}"]`).click();
  return closedGroup;
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
    const opened = await reveal(page, locator.first());
    await action(locator, ...args);
    if (opened) await page.locator(HOST).locator(`[data-expand="${opened}"]`).click();
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
 * Sets the portfolio table's Cell display (#47): Compact (folded), Detailed or Custom (both open).
 * @param {Page} page
 * @param {'compact' | 'detailed' | 'custom'} view
 */
export async function chooseView(page, view) {
  await control(page, `button[data-display="${view}"]`).click();
}

/**
 * Sets the heatmap's measure, which applies under Custom only (#47): Custom first, then the measure.
 * @param {Page} page
 * @param {string} measure
 */
export async function chooseHeatmap(page, measure) {
  await chooseView(page, 'custom');
  await control(page, 'select[data-heatmap]').selectOption(measure);
}

/**
 * Sets one of the Admin panel's settings (#46), opening the panel from the header and closing it after.
 * @param {Page} page
 * @param {string} key
 * @param {string} value
 */
export async function chooseAdmin(page, key, value) {
  await control(page, `button[data-admin="${key}"][data-value="${value}"]`).click();
}

/**
 * Leaves only one group open: a grouping opens every group (#47), so each other group's row is clicked closed.
 * @param {Page} page
 * @param {string} value
 */
export async function openOnly(page, value) {
  const buckets = await page.locator('tr[data-bucket]').evaluateAll((rows) => rows.map((tr) => tr.getAttribute('data-bucket')));
  for (const bucket of buckets) if (bucket !== value) await page.locator(`tr[data-bucket="${bucket}"] td.grp`).click();
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

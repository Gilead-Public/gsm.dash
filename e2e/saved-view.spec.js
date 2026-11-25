// @ts-check
// The portfolio's view saved in the browser as a backup of its address: restored silently when a report opens with no
// view in its address, kept per reports folder, without the Admin settings. Regression tests, untraced.
import { expect, readData, test } from './fixtures/app.js';
import { chooseAdmin, control } from './fixtures/controls.js';
/** @typedef {import('@playwright/test').Page} Page */

const hiddenMetric = 'Analysis_kri0005';

/** The number of studies the status line says are shown. @param {Page} page */
const studiesShown = async (page) => (await page.getByText(/\d+ \/ \d+ studies/).first().textContent())?.match(/(\d+) \/ \d+ studies/)?.[1];
/** @param {Page} page */
const address = (page) => new URLSearchParams(new URL(page.url()).hash.slice(1));
/** @param {Page} page */
const phase = (page, /** @type {string} */ value) => control(page, `button[data-filter="phase"][data-value="${value}"]`).click();
/** The views saved in this browser, by key. @param {Page} page */
const saved = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('gsm.dash:view:')));

/**
 * Opens the portfolio afresh, with no address.
 * @param {Page} page
 * @param {any} app
 */
async function reopen(page, app) {
  await page.goto('about:blank');
  await app.open();
}

test('a portfolio opened with no view in its address restores the last view, without the Admin settings; an address with a view wins and becomes the saved one', async ({ app, page }) => {
  await app.open();
  await phase(page, 'P1');
  await control(page, 'select[data-groupby]').selectOption('status');
  await chooseAdmin(page, 'theme', 'dark');
  await reopen(page, app);
  const restored = address(page);
  expect([restored.getAll('filter.phase'), restored.get('group'), restored.get('theme')]).toEqual([['P1'], 'status', null]);
  expect(await studiesShown(page)).toBe('4');

  await page.goto('about:blank');
  await app.open('#group=phase');
  expect([address(page).getAll('filter.phase'), address(page).get('group')]).toEqual([[], 'phase']);
  await reopen(page, app);
  expect([address(page).getAll('filter.phase'), address(page).get('group')], 'the address\'s view is now the saved one').toEqual([[], 'phase']);
});

test('a saved view restores a Product filter selection', async ({ app, page }) => {
  /** @type {string} */
  const product = readData('portfolio.json').studies[0].params.product;
  await app.open();
  await control(page, `button[data-filter="product"][data-value="${product}"]`).click();
  await reopen(page, app);
  expect(address(page).getAll('filter.product')).toEqual([product]);
  await expect(page.locator('.portfolio-table tr.study').first()).toBeVisible();
});

test('a study report opened with no view in its address applies the saved view\'s hidden metrics, and its back link carries the view', async ({ app, page }) => {
  await app.open();
  await control(page, `input[data-metric="${hiddenMetric}"]`).uncheck();
  await phase(page, 'P1');
  await page.goto('about:blank');
  await app.openStudy('STUDY001');
  await expect(page.locator('.card[data-card="kri0005"]')).toHaveCount(0);
  const back = new URLSearchParams(String(await page.locator('a.back').getAttribute('href')).split('#')[1]);
  expect([back.getAll('hide'), back.getAll('filter.phase')]).toEqual([[hiddenMetric], ['P1']]);
});

test('a saved view belongs to its reports\' folder: a portfolio in another folder neither sees nor changes it', async ({ app, page }, testInfo) => {
  await app.open();
  await phase(page, 'P1');
  const home = page.url().split('#')[0];
  await page.goto('about:blank');
  if (app.mode === 'file') {
    await app.openReport('portfolio', { document: () => {} });
  } else {
    const elsewhere = new URL('elsewhere/portfolio.html', String(testInfo.project.use.baseURL)).href;
    await page.route(elsewhere, async (r) => r.fulfill({ response: await r.fetch({ url: home }) }));
    await page.goto(elsewhere);
  }
  await page.locator('#app > .layout').waitFor();
  expect(page.url().split('#')[0], 'another folder').not.toBe(home);
  expect(await studiesShown(page), 'nothing saved there').toBe('12');
  await phase(page, 'P2');
  await page.goto('about:blank');
  await page.goto(home);
  await page.locator('#app > .layout').waitFor();
  expect(address(page).getAll('filter.phase'), 'the first folder\'s view, unchanged').toEqual(['P1']);
});

test('Reset, or any return to the defaults, forgets the saved view, so the defaults apply on the next open', async ({ app, page }) => {
  await app.open();
  await phase(page, 'P1');
  expect(await saved(page)).toHaveLength(1);
  await control(page, '[data-reset]').click();
  expect(await saved(page), 'Reset').toEqual([]);
  await phase(page, 'P2');
  await phase(page, 'P2');
  expect(await saved(page), 'back at the defaults by hand').toEqual([]);
  await reopen(page, app);
  expect([address(page).toString(), await studiesShown(page)]).toEqual(['', '12']);
});

test('a saved view naming studies, values or metrics the data no longer has, or old params, restores without them and says nothing', async ({ app, page }) => {
  await app.open();
  await page.evaluate(() =>
    localStorage.setItem(
      `gsm.dash:view:${location.pathname.replace(/[^/]*$/, '')}`,
      'filter.study=STUDY999&filter.phase=P1&filter.phase=P9&hide=Analysis_gone&view=overview&expand=1&group=nowhere',
    ),
  );
  await reopen(page, app);
  expect(address(page).toString()).toBe('filter.phase=P1');
  expect(await studiesShown(page)).toBe('4');
  await expect(page.getByText(/restored/i)).toHaveCount(0);
});

test('when the browser refuses storage, the portfolio works from its address alone', async ({ app, page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Storage is disabled', 'SecurityError');
      },
    }),
  );
  await app.open();
  await phase(page, 'P1');
  expect(await studiesShown(page)).toBe('4');
  await reopen(page, app);
  expect(await studiesShown(page), 'nothing kept').toBe('12');
  await page.goto('about:blank');
  await app.open('#filter.phase=P2');
  expect(await studiesShown(page), 'the address still works').toBe('7');
  await page.goto('about:blank');
  await app.openStudy('STUDY001', undefined, `#hide=${hiddenMetric}`);
  await expect(page.locator('.card[data-card="kri0005"]')).toHaveCount(0);
});

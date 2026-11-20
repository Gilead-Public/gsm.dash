// @ts-check
// #22: the study filter, the header's filter bar and Reset. Reset returns the page and its address to a fresh load
// under the configured defaults (#16); the study filter is kept in the address like the other filters.
import { expect, readData, test } from './fixtures/app.js';
import { capturePortfolio } from './fixtures/baseline.js';
import { chooseView, control } from './fixtures/controls.js';
import { visibleLines } from './fixtures/visible.js';
/** @typedef {import('@playwright/test').Page} Page */

test.describe.configure({ timeout: 90_000 });

/** @type {Array<{ StudyID: string, params: Record<string, string> }>} */
const studies = readData('portfolio.json').studies;
const study = 'STUDY004';
const hidden = 'Analysis_kri0005';
const CONFIG = { groupBy: 'phase', heatmap: 'rate', show: ['den', 'trend'], metrics: ['Analysis_kri0003', 'Analysis_kri0004'] };
/** Every setting the address holds, besides one `filter.<param>` per filter the Controls panel offers. */
const VIEW_KEYS = ['cell', 'dir', 'expand', 'group', 'heatmap', 'hide', 'show', 'sort', 'statuses', 'view'];


/** @param {Page} page */
const hashKeys = (page) => [...new Set(new URLSearchParams(new URL(page.url()).hash.slice(1)).keys())].sort();

/**
 * Moves every setting the address holds away from both the built-in and the configured defaults, through the controls.
 * @param {Page} page
 */
async function changeEverySetting(page) {
  await control(page, 'button[data-filter="therapeutic_area"][data-value="Cardiology"]').click();
  await control(page, 'button[data-filter="phase"][data-value="P2"]').click();
  for (const status of ['Active', 'Enrolling']) await control(page, `button[data-filter="status"][data-value="${status}"]`).click();
  await control(page, `input[data-filter="study"][data-value="${study}"]`).check();
  await control(page, 'button[data-status="Planned"]').click();
  await control(page, `input[data-metric="${hidden}"]`).uncheck();
  await control(page, 'select[data-groupby]').selectOption('therapeutic_area');
  await chooseView(page, 'details');
  await page.locator('tr[data-bucket="Cardiology"] td.grp').click();
  await page.locator('th[data-sort="Analysis_kri0008"]').click();
  await control(page, 'button[data-seg="cellMode"][data-value="custom"]').click();
  await control(page, 'button[data-show="den"]').click();
  await control(page, 'button[data-show="num"]').click();
  await control(page, 'select[data-heatmap]').selectOption('num');
}

/** @param {Page} page */
async function settled(page) {
  await page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());
  await page.mouse.move(0, 0);
}

for (const [configuration, config] of /** @type {const} */ ([['the default configuration', null], ['a non-default configuration', CONFIG]])) {
  test(`22.02: after every setting the address holds is changed, Reset leaves the address and the page equal to a fresh load, under ${configuration} (#22)`, async ({ app, page }) => {
    const overrides = config ? { document: (/** @type {any} */ doc) => void (doc.config = config) } : undefined;
    await app.openReport('portfolio', overrides);
    await page.locator('#app > .layout').waitFor();
    await settled(page);
    const freshUrl = page.url();
    const fresh = await capturePortfolio(page, 'fresh load');

    await changeEverySetting(page);
    const filters = await control(page, '[data-filter]').locator.evaluateAll((els) => els.map((e) => `filter.${e.getAttribute('data-filter')}`));
    expect([...new Set(filters)].sort(), 'the filters the Controls panel offers').toEqual(['filter.phase', 'filter.status', 'filter.study', 'filter.therapeutic_area']);
    expect(hashKeys(page), 'every setting moved from its default').toEqual([...VIEW_KEYS, ...new Set(filters)].sort());

    // Reset leaves Filters and Config as they were: their open state isn't part of the view (Scope).
    const host = page.locator('#header-controls');
    const opened = () => host.locator('[data-open="filters"], [data-open="config"]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-open'), e.getAttribute('aria-expanded')]));
    if ((await host.locator('[data-open="filters"]').getAttribute('aria-expanded')) !== 'true') await host.locator('[data-open="filters"]').click();
    await host.locator('[data-open="config"]').click();
    expect(await opened(), 'before Reset').toEqual([['filters', 'true'], ['config', 'true']]);
    await host.locator('[data-reset]').click();
    expect(await opened(), 'Reset leaves Filters and Config open').toEqual([['filters', 'true'], ['config', 'true']]);
    await expect(host.locator('.filter-bar'), 'the filter bar, after Reset').toBeVisible();
    await expect(host.locator('[data-pop="config"]'), 'Config, after Reset').toBeVisible();
    await settled(page);
    expect(page.url(), 'the address').toBe(freshUrl);
    expect((await capturePortfolio(page, 'fresh load')).text, 'the page, with the Controls panel').toBe(fresh.text);
  });
}

test('22.03: the study filter, with studies selected, and the Reset control, for visual comparison with this issue\'s Scope (#22)', async ({ app, page }) => {
  await app.open();
  for (const id of [study, 'STUDY008']) await control(page, `input[data-filter="study"][data-value="${id}"]`).check();
  const options = control(page, 'input[data-filter="study"]').locator;
  await expect(options).toHaveCount(studies.length);
  await expect(control(page, '[data-reset]').locator).toBeVisible();
  await page.locator('#header-controls [data-open="filter:study"]').click();
  await expect(options.first()).toBeVisible();
  await settled(page);
});

test('22.04: a study-filter selection survives a reload and a study link with its back link, and Clear filters clears it with the other filters (#22)', async ({ app, page }) => {
  await app.open();
  for (const id of [study, 'STUDY008']) await control(page, `input[data-filter="study"][data-value="${id}"]`).check();
  await control(page, 'button[data-filter="phase"][data-value="P2"]').click();
  const kept = studies.filter((s) => [study, 'STUDY008'].includes(s.StudyID) && s.params.phase === 'P2').map((s) => s.StudyID);
  expect(kept, 'the selection and the phase filter keep the linked study').toContain(study);
  await expect(page.locator('.portfolio-table tr.study')).toHaveCount(kept.length);
  await settled(page);
  const left = page.url();
  expect(new URLSearchParams(new URL(left).hash.slice(1)).getAll('filter.study').sort()).toEqual([study, 'STUDY008'].sort());
  const before = await capturePortfolio(page, 'filtered');

  await page.reload();
  await page.locator('#app > .layout').waitFor();
  await settled(page);
  expect(page.url(), 'reload').toBe(left);
  expect((await capturePortfolio(page, 'filtered')).text, 'reload').toBe(before.text);

  await page.locator(`#app .portfolio-table a[data-study="${study}"]`).click();
  await page.locator(`#app > [data-study="${study}"] .tile`).first().waitFor();
  await page.locator('#app a.back').click();
  await page.locator('#app > .layout').waitFor();
  await settled(page);
  expect(page.url(), 'back link').toBe(left);
  expect((await capturePortfolio(page, 'filtered')).text, 'back link').toBe(before.text);

  await control(page, '[data-clear]').click();
  await expect(control(page, 'input[data-filter="study"]:checked, button[data-filter].on').locator).toHaveCount(0);
  await expect(page.locator('.portfolio-table tr.study')).toHaveCount(studies.length);
  expect(hashKeys(page).filter((k) => k.startsWith('filter.')), 'no filter left in the address').toEqual([]);
});

test('22.05: the filters are collapsed on load, after a reload and after a study report\'s back link; Filters shows the number of active filters; opened, a chip per filter, the study filter first, opens its choices and shows how many are selected (#22)', async ({ app, page }) => {
  await app.open();
  const host = page.locator('#header-controls');
  const filters = host.locator('[data-open="filters"]');
  const bar = host.locator('.filter-bar');
  /** @param {string} what @param {string} count */
  const collapsed = async (what, count) => {
    await expect(filters, what).toHaveAttribute('aria-expanded', 'false');
    await expect(bar, what).toBeHidden();
    expect(await visibleLines(filters), `${what}: the Filters button`).toEqual(count ? ['Filters', count] : ['Filters']);
  };
  await collapsed('on load', '');

  await filters.click();
  await expect(bar).toBeVisible();
  const chips = bar.locator('[data-open^="filter:"]');
  expect(await chips.evaluateAll((els) => els.map((e) => e.getAttribute('data-open'))), 'the chips, in order').toEqual(['filter:study', 'filter:therapeutic_area', 'filter:phase', 'filter:status']);
  expect(await Promise.all((await chips.all()).map((c) => visibleLines(c).then((l) => l.join(' ')))), 'their labels').toEqual(['Study', 'Therapeutic area', 'Phase', 'Status']);
  /** What each filter's choices read, from the data: a study's ID and nickname, or the value. @type {Record<string, string[]>} */
  const labels = {
    study: studies.map((s) => `${s.StudyID} ${s.params.nickname}`),
    therapeutic_area: [...new Set(studies.map((s) => s.params.therapeutic_area))],
    phase: [...new Set(studies.map((s) => s.params.phase))],
    status: [...new Set(studies.map((s) => s.params.status))],
  };
  for (const [param, want] of Object.entries(labels)) {
    await bar.locator(`[data-open="filter:${param}"]`).click();
    const pop = host.locator(`[data-pop="filter:${param}"]`);
    await expect(pop, param).toBeVisible();
    const choices = await pop.locator(param === 'study' ? 'label.study-opt' : 'button[data-filter]').all();
    const read = await Promise.all(choices.map((c) => visibleLines(c).then((l) => l.join(' '))));
    expect(read.sort(), `${param}: every choice, readable`).toEqual([...want].sort());
    await page.keyboard.press('Escape');
    await expect(pop, `${param}: closed by Escape`).toBeHidden();
  }

  const [a, b] = studies;
  await control(page, `input[data-filter="study"][data-value="${a.StudyID}"]`).check();
  await control(page, `input[data-filter="study"][data-value="${b.StudyID}"]`).check();
  await control(page, `button[data-filter="phase"][data-value="${a.params.phase}"]`).click();
  const chip = (/** @type {string} */ param) => visibleLines(bar.locator(`[data-open="filter:${param}"]`));
  expect(await chip('study'), 'the study chip').toEqual(['Study', '2']);
  expect(await chip('phase'), 'the phase chip').toEqual(['Phase', '1']);
  expect(await chip('status'), 'the status chip').toEqual(['Status']);
  expect(await visibleLines(filters), 'the Filters button').toEqual(['Filters', '3']);

  await page.reload();
  await page.locator('#app > .layout').waitFor();
  await collapsed('after a reload', '3');
  await page.locator(`#app .portfolio-table a[data-study="${a.StudyID}"]`).first().click();
  await page.locator(`#app > [data-study="${a.StudyID}"] .tile`).first().waitFor();
  await page.locator('#app a.back').click();
  await page.locator('#app > .layout').waitFor();
  await collapsed('after the back link', '3');
});

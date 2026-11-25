// @ts-check
// #16: the portfolio's defaults come from the configuration in its data document. The hash overrides them, and the
// view survives a reload and the trip to a study report and back under any configuration.
import { expect, readData, test } from './fixtures/app.js';
import { canonicalDom, capturePortfolio } from './fixtures/baseline.js';
import { chooseHeatmap, chooseView, closeControls, control } from './fixtures/controls.js';
import { visibleLines } from './fixtures/visible.js';
import { shownMetrics } from '../test/qual/pooling.js';
import { cardMetrics, withCards } from './fixtures/tiles.js';
/** @typedef {import('@playwright/test').Page} Page */

test.describe.configure({ timeout: 120_000 });

const portfolio = readData('portfolio.json');
/** @type {Array<{ MetricID: string, GroupLevel: string, Active?: boolean, Abbreviation: string }>} */
const catalog = portfolio.metrics;
/** @type {Array<{ StudyID: string, params: Record<string, string> }>} */
const studies = portfolio.studies;
const eligible = catalog.filter((m) => m.Active !== false && m.GroupLevel === 'Site').map((m) => m.MetricID);
// The example data's configuration (its metric groups), with every other key moved from its built-in default.
const CONFIG = { ...readData('config.json'), groupBy: 'phase', heatmap: 'rate', show: ['den', 'trend'], metrics: ['Analysis_kri0003', 'Analysis_kri0004'], view: 'custom' };
const study = 'STUDY004';
const studyParams = /** @type {{ params: Record<string, string> }} */ (studies.find((s) => s.StudyID === study)).params;

/** @param {unknown} config */
const configured = (config) => ({ document: (/** @type {any} */ doc) => void (doc.config = config), beside: [study] });


/**
 * The table's markup in the baseline's canonical form, which writes each study link without the hash it carries.
 * @param {Page} page
 */
const tableMarkup = (page) => page.locator('.portfolio-table table.po').evaluate(canonicalDom);

/** @param {Page} page */
async function controls(page) {
  return {
    view: await control(page, 'button[data-display][aria-pressed="true"]').getAttribute('data-display'),
    groupBy: await control(page, 'select[data-groupby]').inputValue(),
    // The heatmap's control shows under Custom only (#47).
    heatmap: (await control(page, 'select[data-heatmap]').locator.count()) ? await control(page, 'select[data-heatmap]').inputValue() : null,
    hidden: (await control(page, 'input[data-metric]:not(:checked)').locator.evaluateAll((els) => els.map((e) => e.getAttribute('data-metric')))).sort(),
    shown: (await control(page, 'input[data-metric]:checked').locator.evaluateAll((els) => els.map((e) => e.getAttribute('data-metric')))).sort(),
  };
}

/**
 * The table under each Cell display (#47), ending in Custom.
 * @param {Page} page
 */
async function allViews(page) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const view of /** @type {const} */ (['compact', 'detailed', 'custom'])) {
    await chooseView(page, view);
    await page.mouse.move(0, 0);
    out[view] = await tableMarkup(page);
  }
  return out;
}

/**
 * The Show in each cell chips, which Config shows under Custom only (#47).
 * @param {Page} page
 */
async function customChips(page) {
  const chips = await control(page, 'button[data-show]').locator.evaluateAll((els) => els.map((e) => [e.getAttribute('data-show'), e.getAttribute('aria-pressed')]));
  return Object.fromEntries(chips);
}

test('16.01: with every setting configured away from its built-in default, the portfolio opens on the configured view (#16)', async ({ app, page }) => {
  // The same view reached through the controls, under the example data's own configuration.
  await app.openReport('portfolio');
  await control(page, 'select[data-groupby]').selectOption('phase');
  await chooseHeatmap(page, 'rate');
  for (const part of ['num', 'rate', 'den', 'trend']) await control(page, `button[data-show="${part}"]`).click();
  for (const id of CONFIG.metrics) await control(page, `input[data-metric="${id}"]`).uncheck();
  const reference = await allViews(page);

  await app.openReport('portfolio', configured(CONFIG));
  const shown = await controls(page);
  expect([shown.view, shown.groupBy, shown.heatmap]).toEqual(['custom', 'phase', 'rate']);
  await page.mouse.move(0, 0);
  expect(await tableMarkup(page), 'the table opens in Custom').toEqual(reference.custom);
  expect(shown.hidden).toEqual([...CONFIG.metrics].sort());
  expect(shown.shown).toEqual(eligible.filter((id) => !CONFIG.metrics.includes(id)).sort());
  expect(await customChips(page)).toEqual({ num: 'false', den: 'true', rate: 'false', trend: 'true' });
  expect(await allViews(page), 'the table equals the same view set through the controls, under each Cell display').toEqual(reference);

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
  expect(await table.locator('td[class*="hot"]').count(), 'cells shaded by rate').toBeGreaterThan(0);
  await chooseView(page, 'compact');
  const columns = await table.locator('thead th.bandh .tlab').allTextContents();
  const abbr = (/** @type {string} */ id) => catalog.find((m) => m.MetricID === id)?.Abbreviation;
  expect(columns.map((c) => c.trim()).sort(), 'every eligible metric but the hidden ones').toEqual(
    eligible.filter((id) => !CONFIG.metrics.includes(id)).map(abbr).sort(),
  );
});

/**
 * Settings away from the configuration, through the controls. The configuration opens in Custom, where the heatmap and
 * the cell contents are set; each change ends on the Cell display it is checked under.
 * @type {Record<string, (page: Page) => Promise<void>>}
 */
const CHANGES = {
  'as configured': async () => {},
  'changed to other values': async (page) => {
    await control(page, 'select[data-groupby]').selectOption('status');
    await chooseHeatmap(page, 'num');
    for (const part of ['den', 'num']) await control(page, `button[data-show="${part}"]`).click();
    await control(page, 'input[data-metric="Analysis_kri0003"]').check();
    await control(page, 'input[data-metric="Analysis_kri0005"]').uncheck();
    await chooseView(page, 'detailed');
  },
  'changed back to the built-in defaults': async (page) => {
    await control(page, 'select[data-groupby]').selectOption('none');
    await chooseHeatmap(page, 'none');
    for (const part of ['den', 'trend', 'num', 'rate']) await control(page, `button[data-show="${part}"]`).click();
    for (const id of CONFIG.metrics) await control(page, `input[data-metric="${id}"]`).check();
    await chooseView(page, 'compact');
  },
};
/** @type {Record<string, string>} */
const LEFT_IN = { 'as configured': 'custom', 'changed to other values': 'detailed', 'changed back to the built-in defaults': 'compact' };

test('16.03: under a configuration, the portfolio comes back as it was left after a reload and after a study report and its back link, and the study report shows exactly the metrics the portfolio showed (#16)', async ({ app, page }) => {
  for (const [what, change] of Object.entries(CHANGES)) {
    await app.openReport('portfolio', configured(CONFIG));
    // Each change starts from the configured defaults, not from the view the last one left saved in the browser.
    await control(page, '[data-reset]').click();
    await change(page);
    const groupBy = await control(page, 'select[data-groupby]').inputValue();
    // Groups open by default (#47): close one other than the study's, so the study's link stays in view.
    const other = groupBy === 'none' ? null : studies.map((s) => s.params[groupBy]).find((v) => v !== studyParams[groupBy]);
    if (other) await page.locator(`tr[data-bucket="${other}"] td.grp`).click();
    await page.mouse.move(0, 0);
    const left = page.url();
    const before = await capturePortfolio(page, 'before leaving');
    const { shown, view } = await controls(page);
    expect(view, `${what}: the view`).toBe(LEFT_IN[what]);
    if (what === 'changed back to the built-in defaults') expect(shown, `${what}: every metric shown`).toEqual([...eligible].sort());
    else expect(shown.length, what).toBeLessThan(eligible.length);

    await page.reload();
    await page.locator('#app > .layout').waitFor();
    await page.mouse.move(0, 0);
    expect(page.url(), `${what}: reload`).toBe(left);
    expect((await controls(page)).view, `${what}: reload`).toBe(view);
    expect((await capturePortfolio(page, 'before leaving')).text, `${what}: reload`).toBe(before.text);

    await page.locator(`#app .portfolio-table a[data-study="${study}"]`).first().click();
    await page.locator(`#app > [data-study="${study}"] .card`).first().waitFor();
    expect(await cardMetrics(page), `${what}: the study report's metrics`).toEqual(withCards(shown, catalog));

    await page.locator('#app a.back').click();
    await page.locator('#app > .layout').waitFor();
    await page.mouse.move(0, 0);
    expect(page.url(), `${what}: back link`).toBe(left);
    expect((await controls(page)).view, `${what}: back link`).toBe(view);
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

/**
 * The table's bands as a user reads them (Overview): each band's visible name and its metrics' visible labels.
 * @param {Page} page
 */
async function bandsSeen(page) {
  const bands = [];
  for (const th of await page.locator('.portfolio-table thead th.bandh[data-band]').all()) {
    const [name] = await visibleLines(th);
    const labels = await Promise.all((await th.locator('.tlab').all()).map((t) => visibleLines(t).then((l) => l.join(' '))));
    bands.push([name, labels]);
  }
  return bands;
}

/**
 * What the page shows of the groups, as a user reads them: the bands, Config's group checkboxes (with whether each is
 * ticked) and Config's metric list by group.
 * @param {Page} page
 */
async function groupsShown(page) {
  const bands = await bandsSeen(page);
  const host = page.locator('#header-controls');
  await host.locator('[data-open="config"]').click();
  const checkboxes = await host.locator('input[data-group]').evaluateAll((els) => els.map((i) => [i.getAttribute('data-group'), String(/** @type {HTMLInputElement} */ (i).checked)]));
  const list = [];
  for (const g of await host.locator('.metric-list .mgroup').all()) {
    const [name] = await visibleLines(g.locator('.mgroup-head'));
    list.push([name, await g.locator('input[data-metric]').evaluateAll((els) => els.map((i) => i.getAttribute('data-metric')))]);
  }
  await closeControls(page);
  return { bands, checkboxes, list };
}

test('16.05: the table\'s bands and Config\'s group checkboxes and metric list follow the configured groups, a group configured hidden starts hidden, unlisted metrics trail in Other, and without groups, or with an empty list, every metric is in one band, Metrics, with no group checkboxes, and a single group holding every metric is one band under its name, shown even if configured hidden (#16)', async ({ app, page }) => {
  /** @type {any[]} */
  const shown = shownMetrics(portfolio.metrics);
  const abbr = (/** @type {string} */ id) => /** @type {any} */ (catalog.find((m) => m.MetricID === id)).Abbreviation;
  const [a, b, c, d, e] = [shown[6].MetricID, shown[1].MetricID, shown[12].MetricID, shown[3].MetricID, shown[0].MetricID];
  const groups = [{ name: 'Safety first', metrics: [a, b] }, { name: 'Parked', metrics: [c, d], hidden: true }, { name: 'Lone', metrics: [e] }];
  const rest = shown.map((m) => m.MetricID).filter((id) => ![a, b, c, d, e].includes(id));

  const all = shown.map((m) => m.MetricID);
  for (const [label, config] of /** @type {Array<[string, object]>} */ ([['without groups', {}], ['with an empty list', { groups: [] }]])) {
    await app.openReport('portfolio', configured(config));
    expect(await groupsShown(page), label).toEqual({ bands: [['Metrics', all.map(abbr)]], checkboxes: [], list: [['Metrics', all]] });
  }
  await app.openReport('portfolio', configured({ groups: [{ name: 'All of them', metrics: all, hidden: true }] }));
  expect(await groupsShown(page), 'a single group holding every metric, configured hidden').toEqual({ bands: [['All of them', all.map(abbr)]], checkboxes: [], list: [['All of them', all]] });

  await app.openReport('portfolio', configured({ groups }));
  expect(await groupsShown(page)).toEqual({
    bands: [['Safety first', [a, b].map(abbr)], ['Lone', [e].map(abbr)], ['Other', rest.map(abbr)]],
    checkboxes: [['Safety first', 'true'], ['Parked', 'false'], ['Lone', 'true'], ['Other', 'true']],
    list: [['Safety first', [a, b]], ['Parked', [c, d]], ['Lone', [e]], ['Other', rest]],
  });
});

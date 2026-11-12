// @ts-check
// #13: each metric's detailed-report link comes from configuration (a path in the catalog, a base in the manifest),
// relative paths resolve against the base, and a metric without a link shows none. Links are read as the browser
// resolved them (the anchor's href property) and compared with expected URLs written out here.
import { expect, readData, test } from './fixtures/app.js';
import { shownMetrics } from '../test/qual/pooling.js';
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('./fixtures/app.js').App} App */
/** @typedef {{ MetricID: string, Widget?: string, Widgets?: string[], ReportLink?: string }} Meta */

const portfolio = readData('portfolio.json');
const study = portfolio.studies[0];
/** @type {Meta[]} */
const tiles = shownMetrics(portfolio.metrics);
const example = /** @type {Meta} */ (tiles.find((m) => m.ReportLink));
const [first, second, third] = tiles.filter((m) => !m.Widget && !m.Widgets && !m.ReportLink);
const BASE = 'https://reports.example.org/cod/study-reports/';
const VIEWS = ['default', 'overview', 'scalar-tile', 'scatter-mini', 'bar-numerator', 'trend-mini'];

/**
 * Opens the study with a report base and paths for three metrics, as configuration would set them.
 * @param {App} app
 * @param {string | undefined} base
 * @param {Record<string, string>} paths MetricID -> ReportLink
 */
async function openWithLinks(app, base, paths) {
  await app.openStudy(study.StudyID, {
    portfolio: (p) => {
      if (base === undefined) delete p.reportBase;
      else p.reportBase = base;
      for (const m of p.metrics) if (m.MetricID in paths) m.ReportLink = paths[m.MetricID];
    },
  });
}

/**
 * Every tile's report links, as the browser resolved them, with whether each is visible.
 * @param {Page} page
 * @returns {Promise<Record<string, string[]>>}
 */
const links = (page) =>
  page.locator('.tile[data-metric-id]').evaluateAll((els) =>
    Object.fromEntries(
      els.map((t) => [
        t.getAttribute('data-metric-id'),
        [...t.querySelectorAll('a.report-link')].map((a) => {
          const r = a.getBoundingClientRect();
          const visible = a.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && r.width > 0 && r.height > 0;
          return `${/** @type {HTMLAnchorElement} */ (a).href} | ${a.textContent?.trim()} | ${a.getAttribute('target')}${visible ? '' : ' | hidden'}`;
        }),
      ]),
    ),
  );

/**
 * The expected links: one visible "Detailed report" link per configured metric, none elsewhere.
 * @param {Record<string, string>} hrefs MetricID -> expected URL
 */
const expected = (hrefs) => Object.fromEntries(tiles.map((m) => [m.MetricID, m.MetricID in hrefs ? [`${hrefs[m.MetricID]} | Detailed report ↗ | _blank`] : []]));

/**
 * Checks the links in every view the all-tiles menu offers, and the default.
 * @param {Page} page
 * @param {Record<string, string>} hrefs
 */
async function expectLinksInEveryView(page, hrefs) {
  for (const view of VIEWS) {
    await page.locator('select[data-all-views]').selectOption(view);
    await expect.poll(() => links(page), view).toEqual(expected(hrefs));
  }
}

/**
 * Pages DTH90's tile to its report-link view and returns that view's anchor.
 * @param {Page} page
 */
async function reportLinkView(page) {
  const own = page.locator(`.tile[data-metric-id="${example.MetricID}"]`);
  for (let i = 0; i < 12 && !(await own.locator('.view-name').textContent())?.trim().startsWith('Report link'); i++) {
    await own.locator('button[data-view-step="1"]').click();
  }
  await expect(own.locator('.view-name')).toHaveText(/^Report link /);
  return own.locator('a.more');
}

test.describe('detailed-report links', () => {
  test('13.01: each configured metric shows a link to its own report in every view, and its report-link view links there too (#13)', async ({ app, page }) => {
    await openWithLinks(app, BASE, { [first.MetricID]: 'first/index.html', [second.MetricID]: 'second.html' });
    const hrefs = {
      [example.MetricID]: /** @type {string} */ (example.ReportLink),
      [first.MetricID]: 'https://reports.example.org/cod/study-reports/first/index.html',
      [second.MetricID]: 'https://reports.example.org/cod/study-reports/second.html',
    };
    await expectLinksInEveryView(page, hrefs);
    const more = await reportLinkView(page);
    await expect(more).toBeVisible();
    expect(await more.evaluate((a) => /** @type {HTMLAnchorElement} */ (a).href)).toBe(example.ReportLink);
  });

  test('13.02: relative paths resolve against a configured base with a path prefix, including a path that climbs out of it, in the footers and the report-link view (#13)', async ({ app, page }) => {
    await openWithLinks(app, BASE, {
      [example.MetricID]: 'mortality/index.html',
      [first.MetricID]: 'first/index.html',
      [second.MetricID]: './second.html',
      [third.MetricID]: '../shared/third.html',
    });
    await expectLinksInEveryView(page, {
      [example.MetricID]: 'https://reports.example.org/cod/study-reports/mortality/index.html',
      [first.MetricID]: 'https://reports.example.org/cod/study-reports/first/index.html',
      [second.MetricID]: 'https://reports.example.org/cod/study-reports/second.html',
      [third.MetricID]: 'https://reports.example.org/cod/shared/third.html',
    });
    const more = await reportLinkView(page);
    await expect(more).toBeVisible();
    expect(await more.evaluate((a) => /** @type {HTMLAnchorElement} */ (a).href)).toBe('https://reports.example.org/cod/study-reports/mortality/index.html');
  });

  test('13.02: a relative base resolves against wherever the page is hosted (#13)', async ({ app, page }) => {
    await openWithLinks(app, '../reports/', { [first.MetricID]: 'first.html', [second.MetricID]: 'nested/second.html' });
    const dir = page.url().replace(/[?#].*$/, '').replace(/[^/]*$/, '');
    const parent = dir.replace(/[^/]+\/$/, '');
    expect(parent.length, 'the page sits in a folder with a parent').toBeLessThan(dir.length);
    await expectLinksInEveryView(page, {
      [example.MetricID]: /** @type {string} */ (example.ReportLink),
      [first.MetricID]: `${parent}reports/first.html`,
      [second.MetricID]: `${parent}reports/nested/second.html`,
    });
  });

  test('13.02: without a configured base, paths resolve against the page (#13)', async ({ app, page }) => {
    await openWithLinks(app, undefined, { [first.MetricID]: 'first.html' });
    const here = page.url().replace(/[?#].*$/, '').replace(/[^/]*$/, '');
    await expect.poll(() => links(page)).toEqual(expected({ [example.MetricID]: /** @type {string} */ (example.ReportLink), [first.MetricID]: `${here}first.html` }));
  });

  test('13.03: a metric without a configured link shows no link in any view, while a configured neighbour still does (#13)', async ({ app, page }) => {
    await app.openStudy(study.StudyID);
    await expectLinksInEveryView(page, { [example.MetricID]: /** @type {string} */ (example.ReportLink) });
    const unconfigured = tiles.filter((m) => m.MetricID !== example.MetricID);
    const anchors = await page
      .locator('.tile[data-metric-id]')
      .evaluateAll((els, ids) => els.filter((t) => ids.includes(t.getAttribute('data-metric-id') ?? '')).flatMap((t) => [...t.querySelectorAll('a[href]')].map((a) => a.outerHTML)), unconfigured.map((m) => m.MetricID));
    expect(anchors, 'no anchor of any kind in an unconfigured tile').toEqual([]);
    await expect(page.locator('.config-notice')).toHaveCount(0);
  });
});

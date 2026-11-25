// @ts-check
// #13: each metric's detailed-report link comes from configuration (a path in the catalog, a base in the manifest),
// relative paths resolve against the base, and a metric without a link shows none. Links are read as the browser
// resolved them (the anchor's href property) and compared with expected URLs written out here.
import { expect, readData, test } from './fixtures/app.js';
import { TRACKER_CARDS } from './fixtures/tiles.js';
import { shownMetrics } from '../test/qual/pooling.js';
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('./fixtures/app.js').App} App */
/** @typedef {{ MetricID: string, ID: string, Widget?: string, ReportLink?: string }} Meta */

const portfolio = readData('portfolio.json');
const study = portfolio.studies[0];
/** @type {Meta[]} */
const shown = /** @type {Meta[]} */ (/** @type {unknown} */ (shownMetrics(portfolio.metrics)));
/** @param {string} id */
const metricOf = (id) => /** @type {Meta} */ (shown.find((m) => m.ID === id));
const example = /** @type {Meta} */ (shown.find((m) => m.ReportLink));
// Three metrics with a card each and no link of their own: standard KRIs.
const [first, second, third] = TRACKER_CARDS.filter((c) => c.kind === 'kri').map((c) => metricOf(c.metric));
const BASE = 'https://reports.example.org/cod/study-reports/';

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
 * Every card's report links, as the browser resolved them, with whether each is visible.
 * @param {Page} page
 * @returns {Promise<Record<string, string[]>>}
 */
const links = (page) =>
  page.locator('.card').evaluateAll((els) =>
    Object.fromEntries(
      els.map((t) => [
        t.getAttribute('data-card'),
        [...t.querySelectorAll('a.report-link')].map((a) => {
          const r = a.getBoundingClientRect();
          const visible = a.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && r.width > 0 && r.height > 0;
          return `${/** @type {HTMLAnchorElement} */ (a).href} | ${a.textContent?.trim()} | ${a.getAttribute('target')}${visible ? '' : ' | hidden'}`;
        }),
      ]),
    ),
  );

/**
 * The expected links: one visible "Detailed report" link on each card of a configured metric, none elsewhere.
 * @param {Record<string, string>} hrefs MetricID -> expected URL
 */
const expected = (hrefs) =>
  Object.fromEntries(
    TRACKER_CARDS.map((c) => {
      const id = metricOf(c.metric).MetricID;
      return [c.id, id in hrefs ? [`${hrefs[id]} | Detailed report ↗ | _blank`] : []];
    }),
  );

/**
 * @param {Page} page
 * @param {Record<string, string>} hrefs
 */
const expectLinks = (page, hrefs) => expect.poll(() => links(page)).toEqual(expected(hrefs));

test.describe('detailed-report links', () => {
  test('13.01: each card of a configured metric shows a link to its own report (#13)', async ({ app, page }) => {
    await openWithLinks(app, BASE, { [first.MetricID]: 'first/index.html', [second.MetricID]: 'second.html' });
    const hrefs = {
      [example.MetricID]: /** @type {string} */ (example.ReportLink),
      [first.MetricID]: 'https://reports.example.org/cod/study-reports/first/index.html',
      [second.MetricID]: 'https://reports.example.org/cod/study-reports/second.html',
    };
    await expectLinks(page, hrefs);
  });

  test('13.02: relative paths resolve against a configured base with a path prefix, including a path that climbs out of it (#13)', async ({ app, page }) => {
    await openWithLinks(app, BASE, {
      [example.MetricID]: 'mortality/index.html',
      [first.MetricID]: 'first/index.html',
      [second.MetricID]: './second.html',
      [third.MetricID]: '../shared/third.html',
    });
    await expectLinks(page, {
      [example.MetricID]: 'https://reports.example.org/cod/study-reports/mortality/index.html',
      [first.MetricID]: 'https://reports.example.org/cod/study-reports/first/index.html',
      [second.MetricID]: 'https://reports.example.org/cod/study-reports/second.html',
      [third.MetricID]: 'https://reports.example.org/cod/shared/third.html',
    });
  });

  test('13.02: a relative base resolves against wherever the page is hosted (#13)', async ({ app, page }) => {
    await openWithLinks(app, '../reports/', { [first.MetricID]: 'first.html', [second.MetricID]: 'nested/second.html' });
    const dir = page.url().replace(/[?#].*$/, '').replace(/[^/]*$/, '');
    const parent = dir.replace(/[^/]+\/$/, '');
    expect(parent.length, 'the page sits in a folder with a parent').toBeLessThan(dir.length);
    await expectLinks(page, {
      [example.MetricID]: /** @type {string} */ (example.ReportLink),
      [first.MetricID]: `${parent}reports/first.html`,
      [second.MetricID]: `${parent}reports/nested/second.html`,
    });
  });

  test('13.02: without a configured base, paths resolve against the page (#13)', async ({ app, page }) => {
    await openWithLinks(app, undefined, { [first.MetricID]: 'first.html' });
    const here = page.url().replace(/[?#].*$/, '').replace(/[^/]*$/, '');
    await expectLinks(page, { [example.MetricID]: /** @type {string} */ (example.ReportLink), [first.MetricID]: `${here}first.html` });
  });

  test('13.03: a metric without a configured link shows no link on its cards, while a configured neighbour still does (#13)', async ({ app, page }) => {
    await app.openStudy(study.StudyID);
    await expectLinks(page, { [example.MetricID]: /** @type {string} */ (example.ReportLink) });
    const unconfigured = shown.filter((m) => m.MetricID !== example.MetricID);
    const anchors = await page
      .locator('.card[data-metric-id]')
      .evaluateAll((els, ids) => els.filter((t) => ids.includes(t.getAttribute('data-metric-id') ?? '')).flatMap((t) => [...t.querySelectorAll('a[href]')].map((a) => a.outerHTML)), unconfigured.map((m) => m.MetricID));
    expect(anchors, 'no anchor of any kind on an unconfigured card').toEqual([]);
    await expect(page.locator('.config-notice')).toHaveCount(0);
  });
});

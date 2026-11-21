// @ts-check
// #25: study rows' cells and tiles open their metric's detailed report for that study in a new tab. Links are read as
// the browser resolved them (the anchor's href property) and compared with addresses written out here.
import { expect, readData, test } from './fixtures/app.js';
import { expectSeen } from './fixtures/visible.js';
import { capturePortfolio } from './fixtures/baseline.js';
import { shownMetrics } from '../test/qual/pooling.js';
import { chooseView, control } from './fixtures/controls.js';
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').Locator} Locator */
/** @typedef {import('./fixtures/app.js').App} App */

test.describe.configure({ timeout: 90_000 });

const portfolio = readData('portfolio.json');
/** @type {Array<{ StudyID: string, params: Record<string, string> }>} */
const studies = portfolio.studies;
/** @type {Array<{ MetricID: string, Abbreviation: string, ReportLink?: string }>} */
const metrics = portfolio.metrics;
const BASE = 'https://reports.example.org/cod/';
const DTH90 = /** @type {{ MetricID: string }} */ (metrics.find((m) => m.Abbreviation === 'DTH90')).MetricID;

/** The configured links: per study, the same for every study, and three that never link. */
/** @type {Record<string, string>} */
const LINKS = {
  Analysis_kri0007: 'studies/{StudyID}/tdsc.html',
  Analysis_kri0001: 'kri/{StudyID}.html',
  Analysis_ctq0001: 'https://other.example.org/wc.html',
  Analysis_kri0006: 'javascript:alert("{StudyID}")',
  Analysis_ctq0002: 'https://reports.example.org:{StudyID}/ltfu.html',
  Analysis_ctq0003: 'data:text/html,{StudyID}',
  [DTH90]: 'mortality/{StudyID}/index.html',
};

/** @type {Record<string, (id: string) => string>} Each linked metric's address for a study. */
const EXPECTED = {
  Analysis_kri0007: (id) => `https://reports.example.org/cod/studies/${id}/tdsc.html`,
  Analysis_kri0001: (id) => `https://reports.example.org/cod/kri/${id}.html`,
  Analysis_ctq0001: () => 'https://other.example.org/wc.html',
  [DTH90]: (id) => `https://reports.example.org/cod/mortality/${id}/index.html`,
};

/**
 * Serves the linked reports and opens the portfolio with the configured links.
 * @param {App} app
 * @param {Page} page
 */
async function openWithLinks(app, page) {
  await page.context().route(/^https:\/\/(reports|other)\.example\.org\//, (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Detailed report</title>' }));
  await app.open('', { portfolio: configure });
}

/** @param {{ reportBase?: string, metrics: Array<{ MetricID: string, ReportLink?: string }> }} p */
function configure(p) {
  p.reportBase = BASE;
  for (const m of p.metrics) if (m.MetricID in LINKS) m.ReportLink = LINKS[m.MetricID];
}

/**
 * Every metric cell's and tile's link, by row, as `href target rel`, or `-` when it has no anchor. Cells are matched to
 * their column header and tiles to the band label above them.
 * @param {Page} page
 * @returns {Promise<Array<[string, Record<string, string>]>>}
 */
const tableLinks = (page) =>
  page.locator('.portfolio-table table.po').evaluate((table) => {
    const cols = [...table.querySelectorAll('thead tr.cols th[data-sort^="Analysis_"]')].map((th) => th.getAttribute('data-sort'));
    const labels = [...table.querySelectorAll('thead th.closed .tlab')].map((t) => t.getAttribute('data-abbr'));
    /** @param {Element} el */
    const seen = (el) => {
      const r = el.getBoundingClientRect();
      return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && r.width > 0 && r.height > 0;
    };
    /** @param {Element} el */
    const link = (el) => {
      const anchors = [...(el.matches('a') ? [el] : []), ...el.querySelectorAll('a')].map((a) => /** @type {HTMLAnchorElement} */ (a));
      return anchors.length ? anchors.map((a) => `${a.href} ${a.target} ${a.rel}${seen(a) ? '' : ' hidden'}`).join(' + ') : '-';
    };
    return [...table.querySelectorAll('tbody tr')].map((tr) => {
      const row = tr.classList.contains('total') ? 'total' : tr.hasAttribute('data-bucket') ? `group ${tr.getAttribute('data-bucket')}` : `study ${tr.getAttribute('data-hl')}`;
      /** @type {Record<string, string>} */
      const out = {};
      let c = 0;
      let t = 0;
      for (const td of tr.querySelectorAll('td')) {
        if (td.matches('.grp, .pop, .nstud')) continue;
        if (td.matches('.cat')) for (const tile of td.querySelectorAll('.otile')) out[`tile ${labels[t++]}`] = link(tile);
        else out[`cell ${cols[c++]}`] = link(td);
      }
      return /** @type {[string, Record<string, string>]} */ ([row, out]);
    });
  });

/** Every metric eligible for a portfolio column, from the catalog. With none hidden, each has a column and a tile. */
const columns = shownMetrics(metrics);

/**
 * The links a view must have, by row: one per eligible metric, keyed as `tableLinks` keys them. Study rows link each
 * metric with a valid link, and nothing else links.
 * @param {string[]} rows
 * @param {'details' | 'overview'} view
 * @returns {Record<string, Record<string, string>>}
 */
const expectedLinks = (rows, view) =>
  Object.fromEntries(
    rows.map((row) => {
      const study = row.startsWith('study ') ? row.slice(6) : null;
      const cells = columns.map((m) => {
        const href = EXPECTED[m.MetricID];
        return [view === 'details' ? `cell ${m.MetricID}` : `tile ${m.Abbreviation}`, study && href ? `${href(study)} _blank noopener` : '-'];
      });
      return [row, Object.fromEntries(cells)];
    }),
  );

/**
 * Checks that the view has exactly the expected rows, and in each a cell or tile for every eligible metric, linked as
 * expected.
 * @param {Page} page
 * @param {string[]} rows The expected rows, in any order.
 * @param {'details' | 'overview'} view
 * @param {string} what
 */
async function expectTableLinks(page, rows, view, what) {
  const links = await tableLinks(page);
  expect(links.map(([row]) => row).sort(), what).toEqual([...rows].sort());
  expect(Object.fromEntries(links), what).toEqual(expectedLinks(rows, view));
}

/** @param {Page} page @param {'overview' | 'details'} view */
const showView = (page, view) => chooseView(page, view);

/**
 * Follows a link: its report opens in a new tab, and the portfolio's tab keeps its address.
 * @param {Page} page
 * @param {Locator} link
 */
async function follow(page, link) {
  const before = page.url();
  const href = await link.evaluate((a) => /** @type {HTMLAnchorElement} */ (a).href);
  const [popup] = await Promise.all([page.context().waitForEvent('page'), link.click()]);
  await popup.waitForLoadState();
  expect(popup.url(), 'the new tab').toBe(href);
  await popup.close();
  expect(page.url(), "the portfolio's tab").toBe(before);
}

const ids = studies.map((s) => s.StudyID);
const phases = [...new Set(studies.map((s) => s.params.phase))].sort();
const open = phases[0];
const children = studies.filter((s) => s.params.phase === open).map((s) => `study ${s.StudyID}`);
/** The rows ungrouped, and grouped by phase with the first group open. */
const ROWS = {
  none: ['total', ...ids.map((id) => `study ${id}`)],
  phase: ['total', ...phases.flatMap((p) => [`group ${p}`, ...(p === open ? children : [])])],
};

test('25.01: in Details and Overview, ungrouped and with a group open, every study-row cell and tile of a metric with a report link links to its report for that study in a new tab (#25)', async ({ app, page }) => {
  await openWithLinks(app, page);
  for (const view of /** @type {const} */ (['details', 'overview'])) {
    await showView(page, view);
    await expectTableLinks(page, ROWS.none, view, `${view}, ungrouped`);
  }

  await control(page, 'select[data-groupby]').selectOption('phase');
  await page.locator(`tr[data-bucket="${open}"] td.grp`).click();
  for (const view of /** @type {const} */ (['details', 'overview'])) {
    await showView(page, view);
    await expectTableLinks(page, ROWS.phase, view, `${view}, grouped`);
  }

  await showView(page, 'details');
  const child = children[0].slice(6);
  await follow(page, page.locator(`tr.study.child[data-hl="${child}"] a.cell[href$="/tdsc.html"]`));
  await control(page, 'select[data-groupby]').selectOption('none');
  await follow(page, page.locator(`tr.study[data-hl="${ids[1]}"] a.cell[href$="/${ids[1]}.html"]`));
  await showView(page, 'overview');
  await follow(page, page.locator(`tr.study[data-hl="${ids[2]}"] a.otile[href$="/tdsc.html"]`));
  await follow(page, page.locator(`tr.study[data-hl="${ids[2]}"] a.otile[href="https://other.example.org/wc.html"]`));
});

test('25.02: no cell or tile links when its metric has no report link, or its link with the StudyID filled can\'t be resolved or has another scheme; totals and group rows never link (#25)', async ({ app, page }) => {
  await openWithLinks(app, page);
  for (const view of /** @type {const} */ (['details', 'overview'])) {
    await showView(page, view);
    for (const group of /** @type {const} */ (['none', 'phase'])) {
      await control(page, 'select[data-groupby]').selectOption(group);
      if (group === 'phase') await page.locator(`tr[data-bucket="${open}"] td.grp`).click();
      const found = Object.fromEntries(await tableLinks(page));
      for (const [row, cells] of Object.entries(expectedLinks(ROWS[group], view))) {
        for (const [key, value] of Object.entries(cells)) {
          if (value === '-') expect(found[row]?.[key], `${view}, ${group}: ${row}, ${key}`).toBe('-');
        }
      }
      if (group === 'phase') await page.locator(`tr[data-bucket="${open}"] td.grp`).click();
    }
  }
  await expect(page.locator('.portfolio-table a[href^="javascript:"], .portfolio-table a[href^="data:"]')).toHaveCount(0);
});

test('25.03: linked and unlinked cells and tiles in Details and Overview, for visual comparison with this issue\'s Scope (#25)', async ({ app, page, evidence }) => {
  await openWithLinks(app, page);
  /** @param {Locator} link @param {string} label */
  const hover = async (link, label) => {
    const style = (/** @type {Locator} */ el) => el.evaluate((e) => [getComputedStyle(e).color, getComputedStyle(e).textDecorationLine]);
    const unlinked = link.locator('xpath=ancestor::tr').locator(await link.evaluate((a) => (a.matches('.otile') ? 'span.otile:not(.pl)' : 'div.cell')));
    expect(await style(link), `${label}: at rest, like an unlinked value`).toEqual([(await style(unlinked.first()))[0], 'none']);
    await link.hover();
    await expectSeen(link, label);
    expect(await link.evaluate((a) => [getComputedStyle(a).textDecorationLine, getComputedStyle(a).cursor]), label).toEqual(['underline', 'pointer']);
    await evidence.shot(page, label);
  };
  await showView(page, 'details');
  await hover(page.locator(`tr.study[data-hl="${ids[0]}"] a.cell[href$="/tdsc.html"]`), 'details, a linked cell hovered');
  await showView(page, 'overview');
  await hover(page.locator(`tr.study[data-hl="${ids[0]}"] a.otile[href$="/tdsc.html"]`), 'overview, a linked tile hovered');
});

test('25.04: a report link with {StudyID} gives each study its own address in the portfolio\'s cells and tiles and the study report\'s links; one without it gives every study the same (#25)', async ({ app, page }) => {
  await openWithLinks(app, page);
  for (const view of /** @type {const} */ (['details', 'overview'])) {
    await showView(page, view);
    const links = await tableLinks(page);
    /** @param {string} key */
    const column = (key) => links.filter(([row]) => row.startsWith('study ')).map(([row, cells]) => [row.slice(6), cells[key]]);
    const perStudy = view === 'details' ? 'cell Analysis_kri0007' : 'tile TDSC';
    const same = view === 'details' ? 'cell Analysis_ctq0001' : 'tile WC';
    expect(column(perStudy), view).toEqual(ids.map((id) => [id, `https://reports.example.org/cod/studies/${id}/tdsc.html _blank noopener`]));
    expect(column(same), view).toEqual(ids.map((id) => [id, 'https://other.example.org/wc.html _blank noopener']));
  }

  for (const id of [ids[0], ids[5]]) {
    await app.openStudy(id, { portfolio: configure });
    const links = await page
      .locator('.card[data-metric-id]')
      .evaluateAll((els) =>
        Object.fromEntries(
          els
            .map((t) => /** @type {[string, string[]]} */ ([t.getAttribute('data-metric-id'), [...t.querySelectorAll('a.report-link')].map((a) => /** @type {HTMLAnchorElement} */ (a).href)]))
            .filter(([, hrefs]) => hrefs.length),
        ),
      );
    // Only metrics with a card (#32) show a link in a study report; the portfolio above covers the others.
    expect(links, id).toEqual({
      Analysis_kri0001: [`https://reports.example.org/cod/kri/${id}.html`],
      [DTH90]: [`https://reports.example.org/cod/mortality/${id}/index.html`],
    });
    const notice = (await page.locator('.config-notice').allTextContents()).join(' ');
    for (const path of ['tdsc.html', 'kri/', 'wc.html', 'mortality/']) expect(notice, `${id}: a valid link isn't reported`).not.toContain(path);
    expect(notice, `${id}: a link that can't be resolved with this study's ID is reported`).toContain('ltfu.html');
  }
});

test('25.05: clicking a linked cell or tile opens its report and changes nothing else on the page; clicking a study row\'s name cell outside its link, a population cell or an unlinked cell changes nothing (#25)', async ({ app, page }) => {
  await openWithLinks(app, page);
  const row = page.locator(`.portfolio-table tr.study[data-hl="${ids[3]}"]`);
  for (const [view, link] of /** @type {const} */ ([['details', 'a.cell'], ['overview', 'a.otile']])) {
    await showView(page, view);
    await page.mouse.move(0, 0);
    const url = page.url();
    const before = await capturePortfolio(page, 'before');
    /** @param {string} what */
    const unchanged = async (what) => {
      await page.mouse.move(0, 0);
      expect(page.url(), `${view}: ${what}`).toBe(url);
      expect((await capturePortfolio(page, 'before')).text, `${view}: ${what}`).toBe(before.text);
    };
    await follow(page, row.locator(link).first());
    await unchanged(`a linked ${link === 'a.cell' ? 'cell' : 'tile'}`);
    const name = row.locator('td.grp');
    const box = /** @type {{ width: number, height: number }} */ (await name.boundingBox());
    await name.click({ position: { x: box.width - 3, y: box.height / 2 } });
    await unchanged('the name cell outside its link');
    await row.locator('td.pop').first().click();
    await unchanged('a population cell');
    await row.locator('td:not(.grp):not(.pop):not(.status-col):not(:has(a))').first().click();
    await unchanged('an unlinked cell');
  }
});

// @ts-check
// #24: the reports' headers, and the portfolio's status line below its table.
import { expect, readData, test } from './fixtures/app.js';
import { expectSeen, visibleLines } from './fixtures/visible.js';
import { shownMetrics } from '../test/qual/pooling.js';
import { chooseHeatmap, chooseView, control } from './fixtures/controls.js';
/** @typedef {import('@playwright/test').Page} Page */

const portfolio = readData('portfolio.json');
/** @type {Array<{ StudyID: string, params: Record<string, string> }>} */
const studies = portfolio.studies;
const metrics = shownMetrics(portfolio.metrics);


/**
 * What a report's header shows: its visible text, one entry per line, and whether its logo is drawn from data inside the
 * report.
 * @param {Page} page
 */
async function header(page) {
  const head = page.locator('header.app');
  const logo = head.locator('img.logo');
  await expect(logo).toHaveCount(1);
  await expectSeen(logo, 'the logo can be seen');
  return {
    text: await visibleLines(head),
    logo: await logo.evaluate((img) => ({
      alt: img.getAttribute('alt'),
      drawn: /** @type {HTMLImageElement} */ (img).complete && /** @type {HTMLImageElement} */ (img).naturalWidth > 0,
      inline: (img.getAttribute('src') ?? '').startsWith('data:image/png;base64,'),
      height: Math.round(img.getBoundingClientRect().height),
    })),
  };
}

/**
 * Opens a report with its document's title set, or left out when `title` is undefined, and waits for its data.
 * @param {any} app
 * @param {Page} page
 * @param {string} name `portfolio` or a StudyID
 * @param {unknown} [title]
 */
async function openTitled(app, page, name, title) {
  const overrides = title === undefined ? undefined : { document: (/** @type {any} */ doc) => void (doc.title = title) };
  await app.openReport(name, overrides);
}

test('24.02: each report\'s header shows the logo and the document\'s title, or "gsm.dash" without one, with no page tag or metadata line, and the browser tab shows the title, after the StudyID on a study report (#24)', async ({ app, page }) => {
  const logo = { alt: 'gismo', drawn: true, inline: true, height: 32 };
  const study = studies[0].StudyID;
  for (const [title, shown] of /** @type {const} */ ([[undefined, 'gsm.dash'], ['CtQ Dashboard', 'CtQ Dashboard']])) {
    await openTitled(app, page, 'portfolio', title);
    await page.locator('#app > .layout').waitFor();
    expect(await header(page), `portfolio, title ${title}`).toEqual({ text: [shown, 'Filters', 'Config', 'Reset', 'Admin'], logo });
    expect(await page.title(), `portfolio tab, title ${title}`).toBe(shown);
    await openTitled(app, page, study, title);
    await page.locator('#app .tile').first().waitFor();
    expect(await header(page), `study report, title ${title}`).toEqual({ text: [shown, 'Admin'], logo });
    expect(await page.title(), `study tab, title ${title}`).toBe(`${study} · ${shown}`);
  }
  await expect(page.locator('header.app .tag, #page-tag, #meta')).toHaveCount(0);
});

test('24.03: a document with a 60-character title shows it in full, in the portfolio and a study report (#24)', async ({ app, page }) => {
  const title = `CtQ Dashboard · ${'x'.repeat(44)}`;
  expect(title).toHaveLength(60);
  for (const name of ['portfolio', studies[0].StudyID]) {
    await openTitled(app, page, name, title);
    await expect(page.getByRole('alert'), name).toHaveCount(0);
    expect((await header(page)).text[0], name).toBe(title);
  }
});

for (const [what, title] of /** @type {Array<[string, unknown]>} */ ([['an empty title', ''], ['a blank title', '   '], ['a 61-character title', 'a'.repeat(61)], ['a title that is a number', 3]])) {
  test(`24.03: a document with ${what} shows the error state, in the portfolio and a study report (#24)`, async ({ app, page }) => {
    for (const name of ['portfolio', studies[0].StudyID]) {
      await openTitled(app, page, name, title);
      await expect(page.getByRole('alert').getByRole('heading'), name).toHaveText("This report can't be shown");
      await expect(page.getByRole('alert'), name).toContainText('title');
      await expect(page.locator('#app .layout, #app .tile'), name).toHaveCount(0);
    }
  });
}

test('24.01: both reports\' headers and the portfolio\'s status line, for visual comparison with this issue\'s Scope (#24)', async ({ app, page, evidence }) => {
  await app.open();
  await page.mouse.move(0, 0);
  await evidence.shot(page, 'portfolio header');
  await page.locator('.portfolio-table .showing').scrollIntoViewIfNeeded();
  await evidence.shot(page, 'portfolio status line');
  await app.openStudy(studies[0].StudyID);
  await page.mouse.move(0, 0);
  await evidence.shot(page, 'study report header');
});

/**
 * The status line's text as a user sees it, and whether it sits below the table.
 * @param {Page} page
 */
async function statusLine(page) {
  const line = page.locator('.portfolio-table .showing');
  await expect(line).toHaveCount(1);
  const [lineBox, tableBox] = await Promise.all([line.boundingBox(), page.locator('.portfolio-table .tblwrap').boundingBox()]);
  return {
    text: (await visibleLines(line)).join(' '),
    below: Boolean(lineBox && tableBox && lineBox.y >= tableBox.y + tableBox.height),
  };
}

test('24.02: the status line sits below the table and reads the studies and metrics shown, then the sort where set (#24)', async ({ app, page }) => {
  await app.open();
  expect(await statusLine(page)).toEqual({ text: `${studies.length} / ${studies.length} studies · ${metrics.length} / ${metrics.length} metrics`, below: true });

  const phase = studies[0].params.phase;
  const kept = studies.filter((s) => s.params.phase === phase);
  await control(page, `button[data-filter="phase"][data-value="${phase}"]`).click();
  await control(page, `input[data-metric="${metrics[0].MetricID}"]`).uncheck();
  const sortBy = metrics[1];
  await chooseView(page, 'detailed');
  await page.locator(`th[data-sort="${sortBy.MetricID}"]`).click();
  const { text, below } = await statusLine(page);
  expect(below).toBe(true);
  expect(text).toMatch(
    new RegExp(
      `^${kept.length} / ${studies.length} studies · ${metrics.length - 1} / ${metrics.length} metrics · sorted by ${sortBy.Abbreviation} \\S+ [↑↓]$`,
    ),
  );
});

test('24.02: the status line names every active sort and its direction, marking a sort whose column is hidden (#24)', async ({ app, page }) => {
  await app.open();
  await chooseView(page, 'detailed');
  const [shown, other] = metrics;
  /** The sort the status line names, or null. */
  const named = async () => (await statusLine(page)).text.split(' · sorted by ')[1] ?? null;
  /**
   * The arrow the sorted column's header shows, from its aria-sort.
   * @param {string} key
   */
  const arrow = async (key) => ((await page.locator(`th[data-sort="${key}"]`).getAttribute('aria-sort')) === 'ascending' ? '↑' : '↓');
  /**
   * Clicks a column's header and checks the status line against the header's own direction.
   * @param {string} key
   * @param {string} label
   */
  const sortBy = async (key, label) => {
    await page.locator(`th[data-sort="${key}"]`).click();
    const dir = await arrow(key);
    expect(await named(), key).toBe(`${label} ${dir}`);
    return dir;
  };

  expect(await named(), 'unsorted').toBeNull();
  await sortBy('label', 'Study');
  await sortBy('label', 'Study');
  let dir = await sortBy('enroll', 'Enrolled');
  await control(page, 'button[data-column="enroll"]').click();
  expect(await named(), 'Enrolled hidden').toBe(`Enrolled (hidden) ${dir}`);

  await sortBy(shown.MetricID, `${shown.Abbreviation} rate`);
  await chooseHeatmap(page, 'num');
  dir = await arrow(shown.MetricID);
  expect(await named(), 'heatmap Numerator').toBe(`${shown.Abbreviation} numerator ${dir}`);
  await control(page, `input[data-metric="${shown.MetricID}"]`).uncheck();
  expect(await named(), 'metric hidden').toBe(`${shown.Abbreviation} numerator (hidden) ${dir}`);
  await sortBy(other.MetricID, `${other.Abbreviation} numerator`);

  await control(page, 'select[data-groupby]').selectOption('phase');
  await sortBy('label', 'Group');
  dir = await sortBy('meta', 'Studies');
  await control(page, 'select[data-groupby]').selectOption('none');
  expect(await named(), 'ungrouped').toBe(`Studies (hidden) ${dir}`);
});

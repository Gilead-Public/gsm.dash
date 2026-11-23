// @ts-check
// #21: the portfolio table's optional columns (study name, Enrolled, Status), Enrolled against its target, and its View,
// Overview or Details, which replaced the row density. Defaults come from the configuration (#16); choices travel in the
// address and Reset restores them.
import { expect, readData, test } from './fixtures/app.js';
import { chooseView, control } from './fixtures/controls.js';
import { visibleLines } from './fixtures/visible.js';
import { cardMetrics, withCards } from './fixtures/tiles.js';
import { countText, shownMetrics } from '../test/qual/pooling.js';
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').Locator} Locator */

/** @type {Array<{ StudyID: string, params: Record<string, any> }>} */
const studies = readData('portfolio.json').studies;
/** @type {Array<{ StudyID: string, ParticipantCount?: number }>} */
const counted = readData('summary.json').studies;
const enrolled = (/** @type {string} */ id) => /** @type {number} */ (counted.find((s) => s.StudyID === id)?.ParticipantCount);

/** @param {Page} page */
const chip = (page, /** @type {string} */ column) => control(page, `button[data-column="${column}"]`);
const seenText = async (/** @type {Locator} */ el) => (await visibleLines(el)).join(' ');
/** @param {Page} page */
const headers = async (page) =>
  Promise.all((await page.locator('table.po thead tr.cols th.pop, table.po thead th.status-col').all()).map(async (th) => (await seenText(th)).replace(/\s+/g, '')));
/**
 * The text a user sees in a study row's optional columns: its name, its status and its population cells. An absent
 * column is null.
 * @param {Page} page
 * @param {string} id
 */
async function rowParts(page, id) {
  const tr = page.locator(`tbody tr[data-hl="${id}"]`);
  const optional = async (/** @type {Locator} */ el) => ((await el.count()) ? seenText(el) : null);
  return {
    name: await optional(tr.locator('.nick')),
    status: await optional(tr.locator('td.status-col')),
    pop: await Promise.all((await tr.locator('td.pop').all()).map(seenText)),
  };
}

/**
 * How the table shows its categories, read from the table itself: 'folded' (Compact, #47) is every category folded to
 * headline tiles; 'open' (Detailed and Custom) is them all open, with a header per metric. Null when it is neither.
 * @param {Page} page
 */
async function shownView(page) {
  const table = page.locator('table.po');
  const [tiles, closed, open, heads] = await Promise.all(
    ['.otile', 'thead th.bandh.closed', 'thead th.bandh.open', 'thead th[data-sort^="Analysis_"]'].map((s) => table.locator(s).count()),
  );
  if (tiles && closed && !open && !heads) return 'folded';
  if (!tiles && !closed && open && heads) return 'open';
  return null;
}

/** The Cell display pressed in Config (#47). @param {Page} page */
const viewControl = async (page) => control(page, 'button[data-display][aria-pressed="true"]').getAttribute('data-display');

/**
 * Opens the portfolio with its document changed, then waits for the table.
 * @param {any} app
 * @param {Page} page
 * @param {(doc: any) => void} change
 * @param {string} [hash]
 */
async function openWith(app, page, change, hash = '') {
  await app.openReport('portfolio', { document: change }, hash);
  await page.locator('#app > .layout').waitFor();
}

test.describe('table columns and view', () => {
  test('21.01: each optional column toggles, the built-in defaults apply, and the choice survives a reload until Reset (#21)', async ({ app, page }) => {
    await app.open();
    const [first] = studies;
    expect(await headers(page)).toEqual(['Scr.n']);
    for (const [column, pressed] of [['name', 'true'], ['enroll', 'false'], ['status', 'false']]) await expect(chip(page, column).locator).toHaveAttribute('aria-pressed', pressed);
    expect(await rowParts(page, first.StudyID)).toEqual({ name: first.params.nickname, status: null, pop: [expect.any(String)] });

    await chip(page, 'enroll').click();
    await chip(page, 'status').click();
    await chip(page, 'name').click();
    expect(await headers(page)).toEqual(['Status', 'Scr.n', 'Enr.n']);
    for (const s of studies) {
      expect(await rowParts(page, s.StudyID), s.StudyID).toEqual({ name: null, status: s.params.status, pop: [expect.any(String), countText(enrolled(s.StudyID))] });
    }
    await expect(page.locator('tbody tr.total td.status-col')).toHaveText('');

    await page.reload();
    await page.locator('#app > .layout').waitFor();
    expect(await headers(page)).toEqual(['Status', 'Scr.n', 'Enr.n']);
    expect((await rowParts(page, first.StudyID)).name).toBeNull();

    await control(page, '[data-reset]').click();
    expect(await headers(page)).toEqual(['Scr.n']);
    expect((await rowParts(page, first.StudyID)).name).toBe(first.params.nickname);
    expect(new URL(page.url()).hash).toBe('');
  });

  test('21.01: the table is folded under Compact, the default, and open under Detailed and Custom, and the choice survives a reload until Reset (#21)', async ({ app, page }) => {
    await app.open();
    expect([await viewControl(page), await shownView(page)]).toEqual(['compact', 'folded']);
    await chooseView(page, 'detailed');
    expect([await viewControl(page), await shownView(page)]).toEqual(['detailed', 'open']);
    await chooseView(page, 'custom');
    expect([await viewControl(page), await shownView(page)]).toEqual(['custom', 'open']);
    await page.reload();
    await page.locator('#app > .layout').waitFor();
    expect([await viewControl(page), await shownView(page)]).toEqual(['custom', 'open']);
    await control(page, '[data-reset]').click();
    expect([await viewControl(page), await shownView(page)]).toEqual(['compact', 'folded']);
    expect(new URL(page.url()).hash).toBe('');
  });

  test('21.01: configured columns and View are the defaults, and Reset returns to them (#21)', async ({ app, page }) => {
    await openWith(app, page, (doc) => void (doc.config = { columns: ['enroll', 'status'], view: 'detailed' }));
    expect(await headers(page)).toEqual(['Status', 'Scr.n', 'Enr.n']);
    expect((await rowParts(page, studies[0].StudyID)).name).toBeNull();
    expect([await viewControl(page), await shownView(page)]).toEqual(['detailed', 'open']);
    await chip(page, 'status').click();
    await chooseView(page, 'compact');
    expect(await headers(page)).toEqual(['Scr.n', 'Enr.n']);
    expect(await shownView(page)).toBe('folded');
    await control(page, '[data-reset]').click();
    expect(await headers(page)).toEqual(['Status', 'Scr.n', 'Enr.n']);
    expect([await viewControl(page), await shownView(page)]).toEqual(['detailed', 'open']);
  });

  test('21.02: Enrolled reads n / expected for a study with a target, as a number or text, and the count alone otherwise (#21)', async ({ app, page }) => {
    const [a, b, c, d] = studies;
    await openWith(
      app,
      page,
      (doc) => {
        const params = (/** @type {string} */ id) => doc.studies.find((/** @type {any} */ s) => s.StudyID === id).params;
        params(a.StudyID).ParticipantTarget = 1500;
        params(b.StudyID).ParticipantTarget = '2400';
        params(c.StudyID).ParticipantTarget = '0';
        delete params(d.StudyID).ParticipantTarget;
      },
      '#cols=name&cols=enroll',
    );
    const enrolledCell = async (/** @type {string} */ id) => (await rowParts(page, id)).pop[1];
    expect(await enrolledCell(a.StudyID)).toBe(`${countText(enrolled(a.StudyID))} / 1,500`);
    expect(await enrolledCell(b.StudyID)).toBe(`${countText(enrolled(b.StudyID))} / 2,400`);
    expect(await enrolledCell(c.StudyID)).toBe(countText(enrolled(c.StudyID)));
    expect(await enrolledCell(d.StudyID)).toBe(countText(enrolled(d.StudyID)));
    const total = counted.reduce((n, s) => n + (s.ParticipantCount ?? 0), 0);
    expect(await seenText(page.locator('tbody tr.total td.pop').nth(1))).toBe(countText(total));
  });

  test('21.03: the table in Compact and Detailed, and Config with its Cell display, group chips, Column grouping and metric checkboxes, for visual comparison (#21)', async ({ app, page, evidence }) => {
    await app.open();
    expect(await shownView(page)).toBe('folded');
    await evidence.shot(page, 'Compact');
    await chooseView(page, 'detailed');
    expect(await shownView(page)).toBe('open');
    await evidence.shot(page, 'Detailed');
    await page.locator('#header-controls [data-open="config"]').click();
    await expect(page.locator('#header-controls [data-pop="config"]')).toBeVisible();
    await evidence.shot(page, 'Config open');
  });
});

test('21.04: each group chip hides and shows its whole band and nothing else, a metric unchecked in Config stays hidden when its group is shown again, a group configured hidden starts hidden, and the choice survives a reload and a study report\'s back link until Reset restores the configured defaults (#21)', async ({ app, page }) => {
  /** @type {any[]} */
  const catalog = readData('portfolio.json').metrics;
  const shown = shownMetrics(catalog);
  const ids = shown.map((m) => m.MetricID);
  const groups = [{ name: 'Alpha', metrics: ids.slice(0, 4) }, { name: 'Beta', metrics: ids.slice(4, 8), hidden: true }, { name: 'Gamma', metrics: ids.slice(8, 12) }];
  await app.openReport('portfolio', { document: (/** @type {any} */ doc) => void (doc.config = { groups }), beside: [studies[0].StudyID] });
  await page.locator('#app > .layout').waitFor();
  const bands = async () => {
    const out = [];
    for (const th of await page.locator('.portfolio-table thead th.bandh[data-band]').all()) {
      const [name] = await visibleLines(th);
      out.push([name, await Promise.all((await th.locator('.tlab').all()).map((t) => visibleLines(t).then((l) => l.join(' '))))]);
    }
    return out;
  };
  const abbr = (/** @type {string} */ id) => /** @type {any} */ (catalog.find((m) => m.MetricID === id)).Abbreviation;
  const band = (/** @type {string} */ name, /** @type {string[]} */ list) => [name, list.map(abbr)];
  const rest = ids.slice(12);
  const chip = (/** @type {string} */ name) => control(page, `button[data-group="${name}"]`);

  expect(await bands(), 'Beta configured hidden').toEqual([band('Alpha', ids.slice(0, 4)), band('Gamma', ids.slice(8, 12)), band('Other', rest)]);
  expect(await chip('Beta').getAttribute('aria-pressed')).toBe('false');
  await page.locator('#header-controls [data-open="config"]').click();
  const chipsSeen = await Promise.all((await page.locator('#header-controls button[data-group]').all()).map((c) => visibleLines(c).then((l) => l.join(' '))));
  expect(chipsSeen, 'the group chips, readable').toEqual(['Alpha', 'Beta', 'Gamma', 'Other']);
  await page.keyboard.press('Escape');

  await chip('Gamma').click();
  expect(await bands(), 'Gamma hidden: only its band goes').toEqual([band('Alpha', ids.slice(0, 4)), band('Other', rest)]);
  expect(await chip('Gamma').getAttribute('aria-pressed')).toBe('false');
  await control(page, `input[data-metric="${ids[9]}"]`).uncheck();
  await chip('Gamma').click();
  expect(await bands(), 'Gamma shown again, without the metric unchecked').toEqual([band('Alpha', ids.slice(0, 4)), band('Gamma', [ids[8], ids[10], ids[11]]), band('Other', rest)]);
  await chip('Beta').click();
  await chip('Alpha').click();
  const left = [band('Beta', ids.slice(4, 8)), band('Gamma', [ids[8], ids[10], ids[11]]), band('Other', rest)];
  expect(await bands(), 'Beta shown, Alpha hidden').toEqual(left);

  await page.reload();
  await page.locator('#app > .layout').waitFor();
  expect(await bands(), 'after a reload').toEqual(left);
  const first = studies[0].StudyID;
  await page.locator(`#app .portfolio-table a[data-study="${first}"]`).first().click();
  await page.locator(`#app > [data-study="${first}"] .card`).first().waitFor();
  expect(await cardMetrics(page), 'the study report\'s cards show exactly the portfolio\'s metrics that have one (16.03)').toEqual(withCards([...ids.slice(4, 8), ids[8], ids[10], ids[11], ...rest].sort(), catalog));
  await page.locator('#app a.back').click();
  await page.locator('#app > .layout').waitFor();
  expect(await bands(), 'after a study report and its back link').toEqual(left);

  await page.locator('#header-controls [data-reset]').click();
  expect(await bands(), 'after Reset').toEqual([band('Alpha', ids.slice(0, 4)), band('Gamma', ids.slice(8, 12)), band('Other', rest)]);
  expect(await chip('Beta').getAttribute('aria-pressed')).toBe('false');
});

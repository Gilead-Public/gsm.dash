// @ts-check
// #21: the portfolio table's optional columns (study name, Enrolled, Status), Enrolled against its target, and its View,
// Overview or Details, which replaced the row density. Defaults come from the configuration (#16); choices travel in the
// address and Reset restores them.
import { expect, readData, test } from './fixtures/app.js';
import { chooseView, control } from './fixtures/controls.js';
import { visibleLines } from './fixtures/visible.js';
import { countText } from '../test/qual/pooling.js';
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
 * Which View the table shows, read from the table itself: Overview folds every category to headline tiles; Details
 * opens them all, with a header per metric. Null when it is neither.
 * @param {Page} page
 */
async function shownView(page) {
  const table = page.locator('table.po');
  const [tiles, closed, open, heads] = await Promise.all(
    ['.otile', 'thead th.bandh.closed', 'thead th.bandh.open', 'thead th[data-sort^="Analysis_"]'].map((s) => table.locator(s).count()),
  );
  if (tiles && closed && !open && !heads) return 'overview';
  if (!tiles && !closed && open && heads) return 'details';
  return null;
}

/** @param {Page} page */
const viewControl = async (page) => ((await control(page, 'button[data-view-toggle]').getAttribute('aria-pressed')) === 'true' ? 'details' : 'overview');

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

  test('21.01: the View shows the table in Overview by default and in Details when chosen, and the choice survives a reload until Reset (#21)', async ({ app, page }) => {
    await app.open();
    expect([await viewControl(page), await shownView(page)]).toEqual(['overview', 'overview']);
    await chooseView(page, 'details');
    expect([await viewControl(page), await shownView(page)]).toEqual(['details', 'details']);
    await page.reload();
    await page.locator('#app > .layout').waitFor();
    expect([await viewControl(page), await shownView(page)]).toEqual(['details', 'details']);
    await control(page, '[data-reset]').click();
    expect([await viewControl(page), await shownView(page)]).toEqual(['overview', 'overview']);
    expect(new URL(page.url()).hash).toBe('');
  });

  test('21.01: configured columns and View are the defaults, and Reset returns to them (#21)', async ({ app, page }) => {
    await openWith(app, page, (doc) => void (doc.config = { columns: ['enroll', 'status'], view: 'details' }));
    expect(await headers(page)).toEqual(['Status', 'Scr.n', 'Enr.n']);
    expect((await rowParts(page, studies[0].StudyID)).name).toBeNull();
    expect([await viewControl(page), await shownView(page)]).toEqual(['details', 'details']);
    await chip(page, 'status').click();
    await chooseView(page, 'overview');
    expect(await headers(page)).toEqual(['Scr.n', 'Enr.n']);
    expect(await shownView(page)).toBe('overview');
    await control(page, '[data-reset]').click();
    expect(await headers(page)).toEqual(['Status', 'Scr.n', 'Enr.n']);
    expect([await viewControl(page), await shownView(page)]).toEqual(['details', 'details']);
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

  test('21.03: the table collapsed and expanded, and the Config popover with its toggle and metric checkboxes, for visual comparison (#21)', async ({ app, page, evidence }) => {
    await app.open();
    expect(await shownView(page)).toBe('overview');
    await evidence.shot(page, 'collapsed');
    await chooseView(page, 'details');
    expect(await shownView(page)).toBe('details');
    await evidence.shot(page, 'expanded');
    await page.locator('#header-controls [data-open="config"]').click();
    await expect(page.locator('#header-controls [data-pop="config"]')).toBeVisible();
    await evidence.shot(page, 'Config open');
  });
});

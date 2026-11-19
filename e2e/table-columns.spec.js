// @ts-check
// #21: the portfolio table's optional columns (study name, Enrolled, Status), Enrolled against its target, and the row
// density. Defaults come from the configuration (#16); choices travel in the address and Reset restores them.
import { expect, readData, test } from './fixtures/app.js';
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
const chip = (page, /** @type {string} */ column) => page.locator(`.sidebar button[data-column="${column}"]`);
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

test.describe('table columns and density', () => {
  test('21.01: each optional column toggles, the built-in defaults apply, and the choice survives a reload until Reset (#21)', async ({ app, page }) => {
    await app.open();
    const [first] = studies;
    expect(await headers(page)).toEqual(['Scr.n']);
    for (const [column, pressed] of [['name', 'true'], ['enroll', 'false'], ['status', 'false']]) await expect(chip(page, column)).toHaveAttribute('aria-pressed', pressed);
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

    await page.locator('.sidebar [data-reset]').click();
    expect(await headers(page)).toEqual(['Scr.n']);
    expect((await rowParts(page, first.StudyID)).name).toBe(first.params.nickname);
    expect(new URL(page.url()).hash).toBe('');
  });

  test('21.01: configured columns and density are the defaults, and Reset returns to them (#21)', async ({ app, page }) => {
    await openWith(app, page, (doc) => void (doc.config = { columns: ['enroll', 'status'], density: 'condensed' }));
    expect(await headers(page)).toEqual(['Status', 'Scr.n', 'Enr.n']);
    expect((await rowParts(page, studies[0].StudyID)).name).toBeNull();
    await expect(page.locator('table.po')).toHaveClass(/condensed/);
    await chip(page, 'status').click();
    await page.locator('.sidebar button[data-seg="density"][data-value="roomy"]').click();
    expect(await headers(page)).toEqual(['Scr.n', 'Enr.n']);
    await page.locator('.sidebar [data-reset]').click();
    expect(await headers(page)).toEqual(['Status', 'Scr.n', 'Enr.n']);
    await expect(page.locator('table.po')).toHaveClass(/condensed/);
  });

  test('21.01: the column and density controls are disabled in Distribution, which has no table (#21)', async ({ app, page }) => {
    await app.open('#view=distribution');
    for (const column of ['name', 'enroll', 'status']) await expect(chip(page, column)).toHaveAttribute('disabled', '');
    for (const value of ['roomy', 'condensed']) await expect(page.locator(`.sidebar button[data-seg="density"][data-value="${value}"]`)).toHaveAttribute('disabled', '');
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

  test('21.03: the table at roomy and condensed density, for visual comparison; condensed rows are shorter (#21)', async ({ app, page, evidence }) => {
    await app.open('#view=details');
    const height = () => page.locator('tbody tr.study').first().evaluate((tr) => tr.getBoundingClientRect().height);
    await evidence.shot(page, 'roomy');
    const roomy = await height();
    await page.locator('.sidebar button[data-seg="density"][data-value="condensed"]').click();
    await expect(page.locator('table.po')).toHaveClass(/condensed/);
    await evidence.shot(page, 'condensed');
    expect(await height()).toBeLessThan(roomy);
  });
});

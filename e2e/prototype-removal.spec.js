// @ts-check
// #35: prototype features no requirement backs are gone from both reports. Each check looks for the feature both by
// what a user sees (its text or accessible name) and by its old markup, so a renamed copy can't slip through.
import { expect, readData, test } from './fixtures/app.js';
/** @typedef {import('@playwright/test').Page} Page */

const portfolio = readData('portfolio.json');
/** @type {Array<{ StudyID: string, snapshots: string[] }>} */
const studies = portfolio.studies;
const study = studies[0];
const KRI = 'Analysis_kri0001';
const CTQ = 'Analysis_kri0012';
const LIGHT = 'rgb(246, 247, 246)';
const DARK = 'rgb(16, 21, 20)';

/** @param {Page} page */
const bodyText = (page) => page.locator('body').innerText();
/** @param {Page} page */
const background = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

/**
 * No glossary button or dialog, and no theme control, by name or by markup.
 * @param {Page} page
 * @param {string} what
 */
async function expectNoGlossaryOrTheme(page, what) {
  await expect(page.getByRole('button', { name: /glossary/i }), `${what}: glossary button`).toHaveCount(0);
  await expect(page.locator('#glossaryBtn, dialog'), `${what}: glossary dialog`).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(auto|light|dark)$/i }), `${what}: theme buttons`).toHaveCount(0);
  await expect(page.locator('[data-theme-pref], #themeSeg, [aria-label="Theme"]'), `${what}: theme control`).toHaveCount(0);
}

/**
 * The page follows the operating system's light or dark setting, whatever the browser has stored.
 * @param {Page} page
 * @param {() => Promise<unknown>} open
 * @param {string} what
 */
async function expectFollowsSystem(page, open, what) {
  await page.addInitScript(() => localStorage.setItem('gsm-dash-theme', 'light'));
  for (const [scheme, colour] of /** @type {const} */ ([['dark', DARK], ['light', LIGHT]])) {
    await page.emulateMedia({ colorScheme: scheme });
    await open();
    expect(await background(page), `${what}, system ${scheme}`).toBe(colour);
    expect(await page.evaluate(() => document.documentElement.dataset.theme ?? null), `${what}, system ${scheme}: no stored theme applied`).toBeNull();
  }
}

test('35.01: the portfolio has no change log link and no "not site-level" note; neither report has a glossary button or dialog or a theme control, and each follows the system\'s light or dark setting (#35)', async ({ app, page }) => {
  await app.open();
  await expect(page.getByRole('link', { name: /change log/i })).toHaveCount(0);
  await expect(page.locator('a[href*="pages.github.io"], #changelogLink')).toHaveCount(0);
  const text = await bodyText(page);
  expect(text).not.toMatch(/change log/i);
  expect(text).not.toMatch(/not site-level|plumbing/i);
  await expect(page.locator('.sb-note')).toHaveCount(0);
  await expectNoGlossaryOrTheme(page, 'portfolio');
  await expectFollowsSystem(page, () => app.open(), 'portfolio');

  await app.openStudy(study.StudyID);
  await expectNoGlossaryOrTheme(page, 'study');
  await expectFollowsSystem(page, () => app.openStudy(study.StudyID), 'study');
});

test('35.02: the study report has no Randomize or play button, no STANDARD / CUSTOM badge on tiles or in the Charts panel, no metadata line and no comparison line (#35)', async ({ app, page }) => {
  for (const id of [study.StudyID, 'STUDY006']) {
    await app.openStudy(id);
    await expect(page.getByRole('button', { name: /randomi[sz]e/i }), `${id}: Randomize`).toHaveCount(0);
    await expect(page.getByRole('button', { name: /play|pause/i }), `${id}: play`).toHaveCount(0);
    await expect(page.locator('[data-randomize-views], [data-play], .kind'), `${id}: old markup`).toHaveCount(0);
    await expect(page.locator('input[type="range"][data-visit]'), `${id}: the visit slider stays`).toBeVisible();
    expect(await page.locator('header.app').innerText(), `${id}: metadata line`).not.toMatch(/metrics|exported/i);

    for (const [index, view] of /** @type {Array<[number, string]>} */ ([[0, 'scalar-tile'], [-1, 'scalar-tile'], [-1, 'default']])) {
      const dates = /** @type {{ snapshots: string[] }} */ (studies.find((s) => s.StudyID === id)).snapshots;
      const at = index < 0 ? dates.length - 1 : index;
      await page.locator('input[type="range"][data-visit]').evaluate((el, i) => {
        /** @type {HTMLInputElement} */ (el).value = String(i);
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, at);
      await page.locator('select[data-all-views]').selectOption(view);
      const text = await page.locator('.study-page').innerText();
      const where = `${id}, visit ${at + 1}, ${view}`;
      expect(text, `${where}: comparison line`).not.toMatch(/this study|^portfolio /im);
      expect(text, `${where}: badge`).not.toMatch(/^(standard|custom)$/im);
    }

    for (const metric of [CTQ, KRI]) {
      await page.locator(`.tile[data-metric-id="${metric}"] button[data-detail-metric]`).click();
      const panel = page.locator('.detail');
      await expect(panel, `${id}: ${metric} Charts panel`).toBeVisible();
      expect(await panel.innerText(), `${id}: ${metric} Charts panel badge`).not.toMatch(/^(standard|custom)$/im);
      await page.locator(`.tile[data-metric-id="${metric}"] button[data-detail-metric]`).click();
      await expect(panel).toHaveCount(0);
    }
  }
});

test('35.04: both reports without the removed features, for visual comparison with this issue\'s Scope (#35)', async ({ app, page, evidence }) => {
  await app.open();
  await evidence.shot(page, 'portfolio');
  await app.openStudy(study.StudyID);
  await page.locator(`.tile[data-metric-id="${CTQ}"] button[data-detail-metric]`).click();
  await expect(page.locator('.detail')).toBeVisible();
  await evidence.shot(page, 'study, Charts panel open');
});

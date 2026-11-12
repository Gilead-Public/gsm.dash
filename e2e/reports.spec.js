// @ts-check
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, readData, REPORTS_DIR, test } from './fixtures/app.js';

const manifest = readData('portfolio.json');
/** @type {Array<{ StudyID: string, params: Record<string, string | number>, snapshots: string[] }>} */
const studies = manifest.studies;
const latest = (/** @type {string[]} */ dates) => [...dates].sort().at(-1);

/**
 * A report file's own checks: its module script and styles are inline and nothing refers to another file. Returns its
 * data document.
 * @param {string} name
 */
function inlineDocument(name) {
  const html = readFileSync(join(REPORTS_DIR, `${name}.html`), 'utf8');
  expect(html, `${name}: inline module script`).toMatch(/<script type="module">\n\S/);
  expect(html, `${name}: inline styles`).toMatch(/<style>[^<]*\{/);
  expect(html.match(/<script\b[^>]*\bsrc=|<link\b[^>]*\bhref=/gi), `${name}: references to other files`).toBeNull();
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  expect(styles, `${name}: style references to other files`).not.toMatch(/url\((?!\s*["']?data:)/);
  return JSON.parse(/<script type="application\/json" id="gsm-data">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '');
}

test('27.01: every report, one per study and the portfolio, is one HTML file with scripts, styles and data inline, and opens with no other request (#27)', async ({ app, page }) => {
  expect(readdirSync(REPORTS_DIR).sort(), 'one file per study, the portfolio, and nothing else').toEqual([...studies.map((s) => `${s.StudyID}.html`), 'portfolio.html'].sort());
  /** @type {string[]} */
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  for (const study of studies) {
    expect(inlineDocument(study.StudyID).study.StudyID, `${study.StudyID}: its own data inline`).toBe(study.StudyID);
    requests.length = 0;
    const url = await app.openReport(study.StudyID);
    await expect(page.locator('.dd-head .study.mono')).toHaveText(study.StudyID);
    const n = study.snapshots.length;
    await expect(page.locator('.visits .meta')).toHaveText(`Visit ${n}/${n} · ${latest(study.snapshots)}`);
    expect(requests, `${study.StudyID}: requests besides the report itself`).toEqual([url]);
  }

  expect(inlineDocument('portfolio').studies.map((/** @type {{ StudyID: string }} */ s) => s.StudyID), 'portfolio: every study inline').toEqual(studies.map((s) => s.StudyID));
  requests.length = 0;
  const url = await app.openReport('portfolio');
  await expect(page.locator('#meta')).toHaveText(`${studies.length} studies · ${manifest.metrics.filter((/** @type {{ Active?: boolean }} */ m) => m.Active !== false).length} metrics · exported ${manifest.generated}`);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(requests, 'portfolio: requests besides the report itself').toEqual([url]);
});

/** @type {Record<string, (doc: any) => void>} */
const INVALID = {
  'a numerator given as text': (doc) => (doc.snapshots[0].results[0].Numerator = String(doc.snapshots[0].results[0].Numerator)),
  'an unknown field': (doc) => (doc.note = 'x'),
  'a stored rate in the portfolio comparison': (doc) => (doc.comparison[0].Rate = 0.5),
  'no portfolio comparison': (doc) => delete doc.comparison,
  "another study's snapshot": (doc) => (doc.snapshots[0].StudyID = studies[1].StudyID),
  'a repeated portfolio comparison row': (doc) => doc.comparison.unshift({ ...doc.comparison[0], Numerator: doc.comparison[0].Numerator + 1e6 }),
};

const study = studies[0];

for (const [what, change] of Object.entries(INVALID)) {
  test(`27.04: a data document with ${what} shows the error state, not the study's values (#27)`, async ({ app, page }) => {
    await app.openReport(study.StudyID, { document: change });
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('alert').getByRole('heading')).toHaveText("This report can't be shown");
    await expect(page.locator('#app .dd-head, #app .tile')).toHaveCount(0);
  });
}

for (const [what, text] of Object.entries({ 'data that is not JSON': '{"study": ', 'no data injected': '__GSM_DATA__' })) {
  test(`27.04: a report with ${what} shows the error state (#27)`, async ({ app, page }) => {
    await app.openReport(study.StudyID, { text });
    await expect(page.getByRole('alert').getByRole('heading')).toHaveText("This report can't be shown");
    await expect(page.locator('#app .dd-head, #app .tile')).toHaveCount(0);
  });
}

test('27.04: the same report with its data rewritten unchanged shows the study, not the error state (#27)', async ({ app, page }) => {
  await app.openReport(study.StudyID, { document: () => {} });
  await expect(page.locator('.dd-head .study.mono')).toHaveText(study.StudyID);
  await expect(page.locator('#app .tile').first()).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

/** @type {Record<string, (doc: any) => void>} */
const INVALID_PORTFOLIO = {
  'a count given as text': (doc) => (doc.summary.counts[0].Numerator = String(doc.summary.counts[0].Numerator)),
  'an unknown field': (doc) => (doc.note = 'x'),
  'a stored rate in the summary': (doc) => (doc.summary.counts[0].Rate = 0.5),
  'no summary': (doc) => delete doc.summary,
  "a study's file list": (doc) => (doc.studies[0].files = {}),
  'summary counts for a date that is not one of the study’s snapshots': (doc) => (doc.summary.counts[0].SnapshotDate = '1999-01-01'),
  'a study the summary does not describe': (doc) => doc.studies.push({ ...doc.studies[0], StudyID: 'ELSEWHERE' }),
};

for (const [what, change] of Object.entries(INVALID_PORTFOLIO)) {
  test(`27.04: a portfolio data document with ${what} shows the error state, not the portfolio (#27)`, async ({ app, page }) => {
    await app.openReport('portfolio', { document: change });
    await expect(page.getByRole('alert').getByRole('heading')).toHaveText("This report can't be shown");
    await expect(page.locator('#app .layout')).toHaveCount(0);
  });
}

test('27.04: a portfolio report with no data injected shows the error state (#27)', async ({ app, page }) => {
  await app.openReport('portfolio', { text: '__GSM_DATA__' });
  await expect(page.getByRole('alert').getByRole('heading')).toHaveText("This report can't be shown");
  await expect(page.locator('#app .layout')).toHaveCount(0);
});

test('27.04: the portfolio report with its data rewritten unchanged shows the portfolio, not the error state (#27)', async ({ app, page }) => {
  await app.openReport('portfolio', { document: () => {} });
  await expect(page.locator('#app > .layout')).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

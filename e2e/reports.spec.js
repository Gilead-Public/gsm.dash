// @ts-check
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, readData, REPORTS_DIR, test } from './fixtures/app.js';

const manifest = readData('portfolio.json');
/** @type {Array<{ StudyID: string, params: Record<string, string | number>, snapshots: string[] }>} */
const studies = manifest.studies;
const latest = (/** @type {string[]} */ dates) => [...dates].sort().at(-1);

test('27.01: every study report is one HTML file with scripts, styles and data inline, and opens with no other request (#27)', async ({ app, page }) => {
  expect(readdirSync(REPORTS_DIR).sort(), 'one file per study and nothing else').toEqual(studies.map((s) => `${s.StudyID}.html`).sort());
  /** @type {string[]} */
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  for (const study of studies) {
    const html = readFileSync(join(REPORTS_DIR, `${study.StudyID}.html`), 'utf8');
    expect(html, `${study.StudyID}: inline module script`).toMatch(/<script type="module">\n\S/);
    expect(html, `${study.StudyID}: inline styles`).toMatch(/<style>[^<]*\{/);
    expect(html.match(/<script\b[^>]*\bsrc=|<link\b[^>]*\bhref=/gi), `${study.StudyID}: references to other files`).toBeNull();
    const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
    expect(styles, `${study.StudyID}: style references to other files`).not.toMatch(/url\((?!\s*["']?data:)/);
    const block = /<script type="application\/json" id="gsm-data">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';
    expect(JSON.parse(block).study.StudyID, `${study.StudyID}: its own data inline`).toBe(study.StudyID);

    requests.length = 0;
    const url = await app.openReport(study.StudyID);
    await expect(page.locator('.dd-head .study.mono')).toHaveText(study.StudyID);
    const n = study.snapshots.length;
    await expect(page.locator('.visits .meta')).toHaveText(`Visit ${n}/${n} · ${latest(study.snapshots)}`);
    expect(requests, `${study.StudyID}: requests besides the report itself`).toEqual([url]);
  }
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

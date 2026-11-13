// @ts-check
// Characterization of the portfolio view's numbers as they ship today. Every visible value is read under its visible
// column heading and row label and checked against the catalog and independent pooling of the per-study files, so a
// change in data source (#15) or a study-view change (#11) that alters what the portfolio shows fails here.
import { expect, readData, test } from './fixtures/app.js';
import { countText, displayed, pooled, population, readRate, shownMetrics, snapshotAsOf, studiesBy, tolerance } from '../test/qual/pooling.js';
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('../test/qual/pooling.js').StudyEntry} StudyEntry */
/** @typedef {import('../test/qual/pooling.js').MetricMeta} MetricMeta */

const portfolio = readData('portfolio.json');
/** @type {StudyEntry[]} */
const studies = portfolio.studies;
const catalog = shownMetrics(portfolio.metrics);
const categories = [...new Set(catalog.map((m) => m.Category ?? 'Other'))];
const bands = categories.map((category) => ({ category, metrics: catalog.filter((m) => (m.Category ?? 'Other') === category) }));

/**
 * @typedef {object} ShownTable
 * @property {{ category: string; abbrs: string[] }[]} bands Folded category headings and the metric labels under each.
 * @property {string[]} populationHeadings
 * @property {{ kind: string; label: string; count: string; population: string[]; tiles: string[][] }[]} rows
 */

/**
 * The portfolio table as a user reads it: visible headings, row labels and cell text.
 * @param {Page} page
 * @returns {Promise<ShownTable>}
 */
function shownTable(page) {
  return page.locator(':is(gsm-portfolio-table, .portfolio-table) table.po').evaluate((table) => {
    const text = (/** @type {Element | null} */ el, drop = '') => {
      if (!el) return '';
      const copy = /** @type {Element} */ (el.cloneNode(true));
      if (drop) for (const e of copy.querySelectorAll(drop)) e.remove();
      return (copy.textContent ?? '').trim();
    };
    return {
      bands: [...table.querySelectorAll('thead th.bandh:not(.pop)')].map((th) => ({
        category: th.classList.contains('closed') ? text(th, 'button, .u, .otiles') : `(open) ${text(th, 'button, .tw')}`,
        abbrs: [...th.querySelectorAll('.tlab')].map((t) => text(t)),
      })),
      populationHeadings: [...table.querySelectorAll('thead tr.cols th.pop')].map((th) => text(th, '.u, .si')),
      rows: [...table.querySelectorAll('tbody tr')].map((tr) => ({
        kind: tr.classList.contains('total') ? 'total' : tr.classList.contains('bucket') ? 'bucket' : 'study',
        label: text(tr.querySelector('td.grp'), '.tri, .nick, .info'),
        count: text(tr.querySelector('td.nstud')),
        population: [...tr.querySelectorAll('td.pop')].map((td) => text(td)),
        tiles: [...tr.querySelectorAll('td.cat')].map((td) => [...td.querySelectorAll('.otile')].map((t) => text(t))),
      })),
    };
  });
}

/**
 * @param {import('@playwright/test').Locator} locator
 * @param {number} count
 * @param {string} what
 */
async function expectEachVisible(locator, count, what) {
  await expect(locator, what).toHaveCount(count);
  for (let i = 0; i < count; i++) await expect(locator.nth(i), `${what} ${i + 1}`).toBeVisible();
}

/**
 * @param {Page} page
 * @param {ShownTable} table
 */
async function expectHeadings(page, table) {
  expect(table.bands, 'category headings and their metric labels, from the catalog').toEqual(
    bands.map((b) => ({ category: b.category, abbrs: b.metrics.map((m) => m.Abbreviation) })),
  );
  expect(table.populationHeadings).toEqual(['Scr.', 'Enr.']);
  const head = page.locator(':is(gsm-portfolio-table, .portfolio-table) table.po thead');
  await expectEachVisible(head.locator('th.bandh:not(.pop)'), bands.length, 'category heading');
  await expectEachVisible(head.locator('th.bandh .tlab'), catalog.length, 'metric heading');
  await expectEachVisible(head.locator('th.bandh.pop'), 1, 'population heading');
  await expectEachVisible(head.locator('tr.cols th.pop'), 2, 'population column heading');
}

/**
 * Checks every value in one row under its heading, then hovers each metric value and reads the tooltip a user sees.
 * @param {Page} page
 * @param {ShownTable} table
 * @param {string} label
 * @param {StudyEntry[]} members
 */
async function expectRow(page, table, label, members) {
  const index = table.rows.findIndex((r) => r.label === label);
  expect(index, `a row labelled ${label}`).toBeGreaterThanOrEqual(0);
  const row = table.rows[index];
  expect(row.population, `${label}: Scr., Enr.`).toEqual([
    countText(population(readData, members, 'ScreenedCount')),
    countText(population(readData, members, 'ParticipantCount')),
  ]);
  expect(row.tiles.map((t) => t.length), `${label}: values under each category`).toEqual(bands.map((b) => b.metrics.length));
  const tr = page.locator(':is(gsm-portfolio-table, .portfolio-table) table.po tbody tr').nth(index);
  await expect(tr.locator(row.kind === 'study' ? 'td.grp a[data-study]' : 'td.grp'), `${label}: row label`).toBeVisible();
  await expectEachVisible(tr.locator('td.nstud, td.pop'), 3, `${label}: count and population`);
  const cells = tr.locator('td.cat');
  const tooltip = page.locator('#gsm-tooltip');
  for (const [j, band] of bands.entries()) {
    for (const [k, metric] of band.metrics.entries()) {
      const where = `${label} · ${metric.Abbreviation}`;
      const want = pooled(readData, members, metric.MetricID);
      const shown = readRate(metric, row.tiles[j][k]);
      if (want.rate === null) expect(shown, where).toBeNull();
      else expect(Math.abs(/** @type {number} */ (shown) - displayed(metric, want.rate)), `${where}: ${row.tiles[j][k]}`).toBeLessThanOrEqual(tolerance(metric));
      await cells.nth(j).locator('.otile').nth(k).hover();
      await expect(tooltip, where).toBeVisible();
      await expect(tooltip.locator('b').first(), where).toHaveText(`${label} · ${metric.Abbreviation}`);
      const nd = /Σn\/Σd = ([\d,]+) \/ ([\d,]+)/.exec(await tooltip.innerText());
      expect(nd?.slice(1, 3), `${where}: Σn/Σd`).toEqual([countText(want.numerator), countText(want.denominator)]);
    }
  }
}

test.describe('portfolio view numbers', () => {
  // Every value is hovered, which takes most of the default 20 s.
  test.describe.configure({ timeout: 60_000 });

  test('11.03: the overview shows the pooled total and every study at its own latest snapshot (#11)', async ({ app, page }) => {
    expect(new Set(studies.map((s) => snapshotAsOf(s, null))).size, 'the fixture has studies on different latest snapshots').toBeGreaterThan(1);
    expect(bands.flatMap((b) => b.metrics), 'the catalog keeps each category together').toEqual(catalog);
    await app.open();
    const table = await shownTable(page);
    await expectHeadings(page, table);
    expect(table.rows.map((r) => [r.kind, r.label])).toEqual([['total', 'Portfolio total'], ...studies.map((s) => ['study', s.StudyID])]);
    expect(table.rows[0].count).toBe(String(studies.length));
    await expectRow(page, table, 'Portfolio total', studies);
    for (const study of studies) {
      expect(table.rows.find((r) => r.label === study.StudyID)?.count, study.StudyID).toBe(snapshotAsOf(study, null));
      await expectRow(page, table, study.StudyID, [study]);
    }
  });

  test('11.03: grouping pools each group of studies (#11)', async ({ app, page }) => {
    await app.open();
    await page.locator('select[data-groupby]').selectOption('phase');
    await expect(page.locator(':is(gsm-portfolio-table, .portfolio-table) tr.bucket').first()).toBeVisible();
    const table = await shownTable(page);
    await expectHeadings(page, table);
    const groups = studiesBy(studies, 'phase');
    const labels = [...groups.keys()].sort((a, b) => a.localeCompare(b));
    expect(labels.length, 'the fixture has more than one phase').toBeGreaterThan(1);
    expect(table.rows.map((r) => [r.kind, r.label])).toEqual([['total', 'Portfolio total'], ...labels.map((l) => ['bucket', l])]);
    await expectRow(page, table, 'Portfolio total', studies);
    for (const label of labels) {
      const members = /** @type {StudyEntry[]} */ (groups.get(label));
      expect(table.rows.find((r) => r.label === label)?.count, label).toBe(String(members.length));
      await expectRow(page, table, label, members);
    }
  });

  test('11.03: a filter pools only the studies it keeps (#11)', async ({ app, page }) => {
    const counts = studiesBy(studies, 'therapeutic_area');
    const [area, kept] = [...counts].sort((a, b) => b[1].length - a[1].length)[0];
    expect(kept.length, 'the filter keeps more than one study and drops some').toBeGreaterThan(1);
    expect(kept.length).toBeLessThan(studies.length);
    await app.open();
    await page.locator(`button[data-filter="therapeutic_area"][data-value="${area}"]`).click();
    await expect(page.locator(':is(gsm-portfolio-table, .portfolio-table) tr.study')).toHaveCount(kept.length);
    const table = await shownTable(page);
    await expectHeadings(page, table);
    expect(table.rows.map((r) => [r.kind, r.label])).toEqual([['total', 'Portfolio total'], ...kept.map((s) => ['study', s.StudyID])]);
    expect(table.rows[0].count).toBe(String(kept.length));
    await expectRow(page, table, 'Portfolio total', kept);
    for (const study of kept) await expectRow(page, table, study.StudyID, [study]);
  });
});

test('the portfolio sits in the app shell: brand, Program overview tag, study count and export date, change log, a working metric glossary and theme switch, inside the page margins', async ({ app, page }) => {
  await app.open();
  const header = page.locator('header.app');
  await expect(header.locator('h1')).toHaveText('gsm.dash');
  await expect(header.locator('#page-tag')).toHaveText('Program overview');
  const active = portfolio.metrics.filter((/** @type {{ Active?: boolean }} */ m) => m.Active !== false).length;
  await expect(header.locator('#meta')).toHaveText(`${studies.length} studies · ${active} metrics · exported ${portfolio.generated}`);
  await expect(header.locator('a#changelogLink')).toHaveAttribute('target', '_blank');
  await expect(header.locator('a#changelogLink')).toHaveAttribute('href', /^https:\/\/.+change-log\.html$/);
  await header.locator('#glossaryBtn').click();
  const glossary = page.locator('dialog#gsm-glossary');
  await expect(glossary).toBeVisible();
  await expect(glossary).toContainText(catalog[0].Abbreviation);
  await page.keyboard.press('Escape');
  await expect(glossary).toBeHidden();
  await header.locator('button[data-theme-pref="dark"]').click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await header.locator('button[data-theme-pref="auto"]').click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme ?? 'auto')).toBe('auto');
  const shell = await header.boundingBox();
  const content = await page.locator('#app > .layout').boundingBox();
  expect(shell && content, 'header and portfolio both laid out').toBeTruthy();
  expect(Math.round(content?.x ?? 0), 'the portfolio lines up with the header').toBe(Math.round(shell?.x ?? -1));
  expect(content?.x ?? 0, 'inside the page margins').toBeGreaterThanOrEqual(20);
});

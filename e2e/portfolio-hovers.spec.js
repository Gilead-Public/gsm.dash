// @ts-check
// #20: on the portfolio report, details live in hovers rather than info icons and extra columns, tooltips carry no
// technical fields, and each value's hover names its denominator with the metric's own catalog label.
import { expect, readData, test } from './fixtures/app.js';
import { expectSeen, visibleLines } from './fixtures/visible.js';
import { countText, latestSnapshot, pooled, shownMetrics } from '../test/qual/pooling.js';
import { chooseView } from './fixtures/controls.js';
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('../test/qual/pooling.js').StudyEntry} StudyEntry */

test.describe.configure({ timeout: 120_000 });

const portfolio = readData('portfolio.json');
/** @type {StudyEntry[]} */
const studies = portfolio.studies;
/** @type {Array<Record<string, any>>} */
const everyMetric = portfolio.metrics;
const catalog = shownMetrics(portfolio.metrics);

/** @param {string} s */
const literal = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** @type {Record<string, (page: Page) => Promise<void>>} */
const VIEWS = {
  Overview: async () => {},
  'Details, ungrouped': async (page) => {
    await chooseView(page, 'details');
  },
  'Details, grouped with a group open': async (page) => {
    await chooseView(page, 'details');
    await page.locator('select[data-groupby]').selectOption('phase');
    await page.locator('tr[data-bucket] td.grp').first().click();
    await expect(page.locator('.portfolio-table tr.study').first()).toBeVisible();
  },
};

/**
 * Every tooltip the page holds, as text: each hover's content (`data-tip`, what the hover shows) and each native title.
 * @param {Page} page
 */
const tooltipTexts = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-tip], [title]')].flatMap((el) => {
      const out = [];
      const tip = el.getAttribute('data-tip');
      if (tip) {
        const d = document.createElement('div');
        d.innerHTML = tip.replace(/<br\s*\/?>/g, '\n');
        out.push(d.textContent ?? '');
      }
      const title = el.getAttribute('title');
      if (title) out.push(title);
      return out;
    }),
  );

test('20.01: the portfolio report has no info icon and no ⓘ in its page or tooltip text, in Overview and Details (ungrouped, and grouped with a group open) (#20)', async ({ app, page }) => {
  for (const [view, open] of Object.entries(VIEWS)) {
    await app.open();
    await open(page);
    await expect(page.locator('.info'), view).toHaveCount(0);
    expect(await page.evaluate(() => document.body.innerText), view).not.toContain('ⓘ');
    const tips = await tooltipTexts(page);
    expect(tips.length, view).toBeGreaterThan(0);
    expect(tips.filter((t) => t.includes('ⓘ')), view).toEqual([]);
  }
});

/** Lower case, letters and digits only, so a field is found however it is cased or punctuated. */
const squash = (/** @type {string} */ t) => t.toLowerCase().replace(/[^a-z0-9]/g, '');
const IDS = [...new Set(everyMetric.flatMap((m) => [m.MetricID, m.ID]).filter(Boolean).map((v) => squash(String(v))))];
const SCORES = [...new Set(everyMetric.map((m) => m.Score).filter(Boolean).map((v) => squash(String(v))))];
/** Each catalog threshold list as its numbers in order, with any separators and any minus sign between them. */
const THRESHOLDS = [...new Set(everyMetric.map((m) => m.Threshold).filter(Boolean).map(String))].map((t) => {
  const num = (/** @type {number} */ n) => (n < 0 ? `[-−–]\\s*${Math.abs(n)}` : `\\+?${n}`);
  return new RegExp(`(?<![0-9.])${t.split(',').map(Number).map(num).join('[^0-9.\\-−–]{1,12}')}(?![0-9.])`);
});
/** @param {string} text */
const technicalFields = (text) => [
  ...IDS.filter((id) => squash(text).includes(id)),
  ...SCORES.filter((score) => squash(text).includes(score)),
  ...THRESHOLDS.filter((rx) => rx.test(text)).map((rx) => `thresholds ${rx.source}`),
];

test('20.03: no tooltip on the portfolio report holds a metric\'s MetricID or ID, its score or its thresholds, in Overview or Details (#20)', async ({ app, page }) => {
  expect([IDS.length, SCORES.length, THRESHOLDS.length].every((n) => n > 0), 'the catalog has IDs, scores and thresholds').toBe(true);
  const id = String(everyMetric[0].ID);
  for (const sample of [`thresholds -2, -1, 2, 3`, `−2 / −1 / 2 / 3`, `-2,-1,2,3`, id.toUpperCase(), `${id.slice(0, 3)} ${id.slice(3)}`, 'adjusted z score']) {
    expect(technicalFields(sample), `the scan finds "${sample}"`).not.toEqual([]);
  }
  for (const [view, open] of Object.entries(VIEWS)) {
    await app.open();
    await open(page);
    const tips = await tooltipTexts(page);
    expect(tips.length, view).toBeGreaterThan(0);
    const leaks = tips.flatMap((t) => technicalFields(t).map((f) => `${f} in "${t.slice(0, 80)}"`));
    expect(leaks, view).toEqual([]);
  }
});

/** @type {Record<string, (m: any) => string>} */
const DISPLAYED_AS = {
  pct: () => 'percent (n ÷ d)',
  count_pct: (m) => `count (% of ${String(m.Denominator).toLowerCase()})`,
  per_28d: () => 'events per 28 days of exposure (n ÷ d × 28)',
};

/**
 * Hovers `target` and checks that the tooltip shows the metric's glossary entry, each field's label and value visible.
 * @param {Page} page
 * @param {import('@playwright/test').Locator} target
 * @param {any} metric
 * @param {string} where
 */
async function expectGlossary(page, target, metric, where) {
  await target.hover();
  const tooltip = page.locator('#gsm-tooltip');
  await expectSeen(tooltip, `${where}: tooltip`);
  expect(await visibleLines(tooltip.locator('> b')), `${where}: name`).toEqual([metric.Metric]);
  const lines = await visibleLines(tooltip.locator('dl'));
  const rows = [
    ['Definition', metric.Definition ?? 'not yet supplied (Q2)'],
    ['Numerator', metric.Numerator],
    ['Denominator', metric.Denominator],
    ['Displayed as', DISPLAYED_AS[metric.Display ?? 'pct'](metric)],
  ];
  for (const [label, value] of rows) {
    const at = lines.indexOf(label);
    expect(at, `${where}: the ${label} label can be seen`).toBeGreaterThanOrEqual(0);
    expect(lines[at + 1], `${where}: ${label}`).toBe(value);
  }
}

test('20.02: hovering a metric\'s header in Details or its band label in Overview shows its glossary entry; hovering a study\'s name shows its details and snapshot date (#20)', async ({ app, page }) => {
  await app.open();
  for (const m of catalog) await expectGlossary(page, page.locator(`.tlab[data-abbr="${m.Abbreviation}"]`), m, `Overview ${m.Abbreviation}`);

  const tooltip = page.locator('#gsm-tooltip');
  const fields = [
    ['Therapeutic area', 'therapeutic_area'], ['Indication', 'protocol_indication'], ['Phase', 'phase'], ['Status', 'status'],
    ['Product', 'product'], ['Screened', 'ScreenedCount'], ['Enrolled', 'ParticipantCount'], ['Dosed', 'DosedCount'],
  ];
  for (const s of studies) {
    await page.locator(`tr.study a[data-study="${s.StudyID}"]`).hover();
    await expectSeen(tooltip, `${s.StudyID}: tooltip`);
    // Each visible "Label: value" line, its value whole.
    const shown = new Map((await visibleLines(tooltip)).flatMap((l) => {
      const m = /^([^:]+): (.*)$/.exec(l);
      return m ? [[m[1], m[2]]] : [];
    }));
    const present = fields.filter(([, key]) => s.params[key] != null);
    expect(present.length, `${s.StudyID}: the fixture has the fields`).toBeGreaterThanOrEqual(5);
    for (const [label, key] of present) expect(shown.get(label), `${s.StudyID}: ${label}`).toBe(String(s.params[key]));
    expect(shown.get('Snapshot'), `${s.StudyID}: snapshot date`).toBe(`${latestSnapshot(s)} (${s.snapshots.length} available)`);
  }

  await chooseView(page, 'details');
  for (const m of catalog) await expectGlossary(page, page.locator(`th[data-sort="${m.MetricID}"]`), m, `Details ${m.Abbreviation}`);

});

test('20.04: the portfolio\'s hovers and tooltips in Overview and Details, for visual comparison with this issue\'s Scope (#20)', async ({ app, page, evidence }) => {
  await app.open();
  /** @param {import('@playwright/test').Locator} target @param {string} label */
  const shoot = async (target, label) => {
    await target.hover();
    await expectSeen(page.locator('#gsm-tooltip'), label);
    await evidence.shot(page, label);
  };
  await shoot(page.locator('.tlab').first(), 'overview band label');
  await shoot(page.locator('tbody tr.total .otile').first(), 'overview tile');
  await shoot(page.locator('tr.study a[data-study]').first(), 'study name');
  await chooseView(page, 'details');
  await shoot(page.locator('th[data-sort^="Analysis_"]').first(), 'details header');
  await shoot(page.locator('tbody tr.total td[data-tip]:not(.pop)').first(), 'details cell');
});

test('20.05: ungrouped, the table has no Snapshot column in Overview or Details; grouped, the Studies column holds each group\'s study count and expanded study rows leave it empty (#20)', async ({ app, page }) => {
  await app.open();
  const table = page.locator('.portfolio-table table.po');
  for (const view of ['overview', 'details']) {
    await chooseView(page, view);
    await expect(table.locator('th[data-sort="meta"]'), view).toHaveCount(0);
    await expect(table.locator('td.nstud'), view).toHaveCount(0);
    expect((await table.locator('thead').innerText()).includes('Snapshot'), view).toBe(false);
    await expect(table.locator('tbody tr.study'), view).toHaveCount(studies.length);
  }

  await page.locator('select[data-groupby]').selectOption('phase');
  const counts = new Map();
  for (const s of studies) counts.set(s.params.phase, (counts.get(s.params.phase) ?? 0) + 1);
  const open = [...counts.keys()].sort()[0];
  await page.locator(`tr[data-bucket="${open}"] td.grp`).click();
  for (const view of ['overview', 'details']) {
    await chooseView(page, view);
    const head = table.locator('th[data-sort="meta"]');
    await expect(head, view).toHaveText(/^Studies/);
    await expectSeen(head, `${view}: Studies heading`);
    await expect(table.locator('tbody tr.total td.nstud'), view).toHaveText(String(studies.length));
    for (const [phase, n] of counts) {
      const cell = table.locator(`tr[data-bucket="${phase}"] td.nstud`);
      await expect(cell, `${view}: ${phase}`).toHaveText(String(n));
      await expectSeen(cell, `${view}: ${phase} count`);
    }
    const children = table.locator('tbody tr.study');
    await expect(children, view).toHaveCount(counts.get(open));
    expect(await children.locator('td.nstud').allTextContents(), `${view}: expanded study rows`).toEqual(Array(counts.get(open)).fill(''));
  }
});

/**
 * Each row's label, and the metric each value column holds, in Overview (tiles) or Details (cells).
 * @param {Page} page
 * @param {'overview' | 'details'} view
 */
function valueGrid(page, view) {
  return page.locator('.portfolio-table table.po').evaluate((table, view) => ({
    columns:
      view === 'overview'
        ? [...table.querySelectorAll('thead .tlab')].map((t) => ({ abbr: t.getAttribute('data-abbr') }))
        : [...table.querySelectorAll('thead th[data-sort]')].map((th) => th.getAttribute('data-sort')).filter((k) => k?.startsWith('Analysis_')).map((id) => ({ id })),
    rows: [...table.querySelectorAll('tbody tr')].map((tr) => tr.querySelector('td.grp a[data-study]')?.textContent ?? tr.querySelector('td.grp')?.textContent?.trim() ?? ''),
  }), view);
}

test('20.06: in Overview and Details, every cell\'s and tile\'s hover gives the pooled numerator and denominator, names the denominator with the metric\'s catalog label, and has no Σn/Σd (#20)', async ({ app, page }) => {
  test.setTimeout(300_000);
  await app.open();
  const byId = new Map(studies.map((s) => [s.StudyID, s]));
  const tooltip = page.locator('#gsm-tooltip');
  for (const view of /** @type {const} */ (['overview', 'details'])) {
    await chooseView(page, view);
    const { columns, rows } = await valueGrid(page, view);
    const metrics = columns.map((c) => catalog.find((m) => ('abbr' in c ? m.Abbreviation === c.abbr : m.MetricID === c.id)));
    expect(metrics.every(Boolean) && metrics.length === catalog.length, `${view}: a column for every catalog metric`).toBe(true);
    expect(rows, view).toEqual(['Portfolio total', ...studies.map((s) => s.StudyID)]);
    let compared = 0;
    for (const [r, label] of rows.entries()) {
      const members = label === 'Portfolio total' ? studies : [/** @type {StudyEntry} */ (byId.get(label))];
      const tr = page.locator('.portfolio-table table.po tbody tr').nth(r);
      const values = view === 'overview' ? tr.locator('td.cat .otile') : tr.locator('td[data-tip]:not(.pop)');
      await expect(values, `${view} ${label}`).toHaveCount(metrics.length);
      for (const [i, m] of metrics.entries()) {
        const metric = /** @type {any} */ (m);
        const where = `${view} ${label} · ${metric.Abbreviation}`;
        await values.nth(i).hover();
        await expectSeen(tooltip, `${where}: tooltip`);
        await expect(tooltip.locator('b').first(), where).toHaveText(`${label} · ${metric.Abbreviation}`);
        const lines = await visibleLines(tooltip);
        expect(lines.join(' '), where).not.toContain('Σ');
        const want = pooled(readData, members, metric.MetricID);
        const counts = lines.map((l) => /^([\d,]+) \/ ([\d,]+) \(([^)]*)\)/.exec(l)).find(Boolean);
        expect(counts?.slice(1, 4), `${where}: the visible pooled n / d (denominator label)`).toEqual([countText(want.numerator), countText(want.denominator), metric.Denominator]);
        compared++;
      }
    }
    expect(compared, view).toBe(rows.length * catalog.length);
  }
});

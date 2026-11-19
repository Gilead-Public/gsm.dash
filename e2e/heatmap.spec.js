// @ts-check
// #23: one heatmap colour ramp, a heatmap measure that holds until Reset, and shading under Group By that matches the
// ungrouped table.
import { expect, readData, test } from './fixtures/app.js';
import { capturePortfolio } from './fixtures/baseline.js';
/** @typedef {import('@playwright/test').Page} Page */

test.describe.configure({ timeout: 120_000 });

/** @type {Array<{ StudyID: string, params: Record<string, string> }>} */
const studies = readData('portfolio.json').studies;
const ids = studies.map((s) => s.StudyID).sort();
const study = 'STUDY004';
const MEASURES = /** @type {const} */ ([['num', 'Numerator'], ['den', 'Denominator'], ['rate', 'Rate']]);
const GROUPINGS = ['therapeutic_area', 'protocol_indication', 'phase', 'status', 'product'];
const VIEWS = /** @type {const} */ (['details', 'overview']);
/** Today's default ramp, steps 1 to 4. */
const RAMP = {
  light: ['rgb(238, 244, 251)', 'rgb(214, 228, 245)', 'rgb(179, 203, 233)', 'rgb(134, 169, 216)'],
  dark: ['rgb(26, 34, 48)', 'rgb(34, 48, 74)', 'rgb(45, 68, 104)', 'rgb(59, 92, 140)'],
};

/** @param {Page} page */
const sidebar = (page) => page.locator('.sidebar');
/** @param {Page} page */
const address = (page) => new URLSearchParams(new URL(page.url()).hash.slice(1));

/** @param {Page} page */
async function settled(page) {
  await page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());
  await page.mouse.move(0, 0);
}

/**
 * The portfolio's address for a table view: a heatmap measure, Details or Overview, and optionally a grouping with
 * the given groups open.
 * @param {{ heatmap?: string, view?: string, group?: string, open?: string[], extra?: string[][] }} view
 */
function tableHash({ heatmap, view, group, open = [], extra = [] }) {
  const params = new URLSearchParams(extra);
  if (heatmap) params.set('heatmap', heatmap);
  if (view === 'details') params.set('view', 'details');
  if (group) params.set('group', group);
  for (const value of open) params.append('expand', value);
  return `#${params}`;
}

/**
 * Opens the portfolio at `hash` as a fresh load: a change of hash alone would not reload the page.
 * @param {Page} page
 * @param {import('./fixtures/app.js').App} app
 * @param {string} hash
 */
async function openAt(page, app, hash) {
  await page.goto('about:blank');
  await app.open(hash);
}

/** @param {string} param */
const groupsBy = (param) => [...new Set(studies.map((s) => s.params[param]))].sort();

/**
 * Each study row's metric cells and tiles as `<heat class>:<computed background>`, by StudyID, in column order.
 * @param {Page} page
 * @param {string} rows
 * @returns {Promise<Record<string, string[]>>}
 */
const studyShades = (page, rows) =>
  page.locator('.portfolio-table table.po').evaluate((table, selector) => {
    /** @type {Record<string, string[]>} */
    const out = {};
    for (const tr of table.querySelectorAll(selector)) {
      const cells = tr.querySelectorAll(':scope > td:not(.grp):not(.nstud):not(.pop):not(.cat), .otile');
      out[/** @type {HTMLElement} */ (tr).dataset.hl ?? ''] = [...cells].map(
        (el) => `${[...el.classList].find((c) => /^hot[1-4]$/.test(c)) ?? ''}:${getComputedStyle(el).backgroundColor}`,
      );
    }
    return out;
  }, rows);

/** @param {Record<string, string[]>} shades */
const classesOnly = (shades) => Object.fromEntries(Object.entries(shades).map(([id, cells]) => [id, cells.map((c) => c.split(':')[0])]));

for (const [configuration, config] of /** @type {const} */ ([['the built-in default', null], ['a configured default', { heatmap: 'rate' }]])) {
  test(`23.01: the heatmap measure stays as set when any filter changes, survives a reload and the trip to a study report and back, and Reset restores ${configuration} (#23)`, async ({ app, page }) => {
    const overrides = config ? { document: (/** @type {any} */ doc) => void (doc.config = config), beside: [study] } : undefined;
    await app.openReport('portfolio', overrides);
    await page.locator('#app > .layout').waitFor();
    await settled(page);
    const freshUrl = page.url();
    const fresh = await capturePortfolio(page, 'fresh load');
    const heatmap = sidebar(page).locator('select[data-heatmap]');
    await expect(heatmap).toHaveValue(config?.heatmap ?? 'none');

    await heatmap.selectOption('num');
    await settled(page);
    const set = await capturePortfolio(page, 'heatmap set');
    /** @param {string} after */
    const expectKept = async (after) => {
      await expect(heatmap, after).toHaveValue('num');
      expect(address(page).get('heatmap'), `${after}: the address`).toBe('num');
    };

    const filters = await sidebar(page)
      .locator('[data-filter], button[data-status]')
      .evaluateAll((els) =>
        els.map((e) => {
          const status = e.getAttribute('data-status');
          const kind = status ? 'metric status' : (e.getAttribute('data-filter') ?? '');
          return { kind, selector: status ? `button[data-status="${status}"]` : `[data-filter="${kind}"][data-value="${e.getAttribute('data-value')}"]` };
        }),
      );
    expect([...new Set(filters.map((f) => f.kind))].sort(), 'every kind of filter').toEqual(['metric status', 'phase', 'status', 'study', 'therapeutic_area']);
    for (const { selector: filter } of filters) {
      await sidebar(page).locator(filter).click();
      await expectKept(`${filter} changed`);
      await sidebar(page).locator(filter).click();
      await expectKept(`${filter} changed back`);
    }
    await sidebar(page).locator('[data-filter="phase"][data-value="P2"]').click();
    await sidebar(page).locator(`[data-filter="study"][data-value="${study}"]`).click();
    await sidebar(page).locator('[data-clear]').click();
    await expectKept('filters cleared');
    await settled(page);
    expect((await capturePortfolio(page, 'heatmap set')).text, 'the page after the filter changes').toBe(set.text);
    const left = page.url();

    await page.reload();
    await page.locator('#app > .layout').waitFor();
    await settled(page);
    await expectKept('reload');
    expect(page.url(), 'reload').toBe(left);
    expect((await capturePortfolio(page, 'heatmap set')).text, 'the page after a reload').toBe(set.text);

    await page.locator(`#app .portfolio-table a[data-study="${study}"]`).click();
    await page.locator(`#app > [data-study="${study}"] .tile`).first().waitFor();
    await page.locator('#app a.back').click();
    await page.locator('#app > .layout').waitFor();
    await settled(page);
    await expectKept('a study report and back');
    expect(page.url(), 'back link').toBe(left);
    expect((await capturePortfolio(page, 'heatmap set')).text, 'the page after a study report and back').toBe(set.text);

    await sidebar(page).locator('[data-reset]').click();
    await settled(page);
    await expect(heatmap, 'Reset').toHaveValue(config?.heatmap ?? 'none');
    expect(page.url(), 'Reset: the address').toBe(freshUrl);
    expect((await capturePortfolio(page, 'fresh load')).text, 'Reset: the page').toBe(fresh.text);
  });
}

test('23.03: the Controls panel offers no heatmap colour choice (#23)', async ({ app, page }) => {
  for (const heatmap of ['none', 'rate']) {
    await openAt(page, app, tableHash({ heatmap }));
    const box = sidebar(page);
    const labels = await box.locator('[data-sec="config"] .ctl > label').allTextContents();
    expect(labels, `heatmap ${heatmap}: the Config controls`).toEqual(['Highlight study', 'Cell display', 'Also show', 'Heatmap (also drives column sort)', 'Columns', 'Row density', 'Group rows by']);
    expect(await box.innerText(), `heatmap ${heatmap}: the panel's text`).not.toMatch(/colou?r|palette|\b(blue|teal|purple|gr[ae]y)\b/i);
    await expect(box.locator('[data-seg="ramp"], [data-ramp]'), `heatmap ${heatmap}: old markup`).toHaveCount(0);
    await expect(page.locator('[data-ramp]'), `heatmap ${heatmap}: no palette on the page`).toHaveCount(0);
  }
});

test('23.03: the address never carries ramp, whatever the settings, and an address that carries it loses it on opening (#23)', async ({ app, page }) => {
  await openAt(page, app, '#ramp=teal');
  expect(new URL(page.url()).hash, 'opened with ramp=teal').toBe('');
  /** @param {string} after */
  const expectNoRamp = async (after) => {
    expect(address(page).has('ramp'), `${after}: the address`).toBe(false);
    const links = await page.locator('#app a[data-study]').evaluateAll((els) => els.map((a) => a.getAttribute('href') ?? ''));
    for (const href of links) expect(new URLSearchParams(href.split('#')[1] ?? '').has('ramp'), `${after}: ${href}`).toBe(false);
  };
  const box = sidebar(page);
  /** @type {Array<[string, () => Promise<unknown>]>} */
  const steps = [
    ['heatmap Numerator', () => box.locator('select[data-heatmap]').selectOption('num')],
    ['heatmap Denominator', () => box.locator('select[data-heatmap]').selectOption('den')],
    ['heatmap Rate', () => box.locator('select[data-heatmap]').selectOption('rate')],
    ['Details', () => page.locator('button[data-view="details"]').click()],
    ['grouped by phase', () => box.locator('select[data-groupby]').selectOption('phase')],
    ['a group open', () => page.locator('tr[data-bucket="P2"] td.grp').click()],
    ['sorted', () => page.locator('th[data-sort="Analysis_kri0008"]').click()],
    ['custom cells', () => box.locator('button[data-seg="cellMode"][data-value="custom"]').click()],
    ['a filter', () => box.locator('button[data-filter="phase"][data-value="P2"]').click()],
    ['a metric hidden', () => box.locator('input[data-metric="Analysis_kri0005"]').uncheck()],
    ['a study highlighted', () => box.locator('select[data-highlight]').selectOption(study)],
    ['Distribution', () => page.locator('button[data-view="distribution"]').click()],
    ['heatmap None', async () => {
      await page.locator('button[data-view="overview"]').click();
      await box.locator('select[data-heatmap]').selectOption('none');
    }],
    ['Reset', () => box.locator('[data-reset]').click()],
  ];
  await expectNoRamp('opened');
  for (const [name, step] of steps) {
    await step();
    await expectNoRamp(name);
  }
});

test('23.03: every shaded cell and tile uses one of the single ramp\'s four colours, in the light and dark themes (#23)', async ({ app, page }) => {
  for (const scheme of /** @type {const} */ (['light', 'dark'])) {
    await page.emulateMedia({ colorScheme: scheme });
    const ramp = RAMP[scheme];
    const used = new Set();
    for (const [heatmap, name] of MEASURES) {
      for (const view of VIEWS) {
        for (const group of [undefined, 'phase']) {
          await openAt(page, app, tableHash({ heatmap, view, group, open: group ? groupsBy(group) : [] }));
          await page.mouse.move(0, 0);
          const where = `${scheme}, ${name}, ${view}, ${group ? 'grouped with every group open' : 'ungrouped'}`;
          const cells = await page.locator('.portfolio-table table.po').evaluate((table) =>
            [...table.querySelectorAll('td, .otile')].map((el) => ({
              hot: [...el.classList].find((c) => /^hot[1-4]$/.test(c)) ?? '',
              background: getComputedStyle(el).backgroundColor,
              row: el.closest('tr')?.className.trim() ?? '',
            })),
          );
          const shaded = cells.filter((c) => c.hot);
          expect(shaded.length, `${where}: shaded cells and tiles`).toBeGreaterThan(0);
          for (const c of shaded) expect(c.background, `${where}: a ${c.hot} ${c.row} cell`).toBe(ramp[Number(c.hot.slice(3)) - 1]);
          for (const c of cells.filter((c) => !c.hot)) expect(ramp, `${where}: an unshaded ${c.row} cell`).not.toContain(c.background);
          for (const c of shaded) used.add(c.background);
          if (group) expect(shaded.some((c) => c.row.includes('child')), `${where}: expanded study rows shaded`).toBe(true);
        }
      }
    }
    expect([...used].sort(), `${scheme}: all four steps seen`).toEqual([...ramp].sort());
  }
});

test('23.03: an address with ramp=teal shows the same page as one without, in the light and dark themes (#23)', async ({ app, page }) => {
  for (const scheme of /** @type {const} */ (['light', 'dark'])) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const view of [{}, { heatmap: 'rate', view: 'details' }, { heatmap: 'num', group: 'phase', open: ['P2'] }]) {
      const hash = tableHash(view);
      const where = `${scheme}, ${hash}`;
      await openAt(page, app, hash);
      await settled(page);
      const url = page.url();
      const without = await capturePortfolio(page, 'view');
      await openAt(page, app, tableHash({ ...view, extra: [['ramp', 'teal']] }));
      await settled(page);
      expect(page.url(), `${where}: the address`).toBe(url);
      expect((await capturePortfolio(page, 'view')).text, `${where}: the page`).toBe(without.text);
    }
  }
});

for (const [heatmap, name] of MEASURES) {
  test(`23.05: under ${name}, each expanded study row's cells (Details) and tiles (Overview) carry the same heat class and computed background as that study's row in the ungrouped table (#23)`, async ({ app, page }) => {
    /** @type {Record<string, Record<string, string[]>>} */
    const flat = {};
    for (const view of VIEWS) {
      await openAt(page, app, tableHash({ heatmap, view }));
      await page.mouse.move(0, 0);
      flat[view] = await studyShades(page, 'tr.study');
      expect(Object.keys(flat[view]).sort(), `${view}: every study`).toEqual(ids);
      const bins = new Set(Object.values(flat[view]).flat().map((c) => c.split(':')[0]));
      expect([...bins].sort(), `${view}: the ungrouped table uses every step`).toEqual(['hot1', 'hot2', 'hot3', 'hot4']);
    }
    expect(classesOnly(flat.overview), 'ungrouped: each study\'s tiles are shaded like its cells').toEqual(classesOnly(flat.details));

    for (const group of GROUPINGS) {
      /** @type {Record<string, Record<string, string[]>>} */
      const grouped = {};
      for (const view of VIEWS) {
        await openAt(page, app, tableHash({ heatmap, view, group, open: groupsBy(group) }));
        await page.mouse.move(0, 0);
        await expect(page.locator('tr.study.child'), `${group}, ${view}: every study under its open group`).toHaveCount(ids.length);
        grouped[view] = await studyShades(page, 'tr.study.child');
        expect(grouped[view], `grouped by ${group}, ${view}`).toEqual(flat[view]);
      }
      expect(classesOnly(grouped.overview), `grouped by ${group}: each study's tiles are shaded like its cells`).toEqual(classesOnly(grouped.details));
    }
  });
}

test('23.02: the table ungrouped and grouped with a group open, under each heatmap measure, in Details and Overview, in the light and dark themes, for visual comparison with this issue\'s Scope (#23)', async ({ app, page, evidence }) => {
  test.setTimeout(240_000);
  for (const scheme of /** @type {const} */ (['light', 'dark'])) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const [heatmap, name] of MEASURES) {
      for (const view of VIEWS) {
        for (const group of [undefined, 'phase']) {
          await openAt(page, app, tableHash({ heatmap, view, group, open: group ? ['P2'] : [] }));
          await expect(page.locator('tr.study.child')).toHaveCount(group ? studies.filter((s) => s.params.phase === 'P2').length : 0);
          await settled(page);
          await evidence.shot(page, `${scheme}, ${name}, ${view}, ${group ? 'grouped by phase, P2 open' : 'ungrouped'}`);
        }
      }
    }
  }
});

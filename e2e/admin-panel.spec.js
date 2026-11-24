// @ts-check
// #46: the Admin panel, a demo tool kept in the address; the dark palette's contrast; and no metric status on either
// report.
import { expect, readData, test } from './fixtures/app.js';
import { chartTextFailures, contrastFailures } from './fixtures/contrast.js';
import { chooseAdmin, chooseHeatmap, chooseView, closeControls, control } from './fixtures/controls.js';
import { TRACKER_CARDS, tile } from './fixtures/tiles.js';
import { layout } from './fixtures/card-layout.js';
/** @typedef {import('@playwright/test').Page} Page */

const portfolio = readData('portfolio.json');
/** @type {Array<{ StudyID: string, snapshots: string[], params: Record<string, string> }>} */
const studies = portfolio.studies;
/** @type {Array<{ MetricID: string, ID: string, GroupLevel: string, Active?: boolean, Status?: string, Abbreviation: string }>} */
const catalog = portfolio.metrics;
const shown = catalog.filter((m) => m.Active !== false && m.GroupLevel === 'Site');
const planned = shown.filter((m) => m.Status === 'Planned');
const study = 'STUDY004';
const other = /** @type {{ StudyID: string, params: Record<string, string> }} */ (studies.find((s) => s.params.phase !== studies.find((x) => x.StudyID === study)?.params.phase));
const DEFAULTS = { theme: 'auto', perrow: '4', cfgpanel: 'popover', legend: 'off', combine: 'off' };
const CHANGED = { theme: 'dark', perrow: '3', cfgpanel: 'side', legend: 'on', combine: 'on' };
const LIGHT = 'rgb(246, 247, 246)';
const DARK = 'rgb(12, 16, 21)';

/** @param {Page} page */
const address = (page) => new URLSearchParams(new URL(page.url()).hash.slice(1));
/** @param {URLSearchParams} params */
const adminParams = (params) => Object.fromEntries([...params].filter(([k]) => k in DEFAULTS));
/** @param {URLSearchParams} params */
const viewParams = (params) => [...params].filter(([k]) => !(k in DEFAULTS));

/**
 * The Admin panel's settings as its pressed buttons show them.
 * @param {Page} page
 */
const adminShown = (page) =>
  page.locator('#header-controls .admin-pop').evaluate((pop) =>
    Object.fromEntries([...pop.querySelectorAll('button[data-admin][aria-pressed="true"]')].map((b) => [b.getAttribute('data-admin'), b.getAttribute('data-value')])),
  );

/**
 * What the settings that act on the whole page did to it.
 * @param {Page} page
 */
const applied = (page) =>
  page.evaluate(() => ({ theme: document.documentElement.dataset.theme ?? 'auto', perrow: getComputedStyle(document.documentElement).getPropertyValue('--per-row').trim() }));

/** @param {Page} page */
const background = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

/** @param {Page} page */
const portfolioShown = (page) => page.locator('#app > .layout').waitFor();

/** @param {Page} page @param {string} id */
const studyShown = (page, id) => page.locator(`#app > [data-study="${id}"] .card`).first().waitFor();

test('46.01: the Admin button on both reports opens the panel with its settings at their defaults; a changed setting survives a reload, a study link and its back link, and Reset restores the defaults (#46)', async ({ app, page }) => {
  for (const open of [() => app.open(), () => app.openStudy(study)]) {
    await open();
    await page.locator('#header-controls [data-open="admin"]').click();
    await expect(page.locator('.admin-pop')).toBeVisible();
    expect(await page.locator('.admin-pop .ctl > label').allTextContents()).toEqual(['Theme', 'Study cards per row, at most', 'Config opens as', 'Heatmap legend', 'Combine similar KRI cards']);
    expect(await adminShown(page)).toEqual(DEFAULTS);
    expect(await applied(page)).toEqual({ theme: 'auto', perrow: '4' });
    await closeControls(page);
  }

  await app.open();
  for (const [key, value] of Object.entries(CHANGED)) await chooseAdmin(page, key, value);
  expect(adminParams(address(page))).toEqual(CHANGED);
  const left = page.url();
  await page.reload();
  await portfolioShown(page);
  expect(page.url(), 'reload').toBe(left);
  expect([await adminShown(page), await applied(page)], 'reload').toEqual([CHANGED, { theme: 'dark', perrow: '3' }]);

  await page.locator(`#app .portfolio-table a[data-study="${study}"]`).click();
  await studyShown(page, study);
  expect([await adminShown(page), await applied(page)], 'the study report').toEqual([CHANGED, { theme: 'dark', perrow: '3' }]);
  await page.locator('#app a.back').click();
  await portfolioShown(page);
  expect(page.url(), 'back link').toBe(left);
  expect(await adminShown(page), 'back link').toEqual(CHANGED);

  await control(page, '[data-reset]').click();
  expect([await adminShown(page), await applied(page)], 'Reset').toEqual([DEFAULTS, { theme: 'auto', perrow: '4' }]);
  expect(new URL(page.url()).hash, 'Reset').toBe('');
});

test('46.01: Admin settings changed on a study report survive its reload and its back link, which returns the portfolio\'s own settings unchanged (#46)', async ({ app, page }) => {
  await app.open();
  for (const id of [study, other.StudyID]) await control(page, `input[data-filter="study"][data-value="${id}"]`).check();
  await control(page, 'select[data-groupby]').selectOption('phase');
  await page.locator(`tr[data-bucket="${other.params.phase}"] td.grp`).click();
  await chooseHeatmap(page, 'rate');
  const before = address(page);
  expect(before.getAll('collapse'), 'a group closed').toEqual([other.params.phase]);

  await page.locator(`#app .portfolio-table a[data-study="${study}"]`).click();
  await studyShown(page, study);
  for (const [key, value] of Object.entries(CHANGED)) await chooseAdmin(page, key, value);
  const back = new URLSearchParams((await page.locator('#app a.back').getAttribute('href'))?.split('#')[1] ?? '');
  expect([adminParams(back), viewParams(back)], 'the back link, before a reload').toEqual([CHANGED, viewParams(before)]);
  await page.reload();
  await studyShown(page, study);
  expect([await adminShown(page), await applied(page)], 'the study report, reloaded').toEqual([CHANGED, { theme: 'dark', perrow: '3' }]);
  expect(viewParams(address(page)), 'the study report keeps the portfolio\'s view it arrived with').toEqual(viewParams(before));

  await page.locator('#app a.back').click();
  await portfolioShown(page);
  const after = address(page);
  expect(viewParams(after), 'the portfolio\'s own settings').toEqual(viewParams(before));
  expect(adminParams(after), 'the Admin settings set on the study report').toEqual(CHANGED);
  expect(await adminShown(page)).toEqual(CHANGED);
  await expect(page.locator(`tr[data-bucket="${other.params.phase}"] td.grp .tri`)).toHaveCount(1);
  await expect(page.locator('.portfolio-table tr.study.child'), 'the closed group stays closed').toHaveCount(1);
  expect(await control(page, 'select[data-heatmap]').inputValue()).toBe('rate');
});

test('46.02: with Theme on Auto both reports follow the system\'s light or dark setting; Light and Dark override it (#46)', async ({ app, page }) => {
  for (const name of ['portfolio', study]) {
    for (const scheme of /** @type {const} */ (['light', 'dark'])) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const [theme, colour] of [['auto', scheme === 'dark' ? DARK : LIGHT], ['light', LIGHT], ['dark', DARK]]) {
        await page.goto('about:blank');
        await app.openReport(name, undefined, theme === 'auto' ? '' : `#theme=${theme}`);
        expect(await background(page), `${name}, system ${scheme}, theme ${theme}`).toBe(colour);
      }
    }
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await app.open();
  await chooseAdmin(page, 'theme', 'dark');
  expect(await background(page), 'Dark chosen in the panel').toBe(DARK);
  await chooseAdmin(page, 'theme', 'auto');
  expect(await background(page), 'Auto chosen in the panel').toBe(LIGHT);
});

test('46.03: with Config set to open as a side panel, Config opens at the right edge at full height with the popover\'s controls, as a modal: focus moves into it, neither Tab nor a click reaches the page behind it, and it closes on Escape, an outside click and its close button, focus returning to Config (#46)', async ({ app, page }) => {
  await app.open();
  const host = page.locator('#header-controls');
  const pop = host.locator('[data-pop="config"]');
  const opener = host.locator('[data-open="config"]');
  await opener.click();
  const controls = await pop.locator('.ctl > label').allTextContents();
  await expect(pop).not.toHaveClass(/drawer/);
  await closeControls(page);
  await chooseAdmin(page, 'cfgpanel', 'side');
  const viewport = /** @type {{ width: number, height: number }} */ (page.viewportSize());
  const inside = () => page.evaluate(() => Boolean(document.querySelector('#header-controls [data-pop="config"]')?.contains(document.activeElement)));
  const link = page.locator('#app .portfolio-table a[data-study]').first();
  for (const close of ['Escape', 'an outside click', 'the close button']) {
    await opener.click();
    await expect(pop, close).toBeVisible();
    await expect(pop).toHaveAttribute('role', 'dialog');
    await expect(pop).toHaveAttribute('aria-modal', 'true');
    await expect.poll(async () => {
      const box = /** @type {{ x: number, y: number, width: number, height: number }} */ (await pop.boundingBox());
      return [Math.round(box.x + box.width), Math.round(box.y), Math.round(box.height)];
    }, `${close}: at the right edge, full height`).toEqual([viewport.width, 0, viewport.height]);
    expect(await pop.locator('.ctl > label').allTextContents(), 'the same controls').toEqual(controls);
    expect(await inside(), 'focus moves into the panel').toBe(true);
    const stops = await pop.locator('button, select, input').count();
    for (const key of ['Tab', 'Shift+Tab']) {
      for (let i = 0; i < stops + 2; i++) {
        await page.keyboard.press(key);
        expect(await inside(), `${key} ${i + 1}: focus stays in the panel`).toBe(true);
      }
    }
    if (close === 'Escape') await page.keyboard.press('Escape');
    else if (close === 'the close button') await pop.locator('[data-close="config"]').click();
    else {
      // A click on a study link behind the panel closes the panel and follows nothing.
      const at = /** @type {{ x: number, y: number }} */ (await link.boundingBox());
      const url = page.url();
      await page.mouse.click(at.x + 4, at.y + 4);
      await page.waitForTimeout(300);
      expect(page.url(), 'no link behind the panel is followed').toBe(url);
    }
    await expect(pop, `closed by ${close}`).toBeHidden();
    await expect(opener, `${close}: focus returns to Config`).toBeFocused();
  }
});

test('46.04: with the legend on and a heatmap shown, a legend between the table and the status line names the measure and its four shades from lower to higher; with the legend off or no heatmap shown, there is none (#46)', async ({ app, page }) => {
  await app.open();
  const legend = page.locator('[data-legend]');
  await chooseAdmin(page, 'legend', 'on');
  await expect(legend, 'no heatmap').toHaveCount(0);
  for (const [measure, name] of [['num', 'numerator'], ['den', 'denominator'], ['rate', 'rate']]) {
    await chooseHeatmap(page, measure);
    await expect(legend, name).toBeVisible();
    expect(await legend.innerText(), name).toMatch(new RegExp(`^Heatmap: ${name}, shaded within each column\\s+lower\\s+higher$`));
    const shades = await legend.locator('.heat-scale i').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
    const cells = await page.locator('.portfolio-table table.po').evaluate((table) =>
      [1, 2, 3, 4].map((i) => {
        const cell = table.querySelector(`td.hot${i}`);
        return cell ? getComputedStyle(cell).backgroundColor : null;
      }),
    );
    expect(shades, `${name}: the four shades, lower to higher, as the cells use them`).toEqual(cells);
    const [table, key, status] = await Promise.all(['.portfolio-table .tblwrap', '[data-legend]', '.portfolio-table .showing'].map((s) => page.locator(s).boundingBox()));
    expect(/** @type {any} */ (key).y, `${name}: below the table`).toBeGreaterThanOrEqual(/** @type {any} */ (table).y + /** @type {any} */ (table).height - 0.5);
    expect(/** @type {any} */ (status).y, `${name}: above the status line`).toBeGreaterThanOrEqual(/** @type {any} */ (key).y + /** @type {any} */ (key).height - 0.5);
  }
  await chooseView(page, 'detailed');
  await expect(legend, 'Detailed shows no heatmap').toHaveCount(0);
  await chooseView(page, 'custom');
  await expect(legend).toBeVisible();
  await chooseAdmin(page, 'legend', 'off');
  await expect(legend, 'the legend off').toHaveCount(0);
});

/** The similar standard KRIs to combine, top card first, as the request names them. */
const PAIRS = [['kri0004', 'kri0003'], ['kri0001', 'kri0002'], ['kri0008', 'kri0009'], ['kri0010', 'kri0011']];

/**
 * Each stacked pair on the study page: its cards in order, whether the second sits below the first, and whether the
 * pair is one card wide and two grid rows tall.
 * @param {Page} page
 */
const pairsShown = (page) =>
  page.locator('.tiles.cards').evaluate((grid) => {
    const one = /** @type {Element} */ (grid.querySelector(':scope > .card')).getBoundingClientRect();
    const gap = Number.parseFloat(getComputedStyle(grid).rowGap);
    return [...grid.querySelectorAll(':scope > .card-pair')].map((p) => {
      const cards = [...p.querySelectorAll(':scope > .card')];
      const box = p.getBoundingClientRect();
      return {
        ids: cards.map((c) => c.getAttribute('data-card')),
        stacked: cards.length === 2 && cards[1].getBoundingClientRect().top >= cards[0].getBoundingClientRect().bottom - 1,
        oneWide: Math.abs(box.width - one.width) < 1,
        twoTall: Math.abs(box.height - (2 * one.height + gap)) < 2,
      };
    });
  });

/**
 * Each standard KRI card's header and body text, by card id.
 * @param {Page} page
 */
const kriTexts = (page) =>
  page.locator('.card.kri').evaluateAll((els) => Object.fromEntries(els.map((e) => [e.getAttribute('data-card'), `${e.querySelector('.tile-head')?.textContent} | ${e.querySelector('.tile-body')?.textContent}`])));

test('Combine similar KRI cards, an Admin demo setting: when on, each configured pair of standard KRIs whose cards both show stacks in one card, one card wide and two rows tall, the first above the second, with their values unchanged; a pair with a card hidden shows the other alone; off, every card stands alone', async ({ app, page }) => {
  await app.openStudy(study);
  await expect(page.locator('.card-pair'), 'off by default').toHaveCount(0);
  const alone = await kriTexts(page);
  await chooseAdmin(page, 'combine', 'on');
  expect(await pairsShown(page)).toEqual(PAIRS.map((ids) => ({ ids, stacked: true, oneWide: true, twoTall: true })));
  expect(await kriTexts(page), 'each card\'s values, stacked').toEqual(alone);
  const seen = await layout(page);
  expect([seen.unseen, seen.outside], 'every stacked card\'s text seen, inside its card and its pair').toEqual([[], []]);
  const order = await page.locator('.tiles.cards > *').evaluateAll((els) => els.map((e) => e.getAttribute('data-card') ?? e.getAttribute('data-pair')));
  expect(order.slice(-5), 'each pair at its first card\'s place').toEqual(['kri0004 kri0003', 'kri0001 kri0002', 'kri0005', 'kri0008 kri0009', 'kri0010 kri0011']);

  const hidden = /** @type {{ MetricID: string }} */ (catalog.find((m) => m.ID === 'kri0003')).MetricID;
  await page.goto('about:blank');
  await app.openStudy(study, undefined, `#combine=on&hide=${hidden}`);
  expect((await pairsShown(page)).map((p) => p.ids), 'kri0003 hidden: kri0004 alone').toEqual(PAIRS.slice(1));
  await expect(page.locator('.tiles.cards > .card[data-card="kri0004"]')).toHaveCount(1);

  await chooseAdmin(page, 'combine', 'off');
  await expect(page.locator('.card-pair'), 'off again').toHaveCount(0);
});

/**
 * Every contrast failure in the dark theme on both reports, in the states a reader meets.
 * @param {Page} page
 * @param {import('./fixtures/app.js').App} app
 */
async function darkStates(page, app) {
  /** @type {Record<string, string[]>} */
  const found = {};
  const check = async (/** @type {string} */ state, scope = 'body') => {
    found[state] = await contrastFailures(page, scope);
  };
  await app.open('#theme=dark');
  await check('portfolio, Compact');
  await page.locator('.portfolio-table .otile').first().hover();
  await check('portfolio, a tile hover');
  await closeControls(page);
  await page.locator('#header-controls [data-open="filters"]').click();
  await page.locator('#header-controls [data-open="filter:study"]').click();
  await check('portfolio, Filters and the Study choices');
  await closeControls(page);
  await page.locator('#header-controls [data-open="config"]').click();
  await check('portfolio, Config');
  await closeControls(page);
  await page.locator('#header-controls [data-open="admin"]').click();
  await check('portfolio, the Admin panel');
  await closeControls(page);
  await control(page, 'select[data-groupby]').selectOption('phase');
  await chooseHeatmap(page, 'rate');
  await chooseAdmin(page, 'legend', 'on');
  for (const measure of ['num', 'den', 'rate']) {
    await chooseHeatmap(page, measure);
    await check(`portfolio, Custom with the ${measure} heatmap, grouped, with its legend`);
  }
  await chooseAdmin(page, 'cfgpanel', 'side');
  await page.locator('#header-controls [data-open="config"]').click();
  await check('portfolio, Config as a side panel');
  await closeControls(page);

  await app.openStudy(study, undefined, '#theme=dark');
  await check('study report');
  await page.locator('.card .card-value').first().hover();
  await check('study report, a value hover');
  await page.locator('.tile-foot .notes').first().focus();
  await check('study report, the notes');
  await closeControls(page);
  const kri = /** @type {{ MetricID: string }} */ (catalog.find((m) => m.ID === 'kri0001'));
  await tile(page, kri.MetricID).locator('button[data-detail-metric]').click();
  /** @type {Array<{ checked: number, failures: string[] }>} */
  const charts = [];
  for (const tab of ['Bar chart', 'Scatter plot', 'Over time']) {
    await page.locator('.detail').getByRole('tab', { name: tab }).click();
    await page.locator('.detail .viz canvas').waitFor();
    await check(`study report, the Charts panel on ${tab}`);
    charts.push(await chartTextFailures(page));
  }
  return { found, charts };
}

test('46.05: in the dark theme, on both reports, text has at least 4.5:1 against its surface, borders and bars 3:1, cell text 4.5:1 on each heat step, and each open chart\'s axis and legend text 4.5:1 against its surface (#46)', async ({ app, page }) => {
  test.setTimeout(120_000);
  // The measure itself: white text on a white `color()` surface, and on a `color-mix()` of white, fails it.
  await app.open('#theme=dark');
  await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.id = 'contrast-probe';
    probe.innerHTML = '<p style="background: color(srgb 1 1 1); color: color(srgb 1 1 1)">white on white</p><p style="background: color-mix(in srgb, white 50%, white); color: white">mixed white</p>';
    document.body.append(probe);
  });
  expect(await contrastFailures(page, '#contrast-probe'), 'the measure flags white on white').toEqual(['text "white on white" in p: 1.00', 'text "mixed white" in p: 1.00']);
  await page.evaluate(() => document.getElementById('contrast-probe')?.remove());
  const { found, charts } = await darkStates(page, app);
  for (const [state, failures] of Object.entries(found)) expect(failures, state).toEqual([]);
  expect(charts.reduce((n, c) => n + c.checked, 0), 'chart text colours measured').toBeGreaterThan(0);
  for (const c of charts) expect(c.failures).toEqual([]);
});

test('46.06: both reports in the dark theme, for visual comparison with this issue\'s Scope (#46)', async ({ app, page, evidence }) => {
  await app.open('#theme=dark');
  await evidence.shot(page, 'portfolio, Compact');
  await control(page, 'select[data-groupby]').selectOption('phase');
  await chooseHeatmap(page, 'rate');
  await chooseAdmin(page, 'legend', 'on');
  await evidence.shot(page, 'portfolio, Custom with a heatmap and its legend');
  await page.locator('#header-controls [data-open="config"]').click();
  await evidence.shot(page, 'portfolio, Config open');
  await closeControls(page);
  await app.openStudy(study, undefined, '#theme=dark');
  await evidence.shot(page, 'study report');
  const kri = /** @type {{ MetricID: string }} */ (catalog.find((m) => m.ID === 'kri0001'));
  await tile(page, kri.MetricID).locator('button[data-detail-metric]').click();
  await page.locator('.detail .viz canvas').waitFor();
  await evidence.shot(page, 'study report, Charts open');
});

/**
 * A metric status anywhere on the page, Config's metric list included: a tag's markup, a status word standing as a
 * label of its own, a status filter chip, or a hover's tag or planned note. A catalog note that mentions a planned
 * metric in a sentence is the data's own text, not a status.
 * @param {Page} page
 */
const statusTraces = (page) =>
  page.evaluate(() => {
    const traces = [...document.querySelectorAll('.pill, [data-status], .status-off, .tip-warn')].map((e) => e.outerHTML.slice(0, 60));
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) if (/^(planned|new|released)$/i.test(n.textContent?.trim() ?? '')) traces.push(`a label "${n.textContent?.trim()}"`);
    for (const e of document.querySelectorAll('[data-tip], [title]')) {
      for (const t of [e.getAttribute('data-tip') ?? '', e.getAttribute('title') ?? '']) if (/not yet released|>\s*(planned|new|released)\s*</i.test(t)) traces.push(t.slice(0, 80));
    }
    return traces;
  });

test('46.07: neither report shows a metric status tag, a planned hover, muted planned values or status filter chips, and an address\'s statuses parameter is ignored and removed (#46)', async ({ app, page }) => {
  expect(planned.length, 'planned metrics in the example data').toBeGreaterThan(0);
  await app.open('#statuses=Released');
  expect(new URL(page.url()).hash, 'the statuses parameter is removed').toBe('');
  await expect(page.locator('.portfolio-table .tlab'), 'every metric shown').toHaveCount(shown.length);
  await page.locator('#header-controls [data-open="config"]').click();
  expect(await statusTraces(page), 'Compact, Config open').toEqual([]);
  await closeControls(page);
  for (const view of /** @type {const} */ (['detailed', 'custom'])) {
    await chooseView(page, view);
    await closeControls(page);
    expect(await statusTraces(page), view).toEqual([]);
    // A planned metric's values are the colour of any other's.
    const colours = await page.locator('.portfolio-table tr.total').evaluate((tr, ids) => {
      const head = [...document.querySelectorAll('thead th[data-sort^="Analysis_"]')].map((th) => th.getAttribute('data-sort'));
      const cells = [...tr.querySelectorAll('td[data-tip]:not(.pop)')];
      return [...new Set(cells.map((td, i) => `${ids.includes(head[i] ?? '') ? 'planned' : 'other'} ${getComputedStyle(td).color}`))].map((s) => s.split(' ').slice(1).join(' '));
    }, planned.map((m) => m.MetricID));
    expect(new Set(colours).size, `${view}: planned and other values share one colour`).toBe(1);
  }
  // A study report keeps the portfolio's view in its address and back link, without the retired parameter (#47's
  // rewrite of an old View included), and an Admin change there doesn't bring it back.
  const hidden = /** @type {{ MetricID: string }} */ (catalog.find((m) => m.ID === 'kri0005')).MetricID;
  await app.openStudy(study, undefined, `#statuses=Released&hide=${hidden}&theme=dark&view=details&cell=custom`);
  await expect(page.locator('.tiles.cards > .card'), 'every card shown but the hidden metric\'s').toHaveCount(TRACKER_CARDS.filter((c) => c.metric !== 'kri0005').length);
  const kept = `hide=${hidden}&theme=dark&view=custom`;
  expect(new URL(page.url()).hash, 'the study report\'s address').toBe(`#${kept}`);
  expect(await page.locator('#app a.back').getAttribute('href'), 'its back link').toBe(`./portfolio.html#${kept}`);
  await chooseAdmin(page, 'perrow', '3');
  expect(new URL(page.url()).hash, 'after an Admin change').toBe(`#${kept}&perrow=3`);
  expect(await page.locator('#app a.back').getAttribute('href'), 'its back link after an Admin change').toBe(`./portfolio.html#${kept}&perrow=3`);
  await page.goto('about:blank');
  await app.openStudy(study, undefined, '#statuses=Released');
  await expect(page.locator('.tiles.cards > .card'), 'every card shown').toHaveCount(TRACKER_CARDS.length);
  expect(new URL(page.url()).hash, 'the statuses parameter alone, removed').toBe('');
  await page.locator('.card .tile-head .name').first().hover();
  expect(await statusTraces(page), 'the study report').toEqual([]);
});

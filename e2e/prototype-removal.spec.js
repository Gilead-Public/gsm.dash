// @ts-check
// #35: prototype features no requirement backs are gone from both reports. Each check looks for the feature both by
// what a user sees (its text or accessible name) and by its old markup, so a renamed copy can't slip through.
import { expect, readData, test } from './fixtures/app.js';
import { pageAllTo, tile } from './fixtures/tiles.js';
import { visibleLines } from './fixtures/visible.js';
import { chooseView, closeControls, control } from './fixtures/controls.js';
import { capturePortfolio } from './fixtures/baseline.js';
/** @typedef {import('@playwright/test').Page} Page */

const portfolio = readData('portfolio.json');
/** @type {Array<{ StudyID: string, snapshots: string[] }>} */
const studies = portfolio.studies;
const study = studies[0];
const KRI = 'Analysis_kri0001';
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

    const dates = /** @type {{ snapshots: string[] }} */ (studies.find((s) => s.StudyID === id)).snapshots;
    for (const at of [0, dates.length - 1]) {
      await page.locator('input[type="range"][data-visit]').evaluate((el, i) => {
        /** @type {HTMLInputElement} */ (el).value = String(i);
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }, at);
      for (const view of ['Details', 'Trend over time']) {
        await pageAllTo(page, view);
        const text = await page.locator('.study-page').innerText();
        const where = `${id}, visit ${at + 1}, ${view}`;
        expect(text, `${where}: comparison line`).not.toMatch(/this study|^portfolio /im);
        expect(text, `${where}: badge`).not.toMatch(/^(standard|custom)$/im);
      }
    }

    await tile(page, KRI).locator('button[data-detail-metric]').click();
    const panel = page.locator('.detail');
    await expect(panel, `${id}: Charts panel`).toBeVisible();
    expect(await panel.innerText(), `${id}: Charts panel badge`).not.toMatch(/^(standard|custom)$/im);
    await tile(page, KRI).locator('button[data-detail-metric]').click();
    await expect(panel).toHaveCount(0);
  }
});

test('35.04: both reports without the removed features, for visual comparison with this issue\'s Scope (#35)', async ({ app, page, evidence }) => {
  await app.open();
  await evidence.shot(page, 'portfolio');
  await app.openStudy(study.StudyID);
  await tile(page, KRI).locator('button[data-detail-metric]').click();
  await expect(page.locator('.detail')).toBeVisible();
  await evidence.shot(page, 'study, Charts panel open');
});

/** @type {Record<string, string>} */
const OWN_VIEWS = { 'distribution-bar': 'Breakdowns', 'link-out': 'Report link' };
const FLAGGED = 'STUDY006';

/**
 * A tile's views in paging order, read by paging it once around.
 * @param {Page} page
 * @param {string} metricId
 */
async function pagedViews(page, metricId) {
  const name = tile(page, metricId).locator('.view-name');
  const parse = async () => /** @type {RegExpExecArray} */ (/^(.*) (\d+)\/(\d+)$/.exec(((await name.textContent()) ?? '').trim()));
  const [, , , total] = await parse();
  /** @type {string[]} */
  const views = [];
  for (let k = 0; k < Number(total); k++) {
    const [, label, at] = await parse();
    views[Number(at) - 1] = label;
    await tile(page, metricId).locator('button[data-view-step="1"]').click();
  }
  return views;
}

test('35.05: each full study tile pages through exactly Details, Trend over time, its own views and, where configured, the flag views; no Overview, Scatter or Numerator by site view, and no All tiles menu (#35)', async ({ app, page }) => {
  /** @type {Array<{ MetricID: string, Widget?: string, Widgets?: string[] }>} */
  const metrics = portfolio.metrics;
  for (const id of [study.StudyID, FLAGGED]) {
    await app.openStudy(id);
    await expect(page.locator('select[data-all-views]'), `${id}: menu`).toHaveCount(0);
    expect(await page.locator('.study-page').innerText(), `${id}: menu label`).not.toMatch(/all tiles/i);
    const ids = await page.locator('.tile:not(.kri)[data-metric-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-metric-id') ?? ''));
    expect(ids.length).toBeGreaterThan(10);
    for (const metricId of ids) {
      const m = /** @type {{ Widget?: string, Widgets?: string[] }} */ (metrics.find((x) => x.MetricID === metricId));
      const own = [m.Widget, ...(m.Widgets ?? [])].filter((w) => w !== undefined).map((w) => OWN_VIEWS[/** @type {string} */ (w)]);
      const flags = id === FLAGGED ? ['Outlier sites', 'Flag distribution'] : [];
      expect(await pagedViews(page, metricId), `${id} · ${metricId}`).toEqual(['Details', 'Trend over time', ...own, ...flags]);
    }
  }
});

test('35.06: clicking a site in a chart highlights nothing: no site chip, and no chart, flag view or Charts panel changes (#35)', async ({ app, page }) => {
  await page.addInitScript(() => {
    /** @type {any[]} */
    const made = [];
    /** @type {any} */
    let api;
    Object.defineProperty(window, 'gsmViz', {
      configurable: true,
      get: () => api,
      set(value) {
        const charts = value.default;
        for (const [name, make] of Object.entries(charts)) {
          if (typeof make !== 'function') continue;
          charts[name] = (/** @type {any[]} */ ...args) => {
            const chart = make(...args);
            if (chart) made.push(chart);
            return chart;
          };
        }
        api = value;
      },
    });
    /** @type {any} */ (window).__charts = made;
  });
  await app.openStudy(FLAGGED);
  await pageAllTo(page, 'Outlier sites');
  // gsm.viz sets its canvas's cursor as the pointer passes over marks; that hover cue is not a selection.
  const state = () =>
    page.evaluate(() => ({
      html: /** @type {HTMLElement} */ (document.querySelector('.study-page')).outerHTML.replace(/ cursor: \w+;/g, ''),
      canvas: [...document.querySelectorAll('canvas')].map((c) => c.toDataURL()),
    }));
  /** Moves the pointer away and waits until the page and its charts stop changing. */
  const settle = async () => {
    await page.mouse.move(0, 0);
    let last = JSON.stringify(await state());
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(200);
      const now = JSON.stringify(await state());
      if (now === last) return JSON.parse(now);
      last = now;
    }
    throw new Error('the page kept changing');
  };

  // A click must change nothing beyond what hovering the same point does: gsm.viz keeps some charts' hover state after
  // the pointer leaves.
  /**
   * @param {import('@playwright/test').Locator} target What the click must land on.
   * @param {{ x: number, y: number } | undefined} at A point inside it, or its centre.
   * @param {string} what
   */
  const clickChangesNothing = async (target, at, what) => {
    await target.hover({ position: at });
    await page.waitForTimeout(300);
    const hovered = await settle();
    await target.click({ position: at });
    await page.waitForTimeout(300);
    expect(await settle(), what).toEqual(hovered);
  };

  const rows = page.locator('.tile [data-site]');
  expect(await rows.count(), 'flag views show site rows to click').toBeGreaterThan(3);
  for (const i of [0, 1]) await clickChangesNothing(rows.nth(i), undefined, `flag-view site ${i + 1}`);

  await tile(page, KRI).locator('button[data-detail-metric]').click();
  for (const tab of ['Bar chart', 'Scatter plot', 'Over time']) {
    await page.locator('.detail').getByRole('tab', { name: tab }).click();
    const canvas = page.locator('.detail .viz canvas');
    await expect(canvas, tab).toBeVisible();
    await settle();
    const marks = await page.evaluate(() => {
      const chart = /** @type {any} */ (window).__charts.at(-1);
      /** @type {Array<[number, number]>} */
      const out = [];
      chart.data.datasets.forEach((/** @type {any} */ _, /** @type {number} */ i) => {
        for (const el of chart.getDatasetMeta(i).data.slice(0, 2)) if (Number.isFinite(el.x) && Number.isFinite(el.y)) out.push([el.x, el.y]);
      });
      return out.slice(0, 4);
    });
    expect(marks.length, `${tab}: marks to click`).toBeGreaterThan(0);
    for (const [x, y] of marks) await clickChangesNothing(canvas, { x, y }, `${tab}: the mark at ${Math.round(x)}, ${Math.round(y)}`);
  }
  await expect(page.locator('.sitechip, [data-clear-site], .is-sel, .is-dim')).toHaveCount(0);
});

test('35.07: CTQ tiles have no Charts button or panel, and each standard-KRI widget keeps its Charts drill-in (#35)', async ({ app, page }) => {
  await app.openStudy(study.StudyID);
  const ctq = page.locator('.tile:not(.kri)[data-metric-id]');
  expect(await ctq.count()).toBeGreaterThan(10);
  await expect(ctq.locator('button[data-detail-metric]')).toHaveCount(0);
  await expect(ctq.getByRole('button', { name: /charts/i })).toHaveCount(0);
  const kri = page.locator('.tile.kri[data-metric-id]');
  const count = await kri.count();
  expect(count).toBeGreaterThan(5);
  await expect(kri.getByRole('button', { name: /charts/i })).toHaveCount(count);
  for (const i of [0, count - 1]) {
    const widget = kri.nth(i);
    await widget.getByRole('button', { name: /charts/i }).click();
    await expect(page.locator('.detail')).toBeVisible();
    await expect(page.locator('.detail .detail-title')).toHaveText(/** @type {string} */ (await widget.locator('.name').textContent()));
    await widget.getByRole('button', { name: /charts/i }).click();
    await expect(page.locator('.detail')).toHaveCount(0);
  }
});

test('35.08: the portfolio\'s Metrics section has no All / None or per-category all / none controls, and each metric\'s checkbox still hides and shows it (#35)', async ({ app, page }) => {
  await app.open();
  const controls = page.locator('#header-controls');
  await page.locator('#header-controls [data-open="config"]').click();
  await expect(controls.getByRole('button', { name: /^(all|none)$/i })).toHaveCount(0);
  await expect(controls.locator('[data-metrics-all], [data-group-metrics]')).toHaveCount(0);
  await chooseView(page, 'details');
  const box = control(page, 'input[data-metric="Analysis_kri0012"]');
  const column = page.locator('.portfolio-table th[data-sort="Analysis_kri0012"]');
  await expect(column).toHaveCount(1);
  await box.uncheck();
  await expect(column).toHaveCount(0);
  await box.check();
  await expect(column).toHaveCount(1);
});

test('35.09: a study with one snapshot shows "Extract: <date>" with that date, in place of the visit slider (#35)', async ({ app, page }) => {
  const last = /** @type {string} */ (study.snapshots.at(-1));
  await app.openReport(study.StudyID, {
    document: (doc) => {
      doc.study.snapshots = [last];
      doc.snapshots = doc.snapshots.filter((/** @type {{ SnapshotDate: string }} */ s) => s.SnapshotDate === last);
    },
  });
  await expect.poll(() => visibleLines(page.locator('.dd-head')), 'the label and its date can be seen').toContain(`Extract: ${last}`);
  await expect(page.locator('input[type="range"][data-visit]')).toHaveCount(0);
});

test('35.10: the portfolio has no Distribution view, view tabs or hint, or category folding; an address\'s retired settings are ignored and removed, and its supported ones keep their effect (#35)', async ({ app, page }) => {
  const settled = async () => {
    await page.evaluate(() => /** @type {HTMLElement | null} */ (document.activeElement)?.blur());
    await page.mouse.move(0, 0);
  };
  await app.open();
  await settled();
  const fresh = await capturePortfolio(page, 'fresh load');
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /distribution|fold|open .* for full values/i })).toHaveCount(0);
  await expect(page.locator('.view-switch, .portfolio-dist, [data-view], [data-fold], [data-dfold], button.fold, [data-seg="density"]')).toHaveCount(0);
  expect(await bodyText(page)).not.toMatch(/distribution|click a band|each dot|row density|\broomy\b|\bcondensed\b/i);

  const tiles = await page.locator('table.po .otile').count();
  for (const band of await page.locator('thead th.bandh').all()) {
    const name = await band.innerText();
    await band.click({ position: { x: 4, y: 4 } });
    expect(new URL(page.url()).hash, `clicking ${name}`).toBe('');
    expect(await page.locator('table.po .otile').count(), `clicking ${name}`).toBe(tiles);
  }
  await settled();
  expect((await capturePortfolio(page, 'fresh load')).text, 'clicking the band headers').toBe(fresh.text);

  for (const old of ['#view=distribution&dfold=Disposition', '#view=mixed&open=Disposition&open=Safety', '#open=all', '#density=condensed']) {
    await page.goto('about:blank');
    await app.open(old);
    await settled();
    expect(new URL(page.url()).hash, old).toBe('');
    expect((await capturePortfolio(page, 'fresh load')).text, old).toBe(fresh.text);
  }

  // A supported setting beside retired ones keeps its effect.
  await page.goto('about:blank');
  await app.open('#view=details&heatmap=rate');
  await settled();
  const supported = await capturePortfolio(page, 'supported settings');
  await page.goto('about:blank');
  await app.open('#view=details&density=condensed&open=Disposition&dfold=Safety&heatmap=rate');
  await settled();
  expect(new URL(page.url()).hash, 'supported settings beside retired ones').toBe('#view=details&heatmap=rate');
  expect((await capturePortfolio(page, 'supported settings')).text, 'supported settings beside retired ones').toBe(supported.text);
});

test('35.11: the portfolio has no study highlight: no Highlight study control and no marked row, clicking a study row outside its links changes nothing, and an address\'s study parameter is ignored and removed (#35)', async ({ app, page }) => {
  await app.open();
  const controls = page.locator('#header-controls');
  await controls.locator('[data-open="config"]').click();
  await expect(controls.locator('select[data-highlight]')).toHaveCount(0);
  expect(await controls.innerText(), 'the header controls, Config open').not.toMatch(/highlight/i);
  await closeControls(page);
  // No instruction to highlight is left anywhere: the page's text, native titles and hover tips, collapsed and expanded.
  for (const view of ['overview', 'details']) {
    await chooseView(page, view);
    const cues = await page.evaluate(() => [
      document.body.innerText,
      ...[...document.querySelectorAll('[title], [data-tip]')].flatMap((el) => [el.getAttribute('title') ?? '', el.getAttribute('data-tip') ?? '']),
    ].filter((t) => /highlight/i.test(t)));
    expect(cues, `${view}: highlight instructions`).toEqual([]);
  }
  await chooseView(page, 'overview');
  await closeControls(page);
  const fresh = await capturePortfolio(page, 'fresh load');

  for (const { StudyID } of studies.slice(0, 3)) {
    const row = page.locator(`.portfolio-table tr.study[data-hl="${StudyID}"]`);
    const name = row.locator('td.grp');
    const box = /** @type {{ width: number, height: number }} */ (await name.boundingBox());
    for (const [what, click] of /** @type {Array<[string, () => Promise<void>]>} */ ([
      ['the name cell outside its link', () => name.click({ position: { x: box.width - 3, y: box.height / 2 } })],
      ['a population cell', () => row.locator('td.pop').first().click()],
    ])) {
      await click();
      await page.mouse.move(0, 0);
      expect(new URL(page.url()).hash, `${StudyID}, ${what}: the address`).toBe('');
      await expect(page.locator('.portfolio-table tr.sel'), `${StudyID}, ${what}: a marked row`).toHaveCount(0);
      expect((await capturePortfolio(page, 'fresh load')).text, `${StudyID}, ${what}: the page`).toBe(fresh.text);
    }
  }

  for (const [hash, kept] of [[`#study=${studies[0].StudyID}`, ''], [`#study=${studies[0].StudyID}&heatmap=rate`, '#heatmap=rate']]) {
    await page.goto('about:blank');
    await app.open(hash);
    await page.mouse.move(0, 0);
    expect(new URL(page.url()).hash, hash).toBe(kept);
    await expect(page.locator('.portfolio-table tr.sel'), `${hash}: a marked row`).toHaveCount(0);
    if (!kept) expect((await capturePortfolio(page, 'fresh load')).text, hash).toBe(fresh.text);
  }
});

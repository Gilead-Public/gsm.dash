// @ts-check
// Characterization of the study page, written against its markup contract (class names and data attributes): one
// card per widget the tracker requests (#10, #32), the visit scrubber and the standard KRIs' chart drill-in.
import { expect, readData, test } from './fixtures/app.js';
import { card, shownCards, tile, TRACKER_CARDS } from './fixtures/tiles.js';
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('../test/qual/pooling.js').StudyEntry} StudyEntry */
/** @typedef {import('../test/qual/pooling.js').MetricMeta & { Metric: string }} MetricMeta */

const portfolio = readData('portfolio.json');
/** @type {StudyEntry[]} */
const studies = portfolio.studies;
/** @type {MetricMeta[]} */
const catalog = portfolio.metrics;
/** @param {string} id */
const metricOf = (id) => /** @type {MetricMeta} */ (catalog.find((m) => /** @type {any} */ (m).ID === id));
// A study that started later than most, so its snapshots are its own rather than the portfolio's dates.
const most = Math.max(...studies.map((s) => s.snapshots.length));
const study = /** @type {StudyEntry} */ (studies.find((s) => s.snapshots.length < most));
/** A shown metric without a card. */
const cardless = metricOf('ctq0002');
/** The cards as they should read: each id, title and metric. A standard KRI's card takes its metric's name. */
const EXPECTED = TRACKER_CARDS.map((c) => [c.id, c.title || metricOf(c.metric).Metric, metricOf(c.metric).MetricID]);

/**
 * The open chart panel's chart: its caption, whether a canvas was painted, and any error placeholder.
 * @param {Page} page
 */
const panelChart = (page) =>
  page.locator('.detail .detail-body').evaluate((body) => {
    const painted = [...body.querySelectorAll('.viz canvas')].some((el) => {
      const c = /** @type {HTMLCanvasElement} */ (el);
      const ctx = c.width && c.height ? c.getContext('2d') : null;
      if (!ctx) return false;
      const px = ctx.getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < px.length; i += 4) if (px[i]) return true;
      return false;
    });
    return {
      caption: (body.querySelector('.viz-cap')?.textContent ?? '').trim(),
      painted,
      placeholder: Boolean(body.querySelector('.viz-placeholder')),
      fallbackNote: Boolean(body.querySelector(':scope > p')),
    };
  });

test.describe('study page behaviour', () => {
  test.beforeEach(async ({ app }) => {
    await app.openStudy(study.StudyID);
  });

  test('12.02: every card the tracker requests shows its widget, with no placeholder and no notice (#12)', async ({ page }) => {
    expect(await shownCards(page)).toEqual(EXPECTED);
    await expect(page.locator('.config-notice')).toHaveCount(0);
    await expect(page.locator('.ref-problem')).toHaveCount(0);
    for (const c of TRACKER_CARDS) {
      const body = card(page, c.id).locator('.tile-body');
      const shown = { bars: '.dist .dist-row', kri: '.kri .kri-flags li' }[c.kind];
      await expect(body.locator(shown).first(), c.id).toBeVisible();
    }
  });

  test('hovering a card\'s title shows its metric\'s definition', async ({ page }) => {
    const metric = metricOf('kri0014');
    await card(page, 'ie-criteria').locator('.tile-head .name').hover();
    const tip = page.locator('#gsm-tooltip');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(metric.Metric);
    await expect(tip).toContainText('Definition');
  });

  test('12.02: the chart panel opens across the grid after its standard KRI\'s card, switches tabs, and closes (#12)', async ({ page }) => {
    const id = metricOf('kri0001').MetricID;
    const more = tile(page, id).locator('button[data-detail-metric]');
    await expect(page.locator('.detail')).toHaveCount(0);
    await more.click();
    const panel = page.locator('.cards > .detail');
    await expect(panel).toBeVisible();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(await panel.evaluate((el) => el.previousElementSibling?.getAttribute('data-metric-id')), 'the panel follows its card').toBe(id);
    const [grid, box] = await Promise.all([page.locator('.cards').boundingBox(), panel.boundingBox()]);
    expect(Math.round(box?.width ?? 0), 'the panel spans the grid').toBe(Math.round(grid?.width ?? -1));
    const tabs = panel.locator('.tabs [role="tab"]');
    await expect(tabs).toHaveText(['Bar chart', 'Scatter plot', 'Over time']);
    const abbr = metricOf('kri0001').Abbreviation;
    await expect(panel.locator('.detail-head .abbr')).toHaveText(abbr);
    for (const [label, chart] of [['Bar chart', 'barChart'], ['Scatter plot', 'scatterPlot'], ['Over time', 'timeSeries']]) {
      if (label !== 'Bar chart') await tabs.filter({ hasText: label }).click();
      await expect(page.locator('.detail .tabs [aria-selected="true"]')).toHaveText(label);
      await expect.poll(() => panelChart(page), label).toEqual({ caption: `gsm.viz · ${chart} · ${abbr}`, painted: true, placeholder: false, fallbackNote: false });
    }
    await page.locator('.detail button[data-detail-close]').click();
    await expect(page.locator('.detail')).toHaveCount(0);
    await more.click();
    await expect(page.locator('.detail')).toHaveCount(1);
    await more.click();
    await expect(page.locator('.detail')).toHaveCount(0);
  });
});

test('the study page sits in the app shell: brand, inside the page margins', async ({ app, page }) => {
  await app.openStudy(study.StudyID);
  const header = page.locator('header.app');
  await expect(header.locator('h1')).toHaveText('gsm.dash');
  const shell = await header.boundingBox();
  const content = await page.locator('#app > .study-page').boundingBox();
  expect(shell && content, 'header and study page both laid out').toBeTruthy();
  expect(Math.round(content?.x ?? 0), 'the study page lines up with the header').toBe(Math.round(shell?.x ?? -1));
  expect(content?.x ?? 0, 'inside the page margins').toBeGreaterThanOrEqual(20);
});

/** Counts the gsm.viz charts the page has made and not destroyed, by wrapping the bundle's chart functions as it loads. */
function trackCharts() {
  const live = new Set();
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
          if (typeof chart?.destroy === 'function') {
            live.add(chart);
            const destroy = chart.destroy.bind(chart);
            chart.destroy = () => {
              live.delete(chart);
              return destroy();
            };
          }
          return chart;
        };
      }
      api = value;
    },
  });
  /** @type {any} */ (window).__liveCharts = () => live.size;
}

test('12.02: switching the drill-in between cards and between chart tabs leaves one live gsm.viz chart per chart shown (#12)', async ({ app, page }) => {
  await page.addInitScript(trackCharts);
  await app.openStudy(study.StudyID);
  const charts = () => page.evaluate(() => ({ live: /** @type {any} */ (window).__liveCharts(), shown: document.querySelectorAll('.viz canvas').length }));
  await page.locator('button[data-detail-metric]').first().click();
  await expect.poll(charts, 'drill-in opened').toEqual({ live: 1, shown: 1 });
  for (const at of [1, 2, 0]) {
    await page.locator('button[data-detail-metric]').nth(at).click();
    await expect.poll(charts, `the drill-in of KRI card ${at + 1}`).toEqual({ live: 1, shown: 1 });
  }
  for (const name of ['Scatter plot', 'Over time', 'Bar chart']) {
    await page.locator('.detail').getByRole('tab', { name }).click();
    await expect.poll(charts, name).toEqual({ live: 1, shown: 1 });
  }
  await page.locator('.detail button[data-detail-close]').click();
  await expect.poll(charts, 'drill-in closed').toEqual({ live: 0, shown: 0 });
});

/** What shows site-flag counts outside a standard KRI's card: flag bars, flag counts and flag views' rows. */
const CTQ_FLAG_MARKS = '.card:not(.kri) :is(.flags, .fbar, .fcounts, .hbar, .kri-flags, [data-flag], [class*="flag-"])';
const FLAG_VIEW_TEXT = /Outlier sites|Flag distribution|Sites by flag|\b\d+R·\d+A·\d+G/;

/**
 * Every CTQ card's text.
 * @param {Page} page
 */
const ctqText = (page) => page.locator('.card:not(.kri)').evaluateAll((els) => els.map((e) => (e.textContent ?? '').replace(/\s+/g, ' ')).join(' | '));

test.describe('site-flag counts on the study view', () => {
  test('11.01: no card outside the standard KRIs shows site-flag counts, a flag bar or a flag view, by default and when a catalog entry names flag views, which the notice lists (#11)', async ({ app, page }) => {
    await app.openStudy(study.StudyID);
    await expect(page.locator('.card:not(.kri)')).toHaveCount(TRACKER_CARDS.filter((c) => c.kind !== 'kri').length);
    await expect(page.locator('.card.kri .kri-flags li[data-flag]').first(), 'the standard KRIs still show theirs').toBeVisible();
    await expect(page.locator(CTQ_FLAG_MARKS)).toHaveCount(0);
    expect(await ctqText(page)).not.toMatch(FLAG_VIEW_TEXT);

    const metric = metricOf('kri0014');
    await app.openStudy(study.StudyID, {
      portfolio: (p) => {
        const meta = p.metrics.find((/** @type {any} */ x) => x.ID === 'kri0014');
        meta.Widgets = ['bar-outliers', 'flag-dist'];
        meta.WidgetConfigs = { ...meta.WidgetConfigs, 'scalar-tile': { flags: true }, 'flag-dist': {} };
        p.metrics.find((/** @type {any} */ x) => x.MetricID === cardless.MetricID).Widget = 'bar-outliers';
      },
    });
    await expect(card(page, 'eligibility-status').locator('.dist .dist-row').first()).toBeVisible();
    await expect(page.locator(CTQ_FLAG_MARKS)).toHaveCount(0);
    expect(await ctqText(page)).not.toMatch(FLAG_VIEW_TEXT);
    const where = `${metric.Abbreviation} (${metric.MetricID})`;
    const reason = 'tile views are retired, and each card shows one widget.';
    await expect(page.locator('.config-notice li')).toHaveText([
      `Widget "bar-outliers" in the catalog entry of ${cardless.Abbreviation} (${cardless.MetricID}): ${reason}`,
      `Views "bar-outliers", "flag-dist" in the catalog entry of ${where}: ${reason}`,
      `View options for "scalar-tile" in the catalog entry of ${where}: ${reason}`,
      `View options for "flag-dist" in the catalog entry of ${where}: ${reason}`,
    ]);
  });

  test('11.04: the default study view, for visual comparison with the default its Scope describes (#11)', async ({ app, page }) => {
    await app.openStudy(study.StudyID);
    expect(await shownCards(page)).toEqual(EXPECTED);
    await expect(page.locator(CTQ_FLAG_MARKS)).toHaveCount(0);
  });
});

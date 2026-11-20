// @ts-check
// Characterization of the study page as it ships today, written against its markup contract (class names and data
// attributes) so the same tests run unchanged on the React page. Behaviour that spans pages (the back link, hidden
// metrics carried from the program view) is out of scope here; it moves with the portfolio page.
import { expect, readData, test } from './fixtures/app.js';
import { latestSnapshot, shownMetrics, siteRows } from '../test/qual/pooling.js';
import { STUDY_VIEW_CONFIG } from '../src/config/study-views.js';
import { KRI_GROUPS } from '../src/config/kri-groups.js';
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('../test/qual/pooling.js').StudyEntry} StudyEntry */
/** @typedef {import('../test/qual/pooling.js').MetricMeta} MetricMeta */

const portfolio = readData('portfolio.json');
/** @type {StudyEntry[]} */
const studies = portfolio.studies;
/** @type {Map<string, MetricMeta>} */
const metrics = new Map(portfolio.metrics.map((/** @type {MetricMeta} */ m) => [m.MetricID, m]));
// A study that started later than most, so its visits are its own rather than the portfolio's dates.
const most = Math.max(...studies.map((s) => s.snapshots.length));
const study = /** @type {StudyEntry} */ (studies.find((s) => s.snapshots.length < most));
const dates = study.snapshots;

const STANDARD_VIEWS = ['Details', 'Trend over time'];
/** The site-flag views, which a study's or a metric's configuration turns on (#11). */
/** @type {Record<string, string>} */
const FLAG_VIEWS = { 'bar-outliers': 'Outlier sites', 'flag-dist': 'Flag distribution' };
/** @type {Record<string, string>} */
const CUSTOM_VIEWS = { 'distribution-bar': 'Breakdowns', 'link-out': 'Report link', ...FLAG_VIEWS };
/** Standard KRIs in a group are compact widgets (#32); every other shown metric is a full tile. */
const KRIS = new Set(KRI_GROUPS.flatMap((g) => g.metrics));
const tiles = shownMetrics(portfolio.metrics).filter((m) => !KRIS.has(/** @type {any} */ (m).ID));

/**
 * A metric's tile views in paging order: the standard views, then its own, then those its study's configuration adds.
 * @param {MetricMeta} metric
 * @param {StudyEntry} [of]
 */
function viewsOf(metric, of = study) {
  const added = STUDY_VIEW_CONFIG[of.StudyID]?.views ?? [];
  const own = [metric.Widget, ...(metric.Widgets ?? [])].filter((w) => w !== undefined);
  const names = [...new Set([...own, ...added])];
  for (const w of names) if (!(w in CUSTOM_VIEWS)) throw new Error(`no expected label for the view ${w}`);
  return [...STANDARD_VIEWS, ...names.map((w) => CUSTOM_VIEWS[w])];
}

/**
 * The view-name text a tile shows for a view.
 * @param {MetricMeta} metric
 * @param {string} view
 * @param {StudyEntry} [of]
 */
function viewText(metric, view, of = study) {
  const views = viewsOf(metric, of);
  return `${view} ${views.indexOf(view) + 1}/${views.length}`;
}

/**
 * @param {MetricMeta} metric
 * @param {StudyEntry} [of]
 */
const defaultView = (metric, of = study) => viewText(metric, metric.Widget ? CUSTOM_VIEWS[metric.Widget] : 'Details', of);

/**
 * Every tile's metric and view name, in page order.
 * @param {Page} page
 */
const shownViews = (page) =>
  page.locator('.tile:not(.kri)[data-metric-id]').evaluateAll((els) =>
    els.map((t) => [t.getAttribute('data-metric-id'), (t.querySelector('.view-name')?.textContent ?? '').replace(/\s+/g, ' ').trim()]),
  );

/**
 * @param {(metric: MetricMeta) => string} view
 */
const expectedViews = (view) => tiles.map((m) => [m.MetricID, view(m)]);

/**
 * What a tile's body shows, reduced to the marks each view is known by.
 * @param {Page} page
 * @param {string} metricId
 */
function tileContent(page, metricId) {
  return tile(page, metricId).evaluate((t) => {
    const body = /** @type {Element} */ (t.querySelector('.tile-body'));
    const text = (/** @type {Element | null | undefined} */ el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    /** Rendered: not hidden by display, visibility or opacity, and with a size. */
    const shown = (/** @type {Element | null | undefined} */ el) => {
      if (!el?.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    /** What a user can read: the text if rendered, a marker if present but hidden. */
    const seen = (/** @type {Element | null | undefined} */ el) => (el ? (shown(el) ? text(el) : '(hidden)') : '');
    const fbar = body.querySelector('.fbar');
    return {
      fallback: Boolean(body.querySelector('.ref-problem, .viz-placeholder')),
      heading: seen(body.querySelector('.sub-h')),
      big: text(body.querySelector('.big')),
      terms: [...body.querySelectorAll('dl.kv dt')].map(text),
      values: [...body.querySelectorAll('dl.kv dd')].map(text),
      flagBar: shown(fbar),
      flagSegments: [...(fbar?.querySelectorAll('i') ?? [])].filter(shown).map((i) => [i.className, Number(getComputedStyle(i).flexGrow)]),
      flagCounts: seen(body.querySelector('.fcounts')),
      points: body.querySelectorAll('circle[data-site]').length,
      bars: body.querySelectorAll('rect[data-site]').length,
      outliers: [...body.querySelectorAll('.hbar .r[data-site]')].filter((r) => shown(r.querySelector('.mono')) && shown(r.querySelector('.v'))).length,
      flagRows: [...body.querySelectorAll('.hbar .r')].map((r) => [seen(r.querySelector('.mono')), seen(r.querySelector('.v')), shown(r.querySelector('.b'))]),
      trendDots: body.querySelectorAll('circle.trend-dot').length,
      trendLine: Boolean(body.querySelector('path.trend-line')),
      breakdowns: body.querySelectorAll('.dist-row').length,
      empty: text(body.querySelector('div.nd')),
    };
  });
}

/**
 * Sites per flag bin, labelled as the flag distribution labels them.
 * @param {import('../test/qual/pooling.js').SiteRow[]} rows
 */
function flagBins(rows) {
  const label = (/** @type {number | null} */ f) => (f === null ? 'NA' : f > 0 ? `+${f}` : f < 0 ? `−${-f}` : '0');
  const bins = ['+2', '+1', '0', '−1', '−2', 'NA'];
  const counts = new Map(bins.map((b) => [b, 0]));
  for (const r of rows) {
    const key = label(r.Flag == null ? null : Math.max(-2, Math.min(2, Math.round(r.Flag))));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Checks that a tile shows the content of the named view for a study at its latest visit. Details shows site-flag
 * counts only where configuration turns them on.
 * @param {Page} page
 * @param {string} metricId
 * @param {string} view
 * @param {{ of?: StudyEntry, flags?: boolean }} [options]
 */
async function expectViewContent(page, metricId, view, { of = study, flags = false } = {}) {
  const metric = /** @type {MetricMeta} */ (metrics.get(metricId));
  const where = `${of.StudyID} · ${metric.Abbreviation} · ${view}`;
  const shown = await tileContent(page, metricId);
  const rows = siteRows(readData, of, metricId);
  expect(rows.length, `${where}: the fixture has site rows`).toBeGreaterThan(3);
  expect(shown.fallback, `${where}: rendered without a fallback or error placeholder`).toBe(false);
  const bins = flagBins(rows);
  const flagged = rows.filter((r) => r.Flag != null && Math.abs(r.Flag) >= 1).length;
  switch (view) {
    case 'Details': {
      expect(shown.big, where).not.toBe('');
      const bySeverity = {
        red: (bins.get('+2') ?? 0) + (bins.get('−2') ?? 0),
        amber: (bins.get('+1') ?? 0) + (bins.get('−1') ?? 0),
        green: bins.get('0') ?? 0,
        na: bins.get('NA') ?? 0,
      };
      expect([shown.flagBar, shown.flagSegments, shown.flagCounts], where).toEqual(
        flags
          ? [
              true,
              Object.entries(bySeverity).filter(([, n]) => n > 0).map(([s, n]) => [`flag-${s}`, n]),
              `${bySeverity.red}R·${bySeverity.amber}A·${bySeverity.green}G·${bySeverity.na}NA`,
            ]
          : [false, [], ''],
      );
      break;
    }
    case 'Outlier sites':
      expect(shown.heading, where).toBe('Outlier sites — rate');
      expect(shown.outliers, where).toBe(Math.min(8, flagged));
      if (!flagged) expect(shown.empty, where).toBe('No flagged sites at this snapshot');
      break;
    case 'Flag distribution':
      expect(shown.heading, where).toBe('Sites by flag');
      expect(shown.flagRows, where).toEqual([...bins].map(([b, n]) => [b, String(n), n > 0]));
      break;
    case 'Trend over time':
      expect(shown.heading, where).toBe('Study rate over time');
      expect([shown.trendDots, shown.trendLine], where).toEqual([of.snapshots.length, true]);
      break;
    case 'Breakdowns':
      expect(shown.breakdowns, where).toBeGreaterThan(0);
      break;
    default:
      throw new Error(`no content check for the ${view} view`);
  }
}

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

/**
 * @param {Page} page
 * @param {string} metricId
 */
const tile = (page, metricId) => page.locator(`.tile[data-metric-id="${metricId}"]`);

/**
 * The first tile showing the default Details view: a metric with no custom view of its own.
 * @param {Page} page
 */
async function plainMetric(page) {
  const id = await page.locator('.tile[data-metric-id]').evaluateAll((tiles) =>
    tiles.find((t) => t.querySelector('.view-name')?.textContent?.trim().startsWith('Details'))?.getAttribute('data-metric-id'),
  );
  expect(id, 'a tile in the Details view').toBeTruthy();
  return /** @type {string} */ (id);
}

/**
 * Moves the visit scrubber as a user releasing the slider would.
 * @param {Page} page
 * @param {number} index
 */
async function goToVisit(page, index) {
  await page.locator('input[data-visit]').evaluate((el, i) => {
    const input = /** @type {HTMLInputElement} */ (el);
    input.value = String(i);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, index);
}

/**
 * @param {Page} page
 */
const visitLabel = (page) => page.locator('.visits .meta');

/**
 * @param {number} index
 */
const visitText = (index) => new RegExp(`^\\s*Visit ${index + 1}/${dates.length} · ${dates[index]}\\s*$`);

test.describe('study page behaviour', () => {
  test.beforeEach(async ({ app }) => {
    await app.openStudy(study.StudyID);
  });

  test('12.02: a tile pages through the standard views in order, showing each one, and wraps around (#12)', async ({ page }) => {
    const id = await plainMetric(page);
    const name = tile(page, id).locator('.view-name');
    const n = STANDARD_VIEWS.length;
    for (let step = 0; step <= n; step++) {
      const i = step % n;
      await expect(name).toHaveText(`${STANDARD_VIEWS[i]} ${i + 1}/${n}`);
      await expectViewContent(page, id, STANDARD_VIEWS[i]);
      if (step < n) await tile(page, id).locator('button[data-view-step="1"]').click();
    }
    await tile(page, id).locator('button[data-view-step="-1"]').click();
    await expect(name).toHaveText(`Trend over time ${n}/${n}`);
  });

  test('12.02: a metric with its own view opens on it, after the standard views (#12)', async ({ page }) => {
    const custom = portfolio.metrics.find((/** @type {{ Widget?: string }} */ m) => m.Widget === 'distribution-bar');
    const n = STANDARD_VIEWS.length + 1;
    await expect(tile(page, custom.MetricID).locator('.view-name')).toHaveText(`Breakdowns ${n}/${n}`);
    await expectViewContent(page, custom.MetricID, 'Breakdowns');
  });

  test('12.02: every metric in the catalog has a tile, opening on its own view or Details (#12)', async ({ page }) => {
    expect(tiles.length).toBeGreaterThan(10);
    await expect(page.locator('.tile.kri[data-metric-id]'), 'the standard KRIs are compact widgets (#32)').toHaveCount(KRIS.size);
    expect(tiles.some((m) => m.Widget) && tiles.some((m) => !m.Widget), 'the catalog has metrics with and without their own view').toBe(true);
    expect(await shownViews(page)).toEqual(expectedViews(defaultView));
  });

  test('12.02: grouping by category splits the tiles into category rows; turning it off shows one flat grid (#12)', async ({ page }) => {
    const shownRows = () =>
      page.locator('.dd-row:not(.kri-group)').evaluateAll((rows) =>
        rows.map((r) => [(r.querySelector('.rowlab')?.textContent ?? '').trim(), [...r.querySelectorAll('.tile[data-metric-id]')].map((t) => t.getAttribute('data-metric-id'))]),
      );
    const categories = [...new Set(tiles.map((m) => m.Category))];
    expect(categories.length).toBeGreaterThan(1);
    expect(await shownRows()).toEqual(
      categories.map((c) => {
        const members = tiles.filter((m) => m.Category === c);
        return [`${c} · ${members.length}`, members.map((m) => m.MetricID)];
      }),
    );
    await page.locator('input[data-group-cat]').uncheck();
    await expect(page.locator('.dd-row:not(.kri-group)')).toHaveCount(1);
    expect(await shownRows()).toEqual([[`All metrics · ${tiles.length}`, tiles.map((m) => m.MetricID)]]);
  });

  test('12.02: the visit scrubber shows the chosen visit (#12)', async ({ page }) => {
    expect(dates.length).toBeGreaterThan(3);
    await expect(visitLabel(page)).toHaveText(visitText(dates.length - 1));
    await goToVisit(page, 0);
    await expect(visitLabel(page)).toHaveText(visitText(0));
    await goToVisit(page, dates.length - 3);
    await expect(visitLabel(page)).toHaveText(visitText(dates.length - 3));
    await goToVisit(page, dates.length - 1);
    await expect(visitLabel(page)).toHaveText(visitText(dates.length - 1));
  });

  test('12.02: the chart panel opens under its standard-KRI widget, switches tabs, and closes (#12)', async ({ page }) => {
    const id = 'Analysis_kri0001';
    const more = tile(page, id).locator('button[data-detail-metric]');
    await expect(page.locator('.detail')).toHaveCount(0);
    await more.click();
    const row = page.locator('.dd-row', { has: tile(page, id) });
    const panel = row.locator('.detail');
    await expect(panel).toBeVisible();
    await expect(more).toHaveAttribute('aria-expanded', 'true');
    const tabs = panel.locator('.tabs [role="tab"]');
    await expect(tabs).toHaveText(['Bar chart', 'Scatter plot', 'Over time']);
    const abbr = /** @type {MetricMeta} */ (metrics.get(id)).Abbreviation;
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
    await tile(page, id).locator('button[data-detail-metric]').click();
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

test('12.02: stepping through visits and switching chart tabs and tile views leaves one live gsm.viz chart per chart shown (#12)', async ({ app, page }) => {
  await page.addInitScript(trackCharts);
  await app.openStudy(study.StudyID);
  const charts = () => page.evaluate(() => ({ live: /** @type {any} */ (window).__liveCharts(), shown: document.querySelectorAll('.viz canvas').length }));
  await page.locator('button[data-detail-metric]').first().click();
  await expect.poll(charts, 'drill-in opened').toEqual({ live: 1, shown: 1 });
  for (const index of [0, 1, dates.length - 1, 0]) {
    await goToVisit(page, index);
    await expect.poll(charts, `visit ${index + 1}`).toEqual({ live: 1, shown: 1 });
  }
  for (const name of ['Scatter plot', 'Over time', 'Bar chart']) {
    await page.locator('.detail').getByRole('tab', { name }).click();
    await expect.poll(charts, name).toEqual({ live: 1, shown: 1 });
  }
  await page.locator('.tile button[data-view-step="1"]').first().click();
  await expect.poll(charts, 'a tile paged to its next view').toEqual({ live: 1, shown: 1 });
  await page.locator('.detail button[data-detail-close]').click();
  await expect.poll(charts, 'drill-in closed').toEqual({ live: 0, shown: 0 });
});

/** Everything that shows site-flag counts: the Details tile's flag bar and counts, and both flag views' rows. */
/** The full tiles' flag marks. The grouped standard KRIs (#32) show their flag counts in `.kri-flags`, which this doesn't match. */
const FLAG_MARKS = '.flags, .fbar, .fcounts, .hbar';

/**
 * Sites flagged amber or red across every shown metric at a study's latest snapshot.
 * @param {StudyEntry} of
 */
const flaggedSites = (of) =>
  tiles.flatMap((m) => siteRows(readData, of, m.MetricID)).filter((r) => r.Flag != null && Math.abs(r.Flag) >= 1).length;

/**
 * Pages a tile forward until it shows the named view.
 * @param {Page} page
 * @param {string} metricId
 * @param {string} view
 */
async function pageTo(page, metricId, view) {
  const name = tile(page, metricId).locator('.view-name');
  for (let i = 0; i < 12 && !(await name.textContent())?.trim().startsWith(view); i++) {
    await tile(page, metricId).locator('button[data-view-step="1"]').click();
  }
  await expect(name).toHaveText(new RegExp(`^${view} `));
}

test.describe('site-flag counts on the study view', () => {
  test('11.01: in the default study view, no metric outside the standard-KRI groups shows site-flag counts: no flag bar on any of their tiles, and no flag view in any tile\'s pager (#11)', async ({ app, page }) => {
    expect(STUDY_VIEW_CONFIG[study.StudyID], `${study.StudyID} keeps the default`).toBeUndefined();
    expect(flaggedSites(study), 'the study has flagged sites that could be counted').toBeGreaterThan(0);
    await app.openStudy(study.StudyID);
    await expect(page.locator('.tile:not(.kri)[data-metric-id]')).toHaveCount(tiles.length);
    await expect(page.locator('.tile.kri[data-metric-id]'), 'only the grouped standard KRIs are compact widgets').toHaveCount(KRIS.size);
    await expect(page.locator(FLAG_MARKS)).toHaveCount(0);
    expect(await shownViews(page), 'every tile offers only the standard views and its own').toEqual(expectedViews(defaultView));
    for (const m of tiles) {
      for (let step = 0; step < viewsOf(m).length; step++) {
        await tile(page, m.MetricID).locator('button[data-view-step="1"]').click();
        await expect(page.locator(FLAG_MARKS), `${m.Abbreviation}, view ${step + 1}`).toHaveCount(0);
      }
    }
  });

  test('11.02: a study configured for site flags shows them on every tile, with both flag views, while other studies keep the default (#11)', async ({ app, page }) => {
    const [configuredId] = Object.keys(STUDY_VIEW_CONFIG);
    const of = /** @type {StudyEntry} */ (studies.find((s) => s.StudyID === configuredId));
    expect(of, 'the example configuration turns site flags on for a study').toBeTruthy();
    await app.openStudy(of.StudyID);
    expect(await shownViews(page)).toEqual(tiles.map((m) => [m.MetricID, defaultView(m, of)]));
    for (const view of ['Details', 'Outlier sites', 'Flag distribution']) {
      for (const m of tiles) {
        await pageTo(page, m.MetricID, view);
        await expect(tile(page, m.MetricID).locator('.view-name'), view).toHaveText(viewText(m, view, of));
        await expectViewContent(page, m.MetricID, view, { of, flags: true });
      }
    }
    await app.openStudy(study.StudyID);
    await expect(page.locator('.tile:not(.kri)[data-metric-id]')).toHaveCount(tiles.length);
    await expect(page.locator(FLAG_MARKS), `${study.StudyID} keeps the default`).toHaveCount(0);
    expect(await shownViews(page)).toEqual(expectedViews(defaultView));
  });

  test('11.02: a metric configured for site flags shows them on its tile, with both flag views, while other metrics keep the default (#11)', async ({ app, page }) => {
    const metric = /** @type {MetricMeta} */ (tiles.find((m) => !m.Widget && !m.Widgets));
    const added = ['bar-outliers', 'flag-dist'];
    await app.openStudy(study.StudyID, {
      portfolio: (p) => {
        const meta = p.metrics.find((/** @type {MetricMeta} */ x) => x.MetricID === metric.MetricID);
        meta.Widgets = [...(meta.Widgets ?? []), ...added];
        meta.WidgetConfigs = { ...meta.WidgetConfigs, 'scalar-tile': { flags: true } };
      },
    });
    const configured = { ...metric, Widgets: added };
    await expect(tile(page, metric.MetricID).locator('.view-name')).toHaveText(viewText(configured, 'Details'));
    await expectViewContent(page, metric.MetricID, 'Details', { flags: true });
    for (const view of ['Outlier sites', 'Flag distribution']) {
      await pageTo(page, metric.MetricID, view);
      await expect(tile(page, metric.MetricID).locator('.view-name')).toHaveText(viewText(configured, view));
      await expectViewContent(page, metric.MetricID, view);
    }
    const others = tiles.filter((m) => m.MetricID !== metric.MetricID);
    await expect(page.locator(`.tile:not(.kri)[data-metric-id]:not([data-metric-id="${metric.MetricID}"]) :is(${FLAG_MARKS})`)).toHaveCount(0);
    expect((await shownViews(page)).filter(([id]) => id !== metric.MetricID)).toEqual(others.map((m) => [m.MetricID, defaultView(m)]));
  });

  test('11.04: the default study view, for visual comparison with the default its Scope describes (#11)', async ({ app, page }) => {
    await app.openStudy(study.StudyID);
    await expect(page.locator('.tile:not(.kri)[data-metric-id]')).toHaveCount(tiles.length);
    await expect(page.locator(FLAG_MARKS)).toHaveCount(0);
  });
});

// @ts-check
// Characterization of the study page as it ships today, written against its markup contract (class names and data
// attributes) so the same tests run unchanged on the React page. Behaviour that spans pages (the back link, hidden
// metrics carried from the program view) is out of scope here; it moves with the portfolio page.
import { expect, readData, test } from './fixtures/app.js';
import { countText, displayed, latestSnapshot, pooled, readRate, shownMetrics, siteRows, tolerance } from '../test/qual/pooling.js';
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('../test/qual/pooling.js').StudyEntry} StudyEntry */
/** @typedef {import('../test/qual/pooling.js').MetricMeta} MetricMeta */

const portfolio = readData('portfolio.json');
/** @type {StudyEntry[]} */
const studies = portfolio.studies;
/** @type {Map<string, MetricMeta>} */
const metrics = new Map(portfolio.metrics.map((/** @type {MetricMeta} */ m) => [m.MetricID, m]));
// The study whose latest snapshot is older than most others', so "each study at its own latest" is observable.
const newest = studies.map(latestSnapshot).sort().reverse()[0];
const study = /** @type {StudyEntry} */ (studies.find((s) => latestSnapshot(s) < newest));
const dates = study.snapshots;

const STANDARD_VIEWS = ['Overview', 'Details', 'Scatter (n vs d)', 'Numerator by site', 'Outlier sites', 'Flag distribution', 'Trend over time'];
/** @type {Record<string, string>} */
const CUSTOM_VIEWS = { 'distribution-bar': 'Breakdowns', 'link-out': 'Report link' };
const tiles = shownMetrics(portfolio.metrics);

/**
 * A metric's tile views in paging order: the standard views, then its own.
 * @param {MetricMeta} metric
 */
function viewsOf(metric) {
  const own = [...new Set([metric.Widget, ...(metric.Widgets ?? [])].filter((w) => w !== undefined))];
  for (const w of own) if (!(w in CUSTOM_VIEWS)) throw new Error(`no expected label for the custom view ${w}`);
  return [...STANDARD_VIEWS, ...own.map((w) => CUSTOM_VIEWS[w])];
}

/**
 * The view-name text a tile shows for a view.
 * @param {MetricMeta} metric
 * @param {string} view
 */
function viewText(metric, view) {
  const views = viewsOf(metric);
  return `${view} ${views.indexOf(view) + 1}/${views.length}`;
}

/**
 * @param {MetricMeta} metric
 */
const defaultView = (metric) => viewText(metric, metric.Widget ? CUSTOM_VIEWS[metric.Widget] : 'Details');

/**
 * Every tile's metric and view name, in page order.
 * @param {Page} page
 */
const shownViews = (page) =>
  page.locator('.tile[data-metric-id]').evaluateAll((els) =>
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
    return {
      fallback: body.hasAttribute('data-degraded-from') || Boolean(body.querySelector('.viz-placeholder')),
      heading: text(body.querySelector('.sub-h')),
      big: text(body.querySelector('.big')),
      terms: [...body.querySelectorAll('dl.kv dt')].map(text),
      values: [...body.querySelectorAll('dl.kv dd')].map(text),
      flagCounts: text(body.querySelector('.fcounts')),
      cmp: text(body.querySelector('.cmp')),
      points: body.querySelectorAll('circle[data-site]').length,
      bars: body.querySelectorAll('rect[data-site]').length,
      outliers: body.querySelectorAll('.hbar .r[data-site]').length,
      flagRows: [...body.querySelectorAll('.hbar .r')].map((r) => [text(r.querySelector('.mono')), text(r.querySelector('.v'))]),
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
 * Checks that a tile shows the content of the named view for this study at its latest visit.
 * @param {Page} page
 * @param {string} metricId
 * @param {string} view
 */
async function expectViewContent(page, metricId, view) {
  const metric = /** @type {MetricMeta} */ (metrics.get(metricId));
  const where = `${metric.Abbreviation} · ${view}`;
  const shown = await tileContent(page, metricId);
  const rows = siteRows(readData, study, metricId);
  expect(rows.length, `${where}: the fixture has site rows`).toBeGreaterThan(3);
  expect(shown.fallback, `${where}: rendered without a fallback or error placeholder`).toBe(false);
  const bins = flagBins(rows);
  const flagged = rows.filter((r) => r.Flag != null && Math.abs(r.Flag) >= 1).length;
  switch (view) {
    case 'Overview': {
      const total = pooled(readData, [study], metricId);
      expect(shown.terms, where).toEqual(['Numerator', 'Denominator', 'Shown as', 'Sites']);
      expect(shown.values[0], where).toMatch(new RegExp(`^${countText(total.numerator)}( |$)`));
      expect(shown.values[1], where).toMatch(new RegExp(`^${countText(total.denominator)}( |$)`));
      expect(shown.values[3], where).toBe(String(rows.length));
      break;
    }
    case 'Details':
      expect(shown.big, where).not.toBe('');
      expect(shown.flagCounts, where).toBe(
        `${(bins.get('+2') ?? 0) + (bins.get('−2') ?? 0)}R·${(bins.get('+1') ?? 0) + (bins.get('−1') ?? 0)}A·${bins.get('0')}G·${bins.get('NA')}NA`,
      );
      expect(shown.cmp, where).toMatch(/^portfolio /);
      break;
    case 'Scatter (n vs d)':
      expect(shown.heading, where).toBe('Sites: numerator vs denominator');
      expect(shown.points, where).toBe(rows.length);
      break;
    case 'Numerator by site':
      expect(shown.heading, where).toBe(`${metric.Numerator} by site`);
      expect(shown.bars, where).toBe(rows.length);
      break;
    case 'Outlier sites':
      expect(shown.heading, where).toBe('Outlier sites — rate');
      expect(shown.outliers, where).toBe(Math.min(8, flagged));
      if (!flagged) expect(shown.empty, where).toBe('No flagged sites at this snapshot');
      break;
    case 'Flag distribution':
      expect(shown.heading, where).toBe('Sites by flag');
      expect(shown.flagRows, where).toEqual([...bins].map(([b, n]) => [b, String(n)]));
      break;
    case 'Trend over time':
      expect(shown.heading, where).toBe('Study rate over time');
      expect([shown.trendDots, shown.trendLine], where).toEqual([dates.length, true]);
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

  test('a tile pages through the standard views in order, showing each one, and wraps around', async ({ page }) => {
    const id = await plainMetric(page);
    const name = tile(page, id).locator('.view-name');
    const n = STANDARD_VIEWS.length;
    for (let step = 0; step <= n; step++) {
      const i = (1 + step) % n;
      await expect(name).toHaveText(`${STANDARD_VIEWS[i]} ${i + 1}/${n}`);
      await expectViewContent(page, id, STANDARD_VIEWS[i]);
      if (step < n) await tile(page, id).locator('button[data-view-step="1"]').click();
    }
    await tile(page, id).locator('button[data-view-step="-1"]').click();
    await tile(page, id).locator('button[data-view-step="-1"]').click();
    await expect(name).toHaveText(`Trend over time ${STANDARD_VIEWS.length}/${STANDARD_VIEWS.length}`);
  });

  test('a metric with its own view opens on it, after the standard views', async ({ page }) => {
    const custom = portfolio.metrics.find((/** @type {{ Widget?: string }} */ m) => m.Widget === 'distribution-bar');
    const n = STANDARD_VIEWS.length + 1;
    await expect(tile(page, custom.MetricID).locator('.view-name')).toHaveText(`Breakdowns ${n}/${n}`);
    await expectViewContent(page, custom.MetricID, 'Breakdowns');
  });

  test('every metric in the catalog has a tile, opening on its own view or Details', async ({ page }) => {
    expect(tiles.length).toBeGreaterThan(10);
    expect(tiles.some((m) => m.Widget) && tiles.some((m) => !m.Widget), 'the catalog has metrics with and without their own view').toBe(true);
    expect(await shownViews(page)).toEqual(expectedViews(defaultView));
  });

  test('the all-tiles menu sets every tile to one view, shows Mixed once a tile differs, and restores the defaults', async ({ page }) => {
    const menu = page.locator('select[data-all-views]');
    await expect(menu).toHaveValue('default');
    await menu.selectOption('trend-mini');
    await expect.poll(() => shownViews(page)).toEqual(expectedViews((m) => viewText(m, 'Trend over time')));
    for (const m of tiles) await expectViewContent(page, m.MetricID, 'Trend over time');
    const [first] = tiles;
    await tile(page, first.MetricID).locator('button[data-view-step="1"]').click();
    const next = viewsOf(first)[(STANDARD_VIEWS.indexOf('Trend over time') + 1) % viewsOf(first).length];
    await expect(menu).toHaveValue('mixed');
    expect(await shownViews(page)).toEqual(expectedViews((m) => viewText(m, m === first ? next : 'Trend over time')));
    await menu.selectOption('default');
    await expect(menu).toHaveValue('default');
    expect(await shownViews(page)).toEqual(expectedViews(defaultView));
  });

  test('grouping by category splits the tiles into category rows; turning it off shows one flat grid', async ({ page }) => {
    const shownRows = () =>
      page.locator('.dd-row').evaluateAll((rows) =>
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
    await expect(page.locator('.dd-row')).toHaveCount(1);
    expect(await shownRows()).toEqual([[`All metrics · ${tiles.length}`, tiles.map((m) => m.MetricID)]]);
  });

  test('the visit scrubber shows the chosen visit and play steps forward to the latest, then stops', async ({ page }) => {
    expect(dates.length).toBeGreaterThan(3);
    await expect(visitLabel(page)).toHaveText(visitText(dates.length - 1));
    await goToVisit(page, 0);
    await expect(visitLabel(page)).toHaveText(visitText(0));
    await goToVisit(page, dates.length - 3);
    await expect(visitLabel(page)).toHaveText(visitText(dates.length - 3));
    const play = page.locator('button[data-play]');
    await play.click();
    await expect(play).toHaveAttribute('aria-label', 'Pause through visits');
    await expect(visitLabel(page)).toHaveText(visitText(dates.length - 2), { timeout: 3000 });
    await expect(visitLabel(page)).toHaveText(visitText(dates.length - 1), { timeout: 3000 });
    await expect(play).toHaveAttribute('aria-label', 'Play through visits');
  });

  test('play from the latest visit restarts at the first, and pressing it again pauses', async ({ page }) => {
    const play = page.locator('button[data-play]');
    await play.click();
    await expect(visitLabel(page)).toHaveText(visitText(0));
    await play.click();
    await expect(play).toHaveAttribute('aria-label', 'Play through visits');
    const paused = await visitLabel(page).textContent();
    await page.waitForTimeout(1500);
    await expect(visitLabel(page)).toHaveText(/** @type {string} */ (paused));
  });

  test('selecting a site in one chart highlights it in every chart, and the chip clears it', async ({ page }) => {
    await page.locator('select[data-all-views]').selectOption('scatter-mini');
    const first = page.locator('.tile circle[data-site]').first();
    const site = /** @type {string} */ (await first.getAttribute('data-site'));
    await first.dispatchEvent('click');
    const chip = page.locator('.sitechip');
    await expect(chip.locator('.mono')).toHaveText(site);
    const latest = readData(study.files[dates.at(-1) ?? '']);
    const name = latest.groups?.find((/** @type {{ GroupID: string; GroupLevel: string; Param: string }} */ g) => g.GroupID === site && g.GroupLevel === 'Site' && g.Param === 'Site')?.Value;
    if (name) await expect(chip.locator('.nm')).toHaveText(String(name));
    const marks = await page.locator('.tile circle[data-site]').evaluateAll((els, s) => els.map((e) => [e.getAttribute('data-site') === s, e.classList.contains('is-sel'), e.classList.contains('is-dim')]), site);
    expect(marks.length).toBeGreaterThan(10);
    for (const [isSite, sel, dim] of marks) expect([sel, dim]).toEqual([isSite, !isSite]);
    await chip.locator('button[data-clear-site]').click();
    await expect(chip).toHaveCount(0);
    await expect(page.locator('.tile circle.is-sel, .tile circle.is-dim')).toHaveCount(0);
  });

  test('the chart panel opens under its tile, switches tabs, and closes', async ({ page }) => {
    const id = await plainMetric(page);
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

  test('the comparison line pools every study at its own snapshot as of the visit, at the latest and an earlier visit', async ({ page }) => {
    const latestOthers = studies.filter((s) => s.snapshots.at(-1) !== dates.at(-1));
    expect(latestOthers.length, 'other studies have a different latest snapshot').toBeGreaterThan(0);
    const earlier = 1;
    const asOfFor = (/** @type {number} */ i) => (i === dates.length - 1 ? null : dates[i]);
    const ids = [...metrics.keys()];
    const differs = (/** @type {(id: string) => [number | null, number | null]} */ pair) => ids.some((id) => {
      const [a, b] = pair(id);
      return a !== null && b !== null && Math.abs(a - b) > 1e-6;
    });
    expect(differs((id) => [pooled(readData, studies, id, null).rate, pooled(readData, [study], id, null).rate]), 'portfolio and study-only differ').toBe(true);
    expect(differs((id) => [pooled(readData, studies, id, null).rate, pooled(readData, studies, id, dates.at(-1) ?? null).rate]), "own-latest and this study's date differ").toBe(true);
    expect(differs((id) => [pooled(readData, studies, id, dates[earlier]).rate, pooled(readData, studies, id, null).rate]), 'as-of and latest-only differ').toBe(true);

    for (const index of [dates.length - 1, earlier]) {
      await goToVisit(page, index);
      await expect(visitLabel(page)).toHaveText(visitText(index));
      const asOf = asOfFor(index);
      const shown = await page.locator('.tile[data-metric-id]').evaluateAll((tiles) =>
        tiles.map((t) => ({ id: t.getAttribute('data-metric-id') ?? '', view: t.querySelector('.view-name')?.textContent?.trim() ?? '', cmp: t.querySelector('.cmp')?.textContent?.trim() ?? null })),
      );
      const details = shown.filter((t) => t.view.startsWith('Details'));
      expect(details.length).toBeGreaterThan(5);
      let compared = 0;
      for (const t of details) {
        const metric = /** @type {MetricMeta} */ (metrics.get(t.id));
        const where = `visit ${index + 1} · ${metric.Abbreviation}`;
        const mine = pooled(readData, [study], t.id, asOf).rate;
        const all = pooled(readData, studies, t.id, asOf).rate;
        if (mine === null || all === null) {
          expect(t.cmp, where).toBeNull();
          continue;
        }
        const m = /^portfolio (\S+) · this study ([+−])(\d+\.\d+) (pt|\/ 28 d)$/.exec(t.cmp ?? '');
        expect(m, `${where}: "${t.cmp}"`).toBeTruthy();
        if (!m) continue;
        expect(m[4], where).toBe(metric.Display === 'per_28d' ? '/ 28 d' : 'pt');
        expect(Math.abs(/** @type {number} */ (readRate(metric, m[1])) - displayed(metric, all)), `${where}: portfolio`).toBeLessThanOrEqual(tolerance(metric));
        const diff = (m[2] === '−' ? -1 : 1) * Number(m[3]);
        expect(Math.abs(diff - (displayed(metric, mine) - displayed(metric, all))), `${where}: difference`).toBeLessThanOrEqual(tolerance(metric));
        compared++;
      }
      expect(compared, `visit ${index + 1}: comparison lines checked`).toBeGreaterThan(5);
    }
  });
});

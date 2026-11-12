// @ts-check
// 12.02 regression evidence: the study page as it rendered before #12's changes, recorded state by state for each
// host in e2e/__snapshots__/study-baseline.spec.js/. The two hosts' markup differs only in ways the tests don't read
// (the old element's back link and whitespace), so each has its own records, shared by its two delivery modes. Each
// state is reached through the UI and recorded as the page's DOM (by hash), its accessibility tree, every tile's view
// and the marks it visibly draws, the drill-in panel with the series and values its gsm.viz chart draws, and any open
// tooltip. Chart contents are recorded from the chart's data rather than its pixels, which differ by platform.
import { readData, test } from './fixtures/app.js';
import { domLine, expectRecorded } from './fixtures/baseline.js';
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('@playwright/test').TestInfo} TestInfo */

test.describe.configure({ timeout: 90_000 });

const portfolio = readData('portfolio.json');
/** @type {Array<{ StudyID: string, snapshots: string[] }>} */
const studies = portfolio.studies;
/** @type {Array<{ MetricID: string, Widget?: string, Widgets?: string[] }>} */
const catalog = portfolio.metrics;
const study = studies[0];
const flagged = 'STUDY006';
const STANDARD = { overview: 'overview', details: 'scalar-tile', scatter: 'scatter-mini', numerator: 'bar-numerator', trend: 'trend-mini' };

/**
 * @param {Page} page
 * @param {string} name
 * @param {string} artifact
 */
async function capture(page, name, artifact) {
  const root = page.locator('#app > gsm-study-page, #app > .study-page');
  // #13 adds a report link to configured tiles after this baseline was pinned; its own tests check those links, so
  // they are left out here and every other part of the page is still compared with the page before #12.
  const dom = await root.evaluate((el) => {
    const copy = /** @type {Element} */ (el.cloneNode(true));
    for (const link of copy.querySelectorAll('.report-link')) link.remove();
    return copy.innerHTML;
  });
  await root.evaluate((el) => el.querySelectorAll('.report-link').forEach((a) => a.setAttribute('hidden', '')));
  const aria = await root.ariaSnapshot();
  await root.evaluate((el) => el.querySelectorAll('.report-link').forEach((a) => a.removeAttribute('hidden')));
  const rendered = await root.evaluate((el) => {
    const shown = (/** @type {Element} */ e) => {
      if (!e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const text = (/** @type {Element | null} */ e) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
    /** @type {Record<string, string>} */
    const marks = { points: 'circle', bars: 'rect', lines: 'path', rows: '.hbar .r', breakdowns: '.dist-row', segments: '.fbar i', charts: '.viz canvas', empty: '.nd, .dist-nd' };
    const drawn = (/** @type {Element} */ scope) =>
      Object.entries(marks)
        .map(([k, sel]) => [k, [...scope.querySelectorAll(sel)].filter(shown).length])
        .filter(([, n]) => n)
        .map(([k, n]) => `${k} ${n}`)
        .join(', ') || 'no marks';
    const tiles = [...el.querySelectorAll('.tile')].map(
      (t) => `${t.getAttribute('data-metric-id') ?? '(page widget)'} · ${text(t.querySelector('.view-name')) || '-'}: ${drawn(t)}`,
    );
    const detail = el.querySelector('.detail');
    const tip = document.getElementById('gsm-tooltip');
    const plain = (/** @type {unknown} */ v) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
    const fields = (/** @type {any} */ p) =>
      p && typeof p === 'object'
        ? Object.keys(p)
            .sort()
            .filter((k) => plain(p[k]))
            .map((k) => `${k}=${p[k]}`)
            .join(' ')
        : String(p);
    const STYLE = ['backgroundColor', 'borderColor', 'borderWidth', 'borderDash', 'radius', 'pointStyle', 'showLine'];
    /** Options as the chart resolved them for drawing, after any colour or size callback has run. */
    const style = (/** @type {any} */ o) =>
      o ? STYLE.filter((k) => o[k] !== undefined).map((k) => `${k}=${Array.isArray(o[k]) ? `[${o[k].join(',')}]` : String(o[k])}`).join(' ') : 'none';
    const runsOf = (/** @type {string[]} */ values) => {
      /** @type {string[]} */
      const out = [];
      for (let i = 0; i < values.length; ) {
        let j = i;
        while (j < values.length && values[j] === values[i]) j++;
        out.push(j - i > 1 ? `${values[i]} ×${j - i}` : values[i]);
        i = j;
      }
      return out.join(' | ');
    };
    const chart = /** @type {any} */ (detail?.querySelector('.viz canvas'))?.chart;
    const series = chart
      ? [
          `type ${chart.config.type}; labels: ${(chart.data.labels ?? []).join(' | ')}`,
          `labels hidden through the legend: ${(chart.data.labels ?? []).filter((/** @type {unknown} */ _, /** @type {number} */ j) => !chart.getDataVisibility(j)).join(' | ') || 'none'}`,
          ...chart.data.datasets.flatMap((/** @type {any} */ d, /** @type {number} */ i) => {
            const controller = chart.getDatasetMeta(i).controller;
            return [
              `dataset ${i} ${d.type ?? ''} "${d.label ?? ''}" ${chart.isDatasetVisible(i) ? 'visible' : 'hidden'}; line ${controller.datasetElementType ? style(controller.resolveDatasetElementOptions('default')) : 'none'}`,
              `    marks: ${runsOf(d.data.map((/** @type {unknown} */ _, /** @type {number} */ j) => style(controller.resolveDataElementOptions(j, 'default')))) || 'none'}`,
              `    data: ${d.data.map(fields).join('; ')}`,
            ];
          }),
          ...Object.entries(chart.options.plugins?.annotation?.annotations ?? {}).map(
            ([k, a]) => `annotation ${k}: ${fields(a)}${a?.label ? ` label: ${fields(a.label)}` : ''}`,
          ),
        ]
      : [];
    return {
      series,
      tiles,
      detail: detail ? `${text(detail.querySelector('.detail-head .abbr'))} · ${text(detail.querySelector('[aria-selected="true"]'))} · ${text(detail.querySelector('.viz-cap'))}: ${drawn(detail)}` : 'closed',
      tooltip: tip && shown(tip) ? tip.innerHTML : 'none',
    };
  });
  const text = [
    `state: ${name} (${artifact})`,
    domLine(dom),
    `tooltip: ${rendered.tooltip}`,
    `drill-in: ${rendered.detail}`,
    ...rendered.series.map((line) => `  ${line}`),
    'tiles:',
    ...rendered.tiles.map((t) => `  ${t}`),
    'accessibility:',
    aria,
    '',
  ].join('\n');
  return { text, dom };
}

/**
 * @param {Page} page
 * @param {TestInfo} testInfo
 * @param {string} artifact
 * @param {string} name
 */
async function expectState(page, testInfo, artifact, name) {
  await expectRecorded(testInfo, `${artifact}-${name}.txt`, await capture(page, name, artifact));
}

/**
 * Moves the visit scrubber as a user releasing the slider would.
 * @param {Page} page
 * @param {number} index
 */
async function goToVisit(page, index) {
  await page.locator('input[data-visit]').evaluate((el, i) => {
    /** @type {HTMLInputElement} */ (el).value = String(i);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, index);
}

/**
 * @param {Page} page
 * @param {string} metricId
 */
const tile = (page, metricId) => page.locator(`.tile[data-metric-id="${metricId}"]`);

test.describe('the study page against its recorded baseline', () => {
  test('12.02: the study page matches its baseline at its defaults and in each view the all-tiles menu offers (#12)', async ({ app, page }, testInfo) => {
    await app.openStudy(study.StudyID);
    await expectState(page, testInfo, app.artifact, 'default');
    for (const [name, value] of Object.entries(STANDARD)) {
      await page.locator('select[data-all-views]').selectOption(value);
      await expectState(page, testInfo, app.artifact, `all-${name}`);
    }
  });

  test('12.02: the study page matches its baseline with a metric on its own extra view, the drill-in panel on each tab, a site highlighted and the categories ungrouped (#12)', async ({ app, page }, testInfo) => {
    await app.openStudy(study.StudyID);
    const linked = /** @type {{ MetricID: string }} */ (catalog.find((m) => m.Widgets?.includes('link-out')));
    const name = tile(page, linked.MetricID).locator('.view-name');
    for (let i = 0; i < 12 && !(await name.textContent())?.trim().startsWith('Report link'); i++) {
      await tile(page, linked.MetricID).locator('button[data-view-step="1"]').click();
    }
    await expectState(page, testInfo, app.artifact, 'own-extra-view');
    const plain = /** @type {{ MetricID: string }} */ (catalog.find((m) => !m.Widget && !m.Widgets));
    await tile(page, plain.MetricID).locator('button[data-detail-metric]').click();
    for (const tab of ['Bar chart', 'Scatter plot', 'Over time']) {
      await page.locator('.detail').getByRole('tab', { name: tab }).click();
      await page.locator('.detail .viz canvas').waitFor();
      await expectState(page, testInfo, app.artifact, `drill-in-${tab.toLowerCase().replace(/ /g, '-')}`);
    }
    await page.locator('.detail button[data-detail-close]').click();
    await page.locator('select[data-all-views]').selectOption('scatter-mini');
    await page.locator('.tile circle[data-site]').first().dispatchEvent('click');
    await page.locator('.sitechip').waitFor();
    await expectState(page, testInfo, app.artifact, 'site-highlighted');
    await page.locator('button[data-clear-site]').click();
    await page.locator('input[data-group-cat]').uncheck();
    await expectState(page, testInfo, app.artifact, 'ungrouped');
  });

  test('12.02: the study page matches its baseline at an earlier visit, where breakdowns are not published (#12)', async ({ app, page }, testInfo) => {
    await app.openStudy(study.StudyID);
    await goToVisit(page, 0);
    await page.locator('.visits .meta').filter({ hasText: `Visit 1/` }).waitFor();
    await expectState(page, testInfo, app.artifact, 'earlier-visit');
  });

  test('12.02: the study page matches its baseline with a breakdown configured but no rows for it (#12)', async ({ app, page }, testInfo) => {
    const configured = /** @type {{ MetricID: string }} */ (catalog.find((m) => m.Widget === 'distribution-bar'));
    await app.openStudy(study.StudyID, {
      snapshot: (snap) => {
        if (snap.distributions) snap.distributions = snap.distributions.filter((/** @type {{ MetricID: string }} */ d) => d.MetricID !== configured.MetricID);
      },
    });
    await expectState(page, testInfo, app.artifact, 'breakdown-no-rows');
  });

  test('12.02: the study page matches its baseline for a study with site flags configured, in both flag views, and with a metric definition open (#12)', async ({ app, page }, testInfo) => {
    await app.openStudy(flagged);
    await expectState(page, testInfo, app.artifact, 'flags-configured');
    const menu = page.locator('select[data-all-views]');
    for (const [name, value] of [['outlier-sites', 'bar-outliers'], ['flag-distribution', 'flag-dist']]) {
      await menu.selectOption(value);
      await expectState(page, testInfo, app.artifact, `flags-${name}`);
    }
    await menu.selectOption('default');
    await page.locator('.tile .tile-head .info').first().hover();
    await page.locator('#gsm-tooltip').waitFor();
    await expectState(page, testInfo, app.artifact, 'tooltip-definition');
  });
});

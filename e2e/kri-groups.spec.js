// @ts-check
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('../test/qual/pooling.js').StudyEntry} StudyEntry */
/** @typedef {import('../test/qual/pooling.js').MetricMeta} MetricMeta */
/** @typedef {MetricMeta & { ID: string, Metric: string }} Meta */
import { KRI_GROUPS } from '../src/config/kri-groups.js';
import { pooled, shownMetrics } from '../test/qual/pooling.js';
import { expect, readData, test } from './fixtures/app.js';

const portfolio = readData('portfolio.json');
/** @type {StudyEntry[]} */
const studies = portfolio.studies;
/** @type {Meta[]} */
const shown = /** @type {Meta[]} */ (shownMetrics(portfolio.metrics));
const KRIS = KRI_GROUPS.flatMap((g) => g.metrics);
const ctq = shown.filter((m) => !KRIS.includes(m.ID));
const study = studies[0];
/** @param {string} id */
const metricOf = (id) => /** @type {Meta} */ (shown.find((m) => m.ID === id));
const int = (/** @type {number} */ x) => x.toLocaleString('en-US');
const one = (/** @type {number} */ x) => x.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (/** @type {number} */ x) => `${(x * 100).toFixed(1)}%`;

/**
 * Per-metric `WidgetConfigs['kri-summary']` overrides, keyed by metric ID.
 * @param {Record<string, Record<string, unknown>>} configs
 */
const configure = (configs) => ({
  portfolio: (/** @type {any} */ p) => {
    for (const [id, config] of Object.entries(configs)) {
      const m = p.metrics.find((/** @type {any} */ x) => x.ID === id);
      m.WidgetConfigs = { ...m.WidgetConfigs, 'kri-summary': config };
    }
  },
});

/**
 * What a user should see in one compact widget, from the fixture's site rows alone.
 * @param {MetricMeta} m
 * @param {StudyEntry} of
 * @param {string | null} asOf
 */
function expectedKri(m, of, asOf) {
  const p = pooled(readData, [of], m.MetricID, asOf);
  const per28 = m.Display === 'per_28d';
  const total = p.flags.red + p.flags.amber + p.flags.green + p.flags.na;
  const flags = /** @type {const} */ ([['red', 'Red'], ['amber', 'Amber'], ['green', 'Green'], ['na', 'No flag']]);
  return {
    rate: p.rate === null ? '—' : per28 ? (p.rate * 28).toFixed(2) : pct(p.rate),
    unit: per28 ? 'per 28 days' : null,
    nd: `${int(p.numerator)} / ${per28 ? one(p.denominator / 28) : int(p.denominator)}`,
    flags: flags.map(([key, label]) => [key, label, String(p.flags[key]), total ? pct(p.flags[key] / total) : '—']),
  };
}

/**
 * What one compact widget shows, read from visible elements only.
 * @param {Page} page
 * @param {string} metricId
 */
async function readKri(page, metricId) {
  const body = page.locator(`.tile.kri[data-metric-id="${metricId}"] .tile-body`);
  await expect(body).toBeVisible();
  return body.evaluate((el) => {
    const shownEl = (/** @type {Element | null} */ e) => Boolean(e?.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
    const text = (/** @type {Element | null} */ e) => (shownEl(e) ? (e?.textContent?.trim() ?? null) : null);
    return {
      rate: text(el.querySelector('.kri-rate .big')),
      unit: text(el.querySelector('.kri-rate .unit')),
      nd: text(el.querySelector('.kri-nd')),
      flags: [...el.querySelectorAll('.kri-flags li')].map((li) => [li.getAttribute('data-flag'), ...['.lbl', '.v', '.p'].map((s) => text(li.querySelector(s)))]),
    };
  });
}

/**
 * The page's rows in order: each row's label and the metric IDs of its tiles, then the expand control if any. A tile
 * or control a user can't see is marked "(hidden)".
 * @param {Page} page
 */
const rowsOf = (page) =>
  page.locator('.study-page > .dd-row').evaluateAll((rows) =>
    rows.map((r) => ({
      label: (r.querySelector('.rowlab')?.textContent ?? '').trim(),
      group: r.getAttribute('data-kri-group'),
      tiles: [...r.querySelectorAll('.tiles > *')].map((t) => {
        const name = t.getAttribute('data-metric-id') ?? (t.matches('[data-kri-expand]') ? 'expand' : '?');
        const box = t.getBoundingClientRect();
        const seen = t.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && box.width > 0 && box.height > 0;
        return seen ? name : `${name} (hidden)`;
      }),
    })),
  );

/**
 * Whether a user can see an element: rendered, neither transparent nor invisible (itself or an ancestor), and with a
 * size. Playwright's toBeVisible() ignores opacity.
 * @param {import('@playwright/test').Locator} locator
 */
const userSees = (locator) =>
  locator.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && box.width > 0 && box.height > 0;
  });

/** @param {string[]} metricIds */
const asIds = (metricIds) => metricIds.map((id) => metricOf(id).MetricID);

/**
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

test.describe('grouped standard KRIs', () => {
  test('32.01: every compact widget\'s rate, n / N and site counts and percentages per flag equal an independent pooling of the site rows, at the latest and an earlier visit (#32)', async ({ app, page }) => {
    let compared = 0;
    for (const of of [studies[0], studies[3]]) {
      await app.openStudy(of.StudyID);
      for (const index of [of.snapshots.length - 1, 1]) {
        await goToVisit(page, index);
        await expect(page.locator('.visits .meta')).toContainText(of.snapshots[index]);
        const asOf = index === of.snapshots.length - 1 ? null : of.snapshots[index];
        for (const id of KRIS) {
          const m = metricOf(id);
          expect(await readKri(page, m.MetricID), `${of.StudyID} visit ${index + 1} ${id}`).toEqual(expectedKri(m, of, asOf));
          compared++;
        }
      }
    }
    expect(compared).toBe(4 * KRIS.length);
  });

  test('32.02: a rate per 28 days shows n ÷ exposure days × 28, its N shows exposure days ÷ 28, and a configured unit label replaces the default (#32)', async ({ app, page }) => {
    const per28 = KRIS.map(metricOf).filter((m) => m.Display === 'per_28d');
    expect(per28.map((m) => m.ID)).toEqual(['kri0001', 'kri0002', 'kri0003', 'kri0004']);
    await app.openStudy(study.StudyID, configure({ kri0002: { unit: 'per 4 weeks' } }));
    for (const m of per28) {
      const p = pooled(readData, [study], m.MetricID, null);
      const seen = await readKri(page, m.MetricID);
      expect([seen.rate, seen.nd, seen.unit], m.ID).toEqual([
        ((p.numerator / p.denominator) * 28).toFixed(2),
        `${int(p.numerator)} / ${one(p.denominator / 28)}`,
        m.ID === 'kri0002' ? 'per 4 weeks' : 'per 28 days',
      ]);
    }
    for (const m of KRIS.map(metricOf).filter((x) => x.Display !== 'per_28d')) expect((await readKri(page, m.MetricID)).unit, m.ID).toBeNull();
  });

  test('32.03: the three groups follow the CTQ widgets in configured order, with grouping by category on and off, and each grouped KRI appears only in its group (#32)', async ({ app, page }) => {
    await app.openStudy(study.StudyID);
    const groupRows = KRI_GROUPS.map((g) => ({ label: `${g.label} · ${g.metrics.length}`, group: g.id, tiles: asIds(g.metrics) }));
    for (const grouped of [true, false]) {
      if (!grouped) await page.locator('input[data-group-cat]').uncheck();
      const rows = await rowsOf(page);
      const ctqRows = rows.slice(0, rows.length - KRI_GROUPS.length);
      expect(rows.slice(-KRI_GROUPS.length), `grouping ${grouped}`).toEqual(groupRows);
      expect(ctqRows.every((r) => r.group === null), `grouping ${grouped}: CTQ rows first`).toBe(true);
      expect(ctqRows.flatMap((r) => r.tiles).sort(), `grouping ${grouped}: CTQ rows hold exactly the CTQ widgets`).toEqual(ctq.map((m) => m.MetricID).sort());
      if (!grouped) expect(ctqRows, 'one flat CTQ row').toHaveLength(1);
      for (const m of KRIS.map(metricOf)) await expect(page.locator(`[data-metric-id="${m.MetricID}"]`), m.ID).toHaveCount(1);
    }
  });

  test('32.03: configuration moves KRIs between groups, out of every group and within a group (#32)', async ({ app, page }) => {
    await app.openStudy(study.StudyID, configure({ kri0005: { group: 'deviations', order: -1 }, kri0001: { group: null }, kri0011: { order: 0 } }));
    const rows = await rowsOf(page);
    expect(rows.filter((r) => r.group).map((r) => [r.group, r.tiles])).toEqual([
      ['safety', asIds(['kri0002'])],
      ['deviations', asIds(['kri0005', 'kri0003', 'kri0004'])],
      ['data', asIds(['kri0008', 'kri0011', 'kri0009', 'kri0010'])],
    ]);
    expect(rows.filter((r) => !r.group).flatMap((r) => r.tiles), 'a KRI out of every group is a CTQ widget').toContain(metricOf('kri0001').MetricID);
  });

  test('32.03: KRIs hidden from the portfolio, by hidden metric or status filter, are left out, and a group left empty is not shown (#32)', async ({ app, page }) => {
    await app.openStudy(study.StudyID, undefined, `#statuses=Released&statuses=Planned&hide=${metricOf('kri0005').MetricID}`);
    const rows = await rowsOf(page);
    expect(rows.filter((r) => r.group).map((r) => [r.group, r.tiles])).toEqual([['data', asIds(['kri0008', 'kri0009', 'kri0010', 'kri0011'])]]);
    for (const id of ['kri0001', 'kri0002', 'kri0003', 'kri0004', 'kri0005']) await expect(page.locator(`[data-metric-id="${metricOf(id).MetricID}"]`), id).toHaveCount(0);
  });

  test('32.04: with the default configuration no group has an expand control (#32)', async ({ app, page }) => {
    await app.openStudy(study.StudyID);
    await expect(page.locator('.tile.kri')).toHaveCount(KRIS.length);
    await expect(page.locator('[data-kri-expand]')).toHaveCount(0);
  });

  test('32.04: KRIs hidden by default appear only after their own group\'s expand control is used, and portfolio hiding still applies after expanding (#32)', async ({ app, page }) => {
    const hash = `#statuses=Released&statuses=Planned&hide=${metricOf('kri0009').MetricID}`;
    await app.openStudy(study.StudyID, configure({ kri0002: { hidden: true }, kri0005: { hidden: true }, kri0009: { hidden: true }, kri0010: { hidden: true } }), hash);
    let rows = await rowsOf(page);
    expect(rows.filter((r) => r.group).map((r) => [r.group, r.tiles])).toEqual([
      ['safety', ['expand']],
      ['data', [...asIds(['kri0008', 'kri0011']), 'expand']],
    ]);
    await page.locator('.kri-group[data-kri-group="data"] [data-kri-expand]').click();
    rows = await rowsOf(page);
    expect(rows.filter((r) => r.group).map((r) => [r.group, r.tiles]), 'only the data group expands, in configured order').toEqual([
      ['safety', ['expand']],
      ['data', asIds(['kri0008', 'kri0010', 'kri0011'])],
    ]);
    expect(await readKri(page, metricOf('kri0010').MetricID), 'the revealed widget shows its values').toEqual(expectedKri(metricOf('kri0010'), study, null));
    await page.locator('.kri-group[data-kri-group="safety"] [data-kri-expand]').click();
    rows = await rowsOf(page);
    expect(rows.filter((r) => r.group).map((r) => [r.group, r.tiles]), 'kri0002 stays out by status filter, kri0009 by hidden metric').toEqual([
      ['safety', asIds(['kri0005'])],
      ['data', asIds(['kri0008', 'kri0010', 'kri0011'])],
    ]);
    expect(await readKri(page, metricOf('kri0005').MetricID), 'the revealed widget shows its values').toEqual(expectedKri(metricOf('kri0005'), study, null));
  });

  test('32.03: an expanded group shows its KRIs in configured order, each visible with its values (#32)', async ({ app, page }) => {
    await app.openStudy(study.StudyID, configure({ kri0002: { hidden: true } }));
    const safety = async () => (await rowsOf(page)).find((r) => r.group === 'safety')?.tiles;
    expect(await safety()).toEqual([...asIds(['kri0001', 'kri0005']), 'expand']);
    await page.locator('.kri-group[data-kri-group="safety"] [data-kri-expand]').click();
    expect(await safety()).toEqual(asIds(['kri0001', 'kri0002', 'kri0005']));
    for (const id of ['kri0001', 'kri0002', 'kri0005']) expect(await readKri(page, metricOf(id).MetricID), id).toEqual(expectedKri(metricOf(id), study, null));
  });

  test('32.06: each compact widget opens the Charts drill-in under its group, shows a configured detailed-report link and nothing else in its footer, and has no view pager (#32)', async ({ app, page }) => {
    const linked = metricOf('kri0004');
    await app.openStudy(study.StudyID, {
      portfolio: (p) => {
        p.metrics.find((/** @type {any} */ x) => x.ID === linked.ID).ReportLink = 'reports/ipd.html';
      },
    });
    const kris = page.locator('.tile.kri');
    await expect(kris).toHaveCount(KRIS.length);
    await expect(page.locator('.tile.kri :is(.vbtn, .view-name, [data-view-step])')).toHaveCount(0);
    for (const id of KRIS) {
      const m = metricOf(id);
      const foot = page.locator(`.tile.kri[data-metric-id="${m.MetricID}"] .tile-foot`);
      const link = foot.locator('a.report-link');
      if (id === linked.ID) {
        await expect(link, id).toBeVisible();
        expect(await userSees(link), `${id}: the link can be seen`).toBe(true);
        await link.click({ trial: true });
        await expect(link, id).toHaveText('Detailed report ↗');
        expect(await link.evaluate((a) => /** @type {HTMLAnchorElement} */ (a).href), id).toMatch(/\/reports\/ipd\.html$/);
      } else await expect(link, id).toHaveCount(0);
      await expect(foot.locator(':scope > *'), id).toHaveCount(id === linked.ID ? 2 : 1);
    }
    for (const g of KRI_GROUPS) {
      const m = metricOf(g.metrics[0]);
      const row = page.locator(`.kri-group[data-kri-group="${g.id}"]`);
      const charts = row.locator(`[data-detail-metric="${m.MetricID}"]`);
      expect(await userSees(charts), `${g.id}: the Charts button can be seen`).toBe(true);
      await charts.click();
      await expect(row.locator('.detail .detail-title'), g.id).toHaveText(m.Metric);
      await expect(row.locator('.detail [data-detail-tab]'), g.id).toHaveCount(3);
      await expect(row.locator('.detail .detail-body'), g.id).toBeVisible();
      await expect(page.locator('.detail'), g.id).toHaveCount(1);
      await row.locator('[data-detail-close]').click();
      await expect(page.locator('.detail'), g.id).toHaveCount(0);
    }
  });

  test('32.05: the grouped KRI view, with a KRI hidden by default, captured for user acceptance (user acceptance) (#32)', async ({ app, page, evidence }) => {
    await app.openStudy(study.StudyID, configure({ kri0002: { hidden: true } }));
    await expect(page.locator('.kri-group[data-kri-group="safety"] [data-kri-expand]')).toBeVisible();
    await expect(page.locator('.tile.kri')).toHaveCount(KRIS.length - 1);
    await evidence.shot(page, 'grouped standard KRIs with one hidden by default');
  });
});

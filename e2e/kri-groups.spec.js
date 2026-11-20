// @ts-check
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('../test/qual/pooling.js').StudyEntry} StudyEntry */
/** @typedef {import('../test/qual/pooling.js').MetricMeta} MetricMeta */
/** @typedef {MetricMeta & { ID: string, Metric: string }} Meta */
import { pooled, shownMetrics } from '../test/qual/pooling.js';
import { expect, readData, test } from './fixtures/app.js';
import { TRACKER_CARDS } from './fixtures/tiles.js';

const portfolio = readData('portfolio.json');
/** @type {StudyEntry[]} */
const studies = portfolio.studies;
/** @type {Meta[]} */
const shown = /** @type {Meta[]} */ (shownMetrics(portfolio.metrics));
const KRIS = TRACKER_CARDS.filter((c) => c.kind === 'kri').map((c) => c.metric);
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
  const body = page.locator(`.card.kri[data-metric-id="${metricId}"] .tile-body`);
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
 * The grid in order: each card's id, then the expand control if any. One a user can't see is marked "(hidden)".
 * @param {Page} page
 */
const gridOf = (page) =>
  page.locator('.study-page .cards > :not(.detail)').evaluateAll((els) =>
    els.map((t) => {
      const name = t.getAttribute('data-card') ?? (t.matches('[data-kri-expand]') ? 'expand' : '?');
      const box = t.getBoundingClientRect();
      const seen = t.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && box.width > 0 && box.height > 0;
      return seen ? name : `${name} (hidden)`;
    }),
  );

/** The tracker's card ids, less the KRIs given. */
const trackerWithout = (/** @type {string[]} */ out) => TRACKER_CARDS.map((c) => c.id).filter((id) => !out.includes(id));

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

test.describe('the standard KRIs\' cards', () => {
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
    expect(per28.map((m) => m.ID).sort()).toEqual(['kri0001', 'kri0002', 'kri0003', 'kri0004']);
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

  test('32.03: the cards follow tracker order, the breakdowns then the standard KRIs, each once, with no control to group them (#32)', async ({ app, page }) => {
    await app.openStudy(study.StudyID);
    expect(await gridOf(page)).toEqual(TRACKER_CARDS.map((c) => c.id));
    for (const m of KRIS.map(metricOf)) await expect(page.locator(`.card[data-metric-id="${m.MetricID}"]`), m.ID).toHaveCount(1);
    await expect(page.locator('input[data-group-cat], .dd-row, .kri-group, .rowlab')).toHaveCount(0);
    await expect(page.getByText(/group by category/i)).toHaveCount(0);
  });

  test('32.03: KRIs hidden from the portfolio, by hidden metric or status filter, are left out (#32)', async ({ app, page }) => {
    await app.openStudy(study.StudyID, undefined, `#statuses=Released&statuses=Planned&hide=${metricOf('kri0005').MetricID}`);
    expect(await gridOf(page)).toEqual(trackerWithout(['kri0001', 'kri0002', 'kri0003', 'kri0004', 'kri0005']));
  });

  test('32.04: with the default configuration there is no expand control (#32)', async ({ app, page }) => {
    await app.openStudy(study.StudyID);
    await expect(page.locator('.card.kri')).toHaveCount(KRIS.length);
    await expect(page.locator('[data-kri-expand]')).toHaveCount(0);
  });

  test('32.04: KRIs hidden by default appear only after the expand control after the last KRI card is used, which reveals them all in order, and portfolio hiding still applies (#32)', async ({ app, page }) => {
    const hash = `#statuses=Released&statuses=Planned&hide=${metricOf('kri0009').MetricID}`;
    await app.openStudy(study.StudyID, configure({ kri0002: { hidden: true }, kri0005: { hidden: true }, kri0009: { hidden: true }, kri0010: { hidden: true } }), hash);
    const out = ['kri0001', 'kri0002', 'kri0003', 'kri0004'];
    expect(await gridOf(page)).toEqual([...trackerWithout([...out, 'kri0005', 'kri0009', 'kri0010']), 'expand']);
    await expect(page.locator('[data-kri-expand]')).toHaveCount(1);
    await page.locator('[data-kri-expand]').click();
    expect(await gridOf(page), 'kri0002 stays out by status filter, kri0009 by hidden metric').toEqual(trackerWithout([...out, 'kri0009']));
    for (const id of ['kri0005', 'kri0010']) expect(await readKri(page, metricOf(id).MetricID), `${id}: the revealed card shows its values`).toEqual(expectedKri(metricOf(id), study, null));
  });

  test('32.04: with every KRI hidden by default, the expand control ends the grid and reveals them all (#32)', async ({ app, page }) => {
    await app.openStudy(study.StudyID, configure(Object.fromEntries(KRIS.map((id) => [id, { hidden: true }]))));
    expect(await gridOf(page)).toEqual([...trackerWithout(KRIS), 'expand']);
    await page.locator('[data-kri-expand]').click();
    expect(await gridOf(page)).toEqual(TRACKER_CARDS.map((c) => c.id));
  });

  test('32.04: with every KRI hidden by default and every other card\'s metric hidden from the portfolio, the expand control alone is shown and reveals the KRIs (#32)', async ({ app, page }) => {
    const ctqMetrics = [...new Set(TRACKER_CARDS.filter((c) => c.kind !== 'kri').map((c) => c.metric))];
    expect(ctqMetrics).toHaveLength(6);
    const hash = `#${ctqMetrics.map((id) => `hide=${metricOf(id).MetricID}`).join('&')}`;
    await app.openStudy(study.StudyID, configure(Object.fromEntries(KRIS.map((id) => [id, { hidden: true }]))), hash);
    expect(await gridOf(page)).toEqual(['expand']);
    await page.locator('[data-kri-expand]').click();
    expect(await gridOf(page)).toEqual(KRIS);
    for (const id of KRIS) expect(await readKri(page, metricOf(id).MetricID), `${id}: the revealed card shows its values`).toEqual(expectedKri(metricOf(id), study, null));
  });

  test('32.06: each compact widget opens the Charts drill-in after its card, shows a configured detailed-report link and nothing else in its footer, and has no view pager (#32)', async ({ app, page }) => {
    const linked = metricOf('kri0004');
    await app.openStudy(study.StudyID, {
      portfolio: (p) => {
        p.metrics.find((/** @type {any} */ x) => x.ID === linked.ID).ReportLink = 'reports/ipd.html';
      },
    });
    const kris = page.locator('.card.kri');
    await expect(kris).toHaveCount(KRIS.length);
    await expect(page.locator('.card.kri :is(.vbtn, .view-name, [data-view-step])')).toHaveCount(0);
    for (const id of KRIS) {
      const m = metricOf(id);
      const foot = page.locator(`.card.kri[data-metric-id="${m.MetricID}"] .tile-foot`);
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
    for (const id of KRIS) {
      const m = metricOf(id);
      const charts = page.locator(`[data-detail-metric="${m.MetricID}"]`);
      expect(await userSees(charts), `${id}: the Charts button can be seen`).toBe(true);
      await charts.click();
      const panel = page.locator('.cards > .detail');
      await expect(panel.locator('.detail-title'), id).toHaveText(m.Metric);
      expect(await panel.evaluate((el) => el.previousElementSibling?.getAttribute('data-metric-id')), `${id}: the panel follows its card`).toBe(m.MetricID);
      await expect(panel.locator('[data-detail-tab]'), id).toHaveCount(3);
      await expect(panel.locator('.detail-body'), id).toBeVisible();
      await expect(page.locator('.detail'), id).toHaveCount(1);
      await panel.locator('[data-detail-close]').click();
      await expect(page.locator('.detail'), id).toHaveCount(0);
    }
  });

  test('32.05: the card grid, with a KRI hidden by default, captured for user acceptance (user acceptance) (#32)', async ({ app, page, evidence }) => {
    await app.openStudy(study.StudyID, configure({ kri0002: { hidden: true } }));
    await expect(page.locator('.cards > [data-kri-expand]')).toBeVisible();
    await expect(page.locator('.card.kri')).toHaveCount(KRIS.length - 1);
    await evidence.shot(page, 'the card grid with a KRI hidden by default');
  });
});

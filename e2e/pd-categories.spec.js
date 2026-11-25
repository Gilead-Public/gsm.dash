// @ts-check
// #19: the top protocol-deviation categories (tracker widgets 10 and 11), at the shipped card size. Expected bars come
// from test/qual/distributions.js over the snapshot's rows, never from src/.
import { DISTRIBUTION_CONFIG } from '../src/config/distributions.js';
import { expectedView } from '../test/qual/distributions.js';
import { expect, readData, test } from './fixtures/app.js';
import { card, TRACKER_CARDS } from './fixtures/tiles.js';
/** @typedef {import('@playwright/test').Page} Page */

const portfolio = readData('portfolio.json');
const study = portfolio.studies[0];
const snapshot = readData(study.files[study.snapshots.at(-1)]);
/** @param {string} id */
const metricOf = (id) => portfolio.metrics.find((/** @type {any} */ m) => m.ID === id);
const CONFIG = /** @type {Record<string, any>} */ (DISTRIBUTION_CONFIG);
const PD = [
  { id: 'important-pd-categories', metric: 'kri0004' },
  { id: 'non-important-pd-categories', metric: 'kri0003' },
];
const SECTION = 'Numerator:dvdecod';

/**
 * The category bars a user should see, from the given rows and the shipped configuration.
 * @param {any[]} rows
 * @param {string} metric
 */
function expectedBars(rows, metric) {
  const mine = rows.filter((r) => r.MetricID === metricOf(metric).MetricID && `${r.Source}:${r.Variable}` === SECTION);
  const [section] = expectedView(mine, CONFIG[metric]);
  return section.bars.map((/** @type {any} */ b) => [b.label, b.count.toLocaleString('en-US')]);
}

/**
 * Every bar as shown: its label and value, and whether each is visible and inside the card, with the body unscrolled.
 * @param {Page} page
 * @param {string} id
 */
const shownBars = (page, id) =>
  card(page, id).evaluate((c) => {
    const box = c.getBoundingClientRect();
    const inside = (/** @type {Element} */ e) => {
      const r = e.getBoundingClientRect();
      return e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && r.width > 0 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5 && r.left >= box.left - 0.5 && r.right <= box.right + 0.5;
    };
    const body = /** @type {HTMLElement} */ (c.querySelector('.tile-body'));
    const rows = [...c.querySelectorAll('.dist-row')].map((r) => {
      const lbl = /** @type {HTMLElement} */ (r.querySelector('.lbl'));
      const v = /** @type {HTMLElement} */ (r.querySelector('.v, .p'));
      return {
        kind: r.getAttribute('data-kind'),
        label: (lbl.textContent ?? '').trim(),
        value: (v.textContent ?? '').trim(),
        seen: inside(lbl) && inside(v) && lbl.scrollWidth <= lbl.clientWidth + 1,
      };
    });
    return { rows, scrolled: body.scrollHeight > body.clientHeight + 1, text: body.innerText };
  });

/**
 * Rows for the important-PD card in one site: seven categories whose 5th and 6th place tie, the tied pair listed with
 * the alphabetically later one first, and long labels that must wrap.
 * @param {any} snap
 */
function withTieAndLongLabels(snap) {
  const id = metricOf('kri0004').MetricID;
  const template = (snap.distributions ?? []).find((/** @type {any} */ r) => r.MetricID === id && r.Variable === 'dvdecod');
  if (!template) return;
  const counts = [
    ['Study procedures not performed as described in the protocol, including missed assessments at scheduled visits', 9],
    ['Investigational product dosing, storage or accountability outside the protocol and pharmacy manual', 8],
    ['Eligibility criteria not met at randomisation and enrolment continued without a sponsor waiver', 7],
    ['Safety reporting timelines for serious adverse events not met', 6],
    ['Visit schedule', 5],
    ['Informed consent', 5],
    ['Other', 2],
  ];
  const Total = counts.reduce((a, [, n]) => a + Number(n), 0);
  snap.distributions = [
    ...snap.distributions.filter((/** @type {any} */ r) => !(r.MetricID === id && r.Variable === 'dvdecod')),
    ...counts.map(([Category, Count]) => ({ ...template, Category, Count, Participants: Count, Total, Percent: Number(Count) / Total })),
  ];
}

test.describe('top protocol-deviation categories (#19)', () => {
  test('19.01: each PD card shows its top 5 categories, each label and count visible without scrolling at the shipped card size, equal to independently summed fixture rows (#19)', async ({ app, page }) => {
    await app.openStudy(study.StudyID);
    for (const { id, metric } of PD) {
      const seen = await shownBars(page, id);
      const want = expectedBars(snapshot.distributions, metric);
      expect(seen.rows.map((r) => [r.label, r.value]), id).toEqual(want);
      expect(seen.rows.filter((r) => r.kind === 'category'), `${id}: five categories`).toHaveLength(5);
      expect(seen.rows.filter((r) => !r.seen).map((r) => r.label), `${id}: bars not fully visible`).toEqual([]);
      expect(seen.scrolled, `${id}: the body scrolls`).toBe(false);
    }
  });

  test('19.01: long category labels and a tie at the cut: still five visible categories, the tie broken alphabetically, the cards grown together rather than any bar dropped (#19)', async ({ app, page }) => {
    const rows = structuredClone(snapshot);
    withTieAndLongLabels(rows);
    await app.openStudy(study.StudyID, { snapshot: withTieAndLongLabels });
    const seen = await shownBars(page, 'important-pd-categories');
    const want = expectedBars(rows.distributions, 'kri0004');
    expect(seen.rows.map((r) => [r.label, r.value])).toEqual(want);
    expect(seen.rows.filter((r) => r.kind === 'category').map((r) => r.label).slice(3)).toEqual(['Safety reporting timelines for serious adverse events not met', 'Informed consent']);
    expect(seen.rows.find((r) => r.kind === 'more')?.label).toBe('+ 2 more');
    expect(seen.rows.filter((r) => !r.seen).map((r) => r.label), 'bars not fully visible').toEqual([]);
    expect(seen.scrolled, 'the body scrolls').toBe(false);
    const heights = await page.locator('.tiles.cards > .card').evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().height)))]);
    expect(heights, 'every card the same height').toHaveLength(1);
  });

  test('19.02: no percentages are shown on either PD card (#19)', async ({ app, page }) => {
    await app.openStudy(study.StudyID);
    for (const { id } of PD) {
      const seen = await shownBars(page, id);
      expect(seen.text, id).not.toContain('%');
      for (const r of seen.rows) expect(r.value, `${id} ${r.label}`).toMatch(/^\d[\d,]*$/);
    }
  });

  test('19.03: the non-important card differs from the important one only in its configuration entry, and renders from it (#19)', async ({ app, page }) => {
    expect(CONFIG.kri0003).toEqual(CONFIG.kri0004);
    await app.openStudy(study.StudyID);
    const seen = await shownBars(page, 'non-important-pd-categories');
    expect(seen.rows.map((r) => [r.label, r.value])).toEqual(expectedBars(snapshot.distributions, 'kri0003'));
    await expect(card(page, 'non-important-pd-categories')).toHaveAttribute('data-metric-id', metricOf('kri0003').MetricID);
  });

  test('19.04: both PD cards appear exactly once, after widget 9 and before the standard KRIs, important first (#19)', async ({ app, page }) => {
    await app.openStudy(study.StudyID);
    const order = await page.locator('.tiles.cards > .card').evaluateAll((els) => els.map((e) => e.getAttribute('data-card')));
    for (const { id } of PD) expect(order.filter((x) => x === id), id).toHaveLength(1);
    const at = (/** @type {string} */ id) => order.indexOf(id);
    const firstKri = order.indexOf(TRACKER_CARDS.find((c) => c.kind === 'kri')?.id ?? '');
    expect([at('important-pd-categories'), at('non-important-pd-categories')]).toEqual([at('screen-failure-reasons') + 1, at('screen-failure-reasons') + 2]);
    expect(firstKri).toBe(at('non-important-pd-categories') + 1);
  });
});

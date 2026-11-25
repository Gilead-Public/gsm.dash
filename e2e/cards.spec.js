// @ts-check
// #32: every card on the study page is the same size, with nothing clipped (32.08). Expected values come from
// test/qual/, never from src/.
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('../test/qual/pooling.js').StudyEntry} StudyEntry */
import { DISTRIBUTION_CONFIG } from '../src/config/distributions.js';
import { expectedView } from '../test/qual/distributions.js';
import { expect, readData, test } from './fixtures/app.js';
import { card, TRACKER_CARDS } from './fixtures/tiles.js';
import { layout } from './fixtures/card-layout.js';

const portfolio = readData('portfolio.json');
/** @type {StudyEntry[]} */
const studies = portfolio.studies;
const study = studies[0];
/** @param {string} id */
const metricOf = (id) => portfolio.metrics.find((/** @type {any} */ m) => m.ID === id);
const CONFIG = /** @type {Record<string, any>} */ (DISTRIBUTION_CONFIG);

/**
 * Every card is the same size and shows its title, its value and n / N (unless it can't show its widget)
 * and its body, with every piece of text visible and inside its card.
 * @param {Page} page
 * @param {string} where
 */
async function expectFitted(page, where) {
  const seen = await layout(page);
  expect(seen.cards, where).toBe(TRACKER_CARDS.length);
  expect(seen.sizes, `${where}: one card size`).toHaveLength(1);
  expect(seen.unseen, `${where}: text a user can't see`).toEqual([]);
  expect(seen.outside, `${where}: text outside its card or clipped`).toEqual([]);
  for (const [i, c] of TRACKER_CARDS.entries()) {
    const p = seen.parts[i];
    expect(p.id, where).toBe(c.id);
    expect(p.title, `${where} ${c.id} title`).toBe(c.title || metricOf(c.metric).Metric);
    expect(p.body, `${where} ${c.id} body`).toBeTruthy();
    if (p.problem) continue;
    expect([p.value, p.nd], `${where} ${c.id} value and n / N`).toEqual([expect.stringMatching(/\S/), expect.stringMatching(/ \/ /)]);
  }
}

/** Each breakdown card's category bars when it has room for its configured top-N, from the fixture. */
const breakdowns = TRACKER_CARDS.filter((c) => c.kind === 'bars').map((c) => {
  const m = metricOf(c.metric);
  const snapshot = readData(study.files[study.snapshots.at(-1) ?? '']);
  const rows = snapshot.distributions.filter((/** @type {any} */ d) => d.MetricID === m.MetricID && `${d.Source}:${d.Variable}` === c.section);
  const [section] = expectedView(rows, CONFIG[m.ID]);
  const own = section.bars.filter((/** @type {any} */ b) => b.kind === 'category' && !(c.exclude ?? []).includes(b.label)).length;
  return { id: c.id, bars: own + (c.lead?.categories.length ?? 0) };
});

/**
 * @param {Page} page
 * @param {string} id
 */
const barsShown = (page, id) => card(page, id).locator('.dist-row[data-kind="category"]').count();

test.describe('cards of one size, with nothing clipped', () => {
  test('32.08: every card has the same width and height and no text is clipped or outside its card, as the window narrows and widens (#32)', async ({ app, page }) => {
    await app.openStudy(study.StudyID);
    await expectFitted(page, 'default window');
    // From wider cards to narrower ones (1000 px to 1400 px), each breakdown must fit itself again.
    for (const width of [1000, 1400, 700, 1600, 1920, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(async () => (await layout(page)).outside, `${width} px`).toEqual([]);
      await expectFitted(page, `${width} px`);
    }
  });

  test('32.08: with breakdowns\' empty messages, and in another study, no text is clipped (#32)', async ({ app, page }) => {
    const empty = ['kri0014', 'kri0019'].map((id) => metricOf(id).MetricID);
    await app.openStudy(study.StudyID, {
      snapshot: (/** @type {any} */ snap) => {
        snap.distributions = (snap.distributions ?? []).filter((/** @type {any} */ r) => !empty.includes(r.MetricID));
      },
    });
    for (const id of ['eligibility-status', 'ip-status']) await expect(card(page, id).locator('[data-empty="no-rows"]'), id).toBeVisible();
    await expectFitted(page, 'with empty breakdowns');
    await app.openStudy(studies[1].StudyID);
    await expectFitted(page, studies[1].StudyID);
  });

  test('32.08: with similar KRI cards combined (an Admin demo setting), long KRI titles and a placeholder included, every card, combined or not, keeps one size, each combined card\'s KRIs stack closely, ruled apart, and no text is clipped, at any width (#32)', async ({ app, page }) => {
    // Names long enough that a combined card needs more than the configured height, for its first KRI and its second.
    const long = ' — a much longer name for this rate that wraps over several lines of the card header'.repeat(6);
    await app.openStudy(study.StudyID, {
      portfolio: (/** @type {any} */ p) => {
        for (const m of p.metrics) if (['kri0004', 'kri0002', 'kri0011'].includes(m.ID)) m.Metric += long;
        p.metrics = p.metrics.filter((/** @type {any} */ m) => m.ID !== 'kri0009');
      },
    }, '#combine=on');
    await expect(page.locator('.card-part[data-card="kri0009"] .ref-problem')).toBeVisible();
    await expect(page.locator('.card.combined')).toHaveCount(4);
    for (const width of [1280, 1000, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(async () => (await layout(page)).outside, `${width} px`).toEqual([]);
      const seen = await layout(page);
      expect(seen.cards, `${width} px: four pairs in four cards`).toBe(TRACKER_CARDS.length - 4);
      expect(seen.sizes, `${width} px: one card size`).toHaveLength(1);
      expect(seen.combined.map((c) => [c.close, c.ruled]), `${width} px: each second KRI close under the first, ruled apart`).toEqual(Array(4).fill([true, true]));
      expect(seen.unseen, `${width} px: text a user can't see`).toEqual([]);
    }
  });

  test('32.08: a card that can\'t show its widget keeps the same size and shows its whole message (#32)', async ({ app, page }) => {
    await app.openStudy(study.StudyID, {
      portfolio: (/** @type {any} */ p) => {
        p.metrics = p.metrics.filter((/** @type {any} */ m) => m.ID !== 'kri0019');
      },
    });
    await expect(card(page, 'ip-status').locator('.ref-problem')).toBeVisible();
    await expectFitted(page, 'with a placeholder');
    expect((await layout(page)).parts.find((p) => p.id === 'ip-status')?.problem).toBe(true);
  });

  test('32.08: when a card can\'t shorten its content to fit, as the important-PD card with long category labels, every card grows with it, at any width, and keeps its configured size when no card needs more (#32)', async ({ app, page }) => {
    const pd = metricOf('kri0004').MetricID;
    const long = ' — a long description of the deviation category that wraps over several lines in a card of the shipped size';
    await app.openStudy(study.StudyID, {
      snapshot: (/** @type {any} */ snap) => {
        for (const r of snap.distributions ?? []) if (r.MetricID === pd && r.Variable === 'dvdecod' && r.Category !== null) r.Category += long;
      },
    });
    await expect(card(page, 'important-pd-categories').locator('.dist-row[data-kind="category"]')).toHaveCount(5);
    const configured = Number.parseFloat(await page.locator('.tiles.cards').evaluate((g) => getComputedStyle(g).getPropertyValue('--card-h')));
    const height = () => card(page, 'kri0001').evaluate((c) => c.getBoundingClientRect().height);
    expect(configured).toBeGreaterThan(0);
    await expectFitted(page, 'with long category labels');
    expect(await height(), 'every card grew').toBeGreaterThan(configured + 1);
    for (const width of [1400, 700, 1920, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(async () => (await layout(page)).outside, `${width} px`).toEqual([]);
      await expectFitted(page, `${width} px`);
    }
    // Under the sub-path, an override is a route: drop it to open the report as shipped.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await app.openStudy(study.StudyID);
    await expect.poll(height, 'no card needs more room without the long labels').toBeCloseTo(configured, 0);
    await expectFitted(page, 'without the long labels');
  });

  test('32.08: a breakdown shows fewer bars than its top-N only for lack of room: it leaves less room than another bar would take, and given taller cards each shows them all (#32)', async ({ app, page }) => {
    // Long reason labels wrap over several lines, so some breakdown has more bars than its card has room for.
    const long = ' — a long description of the reason that wraps over several lines in a card of the shipped size';
    const reasons = ['Numerator:ietestcd_concat', 'Numerator:sf_reason', 'Numerator:drv_premature_discontinuation_reason'];
    await app.openStudy(study.StudyID, {
      snapshot: (/** @type {any} */ snap) => {
        for (const r of snap.distributions ?? []) if (reasons.includes(`${r.Source}:${r.Variable}`) && r.Category !== null) r.Category += long;
      },
    });
    let trimmed = 0;
    for (const b of breakdowns) {
      const shown = await barsShown(page, b.id);
      expect(shown, b.id).toBeGreaterThan(0);
      expect(shown, b.id).toBeLessThanOrEqual(b.bars);
      if (shown < b.bars) {
        trimmed++;
        await expect(card(page, b.id).locator('.dist-row[data-kind="more"]'), `${b.id} gathers the rest`).toHaveCount(1);
      }
    }
    expect(trimmed, 'some breakdown is longer than its card allows at this size').toBeGreaterThan(0);
    // A trimmed breakdown leaves less room than one more bar would take: a one-line bar and the gap before it.
    for (const b of breakdowns) {
      const room = await card(page, b.id).locator('.tile-body').evaluate((body) => {
        const bars = [...body.querySelectorAll('.dist-row[data-kind="category"]')].map((r) => r.getBoundingClientRect().height);
        const gap = Number.parseFloat(getComputedStyle(/** @type {Element} */ (body.querySelector('.dist-bars'))).rowGap);
        const content = /** @type {Element} */ (body.firstElementChild).getBoundingClientRect().bottom;
        return { spare: body.getBoundingClientRect().bottom - content, row: Math.min(...bars) + gap };
      });
      if ((await barsShown(page, b.id)) < b.bars) expect(room.spare, `${b.id}: room left unused`).toBeLessThan(room.row);
    }
    await page.addStyleTag({ content: '.tiles.cards { --card-h: 900px; }' });
    for (const b of breakdowns) await expect.poll(() => barsShown(page, b.id), b.id).toBe(b.bars);
    await expectFitted(page, 'taller cards');
  });
});

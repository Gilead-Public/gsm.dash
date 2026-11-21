// @ts-check
// #32: every card on the study page is the same size, with nothing clipped (32.08), and its header's sparkline draws
// the card's value at each snapshot up to the visit shown (32.09). Expected values come from test/qual/, never from
// src/.
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('../test/qual/pooling.js').StudyEntry} StudyEntry */
import { DISTRIBUTION_CONFIG } from '../src/config/distributions.js';
import { expectedView } from '../test/qual/distributions.js';
import { pooled } from '../test/qual/pooling.js';
import { expect, readData, test } from './fixtures/app.js';
import { card, TRACKER_CARDS } from './fixtures/tiles.js';

const portfolio = readData('portfolio.json');
/** @type {StudyEntry[]} */
const studies = portfolio.studies;
const study = studies[0];
/** @param {string} id */
const metricOf = (id) => portfolio.metrics.find((/** @type {any} */ m) => m.ID === id);
const CONFIG = /** @type {Record<string, any>} */ (DISTRIBUTION_CONFIG);

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

/**
 * Every card's size; its title, value, n / N, sparkline and body text; each piece of text a user can't see (hidden,
 * transparent or without a box); and each piece that lies outside its card, outside the part of the card it sits in
 * (header, value, body or footer), or outside a box that would clip it.
 * @param {Page} page
 */
const layout = (page) =>
  page.locator('.study-page .cards').evaluate((grid) => {
    const cards = [...grid.querySelectorAll(':scope > .card')];
    /**
     * @param {DOMRect} r
     * @param {DOMRect} b
     */
    const inside = (r, b) => r.left >= b.left - 0.5 && r.right <= b.right + 0.5 && r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5;
    /** @param {string} colour */
    const transparent = (colour) => colour === 'transparent' || /,\s*0\)$|\/\s*0\)$/.test(colour);
    /** @param {Element | null | undefined} e */
    const text = (e) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
    /** @type {string[]} */
    const outside = [];
    /** @type {string[]} */
    const unseen = [];
    for (const c of cards) {
      const id = c.getAttribute('data-card');
      const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const content = n.textContent?.trim() ?? '';
        const parent = /** @type {Element} */ (n.parentElement);
        if (!content) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
        if (!parent.checkVisibility({ opacityProperty: true, visibilityProperty: true }) || transparent(getComputedStyle(parent).color) || !rects.length) {
          unseen.push(`${id}: "${content}"`);
          continue;
        }
        const boxes = [c];
        for (let a = /** @type {Element | null} */ (parent); a && a !== c; a = a.parentElement) {
          const st = getComputedStyle(a);
          if (a.parentElement === c || st.overflowX !== 'visible' || st.overflowY !== 'visible') boxes.push(a);
        }
        for (const r of rects) {
          for (const b of boxes) if (!inside(r, b.getBoundingClientRect())) outside.push(`${id}: "${content}" outside ${b === c ? 'the card' : b.className}`);
        }
      }
    }
    const parts = cards.map((c) => {
      const spark = c.querySelector('.card-value .spark');
      return {
        id: c.getAttribute('data-card'),
        title: text(c.querySelector('.tile-head .name')),
        value: text(c.querySelector('.card-value .big')),
        nd: text(c.querySelector('.card-value .card-nd')),
        spark: spark ? (spark.querySelector('svg') ? 'svg' : text(spark)) : null,
        body: text(c.querySelector('.tile-body')),
        problem: Boolean(c.querySelector('.ref-problem')),
      };
    });
    const sizes = cards.map((c) => {
      const r = c.getBoundingClientRect();
      return `${r.width.toFixed(1)} × ${r.height.toFixed(1)}`;
    });
    return { cards: cards.length, sizes: [...new Set(sizes)], parts, unseen: [...new Set(unseen)], outside: [...new Set(outside)] };
  });

/**
 * Every card is the same size and shows its title, its value, n / N and sparkline (unless it can't show its widget)
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
    expect(p.spark, `${where} ${c.id} sparkline`).toMatch(/^(svg|—)$/);
  }
}

/** Each breakdown card's category bars when it has room for its configured top-N, from the fixture. */
const breakdowns = TRACKER_CARDS.filter((c) => c.kind === 'bars').map((c) => {
  const m = metricOf(c.metric);
  const snapshot = readData(study.files[study.snapshots.at(-1) ?? '']);
  const rows = snapshot.distributions.filter((/** @type {any} */ d) => d.MetricID === m.MetricID && `${d.Source}:${d.Variable}` === c.section);
  const [section] = expectedView(rows, CONFIG[m.ID]);
  return { id: c.id, bars: section.bars.filter((/** @type {any} */ b) => b.kind === 'category').length };
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

  test('32.08: at earlier visits, with breakdowns\' empty messages and sparklines of one point, and in another study, no text is clipped (#32)', async ({ app, page }) => {
    await app.openStudy(study.StudyID);
    for (const index of [1, 0]) {
      await goToVisit(page, index);
      await expect(page.locator('.visits .meta')).toContainText(study.snapshots[index]);
      await expect(card(page, 'eligibility-status').locator('[data-empty="not-published"]')).toBeVisible();
      await expectFitted(page, `visit ${index + 1}`);
    }
    await app.openStudy(studies[1].StudyID);
    await expectFitted(page, studies[1].StudyID);
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

  test('32.08: when a card can\'t shorten its content to fit, as widget 4 with a blank death window, every card grows with it, at any width, and returns to its size when no card needs more (#32)', async ({ app, page }) => {
    const deaths = metricOf('kri0015').MetricID;
    await app.openStudy(study.StudyID, {
      snapshot: (/** @type {any} */ snap) => {
        const blank = (snap.distributions ?? []).filter((/** @type {any} */ r) => r.MetricID === deaths && r.Category === null && /^(death_window|window_)/.test(r.Variable));
        for (const r of blank.filter((/** @type {any} */ r) => r.GroupID === blank[0].GroupID)) r.Count = 2;
      },
    });
    await expect(card(page, 'premature-deaths').locator('tr[data-category="Not recorded"]')).toHaveCount(2);
    const configured = Number.parseFloat(await page.locator('.tiles.cards').evaluate((g) => getComputedStyle(g).getPropertyValue('--card-h')));
    const height = () => card(page, 'kri0001').evaluate((c) => c.getBoundingClientRect().height);
    expect(configured).toBeGreaterThan(0);
    await expectFitted(page, 'with a blank death window');
    expect(await height(), 'every card grew').toBeGreaterThan(configured + 1);
    for (const width of [1400, 700, 1920, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(async () => (await layout(page)).outside, `${width} px`).toEqual([]);
      await expectFitted(page, `${width} px`);
    }
    await goToVisit(page, 1);
    await expect(page.locator('.visits .meta')).toContainText(study.snapshots[1]);
    await expect.poll(height, 'no card needs more room at an earlier visit').toBeCloseTo(configured, 0);
    await expectFitted(page, 'earlier visit');
  });

  test('32.08: a breakdown shows fewer bars than its top-N only for lack of room: it leaves less room than another bar would take, and given taller cards each shows them all (#32)', async ({ app, page }) => {
    await app.openStudy(study.StudyID);
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

/**
 * What one card's sparkline should show at a visit, from the fixture as `read` gives it: the pooled value at each of
 * the study's snapshots up to the visit, null where there is none, and its label.
 * @param {(typeof TRACKER_CARDS)[number]} c
 * @param {StudyEntry} of
 * @param {number} index
 * @param {(path: string) => any} [read]
 */
function expectedSpark(c, of, index, read = readData) {
  const m = metricOf(c.metric);
  const dates = [...of.snapshots].sort().slice(0, index + 1);
  const rates = dates.map((d) => pooled(read, [of], m.MetricID, d).rate);
  const last = rates.at(-1);
  const unit = m.WidgetConfigs?.['kri-summary']?.unit ?? 'per 28 days';
  const latest = last == null ? '—' : m.Display === 'per_28d' ? `${(last * 28).toFixed(2)} ${unit}` : `${(last * 100).toFixed(1)}%`;
  const missing = rates.filter((r) => r == null).length;
  return { rates, label: `${c.title || m.Metric} trend: ${rates.length} snapshots${missing ? `, ${missing} without a value` : ''}, latest ${latest}` };
}

/**
 * What a sparkline draws: its label, the number of points in each piece of line, the lone dots, whether the last
 * snapshot has its end dot, and every point drawn, left to right.
 * @param {import('@playwright/test').Locator} svg
 */
const readSpark = (svg) =>
  svg.evaluate((el) => {
    /** @param {Element} c */
    const at = (c) => ({ x: Number(c.getAttribute('cx')), y: Number(c.getAttribute('cy')) });
    const segments = (el.querySelector('.spark-line')?.getAttribute('d') ?? '')
      .split('M')
      .filter((seg) => seg.trim())
      .map((seg) => [...seg.matchAll(/([\d.]+),([\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) })));
    const lone = [...el.querySelectorAll('.spark-point')].map(at);
    const end = el.querySelector('.spark-dot');
    const drawn = [...segments.flat(), ...lone, ...(end ? [at(end)] : [])];
    const points = [...new Map(drawn.map((p) => [p.x, p])).values()].sort((a, b) => a.x - b.x);
    const [, , width, height] = (el.getAttribute('viewBox') ?? '').split(' ').map(Number);
    return { label: el.getAttribute('aria-label'), pieces: segments.map((seg) => seg.length), lone: lone.length, end: Boolean(end), points, width, height };
  });

/**
 * Checks a card's sparkline against the expected value at each snapshot: one place per snapshot, each value at its own
 * place and height (scaled to the series' range), a gap where a value is missing, and the label.
 * @param {import('@playwright/test').Locator} svg
 * @param {{ rates: (number | null)[], label: string }} want
 * @param {string} where
 */
async function expectSpark(svg, want, where) {
  const seen = await readSpark(svg);
  expect(seen.label, where).toBe(want.label);
  const slots = want.rates.flatMap((r, i) => (r == null ? [] : [i]));
  /** @type {number[][]} */
  const runs = [[]];
  want.rates.forEach((r, i) => (r == null ? runs.push([]) : runs[runs.length - 1].push(i)));
  const end = want.rates.length - 1;
  expect(seen.pieces, `${where}: pieces of line`).toEqual(runs.filter((r) => r.length > 1).map((r) => r.length));
  expect(seen.lone, `${where}: lone values`).toBe(runs.filter((r) => r.length === 1 && r[0] !== end).length);
  expect(seen.end, `${where}: end dot`).toBe(want.rates[end] != null);
  expect(seen.points, `${where}: points`).toHaveLength(slots.length);
  for (const p of seen.points) expect(p.x >= 0 && p.x <= seen.width && p.y >= 0 && p.y <= seen.height, `${where}: (${p.x}, ${p.y}) inside the sparkline`).toBe(true);
  const [first, last] = [seen.points[0], seen.points[seen.points.length - 1]];
  const place = seen.points.map((p) => slots[0] + ((p.x - first.x) / (last.x - first.x)) * (slots[slots.length - 1] - slots[0]));
  place.forEach((x, i) => expect(Math.abs(x - slots[i]), `${where}: point ${i + 1}'s place`).toBeLessThan(0.05));
  const ys = seen.points.map((p) => p.y);
  const [top, bottom] = [Math.min(...ys), Math.max(...ys)];
  const heights = ys.map((y) => (bottom === top ? 0.5 : (bottom - y) / (bottom - top)));
  const values = scaled(/** @type {number[]} */ (want.rates.filter((r) => r != null)));
  heights.forEach((h, i) => expect(Math.abs(h - values[i]), `${where}: point ${i + 1}'s height`).toBeLessThan(0.02));
}

/** @param {number[]} values */
function scaled(values) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return values.map((v) => (hi === lo ? 0.5 : (v - lo) / (hi - lo)));
}

test.describe('each card\'s sparkline', () => {
  test('32.09: at the latest and an earlier visit, each card\'s sparkline draws exactly the values pooled independently at the snapshots up to that visit, per-28-day KRIs included, labelled and hovered with the latest value as the header writes it (#32)', async ({ app, page }) => {
    let compared = 0;
    for (const of of [studies[0], studies[3]]) {
      await app.openStudy(of.StudyID);
      for (const index of [of.snapshots.length - 1, 2]) {
        await goToVisit(page, index);
        await expect(page.locator('.visits .meta')).toContainText(of.snapshots[index]);
        for (const c of TRACKER_CARDS) {
          const want = expectedSpark(c, of, index);
          const where = `${of.StudyID} visit ${index + 1} ${c.id}`;
          expect(want.rates.filter((r) => r != null).length, where).toBeGreaterThan(1);
          await expectSpark(card(page, c.id).locator('.card-value .spark svg'), want, where);
          compared++;
        }
      }
    }
    expect(compared).toBe(4 * TRACKER_CARDS.length);
    expect(TRACKER_CARDS.some((c) => metricOf(c.metric).Display === 'per_28d')).toBe(true);
    const ae = TRACKER_CARDS.find((c) => c.metric === 'kri0001');
    const spark = card(page, 'kri0001').locator('.card-value .spark');
    await spark.hover();
    await expect(page.locator('#gsm-tooltip')).toBeVisible();
    await expect(page.locator('#gsm-tooltip')).toHaveText(expectedSpark(/** @type {any} */ (ae), studies[3], 2).label);
  });

  test('32.09: a snapshot without a value, between others or at the visit shown, leaves a gap in the sparkline, which its label reports, and a value with no neighbour is a dot (#32)', async ({ app, page }) => {
    const [ae, lab] = [metricOf('kri0001'), metricOf('kri0008')];
    const dates = [...study.snapshots].sort();
    // AE has no site rows at the second snapshot; every lab site has a zero denominator at the last.
    const change = (/** @type {any} */ snap) => {
      if (snap.SnapshotDate === dates[1]) snap.results = snap.results.filter((/** @type {any} */ r) => r.MetricID !== ae.MetricID);
      if (snap.SnapshotDate === dates.at(-1)) {
        for (const r of snap.results) if (r.MetricID === lab.MetricID && r.GroupLevel === 'Site') Object.assign(r, { Numerator: 0, Denominator: 0, Metric: null, Score: null, Flag: null });
      }
    };
    const read = (/** @type {string} */ path) => {
      const doc = structuredClone(readData(path));
      change(doc);
      return doc;
    };
    await app.openStudy(study.StudyID, { snapshot: change });
    const checked = [];
    for (const index of [dates.length - 1, 2]) {
      await goToVisit(page, index);
      await expect(page.locator('.visits .meta')).toContainText(dates[index]);
      for (const c of TRACKER_CARDS) {
        const want = expectedSpark(c, study, index, read);
        await expectSpark(card(page, c.id).locator('.card-value .spark svg'), want, `visit ${index + 1} ${c.id}`);
        if (want.rates.includes(null)) checked.push(`${index} ${c.id}`);
      }
    }
    expect(checked, 'the gaps checked').toEqual([`${dates.length - 1} kri0001`, `${dates.length - 1} kri0008`, '2 kri0001']);
    await goToVisit(page, dates.length - 1);
    await expect(card(page, 'kri0008').locator('.card-value .big'), 'the header has no value at the visit shown either').toHaveText('—');
    await expect(card(page, 'kri0008').locator('.card-value .spark svg')).toHaveAttribute('aria-label', /, 1 without a value, latest —$/);
    await goToVisit(page, 2);
    const lone = await readSpark(card(page, 'kri0001').locator('.card-value .spark svg'));
    expect([lone.pieces, lone.lone, lone.end], 'two values either side of a gap: two dots and no line').toEqual([[], 1, true]);
  });

  test('32.09: with one snapshot up to the visit, every card shows "—" and no trend line (#32)', async ({ app, page }) => {
    await app.openStudy(study.StudyID);
    await goToVisit(page, 0);
    await expect(page.locator('.visits .meta')).toContainText(study.snapshots[0]);
    for (const c of TRACKER_CARDS) {
      const spark = card(page, c.id).locator('.card-value .spark');
      await expect(spark, c.id).toHaveText('—');
      await expect(spark.locator('svg, path'), c.id).toHaveCount(0);
    }
  });
});

// @ts-check
// #48: the study page's header names its latest snapshot; each card's header carries the value and n / N on its right,
// whose hover names both, and its sections name their totals; status values show their counts; notes sit behind a
// footer marker; and the grid holds up to the Admin panel's cards per row. Expected values come from test/qual/.
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('../test/qual/pooling.js').StudyEntry} StudyEntry */
import { DISTRIBUTION_CONFIG } from '../src/config/distributions.js';
import { expectedView } from '../test/qual/distributions.js';
import { latestSnapshot, pooled } from '../test/qual/pooling.js';
import { expect, readData, test } from './fixtures/app.js';
import { card, TRACKER_CARDS } from './fixtures/tiles.js';

const portfolio = readData('portfolio.json');
/** @type {StudyEntry[]} */
const studies = portfolio.studies;
const study = studies[0];
const snapshot = readData(study.files[latestSnapshot(study)]);
/** @param {string} id */
const metricOf = (id) => portfolio.metrics.find((/** @type {any} */ m) => m.ID === id);
const CONFIG = /** @type {Record<string, any>} */ (DISTRIBUTION_CONFIG);
const BREAKDOWNS = TRACKER_CARDS.filter((c) => c.kind === 'bars');
const int = (/** @type {number} */ x) => x.toLocaleString('en-US');
const pct = (/** @type {number} */ x) => `${(x * 100).toFixed(1)}%`;
/** Exposure days as 28-day periods, to one decimal, rounded from the unrounded sum. @param {number} days */
const periods = (days) => (Math.round((days / 28) * 10) / 10).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * One breakdown card's section, as the fixture and configuration give it.
 * @param {(typeof TRACKER_CARDS)[number]} c
 */
function sectionFor(c) {
  const m = metricOf(c.metric);
  const rows = snapshot.distributions.filter((/** @type {any} */ d) => d.MetricID === m.MetricID && `${d.Source}:${d.Variable}` === c.section);
  return expectedView(rows, CONFIG[m.ID])[0];
}

test('48.01: for a study with several snapshots and one with one, the header reads "Latest snapshot: <date>", and there is no visit slider (#48)', async ({ app, page }) => {
  await app.openStudy(study.StudyID);
  await expect(page.locator('.dd-head')).toContainText(`Latest snapshot: ${latestSnapshot(study)}`);
  const last = latestSnapshot(study);
  await app.openReport(study.StudyID, {
    document: (doc) => {
      doc.study.snapshots = [last];
      doc.snapshots = doc.snapshots.filter((/** @type {{ SnapshotDate: string }} */ s) => s.SnapshotDate === last);
    },
  });
  await expect(page.locator('.dd-head')).toContainText(`Latest snapshot: ${last}`);
  for (const id of [study.StudyID, studies[3].StudyID]) {
    if (id !== study.StudyID) await app.openStudy(id);
    await expect(page.locator('input[type="range"], [data-visit]'), id).toHaveCount(0);
    expect(await page.locator('.dd-head').innerText(), id).not.toMatch(/\bvisit\b|extract/i);
  }
  await expect(page.locator('.dd-head')).toContainText(`Latest snapshot: ${latestSnapshot(studies[3])}`);
});

test('48.02: each card\'s header shows its title on the left and, behind a rule on the right, the value over n / N, with no status tag, trend graph or abbreviation; the title\'s hover holds the abbreviation and MetricID (#48)', async ({ app, page }) => {
  await app.openStudy(study.StudyID);
  const heads = await page.locator('.tiles.cards > .card').evaluateAll((cards) =>
    cards.map((c) => {
      const name = /** @type {Element} */ (c.querySelector('.tile-head .name')).getBoundingClientRect();
      const box = c.querySelector('.tile-head .card-value');
      const value = box?.getBoundingClientRect();
      const big = box?.querySelector('.big');
      const nd = box?.querySelector('.card-nd');
      const st = box ? getComputedStyle(box) : null;
      return {
        id: c.getAttribute('data-card'),
        right: Boolean(value && value.left >= name.right - 0.5),
        rule: st ? Number.parseFloat(st.borderLeftWidth) >= 1 && st.borderLeftStyle !== 'none' : false,
        big: big ? [getComputedStyle(big).fontSize, getComputedStyle(big).fontWeight] : null,
        stacked: Boolean(big && nd && nd.getBoundingClientRect().top >= big.getBoundingClientRect().bottom - 2),
        small: nd ? Number.parseFloat(getComputedStyle(nd).fontSize) >= 12 : false,
        extras: c.querySelectorAll('.pill, .spark, .abbr, svg').length,
      };
    }),
  );
  expect(heads).toHaveLength(TRACKER_CARDS.length);
  for (const h of heads) expect(h, String(h.id)).toEqual({ id: h.id, right: true, rule: true, big: ['24px', '700'], stacked: true, small: true, extras: 0 });
  for (const c of [BREAKDOWNS[0], TRACKER_CARDS.find((x) => x.kind === 'kri')]) {
    const m = metricOf(/** @type {any} */ (c).metric);
    await card(page, /** @type {any} */ (c).id).locator('.tile-head .name').hover();
    await expect(page.locator('#gsm-tooltip'), /** @type {any} */ (c).id).toContainText(`${m.Abbreviation} · ${m.ID}`);
  }
});

test('48.03: each card\'s value hover names n and N with the catalog\'s labels, N in the unit shown: per 28 days, 28-day periods of exposure with the exposure days beside them, never N in days; every number equals an independent computation (#48)', async ({ app, page }) => {
  await app.openStudy(study.StudyID);
  const tip = page.locator('#gsm-tooltip');
  let per28 = 0;
  for (const c of TRACKER_CARDS) {
    const m = metricOf(c.metric);
    const p = pooled(readData, [study], m.MetricID, null);
    const isPer28 = m.Display === 'per_28d';
    const N = isPer28 ? periods(p.denominator) : int(p.denominator);
    const value = card(page, c.id).locator('.tile-head .card-value');
    await expect(value.locator('.card-nd'), c.id).toHaveText(`${int(p.numerator)} / ${N}`);
    await value.hover();
    await expect(tip, c.id).toBeVisible();
    const lines = (await tip.innerText()).split('\n').map((l) => l.trim());
    const second = isPer28 ? `${N} · 28-day periods of exposure (${int(p.denominator)} exposure days)` : `${N} · ${m.Denominator}`;
    expect(lines.slice(1), c.id).toEqual([`${int(p.numerator)} · ${m.Numerator}`, second]);
    if (isPer28) {
      expect(lines.join(' '), `${c.id}: N is never named in days`).not.toContain(m.Denominator);
      per28++;
    }
    await page.mouse.move(0, 0);
  }
  expect(per28, 'per-28-day cards checked').toBeGreaterThan(0);
});

test('48.04: each breakdown section\'s title and its unit, % or n, share a row, a long title included; hovering the row shows the title, the section\'s total and what each bar shows, the total being the header\'s N for a status section and its n for a reason section (#48)', async ({ app, page }) => {
  await app.openStudy(study.StudyID);
  const tip = page.locator('#gsm-tooltip');
  const counted = { Numerator: 0, Denominator: 0 };
  for (const c of BREAKDOWNS) {
    const want = sectionFor(c);
    // The card's own section: a lead from another metric's section is out of that metric's population.
    const sec = card(page, c.id).locator('.dist-sec:not([data-lead])');
    const [title, unit] = await Promise.all([sec.locator('.sub-h').boundingBox(), sec.locator('.dist-cols').boundingBox()]);
    const t = /** @type {{ x: number, y: number, width: number, height: number }} */ (title);
    const u = /** @type {{ x: number, y: number, width: number, height: number }} */ (unit);
    expect(u.y < t.y + t.height && t.y < u.y + u.height && u.x >= t.x + t.width - 0.5, `${c.id}: title and unit share a row`).toBe(true);
    await expect(sec.locator('.dist-cols'), `${c.id}: the unit alone`).toHaveText(want.display === 'percent' ? '%' : 'n');
    await sec.locator('.sub-h').hover();
    await expect(tip, c.id).toBeVisible();
    const lines = (await tip.innerText()).split('\n').map((l) => l.trim());
    expect(lines[0], `${c.id}: the hover's title`).toBe(want.title);
    expect(lines[1], c.id).toMatch(want.display === 'percent' ? /^% of [\d,]+ \S/ : /^n of [\d,]+ \S/);
    expect(lines[2], c.id).toBe(want.display === 'percent' ? 'Each bar: its share, then its count' : 'Each bar: its count');
    const total = Number(lines[1].split(' ')[2].replace(/,/g, ''));
    expect(total, `${c.id}: the fixture's total`).toBe(want.Total);
    const [n, N] = (await card(page, c.id).locator('.card-nd').innerText()).split(' / ').map((x) => Number(x.replace(/,/g, '')));
    expect(total, `${c.id}: the header's ${want.display === 'percent' ? 'N' : 'n'}`).toBe(want.display === 'percent' ? N : n);
    await page.mouse.move(0, 0);
    counted[/** @type {'Numerator' | 'Denominator'} */ (want.Source)]++;
  }
  expect([counted.Denominator > 0, counted.Numerator > 0], 'status and reason sections checked').toEqual([true, true]);
});

test('48.05: each status section\'s bars show a percentage and a count, both equal to an independent recount; reason sections show counts only (#48)', async ({ app, page }) => {
  await app.openStudy(study.StudyID);
  let status = 0;
  for (const c of BREAKDOWNS) {
    const want = sectionFor(c);
    const rows = await card(page, c.id).locator('.dist-row').evaluateAll((els) => els.map((r) => [r.querySelector('.lbl')?.textContent?.trim(), r.querySelector('.v')?.textContent?.replace(/\s+/g, ' ').trim()]));
    const shown = want.bars.filter((/** @type {any} */ b) => rows.some(([label]) => label === b.label));
    expect(shown.length, `${c.id}: bars shown`).toBeGreaterThan(0);
    for (const b of shown) {
      const seen = rows.find(([label]) => label === b.label)?.[1];
      expect(seen, `${c.id} ${b.label}`).toBe(want.display === 'percent' ? `${pct(/** @type {number} */ (b.percent))} (${int(b.count)})` : int(b.count));
    }
    if (want.display === 'percent') status++;
  }
  expect(status, 'status sections checked').toBeGreaterThan(0);
});

test('48.06: a card with notes has a "* Notes" marker in its footer, whose hover and keyboard focus show them in full and blur or Escape hide; no note stays in the body, and a card without notes has no marker (#48)', async ({ app, page }) => {
  await app.openStudy(study.StudyID);
  const tip = page.locator('#gsm-tooltip');
  let withNotes = 0;
  for (const c of BREAKDOWNS) {
    const want = sectionFor(c);
    const notes = [
      ...(want.notes.multi ? [`A participant can fall in more than one category, so the counts add up to more than ${int(want.Total)}.`] : []),
      ...(want.notes.notRecorded ? ['Not recorded: the source value was blank.'] : []),
    ];
    const marker = card(page, c.id).locator('.tile-foot .notes');
    expect(await card(page, c.id).locator('.tile-body').innerText(), `${c.id}: the body`).not.toMatch(/participant can fall|source value was blank/);
    if (!notes.length) {
      await expect(marker, `${c.id}: no marker`).toHaveCount(0);
      continue;
    }
    withNotes++;
    await expect(marker, c.id).toHaveText('* Notes');
    await marker.hover();
    expect((await tip.innerText()).split('\n'), `${c.id}: hover`).toEqual(notes);
    await page.mouse.move(0, 0);
    await expect(tip).toBeHidden();
    // Keyboard only: focus the element before the marker, then Tab onto it.
    await marker.evaluate((el) => {
      const focusable = [...document.querySelectorAll('a[href], button:not([disabled]), input, select')].filter((e) => /** @type {HTMLElement} */ (e).offsetParent !== null);
      /** @type {HTMLElement} */ (focusable[focusable.indexOf(el) - 1]).focus();
    });
    await page.keyboard.press('Tab');
    await expect(marker, `${c.id}: focused by Tab`).toBeFocused();
    await expect(tip, `${c.id}: focus`).toBeVisible();
    expect((await tip.innerText()).split('\n'), `${c.id}: focus`).toEqual(notes);
    await page.keyboard.press('Escape');
    await expect(tip, `${c.id}: Escape`).toBeHidden();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(tip, `${c.id}: focused again`).toBeVisible();
    await marker.evaluate((el) => /** @type {HTMLElement} */ (el).blur());
    await expect(tip, `${c.id}: blur`).toBeHidden();
  }
  expect(withNotes, 'cards with notes checked').toBeGreaterThan(0);
});

test('48.07: each row holds the smaller of the Admin panel\'s maximum and the 320px cards that fit on a page at most 1,720px wide, every card the same size (#48)', async ({ app, page }) => {
  for (const [width, perrow, columns] of /** @type {Array<[number, string | null, number]>} */ ([[1440, null, 4], [1440, '3', 3], [1440, '5', 4], [1920, '5', 5], [1920, null, 4], [1280, null, 3], [1000, null, 2]])) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('about:blank');
    await app.openStudy(study.StudyID, undefined, perrow ? `#perrow=${perrow}` : '');
    const seen = await page.locator('.tiles.cards').evaluate((grid) => {
      const cards = [...grid.querySelectorAll(':scope > .card')];
      const boxes = cards.map((c) => c.getBoundingClientRect());
      return {
        columns: new Set(boxes.map((b) => Math.round(b.left))).size,
        sizes: new Set(boxes.map((b) => `${b.width.toFixed(1)}×${b.height.toFixed(1)}`)).size,
        width: Math.min(...boxes.map((b) => b.width)),
        page: /** @type {Element} */ (document.querySelector('.wrap')).getBoundingClientRect().width,
      };
    });
    const where = `${width}px, maximum ${perrow ?? 'default'}`;
    expect(seen.columns, where).toBe(columns);
    expect(seen.sizes, `${where}: one card size`).toBe(1);
    expect(seen.width, `${where}: at least 320px`).toBeGreaterThanOrEqual(320);
    expect(seen.page, `${where}: a page at most 1,720px wide`).toBeLessThanOrEqual(Math.min(width, 1720));
  }
});

test('48.08: the study page\'s header, card grid and card headers, for visual comparison with this issue\'s Scope and the review\'s header mockup (#48)', async ({ app, page, evidence }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await app.openStudy(study.StudyID);
  await evidence.shot(page, 'the study page at 1440px');
  await card(page, BREAKDOWNS[0].id).locator('.tile-head .card-value').hover();
  await evidence.shot(page, 'a value hover');
  await page.mouse.move(0, 0);
  await card(page, 'ie-criteria').locator('.tile-foot .notes').hover();
  await evidence.shot(page, 'a card\'s notes');
});

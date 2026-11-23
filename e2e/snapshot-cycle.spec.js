// @ts-check
// #14: the portfolio shows one snapshot cycle. Studies off it are left out and named; listed studies with no data are
// named as missing; a summary holding a study its cycle doesn't list is refused.
import { readFileSync } from 'node:fs';
import { expect, readData, test } from './fixtures/app.js';
import { capturePortfolio } from './fixtures/baseline.js';
import { visibleLines } from './fixtures/visible.js';
import { latestSnapshot, pooled, pooledTrend, shownMetrics } from '../test/qual/pooling.js';
import { chooseView, control } from './fixtures/controls.js';
/** @typedef {import('@playwright/test').Page} Page */
/** @typedef {import('../test/qual/pooling.js').MetricMeta} MetricMeta */

const portfolio = readData('portfolio.json');
/** @type {import('../test/qual/pooling.js').StudyEntry[]} */
const studies = portfolio.studies;
/** @type {{ SnapshotDate: string, studies: string[] }} */
const cycle = readData('summary.json').cycle;
const off = studies[2];
const offLatest = [...off.snapshots].sort().at(-2);
const heading = `Studies left out of the ${cycle.SnapshotDate} snapshot cycle`;

/** Drops the study's latest snapshot from the document and the summary, so its latest is a cycle behind. */
const offCycle = {
  /** @param {any} manifest */
  portfolio: (manifest) => {
    const study = manifest.studies.find((/** @type {any} */ s) => s.StudyID === off.StudyID);
    study.snapshots = study.snapshots.filter((/** @type {string} */ d) => d !== cycle.SnapshotDate);
  },
  /** @param {any} summary */
  summary: (summary) => {
    const study = summary.studies.find((/** @type {any} */ s) => s.StudyID === off.StudyID);
    study.snapshots = study.snapshots.filter((/** @type {string} */ d) => d !== cycle.SnapshotDate);
    summary.counts = summary.counts.filter((/** @type {any} */ r) => !(r.StudyID === off.StudyID && r.SnapshotDate === cycle.SnapshotDate));
  },
};

/**
 * A sparkline's y coordinates, scaled so its lowest point is 0 and its highest 1.
 * @param {string} d The line's path.
 */
function shape(d) {
  const ys = [...d.matchAll(/[ML][\d.]+,([\d.]+)/g)].map((m) => Number(m[1]));
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return ys.map((y) => (bottom === top ? 0.5 : (bottom - y) / (bottom - top)));
}

/** @param {number[]} values */
function scaled(values) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return values.map((v) => (hi === lo ? 0.5 : (v - lo) / (hi - lo)));
}

/**
 * The 11.03 record of a portfolio state, which 14.03 requires an in-cycle portfolio to match.
 * @param {string} name
 */
const recorded = (name) => readFileSync(new URL(`./__snapshots__/portfolio-baseline.spec.js/${name}.txt`, import.meta.url), 'utf8');

test.describe('the snapshot cycle', () => {
  test.beforeAll(() => {
    expect(studies.every((s) => latestSnapshot(s) === cycle.SnapshotDate), 'every example study reports the cycle').toBe(true);
    expect(cycle.studies).toEqual(studies.map((s) => s.StudyID));
    expect(offLatest).toBeDefined();
  });

  test('14.01: a study off cycle is left out of the table and the study filter, and named with its latest snapshot (#14)', async ({ app, page }) => {
    await app.open('', offCycle);
    const notice = page.locator('.cycle-notice');
    await expect(notice).toBeVisible();
    expect(await visibleLines(notice)).toEqual([heading, `${off.StudyID}: off cycle, latest snapshot ${offLatest}`]);
    await expect(page.locator('tbody tr[data-hl]')).toHaveCount(studies.length - 1);
    await expect(page.locator(`tbody tr[data-hl="${off.StudyID}"]`)).toHaveCount(0);
    await expect(control(page, 'input[data-filter="study"]').locator).toHaveCount(studies.length - 1);
    await expect(control(page, `input[data-filter="study"][data-value="${off.StudyID}"]`).locator).toHaveCount(0);
  });

  test('14.03: with every study in cycle, the portfolio renders as its recorded baseline in Compact, Detailed and grouped (#14)', async ({ app, page }) => {
    await app.open();
    const expectAsRecorded = async (/** @type {string} */ name) => expect.soft((await capturePortfolio(page, name)).text, name).toBe(recorded(name));
    await expectAsRecorded('table-compact');
    await chooseView(page, 'detailed');
    await expectAsRecorded('table-detailed');
    await app.open();
    await control(page, 'select[data-groupby]').selectOption('phase');
    await expectAsRecorded('rows-grouped');
  });

  test('14.03: with every study in cycle, no study is left out and no notice shows (#14)', async ({ app, page }) => {
    await app.open();
    await expect(page.locator('tbody tr[data-hl]')).toHaveCount(studies.length);
    await expect(control(page, 'input[data-filter="study"]').locator).toHaveCount(studies.length);
    await expect(page.locator('.cycle-notice')).toHaveCount(0);
  });

  test('14.02: with a study off cycle, each Portfolio total trend keeps that study\'s history before the cycle date and ends on the in-cycle total (#14)', async ({ app, page }) => {
    await app.open('', offCycle);
    await chooseView(page, 'custom');
    await control(page, 'button[data-show="trend"]').click();
    const history = studies.map((s) => (s === off ? { ...s, snapshots: s.snapshots.filter((d) => d !== cycle.SnapshotDate) } : s));
    const inCycle = studies.filter((s) => s !== off);
    let distinct = 0;
    for (const m of /** @type {MetricMeta[]} */ (shownMetrics(portfolio.metrics))) {
      const rates = [
        ...pooledTrend(readData, history, m.MetricID).filter((p) => p.date < cycle.SnapshotDate).map((p) => p.rate),
        pooled(readData, inCycle, m.MetricID).rate,
      ].filter((r) => r != null);
      const svg = page.locator(`tr.total svg[aria-label^="Portfolio total · ${m.Abbreviation} trend:"]`);
      await expect(svg, m.Abbreviation).toHaveAttribute(
        'aria-label',
        `Portfolio total · ${m.Abbreviation} trend: ${rates.length} snapshots, latest ${(/** @type {number} */ (rates.at(-1)) * 100).toFixed(1)}%`,
      );
      const drawn = shape(/** @type {string} */ (await svg.locator('.spark-line').getAttribute('d')));
      const want = scaled(/** @type {number[]} */ (rates));
      expect(drawn, `${m.Abbreviation} points drawn`).toHaveLength(want.length);
      drawn.forEach((y, i) => expect(Math.abs(y - want[i]), `${m.Abbreviation} point ${i + 1}`).toBeLessThan(0.02));
      const without = scaled(/** @type {number[]} */ (pooledTrend(readData, inCycle, m.MetricID).map((p) => p.rate).filter((r) => r != null)));
      if (without.some((y, i) => Math.abs(y - want[i]) > 0.05)) distinct++;
    }
    expect(distinct, 'dropping the off-cycle study\'s history would change some trend').toBeGreaterThan(0);
  });

  test('14.04: a study the cycle lists with no data is named as missing, and every other study still shows (#14)', async ({ app, page }) => {
    await app.open('', { summary: (/** @type {any} */ summary) => summary.cycle.studies.push('STUDY099') });
    const notice = page.locator('.cycle-notice');
    await expect(notice).toBeVisible();
    expect(await visibleLines(notice)).toEqual([heading, 'STUDY099: missing, no data']);
    await expect(page.locator('tbody tr[data-hl]')).toHaveCount(studies.length);
  });

  test('14.05: a summary holding a study its cycle does not list is refused, naming the study (#14)', async ({ app, page }) => {
    const unlisted = studies[4].StudyID;
    await app.openReport('portfolio', {
      document: (/** @type {any} */ doc) => {
        doc.summary.cycle.studies = doc.summary.cycle.studies.filter((/** @type {string} */ id) => id !== unlisted);
      },
    });
    const error = page.locator('.report-error');
    await expect(error).toBeVisible();
    await expect(error).toContainText(`the portfolio summary has ${unlisted}, which its ${cycle.SnapshotDate} cycle does not list`);
    await expect(page.locator('tbody tr[data-hl]')).toHaveCount(0);
  });
});

// @ts-check
/** @typedef {import('@playwright/test').Locator} Locator */
/** @typedef {import('@playwright/test').Page} Page */
import { DISTRIBUTION_CONFIG } from '../src/config/distributions.js';
import { expectedView } from '../test/qual/distributions.js';
import { expect, readData, test } from './fixtures/app.js';

/**
 * @typedef {object} Metric
 * @property {string} MetricID
 * @property {string} ID
 * @property {string} Metric
 */
/**
 * @typedef {object} Row
 * @property {string} GroupID
 * @property {string} GroupLevel
 * @property {string} MetricID
 * @property {string} Source
 * @property {string} Variable
 * @property {string | null} Category
 * @property {number} Count
 * @property {number} Participants
 * @property {number} Total
 * @property {number} Numerator
 * @property {number} Denominator
 */
/**
 * @typedef {object} Bar
 * @property {string} label
 * @property {string} kind
 * @property {number} count
 * @property {number | null} population
 * @property {number | null} enrolled
 */
/**
 * @typedef {object} Section
 * @property {string} Source
 * @property {string} Variable
 * @property {string} title
 * @property {number} Total
 * @property {boolean} twoPercentages
 * @property {Bar[]} bars
 * @property {{ multi: boolean, notRecorded: boolean }} notes
 */

const portfolio = readData('portfolio.json');
const study = portfolio.studies[0];
const snapshot = readData(study.files[study.snapshots.at(-1)]);
const CONFIG = /** @type {Record<string, { enrolledPercent?: boolean; statusVariables?: string[]; sections: Record<string, { title?: string; topN?: number }> }>} */ (DISTRIBUTION_CONFIG);
/** @type {Metric[]} */
const configured = portfolio.metrics.filter((m) => CONFIG[m.ID]);
const route = `#/study/${encodeURIComponent(study.StudyID)}`;

/**
 * @param {number | null} x
 */
const pct = (x) => (x == null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(1)}%`);
/**
 * @param {number} x
 */
const int = (x) => x.toLocaleString('en-US');
/** @param {string} id */
const metricById = (id) => /** @type {Metric} */ (configured.find((m) => m.ID === id));
/**
 * @param {Page} page
 * @param {Metric} m
 * @returns {Locator}
 */
const body = (page, m) => page.locator(`.tile[data-metric-id="${m.MetricID}"] .tile-body`);

/**
 * The fixture's totals for one metric: site Numerators and Denominators summed.
 * @param {Metric} m
 */
function totalsFor(m) {
  /** @type {Row[]} */
  const sites = snapshot.results.filter((r) => r.GroupLevel === 'Site' && r.MetricID === m.MetricID);
  return { Numerator: sites.reduce((a, r) => a + r.Numerator, 0), Denominator: sites.reduce((a, r) => a + r.Denominator, 0) };
}

/**
 * What a user should see for one metric, built from the fixture and configuration only (test/qual/distributions.js).
 * @param {Metric} m
 */
function expectedFor(m) {
  const totals = totalsFor(m);
  /** @type {Row[]} */
  const rows = snapshot.distributions.filter((d) => d.MetricID === m.MetricID);
  const sections = /** @type {Section[]} */ (expectedView(rows, CONFIG[m.ID], totals));
  return {
    header: { pct: pct(totals.Numerator / totals.Denominator), nd: `${int(totals.Numerator)} / ${int(totals.Denominator)}` },
    sections: sections.map((s) => ({
      title: s.title,
      rows: s.bars.map((b) => ({ label: b.label, count: int(b.count), population: pct(b.population), enrolled: s.twoPercentages ? pct(b.enrolled) : null })),
      notes: [
        ...(s.notes.multi ? [`A participant can fall in more than one category, so the counts add up to more than ${int(s.Total)}.`] : []),
        ...(s.notes.notRecorded ? ['Not recorded: the source value was blank.'] : []),
],
    })),
  };
}

/**
 * What a user sees in one tile: visible text only, in page order. Every element read must be visible (not
 * display:none, visibility:hidden or fully transparent); anything hidden is reported so the test fails.
 * @param {Page} page
 * @param {Metric} m
 */
async function renderedFor(page, m) {
  return body(page, m).evaluate((el) => {
    /**
     * @param {Element | null} e
     */
    const shown = (e) => Boolean(e?.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
    /**
     * @param {Element | null} e
     */
    const text = (e) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
    /** @type {string[]} */
    const hidden = [];
    /**
     * @param {Element | null} e
     * @param {string} what
     */
    const visible = (e, what) => {
      if (!shown(e)) hidden.push(what);
      return text(e);
    };
    const sections = [...el.querySelectorAll('.dist-sec')].map((s, i) => ({
      title: visible(s.querySelector('.sub-h'), `section ${i} title`),
      rows: [...s.querySelectorAll('.dist-row')].map((r, j) => {
        visible(r.querySelector('.btrack'), `section ${i} row ${j} bar`);
        const enrolled = r.querySelector('[data-pct="enrolled"]');
        return {
          label: visible(r.querySelector('.lbl'), `section ${i} row ${j} label`),
          count: visible(r.querySelector('.v'), `section ${i} row ${j} count`),
          population: visible(r.querySelector('[data-pct="population"]'), `section ${i} row ${j} percentage`),
          enrolled: enrolled ? visible(enrolled, `section ${i} row ${j} second percentage`) : null,
        };
      }),
      notes: [...s.querySelectorAll('.dist-note')].map((n, j) => visible(n, `section ${i} footnote ${j}`)),
    }));
    return {
      header: { pct: visible(el.querySelector('.dist-pct'), 'header percentage'), nd: visible(el.querySelector('.dist-nd'), 'header counts') },
      sections,
      hidden,
    };
  });
}

/**
 * @param {{ open(route?: string): Promise<void> }} app
 * @param {Page} page
 */
async function openStudy(app, page) {
  await app.open(route);
  await expect(body(page, configured[0]).locator('.dist')).toBeVisible();
}

test.describe('Layout A distribution widget', () => {
  test('10.01: every configured metric shows its expected breakdown sections, visibly (#10)', async ({ app, page }) => {
    await openStudy(app, page);
    expect(configured.length).toBeGreaterThan(5);
    for (const m of configured) {
      await expect(body(page, m), m.ID).toHaveAttribute('data-state', 'ok');
      const seen = await renderedFor(page, m);
      expect(seen.hidden, m.ID).toEqual([]);
      expect(seen.sections.map((s) => s.title), m.ID).toEqual(expectedFor(m).sections.map((s) => s.title));
      for (const s of seen.sections) expect(s.rows.length, `${m.ID} ${s.title}`).toBeGreaterThan(0);
    }
  });

  test('10.02: every displayed label, count and percentage, collapsed bars and header included, equals the independent expectation (#10)', async ({ app, page }) => {
    await openStudy(app, page);
    for (const m of configured) {
      const seen = await renderedFor(page, m);
      const want = expectedFor(m);
      expect(seen.hidden, m.ID).toEqual([]);
      expect(seen.header, m.ID).toEqual(want.header);
      expect(seen.sections.map(({ title, rows }) => ({ title, rows })), m.ID).toEqual(want.sections.map(({ title, rows }) => ({ title, rows })));
    }
    expect(configured.some((m) => expectedFor(m).sections.some((s) => s.rows.some((r) => r.label.startsWith('+ ')))), 'the fixture exercises a collapsed bar').toBe(true);
    expect(configured.some((m) => expectedFor(m).sections.some((s) => s.rows.some((r) => r.enrolled !== null))), 'the fixture exercises the second percentage').toBe(true);
  });

  test('10.04: no user-facing text says Numerator or Denominator (#10)', async ({ app, page }) => {
    await openStudy(app, page);
    for (const m of configured) {
      const text = await body(page, m).evaluate((el) => {
        const attrs = [...el.querySelectorAll('*')].flatMap((e) => [e.getAttribute('title'), e.getAttribute('aria-label')]);
        return [/** @type {HTMLElement} */ (el).innerText, el.getAttribute('aria-label'), ...attrs].filter(Boolean).join('\n');
      });
      expect(text, m.ID).not.toMatch(/numerator|denominator/i);
    }
  });

  test('10.05: each section shows exactly the expected rows, so no total row repeats the header (#10)', async ({ app, page }) => {
    await openStudy(app, page);
    for (const m of configured) {
      const seen = await renderedFor(page, m);
      const want = expectedFor(m);
      expect(seen.sections.map((s) => s.rows.map((r) => r.label)), m.ID).toEqual(want.sections.map((s) => s.rows.map((r) => r.label)));
      await expect(body(page, m).locator('.dist-nd'), m.ID).toHaveCount(1);
      await expect(body(page, m).locator('.dist-nd'), m.ID).toHaveText(want.header.nd);
    }
  });

  test('10.06: with no colour map configured, every status bar renders neutral and reason bars stay uncoloured (#10)', async ({ app, page }) => {
    await openStudy(app, page);
    const neutral = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.background = 'var(--na)';
      document.body.append(probe);
      const colour = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return colour;
    });
    const accent = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.background = 'var(--accent)';
      document.body.append(probe);
      const colour = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return colour;
    });
    let statusBars = 0;
    let reasonBars = 0;
    for (const m of configured) {
      /** @type {string[]} */
      const statusVariables = (CONFIG[m.ID]).statusVariables ?? [];
      for (const section of await body(page, m).locator('.dist-sec').all()) {
        const isStatus = statusVariables.includes((await section.getAttribute('data-variable')) ?? '');
        for (const bar of await section.locator('.dist-row[data-kind="category"] .b').all()) {
          await expect(bar, m.ID).toHaveCSS('background-color', isStatus ? neutral : accent);
          if (isStatus) statusBars++;
          else reasonBars++;
        }
      }
    }
    expect(statusBars).toBeGreaterThan(10);
    expect(reasonBars).toBeGreaterThan(10);
  });

  test('10.06: configured status colours render, unmapped statuses fall back to neutral, reasons stay uncoloured (#10)', async ({ app, page }) => {
    const m = metricById('kri0006');
    await app.open(route, {
      portfolio: (p) => {
        const meta = p.metrics.find((x) => x.ID === 'kri0006');
        meta.WidgetConfigs = { ...meta.WidgetConfigs, 'distribution-bar': { colours: { 'Study Completion': 'rgb(21, 101, 192)', Ongoing: 'rgb(46, 125, 50)' } } };
      },
    });
    const status = body(page, m).locator('.dist-sec[data-variable="disposition"]');
    await expect(status.locator('.dist-row[data-category="Study Completion"] .b')).toHaveCSS('background-color', 'rgb(21, 101, 192)');
    await expect(status.locator('.dist-row[data-category="Ongoing"] .b')).toHaveCSS('background-color', 'rgb(46, 125, 50)');
    const neutral = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.background = 'var(--na)';
      document.body.append(probe);
      const colour = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return colour;
    });
    await expect(status.locator('.dist-row[data-category="Death"] .b')).toHaveCSS('background-color', neutral);
    const reasons = body(page, m).locator('.dist-sec[data-variable="compreas"] .dist-row[data-kind="category"] .b');
    expect(await reasons.count()).toBeGreaterThan(0);
    for (const bar of await reasons.all()) expect(await bar.getAttribute('style')).not.toMatch(/background/);
  });

  test('10.07: for every configured metric, bars sort and collapse as expected, Not recorded comes last, and the footnotes show (#10)', async ({ app, page }) => {
    await openStudy(app, page);
    for (const m of configured) {
      const seen = await renderedFor(page, m);
      const want = expectedFor(m);
      expect(seen.hidden, m.ID).toEqual([]);
      expect(seen.sections.map((s) => s.rows.map((r) => r.label)), `${m.ID} order`).toEqual(want.sections.map((s) => s.rows.map((r) => r.label)));
      expect(seen.sections.map((s) => s.notes), `${m.ID} footnotes`).toEqual(want.sections.map((s) => s.notes));
    }
    const all = configured.flatMap((m) => expectedFor(m).sections);
    expect(all.some((s) => s.notes.length === 2), 'the fixture exercises both footnotes in one section').toBe(true);
    expect(all.some((s) => s.rows.at(-1)?.label === 'Not recorded'), 'the fixture exercises Not recorded').toBe(true);
  });

  test('10.07: a configured metric with no rows in the snapshot shows the empty state (#10)', async ({ app, page }) => {
    const m = metricById('kri0006');
    await app.open(route, {
      snapshot: (snap) => {
        if (snap.distributions) snap.distributions = snap.distributions.filter((d) => d.MetricID !== m.MetricID);
      },
    });
    await expect(body(page, m)).toHaveAttribute('data-state', 'empty');
    const message = body(page, m).locator('[data-empty="no-rows"]');
    await expect(message).toBeVisible();
    await expect(message).toHaveText('No breakdown rows for this metric in this snapshot.');
  });

  test('10.07: an earlier visit shows that breakdowns are published for the latest snapshot only (#10)', async ({ app, page }) => {
    await openStudy(app, page);
    const m = metricById('kri0006');
    await page.locator('input[data-visit]').evaluate((el) => {
      /** @type {HTMLInputElement} */ (el).value = '0';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(body(page, m)).toHaveAttribute('data-state', 'empty');
    const message = body(page, m).locator('[data-empty="not-published"]');
    await expect(message).toBeVisible();
    await expect(message).toHaveText('Breakdowns are published for the latest snapshot only.');
  });

  test('10.07: a metric without a breakdown configuration shows the missing state (#10)', async ({ app, page }) => {
    await app.open(route, {
      portfolio: (p) => {
        p.metrics.find((x) => x.ID === 'kri0001').Widget = 'distribution-bar';
      },
    });
    const ae = page.locator('.tile[data-metric-id="Analysis_kri0001"] .tile-body');
    await expect(ae).toHaveAttribute('data-state', 'missing');
    const message = ae.getByText('No breakdowns are configured for this metric.');
    await expect(message).toBeVisible();
  });

  test('10.08: the rendered widgets are captured for comparison with the Layout A design (visual comparison) (#10)', async ({ app, page, evidence }) => {
    await openStudy(app, page);
    for (const m of configured) await expect(body(page, m).locator('.dist')).toBeVisible();
    await evidence.shot(page, 'study view with distribution widgets');
  });
});

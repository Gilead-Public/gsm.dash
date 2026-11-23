// @ts-check
/** @typedef {import('@playwright/test').Locator} Locator */
/** @typedef {import('@playwright/test').Page} Page */
import { DISTRIBUTION_CONFIG } from '../src/config/distributions.js';
import { countBy, expectedView } from '../test/qual/distributions.js';
import { generatePortfolio } from '../scripts/generate-example-data.mjs';
import { expect, readData, test } from './fixtures/app.js';
import { ROOM_FOR_EVERY_BAR, styleFromStart, TRACKER_CARDS } from './fixtures/tiles.js';

/**
 * @typedef {object} Metric A breakdown card: its metric's fields, the card's id and the one section it shows (#10).
 * @property {string} MetricID
 * @property {string} ID
 * @property {string} Metric
 * @property {string} [Population]
 * @property {string} [Display]
 * @property {string} card
 * @property {string} section
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
 * @property {number | null} percent
 * @property {{ count: number, of: number }} hover
 */
/**
 * @typedef {object} Section
 * @property {string} Source
 * @property {string} Variable
 * @property {string} title
 * @property {number} Total
 * @property {'percent' | 'count'} display
 * @property {Bar[]} bars
 * @property {{ multi: boolean, notRecorded: boolean }} notes
 */

const portfolio = readData('portfolio.json');
const study = portfolio.studies[0];
const snapshot = readData(study.files[study.snapshots.at(-1)]);
const CONFIG = /** @type {Record<string, { statusVariables?: string[]; sections: Record<string, { title?: string; topN?: number; of?: string }> }>} */ (DISTRIBUTION_CONFIG);
/** @type {Metric[]} */
const configured = TRACKER_CARDS.filter((c) => c.kind === 'bars').map((c) => ({ ...portfolio.metrics.find((/** @type {any} */ m) => m.ID === c.metric), card: c.id, section: c.section }));

/**
 * @param {number | null} x
 */
const pct = (x) => (x == null || !Number.isFinite(x) ? '—' : `${(x * 100).toFixed(1)}%`);
/**
 * @param {number} x
 */
const int = (x) => x.toLocaleString('en-US');
/** @param {string} id */
const cardById = (id) => /** @type {Metric} */ (configured.find((m) => m.card === id));
/**
 * @param {Page} page
 * @param {Metric} m
 * @returns {Locator}
 */
const body = (page, m) => page.locator(`.card[data-card="${m.card}"] .tile-body`);

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
  const config = CONFIG[m.ID];
  /** @type {Row[]} */
  const rows = snapshot.distributions.filter((d) => d.MetricID === m.MetricID && `${d.Source}:${d.Variable}` === m.section);
  const sections = /** @type {Section[]} */ (expectedView(rows, config));
  // Per 28 days (the PD cards' metrics), the rate is n ÷ exposure days × 28 and N is exposure days ÷ 28 (#32).
  const per28 = m.Display === 'per_28d';
  return {
    header: per28
      ? { pct: ((totals.Numerator / totals.Denominator) * 28).toFixed(2), nd: `${int(totals.Numerator)} / ${(totals.Denominator / 28).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` }
      : { pct: pct(totals.Numerator / totals.Denominator), nd: `${int(totals.Numerator)} / ${int(totals.Denominator)}` },
    sections: sections.map((s) => {
      // The one heading names what the values are out of, with the section's total (#48): a status section's population
      // from the fixture's metric, a reason section's from configuration.
      const heading = s.display === 'percent'
        ? `% of ${int(s.Total)} ${String(m.Population).toLowerCase()}`
        : `n of ${int(s.Total)} ${config.sections?.[`${s.Source}:${s.Variable}`]?.of ?? ''}`.trim();
      return {
        title: s.title,
        variable: s.Variable,
        source: s.Source,
        display: s.display,
        isStatus: (config.statusVariables ?? []).includes(s.Variable),
        headings: [heading],
        rows: s.bars.map((bar) => ({
          label: bar.label,
          kind: bar.kind,
          values: { [heading]: s.display === 'percent' ? `${pct(bar.percent)} (${int(bar.count)})` : int(bar.count) },
          hover: `${bar.label}: ${int(bar.hover.count)} of ${int(bar.hover.of)}`,
        })),
        notes: [
          ...(s.notes.multi ? [`A participant can fall in more than one category, so the counts add up to more than ${int(s.Total)}.`] : []),
          ...(s.notes.notRecorded ? ['Not recorded: the source value was blank.'] : []),
        ],
      };
    }),
  };
}

/**
 * What a user sees in one tile, read the way a user reads it:
 * - every value is paired with the column heading positioned above it, not with its data attributes;
 * - every element read must be visible (anything hidden is reported);
 * - every visible piece of text must belong to the header, a section title, the column headings, a row or a
 *   footnote. Anything else, such as a stray total line, is reported as unexpected.
 * @param {Page} page
 * @param {Metric} m
 */
async function renderedFor(page, m) {
  return body(page, m).evaluate((el) => {
    /** @param {Element | null} e */
    const shown = (e) => Boolean(e?.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
    /** @param {Element | null} e */
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
    const sections = [...el.querySelectorAll('.dist-sec')].map((s, i) => {
      const headings = [...s.querySelectorAll('.dist-cols')].filter((h) => text(h)).map((h, k) => {
        const box = h.getBoundingClientRect();
        return { text: visible(h, `section ${i} heading ${k}`), left: box.left, right: box.right };
      });
      const rows = [...s.querySelectorAll('.dist-row')].map((r, j) => {
        visible(r.querySelector('.btrack'), `section ${i} row ${j} bar`);
        /** @type {Record<string, string | null>} */
        const values = {};
        for (const cell of r.querySelectorAll('.v, .p')) {
          const box = cell.getBoundingClientRect();
          const middle = (box.left + box.right) / 2;
          const heading = headings.find((h) => middle >= h.left - 0.5 && middle <= h.right + 0.5);
          values[heading ? String(heading.text) : `no heading at x=${Math.round(middle)}`] = visible(cell, `section ${i} row ${j} value`);
        }
        return { label: visible(r.querySelector('.lbl'), `section ${i} row ${j} label`), values, hover: r.getAttribute('title'), text: /** @type {HTMLElement} */ (r).innerText.replace(/\s+/g, ' ').trim() };
      });
      return {
        title: visible(s.querySelector('.sub-h'), `section ${i} title`),
        headings: headings.map((h) => h.text),
        rows,
      };
    });
    // The notes sit behind the card footer's marker (#48), one per line of its hover.
    const marker = el.closest('.card')?.querySelector('.tile-foot .notes') ?? null;
    const notes = marker ? (marker.getAttribute('data-tip') ?? '').split('<br>') : [];
    if (marker) visible(marker, 'the notes marker');
    /** @type {string[]} */
    const unexpected = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const content = node.textContent?.trim();
      const parent = node.parentElement;
      if (!content || !parent || !shown(parent)) continue;
      if (!parent.closest('.sub-h, .dist-cols, .dist-row')) unexpected.push(content);
    }
    const head = el.closest('.card')?.querySelector('.card-value') ?? null;
    return {
      header: { pct: visible(head?.querySelector('.big') ?? null, 'header value'), nd: visible(head?.querySelector('.card-nd') ?? null, 'header counts') },
      sections,
      notes,
      hidden,
      unexpected,
    };
  });
}

/** @param {string} value */
const exactly = (value) => new RegExp(`^\\s*${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);

/**
 * Opens the study with cards tall enough for every breakdown's configured top-N, so the values below are compared in
 * full; how a breakdown fits a card of the shipped size is 32.08's (e2e/cards.spec.js).
 * @param {{ openStudy(studyId: string): Promise<void> }} app
 * @param {Page} page
 */
async function openStudy(app, page) {
  await styleFromStart(page, ROOM_FOR_EVERY_BAR);
  await app.openStudy(study.StudyID);
  await expect(body(page, configured[0]).locator('.dist')).toBeVisible();
}

test.describe('Layout A distribution widget', () => {
  test('10.01: every breakdown card shows its one expected section, visibly (#10)', async ({ app, page }) => {
    await openStudy(app, page);
    expect(configured.length).toBeGreaterThan(5);
    for (const m of configured) {
      await expect(body(page, m), m.card).toHaveAttribute('data-state', 'ok');
      const seen = await renderedFor(page, m);
      expect(seen.hidden, m.card).toEqual([]);
      expect(seen.sections.map((s) => s.title), m.card).toEqual(expectedFor(m).sections.map((s) => s.title));
      for (const s of seen.sections) expect(s.rows.length, `${m.card} ${s.title}`).toBeGreaterThan(0);
    }
  });

  test('10.02: every displayed label, percentage, count and hover value, collapsed bars and header included, equals the independent expectation (#10)', async ({ app, page }) => {
    await openStudy(app, page);
    for (const m of configured) {
      const seen = await renderedFor(page, m);
      const want = expectedFor(m);
      expect(seen.hidden, m.card).toEqual([]);
      expect(seen.header, m.card).toEqual(want.header);
      expect(
        seen.sections.map(({ title, headings, rows }) => ({ title, headings, rows: rows.map(({ label, values, hover }) => ({ label, values, hover })) })),
        m.card,
      ).toEqual(want.sections.map(({ title, headings, rows }) => ({ title, headings, rows: rows.map(({ label, values, hover }) => ({ label, values, hover })) })));
    }
    expect(configured.some((m) => expectedFor(m).sections.some((s) => s.rows.some((r) => r.label.startsWith('+ ')))), 'the fixture exercises a collapsed bar').toBe(true);
    for (const display of ['percent', 'count']) {
      expect(configured.some((m) => expectedFor(m).sections.some((s) => s.display === display)), `the fixture exercises ${display} sections`).toBe(true);
    }
  });

  test('10.09: reason sections\' bars show a count, never a percentage, and each section names its population and total (#10)', async ({ app, page }) => {
    await openStudy(app, page);
    const checked = { Denominator: 0, Numerator: 0 };
    for (const m of configured) {
      const seen = await renderedFor(page, m);
      const want = expectedFor(m);
      expect(seen.hidden, m.card).toEqual([]);
      expect(seen.sections, m.card).toHaveLength(want.sections.length);
      seen.sections.forEach((s, i) => {
        const { source, title } = want.sections[i];
        const where = `${m.card} ${title}`;
        // A status section's population comes from the fixture's metric, not from the widget configuration; its total
        // from the fixture's rows.
        expect(s.headings, where).toEqual(want.sections[i].headings);
        expect(s.headings[0], where).toMatch(source === 'Denominator' ? new RegExp(`^% of [\\d,]+ ${String(m.Population).toLowerCase()}$`) : /^n of [\d,]+ \S/);
        for (const row of s.rows) {
          const shown = Object.values(row.values);
          expect(shown, `${where} ${row.label}: one value cell`).toHaveLength(1);
          expect(shown[0], `${where} ${row.label}`).toMatch(source === 'Denominator' ? /^(\d+\.\d% \(\d[\d,]*\)|—)$/ : /^\d[\d,]*$/);
          expect(row.text, `${where}: the row shows only its label and its value`).toBe(`${row.label} ${shown[0]}`);
        }
        checked[/** @type {'Denominator' | 'Numerator'} */ (source)] += 1;
      });
    }
    expect(checked.Denominator, 'status sections checked').toBeGreaterThan(0);
    expect(checked.Numerator, 'reason sections checked').toBeGreaterThan(0);
  });

  test('10.04: no user-facing text says Numerator or Denominator (#10)', async ({ app, page }) => {
    await openStudy(app, page);
    for (const m of configured) {
      const text = await body(page, m).evaluate((el) => {
        const attrs = [...el.querySelectorAll('*')].flatMap((e) => [e.getAttribute('title'), e.getAttribute('aria-label')]);
        return [/** @type {HTMLElement} */ (el).innerText, el.getAttribute('aria-label'), ...attrs].filter(Boolean).join('\n');
      });
      expect(text, m.card).not.toMatch(/numerator|denominator/i);
    }
  });

  test('10.05: the widget shows only the expected rows and no other content, so no total repeats the header (#10)', async ({ app, page }) => {
    await openStudy(app, page);
    for (const m of configured) {
      const seen = await renderedFor(page, m);
      const want = expectedFor(m);
      expect(seen.sections.map((s) => s.rows.map((r) => r.label)), m.card).toEqual(want.sections.map((s) => s.rows.map((r) => r.label)));
      expect(seen.unexpected, `${m.card}: visible content outside the titles, headings and rows`).toEqual([]);
      await expect(body(page, m).locator('.dist-total'), m.card).toHaveCount(0);
      await expect(page.locator(`.card[data-card="${m.card}"] .card-nd`), m.card).toHaveText(want.header.nd);
    }
  });

  test('10.06: with no colour map configured, every status bar renders neutral and reason bars stay uncoloured (#10)', async ({ app, page }) => {
    await openStudy(app, page);
    /** @param {string} css */
    const colourOf = (css) => page.evaluate((value) => {
      const probe = document.createElement('div');
      probe.style.background = value;
      document.body.append(probe);
      const colour = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return colour;
    }, css);
    const neutral = await colourOf('var(--na)');
    const accent = await colourOf('var(--accent)');
    expect(neutral).not.toBe(accent);
    const checked = { status: 0, reason: 0 };
    for (const m of configured) {
      // Which sections exist and which are statuses comes from the fixture and configuration, not from the page.
      for (const want of expectedFor(m).sections) {
        const section = body(page, m).locator('.dist-sec').filter({ has: page.locator('.sub-h', { hasText: exactly(want.title) }) });
        await expect(section, `${m.card} ${want.title}`).toHaveCount(1);
        await expect(section, `${m.card} ${want.title}`).toHaveAttribute('data-variable', want.variable);
        for (const row of want.rows.filter((r) => r.kind === 'category')) {
          const bar = section.locator('.dist-row').filter({ has: page.locator('.lbl', { hasText: exactly(row.label) }) }).locator('.b');
          await expect(bar, `${m.card} ${want.title} ${row.label}`).toHaveCSS('background-color', want.isStatus ? neutral : accent);
          checked[want.isStatus ? 'status' : 'reason']++;
        }
      }
    }
    expect(checked.status, 'status bars checked').toBeGreaterThan(10);
    expect(checked.reason, 'reason bars checked').toBeGreaterThan(10);
  });

  test('10.06: configured status colours render, unmapped statuses fall back to neutral, reasons stay uncoloured (#10)', async ({ app, page }) => {
    await app.openStudy(study.StudyID, {
      portfolio: (p) => {
        const meta = p.metrics.find((x) => x.ID === 'kri0014');
        meta.WidgetConfigs = { ...meta.WidgetConfigs, 'distribution-bar': { colours: { Eligible: 'rgb(21, 101, 192)', Ineligible: 'rgb(46, 125, 50)' } } };
      },
    });
    const status = body(page, cardById('eligibility-status')).locator('.dist-sec[data-variable="eligibility_status"]');
    await expect(status.locator('.dist-row[data-category="Eligible"] .b')).toHaveCSS('background-color', 'rgb(21, 101, 192)');
    await expect(status.locator('.dist-row[data-category="Ineligible"] .b')).toHaveCSS('background-color', 'rgb(46, 125, 50)');
    const neutral = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.background = 'var(--na)';
      document.body.append(probe);
      const colour = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return colour;
    });
    await expect(status.locator('.dist-row[data-category="Potentially Ineligible"] .b')).toHaveCSS('background-color', neutral);
    const reasons = body(page, cardById('ie-criteria')).locator('.dist-sec[data-variable="ietestcd_concat"] .dist-row[data-kind="category"] .b');
    expect(await reasons.count()).toBeGreaterThan(0);
    for (const bar of await reasons.all()) expect(await bar.getAttribute('style')).not.toMatch(/background/);
  });

  test('10.07: on every breakdown card, bars sort and collapse as expected, Not recorded comes last, and the footnotes show behind the footer\'s marker (#10)', async ({ app, page }) => {
    await openStudy(app, page);
    for (const m of configured) {
      const seen = await renderedFor(page, m);
      const want = expectedFor(m);
      expect(seen.hidden, m.card).toEqual([]);
      expect(seen.sections.map((s) => s.rows.map((r) => r.label)), `${m.card} order`).toEqual(want.sections.map((s) => s.rows.map((r) => r.label)));
      expect(seen.notes, `${m.card} footnotes`).toEqual(want.sections.flatMap((s) => s.notes));
    }
    const all = configured.flatMap((m) => expectedFor(m).sections);
    expect(all.some((s) => s.notes.length === 2), 'the fixture exercises both footnotes in one section').toBe(true);
    expect(all.some((s) => s.rows.at(-1)?.label === 'Not recorded'), 'the fixture exercises Not recorded').toBe(true);
  });

  test('10.07: a configured metric with no rows in the snapshot shows the empty state (#10)', async ({ app, page }) => {
    const m = cardById('study-disposition');
    await app.openStudy(study.StudyID, {
      snapshot: (snap) => {
        if (snap.distributions) snap.distributions = snap.distributions.filter((d) => d.MetricID !== m.MetricID);
      },
    });
    await expect(body(page, m)).toHaveAttribute('data-state', 'empty');
    const message = body(page, m).locator('[data-empty="no-rows"]');
    await expect(message).toBeVisible();
    await expect(message).toHaveText('No breakdown rows for this metric in this snapshot.');
  });

  test('10.08: the rendered widgets, at the shipped card size, are captured for comparison with the Layout A design (visual comparison) (#10)', async ({ app, page, evidence }) => {
    // Not openStudy: the evidence shows what a user sees, not the room for every bar the value checks need.
    await app.openStudy(study.StudyID);
    for (const m of configured) await expect(body(page, m).locator('.dist')).toBeVisible();
    const cardHeight = await page.locator('.tiles.cards').evaluate((g) => getComputedStyle(g).getPropertyValue('--card-h').trim());
    expect(cardHeight, 'the card height in src/app/app.css').toBe('400px');
    await evidence.shot(page, 'study view with distribution widgets');
  });

  test('10.10: each card in Scope appears once with its specified breakdown; widget 5 gives IP status then treatment disposition; widget 4 gives time window, eligibility then relatedness (#10)', async ({ app, page }) => {
    await openStudy(app, page);
    const order = await page.locator('.card').evaluateAll((els) => els.map((e) => [e.getAttribute('data-card'), e.getAttribute('data-metric-id')]));
    for (const c of TRACKER_CARDS.filter((x) => x.kind !== 'kri')) {
      expect(order.filter(([id]) => id === c.id), c.id).toHaveLength(1);
      const shown = page.locator(`.card[data-card="${c.id}"] .tile-body`);
      expect(await shown.locator('.dist-sec').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-source')}:${e.getAttribute('data-variable')}`)), c.id).toEqual([c.section]);
      await expect(shown.locator('.dist-sec'), c.id).toBeVisible();
      await expect(shown.locator('table.dist-joint'), c.id).toHaveCount(0);
    }
    const at = (/** @type {string} */ id) => order.findIndex(([x]) => x === id);
    expect(at('treatment-disposition'), 'widget 5: IP status, then treatment disposition').toBe(at('ip-status') + 1);
    expect([order[at('ip-status')][1], order[at('treatment-disposition')][1]]).toEqual(['Analysis_kri0019', 'Analysis_kri0007-2']);
    const deaths = ['premature-deaths-window', 'premature-deaths-eligibility', 'premature-deaths-related'];
    expect(deaths.map(at), 'widget 4: time window, eligibility, then relatedness').toEqual([0, 1, 2].map((i) => at(deaths[0]) + i));
    expect(deaths.map((id) => order[at(id)][1])).toEqual(deaths.map(() => 'Analysis_kri0015'));
  });

  test('10.11: the counts on each of widget 4\'s three cards equal an independent recount of the fixture\'s simulated death records (#10)', async ({ app, page }) => {
    await openStudy(app, page);
    const { records } = generatePortfolio();
    const latest = `${study.StudyID}|${study.snapshots.at(-1)}|`;
    const sets = [...records].filter(([k]) => k.startsWith(latest) && k.endsWith('|Analysis_kri0015')).map(([, v]) => v.records);
    expect(sets.length, 'the study has sites with death records').toBeGreaterThan(0);
    let bars = 0;
    for (const [id, variable] of [['premature-deaths-window', 'death_window'], ['premature-deaths-eligibility', 'eligibility_status'], ['premature-deaths-related', 'treatment_related']]) {
      const seen = await renderedFor(page, cardById(id));
      expect(seen.hidden, id).toEqual([]);
      expect(seen.sections, id).toHaveLength(1);
      const shown = seen.sections[0].rows.map((r) => [r.label, Object.values(r.values)[0]]).filter(([, n]) => n !== '0');
      const want = [...countBy(sets, variable)].map(([category, n]) => [category ?? 'Not recorded', int(n)]);
      expect(Object.fromEntries(shown), id).toEqual(Object.fromEntries(want));
      bars += shown.length;
    }
    expect(bars).toBeGreaterThan(5);
  });
});

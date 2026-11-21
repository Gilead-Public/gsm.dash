// @ts-check
// Study-report card helpers shared by the browser tests.
/** @typedef {import('@playwright/test').Page} Page */

/**
 * A card by its id in the card list (src/config/study-cards.js).
 * @param {Page} page
 * @param {string} id
 */
export const card = (page, id) => page.locator(`.card[data-card="${id}"]`);

/**
 * A metric's cards: one for a standard KRI, one per breakdown it shows otherwise.
 * @param {Page} page
 * @param {string} metricId
 */
export const tile = (page, metricId) => page.locator(`.card[data-metric-id="${metricId}"]`);

/**
 * The cards the tracker requests, in its order (gsm.roadmap#617, as #10 and #32 specify them): written out here rather
 * than read from the card list, so a change to the list fails the tests. `kind` is what the card's body shows, and
 * `section` the breakdown it shows ('Source:Variable'; a joint table's column sections, space-separated).
 * @type {Array<{ id: string, title: string, metric: string, kind: 'bars' | 'joint' | 'kri', section: string }>}
 */
export const TRACKER_CARDS = [
  { id: 'eligibility-status', title: 'Eligibility Status', metric: 'kri0014', kind: 'bars', section: 'Denominator:eligibility_status' },
  { id: 'ie-criteria', title: 'Eligibility I/E Criteria', metric: 'kri0014', kind: 'bars', section: 'Numerator:ietestcd_concat' },
  { id: 'premature-deaths', title: 'Premature Death Summary', metric: 'kri0015', kind: 'joint', section: 'Numerator:window_eligibility Numerator:window_treatment_related' },
  { id: 'ip-status', title: 'IP Status', metric: 'kri0019', kind: 'bars', section: 'Denominator:drv_ip_nonstarter_status' },
  { id: 'treatment-disposition', title: 'Treatment Disposition', metric: 'kri0007-2', kind: 'bars', section: 'Denominator:drv_drg_completion' },
  { id: 'treatment-discontinuation-reasons', title: 'Premature Treatment Discontinuation Reasons', metric: 'kri0007-2', kind: 'bars', section: 'Numerator:drv_premature_discontinuation_reason' },
  { id: 'study-disposition', title: 'Study Disposition – Enrolled', metric: 'kri0006', kind: 'bars', section: 'Denominator:drv_study_disposition' },
  { id: 'screening-disposition', title: 'Study Disposition – Screening', metric: 'kri0012', kind: 'bars', section: 'Denominator:drv_study_disposition' },
  { id: 'screen-failure-reasons', title: 'Screen Failure Reasons', metric: 'kri0012', kind: 'bars', section: 'Numerator:sf_reason' },
  ...['kri0004', 'kri0003', 'kri0002', 'kri0001', 'kri0005', 'kri0008', 'kri0009', 'kri0010', 'kri0011'].map((metric) => ({ id: metric, title: '', metric, kind: /** @type {const} */ ('kri'), section: '' })),
];

/**
 * The cards shown, in page order: id, title and metric ID.
 * @param {Page} page
 */
export const shownCards = (page) =>
  page.locator('.card').evaluateAll((els) =>
    els.map((c) => [c.getAttribute('data-card'), (c.querySelector('.tile-head .name')?.textContent ?? '').trim(), c.getAttribute('data-metric-id')]),
  );

/**
 * The metrics the study page's cards show, each once, sorted by MetricID.
 * @param {Page} page
 */
export const cardMetrics = async (page) =>
  [...new Set(await page.locator('#app .card[data-metric-id]').evaluateAll((els) => els.map((t) => t.getAttribute('data-metric-id') ?? '')))].sort();

/**
 * Of the given metrics, those the tracker gives a card: what a study report can show of them (#32).
 * @param {Array<string | null>} metricIds
 * @param {any[]} catalog
 */
export const withCards = (metricIds, catalog) => {
  const carded = new Set(TRACKER_CARDS.map((c) => catalog.find((m) => m.ID === c.metric)?.MetricID));
  return metricIds.filter((id) => carded.has(id));
};

/**
 * Adds CSS to every page the test opens from now on, before the report renders.
 * @param {Page} page
 * @param {string} css
 */
export const styleFromStart = (page, css) =>
  page.addInitScript((text) => {
    const add = () => {
      const style = document.createElement('style');
      style.textContent = text;
      document.documentElement.append(style);
    };
    if (document.documentElement) add();
    else {
      new MutationObserver((_, observer) => {
        if (!document.documentElement) return;
        observer.disconnect();
        add();
      }).observe(document, { childList: true });
    }
  }, css);

/**
 * Cards tall enough for every breakdown's configured top-N. How many bars fit a card of the shipped size depends on the
 * platform's fonts, and is 32.08's to check.
 */
export const ROOM_FOR_EVERY_BAR = '.tiles.cards { --card-h: 1600px; }';

// @ts-check
// The study page's cards (#32), resolved against the catalog: what each card shows, or why it can't (#12).
import { STUDY_CARDS } from '../config/study-cards.js';
import { distributionConfig } from '../config/distributions.js';
import { kriSettings } from './kri-groups.js';
import { resolveView, warnOnce } from './references.js';

/** @typedef {import('../config/study-cards.js').CardSpec} CardSpec */
/** @typedef {import('./references.js').Problem} Problem */
/** @typedef {{ spec: CardSpec, title: string, metric: any, def: any, config: Record<string, unknown> | undefined, problem: Problem | null, kri: boolean, hidden: boolean }} Card */

const byId = (/** @type {any[]} */ list, /** @type {string} */ id) => list.find((m) => m.ID === id || m.MetricID === id);

/**
 * The sections a card names that its metric's breakdown configuration lacks.
 * @param {CardSpec} spec
 * @param {any} metric
 */
function unknownSections(spec, metric) {
  const known = Object.keys(distributionConfig(metric, metric.WidgetConfigs?.[spec.widget] ?? {})?.sections ?? {});
  const named = spec.joint ? [spec.joint.rows, ...spec.joint.columns] : spec.section ? [spec.section] : [];
  return named.filter((key) => !known.includes(key));
}

/**
 * Each card in order, with its metric and either the widget to render or the problem to show in its place. A card
 * whose metric the portfolio hides (#27) is left out; one whose metric is unknown or inactive shows why.
 * @param {{ metrics: any[], inactive: any[], visible: any[], cards?: CardSpec[] }} input
 * @returns {Card[]}
 */
export function studyCards({ metrics, inactive, visible, cards = STUDY_CARDS }) {
  const shown = new Set(visible.map((m) => m.MetricID));
  /** @type {Card[]} */
  const out = [];
  for (const spec of cards) {
    const metric = byId(metrics, spec.metric) ?? null;
    const title = spec.title ?? metric?.Metric ?? spec.metric;
    const kri = spec.widget === 'kri-summary';
    const card = { spec, title, metric, def: null, config: undefined, problem: /** @type {Problem | null} */ (null), kri, hidden: false };
    const reference = `Metric "${spec.metric}" for the card "${title}"`;
    if (!metric) {
      card.problem = { reference, reason: byId(inactive, spec.metric) ? 'it is inactive' : 'it is not in the metric catalog' };
      warnOnce(card.problem);
      out.push(card);
      continue;
    }
    if (metric.GroupLevel !== 'Site') {
      card.problem = { reference, reason: `it is a ${metric.GroupLevel ?? 'non-site'}-level metric, and the study page shows site-level metrics only` };
      warnOnce(card.problem);
      out.push(card);
      continue;
    }
    if (!shown.has(metric.MetricID)) continue;
    const own = metric.WidgetConfigs?.[spec.widget] ?? (spec.widget === metric.Widget ? metric.WidgetConfig : undefined);
    const leadMetric = spec.lead ? byId(metrics, spec.lead.metric) : null;
    // A lead keeps its own metric's settings (colours, titles), chosen as a card's are.
    const leadOwn = leadMetric && (leadMetric.WidgetConfigs?.[spec.widget] ?? (spec.widget === leadMetric.Widget ? leadMetric.WidgetConfig : undefined));
    const lead = spec.lead && leadMetric
      ? { section: spec.lead.section, categories: spec.lead.categories, metricId: leadMetric.MetricID, config: leadOwn ?? {} }
      : null;
    card.config = spec.joint
      ? { ...own, joint: spec.joint }
      : spec.section
        ? { ...own, only: [spec.section], ...(spec.exclude && { exclude: spec.exclude }), ...(lead && { lead }) }
        : own;
    card.hidden = kri && kriSettings(metric).hidden;
    const declared = kri ? kriSettings(metric).group != null : metric.Widget === spec.widget;
    const view = resolveView(spec.widget, metric, card.config);
    const missing = view.def && !kri ? unknownSections(spec, metric) : [];
    if (view.problem) card.problem = view.problem;
    else if (!declared) {
      card.problem = {
        reference: `Widget "${spec.widget}" for the card "${title}"`,
        reason: kri
          ? `${metric.Abbreviation} (${metric.MetricID}) is not a standard KRI`
          : `${metric.Abbreviation} (${metric.MetricID}) declares ${metric.Widget == null ? 'no widget' : `the widget "${metric.Widget}"`}`,
      };
    } else if (missing.length) {
      card.problem = {
        reference: `Breakdown ${missing.map((k) => `"${k}"`).join(', ')} for the card "${title}"`,
        reason: `${metric.Abbreviation} (${metric.MetricID}) has no such breakdown configured`,
      };
    } else card.def = view.def;
    if (card.problem && !view.problem) warnOnce(card.problem);
    out.push(card);
  }
  return out;
}

/**
 * The grid's items when similar cards are combined (an Admin demo setting): a configured pair whose cards both show
 * becomes one item, at the place of whichever comes first, its top card first; every other card stands alone.
 * @template {{ spec: { id: string } }} C
 * @param {C[]} cards
 * @param {string[][]} pairs
 * @returns {C[][]}
 */
export function combineCards(cards, pairs) {
  const byId = new Map(cards.map((c) => [c.spec.id, c]));
  /** @type {Map<string, string[]>} */
  const pairOf = new Map();
  for (const pair of pairs) if (pair.every((id) => byId.has(id))) for (const id of pair) pairOf.set(id, pair);
  const placed = new Set();
  /** @type {C[][]} */
  const items = [];
  for (const card of cards) {
    if (placed.has(card.spec.id)) continue;
    const pair = pairOf.get(card.spec.id);
    if (!pair) {
      items.push([card]);
      continue;
    }
    for (const id of pair) placed.add(id);
    items.push(pair.map((id) => /** @type {C} */ (byId.get(id))));
  }
  return items;
}

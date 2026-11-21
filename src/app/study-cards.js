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
    card.config = spec.joint ? { ...own, joint: spec.joint } : spec.section ? { ...own, only: [spec.section] } : own;
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

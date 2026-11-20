// @ts-check
import { COLUMN_OPTIONS, GROUP_BY_OPTIONS, HEATMAPS, VIEWS, showOptions } from '../app/portfolio-controls.js';
import { orderMetrics } from './normalize.js';

/**
 * The portfolio's configurable defaults (#16). Every key is optional.
 * @typedef {object} PortfolioConfig
 * @property {string} [groupBy]
 * @property {string} [heatmap]
 * @property {string[]} [show]
 * @property {string[]} [metrics] MetricIDs hidden by default.
 * @property {string[]} [columns] The table's optional columns shown by default (#21).
 * @property {string} [view] The table's view, Overview or Details.
 */

/** @type {Required<PortfolioConfig>} */
const BUILT_IN = { groupBy: 'none', heatmap: 'none', show: ['num', 'rate'], metrics: [], columns: ['name'], view: 'overview' };

/**
 * The MetricIDs a portfolio column can show: active, site-level metrics in the catalog.
 * @param {Array<{ MetricID: string, GroupLevel?: string, Active?: boolean }>} catalog
 */
export const portfolioColumnIds = (catalog) =>
  orderMetrics(/** @type {any[]} */ (catalog)).active.filter((m) => m.GroupLevel === 'Site').map((m) => m.MetricID);

/**
 * Why a configuration can't be used: one message per problem, naming the key, the value and the values allowed.
 * @param {unknown} config
 * @param {Array<{ MetricID: string, GroupLevel?: string, Active?: boolean }>} catalog
 * @returns {string[]}
 */
export function configProblems(config, catalog) {
  /** @type {Record<keyof PortfolioConfig, { allowed: string[], what: string }>} */
  const settings = {
    groupBy: { allowed: GROUP_BY_OPTIONS.map(([v]) => v), what: 'a Group rows by choice' },
    heatmap: { allowed: HEATMAPS.map(([v]) => v), what: 'a Heatmap choice' },
    show: { allowed: showOptions(false).map(([v]) => v), what: 'a Show in each cell choice' },
    metrics: { allowed: portfolioColumnIds(catalog), what: 'an active, site-level metric in the catalog' },
    columns: { allowed: COLUMN_OPTIONS.map(([v]) => v), what: 'an optional table column' },
    view: { allowed: VIEWS.map(([v]) => v), what: 'a View choice' },
  };
  const keys = Object.keys(settings).join(', ');
  if (typeof config !== 'object' || config === null || Array.isArray(config)) return [`config: ${JSON.stringify(config)} is not an object; allowed: ${keys}`];
  return Object.entries(config).flatMap(([key, value]) => {
    if (!Object.hasOwn(settings, key)) return [`config.${key}: ${JSON.stringify(value)} is under a key that is not a setting; allowed: ${keys}`];
    const { allowed, what } = settings[/** @type {keyof PortfolioConfig} */ (key)];
    const list = Array.isArray(BUILT_IN[/** @type {keyof PortfolioConfig} */ (key)]);
    if (list && !Array.isArray(value)) return [`config.${key}: ${JSON.stringify(value)} is not a list; allowed: ${allowed.join(', ')}`];
    return (list ? value : [value])
      .filter((/** @type {unknown} */ v) => !allowed.includes(/** @type {string} */ (v)))
      .map((/** @type {unknown} */ v) => `config.${key}: ${JSON.stringify(v)} is not ${what}; allowed: ${allowed.join(', ')}`);
  });
}

/**
 * The portfolio's initial view: each configured default, and the built-in one where the configuration has none.
 * @param {PortfolioConfig} [config]
 * @returns {Required<PortfolioConfig>}
 */
export const portfolioDefaults = (config = {}) => ({ ...BUILT_IN, ...config });

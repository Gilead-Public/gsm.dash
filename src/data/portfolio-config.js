// @ts-check
import { COLUMN_OPTIONS, GROUP_BY_OPTIONS, HEATMAPS, SHOW_OPTIONS, VIEWS } from '../app/portfolio-controls.js';
import { orderMetrics } from './normalize.js';
import { OTHER_CATEGORY } from './catalog.js';

/**
 * The portfolio's configurable defaults (#16). Every key is optional.
 * @typedef {object} PortfolioConfig
 * @property {string} [groupBy]
 * @property {string} [heatmap]
 * @property {string[]} [show]
 * @property {string[]} [metrics] MetricIDs hidden by default.
 * @property {string[]} [columns] The table's optional columns shown by default (#21).
 * @property {string} [view] The table's Cell display: compact, detailed or custom.
 * @property {Array<{ name: string, metrics: string[], hidden?: boolean }> | null} [groups] The metric groups, in order,
 *   each with its MetricIDs and whether it starts hidden; null groups by the catalog's Category.
 */

/** @type {Required<PortfolioConfig>} */
const BUILT_IN = { groupBy: 'none', heatmap: 'none', show: ['num', 'rate'], metrics: [], columns: ['name', 'enroll'], view: 'compact', groups: null };

/**
 * The MetricIDs a portfolio column can show: active, site-level metrics in the catalog.
 * @param {Array<{ MetricID: string, GroupLevel?: string, Active?: boolean }>} catalog
 */
export const portfolioColumnIds = (catalog) =>
  orderMetrics(/** @type {any[]} */ (catalog)).active.filter((m) => m.GroupLevel === 'Site').map((m) => m.MetricID);

/**
 * Why `groups` can't be used: it must be a list of `{ name, metrics, hidden }`, each name given once and not "Other",
 * and each metric an eligible MetricID listed in one group only.
 * @param {unknown} groups
 * @param {string[]} allowed
 * @returns {string[]}
 */
function groupProblems(groups, allowed) {
  const shape = '{ "name", "metrics", "hidden" }';
  if (!Array.isArray(groups)) return [`config.groups: ${JSON.stringify(groups)} is not a list of groups, each ${shape}`];
  /** @type {string[]} */
  const problems = [];
  const names = new Set();
  const placed = new Set();
  groups.forEach((g, i) => {
    const at = `config.groups[${i}]`;
    if (typeof g !== 'object' || g === null || Array.isArray(g)) return void problems.push(`${at}: ${JSON.stringify(g)} is not a group, ${shape}`);
    for (const k of Object.keys(g)) {
      if (!['name', 'metrics', 'hidden'].includes(k)) problems.push(`${at}.${k}: ${JSON.stringify(g[k])} is under a key that is not a group setting; allowed: name, metrics, hidden`);
    }
    if (typeof g.name !== 'string' || !g.name.trim()) problems.push(`${at}.name: ${JSON.stringify(g.name)} is not a group name`);
    else if (g.name === OTHER_CATEGORY) problems.push(`${at}.name: ${JSON.stringify(g.name)} is reserved for the metrics no group lists`);
    else if (names.has(g.name)) problems.push(`${at}.name: ${JSON.stringify(g.name)} repeats another group's name`);
    else names.add(g.name);
    if (!Array.isArray(g.metrics)) problems.push(`${at}.metrics: ${JSON.stringify(g.metrics)} is not a list; allowed: ${allowed.join(', ')}`);
    else {
      for (const id of g.metrics) {
        if (!allowed.includes(id)) problems.push(`${at}.metrics: ${JSON.stringify(id)} is not an active, site-level metric in the catalog; allowed: ${allowed.join(', ')}`);
        else if (placed.has(id)) problems.push(`${at}.metrics: ${JSON.stringify(id)} is listed in more than one group`);
        else placed.add(id);
      }
    }
    if (g.hidden !== undefined && typeof g.hidden !== 'boolean') problems.push(`${at}.hidden: ${JSON.stringify(g.hidden)} is not true or false`);
  });
  return problems;
}

/**
 * Why a configuration can't be used: one message per problem, naming the key, the value and the values allowed.
 * @param {unknown} config
 * @param {Array<{ MetricID: string, GroupLevel?: string, Active?: boolean }>} catalog
 * @returns {string[]}
 */
export function configProblems(config, catalog) {
  /** @type {Record<Exclude<keyof PortfolioConfig, 'groups'>, { allowed: string[], what: string }>} */
  const settings = {
    groupBy: { allowed: GROUP_BY_OPTIONS.map(([v]) => v), what: 'a Group rows by choice' },
    heatmap: { allowed: HEATMAPS.map(([v]) => v), what: 'a Heatmap choice' },
    show: { allowed: SHOW_OPTIONS.map(([v]) => v), what: 'a Show in each cell choice' },
    metrics: { allowed: portfolioColumnIds(catalog), what: 'an active, site-level metric in the catalog' },
    columns: { allowed: COLUMN_OPTIONS.map(([v]) => v), what: 'an optional table column' },
    view: { allowed: VIEWS.map(([v]) => v), what: 'a Cell display choice' },
  };
  const keys = [...Object.keys(settings), 'groups'].join(', ');
  if (typeof config !== 'object' || config === null || Array.isArray(config)) return [`config: ${JSON.stringify(config)} is not an object; allowed: ${keys}`];
  return Object.entries(config).flatMap(([key, value]) => {
    if (key === 'groups') return groupProblems(value, portfolioColumnIds(catalog));
    if (!Object.hasOwn(settings, key)) return [`config.${key}: ${JSON.stringify(value)} is under a key that is not a setting; allowed: ${keys}`];
    const { allowed, what } = settings[/** @type {Exclude<keyof PortfolioConfig, 'groups'>} */ (key)];
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

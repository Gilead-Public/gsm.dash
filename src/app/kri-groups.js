// @ts-check
// Which visible metrics are standard KRIs in a group (#32), in what order, and which of them start hidden.
import { KRI_GROUPS, KRI_HIDDEN_BY_DEFAULT, PER_28D_UNIT } from '../config/kri-groups.js';

/**
 * A metric's grouped-view settings: the defaults, overridden by its catalog `WidgetConfigs['kri-summary']`.
 * @param {any} metric
 * @returns {{ group: string | null, order: number, hidden: boolean, unit: string }}
 */
export function kriSettings(metric) {
  const own = metric?.WidgetConfigs?.['kri-summary'] ?? {};
  const home = KRI_GROUPS.find((g) => g.metrics.includes(metric?.ID));
  const group = own.group !== undefined ? own.group : (home?.id ?? null);
  const order = typeof own.order === 'number' ? own.order : home && home.id === group ? home.metrics.indexOf(metric.ID) : Infinity;
  return { group, order, hidden: own.hidden ?? KRI_HIDDEN_BY_DEFAULT.includes(metric?.ID), unit: own.unit ?? PER_28D_UNIT };
}

/**
 * Splits the visible metrics into the CTQ widgets and the KRI groups. A group keeps its configured order, its
 * members theirs (ties in catalog order), and is left out when none of its members is visible. `members` is the
 * whole group in that order, as an expanded group shows it; `shown` leaves out the KRIs hidden by default.
 * @param {any[]} visible metrics already filtered by the portfolio's hidden metrics and status filters
 * @returns {{ ctq: any[], groups: Array<{ id: string, label: string, members: any[], shown: any[], hidden: any[] }> }}
 */
export function kriLayout(visible) {
  const ids = new Set(KRI_GROUPS.map((g) => g.id));
  const settings = new Map(visible.map((m) => [m, kriSettings(m)]));
  const ctq = visible.filter((m) => !ids.has(/** @type {string} */ (settings.get(m)?.group)));
  const groups = KRI_GROUPS.map((g) => {
    const members = visible
      .map((m, i) => ({ m, i, s: /** @type {ReturnType<typeof kriSettings>} */ (settings.get(m)) }))
      .filter(({ s }) => s.group === g.id)
      .sort((a, b) => a.s.order - b.s.order || a.i - b.i);
    return {
      id: g.id,
      label: g.label,
      members: members.map(({ m }) => m),
      shown: members.filter(({ s }) => !s.hidden).map(({ m }) => m),
      hidden: members.filter(({ s }) => s.hidden).map(({ m }) => m),
    };
  }).filter((g) => g.members.length > 0);
  return { ctq, groups };
}

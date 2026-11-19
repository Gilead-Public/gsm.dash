// @ts-check
// The grouped standard-KRI view (#32): the groups in page order, each with its members in order; the KRIs hidden by
// default (one list for every study); and the unit label for rates per 28 days. Per metric, the catalog's
// `WidgetConfigs['kri-summary']` overrides `group` (a group id, or null for none), `order`, `hidden` and `unit`.

/** @typedef {{ id: string, label: string, metrics: string[] }} KriGroup */

/** @type {KriGroup[]} */
export const KRI_GROUPS = [
  { id: 'safety', label: 'AE, SAE and labs', metrics: ['kri0001', 'kri0002', 'kri0005'] },
  { id: 'deviations', label: 'Protocol deviations', metrics: ['kri0003', 'kri0004'] },
  { id: 'data', label: 'EDC and query rates', metrics: ['kri0008', 'kri0009', 'kri0010', 'kri0011'] },
];

/** @type {string[]} */
export const KRI_HIDDEN_BY_DEFAULT = [];

export const PER_28D_UNIT = 'per 28 days';

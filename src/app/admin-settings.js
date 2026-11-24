// @ts-check
// The Admin panel's settings (#46), a demo tool. They live in the address only, so a reload and the links between
// reports carry them in any browser; removing the panel means removing this module, AdminPanel.jsx and their CSS.

/** @type {Array<[string, string, Array<[string, string]>]>} [param, default, choices] */
export const ADMIN_SETTINGS = [
  ['theme', 'auto', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']]],
  ['perrow', '4', [['3', '3'], ['4', '4'], ['5', '5']]],
  ['cfgpanel', 'popover', [['popover', 'Popover'], ['side', 'Side panel']]],
  ['legend', 'off', [['off', 'Off'], ['on', 'On']]],
  ['combine', 'off', [['off', 'Off'], ['on', 'On']]],
];

/** @type {Record<string, string>} */
export const ADMIN_LABELS = { theme: 'Theme', perrow: 'Study cards per row, at most', cfgpanel: 'Config opens as', legend: 'Heatmap legend', combine: 'Combine similar KRI cards' };

/**
 * The settings an address holds; a missing or unknown value is the setting's default.
 * @param {URLSearchParams} params
 * @returns {Record<string, string>}
 */
export function readAdmin(params) {
  return Object.fromEntries(
    ADMIN_SETTINGS.map(([key, fallback, choices]) => {
      const value = params.get(key) ?? '';
      return [key, choices.some(([choice]) => choice === value) ? value : fallback];
    }),
  );
}

/**
 * Writes each setting that differs from its default into `params`, and removes the others. Every other param is left
 * as it is.
 * @param {URLSearchParams} params
 * @param {Record<string, string>} admin
 */
export function writeAdmin(params, admin) {
  for (const [key, fallback] of ADMIN_SETTINGS) {
    if (admin[key] !== fallback) params.set(key, admin[key]);
    else params.delete(key);
  }
  return params;
}

/**
 * Applies the settings that act on the page as a whole: the theme, and the study grid's cards per row.
 * @param {Record<string, string>} admin
 */
export function applyAdmin(admin) {
  const root = document.documentElement;
  if (admin.theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = admin.theme;
  root.style.setProperty('--per-row', admin.perrow);
}

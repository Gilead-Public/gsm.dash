// @ts-check
// The portfolio's view kept in the browser as a backup of its address: a report opened with no view in its address
// takes the saved one, silently. Views are kept per reports folder, so another portfolio neither sees nor changes them;
// the Admin settings stay in the address only. Every storage call is guarded: a browser that refuses storage leaves
// the reports working from the address alone.
import { ADMIN_SETTINGS } from './admin-settings.js';

const ADMIN_KEYS = new Set(ADMIN_SETTINGS.map(([key]) => key));

/** @param {string} pathname The page's path; its folder names the portfolio. */
export const viewKey = (pathname) => `gsm.dash:view:${pathname.replace(/[^/]*$/, '')}`;

/**
 * A view: the address's params without the Admin settings.
 * @param {URLSearchParams} params
 */
export function viewParams(params) {
  const out = new URLSearchParams();
  for (const [key, value] of params) if (!ADMIN_KEYS.has(key)) out.append(key, value);
  return out;
}

/** @param {URLSearchParams} params */
export const hasView = (params) => [...params.keys()].some((key) => !ADMIN_KEYS.has(key));

/** @returns {Storage | null} */
export function browserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * @param {Storage | null} storage
 * @param {string} key
 * @returns {URLSearchParams | null}
 */
export function readView(storage, key) {
  try {
    const saved = storage?.getItem(key);
    return saved == null ? null : new URLSearchParams(saved);
  } catch {
    return null;
  }
}

/**
 * Saves a view, or forgets it when it is the configured defaults, so a later change to them isn't masked.
 * @param {Storage | null} storage
 * @param {string} key
 * @param {URLSearchParams} view
 * @param {string} defaults The default view's params, as a string.
 */
export function writeView(storage, key, view, defaults) {
  try {
    const value = view.toString();
    if (value === defaults) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    // Storage refused or full: the address still holds the view.
  }
}

/**
 * The params a report opens with: its address's when that carries a view, retired params aside; otherwise the saved
 * view, in its current form, with the address's Admin settings.
 * @param {URLSearchParams} address
 * @param {URLSearchParams | null} saved
 * @param {(params: URLSearchParams) => URLSearchParams} current Rewrites old params in their current form.
 */
export function openingParams(address, saved, current) {
  if (hasView(current(address)) || !saved) return address;
  const out = viewParams(current(saved));
  for (const [key, value] of address) if (ADMIN_KEYS.has(key)) out.append(key, value);
  return out;
}

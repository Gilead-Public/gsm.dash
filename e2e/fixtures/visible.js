// @ts-check
import { expect } from './app.js';

/**
 * That a user can see the element: rendered with a size, and neither it nor an ancestor hidden or fully transparent.
 * Playwright's toBeVisible ignores opacity.
 * @param {import('@playwright/test').Locator} locator
 * @param {string} what
 */
export async function expectSeen(locator, what) {
  const sees = () =>
    locator.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && box.width > 0 && box.height > 0;
    });
  await expect.poll(sees, { message: what }).toBe(true);
}

/**
 * The text a user can see in the element, as trimmed lines: text whose element is hidden, fully transparent (by
 * opacity, ancestors included, or by colour), sized zero or in a zero-size font is left out. `<br>` and block-level
 * elements break lines.
 * @param {import('@playwright/test').Locator} locator
 * @returns {Promise<string[]>}
 */
export function visibleLines(locator) {
  return locator.evaluate((root) => {
    const alpha = (/** @type {string} */ c) => {
      if (c === 'transparent') return 0;
      const slash = /\/\s*([\d.]+)(%?)\s*\)$/.exec(c);
      if (slash) return Number(slash[1]) / (slash[2] ? 100 : 1);
      const rgba = /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/.exec(c);
      return rgba ? Number(rgba[1]) : 1;
    };
    const seen = (/** @type {Element} */ el) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && box.width > 0 && box.height > 0 && alpha(style.color) > 0 && parseFloat(style.fontSize) > 0;
    };
    const BLOCKS = new Set(['block', 'list-item', 'flex', 'grid', 'table', 'table-row', 'table-cell']);
    let out = '';
    const walk = (/** @type {Node} */ node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          if (child.parentElement && seen(child.parentElement)) out += child.textContent;
        } else if (child instanceof Element) {
          if (child.localName === 'br') {
            out += '\n';
            continue;
          }
          const block = BLOCKS.has(getComputedStyle(child).display);
          if (block) out += '\n';
          walk(child);
          if (block) out += '\n';
        }
      }
    };
    walk(root);
    return out.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  });
}

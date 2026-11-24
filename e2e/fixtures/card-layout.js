// @ts-check
// How the study page's cards are laid out, read the way a user sees them (#32, #46). Shares no code with src/.
/** @typedef {import('@playwright/test').Page} Page */

/**
 * Every card's size; its title, value, n / N and body text; each piece of text a user can't see (hidden,
 * transparent or without a box); and each piece that lies outside its card, outside the part of the card it sits in
 * (header, value, body or footer), or outside a box that would clip it. Cards stacked in a pair (#46) are read too, and
 * clipped by their pair; `sizes` is the single cards' sizes, and `pairs` whether each pair is one card wide and two grid
 * rows tall.
 * @param {Page} page
 */
export const layout = (page) =>
  page.locator('.study-page .cards').evaluate((grid) => {
    const cards = [...grid.querySelectorAll(':scope > .card, :scope > .card-pair > .card')];
    const single = [...grid.querySelectorAll(':scope > .card')];
    /**
     * @param {DOMRect} r
     * @param {DOMRect} b
     */
    const inside = (r, b) => r.left >= b.left - 0.5 && r.right <= b.right + 0.5 && r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5;
    /** @param {string} colour */
    const transparent = (colour) => colour === 'transparent' || /,\s*0\)$|\/\s*0\)$/.test(colour);
    /** @param {Element | null | undefined} e */
    const text = (e) => e?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
    /** @type {string[]} */
    const outside = [];
    /** @type {string[]} */
    const unseen = [];
    for (const c of cards) {
      const id = c.getAttribute('data-card');
      const walker = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const content = n.textContent?.trim() ?? '';
        const parent = /** @type {Element} */ (n.parentElement);
        if (!content) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
        if (!parent.checkVisibility({ opacityProperty: true, visibilityProperty: true }) || transparent(getComputedStyle(parent).color) || !rects.length) {
          unseen.push(`${id}: "${content}"`);
          continue;
        }
        const boxes = [c];
        const pair = c.closest('.card-pair');
        if (pair) boxes.push(pair);
        for (let a = /** @type {Element | null} */ (parent); a && a !== c; a = a.parentElement) {
          const st = getComputedStyle(a);
          if (a.parentElement === c || st.overflowX !== 'visible' || st.overflowY !== 'visible') boxes.push(a);
        }
        for (const r of rects) {
          for (const b of boxes) if (!inside(r, b.getBoundingClientRect())) outside.push(`${id}: "${content}" outside ${b === c ? 'the card' : b.className}`);
        }
      }
    }
    const parts = cards.map((c) => ({
      id: c.getAttribute('data-card'),
      title: text(c.querySelector('.tile-head .name')),
      value: text(c.querySelector('.card-value .big')),
      nd: text(c.querySelector('.card-value .card-nd')),
      body: text(c.querySelector('.tile-body')),
      problem: Boolean(c.querySelector('.ref-problem')),
    }));
    const sizes = single.map((c) => {
      const r = c.getBoundingClientRect();
      return `${r.width.toFixed(1)} × ${r.height.toFixed(1)}`;
    });
    const one = single[0]?.getBoundingClientRect();
    const gap = Number.parseFloat(getComputedStyle(grid).rowGap);
    const pairs = [...grid.querySelectorAll(':scope > .card-pair')].map((p) => {
      const r = p.getBoundingClientRect();
      return Boolean(one) && Math.abs(r.width - one.width) < 1 && Math.abs(r.height - (2 * one.height + gap)) < 2;
    });
    return { cards: cards.length, sizes: [...new Set(sizes)], pairs, parts, unseen: [...new Set(unseen)], outside: [...new Set(outside)] };
  });

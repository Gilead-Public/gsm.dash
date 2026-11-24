// @ts-check
// How the study page's cards are laid out, read the way a user sees them (#32). Shares no code with src/.
/** @typedef {import('@playwright/test').Page} Page */

/**
 * Every card's size; each metric's title, value, n / N and body text (a combined card, the Admin's demo setting, holds
 * two); each piece of text a user can't see (hidden, transparent or without a box); and each piece that lies outside
 * its card, outside the part of the card it sits in (header, value, body, footer or one metric of a combined card), or
 * outside a box that would clip it. For each combined card: whether its halves are equal, and how far below the card's
 * top its second header starts.
 * @param {Page} page
 */
export const layout = (page) =>
  page.locator('.study-page .cards').evaluate((grid) => {
    const cards = [...grid.querySelectorAll(':scope > .card')];
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
      const id = c.getAttribute('data-card') ?? c.getAttribute('data-pair');
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
        for (let a = /** @type {Element | null} */ (parent); a && a !== c; a = a.parentElement) {
          const st = getComputedStyle(a);
          if (a.parentElement === c || a.matches('.card-part') || st.overflowX !== 'visible' || st.overflowY !== 'visible') boxes.push(a);
        }
        for (const r of rects) {
          for (const b of boxes) if (!inside(r, b.getBoundingClientRect())) outside.push(`${id}: "${content}" outside ${b === c ? 'the card' : b.className}`);
        }
      }
    }
    const metrics = [...grid.querySelectorAll(':scope > .card[data-card], :scope > .card .card-part[data-card]')];
    const parts = metrics.map((c) => ({
      id: c.getAttribute('data-card'),
      title: text(c.querySelector('.tile-head .name')),
      value: text(c.querySelector('.card-value .big')),
      nd: text(c.querySelector('.card-value .card-nd')),
      body: text(c.querySelector(':scope > .tile-body, :scope > .part-body')),
      problem: Boolean(c.querySelector('.ref-problem')),
    }));
    const sizes = cards.map((c) => {
      const r = c.getBoundingClientRect();
      return `${r.width.toFixed(1)} × ${r.height.toFixed(1)}`;
    });
    const combined = [...grid.querySelectorAll(':scope > .card.combined')].map((c) => {
      const halves = [...c.querySelectorAll('.card-part')].map((p) => p.getBoundingClientRect());
      return {
        equal: halves.length === 2 && Math.abs(halves[0].height - halves[1].height) < 1,
        second: Math.round(Number(c.querySelectorAll('.card-part .tile-head')[1]?.getBoundingClientRect().top) - c.getBoundingClientRect().top),
      };
    });
    return { cards: cards.length, sizes: [...new Set(sizes)], parts, combined, unseen: [...new Set(unseen)], outside: [...new Set(outside)] };
  });

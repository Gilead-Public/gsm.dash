// @ts-check
// Contrast as a reader meets it (#46): every colour composited, alpha and opacity included, over what lies beneath it,
// up to an opaque surface. Shares no code with src/.
/** @typedef {import('@playwright/test').Page} Page */

/**
 * Installs the measure in the page as `window.__contrast`. Computed colours come as `rgb()` / `rgba()` (channels
 * 0–255) or, from `color-mix()` and the like, as `color(srgb …)` (channels 0–1); any other form is an error, so a colour
 * the measure can't read fails the test rather than passing it.
 */
function install() {
  /** @param {string} css @returns {number[]} */
  const parse = (css) => {
    const value = css.trim();
    const alpha = (/** @type {string | undefined} */ a) => (a === undefined ? 1 : a.endsWith('%') ? Number(a.slice(0, -1)) / 100 : Number(a));
    let m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(value);
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), alpha(m[4])];
    m = /^color\(srgb\s+([-\d.e]+)\s+([-\d.e]+)\s+([-\d.e]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(value);
    if (m) return [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255, alpha(m[4])];
    throw new Error(`contrast: a colour the measure can't read: ${value}`);
  };
  /** @param {number[]} top @param {number[]} under */
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
  /** @param {Element} el */
  const opacity = (el) => {
    let o = 1;
    for (let a = /** @type {Element | null} */ (el); a; a = a.parentElement) o *= Number(getComputedStyle(a).opacity);
    return o;
  };
  /** The opaque colour behind an element: each ancestor's background laid over the one beneath it. @param {Element} el */
  const backdrop = (el) => {
    const layers = [];
    for (let a = /** @type {Element | null} */ (el); a; a = a.parentElement) layers.push(a);
    let colour = [255, 255, 255, 1];
    for (const a of layers.reverse()) {
      const bg = parse(getComputedStyle(a).backgroundColor);
      bg[3] *= Number(getComputedStyle(a).opacity);
      colour = over(bg, colour);
    }
    return colour;
  };
  /** @param {number[]} c */
  const luminance = (c) => {
    const [r, g, b] = c.slice(0, 3).map((v) => {
      const s = Math.min(1, Math.max(0, v / 255));
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  /** @param {number[]} a @param {number[]} b */
  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  /** @param {Element} el */
  const seen = (el) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && el.getBoundingClientRect().width > 0;
  /** @param {Element} el */
  const name = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${[...el.classList].map((c) => `.${c}`).join('')}`;

  /** @param {string} selector */
  const failures = (selector) => {
    const found = [];
    const page = parse(getComputedStyle(document.body).backgroundColor);
    for (const root of document.querySelectorAll(selector)) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || !n.textContent?.trim() || !seen(el) || el.closest('[aria-hidden="true"]')) continue;
        const under = backdrop(el);
        const ink = parse(getComputedStyle(el).color);
        ink[3] *= opacity(el);
        const r = ratio(over(ink, under), under);
        if (r < 4.5) found.push(`text "${n.textContent.trim().slice(0, 30)}" in ${name(el)}: ${r.toFixed(2)}`);
      }
      for (const el of root.querySelectorAll('.tile.card, .hpop:not([hidden]), .detail')) {
        if (!seen(el)) continue;
        const st = getComputedStyle(el);
        const line = over(parse(el.matches('.drawer') ? st.borderLeftColor : st.borderTopColor), page);
        for (const [what, against] of /** @type {Array<[string, number[]]>} */ ([['the page', page], ['its surface', backdrop(el)]])) {
          const r = ratio(line, against);
          if (r < 3) found.push(`border of ${name(el)} against ${what}: ${r.toFixed(2)}`);
        }
      }
      for (const bar of root.querySelectorAll('.dist-row .b')) {
        if (!seen(bar) || bar.getBoundingClientRect().width < 1) continue;
        const track = /** @type {Element} */ (bar.parentElement);
        const fill = parse(getComputedStyle(bar).backgroundColor);
        fill[3] *= Number(getComputedStyle(bar).opacity);
        const shown = over(fill, backdrop(track));
        const card = backdrop(/** @type {Element} */ (bar.closest('.tile-body')));
        for (const [what, against] of /** @type {Array<[string, number[]]>} */ ([['its card', card], ['its track', backdrop(track)]])) {
          const r = ratio(shown, against);
          if (r < 3) found.push(`bar in ${name(/** @type {Element} */ (bar.closest('.dist-row')))} against ${what}: ${r.toFixed(2)}`);
        }
      }
    }
    return [...new Set(found)];
  };

  /** Chart.js colours may be any CSS colour: a probe turns one into its computed form. @param {string} css */
  const computed = (css) => {
    const probe = document.createElement('i');
    probe.style.color = css;
    document.body.append(probe);
    const out = getComputedStyle(probe).color;
    probe.remove();
    return out;
  };

  const charts = () => {
    const found = [];
    let checked = 0;
    for (const canvas of document.querySelectorAll('.viz canvas')) {
      const chart = /** @type {any} */ (canvas).chart;
      if (!chart) continue;
      const surface = backdrop(canvas);
      const o = chart.options;
      /** @type {Array<[string, unknown]>} */
      const inks = [];
      for (const [id, scale] of Object.entries(o.scales ?? {})) {
        const s = /** @type {any} */ (scale);
        if (s.display === false) continue;
        if (s.ticks?.display !== false) inks.push([`${id} ticks`, s.ticks?.color]);
        if (s.title?.display) inks.push([`${id} title`, s.title?.color]);
      }
      if (o.plugins?.legend?.display !== false) inks.push(['legend', o.plugins?.legend?.labels?.color]);
      for (const [what, colour] of inks) {
        if (typeof colour !== 'string') continue;
        checked++;
        const r = ratio(over(parse(computed(colour)), surface), surface);
        if (r < 4.5) found.push(`${chart.config.type} ${what} ${colour}: ${r.toFixed(2)}`);
      }
    }
    return { checked, failures: found };
  };

  /** @type {any} */ (window).__contrast = { failures, charts };
}

/**
 * Text below 4.5:1, borders below 3:1 against the page and their own surface, and bars below 3:1 against their card
 * and track, inside `scope`, as "what: ratio" lines. Only what can be seen is measured.
 * @param {Page} page
 * @param {string} scope
 * @returns {Promise<string[]>}
 */
export async function contrastFailures(page, scope) {
  await page.evaluate(install);
  return page.evaluate((selector) => /** @type {any} */ (window).__contrast.failures(selector), scope);
}

/**
 * Each open gsm.viz chart's axis and legend text colours against the chart's own surface, as "what: ratio" lines below
 * 4.5:1. The chart is read from its canvas, as Chart.js resolves its options.
 * @param {Page} page
 * @returns {Promise<{ checked: number, failures: string[] }>}
 */
export async function chartTextFailures(page) {
  await page.evaluate(install);
  return page.evaluate(() => /** @type {any} */ (window).__contrast.charts());
}

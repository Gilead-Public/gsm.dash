// @ts-check
// Recorded-baseline comparisons: a state's text record is compared with a snapshot file recorded at a pinned commit.
// Re-recording means running Playwright with --update-snapshots at that commit; validation runs never record.
import { createHash } from 'node:crypto';
import { expect } from './app.js';
/** @typedef {import('@playwright/test').TestInfo} TestInfo */

/**
 * Runs of equal values as `value ×n`, so long uniform stretches stay readable.
 * @param {string[]} values
 */
export function runs(values) {
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < values.length; ) {
    let j = i;
    while (j < values.length && values[j] === values[i]) j++;
    out.push(j - i > 1 ? `${values[i]} ×${j - i}` : values[i]);
    i = j;
  }
  return out.join(' | ');
}

/** @param {string} dom */
export const domLine = (dom) => `dom: sha256 ${createHash('sha256').update(dom).digest('hex')} (${dom.length} characters)`;

/**
 * Compares one state's record with its baseline file, and keeps going so every changed state is reported. A mismatch
 * attaches the actual DOM, and the canonical DOM and computed styles when recorded, for comparison with the pinned
 * commit's.
 * @param {TestInfo} testInfo
 * @param {string} file
 * @param {{ text: string, dom: string, canonical?: string, styles?: string }} record
 */
export async function expectRecorded(testInfo, file, { text, dom, canonical, styles }) {
  const before = testInfo.errors.length;
  expect.soft(text, file).toMatchSnapshot(file);
  if (testInfo.errors.length === before) return;
  await testInfo.attach(`${file} DOM`, { body: dom, contentType: 'text/html' });
  if (canonical !== undefined) await testInfo.attach(`${file} canonical DOM`, { body: canonical, contentType: 'text/plain' });
  if (styles !== undefined) await testInfo.attach(`${file} computed styles`, { body: styles, contentType: 'text/plain' });
}

/** @param {string} styles */
export const stylesLine = (styles) => `computed styles: sha256 ${createHash('sha256').update(styles).digest('hex')} (${styles.split('\n').length} elements)`;

/**
 * Every element's computed style under `root`, in document order, with its ::before and ::after where they render.
 * Runs in the page. What is read can't depend on fonts, layout or platform:
 * - properties the stylesheet alone decides, as `getComputedStyle` resolves them;
 * - sizes, offsets, margins, grid and flex placement and transforms as computed values (CSS Typed OM), so `auto`,
 *   percentages and transform functions stay as written rather than becoming the pixels layout gave them;
 * - for a pseudo-element, which has no Typed OM: its content, the same stylesheet properties, its offsets, and the
 *   rotation and scale of its transform.
 * @param {Element} root
 * @returns {string}
 */
export function computedStyles(root) {
  const sides = ['top', 'right', 'bottom', 'left'];
  const PROPS = [
    'display', 'position', 'float', 'visibility', 'opacity', 'z-index', 'color', 'background-color', 'background-image',
    ...sides.flatMap((s) => [`border-${s}-width`, `border-${s}-style`, `border-${s}-color`, `padding-${s}`]),
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
    'box-shadow', 'outline-style', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'text-align',
    'text-transform', 'text-decoration-line', 'letter-spacing', 'white-space', 'cursor', 'row-gap', 'column-gap',
    'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'overflow-x', 'overflow-y', 'text-overflow',
    'vertical-align', 'pointer-events', 'user-select', 'font-variant-numeric',
  ];
  const GEOMETRY = [
    'width', 'height', 'min-width', 'max-width', 'min-height', 'max-height', ...sides, ...sides.map((s) => `margin-${s}`),
    'box-sizing', 'transform', 'translate', 'rotate', 'scale', 'grid-template-columns', 'grid-template-rows',
    'grid-column-start', 'grid-column-end', 'grid-row-start', 'grid-row-end', 'align-self', 'justify-self', 'flex-grow',
    'flex-shrink', 'flex-basis', 'order',
  ];
  /** The rotation, scale and skew of a resolved transform; its translation can depend on the element's size. */
  const linear = (/** @type {string} */ t) => {
    if (t === 'none') return t;
    const m = new DOMMatrix(t);
    return [m.a, m.b, m.c, m.d].map((v) => v.toFixed(4)).join(',');
  };
  /** @param {Element} el */
  const pseudo = (el, /** @type {string} */ which) => {
    const cs = getComputedStyle(el, which);
    const content = cs.getPropertyValue('content');
    if (content === 'none' || content === 'normal' || cs.display === 'none') return '';
    return ` ${which} ${[content, ...PROPS.map((p) => cs.getPropertyValue(p)), ...sides.map((s) => cs.getPropertyValue(s)), linear(cs.transform)].join(';')}`;
  };
  return [...root.querySelectorAll('*')]
    .map((el) => {
      const cs = getComputedStyle(el);
      const typed = el.computedStyleMap();
      return [...PROPS.map((p) => cs.getPropertyValue(p)), ...GEOMETRY.map((p) => String(typed.get(p)))].join(';') + pseudo(el, '::before') + pseudo(el, '::after');
    })
    .join('\n');
}

/**
 * The accessibility tree with each study link's URL written as `study:<StudyID>`, by the same rule as `canonicalDom`:
 * only either host's link to a study (`#/study/<id>`, or `./<id>.html` with or without a `#` view state) is rewritten.
 * @param {string} aria
 */
export const ariaStudyLinks = (aria) =>
  aria.replace(/^(\s*- \/url: )(?:"(#\/study\/[^/?#"]+)"|(\.\/[^/?#\s]+\.html)(?:#\S*)?|"(\.\/[^/?#"]+\.html)(?:#[^"]*)?")$/gm, (_, lead, route, file, quoted) => {
    const id = route ? route.slice('#/study/'.length) : (file ?? quoted).slice(2, -'.html'.length);
    return `${lead}study:${decodeURIComponent(id)}`;
  });

/** @param {string} canonical */
export const canonicalLine = (canonical) => `canonical dom: sha256 ${createHash('sha256').update(canonical).digest('hex')} (${canonical.length} characters)`;

/**
 * A subtree's markup in a form two hosts share when they render the same thing. Runs in the page. Only differences that
 * can't render are normalised:
 * - an element named in `hosts` is written as its counterpart, a tag carrying the element's name as a class;
 * - attributes and class tokens are sorted, `style` is read through the CSSOM, and an empty `class` or `style` is dropped;
 * - form controls carry their live state (`:checked`, `:value`, `:selected`) in place of the attributes that seed it;
 * - collapsible whitespace is kept as one space where CSS renders one, between inline content on the same line, and
 *   dropped elsewhere, with adjacent text nodes joined;
 * - comments are dropped;
 * - a study link's href is written as `study:<StudyID>` when it is either host's link to that same study: the old
 *   app's `#/study/<id>` route, or the reports' `./<id>.html`, with or without a `#` view state. Any other href stays.
 * Everything else, including every attribute value, text and element order, is kept exactly.
 * @param {Element} root
 * @param {Record<string, string>} hosts element name -> `tag.class` of its counterpart
 * @returns {string}
 */
export function canonicalDom(root, hosts) {
  const SPACE = /[ \t\n\r\f]/;
  const REPLACED = new Set(['img', 'svg', 'input', 'select', 'button', 'textarea', 'canvas', 'video', 'iframe', 'object']);
  /** @type {Map<Element, string>} */
  const kinds = new Map();
  /** How an element takes part in inline layout: skipped, looked into, one piece of content, or a line boundary. */
  const kind = (/** @type {Element} */ el) => {
    let k = kinds.get(el);
    if (k) return k;
    const d = getComputedStyle(el).display;
    if (d === 'none') k = 'skip';
    else if (el.localName === 'br') k = 'boundary';
    else if (d === 'inline' || d === 'contents') k = REPLACED.has(el.localName) ? 'content' : 'inline';
    else k = d.startsWith('inline') ? 'content' : 'boundary';
    kinds.set(el, k);
    return k;
  };
  /**
   * The nearest inline item next to `node` in direction `dir`: a character (space or not), atomic content, or the
   * edge of the line. Going forward, spaces are passed over, so the answer is whether content follows at all.
   * @param {Node} node
   * @param {-1 | 1} dir
   * @returns {'space' | 'content' | 'edge'}
   */
  const beside = (node, dir) => {
    /** @param {Node} n @returns {'space' | 'content' | 'edge' | null} */
    const look = (n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        const t = /** @type {Text} */ (n).data;
        if (!t) return null;
        if (dir > 0) return /[^ \t\n\r\f]/.test(t) ? 'content' : null;
        return SPACE.test(t[t.length - 1]) ? 'space' : 'content';
      }
      if (n.nodeType !== Node.ELEMENT_NODE) return null;
      const k = kind(/** @type {Element} */ (n));
      if (k === 'skip') return null;
      if (k === 'content') return 'content';
      if (k === 'boundary') return 'edge';
      const kids = [...n.childNodes];
      for (const c of dir < 0 ? kids.reverse() : kids) {
        const r = look(c);
        if (r) return r;
      }
      return null;
    };
    for (let cur = node; ; ) {
      for (let s = dir < 0 ? cur.previousSibling : cur.nextSibling; s; s = dir < 0 ? s.previousSibling : s.nextSibling) {
        const r = look(s);
        if (r) return r;
      }
      const parent = cur.parentElement;
      if (!parent || parent === root || kind(parent) !== 'inline') return 'edge';
      cur = parent;
    }
  };
  const preserved = (/** @type {Element} */ el) => {
    const s = getComputedStyle(el);
    return /^(preserve|break-spaces)/.test(s.whiteSpaceCollapse ?? '') || /^(pre|break-spaces)/.test(s.whiteSpace);
  };
  /** @param {Text} t */
  const text = (t) => {
    if (t.parentElement && preserved(t.parentElement)) return t.data;
    const [, lead, core, trail] = /** @type {RegExpMatchArray} */ (t.data.match(/^([ \t\n\r\f]*)([\s\S]*?)([ \t\n\r\f]*)$/));
    const inner = core.replace(/[ \t\n\r\f]+/g, ' ');
    if (!inner) return lead && beside(t, -1) === 'content' && beside(t, 1) === 'content' ? ' ' : '';
    return `${lead && beside(t, -1) === 'content' ? ' ' : ''}${inner}${trail && beside(t, 1) === 'content' ? ' ' : ''}`;
  };
  /** @param {Element} el */
  const studyHref = (el) => {
    const id = el.getAttribute('data-study');
    const href = el.getAttribute('href') ?? '';
    const m = /^#\/study\/([^/?#]+)$/.exec(href) ?? /^\.\/([^/?#]+)\.html(?:#.*)?$/.exec(href);
    return m && id !== null && decodeURIComponent(m[1]) === id ? `study:${id}` : href;
  };
  /** @param {Element} el */
  const open = (el) => {
    const [tag, hostClass] = (hosts[el.localName] ?? el.localName).split('.');
    const control = ['input', 'select', 'textarea', 'option'].includes(el.localName);
    const toggle = el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio');
    /** @type {Map<string, string>} */
    const attrs = new Map();
    for (const name of el.getAttributeNames()) {
      if (control && (name === 'checked' || name === 'selected' || (name === 'value' && !toggle && el.localName !== 'option'))) continue;
      let value = /** @type {string} */ (el.getAttribute(name));
      if (name === 'class') value = [...el.classList].sort().join(' ');
      if (name === 'style') value = /** @type {HTMLElement} */ (el).style.cssText;
      if (name === 'href' && el.localName === 'a' && el.hasAttribute('data-study')) value = studyHref(el);
      attrs.set(name, value);
    }
    if (hostClass) attrs.set('class', [...(attrs.get('class') ?? '').split(' ').filter(Boolean), hostClass].sort().join(' '));
    for (const name of ['class', 'style']) if (attrs.get(name) === '') attrs.delete(name);
    if (toggle) attrs.set(':checked', String(/** @type {HTMLInputElement} */ (el).checked));
    else if (control && el.localName !== 'option') attrs.set(':value', /** @type {HTMLInputElement} */ (el).value);
    if (el instanceof HTMLOptionElement) attrs.set(':selected', String(el.selected));
    const list = [...attrs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([n, v]) => ` ${n}=${JSON.stringify(v)}`);
    return { tag, start: `<${tag}${list.join('')}>` };
  };
  /** @type {string[]} */
  const lines = [];
  /** @param {Node} parent @param {string} indent */
  const walk = (parent, indent) => {
    let run = '';
    const flush = () => {
      if (run) lines.push(`${indent}${JSON.stringify(run)}`);
      run = '';
    };
    for (const n of parent.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) run += text(/** @type {Text} */ (n));
      else if (n.nodeType === Node.ELEMENT_NODE) {
        flush();
        const { tag, start } = open(/** @type {Element} */ (n));
        lines.push(`${indent}${start}`);
        walk(n, `${indent}  `);
        lines.push(`${indent}</${tag}>`);
      }
    }
    flush();
  };
  walk(root, '');
  return lines.join('\n');
}

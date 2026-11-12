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
 * attaches the actual DOM, and the canonical DOM when there is one, for comparison with the pinned commit's.
 * @param {TestInfo} testInfo
 * @param {string} file
 * @param {{ text: string, dom: string, canonical?: string }} record
 */
export async function expectRecorded(testInfo, file, { text, dom, canonical }) {
  const before = testInfo.errors.length;
  expect.soft(text, file).toMatchSnapshot(file);
  if (testInfo.errors.length === before) return;
  await testInfo.attach(`${file} DOM`, { body: dom, contentType: 'text/html' });
  if (canonical !== undefined) await testInfo.attach(`${file} canonical DOM`, { body: canonical, contentType: 'text/plain' });
}

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
 * - comments are dropped.
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

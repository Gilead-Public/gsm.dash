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
 * attaches the actual DOM for comparison with the pinned commit's.
 * @param {TestInfo} testInfo
 * @param {string} file
 * @param {{ text: string, dom: string }} record
 */
export async function expectRecorded(testInfo, file, { text, dom }) {
  const before = testInfo.errors.length;
  expect.soft(text, file).toMatchSnapshot(file);
  if (testInfo.errors.length > before) await testInfo.attach(`${file} DOM`, { body: dom, contentType: 'text/html' });
}

// @ts-check
// Puts one data document into a packaged report template. The JSON text is copied byte for byte except that `<`
// becomes < (the same character inside a JSON string, and it can't close the script tag), so any runtime that
// can replace a string writes the same file.
// Usage: node scripts/inject.mjs <template.html> <document.json> <out.html>
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLACEHOLDER = '__GSM_DATA__';

/**
 * @param {string} template
 * @param {string} text
 */
export function inject(template, text) {
  JSON.parse(text);
  const at = template.indexOf(PLACEHOLDER);
  if (at < 0) throw new Error(`the template has no ${PLACEHOLDER} placeholder`);
  if (template.includes(PLACEHOLDER, at + 1)) throw new Error(`the template has more than one ${PLACEHOLDER} placeholder`);
  return `${template.slice(0, at)}${text.replace(/</g, '\\u003c')}${template.slice(at + PLACEHOLDER.length)}`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [template, document, out] = process.argv.slice(2);
  if (!out) throw new Error('usage: node scripts/inject.mjs <template.html> <document.json> <out.html>');
  writeFileSync(out, inject(readFileSync(template, 'utf8'), readFileSync(document, 'utf8')));
  console.log(`Wrote ${out}`);
}

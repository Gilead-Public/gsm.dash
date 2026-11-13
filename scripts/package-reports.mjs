// @ts-check
// Packages each page Astro built into a single-file template (scripts and styles inline, the data placeholder left
// in place), then writes the reports by injecting their data documents: one per study, and the portfolio.
// Usage: node scripts/package-reports.mjs <out dir> [data dir]   (after `astro build`)
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { init, parse } from 'es-module-lexer';
import { buildStudyDocument } from './study-document.mjs';
import { buildPortfolioDocument } from './portfolio-document.mjs';
import { inject, PLACEHOLDER } from './inject.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ASTRO_DIST = join(ROOT, 'dist/astro');
export const TEMPLATES = join(ROOT, 'dist/templates');

/** "</script" inside inlined JS would end the tag early. @param {string} js */
const safeJs = (js) => js.replace(/<\/script/gi, '<\\/script');

/**
 * @param {string} js
 * @param {import('es-module-lexer').Import} imp
 */
const isSideEffectImport = (js, imp) => imp.type === 'static' && /^import\s*["']/.test(js.slice(imp.importStart, imp.importEnd));

/**
 * Astro emits the page script as a facade (`import"./app.js"`) over the chunk it was told to make; splices such
 * side-effect imports in, innermost first.
 * @param {string} js
 * @param {(rel: string) => string} readSibling
 * @param {Set<string>} [seen]
 * @returns {string}
 */
export function flatten(js, readSibling, seen = new Set()) {
  let out = js;
  for (const imp of [...parse(js)[0]].reverse()) {
    const specifier = imp.specifier;
    if (!isSideEffectImport(js, imp) || !specifier?.startsWith('./')) continue;
    const body = seen.has(specifier) ? '' : flatten(readSibling(specifier), readSibling, seen.add(specifier));
    out = `${out.slice(0, imp.importStart)}${body};${out.slice(imp.importEnd)}`;
  }
  return out;
}

/**
 * Anything still imported at runtime, statically or lazily, would be fetched from a URL that doesn't exist in a
 * single file. Exports are harmless inline.
 * @param {string} js
 * @param {string} label
 */
export function assertNoImports(js, label) {
  const left = parse(js)[0]
    .filter((imp) => imp.type !== 'import-meta')
    .map((imp) => (imp.type === 'dynamic' ? `dynamic import(${imp.specifier ?? 'non-literal specifier'})` : `import ${imp.specifier}`));
  if (left.length) {
    throw new Error(`${label} still imports at runtime, so it cannot run from file://:\n  ${left.join('\n  ')}\nFix the chunking in astro.config.mjs or remove the lazy import.`);
  }
}

/**
 * @param {string} dist Astro's output directory.
 * @param {string} page An HTML file in it.
 */
export async function packagePage(dist, page) {
  await init;
  /** @param {string} src */
  const asset = (src) => readFileSync(join(dist, src.replace(/^\.?\//, '')), 'utf8');
  /** @type {string[]} */
  const inlined = [];
  let html = readFileSync(join(dist, page), 'utf8');
  html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) => {
    const js = flatten(asset(src), (rel) => asset(join(dirname(src), rel)));
    assertNoImports(js, src);
    inlined.push(src);
    return `<script type="module">\n${safeJs(js)}\n</script>`;
  });
  html = html.replace(/<link rel="stylesheet"[^>]*href="((?!https?:|data:)[^"]+\.css)"[^>]*>/g, (_, href) => {
    inlined.push(href);
    return `<style>\n${asset(href)}\n</style>`;
  });
  const placeholders = html.split(PLACEHOLDER).length - 1;
  if (placeholders !== 1) throw new Error(`${page} has ${placeholders} ${PLACEHOLDER} placeholders; it needs exactly one`);
  const left = html.match(/<script\b[^>]*\ssrc=[^>]*>|<link\b[^>]*\brel="(?:stylesheet|modulepreload|preload|icon)"[^>]*>/g);
  if (left) throw new Error(`${page}: an asset reference survived inlining: ${left.join(' ')}`);
  return { html, inlined };
}

/**
 * Each template and the reports written from it, as file name and data document.
 * @type {Array<{ template: string, reports: (data: ReturnType<typeof readData>) => Array<[string, unknown]> }>}
 */
export const REPORTS = [
  { template: 'study.html', reports: (data) => data.manifest.studies.map((/** @type {any} */ { StudyID }) => [`${StudyID}.html`, buildStudyDocument(data, StudyID)]) },
  { template: 'portfolio.html', reports: (data) => [['portfolio.html', buildPortfolioDocument(data)]] },
];

/** @param {string} dir */
function readData(dir) {
  /** @param {string} path */
  const read = (path) => JSON.parse(readFileSync(join(dir, path), 'utf8'));
  return { manifest: read('portfolio.json'), summary: read('summary.json'), read };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [out, dataDir = join(ROOT, 'examples/data')] = process.argv.slice(2);
  if (!out) throw new Error('usage: node scripts/package-reports.mjs <out dir> [data dir]');
  rmSync(TEMPLATES, { recursive: true, force: true });
  mkdirSync(TEMPLATES, { recursive: true });
  for (const page of readdirSync(ASTRO_DIST).filter((f) => f.endsWith('.html'))) {
    const { html, inlined } = await packagePage(ASTRO_DIST, page);
    writeFileSync(join(TEMPLATES, page), html);
    console.log(`Packaged ${page} (${(html.length / 1e3).toFixed(0)} kB; inlined ${inlined.join(', ')})`);
  }
  const data = readData(dataDir);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  let written = 0;
  for (const { template, reports } of REPORTS) {
    const html = readFileSync(join(TEMPLATES, template), 'utf8');
    for (const [file, doc] of reports(data)) {
      writeFileSync(join(out, file), inject(html, JSON.stringify(doc)));
      written++;
    }
  }
  console.log(`Wrote ${written} reports to ${out}`);
}

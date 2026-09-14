// Produce a single self-contained HTML file: the Vite bundle inlined plus the
// example portfolio embedded as <script type="application/json" data-gsm="...">
// blocks — the contract's "embedded" load mode (design doc §4.4). Run after
// `vite build`. Also writes a body-only fragment for artifact hosting.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const DATA = join(ROOT, 'examples', 'data');

// JSON inside <script> must never contain "</script"; escaping "<" is sufficient.
const jsonBlock = (kind, obj) =>
  `<script type="application/json" data-gsm="${kind}">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

let html = readFileSync(join(DIST, 'index.html'), 'utf8');

// Inline the built assets in place of their references: the app module, the
// vendored gsm.viz classic script, and both stylesheets. A "</script" inside
// inlined JS would end the tag early, so escape it defensively.
const safeJs = (js) => js.replace(/<\/script/gi, '<\\/script');
html = html.replace(/<script type="module"[^>]*src="([^"]+)"><\/script>/g, (_, src) => {
  const js = readFileSync(join(DIST, src.replace(/^\//, '')), 'utf8');
  return `<script type="module">\n${safeJs(js)}\n</script>`;
});
html = html.replace(/<script src="(\/vendor\/[^"]+\.js)"><\/script>/g, (_, src) => {
  const js = readFileSync(join(DIST, src.replace(/^\//, '')), 'utf8');
  return `<script>\n${safeJs(js)}\n</script>`;
});
html = html.replace(/<link rel="stylesheet"[^>]*href="(\/(?:assets|vendor)\/[^"]+\.css)"[^>]*>/g, (_, href) => {
  const css = readFileSync(join(DIST, href.replace(/^\//, '')), 'utf8');
  return `<style>\n${css}\n</style>`;
});

// Embed the portfolio: manifest + every listed snapshot file.
const manifest = JSON.parse(readFileSync(join(DATA, 'portfolio.json'), 'utf8'));
const blocks = [jsonBlock('portfolio', manifest)];
for (const study of manifest.studies) {
  for (const rel of Object.values(study.files)) {
    blocks.push(jsonBlock('snapshot', JSON.parse(readFileSync(join(DATA, rel), 'utf8'))));
  }
}
// Data blocks go before the module script so they exist when it runs.
html = html.replace('<script type="module">', `${blocks.join('\n')}\n<script type="module">`);

const standalone = join(DIST, 'gsm-dash-standalone.html');
writeFileSync(standalone, html);

// Body-only fragment (title + styles + markup + scripts) for artifact hosting,
// which supplies its own document skeleton.
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta[^>]*>/g, '');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
writeFileSync(join(DIST, 'gsm-dash-artifact.html'), `${head.trim()}\n${body.trim()}\n`);

const mb = (readFileSync(standalone).length / 1e6).toFixed(2);
console.log(`Wrote ${standalone} (${mb} MB, ${blocks.length - 1} snapshots embedded)`);
console.log(`Files in dist: ${readdirSync(DIST).join(', ')}`);
